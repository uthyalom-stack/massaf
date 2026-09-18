import { db } from '../src/lib/db';

async function testConcurrentBooking() {
  console.log('--- STARTING AUTOMATED CONCURRENT DOUBLE-BOOKING TEST ---');

  const testNotes = `CONCURRENT_TEST_${Date.now()}`;
  let therapistId = '';
  let serviceId = '';

  try {
    // 1. Identify or create valid active therapist
    console.log('1. Setting up test active therapist & service...');
    let therapist = await db.therapist.findFirst({
      where: { isActive: true, offersStudio: true },
      include: {
        services: { where: { isActive: true, service: { isActive: true } }, include: { service: true } },
      },
    });

    if (!therapist || therapist.services.length === 0) {
      therapist = await db.therapist.create({
        data: {
          name: 'Concurrency Test Practitioner',
          bio: 'Automated concurrency verification therapist',
          isActive: true,
          offersStudio: true,
          offersInHome: false,
          availabilities: {
            create: [
              { dayOfWeek: 1, startTime: '09:00', endTime: '18:00' },
              { dayOfWeek: 2, startTime: '09:00', endTime: '18:00' },
              { dayOfWeek: 3, startTime: '09:00', endTime: '18:00' },
              { dayOfWeek: 4, startTime: '09:00', endTime: '18:00' },
              { dayOfWeek: 5, startTime: '09:00', endTime: '18:00' },
            ],
          },
        },
        include: {
          services: { where: { isActive: true, service: { isActive: true } }, include: { service: true } },
        },
      });

      const service = await db.service.create({
        data: {
          name: 'Concurrency Test Massage',
          description: 'Automated test service',
          durationMinutes: 60,
          price: 100.0,
          isActive: true,
        },
      });

      await db.therapistService.create({
        data: {
          therapistId: therapist.id,
          serviceId: service.id,
          customPrice: 100.0,
          customDurationMinutes: 60,
          isActive: true,
        },
      });

      // Reload therapist
      therapist = await db.therapist.findUniqueOrThrow({
        where: { id: therapist.id },
        include: {
          services: { where: { isActive: true, service: { isActive: true } }, include: { service: true } },
        },
      });
    }

    therapistId = therapist.id;
    serviceId = therapist.services[0].service.id;

    // 2. Prepare 2 simultaneous booking requests for exact same therapist, date, time & overlapping duration
    const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
    const testDate = '2028-08-21'; // Monday
    const testTime = '10:00';

    console.log(`2. Firing 2 concurrent HTTP POST requests to ${BASE_URL}/api/bookings for slot ${testDate} @ ${testTime}...`);

    const payloadA = {
      therapistId,
      serviceId,
      locationType: 'STUDIO',
      date: testDate,
      time: testTime,
      firstName: 'CustomerA',
      lastName: 'Concurrency',
      email: `customerA.${Date.now()}@example.com`,
      phone: '555-0101',
      notes: testNotes,
    };

    const payloadB = {
      therapistId,
      serviceId,
      locationType: 'STUDIO',
      date: testDate,
      time: testTime,
      firstName: 'CustomerB',
      lastName: 'Concurrency',
      email: `customerB.${Date.now()}@example.com`,
      phone: '555-0102',
      notes: testNotes,
    };

    const reqA = fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadA),
    });

    const reqB = fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadB),
    });

    const [resA, resB] = await Promise.all([reqA, reqB]);
    const dataA = await resA.json();
    const dataB = await resB.json();

    console.log(`  -> Response A [Status ${resA.status}]:`, dataA);
    console.log(`  -> Response B [Status ${resB.status}]:`, dataB);

    // 3. Verification Assertions
    const statuses = [resA.status, resB.status];
    const successCount = statuses.filter((s) => s === 201).length;
    const conflictCount = statuses.filter((s) => s === 400).length;

    if (successCount !== 1 || conflictCount !== 1) {
      throw new Error(`Concurrency check failed: Expected exactly 1 success (201) and 1 conflict (400). Got statuses: A=${resA.status}, B=${resB.status}`);
    }

    const conflictResponse = resA.status === 400 ? dataA : dataB;
    if (!conflictResponse.error || !conflictResponse.error.includes('no longer available')) {
      throw new Error(`Conflict error message mismatch. Expected 'no longer available', got: ${JSON.stringify(conflictResponse)}`);
    }

    console.log('✓ API responses verified: exactly one 201 Created and one 400 Conflict!');

    // 4. Verify DB state has exactly ONE created booking for this slot
    console.log('3. Verifying Prisma database state for created bookings...');
    const createdBookings = await db.booking.findMany({
      where: {
        notes: testNotes,
      },
    });

    if (createdBookings.length !== 1) {
      throw new Error(`DB verification failed: Expected exactly 1 booking in DB for test run, found ${createdBookings.length}`);
    }

    console.log(`✓ DB verified: Only 1 booking (${createdBookings[0].bookingNumber}) exists in DB!`);

    console.log('\n======================================================');
    console.log('✅ CONCURRENT DOUBLE-BOOKING PROTECTION TEST PASSED!');
    console.log('======================================================');
  } catch (err) {
    console.error('\n❌ CONCURRENCY TEST FAILED:', err);
    process.exit(1);
  } finally {
    console.log('4. Cleaning up test data...');
    try {
      await db.booking.deleteMany({ where: { notes: testNotes } });
      const testTherapist = await db.therapist.findFirst({ where: { name: 'Concurrency Test Practitioner' } });
      if (testTherapist) {
        await db.therapist.delete({ where: { id: testTherapist.id } });
      }
      const testService = await db.service.findFirst({ where: { name: 'Concurrency Test Massage' } });
      if (testService) {
        await db.service.delete({ where: { id: testService.id } });
      }
      console.log('✓ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr);
    }
    await db.$disconnect();
  }
}

testConcurrentBooking();
