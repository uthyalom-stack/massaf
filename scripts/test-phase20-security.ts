import { db } from '@/lib/db';
import {
  createSessionToken,
  verifySessionToken,
} from '@/lib/auth-session';
import { createTherapistAction } from '@/app/admin/actions';
import { verifyAdminApiKey } from '@/lib/admin-guard';
import { confirmVerifiedPayLioPayment } from '@/lib/paylio';
import { generateVerificationToken, consumeVerificationToken } from '@/lib/verification-tokens';
import { POST as postReviewRoute } from '@/app/api/reviews/route';
import { GET as getBookingDetailsRoute } from '@/app/api/bookings/details/route';
import { POST as postAvailabilityRoute } from '@/app/api/admin/therapists/[id]/availability/route';
import { POST as postAdminVerifyRoute } from '@/app/api/auth/admin/verify/route';

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
    const testCustAEmail = `sec-cust-a-${timestamp}@massaf.com`;
    const testCustBEmail = `sec-cust-b-${timestamp}@massaf.com`;

    // Seed test users in DB
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
      assert(!unauthRes.success && typeof unauthRes.error === 'string' && unauthRes.error.length > 0, '1. Unauthenticated admin server action rejected');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      assert(errMsg.length > 0, '1. Unauthenticated admin server action rejected');
    }

    // 2. Admin HMAC Session Creation & Verification
    const adminToken = createSessionToken(adminUser.id, adminUser.email, 'ADMIN', 24, adminUser.role);
    const parsedAdminPayload = verifySessionToken(adminToken, 'ADMIN');
    assert(parsedAdminPayload !== null && parsedAdminPayload.entityId === adminUser.id, '2. Valid admin HMAC token verified successfully');

    // 3. Customer Session Payload Rejected for ADMIN Role Evaluation
    const custTokenA = createSessionToken(custA.id, custA.email, 'CUSTOMER');
    const custTokenB = createSessionToken(custB.id, custB.email, 'CUSTOMER');
    assert(verifySessionToken(custTokenA, 'ADMIN') === null, '3. Customer session payload rejected for ADMIN role evaluation');

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

    // 7. REAL ENDPOINT TEST: Customer B Review Submission on Customer A's Booking (Expect HTTP 403)
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

    const custBReviewReq = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': `massaf_customer_session=${custTokenB}`,
      },
      body: JSON.stringify({
        bookingId: bookingA.id,
        rating: 5,
        comment: 'Attempting review on wrong booking',
      }),
    });

    const custBReviewRes = await postReviewRoute(custBReviewReq);
    assert(custBReviewRes.status === 403, '7. POST /api/reviews rejected Customer B reviewing Customer A booking with 403');

    // 8. REAL ENDPOINT TEST: Customer A Review Submission on Own Booking (Expect HTTP 201)
    const custAReviewReq = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': `massaf_customer_session=${custTokenA}`,
      },
      body: JSON.stringify({
        bookingId: bookingA.id,
        rating: 5,
        comment: 'Excellent session!',
      }),
    });

    const custAReviewRes = await postReviewRoute(custAReviewReq);
    assert(custAReviewRes.status === 201, '8. POST /api/reviews accepted owner Customer A review with 201');

    // 9. REAL ENDPOINT TEST: GET /api/bookings/details Authorization
    // Customer B accessing Customer A's completed old booking (outside 15m unpaid checkout window) -> Expect HTTP 401
    const unauthDetailsReq = new Request(`http://localhost:3000/api/bookings/details?id=${bookingA.id}`, {
      headers: {
        'cookie': `massaf_customer_session=${custTokenB}`,
      },
    });
    const unauthDetailsRes = await getBookingDetailsRoute(unauthDetailsReq);
    assert(unauthDetailsRes.status === 401, '9a. GET /api/bookings/details rejected unrelated Customer B with 401');

    // Customer A accessing own booking -> Expect HTTP 200
    const ownerDetailsReq = new Request(`http://localhost:3000/api/bookings/details?id=${bookingA.id}`, {
      headers: {
        'cookie': `massaf_customer_session=${custTokenA}`,
      },
    });
    const ownerDetailsRes = await getBookingDetailsRoute(ownerDetailsReq);
    assert(ownerDetailsRes.status === 200, '9b. GET /api/bookings/details allowed owner Customer A with 200');

    // 10. REAL ENDPOINT TEST: Admin Availability API Overlap & Validation Rules
    // 10a. Invalid time range (start 14:00 > end 09:00) -> Expect HTTP 400
    const invalidTimeReq = new Request(`http://localhost:3000/api/admin/therapists/${therapist.id}/availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': `massaf_admin_session=${adminToken}`,
      },
      body: JSON.stringify({
        dayOfWeek: 1,
        startTime: '14:00',
        endTime: '09:00',
        isUnavailable: false,
      }),
    });
    const invalidTimeRes = await postAvailabilityRoute(invalidTimeReq, { params: Promise.resolve({ id: therapist.id }) });
    assert(invalidTimeRes.status === 400, '10a. POST availability API rejected start time >= end time with 400');

    // 10b. Invalid day of week (dayOfWeek = 8) -> Expect HTTP 400
    const invalidDayReq = new Request(`http://localhost:3000/api/admin/therapists/${therapist.id}/availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': `massaf_admin_session=${adminToken}`,
      },
      body: JSON.stringify({
        dayOfWeek: 8,
        startTime: '09:00',
        endTime: '12:00',
        isUnavailable: false,
      }),
    });
    const invalidDayRes = await postAvailabilityRoute(invalidDayReq, { params: Promise.resolve({ id: therapist.id }) });
    assert(invalidDayRes.status === 400, '10b. POST availability API rejected invalid dayOfWeek (>6) with 400');

    // 10c. Create initial slot (09:00 - 12:00) -> Expect HTTP 201
    const validSlotReq = new Request(`http://localhost:3000/api/admin/therapists/${therapist.id}/availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': `massaf_admin_session=${adminToken}`,
      },
      body: JSON.stringify({
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '12:00',
        isUnavailable: false,
      }),
    });
    const validSlotRes = await postAvailabilityRoute(validSlotReq, { params: Promise.resolve({ id: therapist.id }) });
    assert(validSlotRes.status === 201, '10c. POST availability API accepted valid schedule window with 201');

    // 10d. Create overlapping slot (10:00 - 14:00) -> Expect HTTP 400
    const overlapSlotReq = new Request(`http://localhost:3000/api/admin/therapists/${therapist.id}/availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cookie': `massaf_admin_session=${adminToken}`,
      },
      body: JSON.stringify({
        dayOfWeek: 1,
        startTime: '10:00',
        endTime: '14:00',
        isUnavailable: false,
      }),
    });
    const overlapSlotRes = await postAvailabilityRoute(overlapSlotReq, { params: Promise.resolve({ id: therapist.id }) });
    assert(overlapSlotRes.status === 400, '10d. POST availability API rejected overlapping schedule window with 400');

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

    // 13. Admin Login API Verification Tests
    // 13a. Nonexistent admin email rejected with 401
    const badAdminLoginReq = new Request('http://localhost:3000/api/auth/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `nonexistent-${timestamp}@massaf.com` }),
    });
    const badAdminLoginRes = await postAdminVerifyRoute(badAdminLoginReq);
    assert(badAdminLoginRes.status === 401, '13a. Nonexistent admin email rejected with 401');

    // 13b. Customer email (non-User) rejected with 401
    const custAsAdminLoginReq = new Request('http://localhost:3000/api/auth/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testCustAEmail }),
    });
    const custAsAdminLoginRes = await postAdminVerifyRoute(custAsAdminLoginReq);
    assert(custAsAdminLoginRes.status === 401, '13b. Non-admin customer account rejected for admin login with 401');

    // 13c. Valid admin email accepted with 200 and sets massaf_admin_session cookie
    const validAdminLoginReq = new Request('http://localhost:3000/api/auth/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testAdminEmail }),
    });
    const validAdminLoginRes = await postAdminVerifyRoute(validAdminLoginReq);
    assert(validAdminLoginRes.status === 200, '13c. Valid admin user authenticated with 200');
    const adminSessionData = await validAdminLoginRes.json();
    assert(adminSessionData.redirectUrl === '/admin', '13d. Admin authentication returned redirectUrl /admin');

    // 13e. Valid staff user authenticated with 200
    const validStaffLoginReq = new Request('http://localhost:3000/api/auth/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testStaffEmail }),
    });
    const validStaffLoginRes = await postAdminVerifyRoute(validStaffLoginReq);
    assert(validStaffLoginRes.status === 200, '13e. Valid STAFF user authenticated with 200');

    // 13f. Admin Logout endpoint clears admin session cookie
    const logoutReq = new Request('http://localhost:3000/api/auth/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    const logoutRes = await postAdminVerifyRoute(logoutReq);
    assert(logoutRes.status === 200, '13f. Admin logout request succeeded with 200');
    const logoutData = await logoutRes.json();
    assert(logoutData.message === 'Logged out successfully', '13g. Admin logout returned successful message');

    // Clean up test records from DB
    await db.review.deleteMany({ where: { bookingId: bookingA.id } });
    await db.booking.delete({ where: { id: bookingA.id } });
    await db.booking.delete({ where: { id: paylioBooking.id } });
    await db.therapistAvailability.deleteMany({ where: { therapistId: therapist.id } });
    await db.therapist.delete({ where: { id: therapist.id } });
    await db.service.delete({ where: { id: service.id } });
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
