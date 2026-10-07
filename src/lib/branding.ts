import { db } from '@/lib/db';

export interface BrandingSettings {
  logoUrl: string | null;
  siteName: string;
  tagline: string;
  updatedAt: string | null;
}

export const DEFAULT_BRANDING_SETTINGS: BrandingSettings = {
  logoUrl: null,
  siteName: 'MASSAF',
  tagline: 'Wellness & Therapy',
  updatedAt: null,
};

export const BRANDING_SITE_CONTENT_KEY = 'branding_settings';

/**
 * Retrieves the currently configured system branding settings from SiteContent.
 * Returns DEFAULT_BRANDING_SETTINGS if no custom branding has been configured yet.
 */
export async function getBrandingSettings(): Promise<BrandingSettings> {
  try {
    const row = await db.siteContent.findUnique({
      where: { key: BRANDING_SITE_CONTENT_KEY },
      select: { content: true, updatedAt: true },
    });

    if (!row || !row.content) {
      return DEFAULT_BRANDING_SETTINGS;
    }

    const parsed = JSON.parse(row.content);
    return {
      logoUrl: typeof parsed.logoUrl === 'string' && parsed.logoUrl.trim().length > 0 ? parsed.logoUrl.trim() : null,
      siteName: typeof parsed.siteName === 'string' && parsed.siteName.trim().length > 0 ? parsed.siteName.trim() : DEFAULT_BRANDING_SETTINGS.siteName,
      tagline: typeof parsed.tagline === 'string' && parsed.tagline.trim().length > 0 ? parsed.tagline.trim() : DEFAULT_BRANDING_SETTINGS.tagline,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  } catch (err) {
    console.error('Error loading branding settings from database:', err);
    return DEFAULT_BRANDING_SETTINGS;
  }
}

/**
 * Persists updated system branding settings into SiteContent.
 */
export async function saveBrandingSettings(settings: Partial<BrandingSettings>): Promise<BrandingSettings> {
  const current = await getBrandingSettings();

  const updated: BrandingSettings = {
    logoUrl: settings.logoUrl !== undefined ? settings.logoUrl : current.logoUrl,
    siteName: settings.siteName !== undefined && settings.siteName.trim().length > 0 ? settings.siteName.trim() : current.siteName,
    tagline: settings.tagline !== undefined && settings.tagline.trim().length > 0 ? settings.tagline.trim() : current.tagline,
    updatedAt: new Date().toISOString(),
  };

  await db.siteContent.upsert({
    where: { key: BRANDING_SITE_CONTENT_KEY },
    update: {
      title: 'MASSAF System Branding Settings',
      content: JSON.stringify(updated),
    },
    create: {
      key: BRANDING_SITE_CONTENT_KEY,
      title: 'MASSAF System Branding Settings',
      content: JSON.stringify(updated),
    },
  });

  return updated;
}
