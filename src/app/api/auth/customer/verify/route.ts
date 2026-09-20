import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { setCustomerSessionCookie, clearCustomerSessionCookie } from '@/lib/auth-session';
import { checkRateLimit } from '@/lib/auth-rate-limit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, bookingNumber } = body;

    if (action === 'logout') {
      await clearCustomerSessionCookie();
      return NextResponse.json({ message: 'Logged out successfully' });
    }

    if (!email || !bookingNumber) {
      return NextResponse.json(
        { error: 'Email and Booking Reference Number are required' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanBookingNumber = String(bookingNumber).trim().toUpperCase();

    // Rate limiting: Max 5 verification attempts per 15 minutes per email/IP
    const clientIp = request.headers.get('x-forwarded-for') || 'anon_ip';
    const rateCheck = await checkRateLimit(`${cleanEmail}:${clientIp}`, 'customer_verify', 5, 15);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait 15 minutes before trying again.' },
        { status: 429 }
      );
    }

    // Query customer by email
    const customer = await db.customer.findUnique({
      where: { email: cleanEmail },
      include: {
        bookings: {
          where: { bookingNumber: cleanBookingNumber },
        },
      },
    });

    // Uniform generic rejection message to prevent user/booking enumeration
    if (!customer || customer.bookings.length === 0) {
      return NextResponse.json(
        { error: 'Invalid email or booking reference provided' },
        { status: 401 }
      );
    }

    // Set signed HTTP-only customer session cookie
    await setCustomerSessionCookie(customer.id, customer.email);

    return NextResponse.json({
      message: 'Customer verified successfully',
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
      },
    });
  } catch (error) {
    console.error('Customer verification error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during verification' },
      { status: 500 }
    );
  }
}
