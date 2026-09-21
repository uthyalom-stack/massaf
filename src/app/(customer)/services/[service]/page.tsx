import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { db } from '@/lib/db';
import { formatDbTherapistToPublic } from '@/lib/db-therapists';
import { TherapistCard } from '@/components/customer/TherapistCard';

interface PageProps {
  params: Promise<{ service: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { service: serviceSlug } = await params;
  const decodedName = decodeURIComponent(serviceSlug).replace(/-/g, ' ');

  const service = await db.service.findFirst({
    where: {
      name: { contains: decodedName },
      isActive: true,
    },
  });

  if (!service) {
    return {
      title: 'Service Not Found | MASSAF',
      description: 'Requested massage therapy service is unavailable.',
    };
  }

  return {
    title: `${service.name} Massage Therapy | MASSAF`,
    description: service.description || `Book top-rated licensed massage therapists offering ${service.name} sessions.`,
  };
}

export default async function PublicServicePage({ params }: PageProps) {
  const { service: serviceSlug } = await params;
  const decodedName = decodeURIComponent(serviceSlug).replace(/-/g, ' ');

  const service = await db.service.findFirst({
    where: {
      name: { contains: decodedName },
      isActive: true,
    },
    include: {
      therapists: {
        where: {
          isActive: true,
          therapist: { isActive: true },
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
      },
    },
  });

  if (!service) {
    notFound();
  }

  const therapists = service.therapists.map((ts) => formatDbTherapistToPublic(ts.therapist));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    provider: {
      '@type': 'Organization',
      name: 'MASSAF Massage Therapy Platform',
      url: process.env.NEXT_PUBLIC_APP_URL || 'https://massaf.com',
    },
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xs space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold">
            <span>Featured Massage Service</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900">{service.name}</h1>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-3xl">
            {service.description || `Professional ${service.name} sessions offered by licensed, background-checked massage therapists.`}
          </p>
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 pt-2 border-t border-slate-100">
            <span>Standard Duration: {service.durationMinutes} mins</span>
            <span>•</span>
            <span>Standard Price: ${service.price.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-black text-slate-900">
            Available Therapists Offering {service.name} ({therapists.length})
          </h2>

          {therapists.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {therapists.map((t) => (
                <TherapistCard key={t.id} therapist={t} />
              ))}
            </div>
          ) : (
            <div className="p-8 bg-white rounded-3xl border border-slate-200 text-center text-xs text-slate-500">
              No active therapists currently offer this service.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
