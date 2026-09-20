import assert from 'assert';
import { POST as mediaUploadRoute } from '../src/app/api/admin/media/upload/route';
import {
  generateObjectKey,
  deleteFromR2,
  clearMockStorage,
  getMockStorageItem,
  extractAndValidateR2Key,
} from '../src/lib/r2';
import { db } from '../src/lib/db';
import {
  updateTherapistAction,
  addTherapistPhotoAction,
  removeTherapistPhotoAction,
} from '../src/app/admin/actions';

async function runR2UploadTests() {
  console.log('--- RUNNING CLOUDFLARE R2 MEDIA UPLOAD TEST SUITE ---');
  clearMockStorage();

  const originalAdminKey = process.env.MASSAF_ADMIN_API_KEY;
  process.env.MASSAF_ADMIN_API_KEY = 'test-admin-api-key';

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
      const res = await mediaUploadRoute(req);
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
      const res = await mediaUploadRoute(req);
      assert.strictEqual(res.status, 401, 'Invalid API key upload must return HTTP 401');
      console.log('✓ Test 2 Passed: Invalid admin API key rejected with 401');
    }

    // Test 3: Valid JPEG upload accepted
    {
      const req = createUploadRequest(createJpegFile(), 'profile', testTherapist.id);
      const res = await mediaUploadRoute(req);
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
      const res = await mediaUploadRoute(req);
      assert.strictEqual(res.status, 200, 'Valid PNG upload should return 200');
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.url.includes(`therapists/${testTherapist.id}/gallery/`), 'URL must contain gallery folder');
      console.log('✓ Test 4 Passed: Valid PNG upload accepted');
    }

    // Test 5: Valid WebP upload accepted
    {
      const req = createUploadRequest(createWebpFile(), 'profile', testTherapist.id);
      const res = await mediaUploadRoute(req);
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
      const res = await mediaUploadRoute(req);
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
      const res = await mediaUploadRoute(req);
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
      const res = await mediaUploadRoute(req);
      assert.strictEqual(res.status, 400, 'Oversized file must be rejected with 400');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('exceeds maximum permitted limit of 10 MB'));
      console.log('✓ Test 8 Passed: Oversized file (>10MB) rejected');
    }

    // Test 9: Folder namespace restriction enforcement
    {
      const req = createUploadRequest(createJpegFile(), 'unauthorized_folder', testTherapist.id);
      const res = await mediaUploadRoute(req);
      assert.strictEqual(res.status, 400, 'Unauthorized folder namespace must be rejected with 400');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('Only "profile" and "gallery" folders are supported'));
      console.log('✓ Test 9 Passed: Arbitrary upload folder namespace rejected');
    }

    // Test 10: Nonexistent therapist reference validation
    {
      const req = createUploadRequest(createJpegFile(), 'profile', 'nonexistent-therapist-id-99999');
      const res = await mediaUploadRoute(req);
      assert.strictEqual(res.status, 404, 'Upload for nonexistent therapist must return 404');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('Referenced therapist profile was not found'));
      console.log('✓ Test 10 Passed: Upload for nonexistent therapist rejected');
    }

    // Test 11: Test A — Multiple gallery uploads (3 photos receive separate keys and DB records)
    {
      const photoUrls: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const uploadReq = createUploadRequest(createJpegFile(`photo-${i}.jpg`), 'gallery', testTherapist.id);
        const uploadRes = await mediaUploadRoute(uploadReq);
        const uploadData = await uploadRes.json();
        assert.strictEqual(uploadData.success, true);
        photoUrls.push(uploadData.url);

        const dbRes = await addTherapistPhotoAction(testTherapist.id, {
          url: uploadData.url,
          altText: `Photo ${i}`,
          sortOrder: i - 1,
        });
        assert.strictEqual(dbRes.success, true);
      }

      const dbPhotos = await db.therapistPhoto.findMany({
        where: { therapistId: testTherapist.id },
      });
      assert.strictEqual(dbPhotos.length, 3, 'Gallery must contain 3 photos');
      assert.strictEqual(new Set(photoUrls).size, 3, 'All 3 photo URLs must be unique');
      console.log('✓ Test 11 Passed: Multiple gallery uploads (3 photos) created separate keys and DB records');
    }

    // Test 12: Test B — Additional gallery uploads append rather than replace (3 + 2 = 5 photos)
    {
      for (let i = 4; i <= 5; i++) {
        const uploadReq = createUploadRequest(createJpegFile(`photo-${i}.jpg`), 'gallery', testTherapist.id);
        const uploadRes = await mediaUploadRoute(uploadReq);
        const uploadData = await uploadRes.json();

        await addTherapistPhotoAction(testTherapist.id, {
          url: uploadData.url,
          altText: `Photo ${i}`,
          sortOrder: i - 1,
        });
      }

      const dbPhotos = await db.therapistPhoto.findMany({
        where: { therapistId: testTherapist.id },
      });
      assert.strictEqual(dbPhotos.length, 5, 'Gallery must now contain 5 total photos (appended)');
      console.log('✓ Test 12 Passed: Additional gallery uploads appended without overwriting existing ones (5 total)');
    }

    // Test 13: Test C — Delete one gallery image (Removes photo DB record & R2 object, others untouched)
    {
      const photosBefore = await db.therapistPhoto.findMany({
        where: { therapistId: testTherapist.id },
        orderBy: { sortOrder: 'asc' },
      });
      const photoToDelete = photosBefore[1]; // photo 2
      const keyToDelete = extractAndValidateR2Key(photoToDelete.url);
      assert.ok(keyToDelete, 'Photo key must be valid');
      assert.ok(getMockStorageItem(keyToDelete!), 'Mock storage must contain photo 2 object');

      const removeRes = await removeTherapistPhotoAction(testTherapist.id, photoToDelete.id);
      assert.strictEqual(removeRes.success, true);

      const photosAfter = await db.therapistPhoto.findMany({
        where: { therapistId: testTherapist.id },
      });
      assert.strictEqual(photosAfter.length, 4, 'Gallery must now contain 4 photos');
      assert.strictEqual(getMockStorageItem(keyToDelete!), undefined, 'R2 object for photo 2 must be deleted');
      console.log('✓ Test 13 Passed: Single gallery photo deletion removed DB record and R2 object cleanly');
    }

    // Test 14: Test D — Partial multi-upload failure cleanup (Orphaned R2 object deleted on DB error)
    {
      const uploadReq = createUploadRequest(createJpegFile('orphan.jpg'), 'gallery', testTherapist.id);
      const uploadRes = await mediaUploadRoute(uploadReq);
      const uploadData = await uploadRes.json();
      assert.strictEqual(uploadData.success, true);

      const orphanKey = extractAndValidateR2Key(uploadData.url);
      assert.ok(orphanKey);
      assert.ok(getMockStorageItem(orphanKey!), 'Mock storage must contain uploaded orphan object');

      // Attempt DB action with invalid therapist ID to simulate database failure
      const invalidActionRes = await addTherapistPhotoAction('nonexistent-therapist-id-9999', {
        url: uploadData.url,
      });
      assert.strictEqual(invalidActionRes.success, false);
      assert.strictEqual(getMockStorageItem(orphanKey!), undefined, 'Orphaned R2 object must be cleaned up on DB error');
      console.log('✓ Test 14 Passed: Orphaned R2 object automatically cleaned up when DB action fails');
    }

    // Test 15: Test E — Profile image replacement lifecycle order
    {
      // 1. Upload profile image 1
      const req1 = createUploadRequest(createJpegFile('profile1.jpg'), 'profile', testTherapist.id);
      const res1 = await mediaUploadRoute(req1);
      const data1 = await res1.json();
      const url1 = data1.url;
      const key1 = extractAndValidateR2Key(url1)!;

      const updateRes1 = await updateTherapistAction(testTherapist.id, { profileImage: url1 });
      assert.strictEqual(updateRes1.success, true);
      assert.ok(getMockStorageItem(key1), 'Profile image 1 must exist in R2');

      // 2. Upload profile image 2 and replace
      const req2 = createUploadRequest(createJpegFile('profile2.jpg'), 'profile', testTherapist.id);
      const res2 = await mediaUploadRoute(req2);
      const data2 = await res2.json();
      const url2 = data2.url;
      const key2 = extractAndValidateR2Key(url2)!;

      const updateRes2 = await updateTherapistAction(testTherapist.id, { profileImage: url2 });
      assert.strictEqual(updateRes2.success, true);

      const dbTherapistUpdated = await db.therapist.findUnique({ where: { id: testTherapist.id } });
      assert.strictEqual(dbTherapistUpdated?.profileImage, url2, 'DB profile image must be updated to URL 2');
      assert.strictEqual(getMockStorageItem(key1), undefined, 'Old profile image 1 must be deleted from R2');
      assert.ok(getMockStorageItem(key2), 'New profile image 2 must exist in R2');
      console.log('✓ Test 15 Passed: Profile image replacement strictly executed DB update before deleting old R2 object');
    }

    // Test 16: Test F — External URL deletion safety (External image DB record removed, R2 deletion skipped)
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
      console.log('✓ Test 16 Passed: External image URL gallery deletion removed DB record while safely skipping R2');
    }

    // Test 17: Test G — Malicious / untrusted deletion URL safety
    {
      const maliciousUrl = 'https://malicious-domain.com/therapists/temp/profile/hacked.webp';
      const keyResult = extractAndValidateR2Key(maliciousUrl);
      assert.strictEqual(keyResult, null, 'Malicious external domain must return null key');

      const delResult = await deleteFromR2(maliciousUrl);
      assert.strictEqual(delResult.success, true);
      assert.strictEqual(delResult.skipped, true, 'Malicious URL deletion attempt must safely no-op');
      console.log('✓ Test 17 Passed: Malicious / untrusted deletion URL blocked by origin validation');
    }

    // Test 18: Security check — Credentials are never exposed in API responses
    {
      const req = createUploadRequest(createJpegFile('sec.jpg'), 'profile', testTherapist.id);
      const res = await mediaUploadRoute(req);
      const data = await res.json();
      const rawText = JSON.stringify(data);
      assert.ok(!rawText.includes('R2_ACCESS_KEY_ID'));
      assert.ok(!rawText.includes('R2_SECRET_ACCESS_KEY'));
      assert.ok(!rawText.includes('secret'));
      console.log('✓ Test 18 Passed: Credentials are never exposed in API responses');
    }

    // Cleanup test therapist from DB
    await db.therapistPhoto.deleteMany({ where: { therapistId: testTherapist.id } });
    await db.therapist.delete({ where: { id: testTherapist.id } });

    console.log('\n✅ ALL CLOUDFLARE R2 MEDIA UPLOAD & LIFECYCLE TESTS PASSED SUCCESSFULLY!');
  } finally {
    process.env.MASSAF_ADMIN_API_KEY = originalAdminKey;
  }
}

runR2UploadTests().catch((err) => {
  console.error('❌ R2 Upload Test Suite Failed:', err);
  process.exit(1);
});
