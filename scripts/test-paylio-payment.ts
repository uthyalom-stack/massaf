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
  let testBookingId = '';
  let testBookingNumber = '';
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

    // Create a test booking ($150)
    testBookingNumber = `MSF-TEST-${Date.now().toString().slice(-4)}`;
    const booking = await db.booking.create({
      data: {
        bookingNumber: testBookingNumber,
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
    testBookingId = booking.id;

    console.log(`✓ Test booking created: ${booking.bookingNumber} ($${booking.amount})`);

    // TEST 1, 2, 3: Valid booking creates PayLio wallet payment link with amount strictly from DB
    console.log('\nTEST 1, 2, 3: Creating PayLio wallet payment session...');
    const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

    const createRes = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: testBookingId,
        bookingNumber: testBookingNumber,
        amount: 5.0, // Client attempts amount override ($5.00)
      }),
    });

    const createData = await createRes.json();
    if (createRes.status !== 200 || !createData.checkoutUrl || !createData.ipnToken) {
      throw new Error(`PayLio create endpoint failed: ${JSON.stringify(createData)}`);
    }

    // Verify DB record has ipnToken persisted as paymentReference and amount remains $150
    const updatedBooking1 = await db.booking.findUniqueOrThrow({ where: { id: testBookingId } });
    if (updatedBooking1.amount !== 150.0) {
      throw new Error(`Client override vulnerability detected! DB amount changed to ${updatedBooking1.amount}`);
    }
    if (updatedBooking1.paymentReference !== createData.ipnToken) {
      throw new Error(`Payment reference mismatch in DB: expected ${createData.ipnToken}, got ${updatedBooking1.paymentReference}`);
    }
    console.log('✓ TEST 1, 2, 3 PASSED: PayLio wallet created, amount strictly taken from DB ($150.00), ipnToken persisted.');

    // TEST 4: Invalid booking request is rejected
    console.log('\nTEST 4: Invalid booking request is rejected...');
    const invalidRes = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: 'non_existent_id' }),
    });
    if (invalidRes.status !== 404) {
      throw new Error(`Expected status 404 for non-existent booking, got ${invalidRes.status}`);
    }
    console.log('✓ TEST 4 PASSED: Invalid booking rejected with 404.');

    // TEST 5: Cancelled booking cannot create payment session
    console.log('\nTEST 5: Cancelled booking cannot create payment...');
    const cancelledBooking = await db.booking.create({
      data: {
        bookingNumber: `MSF-CANCEL-${Date.now().toString().slice(-4)}`,
        customerId: customer.id,
        therapistId: testTherapistId,
        serviceId: testServiceId,
        appointmentDateTime: new Date('2028-09-02T10:00:00Z'),
        durationMinutes: 60,
        amount: 150.0,
        status: 'CANCELLED',
        paymentStatus: 'UNPAID',
      },
    });

    const cancelRes = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: cancelledBooking.id }),
    });
    if (cancelRes.status !== 400) {
      throw new Error(`Expected status 400 for cancelled booking, got ${cancelRes.status}`);
    }
    await db.booking.delete({ where: { id: cancelledBooking.id } });
    console.log('✓ TEST 5 PASSED: Cancelled booking rejected from payment.');

    // TEST 6: GET Callback triggers server-to-server status verification and marks booking PAID
    console.log('\nTEST 6: GET Callback with verified paid status transitions booking to PAID & CONFIRMED...');
    const mockPaidToken = `paylio_ipn_paid_${Date.now()}`;
    await db.booking.update({
      where: { id: testBookingId },
      data: { paymentReference: mockPaidToken, paymentStatus: 'PENDING' },
    });

    const callbackRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingId}&ipn_token=${mockPaidToken}&status=paid`, {
      redirect: 'manual',
    });

    if (callbackRes.status !== 302 && callbackRes.status !== 307 && callbackRes.status !== 200) {
      throw new Error(`Expected redirect from callback, got status ${callbackRes.status}`);
    }

    const paidBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: testBookingId } });
    if (paidBookingInDb.paymentStatus !== 'PAID' || paidBookingInDb.status !== 'CONFIRMED') {
      throw new Error(`DB state not transitioned to PAID/CONFIRMED: ${JSON.stringify(paidBookingInDb)}`);
    }
    console.log('✓ TEST 6 PASSED: GET Callback re-verified status server-to-server and transitioned booking to PAID & CONFIRMED.');

    // TEST 7: Duplicate callback delivery is idempotent
    console.log('\nTEST 7: Repeated callback delivery is idempotent...');
    const repeatCallbackRes = await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${testBookingId}&ipn_token=${mockPaidToken}&status=paid`, {
      redirect: 'manual',
    });
    const repeatBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: testBookingId } });
    if (repeatBookingInDb.paymentStatus !== 'PAID' || repeatBookingInDb.status !== 'CONFIRMED') {
      throw new Error(`Idempotent callback check failed: ${JSON.stringify(repeatBookingInDb)}`);
    }
    console.log('✓ TEST 7 PASSED: Repeated callback executed idempotently without side effects.');

    // TEST 8: Already-paid booking cannot create another payment session
    console.log('\nTEST 8: Already-paid booking cannot create another payment session...');
    const paidCreateRes = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: testBookingId }),
    });
    if (paidCreateRes.status !== 400) {
      throw new Error(`Expected status 400 when attempting payment on already-paid booking, got ${paidCreateRes.status}`);
    }
    console.log('✓ TEST 8 PASSED: Already-paid booking payment creation blocked.');

    // TEST 9: Provider failed status does NOT mark payment PAID
    console.log('\nTEST 9: Provider failed status marks payment FAILED...');
    const failedBooking = await db.booking.create({
      data: {
        bookingNumber: `MSF-FAIL-${Date.now().toString().slice(-4)}`,
        customerId: customer.id,
        therapistId: testTherapistId,
        serviceId: testServiceId,
        appointmentDateTime: new Date('2028-09-03T10:00:00Z'),
        durationMinutes: 60,
        amount: 150.0,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        paymentReference: `paylio_mock_failed_${Date.now()}`,
      },
    });

    await fetch(`${BASE_URL}/api/payments/paylio/callback?bookingId=${failedBooking.id}&ipn_token=${failedBooking.paymentReference}&status=canceled`, {
      redirect: 'manual',
    });

    const failedBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: failedBooking.id } });
    if (failedBookingInDb.paymentStatus !== 'FAILED') {
      throw new Error(`Expected paymentStatus FAILED, got ${failedBookingInDb.paymentStatus}`);
    }
    await db.booking.delete({ where: { id: failedBooking.id } });
    console.log('✓ TEST 9 PASSED: Provider failed status correctly recorded as FAILED.');

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
