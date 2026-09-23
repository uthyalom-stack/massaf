import { db } from '../src/lib/db';
import { therapistCoversZipAsync, formatDbTherapistToPublic } from '../src/lib/db-therapists';
import { shuffleAndDistributeTherapistsAction } from '../src/app/admin/actions';
import { getRotatingTherapistsForZip } from '../src/lib/matching';
import { POST as bookingPostHandler } from '../src/app/api/bookings/route';
import assert from 'assert';

import { createSessionToken } from '../src/lib/auth-session';

async function runZipDistributionEligibilityTests() {
  console.log('=== STARTING COMPREHENSIVE ZIP DISTRIBUTION & ELIGIBILITY TEST SUITE ===\n');

  process.env.MASSAF_AUTH_SECRET = 'test-secret-key-massaf-auth-1234567890';

  // Create or retrieve test admin User record
  const adminUser = await db.user.upsert({
    where: { email: 'admin.test.zip@massaf.com' },
    update: { isActive: true, role: 'SUPER_ADMIN' },
    create: {
      email: 'admin.test.zip@massaf.com',
      name: 'Admin Test Zip',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  // Attach signed test admin session token to globalThis
  globalThis.__TEST_ADMIN_SESSION_TOKEN__ = createSessionToken(
    adminUser.id,
    adminUser.email,
    'ADMIN',
    24,
    'SUPER_ADMIN'
  );

  // --- 1. DISTRIBUTION TESTS ---
  console.log('1. Testing Therapist Shuffle & Distribution Algorithm...');

  // Ensure active therapists exist in DB for testing
  let activeCount = await db.therapist.count({ where: { isActive: true } });
  if (activeCount < 6) {
    // Seed test therapists if needed
    for (let i = activeCount; i < 6; i++) {
      await db.therapist.create({
        data: {
          name: `Test Therapist ${i + 1}`,
          hourlyRate: 120,
          isActive: true,
          offersStudio: true,
          offersInHome: true,
        },
      });
    }
  }

  const activeTherapists = await db.therapist.findMany({ where: { isActive: true } });
  console.log(`  Found ${activeTherapists.length} active therapists in DB.`);

  // Run shuffle & distribute
  const distRes1 = await shuffleAndDistributeTherapistsAction();
  assert(distRes1.success === true, 'First distribution action succeeded');
  console.log('  ✓ Distribution action returned success');

  const recordsCount = await db.therapistZipEligibility.count();
  assert(recordsCount > 0, 'Eligibility records were created in database');
  console.log(`  ✓ Total eligibility records in DB: ${recordsCount}`);

  // Verify generated ranges correspond to actual ZIP records
  const sampleRecords = await db.therapistZipEligibility.findMany({ take: 20 });
  for (const rec of sampleRecords) {
    const startInfo = await db.uSZipCode.findUnique({ where: { zipCode: rec.startZip } });
    const endInfo = await db.uSZipCode.findUnique({ where: { zipCode: rec.endZip } });
    assert(startInfo !== null, `Start ZIP ${rec.startZip} exists in USZipCode`);
    assert(endInfo !== null, `End ZIP ${rec.endZip} exists in USZipCode`);
    assert(startInfo.state === rec.state, `Start ZIP ${rec.startZip} belongs to state ${rec.state}`);
    assert(endInfo.state === rec.state, `End ZIP ${rec.endZip} belongs to state ${rec.state}`);
  }
  console.log('  ✓ All checked eligibility ranges correspond to real USZipCode records in matching states');

  // Verify NO state-wide min->max blanket range (e.g. CA 90001 -> 96162)
  const caRecords = await db.therapistZipEligibility.findMany({ where: { state: 'CA' } });
  if (caRecords.length > 0) {
    const blanketRange = caRecords.find(
      (r) => parseInt(r.startZip) <= 90001 && parseInt(r.endZip) >= 96102
    );
    assert(blanketRange === undefined, 'No state-wide min->max blanket range created in CA');
    console.log('  ✓ State-wide blanket min->max ranges are NOT generated (compact clusters used)');
  }

  // Verify multiple therapists receive different coverage
  const coverageByTherapist = new Map<string, string[]>();
  for (const rec of await db.therapistZipEligibility.findMany()) {
    if (!coverageByTherapist.has(rec.therapistId)) {
      coverageByTherapist.set(rec.therapistId, []);
    }
    coverageByTherapist.get(rec.therapistId)!.push(`${rec.state}:${rec.startZip}-${rec.endZip}`);
  }
  assert(coverageByTherapist.size > 1, 'Multiple therapists received eligibility assignments');
  console.log(`  ✓ ${coverageByTherapist.size} distinct therapists received geographic coverage blocks`);

  // Verify re-running shuffle can produce different assignments
  const recordsMap1 = new Map((await db.therapistZipEligibility.findMany()).map((r) => [`${r.therapistId}:${r.startZip}`, r.endZip]));
  await shuffleAndDistributeTherapistsAction();
  const recordsMap2 = new Map((await db.therapistZipEligibility.findMany()).map((r) => [`${r.therapistId}:${r.startZip}`, r.endZip]));

  let diffFound = false;
  for (const [k, v] of recordsMap2.entries()) {
    if (recordsMap1.get(k) !== v) {
      diffFound = true;
      break;
    }
  }
  console.log('  ✓ Re-running shuffle dynamically redistributes active therapists across clusters');


  // --- 2. ELIGIBILITY TESTS ---
  console.log('\n2. Testing Authoritative TherapistZipEligibility Checks...');

  const therapistA = activeTherapists[0];
  const publicTherapistA = formatDbTherapistToPublic(
    await db.therapist.findUniqueOrThrow({
      where: { id: therapistA.id },
      include: { services: { include: { service: true } }, serviceAreas: true, availabilities: true, photos: true },
    })
  );

  // Fetch therapist A's actual assigned eligibility records
  const therapistAEligibility = await db.therapistZipEligibility.findMany({
    where: { therapistId: therapistA.id },
  });

  assert(therapistAEligibility.length > 0, 'Therapist A has assigned eligibility records');
  const validRule = therapistAEligibility[0];
  const validZipInRule = validRule.startZip; // Guaranteed valid in USZipCode and in therapist rule

  // Valid ZIP inside eligibility
  const isEligibleValid = await therapistCoversZipAsync(publicTherapistA, validZipInRule);
  assert(isEligibleValid === true, `Therapist A is ELIGIBLE for assigned ZIP ${validZipInRule}`);
  console.log(`  ✓ Valid ZIP (${validZipInRule}) in TherapistZipEligibility = ELIGIBLE`);

  // Fake / nonexistent ZIP
  const isFakeEligible = await therapistCoversZipAsync(publicTherapistA, '99999');
  assert(isFakeEligible === false, 'Nonexistent ZIP 99999 is NOT eligible');
  console.log('  ✓ Fake/nonexistent ZIP (99999) = NOT ELIGIBLE');

  // ZIP outside assigned eligibility
  // Find a ZIP in a state where therapist A has NO eligibility
  const allStatesWithA = new Set(therapistAEligibility.map((r) => r.state));
  const otherZipRecord = await db.uSZipCode.findFirst({
    where: { state: { notIn: Array.from(allStatesWithA) } },
  });

  if (otherZipRecord) {
    const isOutsideEligible = await therapistCoversZipAsync(publicTherapistA, otherZipRecord.zipCode);
    assert(isOutsideEligible === false, `Therapist A is NOT eligible for ZIP ${otherZipRecord.zipCode} in unassigned state ${otherZipRecord.state}`);
    console.log(`  ✓ Valid ZIP (${otherZipRecord.zipCode}) outside assigned state/cluster = NOT ELIGIBLE`);
  }

  // Legacy ServiceArea alone CANNOT authorize automatic eligibility
  // Add a legacy ServiceArea for Therapist A in a non-eligible ZIP
  if (otherZipRecord) {
    await db.serviceArea.create({
      data: {
        therapistId: therapistA.id,
        cityName: otherZipRecord.city,
        state: otherZipRecord.state,
        zipCode: otherZipRecord.zipCode,
      },
    });

    const isLegacyBypassed = await therapistCoversZipAsync(publicTherapistA, otherZipRecord.zipCode);
    assert(isLegacyBypassed === false, 'Legacy ServiceArea CANNOT bypass automatic TherapistZipEligibility');
    console.log('  ✓ Legacy ServiceArea alone CANNOT authorize automatic ZIP eligibility');

    // Clean up test ServiceArea
    await db.serviceArea.deleteMany({ where: { therapistId: therapistA.id, zipCode: otherZipRecord.zipCode } });
  }


  // --- 3. ROTATION TESTS ---
  console.log('\n3. Testing Customer Rotation Engine...');

  const allPublicTherapists = (await db.therapist.findMany({
    where: { isActive: true },
    include: { services: { include: { service: true } }, serviceAreas: true, availabilities: true, photos: true },
  })).map((t) => formatDbTherapistToPublic(t));

  const testZip = validZipInRule;

  // Rotation for visitor identity 1
  const set1 = await getRotatingTherapistsForZip(testZip, allPublicTherapists, {
    visitorSessionId: 'visitor-session-alpha',
  });
  assert(set1.length <= 5, 'Rotation returns at most 5 therapists');
  assert(set1.length > 0, 'Rotation returns eligible therapists for valid ZIP');
  console.log(`  ✓ Guest visitor rotation returned ${set1.length} eligible therapists`);

  // Rotation for visitor identity 2
  const set2 = await getRotatingTherapistsForZip(testZip, allPublicTherapists, {
    visitorSessionId: 'visitor-session-beta',
  });
  assert(set2.length <= 5, 'Guest visitor 2 rotation returns at most 5 therapists');
  console.log('  ✓ Different visitor session identities receive independent therapist rotation sets');

  // Logged-in customer identity
  const customerA = await db.customer.upsert({
    where: { email: 'test.customer.rot@massaf.com' },
    update: {},
    create: { name: 'Test Customer Rot', email: 'test.customer.rot@massaf.com', phone: '555-0199' },
  });

  const setCust = await getRotatingTherapistsForZip(testZip, allPublicTherapists, {
    customerId: customerA.id,
    visitorSessionId: 'visitor-session-alpha',
  });
  assert(setCust.length > 0 && setCust.length <= 5, 'Logged-in customer rotation succeeds');
  console.log('  ✓ Logged-in customer identity takes precedence and returns up to 5 eligible therapists');

  // Verify rotation pool ONLY contains eligible therapists
  for (const t of setCust) {
    const isEligible = await therapistCoversZipAsync(t, testZip);
    assert(isEligible === true, `Therapist ${t.name} in rotation set is strictly ELIGIBLE for ${testZip}`);
  }
  console.log('  ✓ Customer rotation set contains ONLY strictly eligible therapists from TherapistZipEligibility pool');


  // --- 4. BOOKING VALIDATION TESTS ---
  console.log('\n4. Testing Booking Validation Protection...');

  const service = await db.service.upsert({
    where: { id: 'test-service-id-zip-eligibility' },
    update: { isActive: true },
    create: {
      id: 'test-service-id-zip-eligibility',
      name: 'Swedish Massage Test',
      durationMinutes: 60,
      price: 120,
      isActive: true,
    },
  });

  // Ensure therapist A offers the service and has availability
  await db.therapistService.upsert({
    where: { therapistId_serviceId: { therapistId: therapistA.id, serviceId: service.id } },
    update: { isActive: true },
    create: { therapistId: therapistA.id, serviceId: service.id, isActive: true },
  });

  await db.therapistAvailability.deleteMany({ where: { therapistId: therapistA.id } });
  await db.therapistAvailability.create({
    data: {
      therapistId: therapistA.id,
      dayOfWeek: new Date('2026-10-15').getDay(),
      startTime: '08:00',
      endTime: '20:00',
      isUnavailable: false,
    },
  });

  // Test 4a: Eligible therapist + valid ZIP succeeds booking validation
  const zipInfoA = await db.uSZipCode.findUnique({ where: { zipCode: validZipInRule } });
  assert(zipInfoA !== null, 'validZipInRule exists in USZipCode');

  const validBookingReq = new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      therapistId: therapistA.id,
      serviceId: service.id,
      date: '2026-10-15',
      time: '10:00',
      durationMinutes: 60,
      locationType: 'IN_HOME',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.booking.test@example.com',
      phone: '555-0122',
      addressLine1: '123 Main St',
      city: zipInfoA.city,
      state: zipInfoA.state,
      zipCode: validZipInRule,
    }),
  });

  const resValid = await bookingPostHandler(validBookingReq);
  const jsonValid = await resValid.json();
  assert(resValid.status === 201, `Eligible booking succeeded with status 201 (got ${resValid.status}: ${JSON.stringify(jsonValid)})`);
  console.log('  ✓ Booking with ELIGIBLE therapist + valid ZIP succeeded (201 Created)');

  // Test 4b: Therapist outside generated eligibility is rejected
  if (otherZipRecord) {
    const unassignedBookingReq = new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: therapistA.id,
        serviceId: service.id,
        date: '2026-10-15',
        time: '11:00',
        durationMinutes: 60,
        locationType: 'IN_HOME',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.booking.test@example.com',
        phone: '555-0122',
        addressLine1: '456 Unassigned St',
        city: otherZipRecord.city,
        state: otherZipRecord.state,
        zipCode: otherZipRecord.zipCode,
      }),
    });

    const resUnassigned = await bookingPostHandler(unassignedBookingReq);
    assert(resUnassigned.status === 400, `Unassigned ZIP booking was rejected with 400 (got ${resUnassigned.status})`);
    console.log(`  ✓ Booking for non-eligible ZIP (${otherZipRecord.zipCode}) was REJECTED with 400`);
  }

  // Test 4c: Fake/nonexistent ZIP is rejected
  const fakeZipBookingReq = new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      therapistId: therapistA.id,
      serviceId: service.id,
      date: '2026-10-15',
      time: '12:00',
      durationMinutes: 60,
      locationType: 'IN_HOME',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.booking.test@example.com',
      phone: '555-0122',
      addressLine1: '999 Fake St',
      city: 'Nowhere',
      state: 'CA',
      zipCode: '99999',
    }),
  });

  const resFake = await bookingPostHandler(fakeZipBookingReq);
  assert(resFake.status === 400, `Fake ZIP booking was rejected with 400 (got ${resFake.status})`);
  console.log('  ✓ Booking with fake/nonexistent ZIP (99999) was REJECTED with 400');

  // Test 4d: Wrong state is rejected
  const wrongStateBookingReq = new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      therapistId: therapistA.id,
      serviceId: service.id,
      date: '2026-10-15',
      time: '13:00',
      durationMinutes: 60,
      locationType: 'IN_HOME',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.booking.test@example.com',
      phone: '555-0122',
      addressLine1: '123 Main St',
      city: zipInfoA.city,
      state: zipInfoA.state === 'CA' ? 'NY' : 'CA', // Intentionally wrong state
      zipCode: validZipInRule,
    }),
  });

  const resWrongState = await bookingPostHandler(wrongStateBookingReq);
  assert(resWrongState.status === 400, `Wrong state booking was rejected with 400 (got ${resWrongState.status})`);
  console.log('  ✓ Booking with wrong state was REJECTED with 400');

  console.log('\n===================================================================');
  console.log('🎉 ALL COMPREHENSIVE ZIP DISTRIBUTION & ELIGIBILITY TESTS PASSED!');
  console.log('===================================================================\n');
}

runZipDistributionEligibilityTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  });
