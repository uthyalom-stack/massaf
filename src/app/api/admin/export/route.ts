import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function buildCsvResponse(filename: string, headerRow: string[], dataRows: string[][]): NextResponse {
  const lines = [headerRow.map(escapeCsvField).join(',')];
  for (const row of dataRows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  const csvContent = lines.join('\r\n');

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getVerifiedAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Admin session required' }, { status: 401 });
    }

    if (session.role === 'STAFF') {
      return NextResponse.json({ error: 'Forbidden: Insufficient privileges' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const exportType = (searchParams.get('type') || 'bookings').toLowerCase();
    const statusParam = searchParams.get('status') || 'ALL';
    const searchParam = (searchParams.get('search') || '').trim();

    const timestampYmd = new Date().toISOString().split('T')[0];

    // 1. EXPORT BOOKINGS
    if (exportType === 'bookings') {
      const whereClause: {
        status?: any;
        OR?: Array<
          | { bookingNumber?: { contains: string } }
          | { customer?: { name?: { contains: string } } }
          | { customer?: { email?: { contains: string } } }
        >;
      } = {};

      if (statusParam !== 'ALL') {
        whereClause.status = statusParam as any;
      }

      if (searchParam) {
        whereClause.OR = [
          { bookingNumber: { contains: searchParam } },
          { customer: { name: { contains: searchParam } } },
          { customer: { email: { contains: searchParam } } },
        ];
      }

      const bookings = await db.booking.findMany({
        where: whereClause,
        include: {
          customer: { select: { name: true, email: true, phone: true } },
          therapist: { select: { name: true } },
          service: { select: { name: true, durationMinutes: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const headers = [
        'Booking Reference',
        'Date & Time (UTC)',
        'Customer Name',
        'Customer Email',
        'Customer Phone',
        'Service Name',
        'Duration (mins)',
        'Therapist Assigned',
        'Location Type',
        'Amount ($)',
        'Booking Status',
        'Payment Status',
        'Created At',
      ];

      const rows = bookings.map((b) => [
        b.bookingNumber,
        b.appointmentDateTime.toISOString(),
        b.customer?.name || '',
        b.customer?.email || '',
        b.customer?.phone || '',
        b.service?.name || '',
        b.durationMinutes.toString(),
        b.therapist?.name || 'Unassigned',
        b.locationType,
        b.amount.toFixed(2),
        b.status,
        b.paymentStatus,
        b.createdAt.toISOString(),
      ]);

      return buildCsvResponse(`massaf_bookings_${timestampYmd}.csv`, headers, rows);
    }

    // 2. EXPORT CUSTOMERS
    if (exportType === 'customers') {
      const whereClause: {
        OR?: Array<
          | { name?: { contains: string } }
          | { email?: { contains: string } }
          | { phone?: { contains: string } }
        >;
      } = {};

      if (searchParam) {
        whereClause.OR = [
          { name: { contains: searchParam } },
          { email: { contains: searchParam } },
          { phone: { contains: searchParam } },
        ];
      }

      const customers = await db.customer.findMany({
        where: whereClause,
        include: {
          _count: { select: { bookings: true, reviews: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const headers = [
        'Customer ID',
        'Full Name',
        'Email Address',
        'Phone Number',
        'Account Active',
        'Total Bookings',
        'Submitted Reviews',
        'Created At',
      ];

      const rows = customers.map((c) => [
        c.id,
        c.name,
        c.email,
        c.phone,
        c.isActive ? 'Active' : 'Disabled',
        c._count.bookings.toString(),
        c._count.reviews.toString(),
        c.createdAt.toISOString(),
      ]);

      return buildCsvResponse(`massaf_customers_${timestampYmd}.csv`, headers, rows);
    }

    // 3. EXPORT THERAPISTS
    if (exportType === 'therapists') {
      const whereClause: {
        isActive?: boolean;
        OR?: Array<
          | { name?: { contains: string } }
          | { email?: { contains: string } }
          | { phone?: { contains: string } }
        >;
      } = {};

      if (statusParam === 'ACTIVE') whereClause.isActive = true;
      if (statusParam === 'INACTIVE') whereClause.isActive = false;

      if (searchParam) {
        whereClause.OR = [
          { name: { contains: searchParam } },
          { email: { contains: searchParam } },
          { phone: { contains: searchParam } },
        ];
      }

      const therapists = await db.therapist.findMany({
        where: whereClause,
        include: {
          _count: { select: { services: true, zipEligibility: true, bookings: true } },
        },
        orderBy: { name: 'asc' },
      });

      const headers = [
        'Therapist ID',
        'Full Name',
        'Email',
        'Phone',
        'Hourly Rate ($)',
        'Active State',
        'Verification Status',
        'Offers Studio',
        'Offers In-Home',
        'Rating',
        'Review Count',
        'Assigned Services',
        'ZIP Rules',
        'Total Bookings',
        'Created At',
      ];

      const rows = therapists.map((t) => [
        t.id,
        t.name,
        t.email || '',
        t.phone || '',
        t.hourlyRate.toFixed(2),
        t.isActive ? 'Active' : 'Inactive',
        t.verificationStatus,
        t.offersStudio ? 'Yes' : 'No',
        t.offersInHome ? 'Yes' : 'No',
        t.rating.toFixed(1),
        t.reviewCount.toString(),
        t._count.services.toString(),
        t._count.zipEligibility.toString(),
        t._count.bookings.toString(),
        t.createdAt.toISOString(),
      ]);

      return buildCsvResponse(`massaf_therapists_${timestampYmd}.csv`, headers, rows);
    }

    // 4. EXPORT PAYMENTS
    if (exportType === 'payments') {
      const whereClause: {
        paymentStatus?: any;
        OR?: Array<
          | { bookingNumber?: { contains: string } }
          | { customer?: { name?: { contains: string } } }
          | { paymentReference?: { contains: string } }
        >;
      } = {};

      if (statusParam !== 'ALL') whereClause.paymentStatus = statusParam as any;

      if (searchParam) {
        whereClause.OR = [
          { bookingNumber: { contains: searchParam } },
          { customer: { name: { contains: searchParam } } },
          { paymentReference: { contains: searchParam } },
        ];
      }

      const bookings = await db.booking.findMany({
        where: whereClause,
        include: {
          customer: { select: { name: true, email: true } },
          service: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const headers = [
        'Booking Reference',
        'Customer Name',
        'Customer Email',
        'Service',
        'Amount ($)',
        'Payment Status',
        'Payment Method',
        'Payment Reference',
        'Created At',
      ];

      const rows = bookings.map((b) => [
        b.bookingNumber,
        b.customer?.name || '',
        b.customer?.email || '',
        b.service?.name || '',
        b.amount.toFixed(2),
        b.paymentStatus,
        b.paymentMethod || 'OTHER',
        b.paymentReference || '',
        b.createdAt.toISOString(),
      ]);

      return buildCsvResponse(`massaf_payments_${timestampYmd}.csv`, headers, rows);
    }

    // 5. EXPORT MARKETING
    if (exportType === 'marketing') {
      const links = await db.marketingLink.findMany({
        include: {
          user: { select: { name: true, email: true } },
          bookings: { select: { amount: true, paymentStatus: true } },
        },
        orderBy: { clicks: 'desc' },
      });

      const headers = [
        'Link ID',
        'Link Name',
        'Tracking Code',
        'Marketer Name',
        'Marketer Email',
        'Active',
        'Clicks',
        'Total Bookings',
        'Paid Bookings',
        'Paid Revenue ($)',
        'Created At',
      ];

      const rows = links.map((l) => {
        const paidList = l.bookings.filter((b) => b.paymentStatus === 'PAID');
        const paidRevenue = paidList.reduce((sum, b) => sum + b.amount, 0);

        return [
          l.id,
          l.name,
          l.code,
          l.user?.name || 'Unassigned',
          l.user?.email || '',
          l.isActive ? 'Active' : 'Inactive',
          l.clicks.toString(),
          l.bookings.length.toString(),
          paidList.length.toString(),
          paidRevenue.toFixed(2),
          l.createdAt.toISOString(),
        ];
      });

      return buildCsvResponse(`massaf_marketing_${timestampYmd}.csv`, headers, rows);
    }

    return NextResponse.json({ error: 'Invalid export type requested' }, { status: 400 });
  } catch (err: unknown) {
    console.error('Error handling CSV export API:', err);
    return NextResponse.json({ error: 'Failed to generate CSV export file' }, { status: 500 });
  }
}
