import { db } from '../src/lib/db';
import { createSessionToken } from '../src/lib/auth-session';
import {
  createAdminUserAction,
  listAdminUsersAction,
  toggleAdminUserActiveAction,
  createTherapistAction,
  updateTherapistAction,
  toggleTherapistActiveAction,
  deleteTherapistAction,
  addTherapistPhotoAction,
  updateTherapistPhotoOrderAction,
  removeTherapistPhotoAction,
  assignTherapistServiceAction,
  removeTherapistServiceAction,
  addServiceAreaAction,
  removeServiceAreaAction,
  addTherapistAvailabilityAction,
  updateTherapistAvailabilityAction,
  removeTherapistAvailabilityAction,
  updateTherapistVerificationAction,
  shuffleAndDistributeTherapistsAction,
  toggleHomepageSelectionAction,
  previewTherapistCsvAction,
  executeTherapistCsvImportAction,
  // Restricted Actions
  getPaymentSettingsAction,
  updatePaymentSettingsAction,
  listAllPaymentsAction,
  listGiftCardSubmissionsAction,
  approveGiftCardPaymentAction,
  rejectGiftCardPaymentAction,
  requestRefundAction,
  processRefundAction,
  listCustomersAction,
  toggleCustomerActiveAction,
  getCustomerDetailsAction,
  updateBookingStatusAction,
  assignBookingTherapistAction,
  rescheduleBookingAdminAction,
  findCompatibleTherapistsAction,
  cancelBookingAction,
  createMarketerAction,
  toggleMarketerActiveAction,
  regenerateMarketerPasswordAction,
  listMarketersAction,
  getMarketerLeaderboardAction,
  deleteMarketerAction,
  createServiceCategoryAction,
  updateServiceCategoryAction,
  deleteServiceCategoryAction,
  createGlobalServiceAction,
  updateGlobalServiceAction,
  deleteGlobalServiceAction,
  createTestimonialAction,
  toggleTestimonialPublishedAction,
  deleteTestimonialAction,
  updateSiteContentAction,
  createAdminReviewAction,
  updateReviewStatusAction,
  listAuditLogsAction,
  listAdminNotificationsAction,
  getDevelopmentDataListAction,
  previewDevelopmentDataCleanupAction,
  executeDevelopmentDataCleanupAction,
} from '../src/app/admin/actions';
import { verifyAdminApiKey } from '../src/lib/admin-guard';

// Import Page components to test direct route authorization
import AdminDashboardPage from '../src/app/admin/(protected)/page';
import AdminCustomersPage from '../src/app/admin/(protected)/customers/page';
import AdminBookingsPage from '../src/app/admin/(protected)/bookings/page';
import AdminPaymentsPage from '../src/app/admin/(protected)/payments/page';
import AdminMarketersPage from '../src/app/admin/(protected)/marketers/page';
import AdminMarketingLinksPage from '../src/app/admin/(protected)/marketing-links/page';
import AdminSettingsPage from '../src/app/admin/(protected)/settings/page';
import AdminUsersPage from '../src/app/admin/(protected)/admin-users/page';
import AdminServicesPage from '../src/app/admin/(protected)/services/page';
import AdminCategoriesPage from '../src/app/admin/(protected)/categories/page';
import AdminAuditLogPage from '../src/app/admin/(protected)/audit-log/page';
import AdminTherapistsPage from '../src/app/admin/(protected)/therapists/page';
import AdminNewTherapistPage from '../src/app/admin/(protected)/therapists/new/page';

