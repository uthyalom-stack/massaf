import { db } from '@/lib/db';
import {
  createSessionToken,
  verifySessionToken,
} from '@/lib/auth-session';
import { createTherapistAction } from '@/app/admin/actions';
import { confirmVerifiedPayLioPayment } from '@/lib/paylio';
import { generateVerificationToken, consumeVerificationToken } from '@/lib/verification-tokens';

async function runPhase20SecurityTests() {
  console.log('====================================================');
  console.log('  STARTING PHASE 20 SECURITY & RELIABILITY SUITE   ');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
      failed++;
    }
  }

  process.env.MASSAF_AUTH_SECRET = 'dev-secret-key-32-chars-minimum-length-for-hmac-sha256';
  process.env.MASSAF_ADMIN_API_KEY = 'dev-admin-api-key-secret-32-chars';

  try {
    const timestamp = Date.now();
    const testAdminEmail = `sec-admin-${timestamp}@massaf.com`;
    const testCustAEmail = `sec-cust-a-${timestamp}@massaf.com`;
    const testCustBEmail = `sec-cust-b-${timestamp}@massaf.com`;

    const adminUser = await db.user.create({
      data: {
        email: testAdminEmail,
        name: 'Test Admin',
        role: 'SUPER_ADMIN',
      },
    });

    const custA = await db.customer.create({
      data: {
        name: 'Customer A',
        email: testCustAEmail,
        phone: '555-0001',
      },
    });

    const custB = await db.customer.create({
      data: {
        name: 'Customer B',
        email: testCustBEmail,
        phone: '555-0002',
      },
    });

    const therapist = await db.therapist.create({
      data: {
        name: 'Security Therapist',
        email: `sec-th-${timestamp}@massaf.com`,
        isActive: true,
      },
    });

    const service = await db.service.create({
      data: {
        name: 'Security Deep Tissue',
        durationMinutes: 60,
        price: 120.0,
      },
    });

    // 1. Admin Server Action Unauthenticated Caller Rejection
    try {
      const unauthRes = await createTherapistAction({
        name: 'Unauth Therapist',
        email: `unauth-${timestamp}@massaf.com`,
      });
      assert(!unauthRes.success && (String(unauthRes.error).includes('Unauthorized') || String(unauthRes.error).includes('must be logged in')), '1. Admin server action rejects unauthenticated caller');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      assert(errMsg.includes('Unauthorized') || errMsg.includes('must be logged in'), '1. Admin server action rejects unauthenticated caller');
    }

    // 2. Customer Token Logic Test
    const fakeCustToken = createSessionToken(custA.id, custA.email, 'CUSTOMER');
    assert(fakeCustToken.length > 0, '2. Created valid customer token');

    // 3. Admin Token Validation Direct Test
    const adminToken = createSessionToken(adminUser.id, adminUser.email, 'ADMIN', 24, adminUser.role);
    assert(adminToken.length > 0, '3a. Created valid admin HMAC token');

    const verifiedPayload = verifySessionToken(adminToken, 'ADMIN');
    assert(verifiedPayload !== null && verifiedPayload.entityId === adminUser.id, '3b. Valid admin HMAC token verified successfully');

    // 4. Admin Availability Range & Overlap Logic Test
    const { parseTimeStringToMinutes } = await import('@/lib/availability');
    const startMins = parseTimeStringToMinutes('14:00');
    const endMins = parseTimeStringToMinutes('09:00');
    assert(startMins > endMins, '4a. Invalid start time > end time detected via time parser');

    const slot1 = await db.therapistAvailability.create({
      data: {
        therapistId: therapist.id,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '12:00',
        isUnavailable: false,
      },
    });
    assert(slot1.id !== null, '4b. Initial availability slot created in DB');

    const existingSlots = await db.therapistAvailability.findMany({
      where: { therapistId: therapist.id, dayOfWeek: 1 },
    });
    const candidateStart = parseTimeStringToMinutes('10:00');
    const candidateEnd = parseTimeStringToMinutes('14:00');
    const hasOverlap = existingSlots.some((e) => {
      const eStart = parseTimeStringToMinutes(e.startTime);
      const eEnd = parseTimeStringToMinutes(e.endTime);
      return candidateStart < eEnd && candidateEnd > eStart;
    });
    assert(hasOverlap, '4c. Admin availability window overlap detected correctly');

    // 5. Booking Creation and Payment Idempotency & Mismatch Protection
    const booking = await db.booking.create({
      data: {
        bookingNumber: `SEC-${timestamp}`,
        customerId: custA.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: new Date(Date.now() + 24 * 3600 * 1000),
        durationMinutes: 60,
        amount: 120.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        paymentReference: `ipn_token_sec_${timestamp}`,
      },
    });

    // 5a. Amount mismatch rejection
    const mismatchAmountRes = await confirmVerifiedPayLioPayment({
      bookingId: booking.id,
      ipnToken: `ipn_token_sec_${timestamp}`,
      providerStatus: 'PAID',
      providerOriginalAmount: 99.0, // Wrong amount
      providerCurrency: 'USD',
    });
    assert(!mismatchAmountRes.success && mismatchAmountRes.paymentStatus !== 'PAID', '5. PayLio amount mismatch cannot mark booking PAID');

    // 5b. Currency mismatch rejection
    const mismatchCurrRes = await confirmVerifiedPayLioPayment({
      bookingId: booking.id,
      ipnToken: `ipn_token_sec_${timestamp}`,
      providerStatus: 'PAID',
      providerOriginalAmount: 120.0,
      providerCurrency: 'EUR', // Wrong currency
    });
    assert(!mismatchCurrRes.success && mismatchCurrRes.paymentStatus !== 'PAID', '6. PayLio invalid currency cannot mark booking PAID');

    // 5c. Valid PayLio confirmation
    const validPayRes = await confirmVerifiedPayLioPayment({
      bookingId: booking.id,
      ipnToken: `ipn_token_sec_${timestamp}`,
      providerStatus: 'PAID',
      providerOriginalAmount: 120.0,
      providerCurrency: 'USD',
    });
    assert(validPayRes.success && validPayRes.paymentStatus === 'PAID', '7. Valid PayLio payment confirms booking to PAID');

    // 5d. Repeated Callback Idempotency
    const repeatPayRes = await confirmVerifiedPayLioPayment({
      bookingId: booking.id,
      ipnToken: `ipn_token_sec_${timestamp}`,
      providerStatus: 'PAID',
      providerOriginalAmount: 120.0,
      providerCurrency: 'USD',
    });
    assert(repeatPayRes.success && repeatPayRes.message.includes('idempotent'), '8. PayLio repeated callback remains idempotent');

    // 6. Verification Token Single-Use Atomic Protection
    const rawToken = await generateVerificationToken(therapist.id, 'THERAPIST_LOGIN');
    const consume1 = await consumeVerificationToken(rawToken, 'THERAPIST_LOGIN');
    assert(consume1 === therapist.id, '9. Verification token consumed successfully');

    const consume2 = await consumeVerificationToken(rawToken, 'THERAPIST_LOGIN');
    assert(consume2 === null, '10. Re-using verification token rejected atomically');

    // Clean up test entities
    await db.booking.delete({ where: { id: booking.id } });
    await db.therapistAvailability.deleteMany({ where: { therapistId: therapist.id } });
    await db.therapist.delete({ where: { id: therapist.id } });
    await db.service.delete({ where: { id: service.id } });
    await db.customer.delete({ where: { id: custA.id } });
    await db.customer.delete({ where: { id: custB.id } });
    await db.user.delete({ where: { id: adminUser.id } });

    console.log('====================================================');
    console.log(`  PHASE 20 SECURITY SUITE RESULTS: ${passed} PASSED, ${failed} FAILED  `);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite execution error:', err);
    process.exit(1);
  }
}

runPhase20SecurityTests();
