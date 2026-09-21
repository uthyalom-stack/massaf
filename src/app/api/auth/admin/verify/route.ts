import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { setAdminSessionCookie, clearAdminSessionCookie } from '@/lib/auth-session';
import { checkRateLimit } from '@/lib/auth-rate-limit';

function credentialsMatch(input: string, configured: string): boolean {
  const inputHash = crypto.createHash('sha256').update(input).digest();
  const configuredHash = crypto.createHash('sha256').update(configured).digest();
  return crypto.timingSafeEqual(inputHash, configuredHash);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, password } = body;

    if (action === 'logout') {
      await clearAdminSessionCookie();
      return NextResponse.json({ message: 'Logged out successfully' });
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 });
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const configuredPassword = process.env.ADMIN_PASSWORD;

    if (!configuredEmail || !configuredPassword) {
      console.error('Admin authentication is not configured: ADMIN_EMAIL and ADMIN_PASSWORD are required.');
      return NextResponse.json(
        { error: 'Admin authentication is temporarily unavailable' },
        { status: 503 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const clientIp = request.headers.get('x-forwarded-for') || 'anon_ip';
    const rateCheck = await checkRateLimit(cleanEmail + ':' + clientIp, 'admin_verify', 5, 15);

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

    if (cleanEmail !== configuredEmail || !credentialsMatch(password, configuredPassword)) {
      return NextResponse.json(
        { error: 'Invalid authentication credentials provided' },
        { status: 401 }
      );
    }

    await setAdminSessionCookie('env-admin', configuredEmail, 'SUPER_ADMIN');

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
