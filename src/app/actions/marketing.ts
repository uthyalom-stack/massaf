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

    // If a valid marketing cookie is already set, retain first valid reference
    if (existingRef) {
      return { success: true };
    }

    // Look up active marketing link
    const marketingLink = await db.marketingLink.findUnique({
      where: { code: cleanCode },
    });

    if (!marketingLink || !marketingLink.isActive) {
      return { success: false };
    }

    // Atomically increment clicks counter
    await db.marketingLink.update({
      where: { id: marketingLink.id },
      data: {
        clicks: {
          increment: 1,
        },
      },
    });

    // Set first-party tracking cookie
    cookieStore.set(MARKETING_COOKIE_NAME, marketingLink.code, {
      maxAge: COOKIE_MAX_AGE,
      path: '/',
      httpOnly: false, // allow client-side presence check to avoid extra server calls
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
