import { db } from '@/lib/db';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Enforces persistent database-backed rate limiting for authentication endpoints.
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
    const existing = await db.authRateLimit.findUnique({
      where: {
        identifier_action: {
          identifier: cleanId,
          action: cleanAction,
        },
      },
    });

    if (!existing) {
      await db.authRateLimit.create({
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

    // If window expired, reset attempts counter
    if (elapsed > windowMs) {
      await db.authRateLimit.update({
        where: { id: existing.id },
        data: {
          attempts: 1,
          windowStart: now,
        },
      });
      return { allowed: true, remaining: maxAttempts - 1 };
    }

    // If limit exceeded, deny
    if (existing.attempts >= maxAttempts) {
      return { allowed: false, remaining: 0 };
    }

    // Increment attempt count
    const updated = await db.authRateLimit.update({
      where: { id: existing.id },
      data: {
        attempts: existing.attempts + 1,
      },
    });

    return {
      allowed: true,
      remaining: Math.max(0, maxAttempts - updated.attempts),
    };
  } catch (error) {
    console.error('Rate limit error:', error);
    // On DB rate limit error, fail safe (allow request to prevent blocking valid users during DB transient glitch)
    return { allowed: true, remaining: 1 };
  }
}
