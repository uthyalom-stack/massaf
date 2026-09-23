import { CustomerTherapist } from '@/types/customer';
import { therapistCoversZipAsync } from '@/lib/db-therapists';
import { MatchCriteria } from '@/lib/validations/matching';
import { db } from '@/lib/db';
import { getZipInfo } from '@/lib/us-locations';
import {
  getScheduleWindowForDate,
  getAvailableTimeSlots,
  isAppointmentTimeAvailable,
  parseTimeStringToMinutes,
  formatMinutesToTimeString,
} from '@/lib/availability';
import { randomUUID } from 'crypto';

/**
 * Executes customer-specific rolling 5-therapist rotation:
 * 1. Validates requested customer ZIP against database.
 * 2. Fetches eligible therapist pool from TherapistZipEligibility / USZipCode coverage.
 * 3. Cross-references CustomerRotationHistory for customerId or visitorSessionId.
 * 4. Applies rolling least-recently-seen algorithm with dynamic replacement (1-5 therapists).
 * 5. Records search exposure in CustomerRotationHistory.
 */
export async function getRotatingTherapistsForZip(
  customerZip: string,
  allTherapists: CustomerTherapist[],
  identity?: { customerId?: string | null; visitorSessionId?: string | null }
): Promise<CustomerTherapist[]> {
  if (!customerZip || !customerZip.trim()) {
    return [];
  }

  const cleanZip = customerZip.trim().padStart(5, '0');
  const zipInfo = await getZipInfo(cleanZip);

  // 1. Single batched DB query to fetch all therapist IDs in the automatic distribution pool for this state
  let eligibleTherapistIdsFromPool = new Set<string>();
  if (zipInfo) {
    try {
      const eligibilityRecords = await db.therapistZipEligibility.findMany({
        where: { state: zipInfo.state },
        select: { therapistId: true, startZip: true, endZip: true },
      });

      for (const rec of eligibilityRecords) {
        const reqNum = parseInt(cleanZip, 10);
        const startNum = parseInt(rec.startZip, 10);
        const endNum = parseInt(rec.endZip, 10);
        if (!isNaN(reqNum) && !isNaN(startNum) && !isNaN(endNum)) {
          if (reqNum >= Math.min(startNum, endNum) && reqNum <= Math.max(startNum, endNum)) {
            eligibleTherapistIdsFromPool.add(rec.therapistId);
          }
        }
      }
    } catch (err) {
      console.error('[getRotatingTherapistsForZip] Error fetching eligibility pool:', err);
    }
  }

  // Filter active therapists that cover cleanZip strictly via TherapistZipEligibility pool
  const eligibleTherapists: CustomerTherapist[] = [];
  for (const t of allTherapists) {
    if (eligibleTherapistIdsFromPool.has(t.id)) {
      eligibleTherapists.push(t);
    }
  }

  // STRICT ZIP ELIGIBILITY: Never fall back to non-eligible therapists outside the ZIP pool
  const pool = eligibleTherapists;

  if (pool.length === 0) {
    return []; // Truthful empty eligibility state
  }

  if (pool.length <= 5) {
    return pool; // Return all available eligible therapists without injecting non-eligible ones
  }

  // 2. Retrieve rotation exposure history for customer or visitor session
  const customerId = identity?.customerId || null;
  const visitorSessionId = identity?.visitorSessionId || null;

  let historyRecords: Array<{ therapistId: string; seenAt: Date; searchId: string }> = [];

  try {
    if (customerId || visitorSessionId) {
      historyRecords = await db.customerRotationHistory.findMany({
        where: {
          zipCode: cleanZip,
          ...(customerId ? { customerId } : { visitorSessionId }),
        },
        select: {
          therapistId: true,
          seenAt: true,
          searchId: true,
        },
        orderBy: { seenAt: 'desc' },
        take: 50,
      });
    }
  } catch (err) {
    console.error('[getRotatingTherapistsForZip] Error querying rotation history:', err);
  }

  // Map last seen timestamp per therapist
  const lastSeenMap = new Map<string, number>();
  for (const h of historyRecords) {
    if (!lastSeenMap.has(h.therapistId)) {
      lastSeenMap.set(h.therapistId, h.seenAt.getTime());
    }
  }

  // Identify last search set to maintain continuity
  const lastSearchId = historyRecords.length > 0 ? historyRecords[0].searchId : null;
  const previousResultSetIds = new Set(
    historyRecords.filter((h) => h.searchId === lastSearchId).map((h) => h.therapistId)
  );

  // Unseen therapists in the pool
  const unseenTherapists = pool.filter((t) => !lastSeenMap.has(t.id));

  // Sort pool by least recently seen (unseen first, then oldest seenAt timestamp asc)
  const poolSortedByLeastSeen = [...pool].sort((a, b) => {
    const aTime = lastSeenMap.get(a.id);
    const bTime = lastSeenMap.get(b.id);

    if (aTime === undefined && bTime === undefined) return 0;
    if (aTime === undefined) return -1; // Unseen comes first
    if (bTime === undefined) return 1;

    return aTime - bTime; // Oldest timestamp (least recently seen) comes first
  });

  let selectedSet: CustomerTherapist[] = [];

  if (unseenTherapists.length >= 5) {
    // If at least 5 unseen therapists exist, expose top 5 unseen
    selectedSet = poolSortedByLeastSeen.slice(0, 5);
  } else if (previousResultSetIds.size > 0 && unseenTherapists.length > 0) {
    // Dynamic replacement without hardcoded cap (1, 2, 3, 4, or 5 therapists replaced based on unseen pool)
    const replaceCount = Math.min(unseenTherapists.length, 5);
    const retainedFromPrevious = pool.filter(
      (t) => previousResultSetIds.has(t.id) && !unseenTherapists.some((u) => u.id === t.id)
    ).slice(0, 5 - replaceCount);

    const freshCandidates = poolSortedByLeastSeen.filter(
      (t) => !retainedFromPrevious.some((r) => r.id === t.id)
    );

    selectedSet = [...retainedFromPrevious, ...freshCandidates.slice(0, replaceCount)];
  } else {
    // Recycled pool: select top 5 least recently seen therapists from the eligible pool
    selectedSet = poolSortedByLeastSeen.slice(0, 5);
  }

  // Ensure exactly 5 therapists returned
  if (selectedSet.length < 5) {
    const remaining = pool.filter((t) => !selectedSet.some((s) => s.id === t.id));
    selectedSet = [...selectedSet, ...remaining.slice(0, 5 - selectedSet.length)];
  }

  const finalSet = selectedSet.slice(0, 5);

  // 3. Record search exposure asynchronously in CustomerRotationHistory
  try {
    const searchId = randomUUID();

    // Verify which therapists exist in DB to prevent foreign key constraint violations
    const existingTherapists = await db.therapist.findMany({
      where: {
        id: { in: finalSet.map((t) => t.id) },
      },
      select: { id: true },
    });
    const validTherapistIds = new Set(existingTherapists.map((t) => t.id));

    const historyEntries = finalSet
      .filter((t) => validTherapistIds.has(t.id))
      .map((t) => ({
        customerId,
        visitorSessionId,
        zipCode: cleanZip,
        therapistId: t.id,
        searchId,
      }));

    if (historyEntries.length > 0) {
      await db.customerRotationHistory.createMany({
        data: historyEntries,
      });
    }
  } catch (err) {
    console.error('[getRotatingTherapistsForZip] Error persisting rotation history:', err);
  }

  return finalSet;
}

