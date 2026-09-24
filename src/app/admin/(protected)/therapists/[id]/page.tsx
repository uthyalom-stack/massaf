import React from 'react';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { EditTherapistForm, DetailedTherapist } from '@/components/admin/EditTherapistForm';

export const metadata = {
  title: 'Edit Therapist | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEditTherapistPage({ params }: PageProps) {
  const { id } = await params;

  let therapistData: DetailedTherapist | null = null;
  let availableGlobalServices: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  }> = [];

  try {
    const dbTherapist = await db.therapist.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        services: { include: { service: true } },
        availabilities: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      },
    });

    if (!dbTherapist) {
      notFound();
    }

    therapistData = {
      id: dbTherapist.id,
      name: dbTherapist.name,
      bio: dbTherapist.bio,
      profileImage: dbTherapist.profileImage,
      email: dbTherapist.email,
      phone: dbTherapist.phone,
      telegramChatId: dbTherapist.telegramChatId,
      rating: dbTherapist.rating,
      reviewCount: dbTherapist.reviewCount,
      isActive: dbTherapist.isActive,
      isFeatured: dbTherapist.isFeatured,
      isHomepageSelected: dbTherapist.isHomepageSelected,
      offersStudio: dbTherapist.offersStudio,
      offersInHome: dbTherapist.offersInHome,
      photos: dbTherapist.photos.map((p) => ({
        id: p.id,
        url: p.url,
        altText: p.altText,
        sortOrder: p.sortOrder,
      })),
      services: dbTherapist.services.map((s) => ({
        id: s.id,
        serviceId: s.serviceId,
        customPrice: s.customPrice,
        customDurationMinutes: s.customDurationMinutes,
        isActive: s.isActive,
        service: {
          id: s.service.id,
          name: s.service.name,
          durationMinutes: s.service.durationMinutes,
          price: s.service.price,
        },
      })),
      availabilities: dbTherapist.availabilities.map((av) => ({
        id: av.id,
        dayOfWeek: av.dayOfWeek,
        specificDate: av.specificDate ? av.specificDate.toISOString() : null,
        startTime: av.startTime,
        endTime: av.endTime,
        isUnavailable: av.isUnavailable,
      })),
    };

    const globalServices = await db.service.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    availableGlobalServices = globalServices.map((gs) => ({
      id: gs.id,
      name: gs.name,
      durationMinutes: gs.durationMinutes,
      price: gs.price,
    }));
  } catch (err) {
    console.error('Error fetching therapist profile for editing:', err);
    notFound();
  }

  if (!therapistData) {
    notFound();
  }

  return (
    <EditTherapistForm
      initialTherapist={therapistData}
      availableGlobalServices={availableGlobalServices}
    />
  );
}
