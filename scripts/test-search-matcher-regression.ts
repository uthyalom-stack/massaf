import { db } from '../src/lib/db';
import { clearZipLocationCaches } from '../src/lib/us-locations';
import { rankTherapistsForMatch } from '../src/lib/matching';
import { CustomerTherapist } from '../src/types/customer';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function runSearchMatcherRegressionTest() {
  console.log('=== STARTING FRESH-CACHE END-TO-END MATCHING SEARCH REGRESSION TEST ===\n');

  // Verify DB table contains >40,000 ZIPs
  const totalDbZips = await db.uSZipCode.count();
  console.log(`  ✓ Database contains ${totalDbZips} USZipCode records.`);
  assert(totalDbZips > 40000, 'USZipCode database table contains >40,000 records');

  // Setup test therapists
  const therapistA: CustomerTherapist = {
    id: 'th-match-a',
    name: 'Therapist A (CA 90001-92692)',
    image: '/a.jpg',
    galleryImages: [],
    rating: 4.9,
    reviewCount: 15,
    location: 'Los Angeles, CA',
    serviceAreas: ['Los Angeles, CA'],
    zipCodes: ['90001'],
    rawServiceAreas: [
      { id: 'sa-a', cityName: 'Los Angeles', state: 'CA', zipCode: '90001', endZipCode: '92692' },
    ],
    startingPrice: 120,
    availability: 'Available',
    offersStudio: true,
    offersInHome: true,
    specialties: [],
    bio: '',
    services: [
      { id: 'srv-deep', name: 'Deep Tissue Massage', durationMinutes: 60, price: 120, description: '' },
    ],
    schedule: [],
    bookingCount: 10,
    isFeatured: false,
    isHomepageSelected: false,
  };

  const therapistB: CustomerTherapist = {
    id: 'th-match-b',
    name: 'Therapist B (IN 46001-46298)',
    image: '/b.jpg',
    galleryImages: [],
    rating: 4.8,
    reviewCount: 8,
    location: 'Indianapolis, IN',
    serviceAreas: ['Indianapolis, IN'],
    zipCodes: ['46001'],
    rawServiceAreas: [
      { id: 'sa-b', cityName: 'Indianapolis', state: 'IN', zipCode: '46001', endZipCode: '46298' },
    ],
    startingPrice: 100,
    availability: 'Available',
    offersStudio: true,
    offersInHome: true,
    specialties: [],
    bio: '',
    services: [
      { id: 'srv-deep', name: 'Deep Tissue Massage', durationMinutes: 60, price: 100, description: '' },
    ],
    schedule: [],
    bookingCount: 4,
    isFeatured: false,
    isHomepageSelected: false,
  };

  const testTherapists = [therapistA, therapistB];

  // 1. Fresh-cache test: Fake nonexistent ZIP 99999
  console.log('\n1. Testing fake nonexistent ZIP 99999 on completely fresh cache...');
  clearZipLocationCaches();

  const matches99999 = await rankTherapistsForMatch(
    {
      serviceId: 'srv-deep',
      locationType: 'IN_HOME',
      locationQuery: '',
      zipCode: '99999',
      preferredDate: '',
      preferredTime: '',
    },
    testTherapists
  );

  assert(matches99999.length === 0, 'Nonexistent ZIP 99999 produces 0 matches on cold cache (cannot match numeric ranges)');

  // 2. Fresh-cache test: Multi-city range CA 90210 (Beverly Hills inside LA 90001-92692 range)
  console.log('\n2. Testing multi-city CA ZIP 90210 on completely fresh cache...');
  clearZipLocationCaches();

  const matches90210 = await rankTherapistsForMatch(
    {
      serviceId: 'srv-deep',
      locationType: 'IN_HOME',
      locationQuery: '',
      zipCode: '90210',
      preferredDate: '',
      preferredTime: '',
    },
    testTherapists
  );

  assert(
    matches90210.length === 1 && matches90210[0].therapist.id === 'th-match-a',
    'Beverly Hills ZIP 90210 MATCHES Therapist A (CA range 90001-92692) on cold cache'
  );

  // 3. Fresh-cache test: IN 46225
  console.log('\n3. Testing IN ZIP 46225 on completely fresh cache...');
  clearZipLocationCaches();

  const matches46225 = await rankTherapistsForMatch(
    {
      serviceId: 'srv-deep',
      locationType: 'IN_HOME',
      locationQuery: '',
      zipCode: '46225',
      preferredDate: '',
      preferredTime: '',
    },
    testTherapists
  );

  assert(
    matches46225.length === 1 && matches46225[0].therapist.id === 'th-match-b',
    'Indianapolis ZIP 46225 MATCHES Therapist B (IN range 46001-46298) on cold cache'
  );

  // 4. Fresh-cache test: TX 75002 (Allen TX - state mismatch)
  console.log('\n4. Testing TX ZIP 75002 (uncovered state) on completely fresh cache...');
  clearZipLocationCaches();

  const matches75002 = await rankTherapistsForMatch(
    {
      serviceId: 'srv-deep',
      locationType: 'IN_HOME',
      locationQuery: '',
      zipCode: '75002',
      preferredDate: '',
      preferredTime: '',
    },
    testTherapists
  );

  assert(matches75002.length === 0, 'TX ZIP 75002 produces 0 matches (state mismatch rejected)');

  console.log('\n✅ ALL END-TO-END SEARCH MATCHER REGRESSION TESTS PASSED SUCCESSFULLY!');
}

runSearchMatcherRegressionTest();
