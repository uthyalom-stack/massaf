import { isValidUSZip, getStateForZip, getCitiesByState, getZipsByCity } from '../src/lib/us-locations';
import { isZipInRange, therapistCoversZip } from '../src/lib/db-therapists';
import { CustomerTherapist } from '../src/types/customer';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function runRealLocationTests() {
  console.log('=== STARTING REAL U.S. LOCATION & STATE-AWARE MATCHING TEST SUITE ===\n');

  // 1. Dataset & Lookup Functionality
  console.log('1. Testing U.S. Location Dataset Lookups...');
  assert(await isValidUSZip('90001') === true, 'Real ZIP 90001 is recognized as valid U.S. ZIP');
  assert(await isValidUSZip('46001') === true, 'Real ZIP 46001 (Indiana) is recognized as valid U.S. ZIP');
  assert(await isValidUSZip('00501') === true, 'Leading-zero real ZIP 00501 is recognized as valid U.S. ZIP');
  assert(await isValidUSZip('999999') === false, 'Fake ZIP 999999 is rejected as invalid');

  const citiesIN = await getCitiesByState('IN');
  assert(citiesIN.includes('Indianapolis'), 'State IN includes city Indianapolis');

  const zipsIndy = await getZipsByCity('IN', 'Indianapolis');
  assert(zipsIndy.includes('46225'), 'Indianapolis IN includes ZIP 46225');

  // 2. State-Aware Coverage Matching
  console.log('\n2. Testing State-Aware Coverage Matching...');

  const therapistMultiState: CustomerTherapist = {
    id: 'therapist-multistate',
    name: 'Multi-State Practitioner',
    title: 'LMT',
    image: '/default.jpg',
    galleryImages: [],
    rating: 5.0,
    reviewCount: 10,
    location: 'Indianapolis, IN',
    serviceAreas: ['Indianapolis, IN', 'Chicago, IL'],
    zipCodes: ['46001', '60001'],
    rawServiceAreas: [
      { id: 'sa-1', cityName: 'Indianapolis', state: 'IN', zipCode: '46001', endZipCode: '46298' },
      { id: 'sa-2', cityName: 'Chicago', state: 'IL', zipCode: '60001', endZipCode: '60699' },
    ],
    startingPrice: 100,
    availability: 'Available',
    offersStudio: true,
    offersInHome: true,
    specialties: [],
    bio: '',
    experience: '',
    approach: '',
    services: [],
    schedule: [],
    bookingCount: 5,
    isFeatured: false,
    isHomepageSelected: false,
  };

  // Test Indiana match
  assert(therapistCoversZip(therapistMultiState, '46225') === true, 'Therapist covers Indiana ZIP 46225 inside IN range 46001-46298');

  // Test Illinois match
  assert(therapistCoversZip(therapistMultiState, '60614') === true, 'Therapist covers Illinois ZIP 60614 inside IL range 60001-60699');

  // Test Indiana outside range
  assert(therapistCoversZip(therapistMultiState, '46530') === false, 'Therapist does NOT cover Indiana ZIP 46530 outside range');

  // Test Ohio non-covered state
  assert(therapistCoversZip(therapistMultiState, '44101') === false, 'Therapist does NOT cover Ohio ZIP 44101 (state not assigned)');

  // 3. Leading Zero & Range Boundaries
  console.log('\n3. Testing Leading Zero ZIPs & Range Boundaries...');
  assert(isZipInRange('00505', '00501', '00510') === true, 'Leading zero ZIP 00505 is inside 00501-00510 range');
  assert(isZipInRange('00512', '00501', '00510') === false, 'Leading zero ZIP 00512 is outside 00501-00510 range');

  console.log('\n✅ ALL REAL LOCATION & GEOGRAPHIC MATCHING TESTS PASSED SUCCESSFULLY!');
}

runRealLocationTests();
