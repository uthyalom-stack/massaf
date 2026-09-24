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

  console.log('\n=== Sample Generated Clusters (First 5) ===');
  for (let i = 0; i < 5; i++) {
    const c = allClusters[i];
    console.log(`   [Cluster ${i + 1}] State: ${c.state} | Range: ${c.startZip} -> ${c.endZip} (${c.count} real ZIPs)`);
  }

  console.log('\n=== Analysis Completed Successfully ===');
}

runAnalysisAndTests()
  .catch((err) => {
    console.error('Error running scaling analysis:', err);
    process.exit(1);
  });
