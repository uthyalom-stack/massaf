import { MockTherapist, TherapistScheduleWindow } from '@/types/customer';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Parses a time string like "8:00 AM", "7:30 AM", "12:00 PM", "7:00 PM" into minutes from midnight (0..1439).
 */
export function parseTimeStringToMinutes(timeStr: string): number {
  const cleanStr = timeStr.trim();
  const match = cleanStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridian = match[3].toUpperCase();

  if (meridian === 'PM' && hours < 12) {
    hours += 12;
  } else if (meridian === 'AM' && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
}

/**
 * Formats minutes from midnight (e.g. 600) into HH:mm (e.g. "10:00") and 12-hour display string ("10:00 AM").
 */
export function formatMinutesToTimeString(totalMinutes: number): { value: string; label: string } {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const hh = hours24.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const value = `${hh}:${mm}`;

  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const meridian = hours24 >= 12 ? 'PM' : 'AM';
  const label = `${hours12}:${mm.padStart(2, '0')} ${meridian}`;

  return { value, label };
}

/**
 * Converts a days description string like "Monday – Thursday" or "Sunday" into array of day-of-week indices (0=Sun..6=Sat).
 */
export function parseScheduleDays(daysStr: string): number[] {
  const normalized = daysStr.replace(/–|—/g, '-').trim();

  if (normalized.includes('-')) {
    const parts = normalized.split('-').map((s) => s.trim());
    const startIdx = DAY_NAMES.findIndex((d) => d.toLowerCase() === parts[0].toLowerCase());
    const endIdx = DAY_NAMES.findIndex((d) => d.toLowerCase() === parts[1].toLowerCase());

    if (startIdx === -1 || endIdx === -1) {
      return [];
    }

    const days: number[] = [];
    let current = startIdx;
    while (true) {
      days.push(current);
      if (current === endIdx) break;
      current = (current + 1) % 7;
    }
    return days;
  }

  const singleIdx = DAY_NAMES.findIndex((d) => d.toLowerCase() === normalized.toLowerCase());
  return singleIdx !== -1 ? [singleIdx] : [];
}

/**
 * Parses schedule hours like "8:00 AM – 7:00 PM" into start and end minutes from midnight.
 */
export function parseScheduleHours(hoursStr: string): { startMinutes: number; endMinutes: number } | null {
  const normalized = hoursStr.replace(/–|—/g, '-').trim();
  const parts = normalized.split('-').map((s) => s.trim());
  if (parts.length !== 2) return null;

  try {
    const startMinutes = parseTimeStringToMinutes(parts[0]);
    const endMinutes = parseTimeStringToMinutes(parts[1]);
    return { startMinutes, endMinutes };
  } catch {
    return null;
  }
}

/**
 * Finds the therapist's working schedule window for a specific date (YYYY-MM-DD).
 */
export function getScheduleWindowForDate(
  schedule: TherapistScheduleWindow[],
  dateStr: string
): { daysStr: string; hoursStr: string; startMinutes: number; endMinutes: number } | null {
  // Use UTC date to avoid local timezone offset shifting the day
  const dateObj = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(dateObj.getTime())) return null;

  const dayOfWeek = dateObj.getUTCDay();

  for (const window of schedule) {
    const workingDays = parseScheduleDays(window.days);
    if (workingDays.includes(dayOfWeek)) {
      const hours = parseScheduleHours(window.hours);
      if (hours) {
        return {
          daysStr: window.days,
          hoursStr: window.hours,
          startMinutes: hours.startMinutes,
          endMinutes: hours.endMinutes,
        };
      }
    }
  }

  return null;
}

/**
 * Returns a list of available time slot options for a therapist on a given date for a specific service duration.
 * Time slots are generated in 30-minute increments.
 */
export function getAvailableTimeSlots(
  therapist: MockTherapist,
  dateStr: string,
  durationMinutes: number
): { value: string; label: string }[] {
  const window = getScheduleWindowForDate(therapist.schedule, dateStr);
  if (!window) {
    return [];
  }

  const slots: { value: string; label: string }[] = [];
  const stepMinutes = 30;

  for (let current = window.startMinutes; current + durationMinutes <= window.endMinutes; current += stepMinutes) {
    slots.push(formatMinutesToTimeString(current));
  }

  return slots;
}

/**
 * Validates whether a specific appointment date, start time ("HH:mm"), and duration fits within the therapist's schedule.
 */
export function isAppointmentTimeAvailable(
  therapist: MockTherapist,
  dateStr: string,
  timeStr: string,
  durationMinutes: number
): { isValid: boolean; reason?: string } {
  const window = getScheduleWindowForDate(therapist.schedule, dateStr);
  if (!window) {
    return {
      isValid: false,
      reason: `${therapist.name} is not available on this day of the week.`,
    };
  }

  const [hh, mm] = timeStr.split(':').map((s) => parseInt(s, 10));
  if (isNaN(hh) || isNaN(mm)) {
    return { isValid: false, reason: 'Invalid start time format.' };
  }

  const appointmentStartMinutes = hh * 60 + mm;
  const appointmentEndMinutes = appointmentStartMinutes + durationMinutes;

  if (appointmentStartMinutes < window.startMinutes) {
    return {
      isValid: false,
      reason: `Selected start time is before ${therapist.name}'s working hours (${window.hoursStr}).`,
    };
  }

  if (appointmentEndMinutes > window.endMinutes) {
    return {
      isValid: false,
      reason: `Selected appointment duration (${durationMinutes} mins) extends past ${therapist.name}'s working hours (${window.hoursStr}).`,
    };
  }

  return { isValid: true };
}
