import {
  getClientIp,
  getIpLocation,
  reverseGeocodeGps,
  isPrivateOrLocalIp,
  FALLBACK_DEFAULT_LOCATION,
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

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runLocationDetectionTests() {
  console.log('=== STARTING AUTOMATIC LOCATION DETECTION & MATCHING TEST SUITE ===\n');

  // 1. IP Header Extraction & Localhost Checks
  console.log('1. Testing Client IP Extraction & Localhost/Private Filters...');
  const headers1 = new Headers({ 'x-forwarded-for': '203.0.113.195, 10.0.0.1' });
  assert(getClientIp(headers1) === '203.0.113.195', 'Extracts first public IP from x-forwarded-for');

  const headers2 = new Headers({ 'x-real-ip': '198.51.100.25' });
  assert(getClientIp(headers2) === '198.51.100.25', 'Extracts IP from x-real-ip');

  assert(isPrivateOrLocalIp('127.0.0.1') === true, '127.0.0.1 recognized as local/private');
  assert(isPrivateOrLocalIp('10.0.1.50') === true, '10.x.x.x recognized as private');
  assert(isPrivateOrLocalIp('192.168.1.1') === true, '192.168.x.x recognized as private');
  assert(isPrivateOrLocalIp('172.20.0.1') === true, '172.16-31.x.x recognized as private');
  assert(isPrivateOrLocalIp('203.0.113.195') === false, 'Public IP 203.0.113.195 recognized as public');

  // 2. IP Location Normalization & Fallbacks
  console.log('\n2. Testing IP Location Normalization & Vercel Edge Headers...');
  const vercelHeaders = new Headers({
    'x-vercel-ip-city': 'Los%20Angeles',
    'x-vercel-ip-country-region': 'CA',
    'x-vercel-ip-postal-code': '90001',
    'x-vercel-ip-country': 'US',
  });
  const edgeLoc = await getIpLocation('203.0.113.195', vercelHeaders);
  assert(edgeLoc.city === 'Los Angeles', 'Edge header city decoded to Los Angeles');
  assert(edgeLoc.state === 'CA', 'Edge header state resolved to CA');
  assert(edgeLoc.postalCode === '90001', 'Edge header postal code resolved to 90001');
  assert(edgeLoc.source === 'ip', 'Source marked as ip');

  const localLoc = await getIpLocation('127.0.0.1');
  assert(localLoc.city === FALLBACK_DEFAULT_LOCATION.city, 'Localhost IP falls back to default city');
  assert(localLoc.state === FALLBACK_DEFAULT_LOCATION.state, 'Localhost IP falls back to default state');

  // 3. Reverse Geocoding GPS Coordinates
  console.log('\n3. Testing GPS Spatial Reverse Geocoding via USZipCode...');
  // Coordinates near Los Angeles CA (34.0522, -118.2437)
  const gpsRes = await reverseGeocodeGps(34.0522, -118.2437);
  assert(gpsRes !== null, 'GPS coordinates (34.0522, -118.2437) resolved successfully');
  assert(gpsRes?.state === 'CA', 'GPS coordinates mapped to CA state');
  assert(gpsRes?.source === 'gps', 'GPS result source marked as gps');
  assert(Boolean(gpsRes?.postalCode), 'GPS result includes 5-digit postal code');

  // 4. Location Priority & Override Rules
  console.log('\n4. Testing Location Priority Hierarchy (manual > gps > ip > none)...');
  assert(shouldOverrideLocation('ip', 'gps') === true, 'GPS overrides IP location');
  assert(shouldOverrideLocation('ip', 'manual') === true, 'Manual overrides IP location');
  assert(shouldOverrideLocation('gps', 'manual') === true, 'Manual overrides GPS location');
  assert(shouldOverrideLocation('manual', 'ip') === false, 'IP DOES NOT override manual customer selection');
  assert(shouldOverrideLocation('manual', 'gps') === false, 'GPS DOES NOT override manual customer selection');

  // 5. Cookie Utilities & Serialization
  console.log('\n5. Testing Location Cookie Utilities...');
  const testLoc = {
    city: 'Beverly Hills',
    state: 'CA',
    stateName: 'California',
    country: 'US',
    postalCode: '90210',
    source: 'manual' as const,
    rawQuery: '90210',
  };
  const cookieStr = createLocationCookieHeader(testLoc);
  assert(cookieStr.includes('massaf_user_location='), 'Set-Cookie header includes cookie name');
  const parsedLoc = getLocationFromCookie(cookieStr);
  assert(parsedLoc?.city === 'Beverly Hills', 'Parsed cookie location city matches Beverly Hills');
  assert(parsedLoc?.postalCode === '90210', 'Parsed cookie location postal code matches 90210');
  assert(parsedLoc?.source === 'manual', 'Parsed cookie location source matches manual');

  // 6. City, State, and ZIP Matching Logic
  console.log('\n6. Testing City, State, and ZIP Matching Resolution...');
  const dbTherapists = await getActiveTherapists();
  const testService = {
    id: 'svc-swedish',
    name: 'Swedish Massage',
    description: 'Relaxation massage',
    durationMinutes: 60,
    price: 100,
  };

  // Ensure therapists have active services attached for testing rankTherapistsForMatch
  const activeTherapists: CustomerTherapist[] = dbTherapists.map((t) => ({
    ...t,
    location: t.location === 'United States' ? 'Los Angeles, CA' : t.location,
    serviceAreas: t.serviceAreas.length > 0 ? t.serviceAreas : ['Los Angeles, CA'],
    services: t.services.length > 0 ? t.services : [testService],
  }));

  assert(activeTherapists.length > 0, `Loaded ${activeTherapists.length} active therapists from DB`);

  // City Search
  const laMatches = await rankTherapistsForMatch({ locationQuery: 'Los Angeles' }, activeTherapists);
  assert(laMatches.length > 0, `City search 'Los Angeles' returned ${laMatches.length} matching therapists`);

  // State Code Search
  const caCodeMatches = await rankTherapistsForMatch({ locationQuery: 'CA' }, activeTherapists);
  assert(caCodeMatches.length > 0, `State code search 'CA' returned ${caCodeMatches.length} matching therapists`);

  // State Name Search
  const caNameMatches = await rankTherapistsForMatch({ locationQuery: 'California' }, activeTherapists);
  assert(caNameMatches.length > 0, `State name search 'California' returned ${caNameMatches.length} matching therapists`);

  // ZIP Code Search
  const zipInfo = await getZipInfo('90210');
  assert(zipInfo !== null && zipInfo.city === 'Beverly Hills', 'ZIP 90210 info resolved correctly');

  console.log('\n✅ ALL AUTOMATIC LOCATION DETECTION & MATCHING TESTS PASSED SUCCESSFULLY!');
}

runLocationDetectionTests().catch((err) => {
  console.error('Fatal error running location detection test suite:', err);
  process.exit(1);
});
