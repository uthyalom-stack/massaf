import React from 'react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { db } from '@/lib/db';
import { formatDbTherapistToPublic } from '@/lib/db-therapists';
import { TherapistCard } from '@/components/customer/TherapistCard';

interface PageProps {
  params: Promise<{ city: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: citySlug } = await params;
  const decodedCity = decodeURIComponent(citySlug).replace(/-/g, ' ');

  const serviceArea = await db.serviceArea.findFirst({
    where: {
      cityName: { contains: decodedCity },
    },
  });

  if (!serviceArea) {
    return {
      title: 'Location Not Found | MASSAF',
      description: 'The requested service location could not be found.',
    };
  }

  return {
    title: `Massage Therapists in ${serviceArea.cityName}, ${serviceArea.state} | MASSAF`,
    description: `Book background-checked in-home and studio massage therapists serving ${serviceArea.cityName}, ${serviceArea.state}.`,
  };
}

export default async function PublicLocationPage({ params }: PageProps) {
  const { city: citySlug } = await params;
  const decodedCity = decodeURIComponent(citySlug).replace(/-/g, ' ');

  const serviceAreas = await db.serviceArea.findMany({
    where: {
      cityName: { contains: decodedCity },
    },
    include: {
      therapist: {
        include: {
          photos: { orderBy: { sortOrder: 'asc' } },
          services: {
            where: { isActive: true, service: { isActive: true } },
            include: { service: true },
          },
          serviceAreas: true,
          availabilities: true,
          _count: { select: { bookings: true } },
        },
      },
    },
  });

  if (serviceAreas.length === 0) {
    notFound();
  }

  const activeTherapistsMap = new Map();
  serviceAreas.forEach((sa) => {
    if (sa.therapist && sa.therapist.isActive) {
      activeTherapistsMap.set(sa.therapist.id, formatDbTherapistToPublic(sa.therapist));
    }
  });

  const therapists = Array.from(activeTherapistsMap.values());
  const primaryArea = serviceAreas[0];

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xs space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold">
            <span>Service Coverage Area</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900">
            Massage Therapists in {primaryArea.cityName}, {primaryArea.state}
          </h1>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-3xl">
            Discover licensed practitioners offering studio and in-home appointments in {primaryArea.cityName} and surrounding ZIP codes.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-black text-slate-900">
            Practitioners Serving {primaryArea.cityName} ({therapists.length})
          </h2>

          {therapists.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {therapists.map((t) => (
                <TherapistCard key={t.id} therapist={t} />
              ))}
            </div>
          ) : (
            <div className="p-8 bg-white rounded-3xl border border-slate-200 text-center text-xs text-slate-500">
              No active therapists currently listed for this location.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
