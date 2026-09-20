import crypto from 'crypto';

interface VerificationToken {
  token: string;
  entityId: string;
  type: 'THERAPIST_LOGIN' | 'CUSTOMER_LOGIN';
  expiresAt: number;
}

// In-memory single-use token registry (cleans up expired entries periodically)
const tokenStore = new Map<string, VerificationToken>();

/**
 * Generates a cryptographically random short-lived token bound to an entity ID.
 * Token expires in 15 minutes.
 */
export function generateVerificationToken(
  entityId: string,
  type: 'THERAPIST_LOGIN' | 'CUSTOMER_LOGIN',
  expirationMinutes = 15
): string {
  // Clean up stale tokens
  const now = Date.now();
  for (const [key, val] of tokenStore.entries()) {
    if (val.expiresAt < now) {
      tokenStore.delete(key);
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + expirationMinutes * 60 * 1000;

  tokenStore.set(token, {
    token,
    entityId,
    type,
    expiresAt,
  });

  return token;
}

/**
 * Consumes and invalidates a short-lived single-use verification token.
 * Returns the bound entity ID if valid and not expired; returns null otherwise.
 */
export function consumeVerificationToken(
  token: string,
  type: 'THERAPIST_LOGIN' | 'CUSTOMER_LOGIN'
): string | null {
  if (!token || typeof token !== 'string') return null;

  const entry = tokenStore.get(token);
  if (!entry) return null;

  // Single-use guarantee: immediately delete token regardless of outcome
  tokenStore.delete(token);

  if (entry.type !== type) return null;
  if (Date.now() > entry.expiresAt) return null;

  return entry.entityId;
}
