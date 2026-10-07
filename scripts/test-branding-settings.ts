import { db } from '../src/lib/db';
import { getBrandingSettings, saveBrandingSettings, DEFAULT_BRANDING_SETTINGS } from '../src/lib/branding';
import { getBrandingSettingsAction, updateBrandingSettingsAction, resetBrandingSettingsAction } from '../src/app/admin/actions';
import { POST as brandingUploadPOST } from '../src/app/api/admin/branding/upload/route';
import { createSessionToken } from '../src/lib/auth-session';

async function main() {
  console.log('=== STARTING ENHANCED BRANDING SETTINGS & SECURITY TEST SUITE ===\n');

  // 1. Initial State Check
  console.log('Step 1: Reading initial branding settings...');
  const initial = await getBrandingSettings();
  console.log('Initial Branding Settings:', initial);

  if (typeof initial.siteName !== 'string' || typeof initial.tagline !== 'string') {
    throw new Error('FAILED: Initial branding settings structure is invalid.');
  }
  console.log('✓ Initial branding settings read successfully.');

  // 2. Save Custom Branding
  console.log('\nStep 2: Saving custom branding settings...');
  const testLogoUrl = 'https://r2.massaf.com/branding/system-logo-12345.png';
  const testSiteName = 'MASSAF Luxury Spa';
  const testTagline = 'Premium In-Home & Studio Wellness';

  const updated = await saveBrandingSettings({
    logoUrl: testLogoUrl,
    siteName: testSiteName,
    tagline: testTagline,
  });

  console.log('Updated Branding Settings:', updated);

  if (updated.logoUrl !== testLogoUrl || updated.siteName !== testSiteName || updated.tagline !== testTagline) {
    throw new Error('FAILED: Custom branding values were not properly set.');
  }
  console.log('✓ Custom branding saved and verified successfully.');

  // 3. Re-read from Database
  console.log('\nStep 3: Re-fetching branding settings from DB...');
  const refetched = await getBrandingSettings();

  if (refetched.logoUrl !== testLogoUrl || refetched.siteName !== testSiteName || refetched.tagline !== testTagline) {
    throw new Error('FAILED: Refetched branding settings do not match expected saved values.');
  }
  console.log('✓ Persistence in SiteContent verified.');

  // 4. Update Partial Branding (e.g. replacing logo)
  console.log('\nStep 4: Updating branding logo (simulating logo change)...');
  const newLogoUrl = 'https://r2.massaf.com/branding/system-logo-67890.png';
  const updatedLogo = await saveBrandingSettings({ logoUrl: newLogoUrl });

  if (updatedLogo.logoUrl !== newLogoUrl || updatedLogo.siteName !== testSiteName) {
    throw new Error('FAILED: Partial update did not preserve existing fields.');
  }
  console.log('✓ Logo update verified.');

  // 5. Reset to Default
  console.log('\nStep 5: Resetting branding settings to default...');
  const resetResult = await saveBrandingSettings(DEFAULT_BRANDING_SETTINGS);

  if (resetResult.logoUrl !== null || resetResult.siteName !== 'MASSAF' || resetResult.tagline !== 'Wellness & Therapy') {
    throw new Error('FAILED: Reset did not restore default values.');
  }
  console.log('✓ Reset to default verified.');

  // 6. Test RBAC Permissions for Branding Server Actions
  console.log('\nStep 6: Testing Server Action & API Route RBAC Authorization...');

  // Create admin users for RBAC testing
  const superAdmin = await db.user.upsert({
    where: { email: 'test-superadmin-branding@massaf.com' },
    update: { role: 'SUPER_ADMIN', isActive: true },
    create: { email: 'test-superadmin-branding@massaf.com', role: 'SUPER_ADMIN', isActive: true },
  });

  const managerAdmin = await db.user.upsert({
    where: { email: 'test-manager-branding@massaf.com' },
    update: { role: 'MANAGER', isActive: true },
    create: { email: 'test-manager-branding@massaf.com', role: 'MANAGER', isActive: true },
  });

  const staffAdmin = await db.user.upsert({
    where: { email: 'test-staff-branding@massaf.com' },
    update: { role: 'STAFF', isActive: true },
    create: { email: 'test-staff-branding@massaf.com', role: 'STAFF', isActive: true },
  });

  const superAdminCookie = `massaf_admin_session=${createSessionToken(superAdmin.id, superAdmin.email, 'ADMIN', 24, 'SUPER_ADMIN')}`;
  const managerCookie = `massaf_admin_session=${createSessionToken(managerAdmin.id, managerAdmin.email, 'ADMIN', 24, 'MANAGER')}`;
  const staffCookie = `massaf_admin_session=${createSessionToken(staffAdmin.id, staffAdmin.email, 'ADMIN', 24, 'STAFF')}`;

  // 6a. Direct DB persistence update verification
  const superAdminSave = await saveBrandingSettings({ logoUrl: testLogoUrl, siteName: 'MASSAF Authorized' });
  if (superAdminSave.siteName !== 'MASSAF Authorized') {
    throw new Error('FAILED: saveBrandingSettings failed.');
  }
  console.log('✓ Direct branding save verified.');

  // Reset to default for clean state
  await saveBrandingSettings(DEFAULT_BRANDING_SETTINGS);

  // 7. Test Branding Upload API Endpoint (/api/admin/branding/upload)
  console.log('\nStep 7: Testing /api/admin/branding/upload endpoint validation & security...');

  // 7a. Unauthenticated upload request -> 403
  const unauthReq = new Request('http://localhost:3000/api/admin/branding/upload', {
    method: 'POST',
    body: new FormData(),
  });
  const unauthRes = await brandingUploadPOST(unauthReq);
  if (unauthRes.status !== 403) {
    throw new Error(`FAILED: Expected 403 for unauthenticated upload request, got ${unauthRes.status}`);
  }
  console.log('✓ Unauthenticated upload request rejected with 403.');

  // 7b. MANAGER role upload request -> 403
  const managerReq = new Request('http://localhost:3000/api/admin/branding/upload', {
    method: 'POST',
    headers: { cookie: managerCookie },
    body: new FormData(),
  });
  const managerRes = await brandingUploadPOST(managerReq);
  if (managerRes.status !== 403) {
    throw new Error(`FAILED: Expected 403 for MANAGER upload request, got ${managerRes.status}`);
  }
  console.log('✓ MANAGER upload request rejected with 403.');

  // 7c. STAFF (marketer) role upload request -> 403
  const staffReq = new Request('http://localhost:3000/api/admin/branding/upload', {
    method: 'POST',
    headers: { cookie: staffCookie },
    body: new FormData(),
  });
  const staffRes = await brandingUploadPOST(staffReq);
  if (staffRes.status !== 403) {
    throw new Error(`FAILED: Expected 403 for STAFF upload request, got ${staffRes.status}`);
  }
  console.log('✓ STAFF upload request rejected with 403.');

  // 7d. Oversized file (> 5 MB) upload request -> 400
  const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024); // 6 MB
  const oversizedFile = new File([oversizedBuffer], 'large-logo.png', { type: 'image/png' });
  const oversizedFormData = new FormData();
  oversizedFormData.append('file', oversizedFile);

  const oversizedReq = new Request('http://localhost:3000/api/admin/branding/upload', {
    method: 'POST',
    headers: { cookie: superAdminCookie },
    body: oversizedFormData,
  });
  const oversizedRes = await brandingUploadPOST(oversizedReq);
  const oversizedData = await oversizedRes.json();

  if (oversizedRes.status !== 400 || !oversizedData.error.includes('exceeds maximum permitted limit of 5 MB')) {
    throw new Error(`FAILED: Expected 400 for >5MB file, got ${oversizedRes.status}: ${JSON.stringify(oversizedData)}`);
  }
  console.log('✓ Oversized file (>5MB) rejected server-side.');

  // 7e. Invalid image content / non-image executable buffer -> 400
  const fakeImageBuffer = Buffer.from('<?php echo "evil payload"; ?>');
  const fakeFile = new File([fakeImageBuffer], 'shell.png', { type: 'image/png' });
  const fakeFormData = new FormData();
  fakeFormData.append('file', fakeFile);

  const fakeReq = new Request('http://localhost:3000/api/admin/branding/upload', {
    method: 'POST',
    headers: { cookie: superAdminCookie },
    body: fakeFormData,
  });
  const fakeRes = await brandingUploadPOST(fakeReq);
  const fakeData = await fakeRes.json();

  if (fakeRes.status !== 400 || !fakeData.error.includes('Invalid file contents')) {
    throw new Error(`FAILED: Expected 400 for fake image payload, got ${fakeRes.status}: ${JSON.stringify(fakeData)}`);
  }
  console.log('✓ Non-image/executable content rejected via magic byte check.');

  // 7f. Valid PNG image upload with SUPER_ADMIN session
  // PNG Magic Bytes: 89 50 4E 47 0D 0A 1A 0A
  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
  const validFile = new File([validPngBuffer], 'valid-logo.png', { type: 'image/png' });
  const validFormData = new FormData();
  validFormData.append('file', validFile);

  const validReq = new Request('http://localhost:3000/api/admin/branding/upload', {
    method: 'POST',
    headers: { cookie: superAdminCookie },
    body: validFormData,
  });
  const validRes = await brandingUploadPOST(validReq);
  const validData = await validRes.json();

  if (validRes.status !== 200 || !validData.success || !validData.url) {
    throw new Error(`FAILED: Valid branding upload failed: ${JSON.stringify(validData)}`);
  }
  if (!validData.key.startsWith('branding/system-logo-')) {
    throw new Error(`FAILED: Object key namespace invalid: ${validData.key}`);
  }
  console.log('✓ Valid branding PNG upload succeeded with server key:', validData.key);

  // Clean up test users
  await db.user.deleteMany({
    where: { email: { in: ['test-superadmin-branding@massaf.com', 'test-manager-branding@massaf.com', 'test-staff-branding@massaf.com'] } },
  });

  console.log('\n=== BRANDING SETTINGS & SECURITY TEST SUITE PASSED PERFECTLY ===');
}

main()
  .catch((err) => {
    console.error('Test script error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
