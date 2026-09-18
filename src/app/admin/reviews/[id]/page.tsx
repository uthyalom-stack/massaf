import React from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { ReviewDetailClient, SerializedReviewDetail } from '@/components/admin/ReviewDetailClient';

export const metadata = {
  title: 'Review Detail | MASSAF Admin',
};

// Force dynamic rendering so review detail reflects real-time database state
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminReviewDetailPage({ params }: PageProps) {
  const { id } = await params;

  let serializedReview: SerializedReviewDetail | null = null;

  try {
    const rawReview = await db.review.findUnique({
      where: { id },
      include: {
        therapist: {
          select: {
            id: true,
            name: true,
            bio: true,
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
            locationType: true,
            status: true,
            durationMinutes: true,
            service: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (rawReview) {
      serializedReview = {
        id: rawReview.id,
        rating: rawReview.rating,
        comment: rawReview.comment,
        status: rawReview.status,
        isPublished: rawReview.isPublished,
        createdAt: rawReview.createdAt.toISOString(),
        updatedAt: rawReview.updatedAt.toISOString(),
        therapist: {
          id: rawReview.therapist.id,
          name: rawReview.therapist.name,
          bio: rawReview.therapist.bio,
          profileImage: rawReview.therapist.profileImage,
        },
        customer: {
          id: rawReview.customer.id,
          name: rawReview.customer.name,
          email: rawReview.customer.email,
        },
        booking: rawReview.booking
          ? {
              id: rawReview.booking.id,
              bookingNumber: rawReview.booking.bookingNumber,
              appointmentDateTime: rawReview.booking.appointmentDateTime.toISOString(),
              locationType: rawReview.booking.locationType,
              status: rawReview.booking.status,
              serviceName: rawReview.booking.service?.name || 'Massage Session',
              durationMinutes: rawReview.booking.durationMinutes,
            }
          : null,
      };
    }
  } catch (err) {
    console.error('Error fetching review detail from database:', err);
  }

  if (!serializedReview) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/admin/reviews"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-emerald-700 transition-colors py-1 px-2 -ml-2 rounded-md"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Reviews
          </Link>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4 max-w-lg mx-auto my-12 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Review Not Found</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            The review record you requested could not be found or has been removed.
          </p>
          <div className="pt-2">
            <Link
              href="/admin/reviews"
              className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              Return to Reviews List
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <ReviewDetailClient review={serializedReview} />;
}
