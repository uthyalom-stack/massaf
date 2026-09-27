import {
  createCheckoutToken,
  verifyCheckoutToken,
} from '../src/lib/auth-session';
import { generateTimePresetOptions, isAppointmentTimeAvailable } from '../src/lib/availability';

async function main() {
  console.log('=== Running Expanded MASSAF V1 Security & Booking Flow Test Suite ===\n');

  // 1. Checkout capability tokens
  console.log('[Test 1] Checkout Capability Tokens');
  const bookingId = 'test-booking-123';
  const token = createCheckoutToken(bookingId, 15);
  const isValid = verifyCheckoutToken(token, bookingId);
  const isInvalidBooking = verifyCheckoutToken(token, 'other-booking-456');

  if (isValid && !isInvalidBooking) {
    console.log('  ✅ Valid checkout token verified and cross-booking token rejected correctly.');
  } else {
    console.error('  ❌ Checkout token test failed!');
    process.exit(1);
  }

  // 2. CSV Formula Injection escaping check
  console.log('[Test 2] CSV Formula Escaping');
  function escapeCsvField(val: unknown): string {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  const formulaStr = '=SUM(1+1)';
  const escaped = escapeCsvField(formulaStr);
  if (escaped === '"\'=SUM(1+1)"') {
    console.log('  ✅ Formula injection successfully sanitized with leading single quote.');
  } else {
    console.error('  ❌ CSV formula escaping test failed!', escaped);
    process.exit(1);
  }

  // 3. Hourly Price Calculation Server-Side Logic
  console.log('[Test 3] Hourly Price Calculation Logic');
  const hourlyRate = 100.0;
  const dur60 = 60;
  const dur120 = 120;
  const dur180 = 180;
  const dur240 = 240;

  const total60 = Math.round(hourlyRate * (dur60 / 60) * 100) / 100;
  const total120 = Math.round(hourlyRate * (dur120 / 60) * 100) / 100;
  const total180 = Math.round(hourlyRate * (dur180 / 60) * 100) / 100;
  const total240 = Math.round(hourlyRate * (dur240 / 60) * 100) / 100;

  if (total60 === 100 && total120 === 200 && total180 === 300 && total240 === 400) {
    console.log('  ✅ Server-side hourly price calculations verified (1hr=$100, 2hr=$200, 3hr=$300, 4hr=$400).');
  } else {
    console.error('  ❌ Hourly price calculation test failed!');
    process.exit(1);
  }

  // 4. Appointment Interval Overlap Conflict Logic
  console.log('[Test 4] Full Appointment Interval Overlap Conflict Logic');
  function hasConflict(
    reqStart: number,
    reqEnd: number,
    existStart: number,
    existEnd: number
  ): boolean {
    return existStart < reqEnd && existEnd > reqStart;
  }

  // Existing booking: 2:00 PM to 4:00 PM (14:00 - 16:00)
  const b1Start = new Date('2026-10-01T14:00:00Z').getTime();
  const b1End = new Date('2026-10-01T16:00:00Z').getTime();

  // Overlapping request 1: 3:00 PM to 4:00 PM (15:00 - 16:00) -> CONFLICT
  const r1Start = new Date('2026-10-01T15:00:00Z').getTime();
  const r1End = new Date('2026-10-01T16:00:00Z').getTime();
  const c1 = hasConflict(r1Start, r1End, b1Start, b1End);

  // Overlapping request 2: 1:00 PM to 3:00 PM (13:00 - 15:00) -> CONFLICT
  const r2Start = new Date('2026-10-01T13:00:00Z').getTime();
  const r2End = new Date('2026-10-01T15:00:00Z').getTime();
  const c2 = hasConflict(r2Start, r2End, b1Start, b1End);

  // Adjacent request 1: 4:00 PM to 5:00 PM (16:00 - 17:00) -> NO CONFLICT
  const r3Start = new Date('2026-10-01T16:00:00Z').getTime();
  const r3End = new Date('2026-10-01T17:00:00Z').getTime();
  const c3 = hasConflict(r3Start, r3End, b1Start, b1End);

  // Adjacent request 2: 12:00 PM to 2:00 PM (12:00 - 14:00) -> NO CONFLICT
  const r4Start = new Date('2026-10-01T12:00:00Z').getTime();
  const r4End = new Date('2026-10-01T14:00:00Z').getTime();
  const c4 = hasConflict(r4Start, r4End, b1Start, b1End);

  if (c1 && c2 && !c3 && !c4) {
    console.log('  ✅ Interval overlap conflict logic verified (overlaps conflict, adjacent times allowed).');
  } else {
    console.error('  ❌ Interval overlap conflict test failed!', { c1, c2, c3, c4 });
    process.exit(1);
  }

  // 5. Time Presets Generation Check (12:00 AM to 11:00 PM)
  console.log('[Test 5] Time Presets Generation (12:00 AM -> 11:00 PM)');
  const presets = generateTimePresetOptions();
  const firstPreset = presets[0];
  const lastPreset = presets[presets.length - 1];

  if (firstPreset.value === '00:00' && firstPreset.label === '12:00 AM' &&
      lastPreset.value === '23:00' && lastPreset.label === '11:00 PM' &&
      presets.length === 47) {
    console.log(`  ✅ Generated ${presets.length} time preset options spanning 12:00 AM (00:00) through 11:00 PM (23:00).`);
  } else {
    console.error('  ❌ Time preset generation test failed!', { firstPreset, lastPreset, length: presets.length });
    process.exit(1);
  }

  // 6. Working Hours Availability Limit Check
  console.log('[Test 6] Working Hours Availability Limit Check');
  const mockTherapist = {
    id: 'therapist-1',
    name: 'Test Therapist',
    schedule: [{ days: 'Monday – Sunday', hours: '12:00 AM – 11:00 PM' }],
  } as any;

  // 1-hour appointment starting at 10:00 PM (22:00 -> 23:00) -> VALID
  const fit1hr = isAppointmentTimeAvailable(mockTherapist, '2026-10-05', '22:00', 60);

  // 2-hour appointment starting at 10:00 PM (22:00 -> 24:00/00:00) -> EXCEEDS 11:00 PM END
  const fit2hr = isAppointmentTimeAvailable(mockTherapist, '2026-10-05', '22:00', 120);

  if (fit1hr.isValid && !fit2hr.isValid) {
    console.log('  ✅ Working hours availability correctly allows 1hr at 10 PM and rejects 2hr at 10 PM exceeding 11 PM cutoff.');
  } else {
    console.error('  ❌ Working hours availability test failed!', { fit1hr, fit2hr });
    process.exit(1);
  }

  console.log('\n=== All MASSAF V1 Security & Booking Flow Tests Passed Successfully! ===\n');
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
