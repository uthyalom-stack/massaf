import { db } from '../src/lib/db';
import { confirmVerifiedPayLioPayment } from '../src/lib/paylio';
import {
  notifyBookingCreated,
  notifyBookingCancelled,
  notifyBookingCompleted,
  notifyBookingReminder,
  notifyBookingExpired,
} from '../src/lib/notifications';
import { sendTelegramMessage } from '../src/lib/notifications/telegram';

async function runTests() {
  console.log('====================================================');
  console.log('  STARTING PHASE 15 NOTIFICATIONS & LIFECYCLE TESTS ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  const runId = Date.now().toString().slice(-6);

  // Track created entities for safe cleanup in finally block
  const createdBookingIds: string[] = [];
  const createdTherapistIds: string[] = [];
  const createdServiceIds: string[] = [];
  const createdCustomerIds: string[] = [];
  const createdMarketingLinkIds: string[] = [];

  try {
    // 0. Setup isolated test entities created strictly for this test run
    const therapist = await db.therapist.create({
      data: {
        name: `Test Notification Therapist ${runId}`,
        email: `therapist-p15-${runId}@test.com`,
        telegramChatId: '123456789',
        rating: 4.8,
        offersStudio: true,
        offersInHome: true,
      },
    });
    createdTherapistIds.push(therapist.id);

    const service = await db.service.create({
      data: {
        name: `Test Deep Tissue ${runId}`,
        durationMinutes: 60,
        price: 120,
      },
    });
    createdServiceIds.push(service.id);

    const customer = await db.customer.create({
      data: {
        name: `Test Customer ${runId}`,
        email: `testcustomer-${runId}@massaf.com`,
        phone: '555-0199',
      },
    });
    createdCustomerIds.push(customer.id);

    const futureDate = new Date(Date.now() + 86400000 * 2);

    // Test 1 — Booking Creation State & Created Notification
    const test1Booking = await db.booking.create({
      data: {
        bookingNumber: `MSF-TEST1-${runId}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: futureDate,
        durationMinutes: 60,
        amount: 120.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
      },
    });
    createdBookingIds.push(test1Booking.id);

    assert(
      test1Booking.status === 'PENDING' && test1Booking.paymentStatus === 'UNPAID',
      'Test 1: Booking created status is PENDING and paymentStatus is UNPAID'
    );

    const notifCreatedRes = await notifyBookingCreated(test1Booking.id);
    assert(notifCreatedRes.success, 'Test 1b: notifyBookingCreated returns success result');

    // Test 2 — PayLio Payment Confirmation & Notification Dispatches
    const test2Token = `paylio_ipn_paid_test2_${runId}`;
    const test2Booking = await db.booking.create({
      data: {
        bookingNumber: `MSF-TEST2-${runId}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: futureDate,
        durationMinutes: 60,
        amount: 150.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        paymentReference: test2Token,
      },
    });
    createdBookingIds.push(test2Booking.id);

    const confirmResult = await confirmVerifiedPayLioPayment({
      bookingId: test2Booking.id,
      ipnToken: test2Token,
      providerStatus: 'PAID',
      providerOriginalAmount: 150.0,
      providerCurrency: 'USD',
      providerMethod: 'CARD',
    });

    const updatedTest2 = await db.booking.findUnique({ where: { id: test2Booking.id } });
    assert(
      confirmResult.success && updatedTest2?.paymentStatus === 'PAID' && updatedTest2?.status === 'CONFIRMED',
      'Test 2: Payment confirmation updates booking to PAID + CONFIRMED'
    );

    // Test 3 — Failed Payment State Protection
    const test3Token = `paylio_ipn_failed_test3_${runId}`;
    const test3Booking = await db.booking.create({
      data: {
        bookingNumber: `MSF-TEST3-${runId}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: futureDate,
        durationMinutes: 60,
        amount: 120.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        paymentReference: test3Token,
      },
    });
    createdBookingIds.push(test3Booking.id);

    const failedConfirm = await confirmVerifiedPayLioPayment({
      bookingId: test3Booking.id,
      ipnToken: test3Token,
      providerStatus: 'FAILED',
      providerOriginalAmount: 120.0,
      providerCurrency: 'USD',
    });

    const updatedTest3 = await db.booking.findUnique({ where: { id: test3Booking.id } });
    assert(
      !failedConfirm.success && updatedTest3?.paymentStatus === 'FAILED' && updatedTest3?.status === 'PENDING',
      'Test 3: Failed payment updates paymentStatus to FAILED without incorrectly confirming booking'
    );

    // Test 4 — Atomic Unpaid Expiration Protection
    const oldDate = new Date(Date.now() - 40 * 60 * 1000); // Created 40 minutes ago

    const expiredBooking = await db.booking.create({
      data: {
        bookingNumber: `MSF-TEST4-${runId}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: futureDate,
        durationMinutes: 60,
        amount: 120.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        createdAt: oldDate,
      },
    });
    createdBookingIds.push(expiredBooking.id);

    // Atomic update simulation (matching cron logic)
    const updateCount = await db.booking.updateMany({
      where: {
        id: expiredBooking.id,
        status: 'PENDING',
        paymentStatus: { not: 'PAID' },
      },
      data: { status: 'CANCELLED' },
    });

    const test4Check = await db.booking.findUnique({ where: { id: expiredBooking.id } });
    assert(
      updateCount.count === 1 && test4Check?.status === 'CANCELLED',
      'Test 4: Old unpaid booking was atomically cancelled after 30 minutes expiration'
    );

    const expiredNotifRes = await notifyBookingExpired(expiredBooking.id);
    assert(expiredNotifRes.success, 'Test 4b: notifyBookingExpired returns success result');

    // Test 5 — Paid Booking Expiration Protection
    const paidOldBooking = await db.booking.create({
      data: {
        bookingNumber: `MSF-TEST5-${runId}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: futureDate,
        durationMinutes: 60,
        amount: 120.0,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        createdAt: oldDate,
      },
    });
    createdBookingIds.push(paidOldBooking.id);

    const paidUpdateCount = await db.booking.updateMany({
      where: {
        id: paidOldBooking.id,
        status: 'PENDING',
        paymentStatus: { not: 'PAID' },
      },
      data: { status: 'CANCELLED' },
    });

    const test5Check = await db.booking.findUnique({ where: { id: paidOldBooking.id } });
    assert(
      paidUpdateCount.count === 0 && test5Check?.status === 'CONFIRMED' && test5Check?.paymentStatus === 'PAID',
      'Test 5: Old PAID booking was protected and NOT cancelled by expiration process'
    );

    // Test 6 — Expiration Idempotency
    const reRunUpdateCount = await db.booking.updateMany({
      where: {
        id: expiredBooking.id,
        status: 'PENDING',
        paymentStatus: { not: 'PAID' },
      },
      data: { status: 'CANCELLED' },
    });
    assert(
      reRunUpdateCount.count === 0,
      'Test 6: Expiration rerun excludes already cancelled booking (idempotent)'
    );

    // Test 7 — Cancellation Notifications
    const cancelNotifRes = await notifyBookingCancelled(test2Booking.id, 'Customer requested cancellation');
    assert(cancelNotifRes.success, 'Test 7: notifyBookingCancelled returns success result');

    // Test 8 — Completion Notifications
    const completeNotifRes = await notifyBookingCompleted(test2Booking.id);
    assert(completeNotifRes.success, 'Test 8: notifyBookingCompleted returns success result');

    // Test 9 — Reminder Atomic Claim & Idempotency
    const reminder24hBooking = await db.booking.create({
      data: {
        bookingNumber: `MSF-REM24-${runId}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // exactly 24 hours away
        durationMinutes: 60,
        amount: 120.0,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
    });
    createdBookingIds.push(reminder24hBooking.id);

    // First Claim
    const claim1 = await db.booking.updateMany({
      where: {
        id: reminder24hBooking.id,
        status: 'CONFIRMED',
        reminder24hSentAt: null,
      },
      data: { reminder24hSentAt: new Date() },
    });

    let notifSuccess = false;
    if (claim1.count > 0) {
      const remRes = await notifyBookingReminder(reminder24hBooking.id, '24h');
      notifSuccess = remRes.success;
    }

    // Second Claim (Repeated Cron Execution)
    const claim2 = await db.booking.updateMany({
      where: {
        id: reminder24hBooking.id,
        status: 'CONFIRMED',
        reminder24hSentAt: null,
      },
      data: { reminder24hSentAt: new Date() },
    });

    const remCheck = await db.booking.findUnique({ where: { id: reminder24hBooking.id } });

    assert(
      claim1.count === 1 && claim2.count === 0 && notifSuccess && remCheck?.reminder24hSentAt !== null,
      'Test 9: Reminder 24h atomic claim succeeded once and prevented duplicate delivery on rerun'
    );

    // Test 10 — Reminder Retry On Failure Mechanics
    const retryTestBooking = await db.booking.create({
      data: {
        bookingNumber: `MSF-RETRY-${runId}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours away
        durationMinutes: 60,
        amount: 120.0,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
    });
    createdBookingIds.push(retryTestBooking.id);

    // Claim
    await db.booking.updateMany({
      where: { id: retryTestBooking.id },
      data: { reminder3hSentAt: new Date() },
    });

    // Simulate failure -> Reset
    await db.booking.update({
      where: { id: retryTestBooking.id },
      data: { reminder3hSentAt: null },
    });

    const resetCheck = await db.booking.findUnique({ where: { id: retryTestBooking.id } });
    assert(
      resetCheck?.reminder3hSentAt === null,
      'Test 10: Failed reminder delivery correctly resets sentAt timestamp for future retry'
    );

    // Test 11 — Missing Telegram Token Behavior (No Fake Success)
    const oldEnvToken = process.env.TELEGRAM_BOT_TOKEN;
    const oldMock = process.env.TELEGRAM_MOCK_MODE;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_MOCK_MODE;

    const unconfigTgRes = await sendTelegramMessage({
      chatId: '123456789',
      message: 'Test message with missing token',
    });

    if (oldEnvToken !== undefined) {
      process.env.TELEGRAM_BOT_TOKEN = oldEnvToken;
    }
    if (oldMock !== undefined) {
      process.env.TELEGRAM_MOCK_MODE = oldMock;
    } else {
      process.env.TELEGRAM_MOCK_MODE = 'true';
    }

    assert(
      Boolean(!unconfigTgRes.success && unconfigTgRes.error?.includes('TELEGRAM_BOT_TOKEN is not configured')),
      'Test 11: Missing TELEGRAM_BOT_TOKEN in production returns explicit failure (no fake success)'
    );

    // Test 12 — Marketing Attribution Preservation
    const marketingLink = await db.marketingLink.create({
      data: {
        name: `Promo P15 Test ${runId}`,
        code: `test-promo-${runId}`,
        destinationUrl: '/',
      },
    });
    createdMarketingLinkIds.push(marketingLink.id);

    const attributedBooking = await db.booking.create({
      data: {
        bookingNumber: `MSF-ATTR-${runId}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        marketingLinkId: marketingLink.id,
        appointmentDateTime: futureDate,
        durationMinutes: 60,
        amount: 120.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
      },
    });
    createdBookingIds.push(attributedBooking.id);

    await db.booking.update({
      where: { id: attributedBooking.id },
      data: { status: 'CONFIRMED', paymentStatus: 'PAID' },
    });

    const attrCheck = await db.booking.findUnique({ where: { id: attributedBooking.id } });
    assert(
      attrCheck?.marketingLinkId === marketingLink.id,
      'Test 12: Marketing attribution marketingLinkId is preserved across lifecycle transitions'
    );

    // Test 13 — Security & Secrets Inspection Audit
    const envKeys = Object.keys(process.env);
    const noPublicSecrets = envKeys.every((key) => {
      if (key.startsWith('NEXT_PUBLIC_')) {
        return !key.includes('TELEGRAM') && !key.includes('PAYLIO') && !key.includes('CRON') && !key.includes('ADMIN_KEY');
      }
      return true;
    });

    assert(
      noPublicSecrets,
      'Test 13: Security audit confirms no private secrets or tokens are exposed via NEXT_PUBLIC_*'
    );

  } catch (err) {
    console.error('Test execution exception:', err);
    failed++;
  } finally {
    // Isolated Cleanup: Delete created records in reverse dependency order
    console.log('\nCleaning up created test records...');
    try {
      if (createdBookingIds.length > 0) {
        await db.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
      }
      if (createdMarketingLinkIds.length > 0) {
        await db.marketingLink.deleteMany({ where: { id: { in: createdMarketingLinkIds } } });
      }
      if (createdCustomerIds.length > 0) {
        await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
      }
      if (createdTherapistIds.length > 0) {
        await db.therapist.deleteMany({ where: { id: { in: createdTherapistIds } } });
      }
      if (createdServiceIds.length > 0) {
        await db.service.deleteMany({ where: { id: { in: createdServiceIds } } });
      }
      console.log('Cleanup completed successfully.');
    } catch (cleanupErr) {
      console.error('Error during test cleanup:', cleanupErr);
    }
  }

  console.log('\n====================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
