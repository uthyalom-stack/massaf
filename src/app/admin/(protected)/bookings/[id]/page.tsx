import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import BookingDetailClient, {
  BookingDetailData,
  BookingDetailTherapistOption,
} from '@/components/admin/BookingDetailClient';

export const metadata = {
  title: 'Booking Details | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminBookingDetailPage({ params }: BookingDetailPageProps) {
  const session = await getVerifiedAdminSession();
  if (!session) redirect('/admin/login');
  if (session.role === 'STAFF') redirect('/admin/marketer');

  const { id } = await params;

  if (!id) notFound();

  let bookingData: BookingDetailData | null = null;
  let availableTherapists: BookingDetailTherapistOption[] = [];

  try {
    const [booking, dbTherapists, auditLogs, internalNotes, refunds] = await Promise.all([
      db.booking.findUnique({
        where: { id },
        include: {
          customer: true,
          therapist: true,
          service: true,
          giftCardSubmission: {
            include: { images: true },
          },
        },
      }),
      db.therapist.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      db.adminAuditLog.findMany({
        where: { entityType: 'Booking', entityId: id },
        orderBy: { createdAt: 'desc' },
      }),
      db.adminNote.findMany({
        where: { entityType: 'BOOKING', entityId: id },
        orderBy: { createdAt: 'desc' },
      }),
      db.refundRecord.findMany({
        where: { bookingId: id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!booking) notFound();

    availableTherapists = dbTherapists.map((t) => ({
      id: t.id,
      name: t.name,
      isActive: t.isActive,
      offersStudio: t.offersStudio,
      offersInHome: t.offersInHome,
    }));

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
      reminder24hSentAt: booking.reminder24hSentAt ? booking.reminder24hSentAt.toISOString() : null,
      reminder3hSentAt: booking.reminder3hSentAt ? booking.reminder3hSentAt.toISOString() : null,
      customer: {
        id: booking.customer.id,
        name: booking.customer.name,
        email: booking.customer.email,
        phone: booking.customer.phone,
      },
      therapistId: booking.therapistId,
      therapistName: booking.therapist?.name || 'Unassigned',
      serviceId: booking.serviceId,
      serviceName: booking.service?.name || 'Service',
      serviceDescription: booking.service?.description || null,
      servicePrice: booking.service?.price || booking.amount,
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
        imageIds: booking.giftCardSubmission.images.map((img) => img.id),
      } : null,
      auditLogs: auditLogs.map((l) => ({
        id: l.id,
        actorEmail: l.actorEmail,
        actorRole: l.actorRole,
        action: l.action,
        description: l.description,
        metadataJson: l.metadataJson,
        createdAt: l.createdAt.toISOString(),
      })),
      internalNotes: internalNotes.map((n) => ({
        id: n.id,
        entityType: n.entityType,
        entityId: n.entityId,
        authorEmail: n.authorEmail,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
      })),
      refunds: refunds.map((r) => ({
        id: r.id,
        amount: r.amount,
        reason: r.reason,
        status: r.status,
        requestedBy: r.requestedBy,
        processedBy: r.processedBy,
        failureReason: r.failureReason,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error('Error loading booking detail in admin:', error);
    notFound();
  }

  if (!bookingData) notFound();

  return (
    <BookingDetailClient
      booking={bookingData}
      availableTherapists={availableTherapists}
    />
  );
}
