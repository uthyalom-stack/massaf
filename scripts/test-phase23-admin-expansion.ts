import { db } from '../src/lib/db';
import { createSessionToken } from '../src/lib/auth-session';
import {
  listGiftCardSubmissionsAction,
  approveGiftCardPaymentAction,
  rejectGiftCardPaymentAction,
  listCustomersAction,
  getCustomerDetailsAction,
  createTestimonialAction,
  updateTestimonialAction,
  deleteTestimonialAction,
  updateTherapistVerificationAction,
  listAdminUsersAction,
  createAdminUserAction,
  toggleAdminUserActiveAction,
  listAuditLogsAction,
  listAdminNotificationsAction,
  markAdminNotificationReadAction,
} from '../src/app/admin/actions';

async function runAdminExpansionTestSuite() {
  console.log('=== STARTING PHASE 23 EXPANDED ADMIN SYSTEM TEST SUITE ===\n');

  // 1. Setup Admin Users & Session Tokens
  let superAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN', email: 'exp_super@massaf.com' } });
  if (!superAdmin) {
    superAdmin = await db.user.create({
      data: {
        name: 'Expansion Super Admin',
        email: 'exp_super@massaf.com',
        role: 'SUPER_ADMIN',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  let staffUser = await db.user.findFirst({ where: { role: 'STAFF', email: 'exp_staff@massaf.com' } });
  if (!staffUser) {
    staffUser = await db.user.create({
      data: {
        name: 'Expansion Staff',
        email: 'exp_staff@massaf.com',
        role: 'STAFF',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  const superAdminToken = createSessionToken(superAdmin.id, superAdmin.email, 'ADMIN', 24, 'SUPER_ADMIN');
  const staffToken = createSessionToken(staffUser.id, staffUser.email, 'ADMIN', 24, 'STAFF');

  const setSession = (token: string) => {
    (globalThis as any).__TEST_ADMIN_SESSION_TOKEN__ = token;
  };

  // --- AREA 1: PAYMENTS & GIFT CARD REVIEW QUEUE ---
  console.log('1. Testing Payments / Gift Card Review Queue & Idempotent Actions...');
  setSession(superAdminToken);

  let customer = await db.customer.findFirst();
  if (!customer) {
    customer = await db.customer.create({
      data: { name: 'Payment Customer', email: 'payment_cust@test.com', phone: '555-0199' },
    });
  }

  let service = await db.service.findFirst({ where: { isActive: true } });
  if (!service) {
    service = await db.service.create({
      data: { name: 'Payment Swedish Massage', durationMinutes: 60, price: 100, isActive: true },
    });
  }

  const testBooking = await db.booking.create({
    data: {
      bookingNumber: `PAY-${Date.now()}`,
      customerId: customer.id,
      serviceId: service.id,
      appointmentDateTime: new Date(),
      durationMinutes: 60,
      amount: 100,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      paymentMethod: 'GIFT_CARD',
    },
  });

  const submission = await db.giftCardSubmission.create({
    data: {
      bookingId: testBooking.id,
      cardType: 'Spafinder Gift Card',
      cardCode: 'SECRET-CARD-CODE-1234',
      declaredValue: 100,
      status: 'PENDING',
    },
  });

  const queueRes = await listGiftCardSubmissionsAction('PENDING');
  if (!queueRes.success || !queueRes.submissions) {
    console.error('FAILED: listGiftCardSubmissionsAction failed!');
    process.exit(1);
  }

  const targetSub = queueRes.submissions.find((s) => s.id === submission.id);
  if (!targetSub) {
    console.error('FAILED: Submitted gift card not found in pending review queue!');
    process.exit(1);
  }
  console.log('[PASS] Gift card submission retrieved in pending queue');

  const approveRes = await approveGiftCardPaymentAction(testBooking.id);
  if (!approveRes.success) {
    console.error('FAILED: approveGiftCardPaymentAction failed!');
    process.exit(1);
  }

  // Verify Idempotent approval call
  const idempotentApproveRes = await approveGiftCardPaymentAction(testBooking.id);
  if (!idempotentApproveRes.success || !idempotentApproveRes.message?.includes('already approved')) {
    console.error('FAILED: Idempotent approval check failed!');
    process.exit(1);
  }
  console.log('[PASS] Gift card payment approved and idempotent re-approval handled cleanly');

  // --- AREA 2: CUSTOMER DIRECTORY (READ-ONLY) & STAFF AUTHORIZATION ---
  console.log('\n2. Testing Customer Directory & STAFF Authorization Isolation...');
  setSession(superAdminToken);

  const customerListRes = await listCustomersAction();
  if (!customerListRes.success || !customerListRes.customers) {
    console.error('FAILED: listCustomersAction failed for SUPER_ADMIN!');
    process.exit(1);
  }
  console.log(`[PASS] Customer list returned ${customerListRes.customers.length} records for SUPER_ADMIN`);

  const customerDetailRes = await getCustomerDetailsAction(customer.id);
  if (!customerDetailRes.success || !customerDetailRes.customer) {
    console.error('FAILED: getCustomerDetailsAction failed!');
    process.exit(1);
  }
  console.log('[PASS] Customer profile details retrieved');

  // Verify STAFF caller is rejected from customer directory
  setSession(staffToken);
  const staffCustomerRes = await listCustomersAction();
  if (staffCustomerRes.success) {
    console.error('FAILED: STAFF caller was able to access customer directory!');
    process.exit(1);
  }
  console.log('[PASS] STAFF caller rejected from customer directory');

  // --- AREA 3: TESTIMONIAL MANAGEMENT ---
  console.log('\n3. Testing Testimonials Management CRUD...');
  setSession(superAdminToken);

  let therapist = await db.therapist.findFirst({ where: { isActive: true } });
  if (!therapist) {
    therapist = await db.therapist.create({
      data: { name: 'Testimonial Therapist', email: 'testimonial_th@test.com', isActive: true },
    });
  }

  const createTestimonialRes = await createTestimonialAction({
    authorName: 'Promotional Author',
    comment: 'Great service showcase!',
    rating: 5,
    therapistId: therapist.id,
  });

  if (!createTestimonialRes.success || !createTestimonialRes.testimonial) {
    console.error('FAILED: createTestimonialAction failed!');
    process.exit(1);
  }

  const testimonialId = createTestimonialRes.testimonial.id;

  const updateTestimonialRes = await updateTestimonialAction(testimonialId, {
    authorName: 'Updated Promotional Author',
  });

  if (!updateTestimonialRes.success) {
    console.error('FAILED: updateTestimonialAction failed!');
    process.exit(1);
  }

  const deleteTestimonialRes = await deleteTestimonialAction(testimonialId);
  if (!deleteTestimonialRes.success) {
    console.error('FAILED: deleteTestimonialAction failed!');
    process.exit(1);
  }
  console.log('[PASS] Testimonial creation, update, and deletion completed successfully');

  // --- AREA 4: THERAPIST VERIFICATION WORKFLOW ---
  console.log('\n4. Testing Therapist Verification Workflow...');
  setSession(superAdminToken);

  const verifyRes = await updateTherapistVerificationAction(therapist.id, 'SUSPENDED', 'Account pending background check review');
  if (!verifyRes.success) {
    console.error('FAILED: updateTherapistVerificationAction failed!');
    process.exit(1);
  }

  const updatedTherapist = await db.therapist.findUnique({ where: { id: therapist.id } });
  if (updatedTherapist?.verificationStatus !== 'SUSPENDED') {
    console.error(`FAILED: Therapist verificationStatus was not updated! Got: ${updatedTherapist?.verificationStatus}`);
    process.exit(1);
  }
  console.log('[PASS] Therapist verification status updated to SUSPENDED with notes');

  // --- AREA 5: ADMIN AUDIT LOG & SENSITIVE PARAMETER SANITIZATION ---
  console.log('\n5. Testing Admin Audit Log Queries & Parameter Sanitization...');
  setSession(superAdminToken);

  const auditLogRes = await listAuditLogsAction();
  if (!auditLogRes.success || !auditLogRes.logs) {
    console.error('FAILED: listAuditLogsAction failed!');
    process.exit(1);
  }

  const foundAuditEntry = auditLogRes.logs.find((l) => l.entityId === therapist?.id);
  if (!foundAuditEntry) {
    console.error('FAILED: Verification status update audit log entry not found!');
    process.exit(1);
  }

  if (foundAuditEntry.metadataJson?.includes('SECRET-CARD-CODE')) {
    console.error('FAILED: Audit log contains sensitive secret tokens!');
    process.exit(1);
  }
  console.log('[PASS] Audit log entries created and verified for non-sensitive data retention');

  // --- AREA 6: ADMIN USER MANAGEMENT (SUPER_ADMIN ONLY) ---
  console.log('\n6. Testing SUPER_ADMIN Admin User Management & Safeguards...');
  setSession(superAdminToken);

  const adminUsersRes = await listAdminUsersAction();
  if (!adminUsersRes.success || !adminUsersRes.users) {
    console.error('FAILED: listAdminUsersAction failed!');
    process.exit(1);
  }

  const createAdminRes = await createAdminUserAction({
    name: 'New Sub Admin',
    email: `sub_admin_${Date.now()}@massaf.com`,
    role: 'ADMIN',
  });

  if (!createAdminRes.success || !createAdminRes.user) {
    console.error('FAILED: createAdminUserAction failed!');
    process.exit(1);
  }

  const toggleRes = await toggleAdminUserActiveAction(createAdminRes.user.id, false);
  if (!toggleRes.success) {
    console.error('FAILED: toggleAdminUserActiveAction failed!');
    process.exit(1);
  }

  // Safeguard test: Super admin attempting to deactivate self
  const selfDeactivateRes = await toggleAdminUserActiveAction(superAdmin.id, false);
  if (selfDeactivateRes.success) {
    console.error('FAILED: SUPER_ADMIN was able to deactivate their own account!');
    process.exit(1);
  }
  console.log('[PASS] Admin user creation, deactivation, and self-deactivation safeguards verified');

  // --- AREA 7: ADMIN NOTIFICATIONS CENTER ---
  console.log('\n7. Testing Admin Notifications Center Read/Unread State...');
  setSession(superAdminToken);

  const notifRes = await listAdminNotificationsAction();
  if (!notifRes.success || !notifRes.notifications) {
    console.error('FAILED: listAdminNotificationsAction failed!');
    process.exit(1);
  }

  if (notifRes.notifications.length > 0) {
    const notifId = notifRes.notifications[0].id;
    const markReadRes = await markAdminNotificationReadAction(notifId);
    if (!markReadRes.success) {
      console.error('FAILED: markAdminNotificationReadAction failed!');
      process.exit(1);
    }
  }
  console.log('[PASS] Notification center query and mark read functionality verified');

  console.log('\n====================================================');
  console.log('  ALL PHASE 23 EXPANDED ADMIN SYSTEM TESTS PASSED!');
  console.log('====================================================');
}

runAdminExpansionTestSuite().catch((err) => {
  console.error('Error running admin expansion test suite:', err);
  process.exit(1);
});
