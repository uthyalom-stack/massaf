import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateVerificationToken, consumeVerificationToken } from '@/lib/verification-tokens';
import { setTherapistSessionCookie, clearTherapistSessionCookie } from '@/lib/auth-session';
import { checkRateLimit } from '@/lib/auth-rate-limit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, token } = body;

    if (action === 'logout') {
      await clearTherapistSessionCookie();
      return NextResponse.json({ message: 'Logged out successfully' });
    }

    // Step 1: Request a short-lived verification token via therapist email
    if (action === 'request_token') {
      if (!email) {
        return NextResponse.json(
          { error: 'Therapist email is required' },
          { status: 400 }
        );
      }

      const cleanEmail = String(email).trim().toLowerCase();

      // Rate limiting: Max 5 token requests per 15 minutes per email/IP
      const clientIp = request.headers.get('x-forwarded-for') || 'anon_ip';
      const rateCheck = await checkRateLimit(`${cleanEmail}:${clientIp}`, 'therapist_request_token', 5, 15);

      if (!rateCheck.allowed) {
        if (rateCheck.error) {
          return NextResponse.json(
            { error: 'Authentication rate limit service temporarily unavailable. Please try again in a few moments.' },
            { status: 503 }
          );
        }
        return NextResponse.json(
          { error: 'Too many verification requests. Please wait 15 minutes before requesting another token.' },
          { status: 429 }
        );
      }

      const therapist = await db.therapist.findFirst({
        where: { email: cleanEmail, isActive: true },
      });

      if (!therapist) {
        // Return generic success message to prevent therapist email enumeration
        return NextResponse.json({
          message: 'If a matching active therapist account exists, a login verification token has been generated.',
        });
      }

      const shortLivedToken = await generateVerificationToken(therapist.id, 'THERAPIST_LOGIN');

      // Dispatch notification / operational email or log token securely for therapist portal verification
      try {
        const { notifyTherapistLoginToken } = await import('@/lib/notifications');
        await notifyTherapistLoginToken(therapist.id, shortLivedToken);
      } catch (notifErr) {
        console.warn('Notification delivery for therapist token warning:', notifErr);
      }

      return NextResponse.json({
        message: 'If a matching active therapist account exists, a verification token has been generated and sent via notification channel.',
      });
    }

    // Step 2: Verify the short-lived single-use token and establish signed HTTP-only therapist session
    if (action === 'verify_token' || (!action && token)) {
      if (!token) {
        return NextResponse.json(
          { error: 'Verification token is required' },
          { status: 400 }
        );
      }

      const therapistId = await consumeVerificationToken(String(token), 'THERAPIST_LOGIN');
      if (!therapistId) {
        return NextResponse.json(
          { error: 'Invalid or expired verification token' },
          { status: 401 }
        );
      }

      const therapist = await db.therapist.findFirst({
        where: { id: therapistId, isActive: true },
      });

      if (!therapist) {
        return NextResponse.json(
          { error: 'Therapist record not found or inactive' },
          { status: 404 }
        );
      }

      await setTherapistSessionCookie(therapist.id, therapist.email || therapist.id);

      return NextResponse.json({
        message: 'Therapist authenticated successfully',
        therapist: {
          id: therapist.id,
          name: therapist.name,
          email: therapist.email,
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid action specified' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Therapist verification error:', error);
    return NextResponse.json(
      { error: 'An error occurred during therapist verification' },
      { status: 500 }
    );
  }
}
