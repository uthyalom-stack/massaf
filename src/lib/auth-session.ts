import crypto from 'crypto';
import { db } from '@/lib/db';

export interface SessionPayload {
  entityId: string;
  email: string;
  type: 'CUSTOMER' | 'THERAPIST' | 'ADMIN';
  role?: string;
  exp: number; // UNIX timestamp in milliseconds
}

const CUSTOMER_COOKIE_NAME = 'massaf_customer_session';
const THERAPIST_COOKIE_NAME = 'massaf_therapist_session';
const ADMIN_COOKIE_NAME = 'massaf_admin_session';

/**
 * Retrieves Next.js request cookie store with error isolation for non-request environments.
 */
async function getCookieStore() {
  try {
    const { cookies } = await import('next/headers');
    return await cookies();
  } catch {
    return null;
  }
}

/**
 * Retrieves the server-only cryptographic secret for signing session cookies.
 * Throws a closed configuration error if missing in production or dev environment.
 */
function getAuthSecret(): string {
  const secret = process.env.MASSAF_AUTH_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      'SECURITY CONFIGURATION ERROR: MASSAF_AUTH_SECRET environment variable is missing. Private session authentication requires a cryptographically random server secret.'
    );
  }
  return secret.trim();
}

/**
 * Parses a cookie header string to extract a specific cookie value.
 */
function extractCookieValue(cookieHeader: string | undefined, cookieName: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
  return match ? match[1] : undefined;
}

/**
 * Creates an HMAC-SHA256 signature for a string payload using constant-key hashing.
 */
function signPayload(payloadStr: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
}

/**
 * Performs a constant-time comparison of two signature strings to eliminate timing attacks.
 */
