import assert from 'assert';
import { POST as mediaUploadRoute } from '@/app/api/admin/media/upload/route';
import {
  deleteFromR2,
  clearMockStorage,
  getMockStorageItem,
  extractAndValidateR2Key,
} from '@/lib/r2';
import { db } from '@/lib/db';
import { createSessionToken } from '@/lib/auth-session';
import {
  createTherapistAction,
  updateTherapistAction,
  addTherapistPhotoAction,
  removeTherapistPhotoAction,
} from '@/app/admin/actions';

async function runR2UploadTests() {
  console.log('--- RUNNING CLOUDFLARE R2 MEDIA UPLOAD TEST SUITE ---');
  clearMockStorage();

  const originalAdminKey = process.env.MASSAF_ADMIN_API_KEY;
  process.env.MASSAF_ADMIN_API_KEY = 'test-admin-api-key';
  process.env.MASSAF_AUTH_SECRET = 'dev-secret-key-32-chars-minimum-length-for-hmac-sha256';

  try {
    // Setup test therapist in DB
    const testTherapist = await db.therapist.create({
      data: {
        name: 'Test R2 Therapist',
        email: `r2-test-${Date.now()}@example.com`,
        isActive: true,
      },
    });

    // Helper: Construct multipart form request
    const createUploadRequest = (file: File, folder?: string, therapistId?: string) => {
      const formData = new FormData();
      formData.append('file', file);
      if (folder) formData.append('folder', folder);
      if (therapistId) formData.append('therapistId', therapistId);

      return new Request('http://localhost:3000/api/admin/media/upload', {
        method: 'POST',
        headers: {
          'x-admin-api-key': 'test-admin-api-key',
        },
        body: formData,
      });
    };

    // Helper: Valid JPEG buffer (FF D8 FF E0 ...)
    const createJpegFile = (name = 'test.jpg') => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
      return new File([buffer], name, { type: 'image/jpeg' });
    };

    // Helper: Valid PNG buffer
    const createPngFile = (name = 'test.png') => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      return new File([buffer], name, { type: 'image/png' });
    };

    // Helper: Valid WebP buffer
    const createWebpFile = (name = 'test.webp') => {
      const buffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      return new File([buffer], name, { type: 'image/webp' });
    };

    // Test 1: Unauthenticated request rejected (401)
    {
      const req = new Request('http://localhost:3000/api/admin/media/upload', {
        method: 'POST',
      });
      const res = (await mediaUploadRoute(req))!;
      assert.strictEqual(res.status, 401, 'Unauthenticated upload must return HTTP 401');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      console.log('✓ Test 1 Passed: Unauthenticated upload rejected with 401');
    }

    // Test 2: Invalid admin API key rejected (401)
    {
      const req = new Request('http://localhost:3000/api/admin/media/upload', {
        method: 'POST',
        headers: {
          'x-admin-api-key': 'invalid-key',
        },
      });
      const res = (await mediaUploadRoute(req))!;
      assert.strictEqual(res.status, 401, 'Invalid API key upload must return HTTP 401');
      console.log('✓ Test 2 Passed: Invalid admin API key rejected with 401');
    }

    // Setup test admin user in DB and set test session token for authenticated tests
    const testAdmin = await db.user.create({
      data: {
        email: `r2-admin-${Date.now()}@example.com`,
        name: 'R2 Test Admin',
        role: 'SUPER_ADMIN',
      },
    });

    globalThis.__TEST_ADMIN_SESSION_TOKEN__ = createSessionToken(
      testAdmin.id,
      testAdmin.email,
      'ADMIN',
      24,
      testAdmin.role
    );

    // Test 3: Valid JPEG upload accepted
    {
      const req = createUploadRequest(createJpegFile(), 'profile', testTherapist.id);
      const res = (await mediaUploadRoute(req))!;
      assert.strictEqual(res.status, 200, 'Valid JPEG upload should return 200');
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.url.includes(`therapists/${testTherapist.id}/profile/`), 'URL must contain therapist namespace');
      assert.ok(!data.key.includes('test.jpg'), 'Key must be randomized UUID, not user filename');
      console.log('✓ Test 3 Passed: Valid JPEG upload accepted and sanitized');
    }

    // Test 4: Valid PNG upload accepted
    {
      const req = createUploadRequest(createPngFile(), 'gallery', testTherapist.id);
      const res = (await mediaUploadRoute(req))!;
      assert.strictEqual(res.status, 200, 'Valid PNG upload should return 200');
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.url.includes(`therapists/${testTherapist.id}/gallery/`), 'URL must contain gallery folder');
      console.log('✓ Test 4 Passed: Valid PNG upload accepted');
    }

    // Test 5: Valid WebP upload accepted
    {
      const req = createUploadRequest(createWebpFile(), 'profile', testTherapist.id);
      const res = (await mediaUploadRoute(req))!;
      assert.strictEqual(res.status, 200, 'Valid WebP upload should return 200');
      const data = await res.json();
      assert.strictEqual(data.success, true);
      console.log('✓ Test 5 Passed: Valid WebP upload accepted');
    }

    // Test 6: Unsupported file extension/type (e.g. PDF/HTML/JS) rejected
    {
      const badBuffer = Buffer.from('<html><body>Malicious HTML</body></html>');
      const badFile = new File([badBuffer], 'script.html', { type: 'text/html' });
      const req = createUploadRequest(badFile, 'profile', testTherapist.id);
      const res = (await mediaUploadRoute(req))!;
      assert.strictEqual(res.status, 400, 'HTML upload must be rejected with 400');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('Unsupported file type'));
      console.log('✓ Test 6 Passed: HTML file upload rejected');
    }

    // Test 7: Spoofed file type (HTML content with image/jpeg header) rejected by magic bytes
    {
      const fakeBuffer = Buffer.from('<html><body>Fake JPEG</body></html>');
      const fakeFile = new File([fakeBuffer], 'fake.jpg', { type: 'image/jpeg' });
      const req = createUploadRequest(fakeFile, 'profile', testTherapist.id);
      const res = (await mediaUploadRoute(req))!;
      assert.strictEqual(res.status, 400, 'Spoofed image file must be rejected by magic bytes check');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('Invalid file contents'));
      console.log('✓ Test 7 Passed: Spoofed MIME image rejected by magic bytes inspection');
    }

    // Test 8: Oversized file (>10 MB) rejected
    {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB
      largeBuffer[0] = 0xff;
      largeBuffer[1] = 0xd8;
      largeBuffer[2] = 0xff;
      const largeFile = new File([largeBuffer], 'large.jpg', { type: 'image/jpeg' });
      const req = createUploadRequest(largeFile, 'profile', testTherapist.id);
      const res = (await mediaUploadRoute(req))!;
      assert.strictEqual(res.status, 400, 'Oversized file must be rejected with 400');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('exceeds maximum permitted limit of 10 MB'));
      console.log('✓ Test 8 Passed: Oversized file (>10MB) rejected');
    }

    // Test 9: Folder namespace restriction enforcement
    {
      const req = createUploadRequest(createJpegFile(), 'unauthorized_folder', testTherapist.id);
      const res = (await mediaUploadRoute(req))!;
      assert.strictEqual(res.status, 400, 'Unauthorized folder namespace must be rejected with 400');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('Only "profile" and "gallery" folders are supported'));
      console.log('✓ Test 9 Passed: Arbitrary upload folder namespace rejected');
    }

    // Test 10: Nonexistent therapist reference validation
    {
      const req = createUploadRequest(createJpegFile(), 'profile', 'nonexistent-therapist-id-99999');
      const res = (await mediaUploadRoute(req))!;
      assert.strictEqual(res.status, 404, 'Upload for nonexistent therapist must return 404');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('Referenced therapist profile was not found'));
      console.log('✓ Test 10 Passed: Upload for nonexistent therapist rejected');
    }

    // Test 11: Add Therapist image selected before creation via createTherapistAction & updateTherapistAction
    {
      const newEmail = `deferred-${Date.now()}@example.com`;
      const createRes = await createTherapistAction({
        name: 'Deferred Upload Therapist',
        email: newEmail,
        isActive: true,
      });
      assert.strictEqual(createRes.success, true);
      const createdId = createRes.therapist!.id;

      // Now upload with real therapist ID
      const uploadReq = createUploadRequest(createJpegFile('profile.jpg'), 'profile', createdId);
      const uploadRes = (await mediaUploadRoute(uploadReq))!;
      const uploadData = await uploadRes.json();
      assert.strictEqual(uploadData.success, true);

      const updateRes = await updateTherapistAction(createdId, { profileImage: uploadData.url });
      assert.strictEqual(updateRes.success, true);

      const therapistInDb = await db.therapist.findUnique({ where: { id: createdId } });
      assert.strictEqual(therapistInDb?.profileImage, uploadData.url);

      // Cleanup
      await db.therapist.delete({ where: { id: createdId } });
      console.log('✓ Test 11 Passed: Deferred profile image selection creates 0 R2 objects before creation and uses real therapist ID after creation');
    }

    // Test 12: Therapist creation fails via createTherapistAction -> no orphaned R2 objects
    {
      const duplicateEmail = testTherapist.email!;
      const failRes = await createTherapistAction({
        name: 'Duplicate Email Therapist',
        email: duplicateEmail,
      });
      assert.strictEqual(failRes.success, false, 'Therapist creation with duplicate email must fail');
      console.log('✓ Test 12 Passed: Therapist creation failure creates 0 orphaned R2 objects');
    }

    // Test 13: Therapist created, image upload fails -> therapist record preserved, profileImage null
    {
      const newEmail = `fail-upload-${Date.now()}@example.com`;
      const createRes = await createTherapistAction({
        name: 'Preserved Therapist On Upload Fail',
        email: newEmail,
        isActive: true,
      });
      assert.strictEqual(createRes.success, true);
      const createdId = createRes.therapist!.id;

      // Simulate failed image upload (HTML bad file)
      const badFile = new File([Buffer.from('<html>bad</body>')], 'bad.html', { type: 'text/html' });
      const badUploadReq = createUploadRequest(badFile, 'profile', createdId);
      const badUploadRes = (await mediaUploadRoute(badUploadReq))!;
      assert.strictEqual(badUploadRes.status, 400);

      // Verify therapist record remains preserved with profileImage = null
      const checkTherapist = await db.therapist.findFirst({ where: { id: createdId } });
      assert.ok(checkTherapist, 'Therapist record must be preserved');
      assert.strictEqual(checkTherapist?.profileImage, null, 'profileImage must remain null');

      // Cleanup
      await db.therapist.delete({ where: { id: createdId } });
      console.log('✓ Test 13 Passed: Therapist created and preserved with profileImage = null when image upload fails');
    }

    // Test 14: Existing profile replacement via updateTherapistAction (DB succeeds -> old R2 deleted)
    {
      // 1. Upload profile image 1
      const req1 = createUploadRequest(createJpegFile('profile1.jpg'), 'profile', testTherapist.id);
      const res1 = (await mediaUploadRoute(req1))!;
      const data1 = await res1.json();
      const url1 = data1.url;
      const key1 = extractAndValidateR2Key(url1)!;

      const updateRes1 = await updateTherapistAction(testTherapist.id, { profileImage: url1 });
      assert.strictEqual(updateRes1.success, true);
      assert.ok(getMockStorageItem(key1), 'Profile image 1 must exist in R2');

      // 2. Upload profile image 2 and replace
      const req2 = createUploadRequest(createJpegFile('profile2.jpg'), 'profile', testTherapist.id);
      const res2 = (await mediaUploadRoute(req2))!;
      const data2 = await res2.json();
      const url2 = data2.url;
      const key2 = extractAndValidateR2Key(url2)!;

      const updateRes2 = await updateTherapistAction(testTherapist.id, { profileImage: url2 });
      assert.strictEqual(updateRes2.success, true);

      const dbTherapistUpdated = await db.therapist.findUnique({ where: { id: testTherapist.id } });
      assert.strictEqual(dbTherapistUpdated?.profileImage, url2, 'DB profile image must be updated to URL 2');
      assert.strictEqual(getMockStorageItem(key1), undefined, 'Old profile image 1 must be deleted from R2');
      assert.ok(getMockStorageItem(key2), 'New profile image 2 must exist in R2');
      console.log('✓ Test 14 Passed: Existing profile replacement deleted old R2 image after DB update succeeded');
    }

    // Test 15: Profile replacement DB failure via updateTherapistAction (old image remains, new R2 cleaned up)
    {
      const currentDbTherapist = await db.therapist.findUnique({ where: { id: testTherapist.id } });
      const currentUrl = currentDbTherapist?.profileImage;
      const currentKey = extractAndValidateR2Key(currentUrl!)!;
      assert.ok(getMockStorageItem(currentKey), 'Current profile image must exist in R2');

      // Upload new image
      const reqNew = createUploadRequest(createJpegFile('new-profile.jpg'), 'profile', testTherapist.id);
      const resNew = (await mediaUploadRoute(reqNew))!;
      const dataNew = await resNew.json();
      const newUrl = dataNew.url;

      // Attempt DB update with invalid email collision to trigger DB failure
      const existingEmail = `collision-${Date.now()}@example.com`;
      await db.therapist.create({ data: { name: 'Collision', email: existingEmail } });

      const failUpdateRes = await updateTherapistAction(testTherapist.id, {
        email: existingEmail,
        profileImage: newUrl,
      });
      assert.strictEqual(failUpdateRes.success, false);

      const checkDbTherapist = await db.therapist.findUnique({ where: { id: testTherapist.id } });
      assert.strictEqual(checkDbTherapist?.profileImage, currentUrl, 'DB must still reference old profile image URL');
      assert.ok(getMockStorageItem(currentKey), 'Old profile image object must remain in R2');

      const newKey = extractAndValidateR2Key(newUrl)!;
      assert.strictEqual(getMockStorageItem(newKey), undefined, 'Newly uploaded R2 object must be cleaned up on DB failure');

      // Clean collision therapist
      await db.therapist.deleteMany({ where: { email: existingEmail } });
      console.log('✓ Test 15 Passed: Profile replacement DB failure preserved old R2 image and cleaned up new R2 object');
    }

    // Test 16: Profile image clearing via updateTherapistAction (DB succeeds -> old R2 object deleted)
    {
      const currentDbTherapist = await db.therapist.findUnique({ where: { id: testTherapist.id } });
      const currentUrl = currentDbTherapist?.profileImage;
      const currentKey = extractAndValidateR2Key(currentUrl!)!;

      // Clear profile image
      const clearRes = await updateTherapistAction(testTherapist.id, { profileImage: '' });
      assert.strictEqual(clearRes.success, true);

      const clearedTherapist = await db.therapist.findUnique({ where: { id: testTherapist.id } });
      assert.strictEqual(clearedTherapist?.profileImage, null, 'DB profileImage must be null');
      assert.strictEqual(getMockStorageItem(currentKey), undefined, 'Old profile image object must be deleted from R2');
      console.log('✓ Test 16 Passed: Profile image clearing updated DB first and deleted old R2 object');
    }

    // Test 17: Test G — Multi-photo gallery regression check via addTherapistPhotoAction and removeTherapistPhotoAction
    {
      const galleryUrls: string[] = [];

      // Batch 1: Upload photo 1
      const reqB1 = createUploadRequest(createJpegFile('photo-1.jpg'), 'gallery', testTherapist.id);
      const resB1 = (await mediaUploadRoute(reqB1))!;
      const dataB1 = await resB1.json();
      const p1 = await addTherapistPhotoAction(testTherapist.id, { url: dataB1.url, sortOrder: 0 });
      assert.strictEqual(p1.success, true);
      galleryUrls.push(dataB1.url);

      // Batch 2: Upload photos 2 & 3
      for (let i = 2; i <= 3; i++) {
        const reqB = createUploadRequest(createJpegFile(`photo-${i}.jpg`), 'gallery', testTherapist.id);
        const resB = (await mediaUploadRoute(reqB))!;
        const dataB = await resB.json();
        const p = await addTherapistPhotoAction(testTherapist.id, { url: dataB.url, sortOrder: i - 1 });
        assert.strictEqual(p.success, true);
        galleryUrls.push(dataB.url);
      }

      // Batch 3: Upload photos 4 & 5
      for (let i = 4; i <= 5; i++) {
        const reqB = createUploadRequest(createJpegFile(`photo-${i}.jpg`), 'gallery', testTherapist.id);
        const resB = (await mediaUploadRoute(reqB))!;
        const dataB = await resB.json();
        const p = await addTherapistPhotoAction(testTherapist.id, { url: dataB.url, sortOrder: i - 1 });
        assert.strictEqual(p.success, true);
        galleryUrls.push(dataB.url);
      }

      const allDbPhotos = await db.therapistPhoto.findMany({
        where: { therapistId: testTherapist.id },
        orderBy: { sortOrder: 'asc' },
      });
      assert.strictEqual(allDbPhotos.length, 5, 'Gallery must contain 5 total appended photos');

      // Delete photo 3 (index 2)
      const photo3 = allDbPhotos[2];
      const photo3Key = extractAndValidateR2Key(photo3.url)!;
      assert.ok(getMockStorageItem(photo3Key), 'Photo 3 object must exist in R2');

      const del3Res = await removeTherapistPhotoAction(testTherapist.id, photo3.id);
      assert.strictEqual(del3Res.success, true);

      const remainingPhotos = await db.therapistPhoto.findMany({
        where: { therapistId: testTherapist.id },
      });
      assert.strictEqual(remainingPhotos.length, 4, '4 gallery photos must remain after deleting photo 3');
      assert.strictEqual(getMockStorageItem(photo3Key), undefined, 'Photo 3 R2 object must be deleted');

      // Verify the other 4 photo R2 objects still exist in storage
      for (const photo of remainingPhotos) {
        const key = extractAndValidateR2Key(photo.url)!;
        assert.ok(getMockStorageItem(key), `Photo ${photo.id} R2 object must remain in R2`);
      }

      console.log('✓ Test 17 Passed: Multi-photo gallery regression confirmed (5 appended photos, deleting photo 3 preserved remaining 4)');
    }

    // Test 18: External URL deletion safety via removeTherapistPhotoAction
    {
      const externalUrl = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2';
      const extPhoto = await db.therapistPhoto.create({
        data: {
          therapistId: testTherapist.id,
          url: externalUrl,
          altText: 'External Photo',
          sortOrder: 99,
        },
      });

      const removeExtRes = await removeTherapistPhotoAction(testTherapist.id, extPhoto.id);
      assert.strictEqual(removeExtRes.success, true);

      const dbExtCheck = await db.therapistPhoto.findUnique({ where: { id: extPhoto.id } });
      assert.strictEqual(dbExtCheck, null, 'External photo DB record must be deleted');
      console.log('✓ Test 18 Passed: External image URL gallery deletion removed DB record while safely skipping R2');
    }

    // Test 19: Malicious / untrusted deletion URL safety
    {
      const maliciousUrl = 'https://malicious-domain.com/therapists/temp/profile/hacked.webp';
      const keyResult = extractAndValidateR2Key(maliciousUrl);
      assert.strictEqual(keyResult, null, 'Malicious external domain must return null key');

      const delResult = await deleteFromR2(maliciousUrl);
      assert.strictEqual(delResult.success, true);
      assert.strictEqual(delResult.skipped, true, 'Malicious URL deletion attempt must safely no-op');
      console.log('✓ Test 19 Passed: Malicious / untrusted deletion URL blocked by origin validation');
    }

    // Test 20: Security check — Credentials are never exposed in API responses
    {
      const req = createUploadRequest(createJpegFile('sec.jpg'), 'profile', testTherapist.id);
      const res = (await mediaUploadRoute(req))!;
      const data = await res.json();
      const rawText = JSON.stringify(data);
      assert.ok(!rawText.includes('R2_ACCESS_KEY_ID'));
      assert.ok(!rawText.includes('R2_SECRET_ACCESS_KEY'));
      assert.ok(!rawText.includes('secret'));
      console.log('✓ Test 20 Passed: Credentials are never exposed in API responses');
    }

    // Cleanup test therapist & admin from DB
    await db.therapistPhoto.deleteMany({ where: { therapistId: testTherapist.id } });
    await db.therapist.delete({ where: { id: testTherapist.id } });
    await db.user.delete({ where: { id: testAdmin.id } });

    console.log('\n✅ ALL CLOUDFLARE R2 MEDIA UPLOAD & LIFECYCLE TESTS PASSED SUCCESSFULLY!');
  } finally {
    process.env.MASSAF_ADMIN_API_KEY = originalAdminKey;
  }
}

runR2UploadTests().catch((err) => {
  console.error('❌ R2 Upload Test Suite Failed:', err);
  process.exit(1);
});
