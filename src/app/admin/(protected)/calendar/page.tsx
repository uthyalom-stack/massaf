import React from 'react';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { redirect } from 'next/navigation';
import { CalendarClient } from '@/components/admin/CalendarClient';

export const dynamic = 'force-dynamic';

export default async function AdminCalendarPage() {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect('/admin/login');
  }

  if (session.role === 'STAFF') {
    redirect('/admin/marketer');
  }

  const [bookings, therapists, services] = await Promise.all([
    db.booking.findMany({
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true },
        },
        therapist: {
          select: { id: true, name: true, email: true, phone: true },
        },
        service: {
          select: { id: true, name: true, durationMinutes: true, price: true },
        },
      },
      orderBy: { appointmentDateTime: 'asc' },
    }),
    db.therapist.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.service.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const serializedBookings = bookings.map((b) => ({
    id: b.id,
    bookingNumber: b.bookingNumber,
    customerId: b.customerId,
    customerName: b.customer?.name || 'Unknown Customer',
    therapistId: b.therapistId,
    therapistName: b.therapist?.name || null,
    serviceId: b.serviceId,
    serviceName: b.service?.name || 'Service',
    appointmentDateTime: b.appointmentDateTime.toISOString(),
    durationMinutes: b.durationMinutes,
    locationType: b.locationType,
    status: b.status,
    paymentStatus: b.paymentStatus,
    amount: b.amount,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Operational Calendar</h1>
        <p className="text-sm text-slate-600 mt-1">
          Interactive schedule overview of all therapist bookings, studio, and in-home sessions.
        </p>
      </div>

      <CalendarClient
        bookings={serializedBookings}
        therapists={therapists}
        services={services}
      />
    </div>
  );
}
