import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { EditTherapistForm, DetailedTherapist, ZipCoverageGroup } from '@/components/admin/EditTherapistForm';

export const metadata = {
  title: 'Edit Therapist | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEditTherapistPage({ params }: PageProps) {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect('/admin/login');
  }
  if (session.role === 'STAFF') {
    redirect('/admin/marketer');
  }

  const { id } = await params;

  let therapistData: DetailedTherapist | null = null;
  let availableGlobalServices: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  }> = [];
  const zipCoverageGroups: ZipCoverageGroup[] = [];
  let totalAssignedZips = 0;

  try {
    const dbTherapist = await db.therapist.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        services: { include: { service: true } },
        availabilities: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        zipEligibility: { orderBy: [{ state: 'asc' }, { startZip: 'asc' }] },
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

    // Group therapist's assigned TherapistZipEligibility ranges by state and resolve city names from USZipCode
    if (dbTherapist.zipEligibility.length > 0) {
      const stateGroupMap = new Map<string, Array<{ startZip: string; endZip: string }>>();
      for (const ze of dbTherapist.zipEligibility) {
        const st = ze.state.toUpperCase();
        if (!stateGroupMap.has(st)) stateGroupMap.set(st, []);
        stateGroupMap.get(st)!.push({ startZip: ze.startZip, endZip: ze.endZip });
      }

      const uniqueStates = Array.from(stateGroupMap.keys());

      // Batch query all USZipCodes for the involved states in a single database query
      const allStateZips = await db.uSZipCode.findMany({
        where: {
          state: { in: uniqueStates },
        },
        select: {
          state: true,
          stateName: true,
          city: true,
          zipCode: true,
        },
        orderBy: {
          zipCode: 'asc',
        },
      });

      // Group state ZIP records in memory for fast range evaluation
      const zipsByState = new Map<string, Array<{ zipCode: string; city: string; stateName: string }>>();
      const stateNameMap = new Map<string, string>();

      for (const z of allStateZips) {
        const st = z.state.toUpperCase();
        if (!zipsByState.has(st)) {
          zipsByState.set(st, []);
        }
        zipsByState.get(st)!.push(z);
        if (!stateNameMap.has(st) && z.stateName) {
          stateNameMap.set(st, z.stateName);
        }
      }

      for (const [st, ranges] of stateGroupMap.entries()) {
        const stateZips = zipsByState.get(st) || [];
        const rangesWithDetails = [];
        let stateZipCount = 0;

        for (const r of ranges) {
          const matchingZips = stateZips.filter(
            (z) => z.zipCode >= r.startZip && z.zipCode <= r.endZip
          );

          const uniqueCities: string[] = [];
          const citySet = new Set<string>();
          for (const z of matchingZips) {
            if (!citySet.has(z.city)) {
              citySet.add(z.city);
              uniqueCities.push(z.city);
              if (uniqueCities.length === 5) break;
            }
          }

          const rangeCount = matchingZips.length;
          stateZipCount += rangeCount;

          rangesWithDetails.push({
            startZip: r.startZip,
            endZip: r.endZip,
            sampleCities: uniqueCities,
            count: rangeCount,
          });
        }

        totalAssignedZips += stateZipCount;

        zipCoverageGroups.push({
          state: st,
          stateName: stateNameMap.get(st) || st,
          ranges: rangesWithDetails,
          totalStateZips: stateZipCount,
        });
      }
    }

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
      zipCoverageGroups={zipCoverageGroups}
      totalAssignedZips={totalAssignedZips}
    />
  );
}
