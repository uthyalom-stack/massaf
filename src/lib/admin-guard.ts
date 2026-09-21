import crypto from 'crypto';
import { getVerifiedAdminSession } from '@/lib/auth-session';

/**
 * Admin Guard for API Routes & Server Actions.
 * Validates either:
 * 1. An active, cryptographically signed admin session cookie (`massaf_admin_session`), or
 * 2. A valid administrative API key supplied in `x-admin-api-key` or `Authorization: Bearer <key>`.
 */
export async function verifyAdminApiKey(request?: Request): Promise<Response | null> {
  // 1. First check active signed admin session cookie if cookies or request headers are available
  try {
    const cookieHeader = request ? request.headers.get('cookie') || undefined : undefined;
    const adminSession = await getVerifiedAdminSession(cookieHeader);
    if (adminSession) {
      return null; // Authorization successful via session cookie
    }
  } catch {
    // Continue to check API key headers if cookie check is inapplicable or fails
  }

  // 2. Fall back to header / bearer API key check if request object is provided
  if (!request) {
    return Response.json(
      { success: false, error: 'Unauthorized: Valid administrator authentication required.' },
      { status: 401 }
    );
  }

  const expectedKey = process.env.MASSAF_ADMIN_API_KEY;

  if (!expectedKey) {
    console.error('Server configuration error: MASSAF_ADMIN_API_KEY is not configured in environment variables.');
    return Response.json(
      {
        success: false,
        error: 'Server misconfiguration: Administrative API key is not configured.',
      },
      { status: 500 }
    );
  }

  const providedHeaderKey = request.headers.get('x-admin-api-key');
  const authHeader = request.headers.get('authorization');
  let providedBearerKey = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedBearerKey = authHeader.substring(7).trim();
  }

  const providedKey = providedHeaderKey || providedBearerKey;

  if (!providedKey) {
    return Response.json(
      {
        success: false,
        error: 'Unauthorized: Missing required admin authentication (session cookie or x-admin-api-key / Bearer token).',
      },
      { status: 401 }
    );
  }

  // Constant-time string comparison to prevent timing side-channel attacks
  const keyBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(expectedKey);

  if (
    keyBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(keyBuffer, expectedBuffer)
  ) {
    return Response.json(
      {
        success: false,
        error: 'Unauthorized: Invalid admin API key.',
      },
      { status: 401 }
    );
  }

  return null; // Authorization successful
}
