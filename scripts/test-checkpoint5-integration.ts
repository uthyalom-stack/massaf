import { isZipInRange, therapistCoversZip } from '../src/lib/db-therapists';
import { CustomerTherapist } from '../src/types/customer';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

console.log('=== CHECKPOINT 5 INTEGRATION TEST ===\n');

// 1. Test ZIP Range logic and boundary conditions
console.log('1. Testing isZipInRange boundaries...');
assert(isZipInRange('90001', '90001', '90020') === true, 'Boundary start 90001 matches 90001 -> 90020');
assert(isZipInRange('90020', '90001', '90020') === true, 'Boundary end 90020 matches 90001 -> 90020');
assert(isZipInRange('90010', '90001', '90020') === true, 'Mid range 90010 matches 90001 -> 90020');
assert(isZipInRange('90000', '90001', '90020') === false, 'Outside lower 90000 does NOT match 90001 -> 90020');
assert(isZipInRange('90021', '90001', '90020') === false, 'Outside upper 90021 does NOT match 90001 -> 90020');
assert(isZipInRange('00505', '00501', '00510') === true, 'Leading zero ZIP 00505 matches 00501 -> 00510');
assert(isZipInRange('00512', '00501', '00510') === false, 'Leading zero ZIP 00512 does NOT match 00501 -> 00510');

// 2. Setup Test Therapists
const therapistA: CustomerTherapist = {
  id: 'therapist-a',
  name: 'Therapist A (Deep Tissue, 90001-90020)',
  image: '/avatar.jpg',
  galleryImages: [],
  rating: 4.9,
  reviewCount: 10,
  location: 'Los Angeles, CA',
  serviceAreas: ['Los Angeles, CA'],
  zipCodes: ['90001'],
  rawServiceAreas: [
    { id: 'sa-1', cityName: 'Los Angeles', state: 'CA', zipCode: '90001', endZipCode: '90020' },
  ],
  startingPrice: 120,
  availability: 'Available',
  offersStudio: true,
  offersInHome: true,
  specialties: [],
  bio: '',
  services: [
    { id: 'srv-dt', name: 'Deep Tissue Massage', durationMinutes: 60, price: 130, description: '' },
  ],
  schedule: [],
  bookingCount: 5,
  isFeatured: false,
};

const therapistB: CustomerTherapist = {
  id: 'therapist-b',
  name: 'Therapist B (Swedish, 90001-90020)',
  image: '/avatar.jpg',
  galleryImages: [],
  rating: 4.8,
  reviewCount: 12,
  location: 'Los Angeles, CA',
  serviceAreas: ['Los Angeles, CA'],
  zipCodes: ['90001'],
  rawServiceAreas: [
    { id: 'sa-2', cityName: 'Los Angeles', state: 'CA', zipCode: '90001', endZipCode: '90020' },
  ],
  startingPrice: 110,
  availability: 'Available',
  offersStudio: true,
  offersInHome: true,
  specialties: [],
  bio: '',
  services: [
    { id: 'srv-sw', name: 'Swedish Massage', durationMinutes: 60, price: 110, description: '' },
  ],
  schedule: [],
  bookingCount: 3,
  isFeatured: false,
};

const therapistC: CustomerTherapist = {
  id: 'therapist-c',
  name: 'Therapist C (Deep Tissue, 90210-90230)',
  image: '/avatar.jpg',
  galleryImages: [],
  rating: 5.0,
  reviewCount: 20,
  location: 'Beverly Hills, CA',
  serviceAreas: ['Beverly Hills, CA'],
  zipCodes: ['90210'],
  rawServiceAreas: [
    { id: 'sa-3', cityName: 'Beverly Hills', state: 'CA', zipCode: '90210', endZipCode: '90230' },
  ],
  startingPrice: 150,
  availability: 'Available',
  offersStudio: true,
  offersInHome: true,
  specialties: [],
  bio: '',
  services: [
    { id: 'srv-dt', name: 'Deep Tissue Massage', durationMinutes: 60, price: 150, description: '' },
  ],
  schedule: [],
  bookingCount: 8,
  isFeatured: false,
};

const allTherapists = [therapistA, therapistB, therapistC];

// Matching helper simulating TherapistDiscoveryClient filtering rules
function filterTherapists(params: {
  serviceId?: string;
  zip?: string;
  serviceType?: 'in_home' | 'studio' | 'all';
}) {
  const { serviceId = 'all', zip = '', serviceType = 'all' } = params;

  return allTherapists.filter((t) => {
    // 1. Service
    if (serviceId !== 'all') {
      if (!t.services.some((s) => s.id === serviceId)) return false;
    }

    // 2. Service Location Type & ZIP
    if (serviceType === 'in_home') {
      if (!t.offersInHome) return false;
      if (zip.trim() && !therapistCoversZip(t, zip.trim())) return false;
    } else if (serviceType === 'studio') {
      if (!t.offersStudio) return false;
    } else {
      if (zip.trim()) {
        const inHomeMatch = t.offersInHome && therapistCoversZip(t, zip.trim());
        const studioMatch = t.offersStudio && t.zipCodes.some((z) => z.trim() === zip.trim());
        if (!inHomeMatch && !studioMatch) return false;
      }
    }

    return true;
  });
}

console.log('\n2. Testing Search 1: Deep Tissue, ZIP 90010, In-Home...');
const results1 = filterTherapists({ serviceId: 'srv-dt', zip: '90010', serviceType: 'in_home' });
assert(results1.length === 1 && results1[0].id === 'therapist-a', 'Only Therapist A matches Deep Tissue + ZIP 90010 + In-Home');

console.log('\n3. Testing Search 2: Swedish, ZIP 90010, In-Home...');
const results2 = filterTherapists({ serviceId: 'srv-sw', zip: '90010', serviceType: 'in_home' });
assert(results2.length === 1 && results2[0].id === 'therapist-b', 'Only Therapist B matches Swedish + ZIP 90010 + In-Home');

console.log('\n4. Testing Search 3: Deep Tissue, ZIP 90212, In-Home...');
const results3 = filterTherapists({ serviceId: 'srv-dt', zip: '90212', serviceType: 'in_home' });
assert(results3.length === 1 && results3[0].id === 'therapist-c', 'Only Therapist C matches Deep Tissue + ZIP 90212 + In-Home');

console.log('\n5. Testing Search 4: Studio Visits (no in-home ZIP range requirement)...');
const studioResults = filterTherapists({ serviceId: 'srv-dt', serviceType: 'studio' });
assert(studioResults.length === 2 && studioResults.some((t) => t.id === 'therapist-a') && studioResults.some((t) => t.id === 'therapist-c'), 'Therapist A & C match Studio for Deep Tissue without in-home ZIP requirement');

console.log('\n✅ ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
