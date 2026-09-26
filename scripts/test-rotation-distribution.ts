import { db } from '../src/lib/db';
import { createSessionToken } from '../src/lib/auth-session';
import { getRotatingTherapistsForZip } from '../src/lib/matching';
import { CustomerTherapist } from '../src/types/customer';
import { randomUUID } from 'crypto';

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

  // SAFETY GUARD: Fail closed if running against a production environment URL
  const tursoUrl = (process.env.TURSO_DATABASE_URL || '').toLowerCase();
  if (process.env.NODE_ENV === 'production' && !tursoUrl.includes('file:')) {
    console.error('❌ SAFETY GUARD TRIGGERED: Cannot run test-rotation-distribution.ts against a production database.');
    process.exit(1);
  }

  const createdTherapistIds: string[] = [];
  const testRunTag = `test-rot-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const testVisitor = `test-visitor-session-${randomUUID()}`;
  const testZip = '90210';

  let initialTimestampRecord: { id: string; content: string } | null = null;
  let timestampWasCreatedByTest = false;

  try {
    // Record initial state of active_distribution_timestamp in SiteContent
    const existingTimestampRecord = await db.siteContent.findUnique({
      where: { key: 'active_distribution_timestamp' },
    });

    if (existingTimestampRecord) {
      initialTimestampRecord = {
        id: existingTimestampRecord.id,
        content: existingTimestampRecord.content,
      };
    } else {
      timestampWasCreatedByTest = true;
    }

    // 1. Create 12 isolated test therapists with isTest: true
    console.log('1. Creating isolated test therapists with isTest: true...');
    const createdDbTherapists = [];
    for (let i = 0; i < 12; i++) {
      const t = await db.therapist.create({
        data: {
          name: `Rotational Test Therapist ${i + 1} (${testRunTag})`,
          email: `${testRunTag}.${i + 1}@massaf-test.com`,
          hourlyRate: 100.0 + i * 5,
          isActive: true,
          isTest: true,
        },
      });
      createdTherapistIds.push(t.id);
      createdDbTherapists.push(t);
    }

    console.log(`  ✓ Created ${createdTherapistIds.length} test therapists with isTest: true`);

    // 2. Create isolated test TherapistZipEligibility rules for these test therapists WITHOUT modifying real distribution timestamp
    console.log('\n2. Injecting isolated TherapistZipEligibility rules for test therapists...');

    let activeTimestamp = initialTimestampRecord ? new Date(initialTimestampRecord.content) : null;
    if (!activeTimestamp || isNaN(activeTimestamp.getTime())) {
      activeTimestamp = new Date();
      await db.siteContent.upsert({
        where: { key: 'active_distribution_timestamp' },
        update: { content: activeTimestamp.toISOString() },
        create: {
          key: 'active_distribution_timestamp',
          title: 'Active Distribution Timestamp',
          content: activeTimestamp.toISOString(),
        },
      });
    }

    const testEligibilityData = createdDbTherapists.map((t) => ({
      therapistId: t.id,
      state: 'CA',
      startZip: '90001',
      endZip: '92692',
      createdAt: activeTimestamp!,
    }));

    await db.therapistZipEligibility.createMany({
      data: testEligibilityData,
    });

    const eligibilityCount = await db.therapistZipEligibility.count({
      where: { therapistId: { in: createdTherapistIds } },
    });
    console.log(`  ✓ Test TherapistZipEligibility records created for test therapists: ${eligibilityCount}`);
    assert(eligibilityCount === 12, 'Test TherapistZipEligibility records persisted');

    // 3. Test Customer-Specific Rolling 5-Therapist Rotation Engine
    console.log('\n3. Testing Rolling 5-Therapist Rotation Engine (getRotatingTherapistsForZip)...');

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

    // Search 3: Re-querying rotation returns 5 therapists consistently
    const search3 = await getRotatingTherapistsForZip(testZip, testPool, { visitorSessionId: testVisitor });
    assert(search3.length === 5, 'Search 3 returns 5 therapists after rotation history persistence');

    console.log('\n✅ ALL ROTATION & ISOLATED ZIP DISTRIBUTION TESTS PASSED SUCCESSFULLY!');
  } finally {
    // GUARANTEED CLEANUP: Clean up all records created during test run even on assertion failure
    console.log('\n--- Executing Guaranteed Test Cleanup ---');

    // 1. Clean up rotation history created by test visitor session
    try {
      await db.customerRotationHistory.deleteMany({
        where: { visitorSessionId: testVisitor },
      });
    } catch (err) {
      console.error('Error cleaning up test rotation history:', err);
    }

    // 2. Clean up test therapists and dependent records
    if (createdTherapistIds.length > 0) {
      try {
        await db.customerRotationHistory.deleteMany({
          where: { therapistId: { in: createdTherapistIds } },
        });
        await db.therapistZipEligibility.deleteMany({
          where: { therapistId: { in: createdTherapistIds } },
        });
        await db.therapistPhoto.deleteMany({
          where: { therapistId: { in: createdTherapistIds } },
        });
        await db.therapistService.deleteMany({
          where: { therapistId: { in: createdTherapistIds } },
        });
        await db.therapistAvailability.deleteMany({
          where: { therapistId: { in: createdTherapistIds } },
        });
        await db.serviceArea.deleteMany({
          where: { therapistId: { in: createdTherapistIds } },
        });
        const deletedTherapists = await db.therapist.deleteMany({
          where: { id: { in: createdTherapistIds } },
        });
        console.log(`  ✓ Cleaned up ${deletedTherapists.count} test therapist records and all dependent records.`);
      } catch (cleanupErr) {
        console.error('Error during therapist test cleanup:', cleanupErr);
      }
    }

    // 3. Clean up active_distribution_timestamp in SiteContent
    try {
      if (timestampWasCreatedByTest) {
        await db.siteContent.deleteMany({
          where: { key: 'active_distribution_timestamp' },
        });
        console.log('  ✓ Removed active_distribution_timestamp in SiteContent (created by test).');
      } else if (initialTimestampRecord) {
        await db.siteContent.update({
          where: { id: initialTimestampRecord.id },
          data: { content: initialTimestampRecord.content },
        });
        console.log('  ✓ Restored pre-existing active_distribution_timestamp in SiteContent.');
      }
    } catch (siteContentErr) {
      console.error('Error cleaning up active_distribution_timestamp in SiteContent:', siteContentErr);
    }
  }
}

runRotationAndDistributionTests();
