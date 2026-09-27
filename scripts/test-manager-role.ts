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

async function runManagerRoleTestSuite() {
  console.log('=== STARTING MANAGER AUTHORIZATION ROLE TEST SUITE ===\n');

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

  const superAdminToken = createSessionToken(superAdmin.id, superAdmin.email, 'ADMIN', 24, 'SUPER_ADMIN');
  const adminToken = createSessionToken(adminUser.id, adminUser.email, 'ADMIN', 24, 'ADMIN');
  const managerToken = createSessionToken(managerUser.id, managerUser.email, 'ADMIN', 24, 'MANAGER');

  const setSession = (token: string) => {
    (globalThis as any).__TEST_ADMIN_SESSION_TOKEN__ = token;
  };

  // --- AREA 1: MANAGER CREATION BY SUPER_ADMIN ---
  console.log('1. Testing MANAGER account creation via Super Admin...');
  setSession(superAdminToken);

  const newMgrEmail = `created_mgr_${Date.now()}@massaf.com`;
  const createMgrRes = await createAdminUserAction({
    name: 'Created Manager User',
    email: newMgrEmail,
    role: 'MANAGER',
  });

  if (!createMgrRes.success || !createMgrRes.user || createMgrRes.user.role !== 'MANAGER') {
    console.error('FAILED: Super Admin failed to create MANAGER user!', createMgrRes);
    process.exit(1);
  }
  console.log('[PASS] Super Admin created a MANAGER account successfully with role MANAGER');

  // Verify created user in DB
  const dbCreatedMgr = await db.user.findUnique({ where: { email: newMgrEmail } });
  if (dbCreatedMgr?.role !== 'MANAGER') {
    console.error('FAILED: Created user in DB does not have role MANAGER!');
    process.exit(1);
  }
  console.log('[PASS] DB record correctly stored role as MANAGER');

  // --- AREA 2: PRIVILEGE ESCALATION / ADMIN CREATION DENIAL FOR MANAGER ---
  console.log('\n2. Testing Privilege Escalation & Admin Creation Denial for MANAGER...');
  setSession(managerToken);

  const mgrCreateAdminRes = await createAdminUserAction({
    name: 'Illegal Admin',
    email: `illegal_${Date.now()}@massaf.com`,
    role: 'ADMIN',
  });
  if (mgrCreateAdminRes.success || !mgrCreateAdminRes.error?.includes('Unauthorized')) {
    console.error('FAILED: MANAGER was not denied createAdminUserAction!', mgrCreateAdminRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER rejected server-side when attempting to create an Admin user');

  const mgrListAdminRes = await listAdminUsersAction();
  if (mgrListAdminRes.success || !mgrListAdminRes.error?.includes('Unauthorized')) {
    console.error('FAILED: MANAGER was not denied listAdminUsersAction!', mgrListAdminRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER rejected server-side when attempting to list admin users');

  const mgrToggleAdminRes = await toggleAdminUserActiveAction(adminUser.id, false);
  if (mgrToggleAdminRes.success || !mgrToggleAdminRes.error?.includes('Unauthorized')) {
    console.error('FAILED: MANAGER was not denied toggleAdminUserActiveAction!', mgrToggleAdminRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER rejected server-side when attempting to deactivate an admin user');

  // --- AREA 3: THERAPIST OPERATIONS PERMITTED FOR MANAGER ---
  console.log('\n3. Testing Therapist Management Operations PERMITTED for MANAGER...');
  setSession(managerToken);

  // a. Create Therapist
  const createThRes = await createTherapistAction({
    name: 'Manager Created Therapist',
    bio: 'Experienced therapist created by manager',
    hourlyRate: 120,
    isActive: true,
    isFeatured: false,
    offersStudio: true,
    offersInHome: true,
  });

  if (!createThRes.success || !createThRes.therapist) {
    console.error('FAILED: MANAGER could not create therapist!', createThRes);
    process.exit(1);
  }
  const thId = createThRes.therapist.id;
  console.log('[PASS] MANAGER successfully created a therapist');

  // b. Edit Therapist
  const updateThRes = await updateTherapistAction(thId, {
    bio: 'Updated bio by manager',
    hourlyRate: 130,
  });
  if (!updateThRes.success) {
    console.error('FAILED: MANAGER could not edit therapist!', updateThRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER successfully updated therapist bio and rate');

  // c. Toggle Active
  const toggleThRes = await toggleTherapistActiveAction(thId, false);
  if (!toggleThRes.success) {
    console.error('FAILED: MANAGER could not toggle therapist active status!', toggleThRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER successfully toggled therapist active status');

  // d. Verification Status
  const verifyThRes = await updateTherapistVerificationAction(thId, 'VERIFIED', 'Verified by manager');
  if (!verifyThRes.success) {
    console.error('FAILED: MANAGER could not update therapist verification status!', verifyThRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER successfully updated therapist verification status');

  // e. Assign/Remove Service
  let sampleService = await db.service.findFirst({ where: { isActive: true } });
  if (!sampleService) {
    sampleService = await db.service.create({
      data: { name: 'Manager Test Service', durationMinutes: 60, price: 90, isActive: true },
    });
  }

  const assignServiceRes = await assignTherapistServiceAction(thId, {
    serviceId: sampleService.id,
    isActive: true,
  });
  if (!assignServiceRes.success) {
    console.error('FAILED: MANAGER could not assign service to therapist!', assignServiceRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER successfully assigned service to therapist');

  const removeServiceRes = await removeTherapistServiceAction(thId, sampleService.id);
  if (!removeServiceRes.success) {
    console.error('FAILED: MANAGER could not remove service from therapist!', removeServiceRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER successfully removed service assignment from therapist');

  // f. Availability Management
  const addAvailRes = await addTherapistAvailabilityAction(thId, {
    dayOfWeek: 1, // Monday
    startTime: '09:00',
    endTime: '17:00',
    isUnavailable: false,
  });
  if (!addAvailRes.success || !addAvailRes.availability) {
    console.error('FAILED: MANAGER could not add therapist availability!', addAvailRes);
    process.exit(1);
  }
  const availId = addAvailRes.availability.id;
  console.log('[PASS] MANAGER successfully added therapist availability schedule');

  const updateAvailRes = await updateTherapistAvailabilityAction(thId, {
    availabilityId: availId,
    startTime: '10:00',
    endTime: '18:00',
  });
  if (!updateAvailRes.success) {
    console.error('FAILED: MANAGER could not update therapist availability!', updateAvailRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER successfully updated therapist availability schedule');

  const removeAvailRes = await removeTherapistAvailabilityAction(thId, availId);
  if (!removeAvailRes.success) {
    console.error('FAILED: MANAGER could not remove therapist availability!', removeAvailRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER successfully removed therapist availability schedule');

  // g. Photo Management
  const addPhotoRes = await addTherapistPhotoAction(thId, {
    url: 'https://example.com/test-photo.jpg',
    altText: 'Manager photo',
    sortOrder: 1,
  });
  if (!addPhotoRes.success || !addPhotoRes.photo) {
    console.error('FAILED: MANAGER could not add therapist photo!', addPhotoRes);
    process.exit(1);
  }
  const photoId = addPhotoRes.photo.id;
  console.log('[PASS] MANAGER successfully added gallery photo for therapist');

  const removePhotoRes = await removeTherapistPhotoAction(thId, photoId);
  if (!removePhotoRes.success) {
    console.error('FAILED: MANAGER could not remove therapist photo!', removePhotoRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER successfully removed gallery photo');

  // h. Homepage Selection Toggle
  const homepageToggleRes = await toggleHomepageSelectionAction(thId, false);
  if (!homepageToggleRes.success) {
    console.error('FAILED: MANAGER could not toggle homepage selection!', homepageToggleRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER successfully toggled homepage selection');

  // i. Therapist ZIP Distribution / Shuffle (re-activate therapist first)
  await toggleTherapistActiveAction(thId, true);
  const shuffleRes = await shuffleAndDistributeTherapistsAction();
  if (!shuffleRes.success) {
    console.error('FAILED: MANAGER could not trigger therapist distribution/shuffle!', shuffleRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER successfully executed therapist distribution/shuffle operation');

  // j. Delete Therapist
  const deleteThRes = await deleteTherapistAction(thId);
  if (!deleteThRes.success) {
    console.error('FAILED: MANAGER could not delete therapist!', deleteThRes);
    process.exit(1);
  }
  console.log('[PASS] MANAGER successfully deleted therapist record');

  // --- AREA 4: NON-THERAPIST OPERATIONS STRICTLY DENIED FOR MANAGER ---
  console.log('\n4. Testing Non-Therapist Operations STRICTLY DENIED for MANAGER...');
  setSession(managerToken);

  const restrictedTestCases: Array<{ name: string; fn: () => Promise<any> }> = [
    { name: 'Payment Settings', fn: () => getPaymentSettingsAction() },
    { name: 'Update Payment Settings', fn: () => updatePaymentSettingsAction({} as any) },
    { name: 'List All Payments', fn: () => listAllPaymentsAction() },
    { name: 'List Gift Cards', fn: () => listGiftCardSubmissionsAction() },
    { name: 'Approve Gift Card', fn: () => approveGiftCardPaymentAction('dummy') },
    { name: 'Reject Gift Card', fn: () => rejectGiftCardPaymentAction('dummy') },
    { name: 'Request Refund', fn: () => requestRefundAction({ bookingId: 'dummy' }) },
    { name: 'Process Refund', fn: () => processRefundAction({ refundId: 'dummy', status: 'PROCESSED' }) },
    { name: 'List Customers', fn: () => listCustomersAction() },
    { name: 'Toggle Customer Active', fn: () => toggleCustomerActiveAction('dummy', false) },
    { name: 'Get Customer Details', fn: () => getCustomerDetailsAction('dummy') },
    { name: 'Update Booking Status', fn: () => updateBookingStatusAction({ bookingId: 'dummy', status: 'CONFIRMED' }) },
    { name: 'Assign Booking Therapist', fn: () => assignBookingTherapistAction({ bookingId: 'dummy', therapistId: 'dummy' }) },
    { name: 'Reschedule Booking Admin', fn: () => rescheduleBookingAdminAction({ bookingId: 'dummy', newDate: '2026-10-10', newTime: '10:00' }) },
    { name: 'Find Compatible Therapists', fn: () => findCompatibleTherapistsAction('dummy') },
    { name: 'Cancel Booking', fn: () => cancelBookingAction({ bookingId: 'dummy' }) },
    { name: 'Create Marketer', fn: () => createMarketerAction({ name: 'Dummy Marketer' }) },
    { name: 'Toggle Marketer Active', fn: () => toggleMarketerActiveAction('dummy', false) },
    { name: 'Regenerate Marketer Password', fn: () => regenerateMarketerPasswordAction('dummy') },
    { name: 'Delete Marketer', fn: () => deleteMarketerAction('dummy') },
    { name: 'Create Service Category', fn: () => createServiceCategoryAction({ name: 'Dummy' }) },
    { name: 'Update Service Category', fn: () => updateServiceCategoryAction('dummy', {}) },
    { name: 'Delete Service Category', fn: () => deleteServiceCategoryAction('dummy') },
    { name: 'Create Global Service', fn: () => createGlobalServiceAction({ name: 'Dummy', durationMinutes: 60, price: 100 }) },
    { name: 'Update Global Service', fn: () => updateGlobalServiceAction('dummy', {}) },
    { name: 'Delete Global Service', fn: () => deleteGlobalServiceAction('dummy') },
    { name: 'Create Testimonial', fn: () => createTestimonialAction({ authorName: 'Dummy', comment: 'Dummy', therapistId: 'dummy', rating: 5 }) },
    { name: 'Toggle Testimonial Published', fn: () => toggleTestimonialPublishedAction('dummy', false) },
    { name: 'Delete Testimonial', fn: () => deleteTestimonialAction('dummy') },
    { name: 'Update Site Content', fn: () => updateSiteContentAction('terms', 'Title', 'Content') },
    { name: 'Create Admin Review', fn: () => createAdminReviewAction({ therapistId: 'dummy', authorName: 'Dummy', rating: 5, comment: 'Dummy' }) },
    { name: 'Update Review Status', fn: () => updateReviewStatusAction({ reviewId: 'dummy', status: 'APPROVED' }) },
    { name: 'List Audit Logs', fn: () => listAuditLogsAction() },
    { name: 'List Admin Notifications', fn: () => listAdminNotificationsAction() },
    { name: 'Get Development Data List', fn: () => getDevelopmentDataListAction() },
    { name: 'Preview Development Data Cleanup', fn: () => previewDevelopmentDataCleanupAction({}) },
    { name: 'Execute Development Data Cleanup', fn: () => executeDevelopmentDataCleanupAction({ confirmPhrase: 'DELETE DATA' }) },
  ];

  for (const testCase of restrictedTestCases) {
    try {
      const res = await testCase.fn();
      if (res && res.success) {
        console.error(`FAILED: MANAGER was able to perform restricted action '${testCase.name}'!`, res);
        process.exit(1);
      }
      console.log(`[PASS] MANAGER denied for restricted action '${testCase.name}' (returned error)`);
    } catch (err: any) {
      if (err.message.includes('Unauthorized')) {
        console.log(`[PASS] MANAGER denied for restricted action '${testCase.name}' (threw Unauthorized)`);
      } else {
        console.error(`FAILED: Unexpected error for restricted action '${testCase.name}':`, err);
        process.exit(1);
      }
    }
  }

  // --- AREA 5: API GUARD AUTHORIZATION CHECKS ---
  console.log('\n5. Testing API Guard Authorization Checks for MANAGER...');

  // Mock Request helper
  const makeMockReq = (roleHeader = 'MANAGER') => {
    return new Request('https://massaf.com/api/admin/therapists', {
      headers: {
        cookie: `massaf_admin_session=${managerToken}`,
      },
    });
  };

  const req = makeMockReq();

  // Test therapist API guard -> should return null (authorized)
  const thAuthErr = await verifyAdminApiKey(req, ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']);
  if (thAuthErr !== null) {
    console.error('FAILED: verifyAdminApiKey rejected MANAGER for therapist endpoint!');
    process.exit(1);
  }
  console.log('[PASS] verifyAdminApiKey permitted MANAGER for therapist endpoint');

  // Test restricted API guard e.g. ['SUPER_ADMIN', 'ADMIN'] -> should return 403 Response
  const restrictedAuthErr = await verifyAdminApiKey(req, ['SUPER_ADMIN', 'ADMIN']);
  if (!restrictedAuthErr || restrictedAuthErr.status !== 403) {
    console.error('FAILED: verifyAdminApiKey did not return 403 for restricted endpoint!', restrictedAuthErr);
    process.exit(1);
  }
  console.log('[PASS] verifyAdminApiKey returned 403 Forbidden for restricted endpoint');

  // --- AREA 6: REGRESSION TESTING FOR SUPER_ADMIN AND ADMIN ---
  console.log('\n6. Testing SUPER_ADMIN and ADMIN Permissions Regression...');

  setSession(superAdminToken);
  const saPayRes = await listAllPaymentsAction();
  if (!saPayRes.success) {
    console.error('FAILED: SUPER_ADMIN failed listAllPaymentsAction regression test!');
    process.exit(1);
  }
  console.log('[PASS] SUPER_ADMIN retains full permissions across platform');

  setSession(adminToken);
  const adminPayRes = await listAllPaymentsAction();
  if (!adminPayRes.success) {
    console.error('FAILED: ADMIN failed listAllPaymentsAction regression test!');
    process.exit(1);
  }
  console.log('[PASS] ADMIN retains operational permissions across platform');

  console.log('\n====================================================');
  console.log('  ALL MANAGER AUTHORIZATION ROLE TESTS PASSED!');
  console.log('====================================================');
}

runManagerRoleTestSuite().catch((err) => {
  console.error('Error running Manager authorization test suite:', err);
  process.exit(1);
});
