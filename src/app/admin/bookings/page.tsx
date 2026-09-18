import React from 'react';
import { db } from '@/lib/db';
import BookingList, { AdminBookingListItem } from '@/components/admin/BookingList';
import { BookingStatus, Prisma } from '@prisma/client';
import { MOCK_THERAPISTS } from '@/lib/mock-data';

export const metadata = {
  title: 'Bookings Management | MASSAF Admin',
};

// Force dynamic rendering so bookings list reflects real-time database state
export const dynamic = 'force-dynamic';

interface BookingsPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    dateFilter?: string;
  }>;
}

export default async function AdminBookingsPage({ searchParams }: BookingsPageProps) {
  const resolvedParams = await searchParams;
  const search = resolvedParams?.search || '';
  const statusFilter = resolvedParams?.status || 'ALL';
  const dateFilter = resolvedParams?.dateFilter || 'ALL';

  let bookings: AdminBookingListItem[] = [];

  try {
    const whereConditions: Prisma.BookingWhereInput[] = [];

    // Search filter
    if (search.trim()) {
      const q = search.trim();
      whereConditions.push({
        OR: [
          { bookingNumber: { contains: q } },
          { customer: { name: { contains: q } } },
          { customer: { email: { contains: q } } },
          { therapist: { name: { contains: q } } },
        ],
      });
    }

    // Status filter
    if (statusFilter !== 'ALL' && Object.values(BookingStatus).includes(statusFilter as BookingStatus)) {
      whereConditions.push({
        status: statusFilter as BookingStatus,
      });
    }

    // Date filter
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (dateFilter === 'TODAY') {
      whereConditions.push({
        appointmentDateTime: {
          gte: startOfToday,
          lte: endOfToday,
        },
      });
    } else if (dateFilter === 'UPCOMING') {
      whereConditions.push({
        appointmentDateTime: {
          gte: startOfToday,
        },
      });
    } else if (dateFilter === 'PAST') {
      whereConditions.push({
        appointmentDateTime: {
          lt: startOfToday,
        },
      });
    }

    const whereClause: Prisma.BookingWhereInput = whereConditions.length > 0
      ? { AND: whereConditions }
      : {};

    const rawBookings = await db.booking.findMany({
      where: whereClause,
      include: {
        customer: true,
        therapist: true,
        service: true,
      },
      orderBy: {
        appointmentDateTime: 'desc',
      },
    });

    bookings = rawBookings.map((b) => {
      const mockTherapist = MOCK_THERAPISTS.find((t) => t.id === b.therapistId);
      const mockService = mockTherapist?.services.find((s) => s.id === b.serviceId);

      const therapistName = b.therapist?.name || mockTherapist?.name || 'Unassigned';
      const serviceName = b.service?.name || mockService?.name || 'Massage Session';

      return {
        id: b.id,
        bookingNumber: b.bookingNumber,
        customerName: b.customer?.name || 'Unknown Customer',
        customerEmail: b.customer?.email || 'N/A',
        therapistId: b.therapistId,
        therapistName,
        serviceName,
        appointmentDateTime: b.appointmentDateTime.toISOString(),
        durationMinutes: b.durationMinutes,
        locationType: b.locationType,
        amount: b.amount,
        status: b.status,
        paymentStatus: b.paymentStatus,
        createdAt: b.createdAt.toISOString(),
      };
    });
  } catch (error) {
    console.error('Error loading bookings in admin:', error);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Bookings Management
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Monitor, assign, update, and manage customer booking lifecycles.
          </p>
        </div>
      </div>

      <BookingList
        bookings={bookings}
        initialSearch={search}
        initialStatus={statusFilter}
        initialDateFilter={dateFilter}
      />
    </div>
  );
}
