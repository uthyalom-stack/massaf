import { getVerifiedAdminSession } from '@/lib/auth-session';
import { redirect } from 'next/navigation';
import { CalendarClient } from '@/components/admin/CalendarClient';
import { db } from '@/lib/db';

export const metadata = {
  title: 'Operational Calendar | MASSAF Admin',
};

export default async function AdminCalendarPage() {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect('/admin/login');
  }

  // Retrieve initial bookings, therapists, and active services
  const [bookings, therapists, services] = await Promise.all([
    db.booking.findMany({
      include: {
        customer: { select: { id: true, name: true, email: true } },
        therapist: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { appointmentDateTime: 'desc' },
      take: 200,
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

  const formattedBookings = bookings.map((b) => ({
    id: b.id,
    bookingNumber: b.bookingNumber,
    appointmentDateTime: b.appointmentDateTime.toISOString(),
    durationMinutes: b.durationMinutes,
    status: b.status,
    locationType: b.locationType,
    customerName: b.customer?.name || 'Guest Customer',
    therapistId: b.therapistId,
    therapistName: b.therapist?.name || null,
    serviceId: b.serviceId,
    serviceName: b.service?.name || 'Custom Session',
  }));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Operational Calendar</h1>
        <p className="text-sm text-slate-400">
          Visualize, schedule, and monitor all therapist appointments and service allocations across time.
        </p>
      </div>

      <CalendarClient
        initialBookings={formattedBookings}
        therapists={therapists}
        services={services}
      />
    </div>
  );
}
