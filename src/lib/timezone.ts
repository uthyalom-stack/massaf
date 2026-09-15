/**
 * PHASE 5 TIMEZONE STRATEGY:
 * To avoid server-environment timezone drift (e.g. UTC vs PST vs EST) when parsing local appointment dates
 * and start times submitted by customers (e.g. date: "2026-09-15", time: "10:00"), MASSAF adopts a
 * deterministic UTC ISO appointment timestamp strategy.
 *
 * An appointment on 2026-09-15 at 10:00 is represented as "2026-09-15T10:00:00.000Z".
 * This guarantees that:
 * 1. Server validation evaluates availability on the exact selected calendar date and time.
 * 2. Prisma persists the exact intended timestamp into the database.
 * 3. The API and confirmation UI render identical appointment dates and times across all client/server timezones.
 */

/**
 * Parses date string (YYYY-MM-DD) and time string (HH:mm) into a deterministic Date object stored at UTC.
 */
export function parseAppointmentDateTime(dateStr: string, timeStr: string): Date {
  const isoString = `${dateStr}T${timeStr}:00.000Z`;
  const dateObj = new Date(isoString);
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date/time parameters: ${dateStr} ${timeStr}`);
  }
  return dateObj;
}

/**
 * Formats a Date or ISO string into a clean date label (e.g. "Tuesday, September 15, 2026")
 * using UTC components to preserve identical rendering.
 */
export function formatUtcDateString(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';

  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats a Date or ISO string into a clean time label (e.g. "10:00 AM")
 * using UTC components to preserve identical rendering.
 */
export function formatUtcTimeString(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';

  return d.toLocaleTimeString('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
  });
}