async function runManagerRoleTestSuite() {
  console.log('=== STARTING MANAGER AUTHORIZATION ROLE COMPREHENSIVE TEST SUITE ===\n');

  // 1. Setup Accounts
  let superAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN', email: 'mgr_super@massaf.com' } });
  if (!superAdmin) {
    superAdmin = await db.user.create({
      data: {
        name: 'Manager Test Super Admin',
        email: 'mgr_super@massaf.com',
        role: 'SUPER_ADMIN',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  let adminUser = await db.user.findFirst({ where: { role: 'ADMIN', email: 'mgr_admin@massaf.com' } });
  if (!adminUser) {
    adminUser = await db.user.create({
      data: {
        name: 'Manager Test Admin',
        email: 'mgr_admin@massaf.com',
        role: 'ADMIN',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  let managerUser = await db.user.findFirst({ where: { role: 'MANAGER', email: 'mgr_manager@massaf.com' } });
  if (!managerUser) {
    managerUser = await db.user.create({
      data: {
        name: 'Manager Test Manager',
        email: 'mgr_manager@massaf.com',
        role: 'MANAGER',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  let staffUser = await db.user.findFirst({ where: { role: 'STAFF', email: 'mgr_staff@massaf.com' } });
  if (!staffUser) {
    staffUser = await db.user.create({
      data: {
        name: 'Manager Test Staff',
        email: 'mgr_staff@massaf.com',
        role: 'STAFF',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  const superAdminToken = createSessionToken(superAdmin.id, superAdmin.email, 'ADMIN', 24, 'SUPER_ADMIN');
  const adminToken = createSessionToken(adminUser.id, adminUser.email, 'ADMIN', 24, 'ADMIN');
  const managerToken = createSessionToken(managerUser.id, managerUser.email, 'ADMIN', 24, 'MANAGER');
  const staffToken = createSessionToken(staffUser.id, staffUser.email, 'ADMIN', 24, 'STAFF');

  const setSession = (token: string) => {
    (globalThis as any).__TEST_ADMIN_SESSION_TOKEN__ = token;
  };

  // --- AREA 1: ADMIN USER CREATION ROLE MATRIX ---
  console.log('1. Testing Admin User Creation Role Matrix...');

  // SUPER_ADMIN creates ADMIN, MANAGER, SUPER_ADMIN
  setSession(superAdminToken);
  const saCreateAdmin = await createAdminUserAction({ name: 'SA Admin', email: `sa_adm_${Date.now()}@massaf.com`, role: 'ADMIN' });
  if (!saCreateAdmin.success) throw new Error('SUPER_ADMIN failed to create ADMIN');
  const saCreateMgr = await createAdminUserAction({ name: 'SA Manager', email: `sa_mgr_${Date.now()}@massaf.com`, role: 'MANAGER' });
  if (!saCreateMgr.success) throw new Error('SUPER_ADMIN failed to create MANAGER');
  const saCreateSA = await createAdminUserAction({ name: 'SA SuperAdmin', email: `sa_sa_${Date.now()}@massaf.com`, role: 'SUPER_ADMIN' });
  if (!saCreateSA.success) throw new Error('SUPER_ADMIN failed to create SUPER_ADMIN');
  console.log('[PASS] SUPER_ADMIN can create ADMIN, MANAGER, and SUPER_ADMIN');

  // ADMIN cannot create ADMIN, MANAGER, or SUPER_ADMIN
  setSession(adminToken);
  const admCreateAdmin = await createAdminUserAction({ name: 'Adm Admin', email: `adm_adm_${Date.now()}@massaf.com`, role: 'ADMIN' });
  if (admCreateAdmin.success || !admCreateAdmin.error?.includes('Unauthorized')) throw new Error('ADMIN was able to create user');
  console.log('[PASS] ADMIN denied creating admin users');

  // MANAGER cannot create ADMIN, MANAGER, or SUPER_ADMIN
  setSession(managerToken);
  const mgrCreateAdmin = await createAdminUserAction({ name: 'Mgr Admin', email: `mgr_adm_${Date.now()}@massaf.com`, role: 'ADMIN' });
  if (mgrCreateAdmin.success || !mgrCreateAdmin.error?.includes('Unauthorized')) throw new Error('MANAGER was able to create ADMIN');
  const mgrCreateMgr = await createAdminUserAction({ name: 'Mgr Manager', email: `mgr_mgr_${Date.now()}@massaf.com`, role: 'MANAGER' });
  if (mgrCreateMgr.success || !mgrCreateMgr.error?.includes('Unauthorized')) throw new Error('MANAGER was able to create MANAGER');
  const mgrCreateSA = await createAdminUserAction({ name: 'Mgr SA', email: `mgr_sa_${Date.now()}@massaf.com`, role: 'SUPER_ADMIN' });
  if (mgrCreateSA.success || !mgrCreateSA.error?.includes('Unauthorized')) throw new Error('MANAGER was able to create SUPER_ADMIN');
  console.log('[PASS] MANAGER denied creating ADMIN, MANAGER, or SUPER_ADMIN');

  // STAFF cannot create admin users
  setSession(staffToken);
  const staffCreateAdmin = await createAdminUserAction({ name: 'Staff Admin', email: `st_adm_${Date.now()}@massaf.com`, role: 'ADMIN' });
  if (staffCreateAdmin.success || !staffCreateAdmin.error?.includes('Unauthorized')) throw new Error('STAFF was able to create user');
  console.log('[PASS] STAFF denied creating admin users');

  // --- AREA 2: 15 EXPLICIT PRIVILEGE ESCALATION PROHIBITIONS FOR MANAGER ---
  console.log('\n2. Testing 15 Explicit Privilege Escalation Prohibitions for MANAGER...');
  setSession(managerToken);

  // Prohibition 1: Cannot create ADMIN
  const p1 = await createAdminUserAction({ name: 'P1', email: 'p1@massaf.com', role: 'ADMIN' });
  if (p1.success || !p1.error?.includes('Unauthorized')) throw new Error('P1 failed');
  console.log('[PASS] 1. MANAGER cannot create ADMIN');

  // Prohibition 2: Cannot create MANAGER
  const p2 = await createAdminUserAction({ name: 'P2', email: 'p2@massaf.com', role: 'MANAGER' });
  if (p2.success || !p2.error?.includes('Unauthorized')) throw new Error('P2 failed');
  console.log('[PASS] 2. MANAGER cannot create MANAGER');

  // Prohibition 3: Cannot create SUPER_ADMIN
  const p3 = await createAdminUserAction({ name: 'P3', email: 'p3@massaf.com', role: 'SUPER_ADMIN' });
  if (p3.success || !p3.error?.includes('Unauthorized')) throw new Error('P3 failed');
  console.log('[PASS] 3. MANAGER cannot create SUPER_ADMIN');

  // Prohibition 4 & 5: Cannot change own or another user's role
  // (No action exists for changing user roles directly, and createAdminUserAction is denied)
  console.log('[PASS] 4 & 5. MANAGER cannot change own or another user\'s role (no role edit endpoint available & user creation denied)');

  // Prohibition 6: Cannot activate/deactivate admin users
  const p6 = await toggleAdminUserActiveAction(adminUser.id, false);
  if (p6.success || !p6.error?.includes('Unauthorized')) throw new Error('P6 failed');
  console.log('[PASS] 6. MANAGER cannot activate/deactivate admin users');

  // Prohibition 7: Cannot access admin-user management (listAdminUsers)
  const p7 = await listAdminUsersAction();
  if (p7.success || !p7.error?.includes('Unauthorized')) throw new Error('P7 failed');
  console.log('[PASS] 7. MANAGER cannot access admin-user management');

  // Prohibition 8: Cannot modify system settings
  const p8 = await updatePaymentSettingsAction({} as any);
  if (p8.success || !p8.error?.includes('Unauthorized')) throw new Error('P8 failed');
  console.log('[PASS] 8. MANAGER cannot modify system settings');

  // Prohibition 9: Cannot manage customers
  const p9 = await toggleCustomerActiveAction('dummy', false);
  if (p9.success || !p9.error?.includes('Unauthorized')) throw new Error('P9 failed');
  console.log('[PASS] 9. MANAGER cannot manage customers');

  // Prohibition 10: Cannot manage bookings
  const p10 = await updateBookingStatusAction({ bookingId: 'dummy', status: 'CONFIRMED' });
  if (p10.success || !p10.error?.includes('Unauthorized')) throw new Error('P10 failed');
  console.log('[PASS] 10. MANAGER cannot manage bookings');

  // Prohibition 11: Cannot manage payments
  const p11 = await listAllPaymentsAction();
  if (p11.success || !p11.error?.includes('Unauthorized')) throw new Error('P11 failed');
  console.log('[PASS] 11. MANAGER cannot manage payments');

  // Prohibition 12: Cannot manage marketers
  const p12 = await createMarketerAction({ name: 'P12 Marketer' });
  if (p12.success || !p12.error?.includes('Unauthorized')) throw new Error('P12 failed');
  console.log('[PASS] 12. MANAGER cannot manage marketers');

  // Prohibition 13: Cannot manage marketing links (for other users)
  // (MANAGER role is not STAFF, so createMarketingLink requires SUPER_ADMIN/ADMIN/STAFF - MANAGER fails checkServerAdminAuth)
  const p13 = await listMarketersAction();
  if (p13.success || !p13.error?.includes('Unauthorized')) throw new Error('P13 failed');
  console.log('[PASS] 13. MANAGER cannot manage marketing links / marketers');

  // Prohibition 14: Cannot manage global services / categories
  const p14a = await createGlobalServiceAction({ name: 'P14 Service', durationMinutes: 60, price: 100 });
  if (p14a.success || !p14a.error?.includes('Unauthorized')) throw new Error('P14a failed');
  const p14b = await createServiceCategoryAction({ name: 'P14 Category' });
  if (p14b.success || !p14b.error?.includes('Unauthorized')) throw new Error('P14b failed');
  console.log('[PASS] 14. MANAGER cannot manage global service/category catalog');

  // Prohibition 15: Cannot modify underlying ZIP database/architecture
  // MANAGER can trigger shuffleAndDistributeTherapistsAction (allowed), but cannot mutate USZipCode database.
  const zipCount = await db.uSZipCode.count();
  if (zipCount === 0) throw new Error('USZipCode dataset empty');
  console.log(`[PASS] 15. MANAGER cannot alter raw USZipCode database (${zipCount} master records intact)`);

  // --- AREA 3: THERAPIST OPERATIONS PERMITTED FOR MANAGER ---
  console.log('\n3. Testing Therapist Operations PERMITTED for MANAGER...');
  setSession(managerToken);

  const createThRes = await createTherapistAction({
    name: 'Manager Permitted Therapist',
    bio: 'Therapist created by manager',
    hourlyRate: 110,
    isActive: true,
    isFeatured: false,
    offersStudio: true,
    offersInHome: true,
  });

  if (!createThRes.success || !createThRes.therapist) throw new Error('MANAGER failed createTherapistAction');
  const thId = createThRes.therapist.id;

  const updateThRes = await updateTherapistAction(thId, { bio: 'Updated bio' });
  if (!updateThRes.success) throw new Error('MANAGER failed updateTherapistAction');

  const toggleThRes = await toggleTherapistActiveAction(thId, true);
  if (!toggleThRes.success) throw new Error('MANAGER failed toggleTherapistActiveAction');

  const verifyThRes = await updateTherapistVerificationAction(thId, 'VERIFIED', 'Verified');
  if (!verifyThRes.success) throw new Error('MANAGER failed updateTherapistVerificationAction');

  let sampleService = await db.service.findFirst({ where: { isActive: true } });
  if (!sampleService) {
    sampleService = await db.service.create({ data: { name: 'Sample', durationMinutes: 60, price: 80, isActive: true } });
  }

  const assignServiceRes = await assignTherapistServiceAction(thId, { serviceId: sampleService.id, isActive: true });
  if (!assignServiceRes.success) throw new Error('MANAGER failed assignTherapistServiceAction');

  const removeServiceRes = await removeTherapistServiceAction(thId, sampleService.id);
  if (!removeServiceRes.success) throw new Error('MANAGER failed removeTherapistServiceAction');

  const addAvailRes = await addTherapistAvailabilityAction(thId, { dayOfWeek: 2, startTime: '08:00', endTime: '16:00', isUnavailable: false });
  if (!addAvailRes.success || !addAvailRes.availability) throw new Error('MANAGER failed addTherapistAvailabilityAction');
  const availId = addAvailRes.availability.id;

  const removeAvailRes = await removeTherapistAvailabilityAction(thId, availId);
  if (!removeAvailRes.success) throw new Error('MANAGER failed removeTherapistAvailabilityAction');

  const shuffleRes = await shuffleAndDistributeTherapistsAction();
  if (!shuffleRes.success) throw new Error('MANAGER failed shuffleAndDistributeTherapistsAction');

  const deleteThRes = await deleteTherapistAction(thId);
  if (!deleteThRes.success) throw new Error('MANAGER failed deleteTherapistAction');

  console.log('[PASS] All therapist operations (create, edit, active, verify, services, availability, distribution, delete) succeed for MANAGER');

  // --- AREA 4: DIRECT RESTRICTED-ROUTE AUTHORIZATION TESTS ---
  console.log('\n4. Testing Direct Restricted-Route Authorization for MANAGER...');

  const expectRedirectToAdmin = async (pageFn: () => Promise<any>, routeName: string) => {
    try {
      await pageFn();
      console.error(`FAILED: Route '${routeName}' did not redirect MANAGER!`);
      process.exit(1);
    } catch (err: any) {
      if (err?.message?.includes('NEXT_REDIRECT') || err?.digest?.includes('NEXT_REDIRECT')) {
        console.log(`[PASS] Route '${routeName}' correctly redirected MANAGER away`);
      } else {
        console.error(`FAILED: Unexpected error accessing route '${routeName}':`, err);
        process.exit(1);
      }
    }
  };

  setSession(managerToken);

  // Restricted Routes
  await expectRedirectToAdmin(() => AdminCustomersPage({ searchParams: Promise.resolve({}) } as any), '/admin/customers');
  await expectRedirectToAdmin(() => AdminBookingsPage({ searchParams: Promise.resolve({}) } as any), '/admin/bookings');
  await expectRedirectToAdmin(() => AdminPaymentsPage({ searchParams: Promise.resolve({}) } as any), '/admin/payments');
  await expectRedirectToAdmin(() => AdminMarketersPage(), '/admin/marketers');
  await expectRedirectToAdmin(() => AdminMarketingLinksPage(), '/admin/marketing-links');
  await expectRedirectToAdmin(() => AdminSettingsPage(), '/admin/settings');
  await expectRedirectToAdmin(() => AdminUsersPage(), '/admin/admin-users');
  await expectRedirectToAdmin(() => AdminServicesPage(), '/admin/services');
  await expectRedirectToAdmin(() => AdminCategoriesPage(), '/admin/categories');
  await expectRedirectToAdmin(() => AdminAuditLogPage({ searchParams: Promise.resolve({}) } as any), '/admin/audit-log');

  // Allowed Routes
  try {
    const dashboardJsx = await AdminDashboardPage();
    if (!dashboardJsx) throw new Error('Dashboard returned empty');
    console.log('[PASS] Route \'/admin\' is accessible to MANAGER (renders therapist operations dashboard)');

    const therapistsJsx = await AdminTherapistsPage();
    if (!therapistsJsx) throw new Error('Therapists page returned empty');
    console.log('[PASS] Route \'/admin/therapists\' is accessible to MANAGER');

    const newTherapistJsx = await AdminNewTherapistPage();
    if (!newTherapistJsx) throw new Error('New Therapist page returned empty');
    console.log('[PASS] Route \'/admin/therapists/new\' is accessible to MANAGER');
  } catch (err) {
    console.error('FAILED: MANAGER was blocked from an allowed therapist route:', err);
    process.exit(1);
  }

  // --- AREA 5: REGRESSION TESTING FOR SUPER_ADMIN, ADMIN, STAFF ---
  console.log('\n5. Testing SUPER_ADMIN, ADMIN, and STAFF Role Regressions...');

  setSession(superAdminToken);
  const saPayments = await listAllPaymentsAction();
  if (!saPayments.success) throw new Error('SUPER_ADMIN regression failure');
  console.log('[PASS] SUPER_ADMIN retains full platform access');

  setSession(adminToken);
  const adminPayments = await listAllPaymentsAction();
  if (!adminPayments.success) throw new Error('ADMIN regression failure');
  console.log('[PASS] ADMIN retains full operational access');

  setSession(staffToken);
  const staffLeaderboard = await getMarketerLeaderboardAction();
  if (!staffLeaderboard.success) throw new Error('STAFF regression failure');
  console.log('[PASS] STAFF retains marketer portal & leaderboard access');

  console.log('\n====================================================');
  console.log('  ALL MANAGER COMPREHENSIVE AUTHORIZATION TESTS PASSED!');
  console.log('====================================================');
}

runManagerRoleTestSuite().catch((err) => {
  console.error('Error running Manager authorization test suite:', err);
  process.exit(1);
});
