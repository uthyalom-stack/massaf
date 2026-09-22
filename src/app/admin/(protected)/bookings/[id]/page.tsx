import React from 'react';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import BookingDetailClient, {
  BookingDetailData,
  BookingDetailTherapistOption,
} from '@/components/admin/BookingDetailClient';

export const metadata = {
  title: 'Booking Details | MASSAF Admin',
};

// Force dynamic rendering so booking details reflect real-time database state
export const dynamic = 'force-dynamic';

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminBookingDetailPage({ params }: BookingDetailPageProps) {
  const { id } = await params;

  if (!id) {
    notFound();
  }

  let bookingData: BookingDetailData | null = null;
  let availableTherapists: BookingDetailTherapistOption[] = [];

  try {
    const booking = await db.booking.findUnique({
      where: { id },
      include: {
        customer: true,
        therapist: true,
        service: true,
        giftCardSubmission: true,
      },
    });

    if (!booking) {
      notFound();
    }

    // Fetch active therapists from DB for assignment selector
    const dbTherapists = await db.therapist.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    availableTherapists = dbTherapists.map((t) => ({
      id: t.id,
      name: t.name,
      isActive: t.isActive,
      offersStudio: t.offersStudio,
      offersInHome: t.offersInHome,
    }));

    const therapistName = booking.therapist?.name || 'Unassigned';
    const serviceName = booking.service?.name || 'Unspecified Service';
    const serviceDescription = booking.service?.description || null;
    const servicePrice = booking.service?.price || booking.amount;

    bookingData = {
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      paymentReference: booking.paymentReference,
      amount: booking.amount,
      appointmentDateTime: booking.appointmentDateTime.toISOString(),
      durationMinutes: booking.durationMinutes,
      locationType: booking.locationType,
      addressLine1: booking.addressLine1,
      addressLine2: booking.addressLine2,
      city: booking.city,
      state: booking.state,
      zipCode: booking.zipCode,
      notes: booking.notes,
      customer: {
        id: booking.customer.id,
        name: booking.customer.name,
        email: booking.customer.email,
        phone: booking.customer.phone,
      },
      therapistId: booking.therapistId,
      therapistName,
      serviceId: booking.serviceId,
      serviceName,
      serviceDescription,
      servicePrice,
      giftCardSubmission: booking.giftCardSubmission ? {
        id: booking.giftCardSubmission.id,
        cardType: booking.giftCardSubmission.cardType,
        cardCode: booking.giftCardSubmission.cardCode,
        declaredValue: booking.giftCardSubmission.declaredValue,
        notes: booking.giftCardSubmission.notes,
        status: booking.giftCardSubmission.status,
        rejectionReason: booking.giftCardSubmission.rejectionReason,
        reviewedAt: booking.giftCardSubmission.reviewedAt ? booking.giftCardSubmission.reviewedAt.toISOString() : null,
        reviewedBy: booking.giftCardSubmission.reviewedBy,
      } : null,
    };

  } catch (error) {
    console.error('Error loading booking detail in admin:', error);
    notFound();
  }

  if (!bookingData) {
    notFound();
  }

  return (
    <BookingDetailClient
      booking={bookingData}
      availableTherapists={availableTherapists}
    />
  );
}
