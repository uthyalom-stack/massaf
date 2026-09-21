import assert from 'assert';
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth-password';
import { createSessionToken } from '../src/lib/auth-session';
import { POST as postAdminVerifyRoute } from '../src/app/api/auth/admin/verify/route';
import { getActiveTherapists, getActiveTherapistById } from '../src/lib/db-therapists';
import {
  addTherapistPhotoAction,
  removeTherapistPhotoAction,
  addTherapistAvailabilityAction,
  addServiceAreaAction,
  createServiceCategoryAction,
  createGlobalServiceAction,
  createTestimonialAction,
  deleteTestimonialAction,
  updateSiteContentAction,
} from '../src/app/admin/actions';

async function runPhase21Tests() {
  console.log('====================================================');
  console.log('  STARTING PHASE 21 COMPREHENSIVE TEST SUITE       ');
  console.log('====================================================');

  const timestamp = Date.now();
  const testAdminEmail = `p21-admin-${timestamp}@massaf.com`;
  const testAdminPass = 'SuperSecretPass123!';

  process.env.MASSAF_AUTH_SECRET = 'dev-secret-key-32-chars-minimum-length-for-hmac-sha256';
  process.env.MASSAF_ADMIN_API_KEY = 'dev-admin-api-key-secret-32-chars';

  try {
    // Seed Admin with hashed password
    const adminUser = await db.user.create({
      data: {
        email: testAdminEmail,
        name: 'Phase 21 Admin',
        passwordHash: hashPassword(testAdminPass),
        role: 'SUPER_ADMIN',
      },
    });

    const adminToken = createSessionToken(adminUser.id, adminUser.email, 'ADMIN', 24, adminUser.role);
    globalThis.__TEST_ADMIN_SESSION_TOKEN__ = adminToken;

    // Test 1: Admin Password Auth Succeeded with correct password
    {
      const req = new Request('http://localhost:3000/api/auth/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testAdminEmail, password: testAdminPass }),
      });
      const res = await postAdminVerifyRoute(req);
      assert.strictEqual(res.status, 200, 'Valid admin password must return 200');
      console.log('✓ Test 1 Passed: Admin password auth verified successfully');
    }

    // Test 2: Invalid password rejected with 401
    {
      const req = new Request('http://localhost:3000/api/auth/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testAdminEmail, password: 'WrongPassword!' }),
      });
      const res = await postAdminVerifyRoute(req);
      assert.strictEqual(res.status, 401, 'Invalid password must return 401');
      console.log('✓ Test 2 Passed: Wrong password rejected with 401');
    }

    // Test 3: Public Therapist Privacy Stripping
    const therapist = await db.therapist.create({
      data: {
        name: 'Private Details Therapist',
        email: `private-th-${timestamp}@example.com`,
        phone: '555-123-4567',
        telegramChatId: '987654321',
        isActive: true,
      },
    });

    {
      const activeList = await getActiveTherapists();
      const publicTherapist = activeList.find((t) => t.id === therapist.id);
      assert.ok(publicTherapist, 'Therapist must be present in active list');
      assert.strictEqual((publicTherapist as unknown as { email?: string }).email, undefined, 'email must be stripped');
      assert.strictEqual((publicTherapist as unknown as { phone?: string }).phone, undefined, 'phone must be stripped');
      assert.strictEqual((publicTherapist as unknown as { telegramChatId?: string }).telegramChatId, undefined, 'telegramChatId must be stripped');

      const byId = await getActiveTherapistById(therapist.id);
      assert.strictEqual((byId as unknown as { email?: string }).email, undefined);
      assert.strictEqual((byId as unknown as { phone?: string }).phone, undefined);
      assert.strictEqual((byId as unknown as { telegramChatId?: string }).telegramChatId, undefined);
      console.log('✓ Test 3 Passed: Public therapist serializers strictly strip private email, phone, and telegramChatId');
    }

    // Test 4: Gallery Multi-Photo Upload & Preserved Deletion
    {
      const p1 = await addTherapistPhotoAction(therapist.id, { url: 'https://images.unsplash.com/p1', sortOrder: 1 });
      const p2 = await addTherapistPhotoAction(therapist.id, { url: 'https://images.unsplash.com/p2', sortOrder: 2 });
      const p3 = await addTherapistPhotoAction(therapist.id, { url: 'https://images.unsplash.com/p3', sortOrder: 3 });

      assert.strictEqual(p1.success, true);
      assert.strictEqual(p2.success, true);
      assert.strictEqual(p3.success, true);

      const countBefore = await db.therapistPhoto.count({ where: { therapistId: therapist.id } });
      assert.strictEqual(countBefore, 3, '3 photos must be stored');

      // Delete photo 2
      const delRes = await removeTherapistPhotoAction(therapist.id, p2.photo!.id);
      assert.strictEqual(delRes.success, true);

      const remaining = await db.therapistPhoto.findMany({ where: { therapistId: therapist.id } });
      assert.strictEqual(remaining.length, 2, '2 photos must remain');
      assert.ok(remaining.some((p) => p.id === p1.photo!.id));
      assert.ok(remaining.some((p) => p.id === p3.photo!.id));
      console.log('✓ Test 4 Passed: Multi-photo gallery appends photos and deleting one preserves the rest');
    }

    // Test 5: Availability Schedule Day Range Expansion
    {
      // Mon (1) to Thu (4) from 09:00 to 17:00
      const res = await addTherapistAvailabilityAction(therapist.id, {
        startDayOfWeek: 1,
        endDayOfWeek: 4,
        startTime: '09:00',
        endTime: '17:00',
      });

      assert.strictEqual(res.success, true);

      const availList = await db.therapistAvailability.findMany({ where: { therapistId: therapist.id } });
      const days = availList.map((a) => a.dayOfWeek).sort();
      assert.deepStrictEqual(days, [1, 2, 3, 4]);
      console.log('✓ Test 5 Passed: Availability schedule day range Mon -> Thu expanded into 4 daily records');
    }

    // Test 6: Bulk ZIP Code Service Area Entry
    {
      const res = await addServiceAreaAction(therapist.id, {
        cityName: 'Pasadena',
        state: 'CA',
        zipCode: '91101, 91102, 91103',
      });

      assert.strictEqual(res.success, true);

      const areas = await db.serviceArea.findMany({ where: { therapistId: therapist.id } });
      const zips = areas.map((a) => a.zipCode).sort();
      assert.deepStrictEqual(zips, ['91101', '91102', '91103']);
      console.log('✓ Test 6 Passed: Bulk ZIP code service area entry created 3 coverage records');
    }

    // Test 7: Service Categories CRUD & Global Service Assignment
    {
      const catRes = await createServiceCategoryAction({
        name: `Therapeutic Sports ${timestamp}`,
        description: 'Recovery massage category',
      });
      assert.strictEqual(catRes.success, true);
      const catId = catRes.category!.id;

      const srvRes = await createGlobalServiceAction({
        name: `Sports Recovery Session ${timestamp}`,
        durationMinutes: 90,
        price: 180,
        categoryId: catId,
      });
      assert.strictEqual(srvRes.success, true);
      assert.strictEqual(srvRes.service!.categoryId, catId);
      console.log('✓ Test 7 Passed: Service Category CRUD and Service assignment verified');
    }

    // Test 8: Admin Promotional Testimonials (Separate from Customer Reviews)
    {
      const testRes = await createTestimonialAction({
        therapistId: therapist.id,
        authorName: 'Alex K.',
        authorLocation: 'Los Angeles, CA',
        rating: 5,
        comment: 'Outstanding massage therapist for sports recovery!',
      });

      assert.strictEqual(testRes.success, true);
      const testId = testRes.testimonial!.id;

      const storedTest = await db.testimonial.findUnique({ where: { id: testId } });
      assert.ok(storedTest, 'Testimonial must exist in db.testimonial model');
      assert.strictEqual(storedTest?.authorName, 'Alex K.');

      const delTest = await deleteTestimonialAction(testId);
      assert.strictEqual(delTest.success, true);
      console.log('✓ Test 8 Passed: Admin promotional testimonials stored in Testimonial model separately from customer reviews');
    }

    // Test 9: Site Content CMS Updates
    {
      const contentRes = await updateSiteContentAction('privacy', 'Privacy Policy', 'MASSAF Privacy Policy text.');
      assert.strictEqual(contentRes.success, true);

      const checkContent = await db.siteContent.findUnique({ where: { key: 'privacy' } });
      assert.strictEqual(checkContent?.title, 'Privacy Policy');
      console.log('✓ Test 9 Passed: Site content CMS updated successfully');
    }

    // Cleanup
    await db.therapistPhoto.deleteMany({ where: { therapistId: therapist.id } });
    await db.therapistAvailability.deleteMany({ where: { therapistId: therapist.id } });
    await db.serviceArea.deleteMany({ where: { therapistId: therapist.id } });
    await db.therapist.delete({ where: { id: therapist.id } });
    await db.user.delete({ where: { id: adminUser.id } });

    console.log('====================================================');
    console.log('  ALL PHASE 21 TESTS PASSED SUCCESSFULLY!          ');
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Phase 21 Test Suite Failed:', err);
    process.exit(1);
  }
}

runPhase21Tests();
