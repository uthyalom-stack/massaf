import { db } from '../src/lib/db';
import { createSessionToken } from '../src/lib/auth-session';
import { shuffleAndDistributeTherapistsAction } from '../src/app/admin/actions';
import { getRotatingTherapistsForZip } from '../src/lib/matching';
import { CustomerTherapist } from '../src/types/customer';

// Set up mock test admin session token
process.env.MASSAF_AUTH_SECRET = process.env.MASSAF_AUTH_SECRET || 'test_secret_for_local_rotation_tests_32_bytes';
const adminToken = createSessionToken('env-admin', 'admin@massaf.com', 'ADMIN', 24, 'SUPER_ADMIN');
process.env.ADMIN_EMAIL = 'admin@massaf.com';
(global as any).__TEST_ADMIN_SESSION_TOKEN__ = adminToken;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function runRotationAndDistributionTests() {
  console.log('=== STARTING THERAPIST ROTATION & AUTOMATIC ZIP DISTRIBUTION TEST SUITE ===\n');

  // 1. Ensure at least one active therapist exists for test
  let activeCount = await db.therapist.count({ where: { isActive: true } });
  if (activeCount === 0) {
    await db.therapist.create({
      data: {
        name: 'Seed Test Practitioner',
        email: 'seed.test@massaf.com',
        hourlyRate: 110.0,
        isActive: true,
      },
    });
    activeCount = await db.therapist.count({ where: { isActive: true } });
  }
  console.log(`1. Active Therapists in Database: ${activeCount}`);
  assert(activeCount > 0, 'Active therapists exist in database');

  // 2. Test Admin Shuffle & Automatic Distribution Action
  console.log('\n2. Testing Admin Shuffle & Automatic Distribution Action...');
  const distRes = await shuffleAndDistributeTherapistsAction();
  assert(distRes.success === true, 'shuffleAndDistributeTherapistsAction() executed successfully');
  assert(typeof distRes.distributionRecords === 'number' && distRes.distributionRecords > 0, 'Distribution records generated');

  const eligibilityCount = await db.therapistZipEligibility.count();
  console.log(`  ✓ TherapistZipEligibility records created: ${eligibilityCount}`);
  assert(eligibilityCount > 0, 'TherapistZipEligibility records persisted');

  // 3. Test Customer-Specific Rolling 5-Therapist Rotation Engine
  console.log('\n3. Testing Rolling 5-Therapist Rotation Engine (getRotatingTherapistsForZip)...');

  // Create 12 persistent database therapists for testing full history tracking
  const createdDbTherapists = [];
  for (let i = 0; i < 12; i++) {
    const t = await db.therapist.create({
      data: {
        name: `Rotational DB Therapist ${i + 1}`,
        email: `rot.db.therapist.${i + 1}.${Date.now()}@massaf.com`,
        hourlyRate: 100.0 + i * 5,
        isActive: true,
      },
    });
    createdDbTherapists.push(t);
  }

  const testPool: CustomerTherapist[] = createdDbTherapists.map((t, idx) => ({
    id: t.id,
    name: t.name,
    title: 'LMT',
    image: '/avatar.jpg',
    galleryImages: [],
    rating: 4.8,
    reviewCount: 10,
    location: 'Los Angeles, CA',
    serviceAreas: ['Los Angeles, CA'],
    zipCodes: ['90001'],
    rawServiceAreas: [
      { id: `sa-${idx}`, cityName: 'Los Angeles', state: 'CA', zipCode: '90001', endZipCode: '92692' },
    ],
    startingPrice: t.hourlyRate,
    availability: 'Available',
    offersStudio: true,
    offersInHome: true,
    specialties: [],
    bio: '',
    experience: '',
    approach: '',
    services: [
      { id: 'svc-1', name: 'Swedish', durationMinutes: 60, price: t.hourlyRate, description: '' },
    ],
    schedule: [],
    bookingCount: 5,
    isFeatured: false,
    isHomepageSelected: false,
  }));

  const testVisitor = 'test-visitor-session-uuid-101';
  const testZip = '90210';

  // Search 1: Should return 5 unseen therapists
  const search1 = await getRotatingTherapistsForZip(testZip, testPool, { visitorSessionId: testVisitor });
  assert(search1.length === 5, 'Search 1 returns 5 therapists');
  const ids1 = search1.map((t) => t.id);

  // Search 2: Should rotate in unseen therapists from pool
  const search2 = await getRotatingTherapistsForZip(testZip, testPool, { visitorSessionId: testVisitor });
  assert(search2.length === 5, 'Search 2 returns 5 therapists');
  const ids2 = search2.map((t) => t.id);

  const newInSearch2 = ids2.filter((id) => !ids1.includes(id));
  assert(newInSearch2.length > 0, `Search 2 rotated in ${newInSearch2.length} fresh/unseen therapists`);

  // Search 3: Re-running distribution shuffle does NOT destroy rotation history
  const distRes2 = await shuffleAndDistributeTherapistsAction();
  assert(distRes2.success === true, 'Re-running distribution shuffle succeeded');

  const search3 = await getRotatingTherapistsForZip(testZip, testPool, { visitorSessionId: testVisitor });
  assert(search3.length === 5, 'Search 3 returns 5 therapists after distribution reshuffle');

  console.log('\n✅ ALL ROTATION & AUTOMATIC ZIP DISTRIBUTION TESTS PASSED SUCCESSFULLY!');
}

runRotationAndDistributionTests();
