import { CustomerTherapist } from '@/types/customer';
import { therapistCoversZip } from '@/lib/db-therapists';
import { MatchCriteria } from '@/lib/validations/matching';
import {
  getScheduleWindowForDate,
  getAvailableTimeSlots,
  isAppointmentTimeAvailable,
  parseTimeStringToMinutes,
  formatMinutesToTimeString,
} from '@/lib/availability';

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
export function rankTherapistsForMatch(
  criteria: MatchCriteria,
  therapists: CustomerTherapist[]
): MatchedTherapistResult[] {
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

      const matchesZip = zipClean ? therapistCoversZip(therapist, zipClean) : false;

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
