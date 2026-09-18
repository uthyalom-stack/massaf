'use server';

import { db } from '@/lib/db';
import { cookies } from 'next/headers';

const MARKETING_COOKIE_NAME = 'massaf_marketing_ref';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export async function trackMarketingClickAction(code: string): Promise<{ success: boolean }> {
  if (!code || typeof code !== 'string') {
    return { success: false };
  }

  const cleanCode = code.trim();
  if (!cleanCode) {
    return { success: false };
  }

  try {
    const cookieStore = await cookies();
    const existingRef = cookieStore.get(MARKETING_COOKIE_NAME)?.value;

    // Step 1: If an existing cookie value exists, verify if it corresponds to a VALID ACTIVE marketing link in the database.
    if (existingRef) {
      const existingLink = await db.marketingLink.findUnique({
        where: { code: existingRef },
      });

      // Retain first VALID marketing reference
      if (existingLink && existingLink.isActive) {
        return { success: true };
      }
      // If the existing cookie is stale/invalid/inactive, we proceed below to check the new incoming code!
    }

    // Step 2: Validate the incoming code against active marketing links
    const newMarketingLink = await db.marketingLink.findUnique({
      where: { code: cleanCode },
    });

    if (!newMarketingLink || !newMarketingLink.isActive) {
      return { success: false };
    }

    // Step 3: Incoming code is valid and active -> atomically increment clicks
    await db.marketingLink.update({
      where: { id: newMarketingLink.id },
      data: {
        clicks: {
          increment: 1,
        },
      },
    });

    // Step 4: Set/overwrite cookie with this first valid marketing reference code
    cookieStore.set(MARKETING_COOKIE_NAME, newMarketingLink.code, {
      maxAge: COOKIE_MAX_AGE,
      path: '/',
      httpOnly: false, // allow client presence check
      sameSite: 'lax',
    });

    return { success: true };
  } catch (error) {
    console.error('Error tracking marketing link click:', error);
    return { success: false };
  }
}

export async function getAttributedMarketingLink(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const ref = cookieStore.get(MARKETING_COOKIE_NAME)?.value;
    if (!ref) return null;

    const link = await db.marketingLink.findUnique({
      where: { code: ref },
    });

    if (link && link.isActive) {
      return link.id;
    }
    return null;
  } catch {
    return null;
  }
}
