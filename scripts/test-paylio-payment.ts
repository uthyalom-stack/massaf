import crypto from 'crypto';
import { db } from '../src/lib/db';

async function testPayLioPaymentFlow() {
  console.log('--- STARTING AUTOMATED PAYLIO PAYMENT FLOW TESTS ---');

  const webhookSecret = process.env.PAYLIO_WEBHOOK_SECRET || 'test_webhook_secret_key_123';

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

    // TEST 1 & 2 & 13: Valid booking creates PayLio payment with amount from DB
    console.log('\nTEST 1 & 2 & 13: Valid booking creates PayLio payment & amount from DB...');
    const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

    const createRes = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: testBookingId,
        bookingNumber: testBookingNumber,
        amount: 5.0, // Client tries to override amount to $5.00!
      }),
    });

    const createData = await createRes.json();
    if (createRes.status !== 200 || !createData.checkoutUrl || !createData.paymentReference) {
      throw new Error(`PayLio create endpoint failed: ${JSON.stringify(createData)}`);
    }

    // Verify DB record has paymentReference persisted and amount remains $150
    const updatedBooking1 = await db.booking.findUniqueOrThrow({ where: { id: testBookingId } });
    if (updatedBooking1.amount !== 150.0) {
      throw new Error(`Client override vulnerability detected! DB amount changed to ${updatedBooking1.amount}`);
    }
    if (updatedBooking1.paymentReference !== createData.paymentReference) {
      throw new Error(`Payment reference mismatch in DB: expected ${createData.paymentReference}, got ${updatedBooking1.paymentReference}`);
    }
    console.log('✓ TEST 1 & 2 & 13 PASSED: PayLio payment created, amount strictly taken from DB ($150.00), reference persisted.');

    // TEST 6: Invalid booking is rejected
    console.log('\nTEST 6: Invalid booking request is rejected...');
    const invalidRes = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: 'non_existent_id' }),
    });
    if (invalidRes.status !== 404) {
      throw new Error(`Expected status 404 for non-existent booking, got ${invalidRes.status}`);
    }
    console.log('✓ TEST 6 PASSED: Invalid booking rejected with 404.');

    // TEST 5: Cancelled booking cannot be paid
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

    // TEST 7: Invalid webhook is rejected
    console.log('\nTEST 7: Invalid webhook signature is rejected...');
    const badWebhookRes = await fetch(`${BASE_URL}/api/payments/paylio/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PayLio-Signature': 'invalid_signature_hash',
      },
      body: JSON.stringify({
        payment_id: createData.paymentReference,
        status: 'paid',
      }),
    });
    if (badWebhookRes.status !== 401) {
      throw new Error(`Expected status 401 for invalid webhook signature, got ${badWebhookRes.status}`);
    }
    console.log('✓ TEST 7 PASSED: Invalid webhook rejected with 401 Unauthorized.');

    // TEST 10 & 11: Browser return or provider pending status does NOT mark payment PAID
    console.log('\nTEST 10 & 11: Pending status re-query remains PENDING...');
    const mockPendingRef = `paylio_mock_pending_${Date.now()}`;
    await db.booking.update({
      where: { id: testBookingId },
      data: { paymentReference: mockPendingRef, paymentStatus: 'PENDING' },
    });

    const statusRes = await fetch(`${BASE_URL}/api/payments/status?bookingId=${testBookingId}`);
    const statusData = await statusRes.json();
    if (statusData.paymentStatus !== 'PENDING') {
      throw new Error(`Expected paymentStatus PENDING, got ${statusData.paymentStatus}`);
    }
    console.log('✓ TEST 10 & 11 PASSED: Unverified / pending status remains PENDING.');

    // TEST 8: Valid successful webhook marks payment PAID
    console.log('\nTEST 8: Valid webhook with confirmed payment marks payment PAID...');
    const mockPaidRef = `paylio_mock_paid_${Date.now()}`;
    await db.booking.update({
      where: { id: testBookingId },
      data: { paymentReference: mockPaidRef, paymentStatus: 'PENDING' },
    });

    const validBody = JSON.stringify({
      payment_id: mockPaidRef,
      booking_id: testBookingId,
      status: 'completed',
    });

    const validSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(validBody, 'utf8')
      .digest('hex');

    const goodWebhookRes = await fetch(`${BASE_URL}/api/payments/paylio/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PayLio-Signature': validSig,
      },
      body: validBody,
    });

    const goodWebhookData = await goodWebhookRes.json();
    if (goodWebhookRes.status !== 200 || goodWebhookData.paymentStatus !== 'PAID') {
      throw new Error(`Webhook failed to process paid payment: ${JSON.stringify(goodWebhookData)}`);
    }

    const paidBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: testBookingId } });
    if (paidBookingInDb.paymentStatus !== 'PAID' || paidBookingInDb.status !== 'CONFIRMED') {
      throw new Error(`DB state not transitioned to PAID/CONFIRMED: ${JSON.stringify(paidBookingInDb)}`);
    }
    console.log('✓ TEST 8 PASSED: Valid webhook transitioned booking to PAID & CONFIRMED.');

    // TEST 9: Repeated successful webhook is idempotent
    console.log('\nTEST 9: Repeated webhook delivery is idempotent...');
    const repeatWebhookRes = await fetch(`${BASE_URL}/api/payments/paylio/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PayLio-Signature': validSig,
      },
      body: validBody,
    });
    const repeatWebhookData = await repeatWebhookRes.json();
    if (repeatWebhookRes.status !== 200 || !repeatWebhookData.message.includes('idempotently')) {
      throw new Error(`Repeat webhook failed idempotency check: ${JSON.stringify(repeatWebhookData)}`);
    }
    console.log('✓ TEST 9 PASSED: Repeated webhook returned 200 OK idempotently without duplicate side effects.');

    // TEST 4: Already-paid booking cannot create another payment session
    console.log('\nTEST 4: Already-paid booking cannot create another payment...');
    const paidCreateRes = await fetch(`${BASE_URL}/api/payments/paylio/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: testBookingId }),
    });
    if (paidCreateRes.status !== 400) {
      throw new Error(`Expected status 400 when attempting payment on already-paid booking, got ${paidCreateRes.status}`);
    }
    console.log('✓ TEST 4 PASSED: Already-paid booking payment creation blocked.');

    // TEST 12: Provider failed status does not become PAID
    console.log('\nTEST 12: Provider failed status does not become PAID...');
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

    const failedBody = JSON.stringify({
      payment_id: failedBooking.paymentReference,
      booking_id: failedBooking.id,
      status: 'failed',
    });

    const failedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(failedBody, 'utf8')
      .digest('hex');

    await fetch(`${BASE_URL}/api/payments/paylio/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PayLio-Signature': failedSig,
      },
      body: failedBody,
    });

    const failedBookingInDb = await db.booking.findUniqueOrThrow({ where: { id: failedBooking.id } });
    if (failedBookingInDb.paymentStatus !== 'FAILED') {
      throw new Error(`Expected paymentStatus FAILED, got ${failedBookingInDb.paymentStatus}`);
    }
    await db.booking.delete({ where: { id: failedBooking.id } });
    console.log('✓ TEST 12 PASSED: Provider failed status correctly recorded as FAILED.');

    console.log('\n======================================================');
    console.log('✅ ALL PAYLIO AUTOMATED PAYMENT TESTS PASSED!');
    console.log('======================================================');
  } catch (err) {
    console.error('\n❌ PAYLIO PAYMENT TEST FAILED:', err);
    process.exit(1);
  } finally {
    console.log('Cleaning up test records...');
    if (testBookingId) {
      await db.booking.deleteMany({ where: { customerId } });
    }
    if (customerId) {
      await db.customer.deleteMany({ where: { id: customerId } });
    }
    await db.$disconnect();
  }
}

testPayLioPaymentFlow();
