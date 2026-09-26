process.env.MASSAF_AUTH_SECRET = 'test-secret-key-for-hmac-signing';

import { db } from '../src/lib/db';
import { createSessionToken } from '../src/lib/auth-session';

async function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

async function runRemainingFeaturesTestSuite() {
  console.log('====================================================');
  console.log('  STARTING PHASE 25 REMAINING FEATURES TEST SUITE');
  console.log('====================================================\n');

  try {
    const timestamp = Date.now();
    const custEmailA = `phase25-custA-${timestamp}@massaf.com`;
    const custEmailB = `phase25-custB-${timestamp}@massaf.com`;
    const thEmail = `phase25-th-${timestamp}@massaf.com`;

    // 1. Create Test Entities in Database
    const customerA = await db.customer.create({
      data: { name: 'Customer Alpha', email: custEmailA, phone: '555-0101' },
    });

    const customerB = await db.customer.create({
      data: { name: 'Customer Beta', email: custEmailB, phone: '555-0102' },
    });

    const therapist = await db.therapist.create({
      data: {
        name: 'Specialist Therapist',
        email: thEmail,
        hourlyRate: 120.0,
        offersStudio: true,
        offersInHome: true,
        verificationStatus: 'VERIFIED',
      },
    });

    const service = await db.service.create({
      data: {
        name: 'Deep Tissue Relief Massage',
        description: 'Targeted deep muscle therapy',
        durationMinutes: 60,
        price: 120.0,
      },
    });

    // Attach service to therapist
    await db.therapistService.create({
      data: {
        therapistId: therapist.id,
        serviceId: service.id,
      },
    });

    // Create recurring daily schedule windows (Sunday - Saturday)
    for (let day = 0; day <= 6; day++) {
      await db.therapistAvailability.create({
        data: {
          therapistId: therapist.id,
          dayOfWeek: day,
          startTime: '08:00',
          endTime: '20:00',
        },
      });
    }

    // Generate Session Cookies
    const custCookieA = `massaf_customer_session=${createSessionToken(
      customerA.id,
      customerA.email,
      'CUSTOMER'
    )}`;

    const custCookieB = `massaf_customer_session=${createSessionToken(
      customerB.id,
      customerB.email,
      'CUSTOMER'
    )}`;

    const thCookie = `massaf_therapist_session=${createSessionToken(
      therapist.id,
      therapist.email || '',
      'THERAPIST'
    )}`;

    // 2. Create Booking for Customer A
    const apptDate = new Date(Date.now() + 48 * 3600 * 1000); // 48 hours in future
    const bookingA = await db.booking.create({
      data: {
        bookingNumber: `TEST-${timestamp}-A`,
        customerId: customerA.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: apptDate,
        durationMinutes: 60,
        locationType: 'STUDIO',
        amount: 120.0,
        hourlyRateUsed: 120.0,
        calculatedTotal: 120.0,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
    });

    // --- TEST 1: Booking Details Security ---
    const { GET: getBookingDetails } = await import('../src/app/api/bookings/details/route');

    // Customer A (Owner) fetches details -> 200
    const reqOwner = new Request(`http://localhost:3000/api/bookings/details?id=${bookingA.id}`, {
      headers: { cookie: custCookieA },
    });
    const resOwner = await getBookingDetails(reqOwner);
    await assert(resOwner.status === 200, 'Customer owner can access own booking details (200)');
    const ownerData = await resOwner.json();
    await assert(ownerData.booking.canReschedule === true, 'Reschedule eligibility flag is true for confirmed future booking');

    // Customer B (Unrelated) fetches details -> 401 Unauthorized
    const reqUnrelated = new Request(`http://localhost:3000/api/bookings/details?id=${bookingA.id}`, {
      headers: { cookie: custCookieB },
    });
    const resUnrelated = await getBookingDetails(reqUnrelated);
    await assert(resUnrelated.status === 401, 'Unrelated customer cannot access another customer booking details (401)');

    // --- TEST 2: Customer Rescheduling ---
    const { POST: rescheduleBooking } = await import('../src/app/api/account/bookings/reschedule/route');

    const newRescheduleDateStr = new Date(Date.now() + 72 * 3600 * 1000).toISOString().split('T')[0];
    const reqReschedule = new Request('http://localhost:3000/api/account/bookings/reschedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: custCookieA },
      body: JSON.stringify({
        bookingId: bookingA.id,
        date: newRescheduleDateStr,
        time: '14:00',
      }),
    });
    const resReschedule = await rescheduleBooking(reqReschedule);
    if (resReschedule.status !== 200) {
      console.log('Reschedule failed response:', await resReschedule.json());
    }
    await assert(resReschedule.status === 200, 'Customer owner can reschedule eligible appointment (200)');

    // Verify audit log created
    const auditReschedule = await db.adminAuditLog.findFirst({
      where: { entityId: bookingA.id, action: 'BOOKING_RESCHEDULED_BY_CUSTOMER' },
    });
    await assert(!!auditReschedule, 'Audit log entry created for customer reschedule event');

    // --- TEST 3: Customer Cancellation ---
    const { POST: cancelBooking } = await import('../src/app/api/account/bookings/cancel/route');

    const reqCancel = new Request('http://localhost:3000/api/account/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: custCookieA },
      body: JSON.stringify({
        bookingId: bookingA.id,
        reason: 'Schedule conflict',
      }),
    });
    const resCancel = await cancelBooking(reqCancel);
    await assert(resCancel.status === 200, 'Customer owner can cancel eligible appointment (200)');

    const updatedBookingA = await db.booking.findUnique({ where: { id: bookingA.id } });
    await assert(updatedBookingA?.status === 'CANCELLED', 'Booking status updated to CANCELLED');
    await assert(updatedBookingA?.paymentStatus === 'PAID', 'Payment status preserved truthfully as PAID');

    // Attempting to cancel already cancelled booking returns 200 with message (idempotency)
    const reqCancelIdempotent = new Request('http://localhost:3000/api/account/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: custCookieA },
      body: JSON.stringify({
        bookingId: bookingA.id,
        reason: 'Schedule conflict',
      }),
    });
    const resCancelIdempotent = await cancelBooking(reqCancelIdempotent);
    await assert(resCancelIdempotent.status === 200, 'Repeated cancellation request executes idempotently (200)');

    // --- TEST 4: 30-Minute Unpaid Booking Expiration & Cron Jobs ---
    const staleDate = new Date(Date.now() - 40 * 60 * 1000); // 40 minutes ago
    const staleUnpaidBooking = await db.booking.create({
      data: {
        bookingNumber: `STALE-${timestamp}`,
        customerId: customerB.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: new Date(Date.now() + 24 * 3600 * 1000),
        durationMinutes: 60,
        amount: 120.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        createdAt: staleDate,
      },
    });

    process.env.CRON_SECRET = 'test-cron-secret-123';
    const { GET: runCron } = await import('../src/app/api/cron/scheduled-jobs/route');

    const reqCron = new Request('http://localhost:3000/api/cron/scheduled-jobs', {
      headers: { authorization: 'Bearer test-cron-secret-123' },
    });
    const resCron = await runCron(reqCron);
    await assert(resCron.status === 200, 'Scheduled jobs cron endpoint executed with valid secret (200)');

    const expiredBooking = await db.booking.findUnique({ where: { id: staleUnpaidBooking.id } });
    await assert(expiredBooking?.status === 'CANCELLED', 'Unpaid PENDING booking created 40 mins ago was automatically expired');

    // --- TEST 5: Therapist Appointment Management ---
    const therapistAppt = await db.booking.create({
      data: {
        bookingNumber: `TH-APPT-${timestamp}`,
        customerId: customerA.id,
        therapistId: therapist.id,
        serviceId: service.id,
        appointmentDateTime: new Date(Date.now() + 12 * 3600 * 1000),
        durationMinutes: 60,
        amount: 120.0,
        status: 'ASSIGNED',
        paymentStatus: 'PAID',
      },
    });

    const { PUT: updateTherapistAppt } = await import('../src/app/api/therapist/appointments/route');

    // Therapist updates status to IN_PROGRESS
    const reqProgress = new Request('http://localhost:3000/api/therapist/appointments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: thCookie },
      body: JSON.stringify({ bookingId: therapistAppt.id, status: 'IN_PROGRESS' }),
    });
    const resProgress = await updateTherapistAppt(reqProgress);
    await assert(resProgress.status === 200, 'Assigned therapist can update status to IN_PROGRESS (200)');

    // Therapist updates status to COMPLETED
    const reqCompleted = new Request('http://localhost:3000/api/therapist/appointments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: thCookie },
      body: JSON.stringify({ bookingId: therapistAppt.id, status: 'COMPLETED' }),
    });
    const resCompleted = await updateTherapistAppt(reqCompleted);
    await assert(resCompleted.status === 200, 'Assigned therapist can update status to COMPLETED (200)');

    // --- TEST 6: Post-Completion Review Submission ---
    const { POST: submitReview } = await import('../src/app/api/reviews/route');

    // Customer A submits review for completed booking
    const reqReview = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: custCookieA },
      body: JSON.stringify({
        bookingId: therapistAppt.id,
        rating: 5,
        comment: 'Outstanding massage session!',
      }),
    });
    const resReview = await submitReview(reqReview);
    await assert(resReview.status === 201, 'Customer owner can submit review for COMPLETED appointment (201)');

    // Attempting duplicate review -> 409 Conflict
    const reqDuplicateReview = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: custCookieA },
      body: JSON.stringify({
        bookingId: therapistAppt.id,
        rating: 5,
        comment: 'Outstanding massage session!',
      }),
    });
    const resDuplicateReview = await submitReview(reqDuplicateReview);
    await assert(resDuplicateReview.status === 409, 'Duplicate review for same booking rejected with 409 Conflict');

    // --- TEST 7: Customer Support Requests ---
    const { POST: createSupport, GET: listSupport, PUT: updateSupport } = await import('../src/app/api/support/route');

    const reqSupportPost = new Request('http://localhost:3000/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: custCookieA },
      body: JSON.stringify({
        category: 'Booking Help',
        subject: 'Need help with appointment time',
        message: 'Could you confirm if therapist has parking available?',
        bookingReference: therapistAppt.bookingNumber,
      }),
    });
    const resSupportPost = await createSupport(reqSupportPost);
    await assert(resSupportPost.status === 201, 'Customer can submit support request ticket (201)');
    const supportData = await resSupportPost.json();

    // Admin lists support tickets
    const adminUser = await db.user.create({
      data: {
        email: `admin-support-${timestamp}@massaf.com`,
        name: 'Admin Tester',
        role: 'ADMIN',
        isActive: true,
      },
    });

    const adminCookie = `massaf_admin_session=${createSessionToken(
      adminUser.id,
      adminUser.email,
      'ADMIN',
      24,
      'ADMIN'
    )}`;

    const reqSupportGet = new Request('http://localhost:3000/api/support', {
      headers: { cookie: adminCookie },
    });
    const resSupportGet = await listSupport(reqSupportGet);
    await assert(resSupportGet.status === 200, 'Admin can view all customer support tickets (200)');

    // Admin updates support ticket status
    const reqSupportPut = new Request('http://localhost:3000/api/support', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        id: supportData.supportRequest.id,
        status: 'RESOLVED',
      }),
    });
    const resSupportPut = await updateSupport(reqSupportPut);
    await assert(resSupportPut.status === 200, 'Admin can update support request ticket status (200)');

    console.log('\n====================================================');
    console.log('  PHASE 25 REMAINING FEATURES SUITE: ALL PASSED');
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test suite failed:', err);
    process.exit(1);
  }
}

runRemainingFeaturesTestSuite();
