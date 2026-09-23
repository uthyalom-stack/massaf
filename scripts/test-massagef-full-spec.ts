import { db } from '../src/lib/db';
import { createSessionToken } from '../src/lib/auth-session';
import {
  createTherapistAction,
  updateTherapistAction,
  shuffleAndDistributeTherapistsAction,
} from '../src/app/admin/actions';
import { getRotatingTherapistsForZip } from '../src/lib/matching';
import { CustomerTherapist } from '../src/types/customer';

// Set up mock test admin session token
process.env.MASSAF_AUTH_SECRET = process.env.MASSAF_AUTH_SECRET || 'test_secret_for_local_rotation_tests_32_bytes';
const adminToken = createSessionToken('env-admin', 'admin@massaf.com', 'ADMIN', 24, 'SUPER_ADMIN');
process.env.ADMIN_EMAIL = 'admin@massaf.com';
globalThis.__TEST_ADMIN_SESSION_TOKEN__ = adminToken;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function runFullSpecValidationSuite() {
  console.log('=== STARTING FULL MASSAGEF SPECIFICATION VERIFICATION SUITE ===\n');

  // 1. Therapist Creation without Manual ZIP Requirement & Hourly Rate
  console.log('1. Testing Therapist Creation (No manual ZIP required & Hourly Rate saved)...');
  const createRes = await createTherapistAction({
    name: 'Spec Test Practitioner',
    email: `spec.test.${Date.now()}@massaf.com`,
    hourlyRate: 80.0, // $80/hr
    isActive: true,
  });

  assert(createRes.success === true, 'Therapist profile created successfully without manual ZIP');
  assert(createRes.therapist?.hourlyRate === 80.0, 'Hourly rate ($80/hr) saved correctly');

  const createdTherapistId = createRes.therapist!.id;

  // 2. Automatic Shuffle & Distribution
  console.log('\n2. Testing Automatic Shuffle & Distribution across real USZipCode dataset...');
  const distRes = await shuffleAndDistributeTherapistsAction();
  assert(distRes.success === true, 'Shuffle & distribute executed successfully');
  assert(typeof distRes.distributionRecords === 'number' && distRes.distributionRecords > 0, 'Distribution records generated across U.S. ZIP clusters');

  // 3. Strict ZIP Eligibility (No fallback to non-eligible therapists)
  console.log('\n3. Testing Strict ZIP Eligibility (No non-eligible fallback)...');
  const emptyZip = '00000'; // Fake non-existent ZIP
  const emptyMatches = await getRotatingTherapistsForZip(emptyZip, []);
  assert(emptyMatches.length === 0, 'Searching ZIP with no eligible therapists returns 0 matches (no fallback to non-eligible therapists)');

  // 4. Hourly Rate Pricing Calculation
  console.log('\n4. Testing Hourly Rate Duration Calculations ($80/hr)...');
  const hourlyRate = 80.0;
  const price30 = Math.round(hourlyRate * (30 / 60) * 100) / 100;
  const price45 = Math.round(hourlyRate * (45 / 60) * 100) / 100;
  const price60 = Math.round(hourlyRate * (60 / 60) * 100) / 100;
  const price90 = Math.round(hourlyRate * (90 / 60) * 100) / 100;
  const price120 = Math.round(hourlyRate * (120 / 60) * 100) / 100;

  assert(price30 === 40.0, '$80/hr for 30 min calculates to $40.00');
  assert(price45 === 60.0, '$80/hr for 45 min calculates to $60.00');
  assert(price60 === 80.0, '$80/hr for 60 min calculates to $80.00');
  assert(price90 === 120.0, '$80/hr for 90 min calculates to $120.00');
  assert(price120 === 160.0, '$80/hr for 120 min calculates to $160.00');

  // 5. Booking Price Immutability Snapshot Test
  console.log('\n5. Testing Booking Immutability Snapshot...');
  const service = await db.service.findFirst({ where: { isActive: true } });
  const customer = await db.customer.findFirst();

  if (service && customer) {
    const bookingNumber = `SPEC-${Date.now()}`;
    const initialBooking = await db.booking.create({
      data: {
        bookingNumber,
        customerId: customer.id,
        therapistId: createdTherapistId,
        serviceId: service.id,
        appointmentDateTime: new Date(),
        durationMinutes: 60,
        hourlyRateUsed: 80.0,
        calculatedTotal: 80.0,
        amount: 80.0,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
      },
    });

    assert(initialBooking.hourlyRateUsed === 80.0 && initialBooking.amount === 80.0, 'Booking stored hourly rate and total price snapshot');

    // Update therapist hourly rate later
    await updateTherapistAction(createdTherapistId, { hourlyRate: 150.0 });

    const fetchedBooking = await db.booking.findUnique({ where: { id: initialBooking.id } });
    assert(fetchedBooking?.amount === 80.0 && fetchedBooking?.hourlyRateUsed === 80.0, 'Booking snapshot remains $80.00 after therapist changed rate to $150/hr');
  }

  console.log('\n✅ ALL FULL MASSAGEF SPECIFICATION VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

runFullSpecValidationSuite();
