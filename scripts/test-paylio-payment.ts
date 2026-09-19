import { db } from '../src/lib/db';
import { PayLioClient } from '../src/lib/paylio';

async function testPayLioPaymentFlow() {
  console.log('--- STARTING COMPREHENSIVE AUTOMATED PAYLIO PAYMENT FLOW TESTS ---');

  // Safety Guard: Require explicitly designated test environment / test database
  const dbUrl = process.env.TURSO_DATABASE_URL || '';
  if (!dbUrl.includes('dev.db') && !process.env.ALLOW_TEST_DB) {
    console.error('❌ SAFETY GUARD TRIGGERED: test:paylio can only run against a local dev.db or test database.');
    process.exit(1);
  }

  let testTherapistId = '';
  let testServiceId = '';
  let testBookingIdA = '';
  let testBookingIdB = '';
  let testBookingIdCancelled = '';
  let testBookingIdRefunded = '';
  let customerId = '';

  try {
    // 1. Setup Test Therapist and Service with full availability
    console.log('1. Setting up test therapist and service...');
    let therapist = await db.therapist.findFirst({
      where: { name: 'PayLio Test Therapist' },
      include: { services: { include: { service: true } } },
    });

    if (!therapist) {
      therapist = await db.therapist.create({
        data: {
          name: 'PayLio Test Therapist',
          bio: 'Automated PayLio test therapist',
          isActive: true,
          offersStudio: true,
          offersInHome: false,
          availabilities: {
            create: [
              { dayOfWeek: 0, startTime: '00:00', endTime: '23:59' },
              { dayOfWeek: 1, startTime: '00:00', endTime: '23:59' },
              { dayOfWeek: 2, startTime: '00:00', endTime: '23:59' },
              { dayOfWeek: 3, startTime: '00:00', endTime: '23:59' },
              { dayOfWeek: 4, startTime: '00:00', endTime: '23:59' },
              { dayOfWeek: 5, startTime: '00:00', endTime: '23:59' },
              { dayOfWeek: 6, startTime: '00:00', endTime: '23:59' },
            ],
          },
        },
        include: { services: { include: { service: true } } },
      });

      const service = await db.service.create({
        data: {
          name: 'PayLio Test Massage',
          durationMinutes: 60,
          price: 150.0,
          isActive: true,
        },
      });

      await db.therapistService.create({
        data: {
          therapistId: therapist.id,
          serviceId: service.id,
          customPrice: 150.0,
          customDurationMinutes: 60,
          isActive: true,
        },
      });

      therapist = await db.therapist.findUniqueOrThrow({
        where: { id: therapist.id },
        include: { services: { include: { service: true } } },
      });
    }

    testTherapistId = therapist.id;
    testServiceId = therapist.services[0].service.id;

    // Create a customer
    const testCustomerEmail = `paylio.test.${Date.now()}@example.com`;
    const customer = await db.customer.create({
      data: {
        name: 'PayLio Test Customer',
        email: testCustomerEmail,
        phone: '555-0199',
      },
    });
    customerId = customer.id;

    // Create Booking A ($150)
    const testBookingNumberA = `MSF-TESTA-${Date.now().toString().slice(-4)}`;
    const bookingA = await db.booking.create({
      data: {
        bookingNumber: testBookingNumberA,
        customerId: customer.id,
        therapistId: testTherapistId,
        serviceId: testServiceId,
        appointmentDateTime: new Date('2028-09-01T10:00:00Z'),
        durationMinutes: 60,
        amount: 150.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
      },
    });
    testBookingIdA = bookingA.id;

    // Create Booking B ($150)
    const testBookingNumberB = `MSF-TESTB-${Date.now().toString().slice(-4)}`;
    const bookingB = await db.booking.create({
      data: {
        bookingNumber: testBookingNumberB,
        customerId: customer.id,
        therapistId: testTherapistId,
        serviceId: testServiceId,
        appointmentDateTime: new Date('2028-09-01T12:00:00Z'),
        durationMinutes: 60,
        amount: 150.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
      },
    });
    testBookingIdB = bookingB.id;

    // Create Cancelled Booking ($150)
    const cancelledBooking = await db.booking.create({
      data: {
        bookingNumber: `MSF-CANCEL-${Date.now().toString().slice(-4)}`,
        customerId: customer.id,
        therapistId: testTherapistId,
        serviceId: testServiceId,
        appointmentDateTime: new Date('2028-09-01T14:00:00Z'),
        durationMinutes: 60,
        amount: 150.0,
        status: 'CANCELLED',
        paymentStatus: 'UNPAID',
      },
    });
    testBookingIdCancelled = cancelledBooking.id;

    // Create Refunded Booking ($150)
    const refundedBooking = await db.booking.create({
      data: {
        bookingNumber: `MSF-REFUND-${Date.now().toString().slice(-4)}`,
        customerId: customer.id,
        therapistId: testTherapistId,
        serviceId: testServiceId,
        appointmentDateTime: new Date('2028-09-01T16:00:00Z'),
        durationMinutes: 60,
        amount: 150.0,
        status: 'REFUNDED',
        paymentStatus: 'REFUNDED',
      },
    });
    testBookingIdRefunded = refundedBooking.id;

    console.log(`✓ Test bookings created: A=${bookingA.bookingNumber}, B=${bookingB.bookingNumber}`);

    const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

    // TEST 1: Payment creation works
    console.log('\nTEST 1: Creating PayLio wallet payment link...');
    const createResA = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: testBookingIdA,
        bookingNumber: testBookingNumberA,
      }),
    });
    const createDataA = await createResA.json();
    if (createResA.status !== 200 || !createDataA.checkoutUrl || !createDataA.ipnToken) {
      throw new Error(`PayLio create endpoint failed: ${JSON.stringify(createDataA)}`);
    }
    const tokenA = createDataA.ipnToken;
    console.log('✓ TEST 1 PASSED: Payment link created successfully.');

    // TEST 2: Client cannot override booking amount
    console.log('\nTEST 2: Client cannot override booking amount...');
    await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: testBookingIdA,
        amount: 1.0, // Attempt price override ($1.00)
      }),
    });
    const dbBookingA = await db.booking.findUniqueOrThrow({ where: { id: testBookingIdA } });
    if (dbBookingA.amount !== 150.0) {
      throw new Error(`Amount override vulnerability! DB amount modified to ${dbBookingA.amount}`);
    }
    console.log('✓ TEST 2 PASSED: Client amount override attempt ignored; DB amount remains $150.00.');

    // TEST 3: Missing ipn_token -> 400
    console.log('\nTEST 3: Callback missing ipn_token parameter rejected...');
    const noTokenRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdA}`);
    if (noTokenRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for missing ipn_token, got ${noTokenRes.status}`);
    }
    console.log('✓ TEST 3 PASSED: Missing ipn_token in callback rejected with HTTP 400.');

    // TEST 4: Wrong ipn_token -> 400
    console.log('\nTEST 4: Callback with mismatched ipn_token rejected...');
    const mismatchRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdA}&ipn_token=paylio_ipn_WRONG_TOKEN`);
    if (mismatchRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for mismatched ipn_token, got ${mismatchRes.status}`);
    }
    console.log('✓ TEST 4 PASSED: Mismatched ipn_token rejected with HTTP 400.');

    // TEST 5: Booking A token used on Booking B -> 400
    console.log('\nTEST 5: Token for Booking A used on Booking B rejected...');
    const crossBookingRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdB}&ipn_token=${tokenA}`);
    if (crossBookingRes.status !== 400) {
      throw new Error(`Expected HTTP 400 when attempting to confirm Booking B with Booking A token, got ${crossBookingRes.status}`);
    }
    console.log('✓ TEST 5 PASSED: Cross-booking token confirmation attack rejected with HTTP 400.');

    // TEST 6: Valid token + verified PAID provider response -> PAID and CONFIRMED
    console.log('\nTEST 6: Valid token + verified PAID response transitions booking to PAID & CONFIRMED...');
    const mockPaidTokenA = `paylio_ipn_paid_${Date.now()}`;
    await db.booking.update({
      where: { id: testBookingIdA },
      data: { paymentReference: mockPaidTokenA, paymentStatus: 'PENDING' },
    });

    const validCallbackRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdA}&ipn_token=${mockPaidTokenA}`);
    if (validCallbackRes.status !== 200) {
      throw new Error(`Expected HTTP 200 JSON response from callback route, got ${validCallbackRes.status}`);
    }

    const paidBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: testBookingIdA } });
    if (paidBookingInDb.paymentStatus !== 'PAID' || paidBookingInDb.status !== 'CONFIRMED') {
      throw new Error(`DB state not transitioned to PAID/CONFIRMED: ${JSON.stringify(paidBookingInDb)}`);
    }
    console.log('✓ TEST 6 PASSED: Valid callback re-verified status server-to-server and transitioned booking to PAID & CONFIRMED.');

    // TEST 7: Callback query status parameter cannot fake payment success
    console.log('\nTEST 7: Callback status query parameter cannot fake payment success...');
    const mockPendingTokenB = `paylio_ipn_pending_${Date.now()}`;
    await db.booking.update({
      where: { id: testBookingIdB },
      data: { paymentReference: mockPendingTokenB, paymentStatus: 'PENDING' },
    });

    // Client passes status=paid in query param, but mock server returns pending for mockPendingTokenB
    await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdB}&ipn_token=${mockPendingTokenB}&status=paid`);
    const pendingBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: testBookingIdB } });
    if (pendingBookingInDb.paymentStatus === 'PAID') {
      throw new Error('Spoofed status=paid in callback query string falsely marked booking as PAID!');
    }
    console.log('✓ TEST 7 PASSED: Spoofed callback query string status=paid ignored; booking remains PENDING.');

    // TEST 8: Repeated callback is idempotent -> 200
    console.log('\nTEST 8: Repeated callback delivery is idempotent...');
    const repeatCallbackRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdA}&ipn_token=${mockPaidTokenA}`);
    if (repeatCallbackRes.status !== 200) {
      throw new Error(`Expected HTTP 200 for idempotent callback, got ${repeatCallbackRes.status}`);
    }
    console.log('✓ TEST 8 PASSED: Repeated callback executed idempotently returning HTTP 200.');

    // TEST 9: Already-paid booking cannot create another payment -> 400
    console.log('\nTEST 9: Already-paid booking cannot create another payment session...');
    const paidCreateRes = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: testBookingIdA }),
    });
    if (paidCreateRes.status !== 400) {
      throw new Error(`Expected status 400 when attempting payment on already-paid booking, got ${paidCreateRes.status}`);
    }
    console.log('✓ TEST 9 PASSED: Already-paid booking payment creation blocked.');

    // TEST 12: Unpaid provider status does not become PAID
    console.log('\nTEST 12: Unpaid provider status does not become PAID...');
    const statusUnpaidRes = await fetch(`${BASE_URL}/api/payments/status?bookingId=${testBookingIdB}`);
    const statusUnpaidData = await statusUnpaidRes.json();
    if (statusUnpaidData.paymentStatus === 'PAID') {
      throw new Error('Unpaid status falsely marked as PAID!');
    }
    console.log('✓ TEST 12 PASSED: Unpaid provider status remains PENDING.');

    // TEST 13: Canceled/failed provider status marks payment FAILED
    console.log('\nTEST 13: Canceled/failed provider status marks payment FAILED...');
    const mockFailedTokenB = `paylio_mock_failed_${Date.now()}`;
    await db.booking.update({
      where: { id: testBookingIdB },
      data: { paymentReference: mockFailedTokenB, paymentStatus: 'PENDING' },
    });

    await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdB}&ipn_token=${mockFailedTokenB}`);

    const failedBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: testBookingIdB } });
    if (failedBookingInDb.paymentStatus !== 'FAILED') {
      throw new Error(`Expected paymentStatus FAILED, got ${failedBookingInDb.paymentStatus}`);
    }
    console.log('✓ TEST 13 PASSED: Provider failed status correctly recorded as FAILED.');

    // TEST 14: CANCELLED booking cannot become paid -> 400
    console.log('\nTEST 14: CANCELLED booking cannot become paid...');
    const cancelPayRes = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: testBookingIdCancelled }),
    });
    if (cancelPayRes.status !== 400) {
      throw new Error(`Expected HTTP 400 when creating payment for cancelled booking, got ${cancelPayRes.status}`);
    }
    console.log('✓ TEST 14 PASSED: Cancelled booking payment creation blocked.');

    // TEST 15: REFUNDED booking cannot become paid -> 400
    console.log('\nTEST 15: REFUNDED booking cannot become paid...');
    const refundPayRes = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: testBookingIdRefunded }),
    });
    if (refundPayRes.status !== 400) {
      throw new Error(`Expected HTTP 400 when creating payment for refunded booking, got ${refundPayRes.status}`);
    }
    console.log('✓ TEST 15 PASSED: Refunded booking payment creation blocked.');

    // TEST 16 & 17: Production Mock Mode Guard Safety Check (Direct Unit Test of PayLioClient)
    console.log('\nTEST 16 & 17: Production Mock Mode Guard Safety Check...');
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = 'production';
      (process.env as Record<string, string>).PAYLIO_MOCK_MODE = 'true';

      const prodClient = new PayLioClient();
      let prodMockErrorThrown = false;

      try {
        await prodClient.createWalletPayment({
          bookingId: 'prod_test',
          bookingNumber: 'MSF-PROD',
          amount: 100,
          callbackUrl: 'http://localhost/callback',
        });
      } catch {
        prodMockErrorThrown = true;
      }

      if (!prodMockErrorThrown) {
        throw new Error('Production mock mode guard failed! Mock payment succeeded in NODE_ENV=production.');
      }

      console.log('✓ TEST 16 & 17 PASSED: PayLioClient production guard strictly blocked mock mode in NODE_ENV=production.');
    } finally {
      (process.env as Record<string, string>).NODE_ENV = origEnv;
    }

    console.log('\n======================================================');
    console.log('✅ ALL COMPREHENSIVE PAYLIO AUTOMATED PAYMENT TESTS PASSED!');
    console.log('======================================================');
  } catch (err) {
    console.error('\n❌ PAYLIO PAYMENT TEST FAILED:', err);
    process.exit(1);
  } finally {
    console.log('Cleaning up test records...');
    try {
      if (customerId) {
        await db.booking.deleteMany({ where: { customerId } });
        await db.customer.deleteMany({ where: { id: customerId } });
      }
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }
    await db.$disconnect();
  }
}

testPayLioPaymentFlow();
