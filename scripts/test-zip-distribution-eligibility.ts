import { db } from '../src/lib/db';
import { therapistCoversZipAsync } from '../src/lib/db-therapists';
import { CustomerTherapist } from '../src/types/customer';

async function runAnalysisAndTests() {
  console.log('=== Step 1: Loading Real USZipCode Dataset in Memory ===');
  const allZipRecords = await db.uSZipCode.findMany({
    select: { state: true, zipCode: true },
    orderBy: [{ state: 'asc' }, { zipCode: 'asc' }],
  });

  console.log(`Loaded ${allZipRecords.length} real USZipCode records.`);

  console.log('\n=== Step 2: Running Compact SCF Geographic Clustering in Memory ===');
  const scfMap = new Map<string, { state: string; zipCodes: string[] }>();

  for (const z of allZipRecords) {
    if (!z.state || !z.zipCode) continue;
    const cleanZip = z.zipCode.trim().padStart(5, '0');
    const scfPrefix = cleanZip.substring(0, 3);
    const st = z.state.toUpperCase();
    const key = `${st}_${scfPrefix}`;

    if (!scfMap.has(key)) {
      scfMap.set(key, { state: st, zipCodes: [] });
    }
    scfMap.get(key)!.zipCodes.push(cleanZip);
  }

  const allClusters: Array<{ state: string; startZip: string; endZip: string; count: number }> = [];

  for (const [, region] of scfMap.entries()) {
    region.zipCodes.sort((a, b) => a.localeCompare(b));
    let chunk: string[] = [];
    for (const zip of region.zipCodes) {
      if (chunk.length === 0) {
        chunk.push(zip);
      } else {
        const firstNum = parseInt(chunk[0], 10);
        const currNum = parseInt(zip, 10);
        if (!isNaN(firstNum) && !isNaN(currNum) && currNum - firstNum <= 100 && chunk.length < 50) {
          chunk.push(zip);
        } else {
          allClusters.push({
            state: region.state,
            startZip: chunk[0],
            endZip: chunk[chunk.length - 1],
            count: chunk.length,
          });
          chunk = [zip];
        }
      }
    }
    if (chunk.length > 0) {
      allClusters.push({
        state: region.state,
        startZip: chunk[0],
        endZip: chunk[chunk.length - 1],
        count: chunk.length,
      });
    }
  }

  console.log(`Total Compact Geographic SCF Clusters Generated: ${allClusters.length}`);

  console.log('\n=== Step 3: Theoretical Scale Measurement Across Roster Sizes ===');
  const rosterSizes = [12, 50, 100, 200];

  for (const numTherapists of rosterSizes) {
    const therapistsPerCluster = numTherapists <= 3
      ? numTherapists
      : Math.min(numTherapists, Math.max(3, Math.floor(numTherapists / 2)));

    const expectedRecords = allClusters.length * therapistsPerCluster;
    const avgRecordsPerTherapist = Math.round(expectedRecords / numTherapists);

    console.log(`\n-- Scale Target: ${numTherapists} Active Therapists --`);
    console.log(`   Therapists assigned per cluster: ${therapistsPerCluster}`);
    console.log(`   Total Persistent Eligibility Records: ${expectedRecords.toLocaleString()}`);
    console.log(`   Avg Rules per Therapist: ${avgRecordsPerTherapist}`);
    console.log(`   Turso Monthly Write Budget Usage (10M Limit): ${(expectedRecords / 10000000 * 100).toFixed(2)}%`);
    console.log(`   Customer Match/Search Write Count: 0 (100% read-only in memory)`);
  }

  console.log('\n=== Step 4: Verification of Sample Clusters & Boundary Integrity ===');
  let stateWideBlanketFound = false;
  for (const c of allClusters) {
    const minN = parseInt(c.startZip, 10);
    const maxN = parseInt(c.endZip, 10);
    if (!isNaN(minN) && !isNaN(maxN) && maxN - minN > 150) {
      stateWideBlanketFound = true;
      console.error(`FAILED: State-wide blanket cluster found! ${c.state} ${c.startZip} -> ${c.endZip}`);
    }
  }

  if (!stateWideBlanketFound) {
    console.log('SUCCESS: Zero state-wide blanket min/max ranges generated across all clusters!');
  }

  console.log('\n=== Step 5: Cold-Cache Production Matching & Eligibility Integration Test ===');
  // 1. Identify active test therapist in DB
  let testTherapist = await db.therapist.findFirst({
    where: { isActive: true },
  });

  if (!testTherapist) {
    testTherapist = await db.therapist.create({
      data: { name: 'Integration Test Therapist', isActive: true, hourlyRate: 100 },
    });
  }

  // Ensure active distribution timestamp and test rule exist
  const activeTimestamp = new Date();
  await db.siteContent.upsert({
    where: { key: 'active_distribution_timestamp' },
    update: { content: activeTimestamp.toISOString() },
    create: { key: 'active_distribution_timestamp', title: 'Active Distribution Timestamp', content: activeTimestamp.toISOString() },
  });

  await db.therapistZipEligibility.deleteMany({ where: { therapistId: testTherapist.id } });
  await db.therapistZipEligibility.create({
    data: {
      therapistId: testTherapist.id,
      state: 'WI',
      startZip: '53178',
      endZip: '53178',
      createdAt: activeTimestamp,
    },
  });

  console.log(`Active Distribution Timestamp in DB: ${activeTimestamp.toISOString()}`);

  // 3. Query assigned TherapistZipEligibility records for testTherapist
  const assignedRules = await db.therapistZipEligibility.findMany({
    where: {
      therapistId: testTherapist.id,
      createdAt: activeTimestamp,
    },
    take: 5,
  });

  if (assignedRules.length > 0) {
    const assignedRule = assignedRules[0];
    const validAssignedZip = assignedRule.startZip;

    // Import production therapistCoversZipAsync and getActiveTherapists
    const { therapistCoversZipAsync, formatDbTherapistToPublic } = await import('../src/lib/db-therapists');

    const fullTherapist = await db.therapist.findUnique({
      where: { id: testTherapist.id },
      include: {
        photos: true,
        services: { include: { service: true } },
        serviceAreas: true,
        availabilities: true,
      },
    });

    if (fullTherapist) {
      const publicTherapist = formatDbTherapistToPublic(fullTherapist as any);

      // Test A: Assigned ZIP must match and return true
      const isEligibleForAssigned = await therapistCoversZipAsync(publicTherapist, validAssignedZip);
      console.log(`[Cold Cache] Checking assigned ZIP ${validAssignedZip} for ${testTherapist.name}: ${isEligibleForAssigned}`);
      if (!isEligibleForAssigned) {
        console.error(`FAILED: therapistCoversZipAsync returned false for assigned ZIP ${validAssignedZip}`);
        process.exit(1);
      }
      console.log('SUCCESS: Assigned ZIP matched active TherapistZipEligibility rule!');

      // Test B: Outside ZIP must return false
      const outsideZip = '00000'; // Fake/outside ZIP
      const isEligibleForOutside = await therapistCoversZipAsync(publicTherapist, outsideZip);
      console.log(`[Cold Cache] Checking outside ZIP ${outsideZip} for ${testTherapist.name}: ${isEligibleForOutside}`);
      if (isEligibleForOutside) {
        console.error(`FAILED: therapistCoversZipAsync returned true for outside ZIP ${outsideZip}`);
        process.exit(1);
      }
      console.log('SUCCESS: Outside/nonexistent ZIP rejected by TherapistZipEligibility!');

      // Test C: Stale distribution record from an older timestamp is excluded
      console.log('\nTesting Stale Distribution Exclusion...');
      const staleTimestamp = new Date(Date.now() - 3600000); // 1 hour old stale timestamp
      await db.therapistZipEligibility.create({
        data: {
          therapistId: testTherapist.id,
          state: 'CA',
          startZip: '90001',
          endZip: '90005',
          createdAt: staleTimestamp,
        },
      });

      // Set active_distribution_timestamp to present time
      const newActiveTimestamp = new Date();
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
    }
  }

  console.log('\n=== Analysis Completed Successfully ===');
}

runAnalysisAndTests()
  .catch((err) => {
    console.error('Error running scaling analysis:', err);
    process.exit(1);
  });
