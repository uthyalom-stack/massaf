import assert from 'assert';
import { POST as mediaUploadRoute } from '../src/app/api/admin/media/upload/route';
import { generateObjectKey, uploadToR2, deleteFromR2, clearMockStorage } from '../src/lib/r2';

async function runR2UploadTests() {
  console.log('--- RUNNING CLOUDFLARE R2 MEDIA UPLOAD TEST SUITE ---');
  clearMockStorage();

  const originalAdminKey = process.env.MASSAF_ADMIN_API_KEY;
  process.env.MASSAF_ADMIN_API_KEY = 'test-admin-api-key';

  try {
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

    // Helper: Construct multipart form request
    const createUploadRequest = (file: File, folder?: string, therapistId?: string, oldUrl?: string) => {
      const formData = new FormData();
      formData.append('file', file);
      if (folder) formData.append('folder', folder);
      if (therapistId) formData.append('therapistId', therapistId);
      if (oldUrl) formData.append('oldUrl', oldUrl);

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

    // Helper: Valid PNG buffer (89 50 4E 47 0D 0A 1A 0A)
    const createPngFile = (name = 'test.png') => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      return new File([buffer], name, { type: 'image/png' });
    };

    // Helper: Valid WebP buffer (RIFF...WEBP)
    const createWebpFile = (name = 'test.webp') => {
      const buffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      return new File([buffer], name, { type: 'image/webp' });
    };

    // Test 3: Valid JPEG upload accepted
    {
      const req = createUploadRequest(createJpegFile(), 'profile', 'therapist-123');
      const res = await mediaUploadRoute(req);
      assert.strictEqual(res.status, 200, 'Valid JPEG upload should return 200');
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.url.includes('therapists/therapist-123/profile/'), 'URL must contain therapist namespace');
      assert.ok(!data.key.includes('test.jpg'), 'Key must be randomized UUID, not user filename');
      console.log('✓ Test 3 Passed: Valid JPEG upload accepted and sanitized');
    }

    // Test 4: Valid PNG upload accepted
    {
      const req = createUploadRequest(createPngFile(), 'gallery', 'therapist-123');
      const res = await mediaUploadRoute(req);
      assert.strictEqual(res.status, 200, 'Valid PNG upload should return 200');
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.url.includes('therapists/therapist-123/gallery/'), 'URL must contain gallery folder');
      console.log('✓ Test 4 Passed: Valid PNG upload accepted');
    }

    // Test 5: Valid WebP upload accepted
    {
      const req = createUploadRequest(createWebpFile(), 'profile', 'therapist-123');
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
      const req = createUploadRequest(badFile);
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
      const req = createUploadRequest(fakeFile);
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
      // Write JPEG header
      largeBuffer[0] = 0xff;
      largeBuffer[1] = 0xd8;
      largeBuffer[2] = 0xff;
      const largeFile = new File([largeBuffer], 'large.jpg', { type: 'image/jpeg' });
      const req = createUploadRequest(largeFile);
      const res = await mediaUploadRoute(req);
      assert.strictEqual(res.status, 400, 'Oversized file must be rejected with 400');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('exceeds maximum permitted limit of 10 MB'));
      console.log('✓ Test 8 Passed: Oversized file (>10MB) rejected');
    }

    // Test 9: Unique key generation per upload
    {
      const key1 = generateObjectKey('profile', 'therapist-1', 'jpg');
      const key2 = generateObjectKey('profile', 'therapist-1', 'jpg');
      assert.notStrictEqual(key1, key2, 'Generated keys for same therapist must be unique');
      console.log('✓ Test 9 Passed: Unique object keys generated per upload');
    }

    // Test 10: External image URL deletion safety
    {
      const externalUrl = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2';
      const delResult = await deleteFromR2(externalUrl);
      assert.strictEqual(delResult.success, true);
      assert.strictEqual(delResult.skipped, true, 'External URLs must be skipped during R2 object deletion');
      console.log('✓ Test 10 Passed: External image URLs safely skipped on deletion');
    }

    // Test 11: Security check - API responses must never leak credentials
    {
      const req = createUploadRequest(createJpegFile(), 'profile', 'therapist-sec');
      const res = await mediaUploadRoute(req);
      const data = await res.json();
      const rawText = JSON.stringify(data);
      assert.ok(!rawText.includes('R2_ACCESS_KEY_ID'));
      assert.ok(!rawText.includes('R2_SECRET_ACCESS_KEY'));
      assert.ok(!rawText.includes('secret'));
      console.log('✓ Test 11 Passed: Credentials are never exposed in API response');
    }

    console.log('\n✅ ALL CLOUDFLARE R2 MEDIA UPLOAD TESTS PASSED SUCCESSFULLY!');
  } finally {
    process.env.MASSAF_ADMIN_API_KEY = originalAdminKey;
  }
}

runR2UploadTests().catch((err) => {
  console.error('❌ R2 Upload Test Suite Failed:', err);
  process.exit(1);
});
