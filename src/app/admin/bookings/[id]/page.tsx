import React from 'react';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import BookingDetailClient, {
  BookingDetailData,
  BookingDetailTherapistOption,
} from '@/components/admin/BookingDetailClient';
import { MOCK_THERAPISTS } from '@/lib/mock-data';

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
      },
    });

    if (!booking) {
      notFound();
    }

    // Fetch all available therapists for therapist selection
    const dbTherapists = await db.therapist.findMany({
      orderBy: { name: 'asc' },
    });

    // Combine DB therapists with mock therapists for full roster coverage
    const therapistMap = new Map<string, BookingDetailTherapistOption>();

    dbTherapists.forEach((t) => {
      therapistMap.set(t.id, {
        id: t.id,
        name: t.name,
        isActive: t.isActive,
        offersStudio: t.offersStudio,
        offersInHome: t.offersInHome,
      });
    });

    MOCK_THERAPISTS.forEach((mt) => {
      if (!therapistMap.has(mt.id)) {
        therapistMap.set(mt.id, {
          id: mt.id,
          name: mt.name,
          isActive: true,
          offersStudio: mt.offersStudio,
          offersInHome: mt.offersInHome,
        });
      }
    });

    availableTherapists = Array.from(therapistMap.values());

    // Resolve therapist and service details with mock fallbacks if needed
    const mockTherapist = MOCK_THERAPISTS.find((t) => t.id === booking.therapistId);
    const mockService = mockTherapist?.services.find((s) => s.id === booking.serviceId);

    const therapistName = booking.therapist?.name || mockTherapist?.name || 'Unassigned';
    const serviceName = booking.service?.name || mockService?.name || 'Massage Session';
    const serviceDescription = booking.service?.description || mockService?.description || null;
    const servicePrice = booking.service?.price || mockService?.price || booking.amount;

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
