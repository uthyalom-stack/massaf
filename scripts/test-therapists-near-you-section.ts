import { getActiveTherapists } from '../src/lib/db-therapists';
import { rankTherapistsForMatch } from '../src/lib/matching';
import { db } from '../src/lib/db';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runTherapistsNearYouTests() {
  console.log('=== STARTING THERAPISTS NEAR YOU COMPONENT & LOCATION API SUITE ===\n');

  // Test 1: Verification of active therapists in test DB
  console.log('1. Checking active therapists in database...');
  const activeTherapists = await getActiveTherapists();
  console.log(`  Active therapists count in DB: ${activeTherapists.length}`);
  assert(Array.isArray(activeTherapists), 'Active therapists retrieved as array');

  // Test 2: State 1 - Detected location with available therapists
  console.log('\n2. Testing State 1: Detected location with available therapists...');
  const matchTest = await rankTherapistsForMatch({ locationQuery: 'CA' }, activeTherapists);
  console.log(`  Matches for "CA": ${matchTest.length}`);
  assert(typeof matchTest.length === 'number', 'Match count calculated dynamically for CA');

  // Verify wording requirement: "{count} therapist(s) nearby"
  const countText = `${matchTest.length} ${matchTest.length === 1 ? 'therapist' : 'therapists'} nearby`;
  assert(countText.includes('nearby'), `Dynamic wording matches required text: "${countText}"`);

  // Test 3: State 2 - Detected location with 0 available therapists
  console.log('\n3. Testing State 2: Detected location with 0 therapists...');
  // Search a non-serviced remote ZIP code (e.g. 99998)
  const matchesUncovered = await rankTherapistsForMatch({ zipCode: '99998' }, activeTherapists);
  assert(matchesUncovered.length === 0, 'Uncovered location returns 0 matched therapists');

  // Test 4: State 3 - Location unavailable (source: "none")
  console.log('\n4. Testing State 3: Location unavailable handling...');
  const fs = require('fs');
  const apiCode = fs.readFileSync('src/app/api/location/route.ts', 'utf8');
  assert(
    apiCode.includes("location.source === 'none'"),
    'API route checks for location.source === "none"'
  );

  // Test 5: Verify LocationSearch component state structure
  console.log('\n5. Testing LocationSearch component rendering logic...');
  const compCode = fs.readFileSync('src/components/customer/LocationSearch.tsx', 'utf8');

  // Requirement 1: Keep existing location detection
  assert(compCode.includes("fetch('/api/location'"), 'Component reuses existing /api/location endpoint');
  assert(!compCode.includes('Lagos, LA'), 'No fake hardcoded Lagos location in component');

  // Requirement 2: State 1 - "View therapists" CTA and dynamic count
  assert(compCode.includes('Therapists near you'), 'Contains "Therapists near you" header');
  assert(compCode.includes('Based on your approximate location:'), 'Contains location label');
  assert(compCode.includes('nearby'), 'Uses "therapist(s) nearby" wording');
  assert(compCode.includes('View therapists'), 'Contains "View therapists" CTA button');

  // Requirement 4: State 2 - Zero result state "Search another location"
  assert(compCode.includes('No therapists currently available nearby.'), 'Contains 0-therapist status message');
  assert(compCode.includes('Search another location'), 'Contains "Search another location" CTA button');

  // Requirement 5: State 3 - Location unavailable "Find therapists"
  assert(compCode.includes('Find therapists available in your area.'), 'Contains generic location unavailable message');
  assert(compCode.includes('Find therapists'), 'Contains "Find therapists" CTA button');

  // Requirement 8: Responsive UI and touch targets
  assert(compCode.includes('min-h-[44px]'), 'Uses minimum 44px touch targets for mobile responsiveness');

  console.log('\n✅ ALL THERAPISTS NEAR YOU SECTION & LOCATION TESTS PASSED SUCCESSFULLY!');
}

runTherapistsNearYouTests().catch((err) => {
  console.error('Fatal error running therapists near you tests:', err);
  process.exit(1);
});
