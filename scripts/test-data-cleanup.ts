import { db } from '../src/lib/db';
import {
  getDevelopmentDataListAction,
  previewDevelopmentDataCleanupAction,
  executeDevelopmentDataCleanupAction,
} from '../src/app/admin/actions';

async function runDevelopmentDataCleanupTestSuite() {
  console.log('=== STARTING DEVELOPMENT DATA CLEANUP TEST SUITE ===\n');

  process.env.MASSAF_AUTH_SECRET = 'test-secret-123456789012345678901234567890';
  process.env.TURSO_DATABASE_URL = 'file:./prisma/dev.db';

  // 1. Setup Super Admin and Normal Admin Users
  let superAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
  if (!superAdmin) {
    superAdmin = await db.user.create({
      data: {
        email: 'dev_clean_super@massaf.com',
        name: 'Dev Clean Super Admin',
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });
  }

  let normalAdmin = await db.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
  if (!normalAdmin) {
    normalAdmin = await db.user.create({
      data: {
        email: 'dev_clean_admin@massaf.com',
        name: 'Dev Clean Normal Admin',
        role: 'ADMIN',
        isActive: true,
      },
    });
  }

  const { createSessionToken } = await import('../src/lib/auth-session');
  const superToken = createSessionToken(superAdmin.id, superAdmin.email, 'ADMIN', 24, superAdmin.role);
  const normalToken = createSessionToken(normalAdmin.id, normalAdmin.email, 'ADMIN', 24, normalAdmin.role);

  // Test 1 & 2: Authorization Checks
  console.log('1. Testing SUPER_ADMIN vs ADMIN Authorization for Development Data Cleanup...');
  (globalThis as any).__TEST_ADMIN_SESSION_TOKEN__ = normalToken;
  const normalAdminListRes = await getDevelopmentDataListAction();
  if (normalAdminListRes.success) {
    throw new Error('SECURITY VIOLATION: Normal ADMIN caller must be rejected from development cleanup list.');
  }

  const normalAdminExecRes = await executeDevelopmentDataCleanupAction({ confirmPhrase: 'DELETE DATA' });
  if (normalAdminExecRes.success) {
    throw new Error('SECURITY VIOLATION: Normal ADMIN caller must be rejected from development cleanup execution.');
  }
  console.log('[PASS] Normal ADMIN safely rejected from cleanup server actions.');

  (globalThis as any).__TEST_ADMIN_SESSION_TOKEN__ = superToken;
  const superListRes = await getDevelopmentDataListAction();
  if (!superListRes.success) {
    throw new Error(`SUPER_ADMIN list failed: ${superListRes.error}`);
  }
  console.log('[PASS] SUPER_ADMIN successfully authorized for cleanup list.\n');

  // Test 3, 4, 5 & 9, 10: Setup normal-named development entities and dependencies
  console.log('2. Setting up normal-named development entities (Therapist, Customer, Booking, Review)...');
  const service = (await db.service.findFirst({ where: { isActive: true } })) ||
    (await db.service.create({
      data: {
        name: 'Standard Swedish Massage',
        description: 'Standard massage',
        durationMinutes: 60,
        price: 100.0,
        isActive: true,
      },
    }));

  const customer = await db.customer.create({
    data: {
      name: 'Eleanor Vance',
      email: `eleanor_${Date.now()}@domain.com`,
      phone: '+15559876543',
      isActive: true,
    },
  });

  const therapist = await db.therapist.create({
    data: {
      name: 'Marcus Brody',
      email: `marcus_${Date.now()}@domain.com`,
      phone: '+15551234567',
      hourlyRate: 120.0,
      isActive: true,
      verificationStatus: 'VERIFIED',
    },
  });

  await db.therapistService.create({
    data: { therapistId: therapist.id, serviceId: service.id, isActive: true },
  });

  await db.therapistAvailability.create({
    data: { therapistId: therapist.id, dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
  });

  await db.therapistPhoto.create({
    data: { therapistId: therapist.id, url: 'https://example.com/p1.jpg', sortOrder: 1 },
  });

  const bookingDate = new Date(Date.UTC(2026, 9, 10, 14, 0, 0));
  const booking = await db.booking.create({
    data: {
      bookingNumber: `DEV-${Date.now()}`,
      customerId: customer.id,
      therapistId: therapist.id,
      serviceId: service.id,
      appointmentDateTime: bookingDate,
      durationMinutes: 60,
      locationType: 'STUDIO',
      amount: 120.0,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
    },
  });

  const review = await db.review.create({
    data: {
      bookingId: booking.id,
      customerId: customer.id,
      therapistId: therapist.id,
      rating: 5,
      comment: 'Excellent session by Marcus.',
      authorName: 'Eleanor V.',
      source: 'CUSTOMER',
      isPublished: true,
    },
  });

  console.log('[PASS] Created normal-named development entities without "test" markers.\n');

  // Test 11, 12: Preview Cleanup
  console.log('3. Testing Preview for Selected Cleanup...');
  const previewRes = await previewDevelopmentDataCleanupAction({
    therapistIds: [therapist.id],
    customerIds: [customer.id],
  });

  if (!previewRes.success || !previewRes.preview) {
    throw new Error(`Preview failed: ${previewRes.error}`);
  }

  if (
    previewRes.preview.selectedCounts.therapists !== 1 ||
    previewRes.preview.selectedCounts.customers !== 1 ||
    previewRes.preview.dependentCounts.affectedBookings < 1
  ) {
    throw new Error(`Preview calculation mismatch: ${JSON.stringify(previewRes.preview)}`);
  }
  console.log('[PASS] Preview correctly identified selected records and dependent bookings/reviews.\n');

  // Test 6, 7, 8: Protection of System Data
  console.log('4. Verifying Protected System Data Cannot Be Damaged...');
  const zipCountBefore = await db.uSZipCode.count();
  const superAdminCountBefore = await db.user.count({ where: { role: 'SUPER_ADMIN' } });
  const serviceCountBefore = await db.service.count();

  // Execute Cleanup
  const execRes = await executeDevelopmentDataCleanupAction({
    therapistIds: [therapist.id],
    customerIds: [customer.id],
    confirmPhrase: 'DELETE DATA',
  });

  if (!execRes.success) {
    throw new Error(`Cleanup execution failed: ${execRes.error}`);
  }

  const zipCountAfter = await db.uSZipCode.count();
  const superAdminCountAfter = await db.user.count({ where: { role: 'SUPER_ADMIN' } });
  const serviceCountAfter = await db.service.count();

  if (zipCountBefore !== zipCountAfter) throw new Error('CRITICAL SYSTEM VIOLATION: USZipCode master data was modified!');
  if (superAdminCountBefore !== superAdminCountAfter) throw new Error('CRITICAL SYSTEM VIOLATION: Super Admin user account was deleted!');
  if (serviceCountBefore !== serviceCountAfter) throw new Error('CRITICAL SYSTEM VIOLATION: Global Service catalog was modified!');

  console.log('[PASS] Master USZipCode records, Super Admin accounts, and Global Services strictly protected.\n');

  // Test 10: Dependent Record Removal & Entity Cleanup Verification
  console.log('5. Verifying Clean Removal of Normal-Named Entities & Dependents...');
  const deletedTherapist = await db.therapist.findUnique({ where: { id: therapist.id } });
  const deletedCustomer = await db.customer.findUnique({ where: { id: customer.id } });
  const deletedBooking = await db.booking.findUnique({ where: { id: booking.id } });
  const deletedReview = await db.review.findUnique({ where: { id: review.id } });

  if (deletedTherapist || deletedCustomer || deletedBooking || deletedReview) {
    throw new Error('Target development entities or dependent bookings/reviews were not completely deleted.');
  }
  console.log('[PASS] Selected normal-named therapist, customer, booking, and review cleanly removed.\n');

  // Test 11: Audit Log Survival
  console.log('6. Verifying Audit Log Entries Survive Cleanup...');
  const auditLogs = await db.adminAuditLog.findMany({
    where: { action: 'DEVELOPMENT_DATA_CLEANUP_EXECUTED' },
    orderBy: { createdAt: 'desc' },
  });

  if (auditLogs.length === 0) {
    throw new Error('Audit log entry for DEVELOPMENT_DATA_CLEANUP_EXECUTED was not created/retained.');
  }
  console.log('[PASS] Audit log entry recorded and retained across cleanup execution.\n');

  console.log('====================================================');
  console.log('  ALL DEVELOPMENT DATA CLEANUP TESTS PASSED!');
  console.log('====================================================');
}

runDevelopmentDataCleanupTestSuite().catch((err) => {
  console.error('\nError running development data cleanup test suite:', err);
  process.exit(1);
});
