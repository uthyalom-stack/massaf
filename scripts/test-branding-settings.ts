import { db } from '../src/lib/db';
import { getBrandingSettings, saveBrandingSettings, DEFAULT_BRANDING_SETTINGS } from '../src/lib/branding';

async function main() {
  console.log('=== STARTING BRANDING SETTINGS TEST SUITE ===\n');

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
  const testLogoUrl = 'https://r2.massaf.com/branding/system/test-logo-12345.png';
  const testSiteName = 'MASSAF Luxury Spa';
  const testTagline = 'Premium In-Home & Studio Wellness';

  const updated = await saveBrandingSettings({
    logoUrl: testLogoUrl,
    siteName: testSiteName,
    tagline: testTagline,
  });

  console.log('Updated Branding Settings:', updated);

  if (updated.logoUrl !== testLogoUrl) {
    throw new Error(`FAILED: Expected logoUrl '${testLogoUrl}', got '${updated.logoUrl}'`);
  }
  if (updated.siteName !== testSiteName) {
    throw new Error(`FAILED: Expected siteName '${testSiteName}', got '${updated.siteName}'`);
  }
  if (updated.tagline !== testTagline) {
    throw new Error(`FAILED: Expected tagline '${testTagline}', got '${updated.tagline}'`);
  }
  console.log('✓ Custom branding saved and verified successfully.');

  // 3. Re-read from Database
  console.log('\nStep 3: Re-fetching branding settings from DB...');
  const refetched = await getBrandingSettings();
  console.log('Refetched Branding Settings:', refetched);

  if (refetched.logoUrl !== testLogoUrl || refetched.siteName !== testSiteName || refetched.tagline !== testTagline) {
    throw new Error('FAILED: Refetched branding settings do not match expected saved values.');
  }
  console.log('✓ Persistence in SiteContent verified.');

  // 4. Update Partial Branding (e.g. replacing logo)
  console.log('\nStep 4: Updating branding logo (simulating logo change)...');
  const newLogoUrl = 'https://r2.massaf.com/branding/system/new-logo-67890.png';
  const updatedLogo = await saveBrandingSettings({ logoUrl: newLogoUrl });

  if (updatedLogo.logoUrl !== newLogoUrl || updatedLogo.siteName !== testSiteName) {
    throw new Error('FAILED: Partial update did not preserve existing fields.');
  }
  console.log('✓ Logo update verified.');

  // 5. Reset to Default
  console.log('\nStep 5: Resetting branding settings to default...');
  const resetResult = await saveBrandingSettings(DEFAULT_BRANDING_SETTINGS);
  console.log('Reset Branding Settings:', resetResult);

  if (resetResult.logoUrl !== null || resetResult.siteName !== 'MASSAF' || resetResult.tagline !== 'Wellness & Therapy') {
    throw new Error('FAILED: Reset did not restore default values.');
  }
  console.log('✓ Reset to default verified.');

  console.log('\n=== BRANDING SETTINGS TEST SUITE PASSED PERFECTLY ===');
}

main()
  .catch((err) => {
    console.error('Test script error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
