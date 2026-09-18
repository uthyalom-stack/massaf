import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Temporary Admin Guard for Phase 7 Admin Mutation API Routes.
 * Note: Full authentication & authorization layer (OAuth/Auth.js/RBAC) is intentionally
 * deferred to a future phase. This guard relies on a server-side environment variable key
 * (`MASSAF_ADMIN_API_KEY`) to prevent unauthorized public access to mutation endpoints.
 */
export function verifyAdminApiKey(request: Request): NextResponse | null {
  const expectedKey = process.env.MASSAF_ADMIN_API_KEY;

  if (!expectedKey) {
    console.error('Server configuration error: MASSAF_ADMIN_API_KEY is not configured in environment variables.');
    return NextResponse.json(
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
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized: Missing required admin API key header (x-admin-api-key or Authorization Bearer token).',
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
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized: Invalid admin API key.',
      },
      { status: 401 }
    );
  }

  return null; // Authorization successful
}
