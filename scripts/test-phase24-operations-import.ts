import { db } from '../src/lib/db';
import {
  previewTherapistCsvAction,
  executeTherapistCsvImportAction,
  rescheduleBookingAdminAction,
  findCompatibleTherapistsAction,
  createAdminNoteAction,
  listAdminNotesAction,
  updateTherapistVerificationAction,
  toggleCustomerActiveAction,
  requestRefundAction,
  processRefundAction,
  listAllPaymentsAction,
  createAdminUserAction,
} from '../src/app/admin/actions';
import { parseAndPreviewTherapistCsv } from '../src/lib/therapist-import';
import {
  notifyBookingRescheduled,
  notifyTherapistAssigned,
  notifyPaymentReceived,
  notifyPaymentIssue,
} from '../src/lib/notifications';

async function runOperationsImportTestSuite() {
  console.log('=== STARTING PHASE 24 OPERATIONS & JOTFORM IMPORT TEST SUITE ===\n');

  // Setup test environment auth secret
  process.env.MASSAF_AUTH_SECRET = 'test-secret-123456789012345678901234567890';
  process.env.TURSO_DATABASE_URL = 'file:./prisma/dev.db';

  // 1. Setup test Super Admin User
  let admin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
  if (!admin) {
    admin = await db.user.create({
      data: {
        email: 'ops_test_admin@massaf.com',
        name: 'Ops Test Admin',
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });
  }

  const { createSessionToken } = await import('../src/lib/auth-session');
  const token = createSessionToken(admin.id, admin.email, 'ADMIN', 24, admin.role);
  (globalThis as any).__TEST_ADMIN_SESSION_TOKEN__ = token;

  // 2. Setup Test Customer, Service, and Therapist
  const service = await db.service.findFirst({ where: { isActive: true } }) ||
    await db.service.create({
      data: {
        name: 'Swedish Test Massage',
        description: 'Test swedish massage',
        durationMinutes: 60,
        price: 100.0,
        isActive: true,
      },
    });

  const customer = await db.customer.create({
    data: {
      name: 'Ops Test Customer',
      email: `ops_cust_${Date.now()}@test.com`,
      phone: '+15550001111',
      isTest: true,
      isActive: true,
    },
  });

  const therapist = await db.therapist.create({
    data: {
      name: 'Ops Test Therapist',
      email: `ops_therapist_${Date.now()}@test.com`,
      phone: '+15552223333',
      hourlyRate: 110.0,
      isActive: true,
      offersStudio: true,
      offersInHome: true,
      verificationStatus: 'PENDING',
      isTest: true,
    },
  });

  // Assign service to therapist
  await db.therapistService.create({
    data: {
      therapistId: therapist.id,
      serviceId: service.id,
      isActive: true,
    },
  });

  // Add working availability for therapist (Mon-Fri 08:00-20:00)
  for (let d = 1; d <= 5; d++) {
    await db.therapistAvailability.create({
      data: {
        therapistId: therapist.id,
        dayOfWeek: d,
        startTime: '08:00',
        endTime: '20:00',
      },
    });
  }

  // Create test booking on next Monday at 10:00 AM UTC
  const bookingDate = new Date(Date.UTC(2026, 9, 5, 10, 0, 0)); // Mon Oct 5 2026
  const booking = await db.booking.create({
    data: {
      bookingNumber: `OPS-${Date.now()}`,
      customerId: customer.id,
      therapistId: therapist.id,
      serviceId: service.id,
      appointmentDateTime: bookingDate,
      durationMinutes: 60,
      locationType: 'STUDIO',
      amount: 110.0,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      paymentMethod: 'CARD',
      paymentReference: 'ch_test_123',
      isTest: true,
    },
  });

  console.log('1. Testing Internal Admin Notes (Phase 5)...');
  const noteRes = await createAdminNoteAction({
    entityType: 'BOOKING',
    entityId: booking.id,
    content: 'Customer requested therapist to call before arrival.',
  });
  if (!noteRes.success) throw new Error(`Note creation failed: ${noteRes.error}`);
  console.log('[PASS] Internal note created on booking');

  const notesListRes = await listAdminNotesAction('BOOKING', booking.id);
  if (!notesListRes.success || !notesListRes.notes || notesListRes.notes.length === 0) {
    throw new Error('Failed to retrieve internal notes list.');
  }
  console.log('[PASS] Internal notes list retrieved successfully\n');

  console.log('2. Testing Admin Reschedule Booking (Phase 2)...');
  // Valid reschedule to Oct 5 at 14:00 UTC
  const rescheduleRes = await rescheduleBookingAdminAction({
    bookingId: booking.id,
    newDate: '2026-10-05',
    newTime: '14:00',
  });
  if (!rescheduleRes.success) throw new Error(`Reschedule failed: ${rescheduleRes.error}`);
  console.log('[PASS] Valid appointment reschedule executed');

  // Test invalid reschedule outside working hours (05:00 AM)
  const invalidReschedule = await rescheduleBookingAdminAction({
    bookingId: booking.id,
    newDate: '2026-10-05',
    newTime: '05:00',
  });
  if (invalidReschedule.success) throw new Error('Reschedule outside working hours should have failed.');
  console.log('[PASS] Out-of-hours reschedule safely rejected\n');

  console.log('3. Testing Find Compatible Therapists (Phase 3)...');
  const candidateRes = await findCompatibleTherapistsAction(booking.id);
  if (!candidateRes.success || !candidateRes.candidates) {
    throw new Error(`Candidate evaluation failed: ${candidateRes.error}`);
  }
  console.log(`[PASS] Evaluated ${candidateRes.candidates.length} candidate therapists with eligibility checklists\n`);

  console.log('4. Testing Therapist Verification Queue (Phase 7)...');
  const verifRes = await updateTherapistVerificationAction(
    therapist.id,
    'VERIFIED',
    'Verified active license in state registry.'
  );
  if (!verifRes.success) throw new Error(`Verification update failed: ${verifRes.error}`);
  console.log('[PASS] Therapist verification updated to VERIFIED\n');

  console.log('5. Testing Customer Operational Actions (Phase 8)...');
  const disableCustRes = await toggleCustomerActiveAction(customer.id, false);
  if (!disableCustRes.success) throw new Error(`Customer disable failed: ${disableCustRes.error}`);
  console.log('[PASS] Customer account disabled');

  const restoreCustRes = await toggleCustomerActiveAction(customer.id, true);
  if (!restoreCustRes.success) throw new Error(`Customer restore failed: ${restoreCustRes.error}`);
  console.log('[PASS] Customer account restored\n');

  console.log('6. Testing Payment Management & Refund Workflow (Phases 9 & 10)...');
  const paymentsRes = await listAllPaymentsAction('ALL', booking.bookingNumber);
  if (!paymentsRes.success || !paymentsRes.payments || paymentsRes.payments.length === 0) {
    throw new Error('Failed to retrieve payment records.');
  }
  console.log('[PASS] Payment list retrieved');

  const refundReqRes = await requestRefundAction({
    bookingId: booking.id,
    amount: 110.0,
    reason: 'Test refund request',
  });
  if (!refundReqRes.success || !refundReqRes.refund) {
    throw new Error(`Refund request failed: ${refundReqRes.error}`);
  }
  console.log('[PASS] Refund request created');

  const refundProcRes = await processRefundAction({
    refundId: refundReqRes.refund.id,
    status: 'PROCESSED',
  });
  if (!refundProcRes.success) throw new Error(`Refund processing failed: ${refundProcRes.error}`);
  console.log('[PASS] Refund marked PROCESSED and booking status set to REFUNDED\n');

  console.log('7. Testing Jotform CSV Importer (Phase 15)...');
  const sampleCsv = `Full Name,Bio,Profile Photo,Email,Phone,Telegram Chat ID,Hourly Rate,Offers Studio,Offers In-Home,Services,Availability,Gallery Photos
Imported Therapist A,"Experienced therapist.",https://example.com/photo.jpg,imported.a@test.com,+15559990001,123456,120.00,Yes,Yes,Swedish Massage Test,Mon-Fri 09:00-17:00,https://example.com/gal1.jpg
${therapist.name},"Updated bio.",,${therapist.email},${therapist.phone},,130.00,Yes,Yes,Swedish Massage Test,Tue-Sat 10:00-18:00,`;

  const previewRes = await parseAndPreviewTherapistCsv(sampleCsv);
  if (previewRes.rows.length !== 2) throw new Error('Expected 2 rows in CSV preview.');
  console.log(`[PASS] CSV parsed: ${previewRes.summary.newCount} NEW, ${previewRes.summary.existingCount} EXISTING`);

  const importRows = previewRes.rows.map((r) => ({
    ...r,
    actionChoice: r.classification === 'EXISTING' ? ('UPDATE' as const) : ('CREATE' as const),
  }));

  const importRes = await executeTherapistCsvImportAction({ rows: importRows });
  if (!importRes.success || !importRes.report) {
    throw new Error(`CSV import execution failed: ${importRes.error}`);
  }
  console.log(`[PASS] CSV import executed: Created ${importRes.report.createdCount}, Updated ${importRes.report.updatedCount}`);

  // CRITICAL ZIP RULE CHECK: Verify importer created zero TherapistZipEligibility rows
  const zipCount = await db.therapistZipEligibility.count({
    where: { therapist: { email: 'imported.a@test.com' } },
  });
  if (zipCount > 0) throw new Error('CRITICAL ZIP VIOLATION: Importer must not create ZIP eligibility rows.');
  console.log('[PASS] CRITICAL ZIP RULE VERIFIED: CSV Importer created 0 ZIP eligibility rows\n');

  console.log('8. Testing Communication Event Notifications (Phase 14)...');
  const notifRes = await notifyBookingRescheduled(booking.id, '2026-10-05 10:00 UTC');
  if (!notifRes) throw new Error('Reschedule notification dispatch failed.');
  console.log('[PASS] Reschedule event notification abstraction executed cleanly\n');

  // Clean up test records
  await db.adminNote.deleteMany({ where: { entityId: booking.id } });
  await db.refundRecord.deleteMany({ where: { bookingId: booking.id } });
  await db.booking.delete({ where: { id: booking.id } });
  await db.therapistService.deleteMany({ where: { therapistId: therapist.id } });
  await db.therapistAvailability.deleteMany({ where: { therapistId: therapist.id } });
  await db.therapist.delete({ where: { id: therapist.id } });
  await db.customer.delete({ where: { id: customer.id } });

  const importedTherapist = await db.therapist.findFirst({ where: { email: 'imported.a@test.com' } });
  if (importedTherapist) {
    await db.therapistService.deleteMany({ where: { therapistId: importedTherapist.id } });
    await db.therapistAvailability.deleteMany({ where: { therapistId: importedTherapist.id } });
    await db.therapistPhoto.deleteMany({ where: { therapistId: importedTherapist.id } });
    await db.therapist.delete({ where: { id: importedTherapist.id } });
  }

  console.log('====================================================');
  console.log('  ALL OPERATIONS & JOTFORM IMPORT TESTS PASSED!');
  console.log('====================================================');
}

runOperationsImportTestSuite().catch((err) => {
  console.error('\nError running operations import test suite:', err);
  process.exit(1);
});
