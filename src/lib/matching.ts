import { CustomerTherapist } from '@/types/customer';
import { MatchCriteria } from '@/lib/validations/matching';
import {
  getScheduleWindowForDate,
  isAppointmentTimeAvailable,
  parseTimeStringToMinutes,
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

      const matchesZip =
        zipClean && therapist.zipCodes.some((z) => z.toLowerCase().includes(zipClean));

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
      const scheduleWindow = getScheduleWindowForDate(
        therapist.schedule,
        criteria.preferredDate
      );

      if (scheduleWindow) {
        if (criteria.preferredTime && criteria.preferredTime.trim()) {
          const timeVal = criteria.preferredTime.trim().toLowerCase();
          let targetTimeStr = '';

          if (timeVal === 'morning') {
            targetTimeStr = '09:00';
          } else if (timeVal === 'afternoon') {
            targetTimeStr = '13:00';
          } else if (timeVal === 'evening') {
            targetTimeStr = '17:00';
          } else {
            try {
              const mins = parseTimeStringToMinutes(criteria.preferredTime.trim());
              const hh = Math.floor(mins / 60).toString().padStart(2, '0');
              const mm = (mins % 60).toString().padStart(2, '0');
              targetTimeStr = `${hh}:${mm}`;
            } catch {
              targetTimeStr = criteria.preferredTime.trim();
            }
          }

          const timeCheck = isAppointmentTimeAvailable(
            therapist,
            criteria.preferredDate,
            targetTimeStr,
            matchedService.durationMinutes
          );

          if (timeCheck.isValid) {
            points += 10;
            const timeLabel = ['morning', 'afternoon', 'evening'].includes(timeVal)
              ? `${timeVal} session`
              : targetTimeStr;
            reasons.push(`Available at your requested time (${timeLabel})`);
          }
        } else {
          // Date supplied without specific time: therapist working on date
          points += 10;
          reasons.push(`Available on your requested date (${criteria.preferredDate})`);
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
