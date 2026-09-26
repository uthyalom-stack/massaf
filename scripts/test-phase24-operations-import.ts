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
} from '../src/app/admin/actions';
import { parseAndPreviewTherapistCsv, parseAvailabilityScheduleString } from '../src/lib/therapist-import';
import { notifyBookingRescheduled } from '../src/lib/notifications';

async function runOperationsImportTestSuite() {
  console.log('=== STARTING PHASE 24 OPERATIONS & CSV IMPORT EDGE CASES TEST SUITE ===\n');

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

  // 2. Setup Test Customer, Service, and Therapists
  const service = (await db.service.findFirst({ where: { isActive: true } })) ||
    (await db.service.create({
      data: {
        name: 'Swedish Test Massage',
        description: 'Test swedish massage',
        durationMinutes: 60,
        price: 100.0,
        isActive: true,
      },
    }));

  const customer = await db.customer.create({
    data: {
      name: 'Ops Test Customer',
      email: `ops_cust_${Date.now()}@test.com`,
      phone: '+15550001111',
      isTest: true,
      isActive: true,
    },
  });

  const pendingTherapist = await db.therapist.create({
    data: {
      name: 'Pending Test Therapist',
      email: `pending_therapist_${Date.now()}@test.com`,
      phone: '+15552223333',
      hourlyRate: 110.0,
      isActive: true,
      offersStudio: true,
      offersInHome: true,
      verificationStatus: 'PENDING',
      isTest: true,
    },
  });

  const verifiedTherapist = await db.therapist.create({
    data: {
      name: 'Verified Test Therapist',
      email: `verified_therapist_${Date.now()}@test.com`,
      phone: '+15554445555',
      hourlyRate: 115.0,
      isActive: true,
      offersStudio: true,
      offersInHome: true,
      verificationStatus: 'VERIFIED',
      isTest: true,
    },
  });

  await db.therapistService.createMany({
    data: [
      { therapistId: pendingTherapist.id, serviceId: service.id, isActive: true },
      { therapistId: verifiedTherapist.id, serviceId: service.id, isActive: true },
    ],
  });

  for (let d = 1; d <= 5; d++) {
    await db.therapistAvailability.createMany({
      data: [
        { therapistId: pendingTherapist.id, dayOfWeek: d, startTime: '08:00', endTime: '20:00' },
        { therapistId: verifiedTherapist.id, dayOfWeek: d, startTime: '08:00', endTime: '20:00' },
      ],
    });
  }

  const bookingDate = new Date(Date.UTC(2026, 9, 5, 10, 0, 0));
  const booking = await db.booking.create({
    data: {
      bookingNumber: `OPS-${Date.now()}`,
      customerId: customer.id,
      therapistId: verifiedTherapist.id,
      serviceId: service.id,
      appointmentDateTime: bookingDate,
      durationMinutes: 60,
      locationType: 'STUDIO',
      amount: 115.0,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      paymentMethod: 'CARD',
      paymentReference: 'ch_test_123',
      isTest: true,
    },
  });

  console.log('1. Testing Candidate Matcher VERIFIED Strictness (Phase 3 & 7)...');
  const candidateRes = await findCompatibleTherapistsAction(booking.id);
  if (!candidateRes.success || !candidateRes.candidates) {
    throw new Error(`Candidate evaluation failed: ${candidateRes.error}`);
  }

  const pendingEval = candidateRes.candidates.find((c) => c.therapistId === pendingTherapist.id);
  if (!pendingEval || pendingEval.isCompatible) {
    throw new Error('VERIFICATION VIOLATION: PENDING therapist must be rejected by candidate matcher.');
  }
  console.log('[PASS] PENDING verification therapist correctly rejected by compatibility matcher');

  const verifiedEval = candidateRes.candidates.find((c) => c.therapistId === verifiedTherapist.id);
  if (!verifiedEval || !verifiedEval.isCompatible) {
    throw new Error('VERIFIED therapist should have been marked eligible.');
  }
  console.log('[PASS] VERIFIED therapist correctly marked eligible\n');

  console.log('2. Testing Internal Admin Notes (Phase 5)...');
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

  console.log('3. Testing Admin Reschedule Booking (Phase 2)...');
  const rescheduleRes = await rescheduleBookingAdminAction({
    bookingId: booking.id,
    newDate: '2026-10-05',
    newTime: '14:00',
  });
  if (!rescheduleRes.success) throw new Error(`Reschedule failed: ${rescheduleRes.error}`);
  console.log('[PASS] Valid appointment reschedule executed');

  const invalidReschedule = await rescheduleBookingAdminAction({
    bookingId: booking.id,
    newDate: '2026-10-05',
    newTime: '05:00',
  });
  if (invalidReschedule.success) throw new Error('Reschedule outside working hours should have failed.');
  console.log('[PASS] Out-of-hours reschedule safely rejected\n');

  console.log('4. Testing CSV Importer Edge Cases & Unmatched Service Guard...');

  // Test 4a: Unmatched Service Guard
  const unmatchedCsv = `Full Name,Bio,Profile Photo,Email,Phone,Telegram Chat ID,Hourly Rate,Offers Studio,Offers In-Home,Services,Availability,Gallery Photos
Unmatched Service Therapist,"Bio",,unmatched@test.com,+15559998888,,120.00,Yes,Yes,Nonexistent Service,Mon-Fri 09:00-17:00,`;

  const previewUnmatched = await parseAndPreviewTherapistCsv(unmatchedCsv);
  const unmatchedRow = previewUnmatched.rows[0];
  const execUnmatchedRes = await executeTherapistCsvImportAction({
    rows: [{ ...unmatchedRow, actionChoice: 'CREATE' }],
  });

  if (!execUnmatchedRes.success || !execUnmatchedRes.report || execUnmatchedRes.report.failedCount !== 1) {
    throw new Error('UNMATCHED SERVICE VIOLATION: Row with unmatched service must fail execution instead of silently omitting services.');
  }
  console.log('[PASS] Row with unmatched service correctly failed execution with explicit error report');

  // Test 4b: Multiple Unmatched Services
  const multiUnmatchedCsv = `Full Name,Bio,Profile Photo,Email,Phone,Telegram Chat ID,Hourly Rate,Offers Studio,Offers In-Home,Services,Availability,Gallery Photos
Multi Unmatched Therapist,"Bio",,multi@test.com,+15559998889,,120.00,Yes,Yes,Fake Service A, Fake Service B,Mon-Fri 09:00-17:00,`;

  const previewMultiUnmatched = await parseAndPreviewTherapistCsv(multiUnmatchedCsv);
  const execMultiUnmatchedRes = await executeTherapistCsvImportAction({
    rows: [{ ...previewMultiUnmatched.rows[0], actionChoice: 'CREATE' }],
  });
  if (!execMultiUnmatchedRes.success || !execMultiUnmatchedRes.report || execMultiUnmatchedRes.report.failedCount !== 1) {
    throw new Error('Multiple unmatched services must fail row execution.');
  }
  console.log('[PASS] Row with multiple unmatched services correctly rejected');

  // Test 4c: Target Therapist Deleted Between Preview and Execution
  const deletedTargetRes = await executeTherapistCsvImportAction({
    rows: [
      {
        rowNumber: 1,
        name: 'Ghost Therapist',
        hourlyRate: 100.0,
        offersStudio: true,
        offersInHome: true,
        matchedServiceIds: [service.id],
        parsedAvailabilities: [],
        galleryPhotos: [],
        classification: 'EXISTING',
        existingTherapistId: 'nonexistent-therapist-id-123',
        actionChoice: 'UPDATE',
      },
    ],
  });
  if (!deletedTargetRes.success || !deletedTargetRes.report || deletedTargetRes.report.failedCount !== 1) {
    throw new Error('UPDATE on deleted target therapist ID must fail execution cleanly.');
  }
  console.log('[PASS] Target therapist deleted prior to execution correctly failed with error');

  // Test 4d: Duplicate Email Appearing After Preview
  const duplicateEmailRes = await executeTherapistCsvImportAction({
    rows: [
      {
        rowNumber: 1,
        name: 'Duplicate Email Therapist',
        email: verifiedTherapist.email,
        hourlyRate: 100.0,
        offersStudio: true,
        offersInHome: true,
        matchedServiceIds: [service.id],
        parsedAvailabilities: [],
        galleryPhotos: [],
        classification: 'NEW',
        actionChoice: 'CREATE',
      },
    ],
  });
  if (!duplicateEmailRes.success || !duplicateEmailRes.report || duplicateEmailRes.report.failedCount !== 1) {
    throw new Error('CREATE with duplicate email created after preview must fail execution.');
  }
  console.log('[PASS] Duplicate email created after preview correctly caught and failed');

  // Test 4e: Duplicate Phone Appearing After Preview
  const duplicatePhoneRes = await executeTherapistCsvImportAction({
    rows: [
      {
        rowNumber: 1,
        name: 'Duplicate Phone Therapist',
        phone: verifiedTherapist.phone,
        hourlyRate: 100.0,
        offersStudio: true,
        offersInHome: true,
        matchedServiceIds: [service.id],
        parsedAvailabilities: [],
        galleryPhotos: [],
        classification: 'NEW',
        actionChoice: 'CREATE',
      },
    ],
  });
  if (!duplicatePhoneRes.success || !duplicatePhoneRes.report || duplicatePhoneRes.report.failedCount !== 1) {
    throw new Error('CREATE with duplicate phone created after preview must fail execution.');
  }
  console.log('[PASS] Duplicate phone created after preview correctly caught and failed');

  // Test 4e2: DB Unique Constraint Conflict During CREATE (Concurrency Race Condition Test)
  // Simulate DB unique constraint error on row 1 while row 2 succeeds
  const raceTestEmail = `race_test_${Date.now()}@test.com`;
  const raceTherapistInDb = await db.therapist.create({
    data: {
      name: 'Existing Race Therapist',
      email: raceTestEmail,
      hourlyRate: 100.0,
      isActive: true,
      isTest: true,
    },
  });

  const concurrentRaceRes = await executeTherapistCsvImportAction({
    rows: [
      {
        rowNumber: 1,
        name: 'Concurrent Race Therapist 1',
        email: raceTestEmail, // Will trigger unique constraint or pre-check
        hourlyRate: 100.0,
        offersStudio: true,
        offersInHome: true,
        matchedServiceIds: [service.id],
        parsedAvailabilities: [],
        galleryPhotos: [],
        classification: 'NEW',
        actionChoice: 'CREATE',
      },
      {
        rowNumber: 2,
        name: 'Concurrent Race Therapist 2',
        email: `valid_race_second_${Date.now()}@test.com`,
        hourlyRate: 100.0,
        offersStudio: true,
        offersInHome: true,
        matchedServiceIds: [service.id],
        parsedAvailabilities: [],
        galleryPhotos: [],
        classification: 'NEW',
        actionChoice: 'CREATE',
      },
    ],
  });

  if (!concurrentRaceRes.success || !concurrentRaceRes.report) {
    throw new Error('Concurrent race test execution failed completely.');
  }
  if (concurrentRaceRes.report.failedCount !== 1 || concurrentRaceRes.report.createdCount !== 1) {
    throw new Error(`Expected 1 failure and 1 creation during concurrent race test, got: ${JSON.stringify(concurrentRaceRes.report)}`);
  }
  console.log('[PASS] Concurrency-safe CREATE verified: row 1 failed safely without aborting row 2 or crashing import');

  await db.therapistService.deleteMany({ where: { therapist: { email: { contains: 'valid_race_second_' } } } });
  await db.therapist.deleteMany({ where: { email: { in: [raceTestEmail, `valid_race_second_${Date.now()}@test.com`] } } });

  // Test 4f: Normal Valid CREATE & UPDATE & SKIP
  const validCsv = `Full Name,Bio,Profile Photo,Email,Phone,Telegram Chat ID,Hourly Rate,Offers Studio,Offers In-Home,Services,Availability,Gallery Photos
Valid New Therapist,"Bio",https://example.com/p.jpg,valid.new@test.com,+15550009999,123456,125.00,Yes,Yes,${service.name},Mon-Fri 09:00-17:00,https://example.com/g1.jpg
${verifiedTherapist.name},"Updated bio.",,${verifiedTherapist.email},${verifiedTherapist.phone},,135.00,Yes,Yes,${service.name},Tue-Sat 10:00-18:00,
Skipped Therapist,"Bio",,skipped@test.com,+15550008888,,120.00,Yes,Yes,${service.name},Mon-Fri 09:00-17:00,`;

  const previewValid = await parseAndPreviewTherapistCsv(validCsv);
  const rowsWithChoices = previewValid.rows.map((r, i) => ({
    ...r,
    actionChoice: i === 0 ? ('CREATE' as const) : i === 1 ? ('UPDATE' as const) : ('SKIP' as const),
  }));

  const execValidRes = await executeTherapistCsvImportAction({ rows: rowsWithChoices });
  if (
    !execValidRes.success ||
    !execValidRes.report ||
    execValidRes.report.createdCount !== 1 ||
    execValidRes.report.updatedCount !== 1 ||
    execValidRes.report.skippedCount !== 1
  ) {
    console.error('execValidRes report:', execValidRes?.report);
    throw new Error('Valid CREATE, UPDATE, and SKIP execution failed.');
  }
  console.log('[PASS] Valid CREATE (1), UPDATE (1), and SKIP (1) executed successfully');

  // Test 4g: CRITICAL ZIP RULE: Zero ZIP eligibility rows created
  const importedTherapist = await db.therapist.findFirst({ where: { email: 'valid.new@test.com' } });
  if (!importedTherapist) throw new Error('Imported therapist record not found in DB.');

  const zipCount = await db.therapistZipEligibility.count({
    where: { therapistId: importedTherapist.id },
  });
  if (zipCount > 0) throw new Error('CRITICAL ZIP VIOLATION: Importer must not create ZIP eligibility rows.');
  console.log('[PASS] CRITICAL ZIP RULE VERIFIED: CSV Importer created 0 ZIP eligibility rows\n');

  // Clean up test records
  await db.adminNote.deleteMany({ where: { entityId: booking.id } });
  await db.refundRecord.deleteMany({ where: { bookingId: booking.id } });
  await db.booking.delete({ where: { id: booking.id } });
  await db.therapistService.deleteMany({
    where: { therapistId: { in: [pendingTherapist.id, verifiedTherapist.id, importedTherapist.id] } },
  });
  await db.therapistAvailability.deleteMany({
    where: { therapistId: { in: [pendingTherapist.id, verifiedTherapist.id, importedTherapist.id] } },
  });
  await db.therapistPhoto.deleteMany({ where: { therapistId: importedTherapist.id } });
  await db.therapist.deleteMany({
    where: { id: { in: [pendingTherapist.id, verifiedTherapist.id, importedTherapist.id] } },
  });
  await db.customer.delete({ where: { id: customer.id } });

  console.log('====================================================');
  console.log('  ALL OPERATIONS & CSV IMPORT EDGE TESTS PASSED!');
  console.log('====================================================');
}

runOperationsImportTestSuite().catch((err) => {
  console.error('\nError running operations import test suite:', err);
  process.exit(1);
});
