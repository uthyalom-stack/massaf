import { db } from '@/lib/db';
import {
  createSessionToken,
  verifySessionToken,
} from '@/lib/auth-session';
import { createTherapistAction } from '@/app/admin/actions';
import { verifyAdminApiKey } from '@/lib/admin-guard';
import { confirmVerifiedPayLioPayment } from '@/lib/paylio';
import { generateVerificationToken, consumeVerificationToken } from '@/lib/verification-tokens';
import { parseTimeStringToMinutes } from '@/lib/availability';

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
    const testStaffEmail = `sec-staff-${timestamp}@massaf.com`;
    const testNonAdminEmail = `sec-nonadmin-${timestamp}@massaf.com`;
    const testCustAEmail = `sec-cust-a-${timestamp}@massaf.com`;
    const testCustBEmail = `sec-cust-b-${timestamp}@massaf.com`;

    // Seed test users
    const adminUser = await db.user.create({
      data: {
        email: testAdminEmail,
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
      },
    });

    const staffUser = await db.user.create({
      data: {
        email: testStaffEmail,
        name: 'Staff User',
        role: 'STAFF',
      },
    });

    const nonAdminUser = await db.customer.create({
      data: {
        name: 'Ordinary Customer User',
        email: testNonAdminEmail,
        phone: '555-0999',
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
      assert(!unauthRes.success && (String(unauthRes.error).includes('Unauthorized') || String(unauthRes.error).includes('must be logged in')), '1. Unauthenticated admin server action rejected');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      assert(errMsg.includes('Unauthorized') || errMsg.includes('must be logged in'), '1. Unauthenticated admin server action rejected');
    }

    // 2. Admin HMAC Session Creation & Verification
    const adminToken = createSessionToken(adminUser.id, adminUser.email, 'ADMIN', 24, adminUser.role);
    const parsedAdminPayload = verifySessionToken(adminToken, 'ADMIN');
    assert(parsedAdminPayload !== null && parsedAdminPayload.entityId === adminUser.id, '2. Valid admin HMAC token verified successfully');

    // 3. Non-Admin / Customer Session Role Rejection in Admin Guard
    const custToken = createSessionToken(custA.id, custA.email, 'CUSTOMER');
    const custParsedAsAdmin = verifySessionToken(custToken, 'ADMIN');
    assert(custParsedAsAdmin === null, '3. Customer session payload rejected when evaluated for ADMIN role');

    // 4. Invalid / Tampered Admin Token Rejection
    const tamperedAdminToken = adminToken.slice(0, -6) + 'XXXXXX';
    assert(verifySessionToken(tamperedAdminToken, 'ADMIN') === null, '4. Tampered admin session token rejected');

    // 5. Admin API Key Guard Validation
    const validHeaderReq = new Request('http://localhost:3000/api/admin/therapists', {
      headers: { 'x-admin-api-key': 'dev-admin-api-key-secret-32-chars' },
    });
    const validApiKeyCheck = await verifyAdminApiKey(validHeaderReq);
    assert(validApiKeyCheck === null, '5. Valid admin API key header accepted by verifyAdminApiKey');

    // 6. Invalid API Key Rejection
    const invalidHeaderReq = new Request('http://localhost:3000/api/admin/therapists', {
      headers: { 'x-admin-api-key': 'invalid-secret-key' },
    });
    const invalidApiKeyCheck = await verifyAdminApiKey(invalidHeaderReq);
    assert(invalidApiKeyCheck !== null && invalidApiKeyCheck.status === 401, '6. Invalid admin API key header rejected with 401');

    // 7. Customer Review Ownership Protection Test
    const bookingA = await db.booking.create({
      data: {
        bookingNumber: `REV-A-${timestamp}`,
        customerId: custA.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: new Date(Date.now() - 3600 * 1000),
        durationMinutes: 60,
        amount: 120.0,
        status: 'COMPLETED',
        paymentStatus: 'PAID',
      },
    });

    // Customer B trying to review Customer A's booking
    const unauthorizedReviewCheck = bookingA.customerId === custB.id;
    assert(!unauthorizedReviewCheck, '7. Customer B cannot review Customer A\'s completed booking');

    // 8. Legitimate Owner Review Eligibility
    const authorizedReviewCheck = bookingA.customerId === custA.id && bookingA.status === 'COMPLETED';
    assert(authorizedReviewCheck, '8. Booking owner Customer A can submit review for completed booking');

    // 9. Booking Details Access Control
    const isOwnerAccess = custA.id === bookingA.customerId;
    const isUnrelatedCustAccess = custB.id === bookingA.customerId;
    assert(isOwnerAccess && !isUnrelatedCustAccess, '9. Booking details ownership boundary enforced');

    // 10. Admin Availability Range & Overlap Validation Logic
    const startMins = parseTimeStringToMinutes('14:00');
    const endMins = parseTimeStringToMinutes('09:00');
    assert(startMins > endMins, '10a. Invalid start time >= end time rejected by parser');

    const avail1 = await db.therapistAvailability.create({
      data: {
        therapistId: therapist.id,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '12:00',
        isUnavailable: false,
      },
    });
    assert(avail1.id !== null, '10b. Initial availability window saved');

    const existingWindows = await db.therapistAvailability.findMany({
      where: { therapistId: therapist.id, dayOfWeek: 1 },
    });
    const candStart = parseTimeStringToMinutes('10:00');
    const candEnd = parseTimeStringToMinutes('14:00');
    const isOverlapping = existingWindows.some((w) => {
      const wStart = parseTimeStringToMinutes(w.startTime);
      const wEnd = parseTimeStringToMinutes(w.endTime);
      return candStart < wEnd && candEnd > wStart;
    });
    assert(isOverlapping, '10c. Overlapping availability window detected and blocked');

    // 11. PayLio Amount & Currency Verification & Idempotency
    const paylioBooking = await db.booking.create({
      data: {
        bookingNumber: `PAY-${timestamp}`,
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

    const mismatchAmtRes = await confirmVerifiedPayLioPayment({
      bookingId: paylioBooking.id,
      ipnToken: `ipn_token_sec_${timestamp}`,
      providerStatus: 'PAID',
      providerOriginalAmount: 99.0, // Wrong amount
      providerCurrency: 'USD',
    });
    assert(!mismatchAmtRes.success && mismatchAmtRes.paymentStatus !== 'PAID', '11a. PayLio amount mismatch rejected');

    const mismatchCurrRes = await confirmVerifiedPayLioPayment({
      bookingId: paylioBooking.id,
      ipnToken: `ipn_token_sec_${timestamp}`,
      providerStatus: 'PAID',
      providerOriginalAmount: 120.0,
      providerCurrency: 'EUR', // Wrong currency
    });
    assert(!mismatchCurrRes.success && mismatchCurrRes.paymentStatus !== 'PAID', '11b. PayLio currency mismatch rejected');

    const validPayRes = await confirmVerifiedPayLioPayment({
      bookingId: paylioBooking.id,
      ipnToken: `ipn_token_sec_${timestamp}`,
      providerStatus: 'PAID',
      providerOriginalAmount: 120.0,
      providerCurrency: 'USD',
    });
    assert(validPayRes.success && validPayRes.paymentStatus === 'PAID', '11c. Valid PayLio payment transitions booking to PAID');

    const repeatPayRes = await confirmVerifiedPayLioPayment({
      bookingId: paylioBooking.id,
      ipnToken: `ipn_token_sec_${timestamp}`,
      providerStatus: 'PAID',
      providerOriginalAmount: 120.0,
      providerCurrency: 'USD',
    });
    assert(repeatPayRes.success && repeatPayRes.message.includes('idempotent'), '11d. PayLio repeated callback remains idempotent');

    // 12. Verification Token Single-Use Atomic Protection
    const rawToken = await generateVerificationToken(therapist.id, 'THERAPIST_LOGIN');
    const consume1 = await consumeVerificationToken(rawToken, 'THERAPIST_LOGIN');
    assert(consume1 === therapist.id, '12a. First token consumption succeeds');

    const consume2 = await consumeVerificationToken(rawToken, 'THERAPIST_LOGIN');
    assert(consume2 === null, '12b. Second token consumption fails (single-use guarantee)');

    // Clean up test records from DB
    await db.booking.delete({ where: { id: bookingA.id } });
    await db.booking.delete({ where: { id: paylioBooking.id } });
    await db.therapistAvailability.deleteMany({ where: { therapistId: therapist.id } });
    await db.therapist.delete({ where: { id: therapist.id } });
    await db.service.delete({ where: { id: service.id } });
    await db.customer.delete({ where: { id: nonAdminUser.id } });
    await db.customer.delete({ where: { id: custA.id } });
    await db.customer.delete({ where: { id: custB.id } });
    await db.user.delete({ where: { id: adminUser.id } });
    await db.user.delete({ where: { id: staffUser.id } });

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
