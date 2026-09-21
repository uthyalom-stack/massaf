import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://massaf.com').replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/*',
          '/account',
          '/account/*',
          '/therapist',
          '/therapist/*',
          '/api',
          '/api/*',
          '/checkout',
          '/booking/success',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
