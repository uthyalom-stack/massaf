import React from 'react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { ReviewList, SerializedReview, TherapistOption } from '@/components/admin/ReviewList';
import { ReviewStatus } from '@prisma/client';

export const metadata = {
  title: 'Reviews Management | MASSAF Admin',
};

// Force dynamic rendering so review listings reflect real-time database state
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    therapistId?: string;
  }>;
}

export default async function AdminReviewsPage({ searchParams }: PageProps) {
  const session = await getVerifiedAdminSession();
  if (session?.role === 'STAFF') {
    redirect('/admin/marketer');
  }

  const params = await searchParams;
  const search = params.search || '';
  const statusParam = params.status || 'ALL';
  const therapistIdParam = params.therapistId || 'ALL';

  const whereClause: {
    status?: ReviewStatus;
    therapistId?: string;
    OR?: Array<{
      comment?: { contains: string };
      customer?: { name?: { contains: string } };
      therapist?: { name?: { contains: string } };
      booking?: { bookingNumber?: { contains: string } };
    }>;
  } = {};

  if (statusParam !== 'ALL' && Object.values(ReviewStatus).includes(statusParam as ReviewStatus)) {
    whereClause.status = statusParam as ReviewStatus;
  }

  if (therapistIdParam !== 'ALL') {
    whereClause.therapistId = therapistIdParam;
  }

  if (search.trim()) {
    const q = search.trim();
    whereClause.OR = [
      { comment: { contains: q } },
      { customer: { name: { contains: q } } },
      { therapist: { name: { contains: q } } },
      { booking: { bookingNumber: { contains: q } } },
    ];
  }

  let serializedReviews: SerializedReview[] = [];
  let therapistsOptions: TherapistOption[] = [];

  try {
    const [rawReviews, rawTherapists] = await Promise.all([
      db.review.findMany({
        where: whereClause,
        include: {
          therapist: {
            select: {
              id: true,
              name: true,
              profileImage: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          booking: {
            select: {
              id: true,
              bookingNumber: true,
              appointmentDateTime: true,
              service: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      db.therapist.findMany({
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: 'asc',
        },
      }),
    ]);

    therapistsOptions = rawTherapists;

    serializedReviews = rawReviews.map((rev) => ({
      id: rev.id,
      rating: rev.rating,
      comment: rev.comment,
      status: rev.status,
      isPublished: rev.isPublished,
      createdAt: rev.createdAt.toISOString(),
      therapist: {
        id: rev.therapist.id,
        name: rev.therapist.name,
        profileImage: rev.therapist.profileImage,
      },
      customer: {
        id: rev.customer.id,
        name: rev.customer.name,
        email: rev.customer.email,
      },
      booking: rev.booking
        ? {
            id: rev.booking.id,
            bookingNumber: rev.booking.bookingNumber,
            appointmentDateTime: rev.booking.appointmentDateTime.toISOString(),
            serviceName: rev.booking.service?.name || 'Service unavailable',
          }
        : null,
    }));
  } catch (err) {
    console.error('Error fetching admin reviews from database:', err);
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Reviews Moderation
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Review customer feedback, verify rating eligibility, and manage public review publication.
        </p>
      </div>

      <ReviewList
        initialReviews={serializedReviews}
        therapists={therapistsOptions}
        currentSearch={search}
        currentStatus={statusParam}
        currentTherapistId={therapistIdParam}
      />
    </div>
  );
}
