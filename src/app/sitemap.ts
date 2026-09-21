import { MetadataRoute } from 'next';
import { db } from '@/lib/db';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://massaf.com').replace(/\/$/, '');

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/find-a-therapist`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/match-me`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];

  // Dynamic therapist profiles
  let therapistRoutes: MetadataRoute.Sitemap = [];
  try {
    const therapists = await db.therapist.findMany({
      where: { isActive: true },
      select: { id: true, updatedAt: true },
    });

    therapistRoutes = therapists.map((t) => ({
      url: `${baseUrl}/therapists/${t.id}`,
      lastModified: t.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));
  } catch {
    // ignore DB errors during sitemap build
  }

  // Dynamic public service pages
  let serviceRoutes: MetadataRoute.Sitemap = [];
  try {
    const services = await db.service.findMany({
      where: { isActive: true },
      select: { name: true, updatedAt: true },
    });

    serviceRoutes = services.map((s) => ({
      url: `${baseUrl}/services/${encodeURIComponent(s.name.toLowerCase().replace(/\s+/g, '-'))}`,
      lastModified: s.updatedAt,
      changeFrequency: 'monthly',
      priority: 0.7,
    }));
  } catch {
    // ignore DB errors
  }

  // Dynamic public location pages
  let locationRoutes: MetadataRoute.Sitemap = [];
  try {
    const locations = await db.serviceArea.findMany({
      select: { cityName: true },
      distinct: ['cityName'],
    });

    locationRoutes = locations.map((loc) => ({
      url: `${baseUrl}/locations/${encodeURIComponent(loc.cityName.toLowerCase().replace(/\s+/g, '-'))}`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    }));
  } catch {
    // ignore DB errors
  }

  return [...staticRoutes, ...therapistRoutes, ...serviceRoutes, ...locationRoutes];
}
