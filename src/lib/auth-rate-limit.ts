import { db } from '@/lib/db';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  error?: boolean;
}

/**
 * Enforces persistent, atomic database-backed rate limiting for authentication endpoints.
 * FAILS CLOSED (`allowed: false`, `error: true`) if a database error occurs or if window limit is exceeded.
 *
 * Uses SQL-level conditional atomic updates (`UPDATE ... WHERE attempts < maxAttempts`)
 * and P2002 unique constraint handling to guarantee that concurrent requests can never exceed
 * the configured `maxAttempts` limit.
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
  const windowMs = windowMinutes * 60 * 1000;

  try {
    const now = new Date();

    // 1. Fetch existing record
    let record = await db.authRateLimit.findUnique({
      where: {
        identifier_action: {
          identifier: cleanId,
          action: cleanAction,
        },
      },
    });

    // 2. First-Request Row Creation with P2002 race handling
    if (!record) {
      try {
        await db.authRateLimit.create({
          data: {
            identifier: cleanId,
            action: cleanAction,
            attempts: 1,
            windowStart: now,
          },
        });
        return { allowed: true, remaining: maxAttempts - 1 };
      } catch (createErr: unknown) {
        // P2002: Unique constraint error when a concurrent request created the row first
        const isP2002 =
          typeof createErr === 'object' &&
          createErr !== null &&
          'code' in createErr &&
          (createErr as { code: string }).code === 'P2002';

        if (isP2002) {
          record = await db.authRateLimit.findUnique({
            where: {
              identifier_action: {
                identifier: cleanId,
                action: cleanAction,
              },
            },
          });
        } else {
          throw createErr;
        }
      }
    }

    if (!record) {
      return { allowed: false, remaining: 0, error: true };
    }

    // 3. Evaluate window expiration
    const elapsed = now.getTime() - record.windowStart.getTime();

    if (elapsed > windowMs) {
      // Window expired: Attempt atomic reset conditioned on exact old windowStart
      const resetRes = await db.authRateLimit.updateMany({
        where: {
          id: record.id,
          windowStart: record.windowStart,
        },
        data: {
          attempts: 1,
          windowStart: now,
        },
      });

      if (resetRes.count === 1) {
        return { allowed: true, remaining: maxAttempts - 1 };
      }

      // Reset race lost: re-fetch updated row created by winner
      const reFetched = await db.authRateLimit.findUnique({
        where: { id: record.id },
      });
      if (!reFetched) return { allowed: false, remaining: 0, error: true };
      record = reFetched;
    }

    // 4. Atomic SQL Conditional Increment
    // Update succeeds only if `attempts < maxAttempts` at the database level
    const updateRes = await db.authRateLimit.updateMany({
      where: {
        id: record.id,
        windowStart: record.windowStart,
        attempts: { lt: maxAttempts },
      },
      data: {
        attempts: { increment: 1 },
      },
    });

    if (updateRes.count === 1) {
      const updatedRecord = await db.authRateLimit.findUnique({
        where: { id: record.id },
      });
      const currentAttempts = updatedRecord?.attempts ?? record.attempts + 1;
      return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - currentAttempts),
      };
    }

    // count === 0 indicates attempts was already >= maxAttempts in DB
    return { allowed: false, remaining: 0 };
  } catch (error) {
    console.error('[FAIL CLOSED] Auth rate limit error:', error);
    return { allowed: false, remaining: 0, error: true };
  }
}
