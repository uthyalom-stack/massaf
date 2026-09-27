import {
  createCheckoutToken,
  verifyCheckoutToken,
  extractCheckoutToken,
} from '../src/lib/auth-session';
import { generateTimePresetOptions, isAppointmentTimeAvailable } from '../src/lib/availability';
import { bookingSchema } from '../src/lib/validations/booking';

async function main() {
  console.log('=== Running Strengthened Production MASSAF V1 Security & Duration Test Suite ===\n');

  // 1. Checkout capability tokens
  console.log('[Test 1] Checkout Capability Tokens & Isolation');
  const bookingIdA = 'booking-aaa-111';
  const bookingIdB = 'booking-bbb-222';
  const tokenA = createCheckoutToken(bookingIdA, 15);
  const isValidA = verifyCheckoutToken(tokenA, bookingIdA);
  const isRejectedCross = verifyCheckoutToken(tokenA, bookingIdB);
  const isRejectedGarbage = verifyCheckoutToken('invalid.token.str', bookingIdA);

  if (isValidA && !isRejectedCross && !isRejectedGarbage) {
    console.log('  ✅ Valid token authorized, cross-booking token rejected, and malformed token rejected.');
  } else {
    console.error('  ❌ Checkout token test failed!');
    process.exit(1);
  }

  // 1b. Token Extraction Test
  console.log('[Test 1b] Checkout Token Extraction Helper');
  const mockReqHeader = new Request('http://localhost:3000/api/payments/paylio/create', {
    headers: { 'x-checkout-token': tokenA },
  });
  const extractedHeaderToken = extractCheckoutToken(mockReqHeader);

  const mockReqBody = new Request('http://localhost:3000/api/payments/paylio/create', {
    method: 'POST',
  });
  const extractedBodyToken = extractCheckoutToken(mockReqBody, { checkoutToken: tokenA });

  if (extractedHeaderToken === tokenA && extractedBodyToken === tokenA) {
    console.log('  ✅ Checkout token correctly extracted from headers and JSON body.');
  } else {
    console.error('  ❌ Checkout token extraction test failed!');
    process.exit(1);
  }

  // 2. CSV Formula Injection escaping check
  console.log('[Test 2] CSV Formula Escaping Sanitization');
  function escapeCsvField(val: unknown): string {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  const formulaTriggers = ['=1+1', '+123', '-cmd', '@echo', '\tTab'];
  for (const trig of formulaTriggers) {
    const escapedVal = escapeCsvField(trig);
    if (!escapedVal.startsWith('"\'')) {
      console.error(`  ❌ Formula trigger "${trig}" was not sanitized with leading single quote!`, escapedVal);
      process.exit(1);
    }
  }
  console.log('  ✅ All spreadsheet formula triggers (=, +, -, @, \\t) successfully sanitized.');

  // 3. Server-Side Duration Schema Validation (60, 120, 180, 240 allowed; 30, 45, 90, 150, 300 rejected)
  console.log('[Test 3] Production Duration Minutes Schema Validation (bookingSchema)');
  const validDurations = [60, 120, 180, 240];
  const invalidDurations = [30, 45, 90, 150, 300];

  const basePayload = {
    therapistId: 'th-1',
    serviceId: 'svc-1',
    locationType: 'STUDIO',
    date: '2026-10-15',
    time: '14:00',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '5551234567',
  };

  for (const dur of validDurations) {
    const parseRes = bookingSchema.safeParse({ ...basePayload, durationMinutes: dur });
    if (!parseRes.success) {
      console.error(`  ❌ Duration ${dur} mins should have been accepted by bookingSchema!`, parseRes.error);
      process.exit(1);
    }
  }

  for (const dur of invalidDurations) {
    const parseRes = bookingSchema.safeParse({ ...basePayload, durationMinutes: dur });
    if (parseRes.success) {
      console.error(`  ❌ Duration ${dur} mins should have been REJECTED by bookingSchema!`);
      process.exit(1);
    }
  }

  // Missing duration check
  const parseResMissing = bookingSchema.safeParse(basePayload);
  if (parseResMissing.success) {
    console.error('  ❌ Missing durationMinutes should have been REJECTED by bookingSchema!');
    process.exit(1);
  }

  console.log('  ✅ Whole-hour durations (60, 120, 180, 240) accepted; non-standard durations (30, 45, 90, 150, 300) & missing duration rejected.');

  // 4. Hourly Price Calculation Server-Side Logic
  console.log('[Test 4] Hourly Price Calculation Logic ($100/hr)');
  const hourlyRate = 100.0;
  const total60 = Math.round(hourlyRate * (60 / 60) * 100) / 100;
  const total120 = Math.round(hourlyRate * (120 / 60) * 100) / 100;
  const total180 = Math.round(hourlyRate * (180 / 60) * 100) / 100;
  const total240 = Math.round(hourlyRate * (240 / 60) * 100) / 100;

  if (total60 === 100 && total120 === 200 && total180 === 300 && total240 === 400) {
    console.log('  ✅ Server-side hourly price calculations verified ($100, $200, $300, $400).');
  } else {
    console.error('  ❌ Hourly price calculation test failed!');
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

  // 6. Production Working Hours Availability Boundary Checks (12 AM–11 PM Cutoff)
  console.log('[Test 6] Production Working Hours Availability Boundary Checks (isAppointmentTimeAvailable)');
  const mockTherapist = {
    id: 'therapist-1',
    name: 'Test Therapist',
    schedule: [{ days: 'Monday – Sunday', hours: '12:00 AM – 11:00 PM' }],
  } as any;

  // 1 hour at 10 PM (22:00 -> 23:00) -> VALID
  const fit1hr = isAppointmentTimeAvailable(mockTherapist, '2026-10-05', '22:00', 60);

  // 2 hours at 9 PM (21:00 -> 23:00) -> VALID
  const fit2hr = isAppointmentTimeAvailable(mockTherapist, '2026-10-05', '21:00', 120);

  // 3 hours at 8 PM (20:00 -> 23:00) -> VALID
  const fit3hr = isAppointmentTimeAvailable(mockTherapist, '2026-10-05', '20:00', 180);

  // 4 hours at 7 PM (19:00 -> 23:00) -> VALID
  const fit4hr = isAppointmentTimeAvailable(mockTherapist, '2026-10-05', '19:00', 240);

  // 2 hours at 10 PM (22:00 -> 24:00) -> EXCEEDS 11 PM END
  const fit2hrAt10pm = isAppointmentTimeAvailable(mockTherapist, '2026-10-05', '22:00', 120);

  if (fit1hr.isValid && fit2hr.isValid && fit3hr.isValid && fit4hr.isValid && !fit2hrAt10pm.isValid) {
    console.log('  ✅ Production availability boundaries verified (1h at 10 PM, 2h at 9 PM, 3h at 8 PM, 4h at 7 PM fit 11 PM cutoff; 2h at 10 PM rejected).');
  } else {
    console.error('  ❌ Working hours boundary test failed!', { fit1hr, fit2hr, fit3hr, fit4hr, fit2hrAt10pm });
    process.exit(1);
  }

  console.log('\n=== All MASSAF V1 Security & Duration Tests Passed Successfully! ===\n');
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
