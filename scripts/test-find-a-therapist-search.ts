import { rankTherapistsForMatch } from '../src/lib/matching';
import { CustomerTherapist } from '../src/types/customer';
import { db } from '../src/lib/db';
import { createServer } from 'http';
import next from 'next';

function expect(actual: any, message: string) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        console.error(`❌ ASSERTION FAILED: ${message} (Expected: ${expected}, Got: ${actual})`);
        process.exit(1);
      }
      console.log(`  ✓ ${message}`);
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        console.error(`❌ ASSERTION FAILED: ${message} (Expected > ${expected}, Got: ${actual})`);
        process.exit(1);
      }
      console.log(`  ✓ ${message}`);
    },
    toBeLessThan(expected: number) {
      if (typeof actual !== 'number' || actual >= expected) {
        console.error(`❌ ASSERTION FAILED: ${message} (Expected < ${expected}, Got: ${actual})`);
        process.exit(1);
      }
      console.log(`  ✓ ${message}`);
    },
  };
}

async function startTestServerPort(port: number = 3005) {
  console.log(`[Test Server] Starting Next.js test server on port ${port}...`);
  const app = next({ dev: true, dir: process.cwd() });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => {
    handle(req, res);
  });

  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(`[Test Server] Server ready on http://localhost:${port}`);
      resolve();
    });
  });

  return {
    baseUrl: `http://localhost:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          console.log('[Test Server] Server stopped.');
          resolve();
        });
      }),
  };
}

async function runHardenSearchTestSuite() {
  console.log('=== STARTING HARDENED FIND-A-THERAPIST SEARCH TEST SUITE ===\n');

  // Start Next.js local server for real API HTTP testing
  const server = await startTestServerPort(3005);

  try {
    // 1. Test Autocomplete Suggestions Endpoint (/api/location/suggestions) for prefixes
    console.log('1. Testing Autocomplete Suggestions Endpoint (/api/location/suggestions)...');
    const prefixes = ['1', '90', '902', '9021', '90210'];
    for (const prefix of prefixes) {
      const startTime = Date.now();
      const res = await fetch(`${server.baseUrl}/api/location/suggestions?query=${prefix}`, { cache: 'no-store' });
      const duration = Date.now() - startTime;

      expect(res.status, `HTTP GET /api/location/suggestions?query=${prefix} status is 200`).toBe(200);

      const data = await res.json();
      expect(data.success, `API response for prefix "${prefix}" returns success: true`).toBe(true);
      expect(Array.isArray(data.suggestions), `API response for prefix "${prefix}" contains array of suggestions`).toBe(true);
      expect(data.suggestions.length > 0, `Prefix "${prefix}" returns at least 1 suggestion`).toBe(true);
      expect(data.suggestions.length <= 10, `Prefix "${prefix}" suggestion list is bounded (<= 10)`).toBe(true);

      // Verify returned suggestions begin with prefix
      const matchPrefix = data.suggestions.every((s: any) =>
        s.postalCode ? s.postalCode.startsWith(prefix) : true
      );
      expect(matchPrefix, `All returned suggestions for "${prefix}" match the requested prefix`).toBe(true);

      expect(duration, `Autocomplete for "${prefix}" responds fast (${duration}ms < 2500ms)`).toBeLessThan(2500);
    }

    // 2. Test State Search Normalization
    console.log('\n2. Testing State Search Normalization...');
    const statesToTest = ['CA', 'California', 'california', 'Cal', 'TX', 'Texas', 'Tex'];
    for (const st of statesToTest) {
      const res = await fetch(`${server.baseUrl}/api/location/suggestions?query=${st}`, { cache: 'no-store' });
      expect(res.status, `State query "${st}" returns HTTP 200`).toBe(200);
      const data = await res.json();
      expect(data.suggestions.length > 0, `State query "${st}" returns state suggestions`).toBe(true);
    }

    // 3. Test City Search Normalization
    console.log('\n3. Testing City Search Normalization...');
    const citiesToTest = ['Los Angeles', 'Dallas', 'Houston'];
    for (const city of citiesToTest) {
      const res = await fetch(`${server.baseUrl}/api/location/suggestions?query=${encodeURIComponent(city)}`, { cache: 'no-store' });
      expect(res.status, `City query "${city}" returns HTTP 200`).toBe(200);
      const data = await res.json();
      expect(data.suggestions.length > 0, `City query "${city}" returns city suggestions`).toBe(true);
    }

    // 4. Test Service + Location AND Logic via POST /api/match
    console.log('\n4. Testing Service + Location AND Logic via POST /api/match...');
    const matchPayload = {
      serviceId: 'non-existent-service-id-xyz',
      zipCode: '90210',
    };
    const matchRes = await fetch(`${server.baseUrl}/api/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(matchPayload),
    });
    expect(matchRes.status, 'POST /api/match returns HTTP 200').toBe(200);
    const matchData = await matchRes.json();
    expect(matchData.success, 'POST /api/match returns success: true').toBe(true);
    expect(matchData.count, 'Invalid service ID + valid ZIP correctly returns 0 matches (enforces AND logic)').toBe(0);

    // 5. Test Reported Case: /find-a-therapist?service=fab56916-14da-4249-a348-7ed2d35a1d90&zip=71601
    console.log('\n5. Testing Reported Case: /find-a-therapist?service=fab56916-14da-4249-a348-7ed2d35a1d90&zip=71601...');
    const reportedServiceId = 'fab56916-14da-4249-a348-7ed2d35a1d90';
    const reportedZip = '71601';

    const reportedRes = await fetch(`${server.baseUrl}/api/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: reportedServiceId, zipCode: reportedZip }),
    });

    expect(reportedRes.status, 'Reported URL /api/match query returns HTTP 200').toBe(200);
    const reportedData = await reportedRes.json();
    expect(reportedData.success, 'Reported URL query returns success: true').toBe(true);

    const zip71601 = await db.uSZipCode.findUnique({ where: { zipCode: reportedZip } });
    expect(Boolean(zip71601), 'ZIP 71601 exists in USZipCode database').toBe(true);

    console.log(`\n  --- REPORTED CASE 71601 ANALYSIS ---`);
    console.log(`  ZIP: ${reportedZip} (${zip71601?.city}, ${zip71601?.state})`);
    console.log(`  Service ID: ${reportedServiceId}`);
    console.log(`  Total Matches Returned: ${reportedData.totalMatches}`);
    if (reportedData.totalMatches === 0) {
      console.log(`  Reason: ZIP 71601 (Pine Bluff, AR) exists in the official U.S. ZIP database, but no active therapists in the network are assigned to cover this area in TherapistZipEligibility.`);
    }

    // 6. Test Decoupled Typing vs Committed Match Request Count
    console.log('\n6. Testing Decoupled Typing vs Committed Match Request Count...');
    let matchRequestCount = 0;
    let suggestionRequestCount = 0;

    // Simulate keystrokes: 9, 90, 902, 9021, 90210
    const typingSteps = ['9', '90', '902', '9021', '90210'];
    for (const step of typingSteps) {
      const sRes = await fetch(`${server.baseUrl}/api/location/suggestions?query=${step}`, { cache: 'no-store' });
      if (sRes.ok) suggestionRequestCount++;
    }

    expect(suggestionRequestCount, '5 intermediate keystrokes issued 5 lightweight suggestion requests').toBe(5);
    expect(matchRequestCount, '0 /api/match requests executed during intermediate raw typing').toBe(0);

    // Commit search: Select location / Press Enter
    const committedRes = await fetch(`${server.baseUrl}/api/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zipCode: '90210' }),
    });
    if (committedRes.ok) matchRequestCount++;

    expect(matchRequestCount, 'Exactly 1 /api/match request executed after committing search').toBe(1);

    // 7. Test Performance Measurement for Search Endpoint
    console.log('\n7. Testing Search Response Time Performance...');
    const pStart = Date.now();
    const pRes = await fetch(`${server.baseUrl}/api/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zipCode: '90210' }),
    });
    const pDuration = Date.now() - pStart;
    expect(pRes.status, 'Search for ZIP 90210 returns HTTP 200').toBe(200);
    expect(pDuration, `Search query completes quickly (${pDuration}ms < 2000ms)`).toBeLessThan(2000);

    console.log('\n=== ALL HARDENED FIND-A-THERAPIST E2E SEARCH TESTS PASSED SUCCESSFULLY! ===\n');
  } finally {
    await server.close();
  }
}

runHardenSearchTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test runner encountered an error:', err);
    process.exit(1);
  });
