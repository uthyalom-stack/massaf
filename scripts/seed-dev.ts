import { db } from '../src/lib/db';
import { MOCK_THERAPISTS } from '../src/lib/mock-data';

async function seedDevDatabase() {
  console.log('Seeding dev database with mock therapists & services...');

  for (const mock of MOCK_THERAPISTS) {
    const existing = await db.therapist.findFirst({
      where: { name: mock.name },
    });

    if (existing) continue;

    const therapist = await db.therapist.create({
      data: {
        name: mock.name,
        bio: mock.bio,
        profileImage: mock.image,
        rating: mock.rating,
        reviewCount: mock.reviewCount,
        isActive: true,
        isFeatured: mock.isFeatured ?? false,
        offersStudio: mock.offersStudio,
        offersInHome: mock.offersInHome,
      },
    });

    // Add Photos
    if (mock.galleryImages && mock.galleryImages.length > 0) {
      await db.therapistPhoto.createMany({
        data: mock.galleryImages.map((url, idx) => ({
          therapistId: therapist.id,
          url,
          sortOrder: idx,
        })),
      });
    }

    // Add Service Areas
    if (mock.serviceAreas && mock.serviceAreas.length > 0) {
      const cityState = mock.location.split(',');
      const cityName = cityState[0]?.trim() || 'Los Angeles';
      const state = cityState[1]?.trim() || 'CA';

      await db.serviceArea.createMany({
        data: mock.zipCodes.map((zip) => ({
          therapistId: therapist.id,
          cityName,
          state,
          zipCode: zip,
        })),
      });
    }

    // Add Availabilities
    await db.therapistAvailability.createMany({
      data: [
        { therapistId: therapist.id, dayOfWeek: 0, startTime: '08:00', endTime: '20:00' },
        { therapistId: therapist.id, dayOfWeek: 1, startTime: '08:00', endTime: '20:00' },
        { therapistId: therapist.id, dayOfWeek: 2, startTime: '08:00', endTime: '20:00' },
        { therapistId: therapist.id, dayOfWeek: 3, startTime: '08:00', endTime: '20:00' },
        { therapistId: therapist.id, dayOfWeek: 4, startTime: '08:00', endTime: '20:00' },
        { therapistId: therapist.id, dayOfWeek: 5, startTime: '08:00', endTime: '20:00' },
        { therapistId: therapist.id, dayOfWeek: 6, startTime: '08:00', endTime: '20:00' },
      ],
    });

    // Add Services & TherapistServices
    for (const serviceMock of mock.services) {
      let service = await db.service.findFirst({
        where: { name: serviceMock.name },
      });

      if (!service) {
        service = await db.service.create({
          data: {
            name: serviceMock.name,
            description: serviceMock.description,
            durationMinutes: serviceMock.durationMinutes,
            price: serviceMock.price,
            isActive: true,
          },
        });
      }

      await db.therapistService.create({
        data: {
          therapistId: therapist.id,
          serviceId: service.id,
          customPrice: serviceMock.price,
          customDurationMinutes: serviceMock.durationMinutes,
          isActive: true,
        },
      });
    }
  }

  console.log('✓ Dev database successfully seeded.');
}

seedDevDatabase()
  .then(() => db.$disconnect())
  .catch((err) => {
    console.error('Seed failed:', err);
    db.$disconnect();
  });
