import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reviewSchema } from '@/lib/validations/review';
import { getVerifiedCustomerSession } from '@/lib/auth-session';

export async function POST(request: Request) {
  try {
    // 0. Server-side customer session authorization check
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to submit a review' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // 1. Validate request body against Zod schema
    const parseResult = reviewSchema.safeParse(body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const issues = parseResult.error.issues;
      const firstErrorMessage =
        issues[0]?.message || 'Invalid review data provided';
      return NextResponse.json(
        { error: firstErrorMessage, details: fieldErrors },
        { status: 400 }
      );
    }

    const { bookingId, rating, comment } = parseResult.data;

    // 2. Fetch booking record with relations
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: {
        review: true,
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Strict customer ownership check: booking customer MUST equal authenticated customer
    if (booking.customerId !== session.entityId) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only submit reviews for your own bookings' },
        { status: 403 }
      );
    }

    // 3. Verify booking has a therapist
    if (!booking.therapistId) {
      return NextResponse.json(
        { error: 'Booking does not have an assigned therapist for review' },
        { status: 400 }
      );
    }

    // 4. Verify review eligibility: booking status MUST be COMPLETED
    if (booking.status !== 'COMPLETED') {
      return NextResponse.json(
        {
          error:
            'Reviews can only be submitted for completed appointments. Your review will become available after your appointment is completed.',
        },
        { status: 400 }
      );
    }

    // 5. Duplicate review check: Ensure a review does not already exist for this booking
    if (booking.review) {
      return NextResponse.json(
        { error: 'A review has already been submitted for this booking' },
        { status: 409 }
      );
    }

    // Additional check: verify by bookingId query in Review table
    const existingReview = await db.review.findUnique({
      where: { bookingId: booking.id },
    });

    if (existingReview) {
      return NextResponse.json(
        { error: 'A review has already been submitted for this booking' },
        { status: 409 }
      );
    }

    // 6. Create review entry with moderation status PENDING and isPublished false
    const newReview = await db.review.create({
      data: {
        customerId: booking.customerId,
        therapistId: booking.therapistId,
        bookingId: booking.id,
        rating,
        comment: comment || null,
        status: 'PENDING',
        isPublished: false,
      },
    });

    return NextResponse.json(
      {
        message: 'Review submitted successfully and is pending moderation',
        review: {
          id: newReview.id,
          rating: newReview.rating,
          comment: newReview.comment,
          status: newReview.status,
          createdAt: newReview.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error submitting review:', error);
    return NextResponse.json(
      { error: 'An error occurred while submitting your review. Please try again.' },
      { status: 500 }
    );
  }
}
