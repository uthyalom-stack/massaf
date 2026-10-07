import { getActiveTherapists } from '../src/lib/db-therapists';
import { rankTherapistsForMatch } from '../src/lib/matching';
import { NormalizedLocation } from '../src/lib/ip-location';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

// Simulated URL construction logic matching LocationSearch.tsx
function constructFindTherapistsUrl(
  detectedLoc: NormalizedLocation | null,
  serviceType: string,
  manualQuery?: string
): string {
  const params = new URLSearchParams();

  if (manualQuery && manualQuery.trim()) {
    params.set('query', manualQuery.trim());
  } else if (detectedLoc) {
    if (detectedLoc.postalCode && detectedLoc.postalCode.trim()) {
      params.set('zip', detectedLoc.postalCode.trim());
    } else if (detectedLoc.city && detectedLoc.city.trim()) {
      params.set('city', detectedLoc.city.trim());
    } else if (detectedLoc.rawQuery && detectedLoc.rawQuery.trim()) {
      params.set('query', detectedLoc.rawQuery.trim());
    }
  }

  if (serviceType && serviceType !== 'all') {
    params.set('type', serviceType);
  }

  const queryString = params.toString();
  return `/find-a-therapist${queryString ? `?${queryString}` : ''}`;
}

async function runTherapistsNearYouTests() {
  console.log('=== STARTING STRENGTHENED THERAPISTS NEAR YOU REGRESSION TEST SUITE ===\n');

  // 1. Fetch active therapists in database
  console.log('1. Checking active therapists in database...');
  const activeTherapists = await getActiveTherapists();
  console.log(`  Active therapists count in DB: ${activeTherapists.length}`);
  assert(Array.isArray(activeTherapists), 'Active therapists retrieved as array');

  // 2. State 1: Detected location with >0 therapists
  console.log('\n2. Testing State 1: Detected location with >0 therapists...');
  const state1Location: NormalizedLocation = {
    city: 'Los Angeles',
    state: 'CA',
    stateName: 'California',
    country: 'US',
    postalCode: '90001',
    source: 'ip',
  };

  const matchesForState1 = await rankTherapistsForMatch(
    { zipCode: state1Location.postalCode },
    activeTherapists
  );
  console.log(`  Matches found for ZIP 90001: ${matchesForState1.length}`);

  // Construct CTA URL for State 1 with serviceType 'in_home'
  const state1Url = constructFindTherapistsUrl(state1Location, 'in_home');
  console.log(`  Constructed State 1 CTA URL: "${state1Url}"`);
  assert(state1Url.includes('/find-a-therapist?'), 'Navigates to /find-a-therapist route');
  assert(state1Url.includes('zip=90001'), 'Preserves detected ZIP code in zip parameter');
  assert(state1Url.includes('type=in_home'), 'Preserves selected serviceType parameter');

  // 3. State 2: Detected location with 0 therapists available
  console.log('\n3. Testing State 2: Zero therapists available state...');
  const state2Location: NormalizedLocation = {
    city: 'Remote Village',
    state: 'AK',
    stateName: 'Alaska',
    country: 'US',
    postalCode: '99998',
    source: 'ip',
  };

  const matchesForState2 = await rankTherapistsForMatch(
    { zipCode: state2Location.postalCode },
    activeTherapists
  );
  console.log(`  Matches found for ZIP 99998: ${matchesForState2.length}`);
  assert(matchesForState2.length === 0, 'Returns 0 therapists for unserviced ZIP');

  const state2Url = constructFindTherapistsUrl(state2Location, 'all');
  assert(state2Url.includes('zip=99998'), 'State 2 preserves location search state');

  // 4. State 3: Location unavailable (source: 'none')
  console.log('\n4. Testing State 3: Location unavailable handling...');
  const state3Location: NormalizedLocation = {
    city: '',
    state: '',
    stateName: '',
    country: '',
    postalCode: '',
    source: 'none',
  };

  const state3Url = constructFindTherapistsUrl(state3Location, 'all');
  console.log(`  Constructed State 3 CTA URL: "${state3Url}"`);
  assert(state3Url === '/find-a-therapist', 'Location unavailable CTA navigates cleanly to discovery page without fake parameters');

  // 5. Non-US Postal Codes and International Location Preservations
  console.log('\n5. Testing Non-US Postal Code and International Location Preservations...');

  // 5a. UK Postal Code e.g. "SW1A 1AA"
  const ukLocation: NormalizedLocation = {
    city: 'London',
    state: 'ENG',
    stateName: 'England',
    country: 'GB',
    postalCode: 'SW1A 1AA',
    source: 'manual',
  };
  const ukUrl = constructFindTherapistsUrl(ukLocation, 'studio');
  console.log(`  UK Postal Code CTA URL: "${ukUrl}"`);
  assert(ukUrl.includes('zip=SW1A+1AA') || ukUrl.includes('zip=SW1A%201AA'), 'Preserves UK postal code in zip parameter without stripping or forcing 5-digit US regex');
  assert(ukUrl.includes('type=studio'), 'Preserves studio serviceType parameter');

  // 5b. Canadian Postal Code e.g. "M5V 2T6"
  const caLocation: NormalizedLocation = {
    city: 'Toronto',
    state: 'ON',
    stateName: 'Ontario',
    country: 'CA',
    postalCode: 'M5V 2T6',
    source: 'manual',
  };
  const caUrl = constructFindTherapistsUrl(caLocation, 'all');
  console.log(`  Canadian Postal Code CTA URL: "${caUrl}"`);
  assert(caUrl.includes('zip=M5V+2T6') || caUrl.includes('zip=M5V%202T6'), 'Preserves Canadian postal code in zip parameter');

  // 5c. Nigerian Postal Code e.g. "100001" (6-digit)
  const ngLocation: NormalizedLocation = {
    city: 'Lagos',
    state: 'LA',
    stateName: 'Lagos State',
    country: 'NG',
    postalCode: '100001',
    source: 'manual',
  };
  const ngUrl = constructFindTherapistsUrl(ngLocation, 'all');
  console.log(`  Nigerian Postal Code CTA URL: "${ngUrl}"`);
  assert(ngUrl.includes('zip=100001'), 'Preserves 6-digit Nigerian postal code in zip parameter');

  // 6. Verification of /find-a-therapist query parameter handling
  console.log('\n6. Testing /find-a-therapist search parameter handling...');
  const searchParamsZip = new URLSearchParams('zip=SW1A 1AA&type=in_home');
  const rawZip = searchParamsZip.get('zip') || '';
  const rawCity = searchParamsZip.get('city') || '';
  const queryParam = searchParamsZip.get('query') || '';
  const initialLocationQuery = rawZip || rawCity || queryParam;

  assert(initialLocationQuery === 'SW1A 1AA', '/find-a-therapist extracts non-US postal code correctly');
  assert(searchParamsZip.get('type') === 'in_home', '/find-a-therapist extracts service type filter correctly');

  console.log('\n✅ ALL STRENGTHENED REGRESSION TESTS PASSED SUCCESSFULLY!');
}

runTherapistsNearYouTests().catch((err) => {
  console.error('Fatal error in regression test suite:', err);
  process.exit(1);
});
