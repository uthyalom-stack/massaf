import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedCustomerSession, getVerifiedAdminSession } from '@/lib/auth-session';
import { createAdminNotification } from '@/lib/admin-notifications';

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || undefined;
    const customerSession = await getVerifiedCustomerSession(cookieHeader);

    const body = await request.json();
    const { category, subject, message, bookingReference, name, email } = body;

    if (!category || !subject || !message) {
      return NextResponse.json(
        { error: 'Category, subject, and message fields are required' },
        { status: 400 }
      );
    }

    let customerId: string | null = null;
    let submitterName = name ? String(name).trim() : '';
    let submitterEmail = email ? String(email).trim() : '';

    if (customerSession) {
      customerId = customerSession.entityId;
      const customer = await db.customer.findUnique({
        where: { id: customerSession.entityId },
      });
      if (customer) {
        if (!submitterName) submitterName = customer.name;
        if (!submitterEmail) submitterEmail = customer.email;
      }
    }

    if (!submitterEmail || !submitterEmail.includes('@')) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 }
      );
    }

    if (!submitterName) {
      submitterName = 'Valued Customer';
    }

    let verifiedBookingNumber: string | null = null;

    // Strict Booking Reference Ownership Check
    if (bookingReference && String(bookingReference).trim().length > 0) {
      const trimmedRef = String(bookingReference).trim();
      const booking = await db.booking.findFirst({
        where: {
          OR: [{ bookingNumber: trimmedRef }, { id: trimmedRef }],
        },
        include: { customer: true },
      });

      if (!booking) {
        return NextResponse.json(
          { error: 'Invalid booking reference provided' },
          { status: 400 }
        );
      }

      // Verify customer ownership server-side
      const isOwnerCustomer = Boolean(customerSession && booking.customerId === customerSession.entityId);
      const isOwnerGuest = Boolean(!customerSession && booking.customer?.email?.toLowerCase() === submitterEmail.toLowerCase());

      if (!isOwnerCustomer && !isOwnerGuest) {
        return NextResponse.json(
          { error: 'Invalid booking reference provided' },
          { status: 400 }
        );
      }

      verifiedBookingNumber = booking.bookingNumber;
      if (!customerId && booking.customerId) {
        customerId = booking.customerId;
      }
    }

    const supportRequest = await db.supportRequest.create({
      data: {
        customerId,
        name: submitterName,
        email: submitterEmail,
        category: String(category).trim(),
        subject: String(subject).trim(),
        message: String(message).trim(),
        bookingReference: verifiedBookingNumber,
        status: 'PENDING',
      },
    });

    // Create Admin Notification
    try {
      await createAdminNotification({
        type: 'SUPPORT_REQUEST_SUBMITTED',
        title: `Support Request: ${supportRequest.subject.substring(0, 40)}`,
        message: `New support ticket from ${submitterName} (${submitterEmail}) under ${supportRequest.category}.`,
        link: '/admin/support',
      });
    } catch (notifErr) {
      console.warn('[AdminNotif] Error creating notification for support request:', notifErr);
    }

    return NextResponse.json(
      {
        message: 'Your support request has been submitted successfully. Our team will review and respond shortly.',
        supportRequest: {
          id: supportRequest.id,
          category: supportRequest.category,
          subject: supportRequest.subject,
          status: supportRequest.status,
          createdAt: supportRequest.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating support request:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while submitting your support request' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || undefined;
    const adminSession = await getVerifiedAdminSession(cookieHeader);
    const customerSession = await getVerifiedCustomerSession(cookieHeader);

    if (adminSession) {
      const requests = await db.supportRequest.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ supportRequests: requests });
    }

    if (customerSession) {
      const requests = await db.supportRequest.findMany({
        where: { customerId: customerSession.entityId },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ supportRequests: requests });
    }

    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Error fetching support requests:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve support requests' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || undefined;
    const adminSession = await getVerifiedAdminSession(cookieHeader);

    if (!adminSession) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin authorization required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: 'Support request ID and status parameter are required' },
        { status: 400 }
      );
    }

    const updated = await db.supportRequest.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ supportRequest: updated });
  } catch (error) {
    console.error('Error updating support request status:', error);
    return NextResponse.json(
      { error: 'Failed to update support request' },
      { status: 500 }
    );
  }
}
