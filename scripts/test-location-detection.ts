import {
  getClientIp,
  getIpLocation,
  reverseGeocodeGps,
  isPrivateOrLocalIp,
  calculateHaversineDistance,
  EMPTY_LOCATION,
  NormalizedLocation,
} from '../src/lib/ip-location';
import {
  getLocationFromCookie,
  createLocationCookieHeader,
  shouldOverrideLocation,
} from '../src/lib/location-cookie';
import { rankTherapistsForMatch } from '../src/lib/matching';
import { getActiveTherapists } from '../src/lib/db-therapists';
import { getZipInfo } from '../src/lib/us-locations';
import { CustomerTherapist } from '../src/types/customer';
import { db } from '../src/lib/db';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runLocationDetectionTests() {
  console.log('=== STARTING LOCATION DETECTION & FALLBACK REGRESSION TEST SUITE ===\n');

  // Test 1: Haversine Accuracy
  console.log('Test 1: Haversine distance accuracy...');
  // Distance between Beverly Hills (90210: ~34.0901, -118.4065) and Downtown LA (90012: ~34.0537, -118.2427)
  const distKm = calculateHaversineDistance(34.0901, -118.4065, 34.0537, -118.2427);
  assert(distKm > 10 && distKm < 20, `Haversine calculated distance between 90210 and Downtown LA is ~15.6 km (got ${distKm.toFixed(1)} km)`);

  // Test A — GPS nearest ZIP
  console.log('\nTest A: GPS nearest ZIP resolution via Haversine...');
  const beverlyZip = await db.uSZipCode.findUnique({ where: { zipCode: '90210' } });
  if (beverlyZip && beverlyZip.latitude && beverlyZip.longitude) {
    const gpsRes = await reverseGeocodeGps(beverlyZip.latitude + 0.001, beverlyZip.longitude + 0.001);
    assert(gpsRes !== null, 'GPS coordinates near 90210 resolved');
    assert(gpsRes?.postalCode === '90210', `Resolved to nearest ZIP 90210 (got ${gpsRes?.postalCode})`);
  } else {
    console.log('  ⚠️ USZipCode table empty or missing 90210, skipping exact 90210 check');
  }

  // Test 2: Progressive Search Expansion & No Candidates
  console.log('\nTest 2: Progressive search & No Candidates handling...');
  // Middle of Atlantic Ocean (0.0, -30.0) where no US ZIP codes exist
  const oceanRes = await reverseGeocodeGps(0.0, -30.0);
  assert(oceanRes === null, 'GPS in middle of ocean returns null (location unavailable) without error');

  // Test 3: Large Dataset Protection
  console.log('\nTest 3: Verification that full-US fallback is removed...');
  const fs = require('fs');
  const code = fs.readFileSync('src/lib/ip-location.ts', 'utf8');
  assert(!code.includes('take: 500'), 'Code does not contain take: 500 fallback');
  assert(!code.includes('take: 100'), 'Code does not contain arbitrary take: 100 limit');

  // Test B — GPS invalid latitude
  console.log('\nTest B: GPS invalid latitude validation...');
  const invalidLatRes = await reverseGeocodeGps(120, -118.24);
  assert(invalidLatRes === null, 'Latitude 120 rejected (returns null)');

  // Test C — GPS invalid longitude
  console.log('\nTest C: GPS invalid longitude validation...');
  const invalidLonRes = await reverseGeocodeGps(34.05, 250);
  assert(invalidLonRes === null, 'Longitude 250 rejected (returns null)');

  // Test D — IP lookup failure / private IP fallback
  console.log('\nTest D: IP lookup failure & private IP fallback...');
  const localRes = await getIpLocation('127.0.0.1');
  assert(localRes.source === 'none', '127.0.0.1 IP lookup returns source: none');
  assert(localRes.city === '', '127.0.0.1 IP lookup city is empty');
  assert(localRes.postalCode === '', '127.0.0.1 IP lookup postalCode is empty');

  // Test E — localhost / private IP
  console.log('\nTest E: Localhost IP handling...');
  const privateRes = await getIpLocation('192.168.1.100');
  assert(privateRes.source === 'none', 'Private IP returns source: none');
  assert(privateRes.city !== 'Los Angeles', 'Does NOT return fake Los Angeles fallback');

  // Test F — IP lookup HTTPS URL
  console.log('\nTest F: Verification that external IP geolocation uses HTTPS...');
  assert(code.includes('https://ip-api.com/'), 'External IP lookup uses HTTPS URL');
  assert(!code.includes('http://ip-api.com/'), 'No plaintext HTTP ip-api URL in code');

  // Test G — Priority Hierarchy (manual > gps > ip > none)
  console.log('\nTest G: Location priority hierarchy...');
  assert(shouldOverrideLocation('none', 'ip') === true, 'ip overrides none');
  assert(shouldOverrideLocation('ip', 'gps') === true, 'gps overrides ip');
  assert(shouldOverrideLocation('gps', 'manual') === true, 'manual overrides gps');
  assert(shouldOverrideLocation('ip', 'manual') === true, 'manual overrides ip');
  assert(shouldOverrideLocation('manual', 'ip') === false, 'ip CANNOT override manual');
  assert(shouldOverrideLocation('manual', 'gps') === false, 'gps CANNOT override manual');

  // Test H — Manual override scenario
  console.log('\nTest H: Manual override scenario...');
  let currentLoc = await getIpLocation('203.0.113.195', new Headers({
    'x-vercel-ip-city': 'San%20Francisco',
    'x-vercel-ip-country-region': 'CA',
    'x-vercel-ip-postal-code': '94102',
  }));
  assert(currentLoc.source === 'ip' && currentLoc.city === 'San Francisco', 'Initial IP location set to SF');

  const manualLoc = {
    city: 'New York',
    state: 'NY',
    stateName: 'New York',
    country: 'US',
    postalCode: '10001',
    source: 'manual' as const,
  };

  if (shouldOverrideLocation(currentLoc.source, manualLoc.source)) {
    currentLoc = manualLoc;
  }
  assert(currentLoc.source === 'manual' && currentLoc.postalCode === '10001', 'Manual ZIP 10001 overrides IP location');

  // Test I — GPS override scenario
  console.log('\nTest I: GPS override scenario...');
  let ipLoc = await getIpLocation('203.0.113.195', new Headers({
    'x-vercel-ip-city': 'Chicago',
    'x-vercel-ip-country-region': 'IL',
  }));
  assert(ipLoc.source === 'ip', 'Initial location is IP-derived');

  const gpsLoc = {
    city: 'Los Angeles',
    state: 'CA',
    stateName: 'California',
    country: 'US',
    postalCode: '90001',
    source: 'gps' as const,
  };

  if (shouldOverrideLocation(ipLoc.source, gpsLoc.source)) {
    ipLoc = gpsLoc;
  }
  assert(ipLoc.source === 'gps' && ipLoc.postalCode === '90001', 'GPS location overrides IP location');

  // Test J — Manual cannot be overwritten by GPS or IP
  console.log('\nTest J: Manual location cannot be overwritten by GPS or IP...');
  let userSelectedLoc: NormalizedLocation = {
    city: 'Miami',
    state: 'FL',
    stateName: 'Florida',
    country: 'US',
    postalCode: '33101',
    source: 'manual',
  };

  // Attempt GPS override
  if (shouldOverrideLocation(userSelectedLoc.source, 'gps')) {
    userSelectedLoc = gpsLoc;
  }
  assert(userSelectedLoc.postalCode === '33101' && userSelectedLoc.source === 'manual', 'Manual ZIP 33101 preserved against GPS override');

  // Attempt IP override
  if (shouldOverrideLocation(userSelectedLoc.source, 'ip')) {
    userSelectedLoc = ipLoc;
  }
  assert(userSelectedLoc.postalCode === '33101' && userSelectedLoc.source === 'manual', 'Manual ZIP 33101 preserved against IP override');

  console.log('\n✅ ALL HAVERSINE & LOCATION REGRESSION TESTS PASSED SUCCESSFULLY!');
}

runLocationDetectionTests().catch((err) => {
  console.error('Fatal error running location test suite:', err);
  process.exit(1);
});
