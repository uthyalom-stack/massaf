import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateVerificationToken, consumeVerificationToken } from '@/lib/verification-tokens';
import { setTherapistSessionCookie, clearTherapistSessionCookie } from '@/lib/auth-session';

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
      const therapist = await db.therapist.findFirst({
        where: { email: cleanEmail, isActive: true },
      });

      if (!therapist) {
        // Return generic success message to prevent therapist email enumeration
        return NextResponse.json({
          message: 'If a matching active therapist account exists, a login verification token has been generated.',
        });
      }

      const shortLivedToken = generateVerificationToken(therapist.id, 'THERAPIST_LOGIN');

      // Dispatch notification / operational email or log token securely for therapist portal verification
      try {
        const { notifyTherapistLoginToken } = await import('@/lib/notifications');
        await notifyTherapistLoginToken(therapist.id, shortLivedToken);
      } catch (notifErr) {
        console.warn('Notification delivery for therapist token warning:', notifErr);
      }

      return NextResponse.json({
        message: 'Verification token generated and sent to therapist.',
        // Expose token in dev/test mode if needed, or rely on token verification step
        token: process.env.NODE_ENV !== 'production' ? shortLivedToken : undefined,
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

      const therapistId = consumeVerificationToken(String(token), 'THERAPIST_LOGIN');
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