export interface MatchedTherapistResult {
  therapist: CustomerTherapist;
  matchScore: number; // 0 - 100
  matchedService: {
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  };
  reasons: string[];
}

/**
 * Checks if at least one 30-minute increment appointment slot within [rangeStartMin, rangeEndMin)
 * fits the therapist's working schedule on dateStr for durationMinutes.
 */
export function checkTimeRangeAvailability(
  therapist: CustomerTherapist,
  dateStr: string,
  rangeStartMin: number,
  rangeEndMin: number,
  durationMinutes: number
): boolean {
  const window = getScheduleWindowForDate(therapist.schedule, dateStr);
  if (!window) return false;

  const stepMinutes = 30;
  for (let current = rangeStartMin; current < rangeEndMin; current += stepMinutes) {
    if (
      current >= window.startMinutes &&
      current + durationMinutes <= window.endMinutes
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Deterministically ranks active therapists against customer questionnaire criteria
 * using actual database fields (services, service areas, location types, pricing, and availability schedules).
 */
export async function rankTherapistsForMatch(
  criteria: MatchCriteria,
  therapists: CustomerTherapist[]
): Promise<MatchedTherapistResult[]> {
  const results: MatchedTherapistResult[] = [];

  const locQueryClean = (criteria.locationQuery || '').trim().toLowerCase();
  const zipClean = (criteria.zipCode || '').trim().toLowerCase();

  for (const therapist of therapists) {
    if (!therapist) continue;

    // 1. Service Compatibility (Mandatory)
    const matchedService = therapist.services.find(
      (s) => s.id === criteria.serviceId
    );

    if (!matchedService) {
      // Disqualified: therapist does not offer this service
      continue;
    }

    let points = 0;
    const reasons: string[] = [];

    // Base score for providing the service (35 pts max)
    points += 35;
    reasons.push(`Offers your selected service: ${matchedService.name}`);

    // 2. Location Compatibility (Mandatory capability + area scoring, Max 30 pts)
    let locationCompatible = false;

    if (criteria.locationType === 'IN_HOME') {
      if (!therapist.offersInHome) {
        // Disqualified: therapist does not offer in-home visits
        continue;
      }

      locationCompatible = true;

      // Check if therapist covers specified city/ZIP
      const matchesCity =
        locQueryClean &&
        (therapist.location.toLowerCase().includes(locQueryClean) ||
          therapist.serviceAreas.some((sa) => sa.toLowerCase().includes(locQueryClean)));

      const matchesZip = zipClean ? await therapistCoversZipAsync(therapist, zipClean) : false;

      if (locQueryClean || zipClean) {
        if (matchesCity || matchesZip) {
          points += 30;
          const matchDetail = zipClean
            ? `ZIP ${zipClean}`
            : locQueryClean.toUpperCase();
          reasons.push(`Provides in-home service in ${matchDetail}`);
        } else {
          // Specified location outside therapist's service area
          locationCompatible = false;
        }
      } else {
        // No specific location specified by user, but offers in-home
        points += 20;
        reasons.push('Offers in-home appointments');
      }
    } else if (criteria.locationType === 'STUDIO') {
      if (!therapist.offersStudio) {
        // Disqualified: therapist does not offer studio visits
        continue;
      }

      locationCompatible = true;

      const matchesCity =
        locQueryClean &&
        (therapist.location.toLowerCase().includes(locQueryClean) ||
          therapist.serviceAreas.some((sa) => sa.toLowerCase().includes(locQueryClean)));

      const matchesZip =
        zipClean && therapist.zipCodes.some((z) => z.toLowerCase().includes(zipClean));

      if (locQueryClean || zipClean) {
        if (matchesCity || matchesZip) {
          points += 30;
          reasons.push(`Has local studio coverage near ${zipClean || locQueryClean.toUpperCase()}`);
        } else {
          // Specified location outside therapist studio coverage
          locationCompatible = false;
        }
      } else {
        points += 20;
        reasons.push('Offers local studio appointments');
      }
    }

    if (!locationCompatible) {
      continue;
    }

    // 3. Price / Budget Compatibility (Max 15 pts)
    if (criteria.maxBudget && criteria.maxBudget > 0) {
      if (matchedService.price <= criteria.maxBudget) {
        points += 15;
        reasons.push(`Fits your budget ($${matchedService.price} vs max $${criteria.maxBudget})`);
      } else if (matchedService.price <= criteria.maxBudget * 1.15) {
        points += 7;
        reasons.push(`Close to your budget ($${matchedService.price})`);
      }
    } else {
      // Budget not specified by customer: award baseline budget fit
      points += 10;
    }

    // 4. Availability Compatibility (Max 10 pts)
    if (criteria.preferredDate) {
      if (criteria.preferredTime && criteria.preferredTime.trim()) {
        const timeVal = criteria.preferredTime.trim().toLowerCase();

        if (timeVal === 'morning') {
          // Morning = 08:00 - 12:00 (480 - 720 min)
          if (
            checkTimeRangeAvailability(
              therapist,
              criteria.preferredDate,
              480,
              720,
              matchedService.durationMinutes
            )
          ) {
            points += 10;
            reasons.push('Available for your selected service during the morning (8am - 12pm)');
          }
        } else if (timeVal === 'afternoon') {
          // Afternoon = 12:00 - 17:00 (720 - 1020 min)
          if (
            checkTimeRangeAvailability(
              therapist,
              criteria.preferredDate,
              720,
              1020,
              matchedService.durationMinutes
            )
          ) {
            points += 10;
            reasons.push('Available for your selected service during the afternoon (12pm - 5pm)');
          }
        } else if (timeVal === 'evening') {
          // Evening = 17:00 - 21:00 (1020 - 1260 min)
          if (
            checkTimeRangeAvailability(
              therapist,
              criteria.preferredDate,
              1020,
              1260,
              matchedService.durationMinutes
            )
          ) {
            points += 10;
            reasons.push('Available for your selected service during the evening (5pm - 9pm)');
          }
        } else {
          // Exact time string e.g. "09:30" or "2:30 PM"
          try {
            const startMins = parseTimeStringToMinutes(criteria.preferredTime.trim());
            const formatted = formatMinutesToTimeString(startMins);
            const timeCheck = isAppointmentTimeAvailable(
              therapist,
              criteria.preferredDate,
              formatted.value,
              matchedService.durationMinutes
            );

            if (timeCheck.isValid) {
              points += 10;
              reasons.push(`Available at your requested time (${formatted.label})`);
            }
          } catch {
            // Malformed time string fails availability check safely
          }
        }
      } else {
        // Date supplied without time preference: check if therapist has at least 1 valid slot on date
        const slots = getAvailableTimeSlots(
          therapist,
          criteria.preferredDate,
          matchedService.durationMinutes
        );

        if (slots.length > 0) {
          points += 10;
          reasons.push('Available for your selected service on your requested date');
        }
      }
    } else {
      // Date not specified: award baseline schedule fit
      points += 5;
    }

    // 5. Reputation & Experience (Max 10 pts)
    const ratingBonus = Math.min(5, Math.max(0, (therapist.rating / 5.0) * 5));
    points += ratingBonus;

    if (therapist.rating >= 4.8) {
      reasons.push(
        `Highly rated therapist (${therapist.rating.toFixed(2)}★ from ${therapist.reviewCount} reviews)`
      );
    }

    if (therapist.isFeatured || therapist.bookingCount > 5) {
      points += 5;
    }

    const finalScore = Math.min(100, Math.round(points));

    results.push({
      therapist,
      matchScore: finalScore,
      matchedService: {
        id: matchedService.id,
        name: matchedService.name,
        durationMinutes: matchedService.durationMinutes,
        price: matchedService.price,
      },
      reasons,
    });
  }

  // Sort by match score (descending), then rating (descending), then booking count (descending)
  return results.sort((a, b) => {
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }
    if (b.therapist.rating !== a.therapist.rating) {
      return b.therapist.rating - a.therapist.rating;
    }
    return b.therapist.bookingCount - a.therapist.bookingCount;
  });
}
