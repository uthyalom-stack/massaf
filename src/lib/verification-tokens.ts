import crypto from 'crypto';
import { db } from '@/lib/db';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a cryptographically random short-lived token bound to an entity ID and stores its SHA-256 hash in the database.
 * Token expires in 15 minutes by default.
 */
export async function generateVerificationToken(
  entityId: string,
  tokenType: 'THERAPIST_LOGIN' | 'CUSTOMER_LOGIN',
  expirationMinutes = 15
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

  // Store token hash in database
  await db.verificationToken.create({
    data: {
      tokenHash,
      entityId,
      tokenType,
      expiresAt,
    },
  });

  return rawToken;
}

/**
 * Atomically consumes and invalidates a short-lived single-use verification token.
 * Uses conditional database update (`consumedAt: null` AND `expiresAt > now`) to prevent race conditions.
 * Returns the bound entity ID if successfully consumed; returns null if invalid, expired, or already consumed.
 */
export async function consumeVerificationToken(
  rawToken: string,
  expectedType: 'THERAPIST_LOGIN' | 'CUSTOMER_LOGIN'
): Promise<string | null> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    return null;
  }

  const tokenHash = hashToken(rawToken.trim());
  const now = new Date();

  // Find token record
  const tokenRecord = await db.verificationToken.findUnique({
    where: { tokenHash },
  });

  if (!tokenRecord) return null;
  if (tokenRecord.tokenType !== expectedType) return null;
  if (tokenRecord.consumedAt !== null) return null;
  if (tokenRecord.expiresAt.getTime() <= now.getTime()) return null;

  // Atomic consumption: update consumedAt ONLY if consumedAt is still null and not expired
  const updateResult = await db.verificationToken.updateMany({
    where: {
      id: tokenRecord.id,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      consumedAt: now,
    },
  });

  // If update count is 1, this request successfully and atomically consumed the token
  if (updateResult.count === 1) {
    return tokenRecord.entityId;
  }

  return null;
}
