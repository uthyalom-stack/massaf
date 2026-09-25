import { db } from '../src/lib/db';
import { createSessionToken } from '../src/lib/auth-session';
import {
  shuffleAndDistributeTherapistsAction,
  createTherapistAction,
  createMarketerAction,
  getMarketerStatsAction,
  getMarketerLeaderboardAction,
  createServiceCategoryAction,
  createGlobalServiceAction,
} from '../src/app/admin/actions';

async function runAdminPortalAuditTests() {
  console.log('=== STARTING ADMIN PORTAL AUTHORIZATION & SECURITY AUDIT SUITE ===\n');

  // 1. Setup Test Users (SUPER_ADMIN, ADMIN, STAFF A, STAFF B)
  let superAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN', email: 'audit_super@massaf.com' } });
  if (!superAdmin) {
    superAdmin = await db.user.create({
      data: {
        name: 'Audit Super Admin',
        email: 'audit_super@massaf.com',
        role: 'SUPER_ADMIN',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  let adminUser = await db.user.findFirst({ where: { role: 'ADMIN', email: 'audit_admin@massaf.com' } });
  if (!adminUser) {
    adminUser = await db.user.create({
      data: {
        name: 'Audit Admin',
        email: 'audit_admin@massaf.com',
        role: 'ADMIN',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  let staffA = await db.user.findFirst({ where: { role: 'STAFF', email: 'audit_staff_a@massaf.com' } });
  if (!staffA) {
    staffA = await db.user.create({
      data: {
        name: 'Audit Staff A',
        email: 'audit_staff_a@massaf.com',
        role: 'STAFF',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  let staffB = await db.user.findFirst({ where: { role: 'STAFF', email: 'audit_staff_b@massaf.com' } });
  if (!staffB) {
    staffB = await db.user.create({
      data: {
        name: 'Audit Staff B',
        email: 'audit_staff_b@massaf.com',
        role: 'STAFF',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  // Create unique links for staff A and B
  await db.marketingLink.upsert({
    where: { code: 'audit_link_a' },
    update: { userId: staffA.id, clicks: 10 },
    create: { code: 'audit_link_a', name: 'Link A', userId: staffA.id, clicks: 10 },
  });

  await db.marketingLink.upsert({
    where: { code: 'audit_link_b' },
    update: { userId: staffB.id, clicks: 50 },
    create: { code: 'audit_link_b', name: 'Link B', userId: staffB.id, clicks: 50 },
  });

  const superAdminToken = createSessionToken(superAdmin.id, superAdmin.email, 'ADMIN', 24, 'SUPER_ADMIN');
  const adminToken = createSessionToken(adminUser.id, adminUser.email, 'ADMIN', 24, 'ADMIN');
  const staffAToken = createSessionToken(staffA.id, staffA.email, 'ADMIN', 24, 'STAFF');

  // Helper to set session context
  const setSession = (token: string) => {
    (globalThis as any).__TEST_ADMIN_SESSION_TOKEN__ = token;
  };

  // Test 1: STAFF Role Server Action Authorization Rejections
  console.log('1. Testing STAFF Role Authorization Rejections on Restricted Server Actions...');
  setSession(staffAToken);

  const staffTherapistRes = await createTherapistAction({ name: 'Unauthorized Therapist', email: 'unauth@test.com' });
  if (staffTherapistRes.success) {
    console.error('FAILED: STAFF caller was able to execute createTherapistAction!');
    process.exit(1);
  }
  console.log('[PASS] STAFF blocked from createTherapistAction');

  const staffMarketerRes = await createMarketerAction({ name: 'Unauthorized Marketer' });
  if (staffMarketerRes.success) {
    console.error('FAILED: STAFF caller was able to execute createMarketerAction!');
    process.exit(1);
  }
  console.log('[PASS] STAFF blocked from createMarketerAction');

  const staffDistributionRes = await shuffleAndDistributeTherapistsAction();
  if (staffDistributionRes.success) {
    console.error('FAILED: STAFF caller was able to execute shuffleAndDistributeTherapistsAction!');
    process.exit(1);
  }
  console.log('[PASS] STAFF blocked from shuffleAndDistributeTherapistsAction');

  const staffCategoryRes = await createServiceCategoryAction({ name: 'Unauthorized Category' });
  if (staffCategoryRes.success) {
    console.error('FAILED: STAFF caller was able to execute createServiceCategoryAction!');
    process.exit(1);
  }
  console.log('[PASS] STAFF blocked from createServiceCategoryAction');

  const staffServiceRes = await createGlobalServiceAction({ name: 'Unauthorized Service', durationMinutes: 60, price: 100 });
  if (staffServiceRes.success) {
    console.error('FAILED: STAFF caller was able to execute createGlobalServiceAction!');
    process.exit(1);
  }
  console.log('[PASS] STAFF blocked from createGlobalServiceAction');

  // Test 2: STAFF Marketer Data Isolation and Parameter Forgery Prevention
  console.log('\n2. Testing STAFF Marketer Data Isolation & Parameter Forgery Prevention...');
  setSession(staffAToken);

  // STAFF A attempts to request STAFF B's stats by supplying staffB.id as parameter
  const staffAForcedStats = await getMarketerStatsAction(staffB.id);
  console.log(`STAFF A requested stats for STAFF B. Returned clicks count: ${staffAForcedStats.stats?.clicks}`);

  if (!staffAForcedStats.success || staffAForcedStats.stats?.clicks !== 10) {
    console.error(`FAILED: STAFF A was able to query STAFF B stats! Returned clicks: ${staffAForcedStats.stats?.clicks}`);
    process.exit(1);
  }
  console.log('[PASS] STAFF A parameter forgery overridden server-side to STAFF A data (10 clicks instead of 50)');

  // Test 3: Leaderboard Email Redaction for STAFF Callers
  console.log('\n3. Testing Leaderboard Email Privacy Redaction for STAFF Callers...');
  setSession(staffAToken);

  const staffLeaderboard = await getMarketerLeaderboardAction();
  const staffLeaderboardList = staffLeaderboard.leaderboard || (staffLeaderboard as any).marketers;
  if (!staffLeaderboard.success || !staffLeaderboardList) {
    console.error('FAILED: STAFF caller could not retrieve leaderboard!', staffLeaderboard);
    process.exit(1);
  }

  for (const entry of staffLeaderboardList) {
    if (entry.userId !== staffA.id && entry.email.includes('@')) {
      console.error(`FAILED: STAFF A saw unredacted email for other marketer ${entry.name}: ${entry.email}`);
      process.exit(1);
    }
  }
  console.log('[PASS] Other marketers emails strictly redacted for STAFF caller');

  // Verify SUPER_ADMIN sees full email on leaderboard
  setSession(superAdminToken);
  const superAdminLeaderboard = await getMarketerLeaderboardAction();
  const superAdminLeaderboardList = superAdminLeaderboard.leaderboard || (superAdminLeaderboard as any).marketers;
  const otherMarketerEntry = superAdminLeaderboardList?.find((m: any) => m.userId === staffB.id);

  if (!otherMarketerEntry || !otherMarketerEntry.email.includes('@')) {
    console.error('FAILED: SUPER_ADMIN did not see unredacted email for staffB!');
    process.exit(1);
  }
  console.log('[PASS] SUPER_ADMIN sees full unredacted email addresses on leaderboard');

  // Test 4: Input Validation Enforcement for Global Services & Categories
  console.log('\n4. Testing Input Validation for Global Services & Categories...');
  setSession(adminToken);

  const invalidPriceRes = await createGlobalServiceAction({ name: 'Invalid Price Service', durationMinutes: 60, price: -50 });
  if (invalidPriceRes.success) {
    console.error('FAILED: createGlobalServiceAction accepted negative price!');
    process.exit(1);
  }
  console.log('[PASS] Negative service price rejected');

  const invalidDurationRes = await createGlobalServiceAction({ name: 'Invalid Duration Service', durationMinutes: 0, price: 100 });
  if (invalidDurationRes.success) {
    console.error('FAILED: createGlobalServiceAction accepted zero duration!');
    process.exit(1);
  }
  console.log('[PASS] Zero service duration rejected');

  const emptyNameRes = await createServiceCategoryAction({ name: '  ' });
  if (emptyNameRes.success) {
    console.error('FAILED: createServiceCategoryAction accepted empty whitespace name!');
    process.exit(1);
  }
  console.log('[PASS] Empty category name rejected');

  // Test 5: SUPER_ADMIN vs ADMIN Role Distinction
  console.log('\n5. Testing SUPER_ADMIN vs ADMIN Role Authorization Boundaries...');
  setSession(adminToken);

  const adminMarketerCreateRes = await createMarketerAction({ name: 'Forbidden Marketer' });
  if (adminMarketerCreateRes.success) {
    console.error('FAILED: ADMIN caller was able to execute createMarketerAction!');
    process.exit(1);
  }
  console.log('[PASS] ADMIN caller blocked from createMarketerAction');

  setSession(superAdminToken);
  const superAdminMarketerCreateRes = await createMarketerAction({ name: 'Allowed Marketer' });
  if (!superAdminMarketerCreateRes.success) {
    console.error('FAILED: SUPER_ADMIN caller failed to execute createMarketerAction!');
    process.exit(1);
  }
  console.log('[PASS] SUPER_ADMIN caller successfully executed createMarketerAction');

  // Test 6: SiteContent CMS Key Allowlist & Internal Key Protection
  console.log('\n6. Testing SiteContent CMS Key Allowlist & Operational Key Overwrite Rejections...');
  const { updateSiteContentAction } = await import('../src/app/admin/actions');

  // Ensure active distribution timestamp exists
  const origTimestamp = new Date().toISOString();
  await db.siteContent.upsert({
    where: { key: 'active_distribution_timestamp' },
    update: { content: origTimestamp },
    create: { key: 'active_distribution_timestamp', title: 'Active Timestamp', content: origTimestamp },
  });

  // 1. SUPER_ADMIN can update allowed CMS key ('terms')
  setSession(superAdminToken);
  const superTermsRes = await updateSiteContentAction('terms', 'Terms of Service', 'Updated Terms Content');
  if (!superTermsRes.success) {
    console.error('FAILED: SUPER_ADMIN could not update allowed CMS key "terms"!');
    process.exit(1);
  }
  console.log('[PASS] SUPER_ADMIN successfully updated allowed CMS key "terms"');

  // 2. ADMIN can update allowed CMS key ('privacy')
  setSession(adminToken);
  const adminPrivacyRes = await updateSiteContentAction('privacy', 'Privacy Policy', 'Updated Privacy Content');
  if (!adminPrivacyRes.success) {
    console.error('FAILED: ADMIN could not update allowed CMS key "privacy"!');
    process.exit(1);
  }
  console.log('[PASS] ADMIN successfully updated allowed CMS key "privacy"');

  // 3. Attempting to overwrite 'active_distribution_timestamp' via CMS is REJECTED
  const tsOverwriteRes = await updateSiteContentAction('active_distribution_timestamp', 'Malicious Timestamp', '2000-01-01T00:00:00.000Z');
  if (tsOverwriteRes.success) {
    console.error('FAILED: updateSiteContentAction allowed overwriting "active_distribution_timestamp"!');
    process.exit(1);
  }
  console.log('[PASS] updateSiteContentAction rejected overwrite attempt on "active_distribution_timestamp"');

  // 4. Attempting to overwrite 'distribution_in_progress_lock' via CMS is REJECTED
  const lockOverwriteRes = await updateSiteContentAction('distribution_in_progress_lock', 'Malicious Lock', 'UNLOCKED');
  if (lockOverwriteRes.success) {
    console.error('FAILED: updateSiteContentAction allowed overwriting "distribution_in_progress_lock"!');
    process.exit(1);
  }
  console.log('[PASS] updateSiteContentAction rejected overwrite attempt on "distribution_in_progress_lock"');

  // 5. Verify distribution timestamp in DB remained untouched by rejected attempt
  const currentTsRecord = await db.siteContent.findUnique({ where: { key: 'active_distribution_timestamp' } });
  if (currentTsRecord?.content !== origTimestamp) {
    console.error(`FAILED: Distribution timestamp record was corrupted! Expected ${origTimestamp}, got ${currentTsRecord?.content}`);
    process.exit(1);
  }
  console.log('[PASS] Distribution state remained completely intact after rejected CMS overwrite attempts');

  console.log('\n====================================================');
  console.log('  ALL ADMIN PORTAL AUTHORIZATION & SECURITY AUDIT TESTS PASSED!');
  console.log('====================================================');
}

runAdminPortalAuditTests().catch((err) => {
  console.error('Error running admin portal audit test suite:', err);
  process.exit(1);
});
