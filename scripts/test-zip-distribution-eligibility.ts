import { db } from '../src/lib/db';
import { shuffleAndDistributeTherapistsAction } from '../src/app/admin/actions';
import { therapistCoversZipAsync } from '../src/lib/db-therapists';
import { createSessionToken } from '../src/lib/auth-session';
import { CustomerTherapist } from '../src/types/customer';

async function runAnalysisAndTests() {
  console.log('=== ZIP Distribution Scaling, Boundary & Integration Tests ===\n');

  // Find or create admin user for action calls
  let adminUser = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!adminUser) {
    adminUser = await db.user.create({
      data: {
        name: 'Test Super Admin',
        email: 'testsuperadmin@massaf.com',
        role: 'SUPER_ADMIN',
        passwordHash: 'hash',
        isActive: true,
      },
    });
  }

  const adminToken = createSessionToken(adminUser.id, adminUser.email, 'ADMIN', 24, adminUser.role);
  (globalThis as any).__TEST_ADMIN_SESSION_TOKEN__ = adminToken;

  // 1. Count total active therapists in database
  const activeTherapists = await db.therapist.findMany({
    where: { isActive: true },
    select: { id: true, name: true, isFeatured: true, offersInHome: true, rating: true, reviewCount: true },
  });

  console.log(`Active Therapists Count: ${activeTherapists.length}`);

  // 2. Count total USZipCode records in database
  const totalZipCount = await db.uSZipCode.count();
  console.log(`USZipCode Records Count: ${totalZipCount}`);

  // 3. Perform shuffle & distribution execution with admin cookie
  console.log('\nExecuting shuffleAndDistributeTherapistsAction()...');
  const distResult = await shuffleAndDistributeTherapistsAction();
  console.log('Distribution Result:', distResult);

  if (!distResult.success) {
    console.error('FAILED: shuffleAndDistributeTherapistsAction did not succeed.');
    process.exit(1);
  }

  // 4. Count total TherapistZipEligibility range records created
  const eligibilityRecordCount = await db.therapistZipEligibility.count();
  console.log(`\nGenerated TherapistZipEligibility Records: ${eligibilityRecordCount}`);

  // 5. Analyze generated ranges for blanket state-wide min/max spans
  const allRanges = await db.therapistZipEligibility.findMany();
  let maxSpan = 0;
  let blanketRangeCount = 0;

  for (const r of allRanges) {
    const numericStart = parseInt(r.startZip, 10);
    const numericEnd = parseInt(r.endZip, 10);
    const span = numericEnd - numericStart;
    if (span > maxSpan) {
      maxSpan = span;
    }
    // A blanket state range typically spans thousands (e.g. CA 90001 to 96162 span = 6161)
    if (span > 1000) {
      blanketRangeCount++;
    }
  }

  console.log(`Max Numeric Zip Span in any range: ${maxSpan}`);
  console.log(`Blanket Ranges (>1000 span) Found: ${blanketRangeCount}`);

  if (blanketRangeCount > 0) {
    console.error('FAILED: Found blanket state-wide ranges!');
    process.exit(1);
  } else {
    console.log('SUCCESS: Zero state-wide blanket ranges generated! All ranges are compact geographic SCF clusters.');
  }

  // 6. Turso DB Write Budget Calculation
  const estimatedWritesPerDistribution = eligibilityRecordCount + activeTherapists.length;
  console.log(`Estimated Turso Writes Per Distribution Run: ${estimatedWritesPerDistribution}`);
  console.log(`Percentage of Turso 10,000,000 Monthly Write Budget: ${((estimatedWritesPerDistribution / 10000000) * 100).toFixed(4)}%`);

  // 7. Test cold-cache integration & fail-closed behavior
  console.log('\n--- Cold-Cache Integration & Stale Distribution Tests ---');

  // 1. Identify active test therapist in DB
  let testTherapist = await db.therapist.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, isFeatured: true, offersInHome: true, rating: true, reviewCount: true },
  });

  if (!testTherapist) {
    testTherapist = await db.therapist.create({
      data: { name: 'Test Scaling Therapist', email: 'scaling@test.com', isActive: true },
      select: { id: true, name: true, isFeatured: true, offersInHome: true, rating: true, reviewCount: true },
    });
  }

  // Ensure active distribution timestamp and test rule exist
  const activeTimestampRecord = await db.siteContent.findUnique({ where: { key: 'active_distribution_timestamp' } });
  const activeTimestamp = activeTimestampRecord ? new Date(activeTimestampRecord.content) : new Date();

  await db.therapistZipEligibility.deleteMany({ where: { therapistId: testTherapist.id } });
  await db.therapistZipEligibility.create({
    data: {
      therapistId: testTherapist.id,
      state: 'CA',
      startZip: '90001',
      endZip: '90050',
      createdAt: activeTimestamp,
    },
  });

  // 3. Query assigned TherapistZipEligibility records for testTherapist
  const assignedRanges = await db.therapistZipEligibility.findMany({
    where: { therapistId: testTherapist.id },
  });

  console.log(`Assigned ranges for test therapist (${testTherapist.name}): ${assignedRanges.length}`);

  if (assignedRanges.length > 0) {
    const sampleRange = assignedRanges[0];
    const validAssignedZip = sampleRange.startZip;
    const outsideZip = '00000';

    const publicTherapist: CustomerTherapist = {
      id: testTherapist.id,
      name: testTherapist.name,
      rating: testTherapist.rating ?? 5.0,
      reviewCount: testTherapist.reviewCount ?? 0,
      isFeatured: testTherapist.isFeatured ?? false,
      offersInHome: testTherapist.offersInHome ?? true,
      offersStudio: true,
      bio: '',
      image: '',
      galleryImages: [],
      startingPrice: 100,
      availability: 'Available today',
      location: 'Los Angeles, CA',
      serviceAreas: [],
      zipCodes: [],
      services: [],
      specialties: [],
      schedule: [],
      bookingCount: 0,
    };

    const isEligibleForAssigned = await therapistCoversZipAsync(publicTherapist, validAssignedZip);
    console.log(`[Cold Cache] Checking assigned ZIP ${validAssignedZip} for ${testTherapist.name}: ${isEligibleForAssigned}`);

    if (!isEligibleForAssigned) {
      console.error(`FAILED: therapistCoversZipAsync returned false for valid assigned ZIP ${validAssignedZip}`);
      process.exit(1);
    } else {
      console.log('SUCCESS: Cold-cache therapistCoversZipAsync accurately matched assigned ZIP!');
    }

    const isEligibleForOutside = await therapistCoversZipAsync(publicTherapist, outsideZip);
    console.log(`[Cold Cache] Checking outside ZIP ${outsideZip} for ${testTherapist.name}: ${isEligibleForOutside}`);

    if (isEligibleForOutside) {
      console.error(`FAILED: therapistCoversZipAsync returned true for non-assigned ZIP ${outsideZip}`);
      process.exit(1);
    } else {
      console.log('SUCCESS: Cold-cache therapistCoversZipAsync accurately rejected non-assigned ZIP!');
    }

    // Test C: Stale distribution records from older timestamp are excluded
    console.log('\nTesting exclusion of stale distribution records...');
    const newActiveTimestamp = new Date(Date.now() + 10000);
    await db.siteContent.upsert({
      where: { key: 'active_distribution_timestamp' },
      update: { content: newActiveTimestamp.toISOString() },
      create: { key: 'active_distribution_timestamp', title: 'Active Distribution Timestamp', content: newActiveTimestamp.toISOString() },
    });

    const isEligibleForStale = await therapistCoversZipAsync(publicTherapist, '90001');
    console.log(`[Stale Test] therapistCoversZipAsync for stale rule ZIP 90001: ${isEligibleForStale}`);
    if (isEligibleForStale) {
      console.error('FAILED: Stale distribution rule granted eligibility!');
      process.exit(1);
    }
    console.log('SUCCESS: Stale distribution record from older timestamp was rejected!');

    // Test D: Fail Closed when active_distribution_timestamp is missing in therapistCoversZipAsync
    console.log('\nTesting Fail-Closed behavior when active_distribution_timestamp is missing...');
    await db.siteContent.deleteMany({ where: { key: 'active_distribution_timestamp' } });

    const isEligibleWhenMissing = await therapistCoversZipAsync(publicTherapist, validAssignedZip);
    console.log(`[Fail Closed] therapistCoversZipAsync with missing timestamp: ${isEligibleWhenMissing}`);
    if (isEligibleWhenMissing) {
      console.error('FAILED: therapistCoversZipAsync returned true when active distribution timestamp was missing!');
      process.exit(1);
    }
    console.log('SUCCESS: therapistCoversZipAsync failed closed (returned false) when distribution timestamp was missing!');

    // Test E: getRotatingTherapistsForZip fails closed (returns []) when active_distribution_timestamp is missing
    const { getRotatingTherapistsForZip } = await import('../src/lib/matching');
    const rotationResultsWhenMissing = await getRotatingTherapistsForZip(validAssignedZip, [publicTherapist]);
    console.log(`[Fail Closed] getRotatingTherapistsForZip count with missing timestamp: ${rotationResultsWhenMissing.length}`);
    if (rotationResultsWhenMissing.length !== 0) {
      console.error('FAILED: getRotatingTherapistsForZip returned non-empty pool when distribution timestamp was missing!');
      process.exit(1);
    }
    console.log('SUCCESS: getRotatingTherapistsForZip failed closed (returned []) when distribution timestamp was missing!');

    // Restore active distribution timestamp
    await db.siteContent.create({
      data: {
        key: 'active_distribution_timestamp',
        title: 'Active Distribution Timestamp',
        content: newActiveTimestamp.toISOString(),
      },
    });

    // Test F: Therapist Edit Page data loading performance for therapist with large number of eligibility ranges
    console.log('\nTesting Therapist Edit Page data loading performance with large eligibility set...');
    // Assign 670+ eligibility ranges across multiple states to testTherapist
    const allStates = await db.uSZipCode.findMany({ select: { state: true }, distinct: ['state'], take: 20 });
    const bulkRanges = [];
    for (const stObj of allStates) {
      for (let i = 0; i < 35; i++) {
        const startNum = 10000 + i * 100;
        const endNum = startNum + 50;
        bulkRanges.push({
          therapistId: testTherapist.id,
          state: stObj.state,
          startZip: String(startNum).padStart(5, '0'),
          endZip: String(endNum).padStart(5, '0'),
          createdAt: newActiveTimestamp,
        });
      }
    }

    await db.therapistZipEligibility.deleteMany({ where: { therapistId: testTherapist.id } });
    await db.therapistZipEligibility.createMany({ data: bulkRanges });

    const totalAssignedTestRanges = await db.therapistZipEligibility.count({ where: { therapistId: testTherapist.id } });
    console.log(`Assigned ${totalAssignedTestRanges} eligibility ranges to therapist ${testTherapist.id} for performance test.`);

    const startTime = Date.now();

    // Simulate data loading logic in /admin/therapists/[id]/page.tsx
    const dbTherapist = await db.therapist.findUnique({
      where: { id: testTherapist.id },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        services: { include: { service: true } },
        availabilities: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        zipEligibility: { orderBy: [{ state: 'asc' }, { startZip: 'asc' }] },
      },
    });

    if (!dbTherapist) {
      console.error('FAILED: DB therapist for performance test not found!');
      process.exit(1);
    }

    let pageZipCoverageGroups = [];
    let pageTotalAssignedZips = 0;

    if (dbTherapist.zipEligibility.length > 0) {
      const stateGroupMap = new Map<string, Array<{ startZip: string; endZip: string }>>();
      for (const ze of dbTherapist.zipEligibility) {
        const st = ze.state.toUpperCase();
        if (!stateGroupMap.has(st)) stateGroupMap.set(st, []);
        stateGroupMap.get(st)!.push({ startZip: ze.startZip, endZip: ze.endZip });
      }

      const uniqueStates = Array.from(stateGroupMap.keys());

      // Single batched query
      const allStateZips = await db.uSZipCode.findMany({
        where: { state: { in: uniqueStates } },
        select: { state: true, stateName: true, city: true, zipCode: true },
        orderBy: { zipCode: 'asc' },
      });

      const zipsByState = new Map<string, Array<{ zipCode: string; city: string; stateName: string }>>();
      const stateNameMap = new Map<string, string>();

      for (const z of allStateZips) {
        const st = z.state.toUpperCase();
        if (!zipsByState.has(st)) zipsByState.set(st, []);
        zipsByState.get(st)!.push(z);
        if (!stateNameMap.has(st) && z.stateName) stateNameMap.set(st, z.stateName);
      }

      for (const [st, ranges] of stateGroupMap.entries()) {
        const stateZips = zipsByState.get(st) || [];
        const rangesWithDetails = [];
        let stateZipCount = 0;

        for (const r of ranges) {
          const matchingZips = stateZips.filter((z) => z.zipCode >= r.startZip && z.zipCode <= r.endZip);
          const uniqueCities: string[] = [];
          const citySet = new Set<string>();
          for (const z of matchingZips) {
            if (!citySet.has(z.city)) {
              citySet.add(z.city);
              uniqueCities.push(z.city);
              if (uniqueCities.length === 5) break;
            }
          }
          const rangeCount = matchingZips.length;
          stateZipCount += rangeCount;
          rangesWithDetails.push({
            startZip: r.startZip,
            endZip: r.endZip,
            sampleCities: uniqueCities,
            count: rangeCount,
          });
        }

        pageTotalAssignedZips += stateZipCount;
        pageZipCoverageGroups.push({
          state: st,
          stateName: stateNameMap.get(st) || st,
          ranges: rangesWithDetails,
          totalStateZips: stateZipCount,
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Therapist edit page data loading execution time for ${totalAssignedTestRanges} ranges: ${duration} ms`);

    if (duration > 3000) {
      console.error(`FAILED: Data loading took too long (${duration} ms)`);
      process.exit(1);
    }

    console.log(`SUCCESS: Therapist edit page loaded ${totalAssignedTestRanges} eligibility ranges in ${duration} ms (well within 3000ms threshold)!`);
  }

  console.log('\n=== Analysis Completed Successfully ===');
}

runAnalysisAndTests()
  .catch((err) => {
    console.error('Error running scaling analysis:', err);
    process.exit(1);
  });
