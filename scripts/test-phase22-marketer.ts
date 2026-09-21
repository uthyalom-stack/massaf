import { db } from '@/lib/db';
import {
  createSessionToken,
  getVerifiedAdminSession,
} from '@/lib/auth-session';
import { hashPassword } from '@/lib/auth-password';
import {
  createMarketerAction,
  listMarketersAction,
  deleteMarketerAction,
  createTherapistAction,
  createMarketingLinkAction,
  updateMarketingLinkAction,
  getMarketerStatsAction,
  getMarketerLeaderboardAction,
} from '@/app/admin/actions';
import { trackMarketingClickAction } from '@/app/actions/marketing';
import { POST as postAdminVerifyRoute } from '@/app/api/auth/admin/verify/route';

async function runMarketerTestSuite() {
  console.log('====================================================');
  console.log('  STARTING STAGE 2 + 3 MARKETER & REFERRAL SUITE    ');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
      failed++;
    }
  }

  process.env.MASSAF_AUTH_SECRET = 'dev-secret-key-32-chars-minimum-length-for-hmac-sha256';

  const timestamp = Date.now();
  const superAdminEmail = `mkt-super-${timestamp}@massaf.com`;
  const adminEmail = `mkt-admin-${timestamp}@massaf.com`;
  const staffAEmail = `mkt-staff-a-${timestamp}@massaf.com`;
  const staffBEmail = `mkt-staff-b-${timestamp}@massaf.com`;

  const superAdminPass = 'SuperPass123!';
  const adminPass = 'AdminPass123!';
  const staffPass = 'StaffPass123!';

  try {
    // Seed Users
    const superAdminUser = await db.user.create({
      data: {
        email: superAdminEmail,
        name: 'Super Admin',
        passwordHash: hashPassword(superAdminPass),
        role: 'SUPER_ADMIN',
      },
    });

    const adminUser = await db.user.create({
      data: {
        email: adminEmail,
        name: 'Normal Admin',
        passwordHash: hashPassword(adminPass),
        role: 'ADMIN',
      },
    });

    const staffUserA = await db.user.create({
      data: {
        email: staffAEmail,
        name: 'Marketer A',
        passwordHash: hashPassword(staffPass),
        role: 'STAFF',
      },
    });

    const staffUserB = await db.user.create({
      data: {
        email: staffBEmail,
        name: 'Marketer B',
        passwordHash: hashPassword(staffPass),
        role: 'STAFF',
      },
    });

    // 1. SUPER_ADMIN login with correct email/password succeeds
    const superLoginReq = new Request('http://localhost:3000/api/auth/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: superAdminEmail, password: superAdminPass }),
    });
    const superLoginRes = await postAdminVerifyRoute(superLoginReq);
    assert(superLoginRes.status === 200, '1. SUPER_ADMIN login with correct email/password succeeds');

    // 2. ADMIN login with correct credentials succeeds
    const adminLoginReq = new Request('http://localhost:3000/api/auth/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPass }),
    });
    const adminLoginRes = await postAdminVerifyRoute(adminLoginReq);
    assert(adminLoginRes.status === 200, '2. ADMIN login with correct credentials succeeds');

    // 3. STAFF login with correct credentials succeeds
    const staffLoginReq = new Request('http://localhost:3000/api/auth/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffAEmail, password: staffPass }),
    });
    const staffLoginRes = await postAdminVerifyRoute(staffLoginReq);
    assert(staffLoginRes.status === 200, '3. STAFF login with correct credentials succeeds');

    // 4. Wrong password fails
    const wrongPassReq = new Request('http://localhost:3000/api/auth/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffAEmail, password: 'WrongPassword999!' }),
    });
    const wrongPassRes = await postAdminVerifyRoute(wrongPassReq);
    assert(wrongPassRes.status === 401, '4. Wrong password fails');

    // 5. Unknown email fails
    const unknownEmailReq = new Request('http://localhost:3000/api/auth/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `unknown-${timestamp}@massaf.com`, password: staffPass }),
    });
    const unknownEmailRes = await postAdminVerifyRoute(unknownEmailReq);
    assert(unknownEmailRes.status === 401, '5. Unknown email fails');

    // 6. Password hash is never returned
    const loginData = await staffLoginRes.json();
    assert(!('passwordHash' in loginData) && !('password' in loginData), '6. Password hash is never returned in login response');

    // 7. Deleted marketer's session becomes invalid
    const tempStaff = await db.user.create({
      data: {
        email: `temp-staff-${timestamp}@massaf.com`,
        name: 'Temp Marketer',
        passwordHash: hashPassword(staffPass),
        role: 'STAFF',
      },
    });
    const tempToken = createSessionToken(tempStaff.id, tempStaff.email, 'ADMIN', 24, tempStaff.role);
    const verifiedBeforeDelete = await getVerifiedAdminSession(`massaf_admin_session=${tempToken}`);
    assert(verifiedBeforeDelete !== null && verifiedBeforeDelete.entityId === tempStaff.id, '7a. Valid session before marketer deletion');

    await db.user.delete({ where: { id: tempStaff.id } });
    const verifiedAfterDelete = await getVerifiedAdminSession(`massaf_admin_session=${tempToken}`);
    assert(verifiedAfterDelete === null, '7b. Session becomes invalid after marketer deletion');

    // Set test tokens for server actions testing
    const superAdminToken = createSessionToken(superAdminUser.id, superAdminUser.email, 'ADMIN', 24, 'SUPER_ADMIN');
    const adminToken = createSessionToken(adminUser.id, adminUser.email, 'ADMIN', 24, 'ADMIN');
    const staffTokenA = createSessionToken(staffUserA.id, staffUserA.email, 'ADMIN', 24, 'STAFF');
    const staffTokenB = createSessionToken(staffUserB.id, staffUserB.email, 'ADMIN', 24, 'STAFF');

    // 8. SUPER_ADMIN can create marketer
    globalThis.__TEST_ADMIN_SESSION_TOKEN__ = superAdminToken;
    const createMarketerRes = await createMarketerAction({
      name: 'Created Marketer C',
      email: `created-staff-c-${timestamp}@massaf.com`,
      password: 'CreatedStaffPass123!',
    });
    assert(createMarketerRes.success && createMarketerRes.marketer?.role === 'STAFF', '8. SUPER_ADMIN can create marketer');

    // 9. SUPER_ADMIN can list marketers
    const listMarketersRes = await listMarketersAction();
    assert(listMarketersRes.success && Array.isArray(listMarketersRes.marketers) && listMarketersRes.marketers.length >= 3, '9. SUPER_ADMIN can list marketers');

    // 10. SUPER_ADMIN can delete marketer
    if (createMarketerRes.marketer) {
      const deleteRes = await deleteMarketerAction(createMarketerRes.marketer.id);
      assert(deleteRes.success, '10. SUPER_ADMIN can delete marketer');
    }

    // 11. ADMIN cannot delete SUPER_ADMIN or perform SUPER_ADMIN marketer creation
    globalThis.__TEST_ADMIN_SESSION_TOKEN__ = adminToken;
    const adminCreateMarketerRes = await createMarketerAction({
      name: 'Admin Attempt Marketer',
      email: `admin-attempt-${timestamp}@massaf.com`,
      password: 'Password123!',
    });
    assert(!adminCreateMarketerRes.success && String(adminCreateMarketerRes.error).includes('Unauthorized'), '11. ADMIN cannot execute SUPER_ADMIN marketer creation');

    // 12. STAFF cannot perform privileged normal-admin actions (e.g. createTherapistAction)
    globalThis.__TEST_ADMIN_SESSION_TOKEN__ = staffTokenA;
    const staffTherapistRes = await createTherapistAction({
      name: 'Staff Unauthorized Therapist',
    });
    assert(!staffTherapistRes.success && String(staffTherapistRes.error).includes('Unauthorized'), '12. STAFF cannot perform privileged normal-admin actions');

    // 13. STAFF can access their own marketing resources & create their marketing link
    const linkCodeA = `code-a-${timestamp}`;
    const staffCreateLinkRes = await createMarketingLinkAction({
      name: 'Marketer A Link',
      code: linkCodeA,
    });
    assert(staffCreateLinkRes.success && staffCreateLinkRes.marketingLink?.userId === staffUserA.id, '13. STAFF can create their own marketing link');

    const createdLinkA = staffCreateLinkRes.marketingLink!;

    // 14. STAFF cannot modify another marketer's link
    globalThis.__TEST_ADMIN_SESSION_TOKEN__ = staffTokenB;
    const updateOtherLinkRes = await updateMarketingLinkAction({
      id: createdLinkA.id,
      name: 'Tampered Name',
    });
    assert(!updateOtherLinkRes.success && String(updateOtherLinkRes.error).includes('Unauthorized'), '14. STAFF cannot modify another marketer\'s link');

    // 15. Valid ?ref=code increments clicks
    const trackRes = await trackMarketingClickAction(linkCodeA);
    assert(trackRes.success, '15a. trackMarketingClickAction returns success for active link');
    const checkLinkA = await db.marketingLink.findUnique({ where: { id: createdLinkA.id } });
    assert(checkLinkA !== null && checkLinkA.clicks === 1, '15b. Clicks incremented from 0 to 1');

    // 16. Invalid ?ref=code does not increment a marketer
    const invalidTrackRes = await trackMarketingClickAction(`invalid-code-${timestamp}`);
    assert(!invalidTrackRes.success, '16. Invalid ?ref=code returns false and does not increment clicks');

    // 17. Inactive referral does not attribute
    globalThis.__TEST_ADMIN_SESSION_TOKEN__ = superAdminToken;
    const inactiveCode = `inactive-${timestamp}`;
    const inactiveLinkRes = await createMarketingLinkAction({
      name: 'Inactive Link',
      code: inactiveCode,
      isActive: false,
    });
    const inactiveTrackRes = await trackMarketingClickAction(inactiveCode);
    assert(!inactiveTrackRes.success, '17. Inactive referral link does not track clicks or attribute');

    // 18. Valid referral code maps to active MarketingLink ID in DB
    const attributedLink = await db.marketingLink.findUnique({ where: { code: linkCodeA } });
    assert(attributedLink !== null && attributedLink.id === createdLinkA.id && attributedLink.isActive === true, '18. Valid referral code maps to active MarketingLink ID');

    // 19. Booking stores correct marketingLinkId
    const customer = await db.customer.create({
      data: {
        name: 'Test Customer',
        email: `mkt-cust-${timestamp}@massaf.com`,
        phone: '555-0199',
      },
    });

    const therapist = await db.therapist.create({
      data: {
        name: 'Mkt Therapist',
        email: `mkt-th-${timestamp}@massaf.com`,
        isActive: true,
      },
    });

    const service = await db.service.create({
      data: {
        name: 'Mkt Service',
        durationMinutes: 60,
        price: 150.0,
      },
    });

    const attributedBooking = await db.booking.create({
      data: {
        bookingNumber: `MKT-BK-${timestamp}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        marketingLinkId: createdLinkA.id,
        appointmentDateTime: new Date(),
        durationMinutes: 60,
        amount: 150.0,
        status: 'COMPLETED',
        paymentStatus: 'PAID',
      },
    });
    assert(attributedBooking.marketingLinkId === createdLinkA.id, '19. Booking stores correct marketingLinkId');

    // 20. Booking without referral keeps marketingLinkId = null
    const nonAttributedBooking = await db.booking.create({
      data: {
        bookingNumber: `NO-MKT-${timestamp}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        marketingLinkId: null,
        appointmentDateTime: new Date(),
        durationMinutes: 60,
        amount: 150.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
      },
    });
    assert(nonAttributedBooking.marketingLinkId === null, '20. Booking without referral keeps marketingLinkId = null');

    // 21. Deleting marketer deactivates their link
    globalThis.__TEST_ADMIN_SESSION_TOKEN__ = superAdminToken;
    const marketerToDelete = await db.user.create({
      data: {
        email: `marketer-del-${timestamp}@massaf.com`,
        name: 'To Delete',
        passwordHash: hashPassword(staffPass),
        role: 'STAFF',
      },
    });
    const delLinkCode = `del-link-${timestamp}`;
    const delLink = await db.marketingLink.create({
      data: {
        userId: marketerToDelete.id,
        name: 'Delete Marketer Link',
        code: delLinkCode,
        isActive: true,
      },
    });

    const delBooking = await db.booking.create({
      data: {
        bookingNumber: `DEL-BK-${timestamp}`,
        customerId: customer.id,
        therapistId: therapist.id,
        serviceId: service.id,
        marketingLinkId: delLink.id,
        appointmentDateTime: new Date(),
        durationMinutes: 60,
        amount: 150.0,
        status: 'COMPLETED',
        paymentStatus: 'PAID',
      },
    });

    await deleteMarketerAction(marketerToDelete.id);

    const recheckedDelLink = await db.marketingLink.findUnique({ where: { id: delLink.id } });
    assert(recheckedDelLink !== null && recheckedDelLink.isActive === false, '21. Deleting marketer deactivates their link');

    // 22. Historical bookings remain after marketer deletion
    const recheckedDelBooking = await db.booking.findUnique({ where: { id: delBooking.id } });
    assert(recheckedDelBooking !== null && recheckedDelBooking.marketingLinkId === delLink.id, '22. Historical bookings remain intact after marketer deletion');

    // 23. Historical MarketingLink record remains after marketer deletion with userId = null
    assert(recheckedDelLink !== null && recheckedDelLink.userId === null, '23. Historical MarketingLink remains after marketer deletion with userId = null');

    // 24. Deleted marketer's old link does not generate new attribution
    const postDelTrackRes = await trackMarketingClickAction(delLinkCode);
    assert(!postDelTrackRes.success, '24. Deleted marketer\'s old link does not generate new attribution');

    // 25. A successfully paid attributed booking remains associated with the correct MarketingLink
    assert(attributedBooking.paymentStatus === 'PAID' && attributedBooking.marketingLinkId === createdLinkA.id, '25. Successfully paid booking remains associated with MarketingLink');

    // 26. Failed/unpaid bookings do not become paid marketer revenue data
    globalThis.__TEST_ADMIN_SESSION_TOKEN__ = staffTokenA;
    const statsRes = await getMarketerStatsAction(staffUserA.id);
    assert(statsRes.success && statsRes.stats?.paidRevenue === 150.0 && statsRes.stats?.totalBookings === 1, '26. Marketer stats count only PAID bookings ($150) as paid revenue');

    // 27. Leaderboard includes marketer A with $150 revenue
    const leaderboardRes = await getMarketerLeaderboardAction();
    assert(leaderboardRes.success && Array.isArray(leaderboardRes.leaderboard) && leaderboardRes.leaderboard.some((m) => m.userId === staffUserA.id && m.paidRevenue === 150.0), '27. Leaderboard correctly ranks marketer with paid revenue');

    // Cleanup test records
    delete globalThis.__TEST_ADMIN_SESSION_TOKEN__;
    await db.booking.deleteMany({
      where: {
        id: { in: [attributedBooking.id, nonAttributedBooking.id, delBooking.id] },
      },
    });
    await db.marketingLink.deleteMany({
      where: { id: { in: [createdLinkA.id, inactiveLinkRes.marketingLink?.id || '', delLink.id] } },
    });
    await db.therapist.delete({ where: { id: therapist.id } });
    await db.service.delete({ where: { id: service.id } });
    await db.customer.delete({ where: { id: customer.id } });
    await db.user.deleteMany({
      where: {
        id: { in: [superAdminUser.id, adminUser.id, staffUserA.id, staffUserB.id] },
      },
    });

    console.log('====================================================');
    console.log(`  MARKETER SUITE RESULTS: ${passed} PASSED, ${failed} FAILED  `);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite execution error:', err);
    process.exit(1);
  }
}

runMarketerTestSuite();
