import { CustomerTherapist, MockTherapist, TherapistScheduleWindow } from '@/types/customer';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDayIdx(name: string): number {
  const clean = name.trim().toLowerCase();
  const fullIdx = DAY_NAMES.findIndex((d) => d.toLowerCase() === clean);
  if (fullIdx !== -1) return fullIdx;
  return DAY_SHORT_NAMES.findIndex((d) => d.toLowerCase() === clean);
}

/**
 * Interface representing raw TherapistAvailability records from Prisma DB
 */
export interface DbAvailabilityRecord {
  id: string;
  dayOfWeek: number | null;
  specificDate: Date | null;
  startTime: string; // e.g., "09:00" or "9:00 AM"
  endTime: string;   // e.g., "17:00" or "5:00 PM"
  isUnavailable: boolean;
}

/**
 * Parses a time string like "8:00 AM", "7:30 AM", "12:00 PM", "7:00 PM", or "09:00", "17:30"
 * into minutes from midnight (0..1439).
 */
export function parseTimeStringToMinutes(timeStr: string): number {
  const cleanStr = timeStr.trim();

  // Try 12-hour format first (e.g. 8:00 AM)
  const match12 = cleanStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const meridian = match12[3].toUpperCase();

    if (meridian === 'PM' && hours < 12) {
      hours += 12;
    } else if (meridian === 'AM' && hours === 12) {
      hours = 0;
    }

    return hours * 60 + minutes;
  }

  // Try 24-hour format (e.g. 09:00, 17:30)
  const match24 = cleanStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }

  throw new Error(`Invalid time format: ${timeStr}`);
}

/**
 * Formats minutes from midnight (e.g. 600) into HH:mm (e.g. "10:00") and 12-hour display string ("10:00 AM").
 */
/**
 * Generates 30-minute interval preset time options (from 6:00 AM to 10:00 PM by default)
 */
export function generateTimePresetOptions(
  startHour = 6,
  endHour = 22,
  stepMinutes = 30
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let min = startHour * 60; min <= endHour * 60; min += stepMinutes) {
    options.push(formatMinutesToTimeString(min));
  }
  return options;
}

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
  if (!daysStr) return [];
  const normalized = daysStr.replace(/–|—/g, '-').trim();

  if (normalized.includes('-')) {
    const parts = normalized.split('-').map((s) => s.trim());
    const startIdx = getDayIdx(parts[0]);
    const endIdx = getDayIdx(parts[1]);

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

  if (normalized.includes('&') || normalized.includes(',')) {
    const tokens = normalized.split(/[&,]/).map((s) => s.trim()).filter(Boolean);
    const result: number[] = [];
    for (const token of tokens) {
      const idx = getDayIdx(token);
      if (idx !== -1 && !result.includes(idx)) {
        result.push(idx);
      }
    }
    return result;
  }

  const singleIdx = getDayIdx(normalized);
  return singleIdx !== -1 ? [singleIdx] : [];
}

/**
 * Parses schedule hours like "8:00 AM – 7:00 PM" or "08:00 - 19:00" into start and end minutes from midnight.
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
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;

  const dateObj = new Date(Date.UTC(year, month - 1, day));
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
 * Checks availability against DB records directly (handling specific date exceptions and recurring day of week).
 */
export function getDbScheduleWindowForDate(
  availabilities: DbAvailabilityRecord[],
  dateStr: string
): { daysStr: string; hoursStr: string; startMinutes: number; endMinutes: number } | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(dateObj.getTime())) return null;

  const targetYmd = dateObj.toISOString().split('T')[0];
  const dayOfWeek = dateObj.getUTCDay();

  // 1. Check specific date match
  const specificMatch = availabilities.find((a) => {
    if (!a.specificDate) return false;
    const specYmd = new Date(a.specificDate).toISOString().split('T')[0];
    return specYmd === targetYmd;
  });

  if (specificMatch) {
    if (specificMatch.isUnavailable) return null;
    const startMinutes = parseTimeStringToMinutes(specificMatch.startTime);
    const endMinutes = parseTimeStringToMinutes(specificMatch.endTime);
    return {
      daysStr: DAY_NAMES[dayOfWeek],
      hoursStr: `${specificMatch.startTime} – ${specificMatch.endTime}`,
      startMinutes,
      endMinutes,
    };
  }

  // 2. Check recurring day of week match
  const recurringMatch = availabilities.find(
    (a) => a.dayOfWeek === dayOfWeek && !a.isUnavailable
  );

  if (recurringMatch) {
    const startMinutes = parseTimeStringToMinutes(recurringMatch.startTime);
    const endMinutes = parseTimeStringToMinutes(recurringMatch.endTime);
    return {
      daysStr: DAY_NAMES[dayOfWeek],
      hoursStr: `${recurringMatch.startTime} – ${recurringMatch.endTime}`,
      startMinutes,
      endMinutes,
    };
  }

  return null;
}

/**
 * Returns a list of available time slot options for a therapist on a given date for a specific service duration.
 * Time slots are generated in 30-minute increments.
 */
export function getAvailableTimeSlots(
  therapist: CustomerTherapist | MockTherapist,
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
  therapist: CustomerTherapist | MockTherapist,
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
