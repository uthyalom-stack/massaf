import { db } from '@/lib/db';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  error?: boolean;
}

/**
 * Enforces persistent, atomic database-backed rate limiting for authentication endpoints.
 * FAILS CLOSED (`allowed: false`, `error: true`) if a database error occurs or if window limit is exceeded.
 * Uses atomic transaction conditional logic to eliminate race conditions under concurrent requests.
 *
 * @param identifier IP or user identifier string
 * @param action Specific authentication action (e.g., 'customer_verify' or 'therapist_token_request')
 * @param maxAttempts Maximum permitted attempts within window (default 5)
 * @param windowMinutes Duration of rate limit window in minutes (default 15)
 */
export async function checkRateLimit(
  identifier: string,
  action: string,
  maxAttempts = 5,
  windowMinutes = 15
): Promise<RateLimitResult> {
  const cleanId = String(identifier).trim().toLowerCase();
  const cleanAction = String(action).trim().toLowerCase();
  const now = new Date();
  const windowMs = windowMinutes * 60 * 1000;

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.authRateLimit.findUnique({
        where: {
          identifier_action: {
            identifier: cleanId,
            action: cleanAction,
          },
        },
      });

      if (!existing) {
        await tx.authRateLimit.create({
          data: {
            identifier: cleanId,
            action: cleanAction,
            attempts: 1,
            windowStart: now,
          },
        });
        return { allowed: true, remaining: maxAttempts - 1 };
      }

      const elapsed = now.getTime() - existing.windowStart.getTime();

      // If current window expired, atomically reset window start and attempts count
      if (elapsed > windowMs) {
        await tx.authRateLimit.update({
          where: { id: existing.id },
          data: {
            attempts: 1,
            windowStart: now,
          },
        });
        return { allowed: true, remaining: maxAttempts - 1 };
      }

      // If attempts already reached or exceeded max, reject immediately
      if (existing.attempts >= maxAttempts) {
        return { allowed: false, remaining: 0 };
      }

      // Atomic conditional update: increment attempts
      const updated = await tx.authRateLimit.update({
        where: { id: existing.id },
        data: {
          attempts: { increment: 1 },
        },
      });

      // Confirm incremented attempt count does not exceed max limit
      if (updated.attempts > maxAttempts) {
        return { allowed: false, remaining: 0 };
      }

      return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - updated.attempts),
      };
    });
  } catch (error) {
    console.error('[FAIL CLOSED] Auth rate limit database error:', error);
    // FAIL CLOSED: Never allow un-rate-limited access during database or transient failures
    return { allowed: false, remaining: 0, error: true };
  }
}
