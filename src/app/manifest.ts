import { MetadataRoute } from 'next';
import { getBrandingSettings } from '@/lib/branding';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getBrandingSettings();
  const name = branding.siteName || 'MASSAF';
  const tagline = branding.tagline || 'Wellness & Therapy';
  const logoUrl = branding.logoUrl || '/favicon.ico';

  return {
    name: `${name} — ${tagline}`,
    short_name: name,
    description: `${name} connects clients with premier, fully certified and vetted independent massage therapists across North America for in-home and studio sessions.`,
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#047857',
    icons: [
      {
        src: logoUrl,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: logoUrl,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