function safeCompareSignatures(sigA: string, sigB: string): boolean {
  try {
    const bufA = Buffer.from(sigA, 'hex');
    const bufB = Buffer.from(sigB, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Encodes and signs a session payload into a cookie string token formatted as `base64Payload.signature`.
 */
export function createSessionToken(
  entityId: string,
  email: string,
  type: 'CUSTOMER' | 'THERAPIST' | 'ADMIN',
  durationHours = 24 * 7, // Default 7 days
  role?: string
): string {
  const secret = getAuthSecret();
  const payload: SessionPayload = {
    entityId,
    email: email.toLowerCase().trim(),
    type,
    ...(role ? { role } : {}),
    exp: Date.now() + durationHours * 60 * 60 * 1000,
  };

  const payloadStr = JSON.stringify(payload);
  const base64Payload = Buffer.from(payloadStr, 'utf-8').toString('base64url');
  const signature = signPayload(base64Payload, secret);

  return `${base64Payload}.${signature}`;
}

/**
 * Verifies a token's HMAC-SHA256 signature and expiration timestamp.
 * Returns the parsed payload if valid, or null if invalid or expired.
 */
export function verifySessionToken(
  token: string | undefined | null,
  expectedType: 'CUSTOMER' | 'THERAPIST' | 'ADMIN'
): SessionPayload | null {
  if (!token) return null;

  try {
    const secret = getAuthSecret();
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [base64Payload, signature] = parts;
    const expectedSignature = signPayload(base64Payload, secret);

    if (!safeCompareSignatures(signature, expectedSignature)) {
      return null;
    }

    const payloadJson = Buffer.from(base64Payload, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as SessionPayload;

    if (!payload || typeof payload !== 'object') return null;
    if (payload.type !== expectedType) return null;
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    if (!payload.entityId || typeof payload.entityId !== 'string') return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Server-side helper to read and verify the active customer session from HTTP-only cookie.
 * Revalidates against the database to confirm the Customer entity still exists.
 */
export async function getVerifiedCustomerSession(reqCookieHeader?: string): Promise<SessionPayload | null> {
  try {
    let token = extractCookieValue(reqCookieHeader, CUSTOMER_COOKIE_NAME);
    if (!token) {
      const cookieStore = await getCookieStore();
      token = cookieStore?.get(CUSTOMER_COOKIE_NAME)?.value;
    }

    const payload = verifySessionToken(token, 'CUSTOMER');
    if (!payload) return null;

    // Database revalidation: Confirm customer still exists
    const customer = await db.customer.findUnique({
      where: { id: payload.entityId },
      select: { id: true, email: true },
    });

    if (!customer) return null;

    // Return payload with authoritative email from DB
    return {
      ...payload,
      email: customer.email,
    };
  } catch {
    return null;
  }
}

/**
 * Server-side helper to read and verify the active therapist session from HTTP-only cookie.
 * Revalidates against the database to confirm the Therapist entity exists AND isActive === true.
 */
export async function getVerifiedTherapistSession(reqCookieHeader?: string): Promise<SessionPayload | null> {
  try {
    let token = extractCookieValue(reqCookieHeader, THERAPIST_COOKIE_NAME);
    if (!token) {
      const cookieStore = await getCookieStore();
      token = cookieStore?.get(THERAPIST_COOKIE_NAME)?.value;
    }

    const payload = verifySessionToken(token, 'THERAPIST');
    if (!payload) return null;

    // Database revalidation: Confirm therapist exists and is active
    const therapist = await db.therapist.findFirst({
      where: { id: payload.entityId, isActive: true },
      select: { id: true, email: true },
    });

    if (!therapist) return null;

    // Return payload with authoritative email from DB
    return {
      ...payload,
      email: therapist.email || payload.email,
    };
  } catch {
    return null;
  }
}

/**
 * Server-side helper to read and verify the active admin session from HTTP-only cookie.
 * Revalidates against the database `User` model to confirm the admin user exists and has an administrative Role.
 */
declare global {
  // eslint-disable-next-line no-var
  var __TEST_ADMIN_SESSION_TOKEN__: string | undefined;
}

export async function getVerifiedAdminSession(reqCookieHeader?: string): Promise<SessionPayload | null> {
  try {
    let token = extractCookieValue(reqCookieHeader, ADMIN_COOKIE_NAME);
    if (!token) {
      const cookieStore = await getCookieStore();
      token = cookieStore?.get(ADMIN_COOKIE_NAME)?.value;
      if (!token && process.env.NODE_ENV !== 'production') {
        token = globalThis.__TEST_ADMIN_SESSION_TOKEN__;
      }
    }

    const payload = verifySessionToken(token, 'ADMIN');
    if (!payload) return null;

    // Database revalidation: Confirm Admin User entity exists and has an administrative role
    const adminUser = await db.user.findUnique({
      where: { id: payload.entityId },
      select: { id: true, email: true, role: true },
    });

    if (!adminUser) return null;

    // Strict Authoritative Role Verification (SUPER_ADMIN, ADMIN, STAFF)
    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];
    if (!allowedRoles.includes(String(adminUser.role))) {
      return null;
    }

    return {
      ...payload,
      email: adminUser.email,
      role: adminUser.role,
    };
  } catch {
    return null;
  }
}

/**
 * Sets an HTTP-only, secure, signed session cookie.
 */
export async function setCustomerSessionCookie(
  entityId: string,
  email: string
): Promise<void> {
  const token = createSessionToken(entityId, email, 'CUSTOMER');
  const cookieStore = await getCookieStore();
  if (cookieStore) {
    cookieStore.set(CUSTOMER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });
  }
}

/**
 * Sets an HTTP-only, secure, signed therapist session cookie.
 */
export async function setTherapistSessionCookie(
  entityId: string,
  email: string
): Promise<void> {
  const token = createSessionToken(entityId, email, 'THERAPIST');
  const cookieStore = await getCookieStore();
  if (cookieStore) {
    cookieStore.set(THERAPIST_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });
  }
}

/**
 * Sets an HTTP-only, secure, signed admin session cookie.
 */
export async function setAdminSessionCookie(
  entityId: string,
  email: string,
  role = 'SUPER_ADMIN'
): Promise<void> {
  const token = createSessionToken(entityId, email, 'ADMIN', 24 * 7, role);
  const cookieStore = await getCookieStore();
  if (cookieStore) {
    cookieStore.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });
  }
}

/**
 * Clears the customer session cookie.
 */
export async function clearCustomerSessionCookie(): Promise<void> {
  const cookieStore = await getCookieStore();
  if (cookieStore) {
    cookieStore.delete(CUSTOMER_COOKIE_NAME);
  }
}

/**
 * Clears the therapist session cookie.
 */
export async function clearTherapistSessionCookie(): Promise<void> {
  const cookieStore = await getCookieStore();
  if (cookieStore) {
    cookieStore.delete(THERAPIST_COOKIE_NAME);
  }
}

/**
 * Clears the admin session cookie.
 */
export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await getCookieStore();
  if (cookieStore) {
    cookieStore.delete(ADMIN_COOKIE_NAME);
  }
}
