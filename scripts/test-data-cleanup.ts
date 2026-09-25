import { db } from '../src/lib/db';
import { createSessionToken } from '../src/lib/auth-session';
import { getTestDataPreviewAction, deleteTestDataAction } from '../src/app/admin/actions';

async function runTestDataCleanupTestSuite() {
  console.log('=== STARTING TEST DATA CLEANUP REGRESSION SUITE ===\n');

  // 1. Setup Accounts
  let superAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN', email: 'cleanup_super@massaf.com' } });
  if (!superAdmin) {
    superAdmin = await db.user.create({
      data: {
        name: 'Cleanup Super Admin',
        email: 'cleanup_super@massaf.com',
        role: 'SUPER_ADMIN',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  let normalAdmin = await db.user.findFirst({ where: { role: 'ADMIN', email: 'cleanup_admin@massaf.com' } });
  if (!normalAdmin) {
    normalAdmin = await db.user.create({
      data: {
        name: 'Cleanup Admin',
        email: 'cleanup_admin@massaf.com',
        role: 'ADMIN',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  const superAdminToken = createSessionToken(superAdmin.id, superAdmin.email, 'ADMIN', 24, 'SUPER_ADMIN');
  const normalAdminToken = createSessionToken(normalAdmin.id, normalAdmin.email, 'ADMIN', 24, 'ADMIN');

  const setSession = (token: string) => {
    (globalThis as any).__TEST_ADMIN_SESSION_TOKEN__ = token;
  };

  // 2. Create Representative Test Records
  const testCustomer = await db.customer.create({
    data: {
      name: 'Test Cleanup Customer',
      email: `test_cleanup_cust_${Date.now()}@test.com`,
      phone: '555-0188',
      isTest: true,
    },
  });

  const testTherapist = await db.therapist.create({
    data: {
      name: 'Test Cleanup Therapist',
      email: `test_cleanup_th_${Date.now()}@test.com`,
      isTest: true,
      isActive: true,
    },
  });

  const service = await db.service.findFirst({ where: { isActive: true } });
  const testBooking = await db.booking.create({
    data: {
      bookingNumber: `TEST-CLN-${Date.now()}`,
      customerId: testCustomer.id,
      therapistId: testTherapist.id,
      serviceId: service?.id || 'service-id',
      appointmentDateTime: new Date(),
      durationMinutes: 60,
      amount: 100,
      isTest: true,
    },
  });

  const testGiftCard = await db.giftCardSubmission.create({
    data: {
      bookingId: testBooking.id,
      cardType: 'Test Card',
      cardCode: 'TEST-CODE-999',
      declaredValue: 100,
    },
  });

  const testReview = await db.review.create({
    data: {
      customerId: testCustomer.id,
      therapistId: testTherapist.id,
      bookingId: testBooking.id,
      rating: 5,
      comment: 'Test comment',
      source: 'CUSTOMER',
    },
  });

  // Test 1: Non-SUPER_ADMIN callers are rejected
  console.log('1. Testing Non-SUPER_ADMIN Role Rejection...');
  setSession(normalAdminToken);

  const adminPreviewRes = await getTestDataPreviewAction();
  if (adminPreviewRes.success) {
    console.error('FAILED: Regular ADMIN caller was able to run getTestDataPreviewAction!');
    process.exit(1);
  }
  console.log('[PASS] Regular ADMIN caller rejected from test data cleanup preview');

  // Test 2: Preview Action calculates accurate counts
  console.log('\n2. Testing Preview Action Counts...');
  setSession(superAdminToken);

  const previewRes = await getTestDataPreviewAction();
  if (!previewRes.success || !previewRes.preview) {
    console.error('FAILED: getTestDataPreviewAction failed for SUPER_ADMIN!');
    process.exit(1);
  }

  console.log('Preview Summary:', previewRes.preview);
  if (previewRes.preview.customersCount < 1 || previewRes.preview.therapistsCount < 1 || previewRes.preview.bookingsCount < 1) {
    console.error('FAILED: Preview count did not include newly created test entities!');
    process.exit(1);
  }
  console.log('[PASS] Preview action accurately detected test entities');

  // Test 3: Phrase Mismatch Rejection
  console.log('\n3. Testing Confirmation Phrase Mismatch Rejection...');
  const mismatchRes = await deleteTestDataAction({ confirmPhrase: 'WRONG PHRASE' });
  if (mismatchRes.success) {
    console.error('FAILED: deleteTestDataAction succeeded with invalid confirmation phrase!');
    process.exit(1);
  }
  console.log('[PASS] Incorrect confirmation phrase rejected');

  // Test 4: Execution removes test records and preserves system & admin data
  console.log('\n4. Executing Test Data Deletion...');
  const deleteRes = await deleteTestDataAction({ confirmPhrase: 'DELETE TEST DATA' });
  if (!deleteRes.success) {
    console.error('FAILED: deleteTestDataAction failed!', deleteRes);
    process.exit(1);
  }

  console.log('Deletion Result:', deleteRes.message);

  // Verify test entities are gone
  const [deletedCust, deletedTh, deletedBooking, deletedGCard, deletedRev] = await Promise.all([
    db.customer.findUnique({ where: { id: testCustomer.id } }),
    db.therapist.findUnique({ where: { id: testTherapist.id } }),
    db.booking.findUnique({ where: { id: testBooking.id } }),
    db.giftCardSubmission.findUnique({ where: { id: testGiftCard.id } }),
    db.review.findUnique({ where: { id: testReview.id } }),
  ]);

  if (deletedCust || deletedTh || deletedBooking || deletedGCard || deletedRev) {
    console.error('FAILED: Test records were not completely deleted!');
    process.exit(1);
  }
  console.log('[PASS] All test customer, therapist, booking, payment, and review records removed');

  // Verify Super Admin and Normal Admin accounts remain intact
  const [keptSuper, keptAdmin] = await Promise.all([
    db.user.findUnique({ where: { id: superAdmin.id } }),
    db.user.findUnique({ where: { id: normalAdmin.id } }),
  ]);

  if (!keptSuper || !keptAdmin) {
    console.error('FAILED: Administrator accounts were deleted during cleanup!');
    process.exit(1);
  }
  console.log('[PASS] Administrator accounts preserved');

  // Test 5: Audit Log entry recorded
  console.log('\n5. Verifying Audit Log Recording...');
  const auditLogs = await db.adminAuditLog.findMany({
    where: { action: 'TEST_DATA_CLEANUP_EXECUTED' },
    orderBy: { createdAt: 'desc' },
  });

  if (auditLogs.length === 0) {
    console.error('FAILED: Audit log entry for cleanup was not recorded!');
    process.exit(1);
  }
  console.log('[PASS] Audit log entry recorded for TEST_DATA_CLEANUP_EXECUTED');

  console.log('\n====================================================');
  console.log('  ALL TEST DATA CLEANUP REGRESSION TESTS PASSED!');
  console.log('====================================================');
}

runTestDataCleanupTestSuite().catch((err) => {
  console.error('Error running test data cleanup suite:', err);
  process.exit(1);
});
