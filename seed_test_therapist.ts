import { db } from './src/lib/db';

async function main() {
  // Ensure we have a service in DB
  const service1 = await db.service.upsert({
    where: { id: 'service-deep-tissue' },
    update: {},
    create: {
      id: 'service-deep-tissue',
      name: 'Targeted Deep Tissue Massage',
      description: 'Firm pressure targeting deep muscle layers to release chronic tension.',
      durationMinutes: 60,
      price: 120,
      isActive: true,
    },
  });

  const service2 = await db.service.upsert({
    where: { id: 'service-swedish' },
    update: {},
    create: {
      id: 'service-swedish',
      name: 'Restorative Swedish Massage',
      description: 'Gentle long strokes for total body relaxation and mental stress relief.',
      durationMinutes: 90,
      price: 160,
      isActive: true,
    },
  });

  // Create an active therapist in DB
  const therapist = await db.therapist.upsert({
    where: { id: 'therapist-db-1' },
    update: {
      isActive: true,
      name: 'Dr. Maya Lin, LMT',
      bio: 'Maya is a licensed clinical massage therapist specializing in deep tissue and athletic recovery with over 8 years of clinical experience.',
      profileImage: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=600',
      rating: 4.95,
      reviewCount: 28,
      isFeatured: true,
      offersStudio: true,
      offersInHome: true,
    },
    create: {
      id: 'therapist-db-1',
      name: 'Dr. Maya Lin, LMT',
      bio: 'Maya is a licensed clinical massage therapist specializing in deep tissue and athletic recovery with over 8 years of clinical experience.',
      profileImage: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=600',
      email: 'maya.lin@example.com',
      phone: '555-0199',
      rating: 4.95,
      reviewCount: 28,
      isActive: true,
      isFeatured: true,
      offersStudio: true,
      offersInHome: true,
    },
  });

  // Assign services
  await db.therapistService.upsert({
    where: { therapistId_serviceId: { therapistId: therapist.id, serviceId: service1.id } },
    update: { isActive: true },
    create: {
      therapistId: therapist.id,
      serviceId: service1.id,
      customPrice: 120,
      isActive: true,
    },
  });

  await db.therapistService.upsert({
    where: { therapistId_serviceId: { therapistId: therapist.id, serviceId: service2.id } },
    update: { isActive: true },
    create: {
      therapistId: therapist.id,
      serviceId: service2.id,
      customPrice: 160,
      isActive: true,
    },
  });

  // Add Service Area
  await db.serviceArea.create({
    data: {
      therapistId: therapist.id,
      cityName: 'Los Angeles',
      state: 'CA',
      zipCode: '90210',
    },
  });

  // Add Availability
  await db.therapistAvailability.create({
    data: {
      therapistId: therapist.id,
      dayOfWeek: 1, // Mon
      startTime: '09:00',
      endTime: '17:00',
    },
  });

  await db.therapistAvailability.create({
    data: {
      therapistId: therapist.id,
      dayOfWeek: 2, // Tue
      startTime: '09:00',
      endTime: '17:00',
    },
  });

  await db.therapistAvailability.create({
    data: {
      therapistId: therapist.id,
      dayOfWeek: 3, // Wed
      startTime: '09:00',
      endTime: '17:00',
    },
  });

  console.log('Seeded active DB therapist successfully:', therapist.id);
}

main().catch(console.error);
