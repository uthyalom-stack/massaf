import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { setAdminSessionCookie, clearAdminSessionCookie, getVerifiedAdminSession } from '@/lib/auth-session';
import { checkRateLimit } from '@/lib/auth-rate-limit';

export async function GET() {
  try {
    const session = await getVerifiedAdminSession();
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    return NextResponse.json({
      authenticated: true,
      admin: {
        id: session.entityId,
        email: session.email,
        role: session.role,
      },
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, adminKey } = body;

    if (action === 'logout') {
      await clearAdminSessionCookie();
      return NextResponse.json({ message: 'Admin logged out successfully' });
    }

    if (!adminKey || typeof adminKey !== 'string' || adminKey.trim().length === 0) {
      return NextResponse.json(
        { error: 'Admin key is required' },
        { status: 400 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for') || 'anon_ip';
    const rateCheck = await checkRateLimit(`admin_login:${clientIp}`, 'admin_login', 5, 15);

    if (!rateCheck.allowed) {
      if (rateCheck.error) {
        return NextResponse.json(
          { error: 'Authentication service temporarily unavailable. Please try again shortly.' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: 'Too many failed login attempts. Please wait 15 minutes.' },
        { status: 429 }
      );
    }

    const expectedKey = process.env.MASSAF_ADMIN_API_KEY;

    if (!expectedKey) {
      console.error('[SECURITY ERROR] MASSAF_ADMIN_API_KEY is not configured in server environment.');
      return NextResponse.json(
        { error: 'Server authorization configuration error.' },
        { status: 500 }
      );
    }

    const suppliedBuf = Buffer.from(adminKey.trim());
    const expectedBuf = Buffer.from(expectedKey.trim());

    const isValidKey =
      suppliedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(suppliedBuf, expectedBuf);

    if (!isValidKey) {
      return NextResponse.json(
        { error: 'Invalid administrative key provided' },
        { status: 401 }
      );
    }

    // Find or create default admin user in DB for session identity binding
    const adminEmail = 'admin@massaf.com';
    let adminUser = await db.user.findUnique({
      where: { email: adminEmail },
    });

    if (!adminUser) {
      adminUser = await db.user.create({
        data: {
          email: adminEmail,
          name: 'System Administrator',
          role: 'SUPER_ADMIN',
        },
      });
    }

    // Verify role is administrative
    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];
    if (!allowedRoles.includes(String(adminUser.role))) {
      return NextResponse.json(
        { error: 'User does not possess administrative role permissions' },
        { status: 403 }
      );
    }

    await setAdminSessionCookie(adminUser.id, adminUser.email, adminUser.role);

    return NextResponse.json({
      message: 'Admin session established successfully',
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
      },
    });
  } catch (error) {
    console.error('Admin authentication error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during admin authentication' },
      { status: 500 }
    );
  }
}
