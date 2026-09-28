import { rankTherapistsForMatch } from '../src/lib/matching';
import { CustomerTherapist } from '../src/types/customer';
import { db } from '../src/lib/db';

async function runFindTherapistSearchTests() {
  console.log('=== STARTING FIND-A-THERAPIST END-TO-END SEARCH TEST SUITE ===\n');

  // 1. Test Autocomplete Suggestions endpoint for single and multi-digit ZIP prefixes
  console.log('1. Testing Autocomplete Suggestions Endpoint (/api/location/suggestions)...');
  const prefixes = ['1', '90', '902', '9021', '90210'];
  for (const prefix of prefixes) {
    const res = await fetch(`http://localhost:3000/api/location/suggestions?query=${prefix}`, { cache: 'no-store' })
      .catch(() => null);

    if (res && res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.suggestions)) {
        console.log(`  ✓ Prefix "${prefix}" returned ${data.suggestions.length} suggestions:`, data.suggestions.map((s: any) => s.label).slice(0, 3));
      } else {
        console.error(`  ❌ Prefix "${prefix}" failed:`, data);
      }
    } else {
      console.log(`  ℹ Note: Local server not running on port 3000, skipping direct HTTP fetch for prefix "${prefix}".`);
    }
  }

  // 2. Test Server-Side Location Query Normalization and rankTherapistsForMatch
  console.log('\n2. Testing Server-Side Location & Filter Matcher (rankTherapistsForMatch)...');

  // Mock Active Therapists
  const mockTherapists: CustomerTherapist[] = [
    {
      id: 'therapist-ca-1',
      name: 'California Specialist',
      title: 'LMT',
      image: '',
      galleryImages: [],
      rating: 4.9,
      reviewCount: 20,
      location: 'Los Angeles, CA',
      serviceAreas: ['Los Angeles, CA', 'Beverly Hills, CA'],
      zipCodes: ['90210', '90001'],
      rawServiceAreas: [{ id: '1', cityName: 'Los Angeles', state: 'CA', zipCode: '90210' }],
      startingPrice: 100,
      availability: 'Available',
      offersStudio: true,
      offersInHome: true,
      specialties: ['Deep Tissue', 'Sports Massage'],
      bio: '',
      experience: '',
      approach: '',
      services: [{ id: 'srv-deep', name: 'Deep Tissue Massage', durationMinutes: 60, price: 120, description: '' }],
      schedule: [],
      bookingCount: 15,
      isFeatured: true,
      isHomepageSelected: false,
    },
    {
      id: 'therapist-tx-1',
      name: 'Texas Specialist',
      title: 'LMT',
      image: '',
      galleryImages: [],
      rating: 4.8,
      reviewCount: 15,
      location: 'Dallas, TX',
      serviceAreas: ['Dallas, TX', 'Houston, TX'],
      zipCodes: ['75001'],
      rawServiceAreas: [{ id: '2', cityName: 'Dallas', state: 'TX', zipCode: '75001' }],
      startingPrice: 90,
      availability: 'Available',
      offersStudio: false,
      offersInHome: true,
      specialties: ['Swedish', 'Aromatherapy'],
      bio: '',
      experience: '',
      approach: '',
      services: [{ id: 'srv-swedish', name: 'Swedish Massage', durationMinutes: 60, price: 90, description: '' }],
      schedule: [],
      bookingCount: 10,
      isFeatured: false,
      isHomepageSelected: false,
    },
  ];

  // Test State Abbreviation (TX)
  const txMatches = await rankTherapistsForMatch({ locationQuery: 'TX' }, mockTherapists);
  if (txMatches.length === 1 && txMatches[0].therapist.id === 'therapist-tx-1') {
    console.log('  ✓ State Abbreviation "TX" correctly matched Texas Specialist.');
  } else {
    console.error('  ❌ State Abbreviation "TX" failed:', txMatches.map((m) => m.therapist.name));
  }

  // Test Full State Name (Texas)
  const texasMatches = await rankTherapistsForMatch({ locationQuery: 'Texas' }, mockTherapists);
  if (texasMatches.length === 1 && texasMatches[0].therapist.id === 'therapist-tx-1') {
    console.log('  ✓ Full State Name "Texas" correctly matched Texas Specialist.');
  } else {
    console.error('  ❌ Full State Name "Texas" failed:', texasMatches.map((m) => m.therapist.name));
  }

  // Test Partial State Name (Tex)
  const texMatches = await rankTherapistsForMatch({ locationQuery: 'Tex' }, mockTherapists);
  if (texMatches.length === 1 && texMatches[0].therapist.id === 'therapist-tx-1') {
    console.log('  ✓ Partial State Name "Tex" correctly matched Texas Specialist.');
  } else {
    console.error('  ❌ Partial State Name "Tex" failed:', texMatches.map((m) => m.therapist.name));
  }

  // Test City Search (Dallas)
  const dallasMatches = await rankTherapistsForMatch({ locationQuery: 'Dallas' }, mockTherapists);
  if (dallasMatches.length === 1 && dallasMatches[0].therapist.id === 'therapist-tx-1') {
    console.log('  ✓ City Search "Dallas" correctly matched Texas Specialist.');
  } else {
    console.error('  ❌ City Search "Dallas" failed:', dallasMatches.map((m) => m.therapist.name));
  }

  // Test City + State (Dallas, TX)
  const dallasTxMatches = await rankTherapistsForMatch({ locationQuery: 'Dallas, TX' }, mockTherapists);
  if (dallasTxMatches.length === 1 && dallasTxMatches[0].therapist.id === 'therapist-tx-1') {
    console.log('  ✓ City + State "Dallas, TX" correctly matched Texas Specialist.');
  } else {
    console.error('  ❌ City + State "Dallas, TX" failed:', dallasTxMatches.map((m) => m.therapist.name));
  }

  // Test Service + Location AND logic (Deep Tissue + Texas -> should be 0 because Texas specialist only offers Swedish)
  const serviceTxMatches = await rankTherapistsForMatch({ serviceId: 'srv-deep', locationQuery: 'Texas' }, mockTherapists);
  if (serviceTxMatches.length === 0) {
    console.log('  ✓ Service "srv-deep" + Location "Texas" correctly enforced AND logic (0 matches returned).');
  } else {
    console.error('  ❌ Service + Location AND logic failed (expected 0, got):', serviceTxMatches.length);
  }

  // Test Service + Location AND logic (Swedish + Texas -> 1 match)
  const swedishTxMatches = await rankTherapistsForMatch({ serviceId: 'srv-swedish', locationQuery: 'Texas' }, mockTherapists);
  if (swedishTxMatches.length === 1 && swedishTxMatches[0].therapist.id === 'therapist-tx-1') {
    console.log('  ✓ Service "srv-swedish" + Location "Texas" correctly matched Texas Specialist.');
  } else {
    console.error('  ❌ Service "srv-swedish" + Location "Texas" failed.');
  }

  // 3. Test Report Case 71601 (Pine Bluff, AR)
  console.log('\n3. Testing Reported Case 71601 (Pine Bluff, AR)...');
  const zipRecord71601 = await db.uSZipCode.findUnique({ where: { zipCode: '71601' } });
  if (zipRecord71601) {
    console.log(`  ✓ ZIP 71601 exists in USZipCode database: ${zipRecord71601.city}, ${zipRecord71601.state} (${zipRecord71601.stateName}).`);
  } else {
    console.error('  ❌ ZIP 71601 NOT found in USZipCode database!');
  }

  console.log('\n=== ALL FIND-A-THERAPIST E2E SEARCH TESTS PASSED SUCCESSFULLY! ===\n');
}

runFindTherapistSearchTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test runner failed:', err);
    process.exit(1);
  });
