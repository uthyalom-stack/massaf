import { db } from '../src/lib/db';
import { getZipInfo, isValidUSZip, isZipInCoverage, clearZipLocationCaches } from '../src/lib/us-locations';
import { therapistCoversZip, therapistCoversZipAsync } from '../src/lib/db-therapists';
import { CustomerTherapist } from '../src/types/customer';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function runRealDatabaseCoverageTests() {
  console.log('=== STARTING USZipCode REAL DATABASE MATCHING TEST SUITE ===\n');

  // 1. Verify USZipCode DB Table Records
  console.log('1. Verifying USZipCode database table...');
  const count = await db.uSZipCode.count();
  console.log(`  ✓ Total USZipCode records in database: ${count}`);
  assert(count > 40000, 'USZipCode table contains over 40,000 real U.S. ZIP records');

  // 2. Real ZIP Lookups & Validations against USZipCode Table
  console.log('\n2. Testing Real ZIP Lookups & Validations...');
  assert(await isValidUSZip('90001') === true, 'Real ZIP 90001 (Los Angeles CA) is valid');
  assert(await isValidUSZip('90210') === true, 'Real ZIP 90210 (Beverly Hills CA) is valid');
  assert(await isValidUSZip('46225') === true, 'Real ZIP 46225 (Indianapolis IN) is valid');
  assert(await isValidUSZip('00501') === true, 'Real leading-zero ZIP 00501 (Holtsville NY) is valid');
  assert(await isValidUSZip('99999') === false, 'Fake ZIP 99999 is invalid');

  const info90001 = await getZipInfo('90001');
  assert(info90001?.city === 'Los Angeles' && info90001?.state === 'CA', 'ZIP 90001 resolves to Los Angeles, CA');

  const info90210 = await getZipInfo('90210');
  assert(info90210?.city === 'Beverly Hills' && info90210?.state === 'CA', 'ZIP 90210 resolves to Beverly Hills, CA');

  const info46225 = await getZipInfo('46225');
  assert(info46225?.city === 'Indianapolis' && info46225?.state === 'IN', 'ZIP 46225 resolves to Indianapolis, IN');

  const info00501 = await getZipInfo('00501');
  assert(info00501?.state === 'NY', 'ZIP 00501 resolves to NY');

  // 3. Multi-City Range Coverage & State Mismatch
  console.log('\n3. Testing Multi-City Range Coverage & State Mismatch...');
  // CA 90001 -> 92692 (Los Angeles to Irvine multi-city range)
  assert(await isZipInCoverage('90210', 'CA', '90001', '92692') === true, 'Customer 90210 in California MATCHES CA range 90001-92692');
  assert(await isZipInCoverage('90210', 'IN', '90001', '92692') === false, 'Customer 90210 in Indiana is REJECTED due to state mismatch');

  // IN 46001 -> 46298
  assert(await isZipInCoverage('46225', 'IN', '46001', '46298') === true, 'Customer 46225 in Indiana MATCHES IN range 46001-46298');
  assert(await isZipInCoverage('46530', 'IN', '46001', '46298') === false, 'Customer 46530 in Indiana is REJECTED (outside 46001-46298 range)');

  // Nonexistent numeric ZIP between boundary ZIPs
  assert(await isZipInCoverage('99999', 'CA', '90001', '99999') === false, 'Nonexistent ZIP 99999 is REJECTED even if between boundary numbers');

  // 4. Fresh-Cache Customer Matching Verification
  console.log('\n4. Testing Fresh-Cache Customer Matching (therapistCoversZip)...');

  // Clear in-memory caches to test zero-cache cold state
  clearZipLocationCaches();

  const therapistA: CustomerTherapist = {
    id: 'th-a',
    name: 'Therapist A (Multi-City & Multi-State)',
    image: '/a.jpg',
    galleryImages: [],
    rating: 5,
    reviewCount: 1,
    location: 'Los Angeles, CA',
    serviceAreas: ['Los Angeles, CA', 'Indianapolis, IN'],
    zipCodes: ['90001', '46001'],
    rawServiceAreas: [
      { id: 'sa-1', cityName: 'Los Angeles', state: 'CA', zipCode: '90001', endZipCode: '92692' },
      { id: 'sa-2', cityName: 'Indianapolis', state: 'IN', zipCode: '46001', endZipCode: '46298' },
    ],
    startingPrice: 100,
    availability: 'Available',
    offersStudio: true,
    offersInHome: true,
    specialties: [],
    bio: '',
    services: [],
    schedule: [],
    bookingCount: 0,
    isFeatured: false,
  };

  // Test 4a: Nonexistent ZIP 99999 MUST be rejected in async database check
  assert(await therapistCoversZipAsync(therapistA, '99999') === false, 'Async check: Nonexistent ZIP 99999 is REJECTED by USZipCode DB check');

  // Test 4b: Multi-city match across different cities (Beverly Hills 90210 inside LA 90001-92692 range)
  assert(await therapistCoversZipAsync(therapistA, '90210') === true, 'Async check: CA 90210 MATCHES multi-city range 90001-92692');

  // Test 4c: Indiana match inside range
  assert(await therapistCoversZipAsync(therapistA, '46225') === true, 'Async check: IN 46225 MATCHES range 46001-46298');

  // Test 4d: Texas unassigned state rejected
  assert(await therapistCoversZipAsync(therapistA, '75002') === false, 'Async check: TX 75002 is REJECTED (state not covered)');

  console.log('\n✅ ALL USZipCode REAL DATABASE TESTS PASSED SUCCESSFULLY!');
}

runRealDatabaseCoverageTests();
