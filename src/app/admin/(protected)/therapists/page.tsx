import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { TherapistList, AdminTherapistItem } from '@/components/admin/TherapistList';

export const metadata = {
  title: 'Therapists Management | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

export default async function AdminTherapistsPage() {
  const session = await getVerifiedAdminSession();
  if (session?.role === 'STAFF') {
    redirect('/admin/marketer');
  }

  let initialTherapists: AdminTherapistItem[] = [];

  try {
    const dbTherapists = await db.therapist.findMany({
      include: {
        _count: {
          select: {
            services: true,
            serviceAreas: true,
            photos: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    initialTherapists = dbTherapists.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      phone: t.phone,
      bio: t.bio,
      profileImage: t.profileImage,
      rating: t.rating,
      reviewCount: t.reviewCount,
      isActive: t.isActive,
      isFeatured: t.isFeatured,
      offersStudio: t.offersStudio,
      offersInHome: t.offersInHome,
      createdAt: t.createdAt.toISOString(),
      servicesCount: t._count.services,
      serviceAreasCount: t._count.serviceAreas,
      photosCount: t._count.photos,
    }));
  } catch (err) {
    console.error('Error fetching therapists for admin:', err);
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Therapist Roster
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Manage therapist profiles, active availability status, and offered services.
          </p>
        </div>

        <div>
          <Link
            href="/admin/therapists/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors shadow-xs"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New Therapist
          </Link>
        </div>
      </div>

      {/* Main List */}
      <TherapistList initialTherapists={initialTherapists} />
    </div>
  );
}
