import { MetadataRoute } from 'next';
import { getBrandingSettings } from '@/lib/branding';

function getIconMimeType(url: string): string {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.ico')) return 'image/x-icon';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getBrandingSettings();
  const name = branding.siteName || 'MASSAF';
  const tagline = branding.tagline || 'Wellness & Therapy';
  const logoUrl = branding.logoUrl;
  const iconType = logoUrl ? getIconMimeType(logoUrl) : 'image/png';

  return {
    name: `${name} — ${tagline}`,
    short_name: name,
    description: `${name} connects clients with premier, fully certified and vetted independent massage therapists across North America for in-home and studio sessions.`,
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#047857',
    icons: logoUrl
      ? [
          {
            src: logoUrl,
            sizes: '192x192',
            type: iconType,
          },
          {
            src: logoUrl,
            sizes: '512x512',
            type: iconType,
          },
        ]
      : undefined,
  };
}
