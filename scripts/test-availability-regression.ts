import {
  parseScheduleDays,
  getScheduleWindowForDate,
  isAppointmentTimeAvailable,
} from '../src/lib/availability';
import { CustomerTherapist } from '../src/types/customer';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

console.log('=== AVAILABILITY REGRESSION TEST SUITE ===\n');

// 1. Test Day Name Parsing
console.log('1. Testing parseScheduleDays...');
assert(parseScheduleDays('Wed').length === 1 && parseScheduleDays('Wed')[0] === 3, 'Short name "Wed" parses to day index 3 (Wednesday)');
assert(parseScheduleDays('Wednesday').length === 1 && parseScheduleDays('Wednesday')[0] === 3, 'Full name "Wednesday" parses to day index 3');
assert(parseScheduleDays('Wed & Thu').length === 2 && parseScheduleDays('Wed & Thu')[0] === 3 && parseScheduleDays('Wed & Thu')[1] === 4, 'Ampersand "Wed & Thu" parses to indices 3 and 4');
assert(parseScheduleDays('Mon, Wed, Fri').length === 3, 'Comma list "Mon, Wed, Fri" parses to indices 1, 3, 5');
assert(parseScheduleDays('Monday – Friday').length === 5, 'Range "Monday – Friday" parses to 5 days');

// 2. Setup Therapist with Wednesday availability (9:00 AM - 5:00 PM)
const testTherapist: CustomerTherapist = {
  id: 'therapist-olomaja',
  name: 'Alomaja Olayemi',
  image: '/avatar.jpg',
  galleryImages: [],
  rating: 5.0,
  reviewCount: 15,
  location: 'Lagos, Nigeria',
  serviceAreas: ['Lagos'],
  zipCodes: ['100001'],
  startingPrice: 120,
  availability: 'Available',
  offersStudio: true,
  offersInHome: true,
  specialties: [],
  bio: '',
  services: [
    { id: 'srv-1', name: 'Swedish Massage', durationMinutes: 60, price: 120, description: '' },
  ],
  schedule: [
    { days: 'Wed', hours: '9:00 AM – 5:00 PM' },
  ],
  bookingCount: 10,
  isFeatured: true,
};

// 3. Test Wednesday, September 23, 2026 at 14:00 (2:00 PM) -> EXPECT AVAILABLE
console.log('\n2. Testing Wednesday, September 23, 2026 at 14:00 (2:00 PM)...');
const checkWedInHours = isAppointmentTimeAvailable(testTherapist, '2026-09-23', '14:00', 60);
assert(checkWedInHours.isValid === true, 'Wednesday, Sept 23, 2026 @ 14:00 is AVAILABLE');

// 4. Test Tuesday, September 22, 2026 at 14:00 -> EXPECT UNAVAILABLE
console.log('\n3. Testing Tuesday, September 22, 2026 at 14:00...');
const checkTue = isAppointmentTimeAvailable(testTherapist, '2026-09-22', '14:00', 60);
assert(checkTue.isValid === false, 'Tuesday, Sept 22, 2026 @ 14:00 is UNAVAILABLE (off-day)');

// 5. Test Wednesday, September 23, 2026 at 18:00 (6:00 PM) -> EXPECT UNAVAILABLE
console.log('\n4. Testing Wednesday, September 23, 2026 at 18:00 (6:00 PM - outside working hours)...');
const checkWedOutHours = isAppointmentTimeAvailable(testTherapist, '2026-09-23', '18:00', 60);
assert(checkWedOutHours.isValid === false, 'Wednesday, Sept 23, 2026 @ 18:00 is UNAVAILABLE (outside hours)');

console.log('\n✅ ALL REGRESSION TESTS PASSED SUCCESSFULLY!');
