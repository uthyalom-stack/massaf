import { isValidUSZip, getCitiesByState, getZipsByCity, clearZipLocationCaches } from '../src/lib/us-locations';
import { isZipInRange } from '../src/lib/db-therapists';
import { rankTherapistsForMatch } from '../src/lib/matching';
import { MatchCriteria } from '../src/lib/validations/matching';
import { CustomerTherapist } from '../src/types/customer';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function runRealLocationTests() {
  console.log('=== STARTING REAL U.S. LOCATION & rankTherapistsForMatch COLD-CACHE TEST SUITE ===\n');

  // 1. Dataset & Basic Helper Checks
  console.log('1. Testing U.S. Location Dataset & Basic Helpers...');
  assert(await isValidUSZip('90001') === true, 'Real ZIP 90001 is recognized as valid U.S. ZIP');
  assert(await isValidUSZip('46001') === true, 'Real ZIP 46001 (Indiana) is recognized as valid U.S. ZIP');
  assert(await isValidUSZip('00501') === true, 'Leading-zero real ZIP 00501 is recognized as valid U.S. ZIP');
  assert(await isValidUSZip('999999') === false, 'Fake ZIP 999999 is rejected as invalid');

  const citiesIN = await getCitiesByState('IN');
  assert(citiesIN.includes('Indianapolis'), 'State IN includes city Indianapolis');

  const zipsIndy = await getZipsByCity('IN', 'Indianapolis');
  assert(zipsIndy.includes('46225'), 'Indianapolis IN includes ZIP 46225');

  assert(isZipInRange('00505', '00501', '00510') === true, 'Leading zero ZIP 00505 is inside 00501-00510 range');
  assert(isZipInRange('00512', '00501', '00510') === false, 'Leading zero ZIP 00512 is outside 00501-00510 range');

  // 2. Production Customer Matching Path Tests via rankTherapistsForMatch on COLD CACHE
  console.log('\n2. Testing Customer Matching Flow via rankTherapistsForMatch() on COLD CACHE...');

  const { db } = await import('../src/lib/db');

  // Ensure active distribution timestamp exists in DB for staged test eligibility
  const testDistributionTime = new Date();
  await db.siteContent.upsert({
    where: { key: 'active_distribution_timestamp' },
    update: { content: testDistributionTime.toISOString() },
    create: { key: 'active_distribution_timestamp', title: 'Active Distribution Timestamp', content: testDistributionTime.toISOString() },
  });

  // Seed/Stage test therapists and authoritative TherapistZipEligibility records in DB
  const createdTherapistIds: string[] = [];
  async function stageTestTherapist(id: string, name: string, eligibilityRules: Array<{ state: string; startZip: string; endZip: string }>) {
    await db.therapist.upsert({
      where: { id },
      update: { name, isActive: true },
      create: { id, name, isActive: true, hourlyRate: 100 },
    });
    createdTherapistIds.push(id);

    await db.therapistZipEligibility.deleteMany({ where: { therapistId: id } });
    for (const rule of eligibilityRules) {
      await db.therapistZipEligibility.create({
        data: {
          therapistId: id,
          state: rule.state,
          startZip: rule.startZip,
          endZip: rule.endZip,
          createdAt: testDistributionTime,
        },
      });
    }
  }

  await stageTestTherapist('therapist-ca', 'California Practitioner', [{ state: 'CA', startZip: '90001', endZip: '92692' }]);
  await stageTestTherapist('therapist-in', 'Indiana Practitioner', [{ state: 'IN', startZip: '46001', endZip: '46298' }]);
  await stageTestTherapist('therapist-multi', 'Multi-State Practitioner', [
    { state: 'CA', startZip: '90001', endZip: '92692' },
    { state: 'IN', startZip: '46001', endZip: '46298' },
  ]);
  await stageTestTherapist('therapist-ny', 'New York Practitioner', [{ state: 'NY', startZip: '00501', endZip: '00510' }]);
  await stageTestTherapist('therapist-fake-range', 'Fake Range Practitioner', [{ state: 'CA', startZip: '90001', endZip: '99999' }]);

  const serviceId = 'svc-deep-tissue';

  // Test Fixture A: California Therapist (90001 - 92692)
  const therapistCA: CustomerTherapist = {
    id: 'therapist-ca',
    name: 'California Practitioner',
    title: 'LMT',
    image: '/ca.jpg',
    galleryImages: [],
    rating: 4.9,
    reviewCount: 20,
    location: 'Los Angeles, CA',
    serviceAreas: ['Los Angeles, CA'],
    zipCodes: ['90001'],
    rawServiceAreas: [],
    startingPrice: 120,
    availability: 'Available',
    offersStudio: true,
    offersInHome: true,
    specialties: ['Deep Tissue'],
    bio: 'CA therapist',
    services: [
      { id: serviceId, name: 'Deep Tissue Massage', description: 'Deep tissue', durationMinutes: 60, price: 120 },
    ],
    schedule: [],
    bookingCount: 10,
    isFeatured: true,
    isHomepageSelected: true,
  };

  // Test Fixture B: Indiana Therapist (46001 - 46298)
  const therapistIN: CustomerTherapist = {
    id: 'therapist-in',
    name: 'Indiana Practitioner',
    title: 'LMT',
    image: '/in.jpg',
    galleryImages: [],
    rating: 4.8,
    reviewCount: 15,
    location: 'Indianapolis, IN',
    serviceAreas: ['Indianapolis, IN'],
    zipCodes: ['46001'],
    rawServiceAreas: [],
    startingPrice: 100,
    availability: 'Available',
    offersStudio: true,
    offersInHome: true,
    specialties: ['Deep Tissue'],
    bio: 'IN therapist',
    services: [
      { id: serviceId, name: 'Deep Tissue Massage', description: 'Deep tissue', durationMinutes: 60, price: 100 },
    ],
    schedule: [],
    bookingCount: 8,
    isFeatured: false,
    isHomepageSelected: false,
  };

  // Test Fixture C: Multi-State Therapist (CA 90001-92692 + IN 46001-46298)
  const therapistMulti: CustomerTherapist = {
    id: 'therapist-multi',
    name: 'Multi-State Practitioner',
    title: 'LMT',
    image: '/multi.jpg',
    galleryImages: [],
    rating: 5.0,
    reviewCount: 30,
    location: 'Los Angeles, CA & Indianapolis, IN',
    serviceAreas: ['Los Angeles, CA', 'Indianapolis, IN'],
    zipCodes: ['90001', '46001'],
    rawServiceAreas: [],
    startingPrice: 110,
    availability: 'Available',
    offersStudio: true,
    offersInHome: true,
    specialties: ['Deep Tissue'],
    bio: 'Multi-state therapist',
    services: [
      { id: serviceId, name: 'Deep Tissue Massage', description: 'Deep tissue', durationMinutes: 60, price: 110 },
    ],
    schedule: [],
    bookingCount: 15,
    isFeatured: true,
    isHomepageSelected: true,
  };

  // Test Fixture D: NY Leading-Zero Therapist (00501 - 00510)
  const therapistNY: CustomerTherapist = {
    id: 'therapist-ny',
    name: 'New York Practitioner',
    title: 'LMT',
    image: '/ny.jpg',
    galleryImages: [],
    rating: 4.9,
    reviewCount: 5,
    location: 'Holtsville, NY',
    serviceAreas: ['Holtsville, NY'],
    zipCodes: ['00501'],
    rawServiceAreas: [],
    startingPrice: 130,
    availability: 'Available',
    offersStudio: true,
    offersInHome: true,
    specialties: ['Deep Tissue'],
    bio: 'NY therapist',
    services: [
      { id: serviceId, name: 'Deep Tissue Massage', description: 'Deep tissue', durationMinutes: 60, price: 130 },
    ],
    schedule: [],
    bookingCount: 3,
    isFeatured: false,
    isHomepageSelected: false,
  };

  const pool = [therapistCA, therapistIN, therapistMulti, therapistNY];

  // Helper to run rankTherapistsForMatch on a strictly COLD cache
  async function runMatchOnColdCache(customerZip: string, targetTherapists: CustomerTherapist[] = pool) {
    clearZipLocationCaches(); // CLEAR CACHE BEFORE MATCHING
    const criteria: MatchCriteria = {
      serviceId,
      locationType: 'IN_HOME',
      locationQuery: '',
      zipCode: customerZip,
      preferredDate: '',
      preferredTime: '',
    };
    return await rankTherapistsForMatch(criteria, targetTherapists);
  }

  // 1. Valid cross-city match: CA 90001-92692 + Customer 90210 -> MATCH
  const res1 = await runMatchOnColdCache('90210');
  const matchedIds1 = res1.map((r) => r.therapist.id);
  assert(matchedIds1.includes('therapist-ca') && matchedIds1.includes('therapist-multi'), 'Case 1: Customer ZIP 90210 MATCHES CA therapists (90001-92692)');

  // 2. Invalid ZIP: Customer 99999 -> NO MATCH
  const res2 = await runMatchOnColdCache('99999');
  assert(res2.length === 0, 'Case 2: Invalid Customer ZIP 99999 returns NO MATCHES');

  // 3. Valid Indiana match: IN 46001-46298 + Customer 46225 -> MATCH
  const res3 = await runMatchOnColdCache('46225');
  const matchedIds3 = res3.map((r) => r.therapist.id);
  assert(matchedIds3.includes('therapist-in') && matchedIds3.includes('therapist-multi'), 'Case 3: Customer ZIP 46225 MATCHES IN therapists (46001-46298)');

  // 4. Wrong state: Indiana therapist + Customer 90210 -> NO MATCH
  const res4 = await runMatchOnColdCache('90210', [therapistIN]);
  assert(res4.length === 0, 'Case 4: Customer CA ZIP 90210 does NOT match Indiana-only therapist');

  // 5. ZIP outside range: Real IN ZIP 46530 outside 46001-46298 range -> NO MATCH
  const res5 = await runMatchOnColdCache('46530', [therapistIN]);
  assert(res5.length === 0, 'Case 5: Customer IN ZIP 46530 (outside 46001-46298) returns NO MATCH');

  // 6. Multiple service areas: Therapist with CA (90001-92692) & IN (46001-46298) matches either CA or IN ZIP
  const res6a = await runMatchOnColdCache('90210', [therapistMulti]);
  const res6b = await runMatchOnColdCache('46225', [therapistMulti]);
  assert(res6a.length === 1 && res6b.length === 1, 'Case 6: Multi-area therapist matches both CA 90001-92692 and IN 46001-46298');

  // 7. Leading-zero ZIP: Customer 00501 -> MATCH NY therapist (00501-00510)
  const res7 = await runMatchOnColdCache('00501', [therapistNY]);
  assert(res7.length === 1 && res7[0].therapist.id === 'therapist-ny', 'Case 7: Leading-zero ZIP 00501 MATCHES NY therapist (00501-00510)');

  // 8. Numerically plausible but nonexistent ZIP: 99998 (inside 90001-99999 range but absent in USZipCode DB) -> NO MATCH
  const therapistFakeRange: CustomerTherapist = {
    ...therapistCA,
    id: 'therapist-fake-range',
    rawServiceAreas: [
      { id: 'sa-fake', cityName: 'Los Angeles', state: 'CA', zipCode: '90001', endZipCode: '99999' },
    ],
  };
  const res8 = await runMatchOnColdCache('99998', [therapistFakeRange]);
  assert(res8.length === 0, 'Case 8: Numerically plausible ZIP 99998 absent from USZipCode DB returns NO MATCH');

  // 9. Negative Test: Customer ZIP is valid and matches therapist city, but therapist lacks TherapistZipEligibility for that ZIP -> EXCLUDED
  // Therapist CA has city "Los Angeles, CA" and rule 90001-90050. Customer supplies valid LA ZIP 90001 (eligible) vs valid LA ZIP 91303 (outside rule range 90001-90050).
  await stageTestTherapist('therapist-ca-narrow', 'CA Narrow Practitioner', [{ state: 'CA', startZip: '90001', endZip: '90050' }]);
  const therapistCANarrow: CustomerTherapist = {
    ...therapistCA,
    id: 'therapist-ca-narrow',
    location: 'Los Angeles, CA',
    serviceAreas: ['Los Angeles, CA'],
  };

  const res9a = await runMatchOnColdCache('90001', [therapistCANarrow]);
  const res9b = await runMatchOnColdCache('91303', [therapistCANarrow]);
  assert(res9a.length === 1, 'Case 9a: Explicit ZIP 90001 inside TherapistZipEligibility matches therapist in Los Angeles');
  assert(res9b.length === 0, 'Case 9b: Explicit ZIP 91303 outside TherapistZipEligibility is EXCLUDED even if city matches Los Angeles');

  console.log('\n✅ ALL 9 COLD-CACHE rankTherapistsForMatch() TEST CASES PASSED SUCCESSFULLY!');
}

runRealLocationTests();
