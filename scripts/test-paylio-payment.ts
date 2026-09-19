import { db } from '../src/lib/db';

async function testPayLioPaymentFlow() {
  console.log('--- STARTING AUTOMATED PAYLIO PAYMENT FLOW TESTS ---');

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

    console.log(`✓ Test bookings created: A=${bookingA.bookingNumber}, B=${bookingB.bookingNumber}`);

    const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

    // TEST 1: Valid payment creation & DB amount authority
    console.log('\nTEST 1: Creating PayLio payment link & DB amount authority...');
    const createResA = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: testBookingIdA,
        bookingNumber: testBookingNumberA,
        amount: 5.0, // Client tries to override price to $5.00
      }),
    });
    const createDataA = await createResA.json();
    if (createResA.status !== 200 || !createDataA.checkoutUrl || !createDataA.ipnToken) {
      throw new Error(`PayLio create endpoint failed: ${JSON.stringify(createDataA)}`);
    }

    const tokenA = createDataA.ipnToken;
    const dbBookingA = await db.booking.findUniqueOrThrow({ where: { id: testBookingIdA } });
    if (dbBookingA.amount !== 150.0) {
      throw new Error(`Amount override vulnerability! DB amount modified to ${dbBookingA.amount}`);
    }
    if (dbBookingA.paymentReference !== tokenA) {
      throw new Error(`Payment reference mismatch in DB: expected ${tokenA}, got ${dbBookingA.paymentReference}`);
    }
    console.log('✓ TEST 1 PASSED: PayLio payment link created, amount strictly taken from DB ($150.00), ipnToken persisted.');

    // TEST 2: Callback missing ipn_token parameter -> 400
    console.log('\nTEST 2: Callback missing ipn_token parameter rejected...');
    const noTokenRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdA}`);
    if (noTokenRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for missing ipn_token, got ${noTokenRes.status}`);
    }
    console.log('✓ TEST 2 PASSED: Missing ipn_token in callback rejected with HTTP 400.');

    // TEST 3: Callback with mismatched token -> 400
    console.log('\nTEST 3: Callback with mismatched ipn_token rejected...');
    const mismatchRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdA}&ipn_token=paylio_ipn_WRONG_TOKEN`);
    if (mismatchRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for mismatched ipn_token, got ${mismatchRes.status}`);
    }
    console.log('✓ TEST 3 PASSED: Mismatched ipn_token rejected with HTTP 400.');

    // TEST 4: Cross-booking token reuse protection (Token for Booking A used for Booking B) -> 400
    console.log('\nTEST 4: Token for Booking A used on Booking B rejected...');
    const crossBookingRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdB}&ipn_token=${tokenA}`);
    if (crossBookingRes.status !== 400) {
      throw new Error(`Expected HTTP 400 when attempting to confirm Booking B with Booking A token, got ${crossBookingRes.status}`);
    }
    console.log('✓ TEST 4 PASSED: Cross-booking token confirmation attack rejected with HTTP 400.');

    // TEST 5: Valid callback re-verifies status server-to-server and transitions booking to PAID & CONFIRMED
    console.log('\nTEST 5: Valid callback re-verifies status and transitions booking to PAID & CONFIRMED...');
    const mockPaidTokenA = `paylio_ipn_paid_${Date.now()}`;
    await db.booking.update({
      where: { id: testBookingIdA },
      data: { paymentReference: mockPaidTokenA, paymentStatus: 'PENDING' },
    });

    const validCallbackRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdA}&ipn_token=${mockPaidTokenA}&status=paid`);
    if (validCallbackRes.status !== 200) {
      throw new Error(`Expected HTTP 200 JSON response from callback route, got ${validCallbackRes.status}`);
    }

    const paidBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: testBookingIdA } });
    if (paidBookingInDb.paymentStatus !== 'PAID' || paidBookingInDb.status !== 'CONFIRMED') {
      throw new Error(`DB state not transitioned to PAID/CONFIRMED: ${JSON.stringify(paidBookingInDb)}`);
    }
    console.log('✓ TEST 5 PASSED: Valid callback re-verified status server-to-server and returned HTTP 200 JSON.');

    // TEST 6: Repeated callback delivery is idempotent -> 200
    console.log('\nTEST 6: Repeated callback delivery is idempotent...');
    const repeatCallbackRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdA}&ipn_token=${mockPaidTokenA}&status=paid`);
    if (repeatCallbackRes.status !== 200) {
      throw new Error(`Expected HTTP 200 for idempotent callback, got ${repeatCallbackRes.status}`);
    }
    const repeatBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: testBookingIdA } });
    if (repeatBookingInDb.paymentStatus !== 'PAID' || repeatBookingInDb.status !== 'CONFIRMED') {
      throw new Error(`Idempotent callback check failed: ${JSON.stringify(repeatBookingInDb)}`);
    }
    console.log('✓ TEST 6 PASSED: Repeated callback executed idempotently returning HTTP 200.');

    // TEST 7: Already-paid booking cannot create another payment session -> 400
    console.log('\nTEST 7: Already-paid booking cannot create another payment session...');
    const paidCreateRes = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: testBookingIdA }),
    });
    if (paidCreateRes.status !== 400) {
      throw new Error(`Expected status 400 when attempting payment on already-paid booking, got ${paidCreateRes.status}`);
    }
    console.log('✓ TEST 7 PASSED: Already-paid booking payment creation blocked.');

    // TEST 8: Provider failed status marks payment FAILED
    console.log('\nTEST 8: Provider failed status marks payment FAILED...');
    const mockFailedTokenB = `paylio_mock_failed_${Date.now()}`;
    await db.booking.update({
      where: { id: testBookingIdB },
      data: { paymentReference: mockFailedTokenB, paymentStatus: 'PENDING' },
    });

    await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingIdB}&ipn_token=${mockFailedTokenB}&status=canceled`);

    const failedBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: testBookingIdB } });
    if (failedBookingInDb.paymentStatus !== 'FAILED') {
      throw new Error(`Expected paymentStatus FAILED, got ${failedBookingInDb.paymentStatus}`);
    }
    console.log('✓ TEST 8 PASSED: Provider failed status correctly recorded as FAILED.');

    console.log('\n======================================================');
    console.log('✅ ALL PAYLIO AUTOMATED PAYMENT TESTS PASSED!');
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
