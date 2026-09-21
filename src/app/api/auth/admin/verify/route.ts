import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { setAdminSessionCookie, clearAdminSessionCookie } from '@/lib/auth-session';
import { checkRateLimit } from '@/lib/auth-rate-limit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email } = body;

    if (action === 'logout') {
      await clearAdminSessionCookie();
      return NextResponse.json({ message: 'Logged out successfully' });
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // Rate limiting: Max 5 verification attempts per 15 minutes per email/IP
    const clientIp = request.headers.get('x-forwarded-for') || 'anon_ip';
    const rateCheck = await checkRateLimit(`${cleanEmail}:${clientIp}`, 'admin_verify', 5, 15);

    if (!rateCheck.allowed) {
      if (rateCheck.error) {
        return NextResponse.json(
          { error: 'Authentication rate limit service temporarily unavailable. Please try again in a few moments.' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait 15 minutes before trying again.' },
        { status: 429 }
      );
    }

    // Query User model by email
    const user = await db.user.findUnique({
      where: { email: cleanEmail },
    });

    // Check if user exists and has an allowed administrative role
    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];
    if (!user || !user.role || !allowedRoles.includes(user.role)) {
      // Uniform generic rejection message to prevent user/email enumeration
      return NextResponse.json(
        { error: 'Invalid authentication credentials provided' },
        { status: 401 }
      );
    }

    // Set signed HTTP-only admin session cookie
    await setAdminSessionCookie(user.id, user.email, user.role);

    return NextResponse.json({
      message: 'Admin authenticated successfully',
      redirectUrl: '/admin',
    });
  } catch (error) {
    console.error('Admin verification error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during authentication' },
      { status: 500 }
    );
  }
}
