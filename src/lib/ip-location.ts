import { db } from '@/lib/db';
import { getZipInfo, getStateNameByCode } from '@/lib/us-locations';

export type LocationSource = 'ip' | 'gps' | 'manual' | 'none';

export interface NormalizedLocation {
  city: string;
  state: string; // 2-letter state code e.g. "CA"
  stateName: string; // e.g. "California"
  country: string; // "US"
  postalCode: string; // 5-digit ZIP code e.g. "90001"
  source: LocationSource;
  rawQuery?: string;
}

export const EMPTY_LOCATION: NormalizedLocation = {
  city: '',
  state: '',
  stateName: '',
  country: '',
  postalCode: '',
  source: 'none',
};

// Kept for backward compatibility if imported elsewhere, but points to empty location with source 'none'
export const FALLBACK_DEFAULT_LOCATION: NormalizedLocation = EMPTY_LOCATION;

/**
 * Extracts the visitor client IP address safely from platform request headers.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return sanitizeIp(firstIp);
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) return sanitizeIp(realIp.trim());

  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return sanitizeIp(cfIp.trim());

  const clientIp = headers.get('x-client-ip');
  if (clientIp) return sanitizeIp(clientIp.trim());

  return '127.0.0.1';
}

function sanitizeIp(ip: string): string {
  // Strip port if present e.g. "192.168.1.1:8080"
  let clean = ip;
  if (clean.includes(':') && !clean.includes('::')) {
    clean = clean.split(':')[0];
  }
  return clean;
}

/**
 * Checks whether an IP is loopback, local, or private network range.
 */
export function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.')) return true;

  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return true;
    }
  }

  return false;
}

/**
 * Executes server-side IP geolocation without exposing provider keys or delaying client renders.
 */
export async function getIpLocation(ip: string, headers?: Headers): Promise<NormalizedLocation> {
  // 1. Inspect platform edge deployment headers if provided (e.g. Vercel / Netlify)
  if (headers) {
    const vercelCity = headers.get('x-vercel-ip-city');
    const vercelRegion = headers.get('x-vercel-ip-country-region');
    const vercelPostal = headers.get('x-vercel-ip-postal-code');
    const vercelCountry = headers.get('x-vercel-ip-country');

    if (vercelCity && vercelRegion) {
      const cityDecoded = decodeURIComponent(vercelCity);
      const stateCode = vercelRegion.toUpperCase();
      const stateName = getStateNameByCode(stateCode);
      const zip = vercelPostal && /^\d{5}$/.test(vercelPostal) ? vercelPostal : '';

      return {
        city: cityDecoded,
        state: stateCode,
        stateName,
        country: (vercelCountry || 'US').toUpperCase(),
        postalCode: zip,
        source: 'ip',
      };
    }
  }

  // 2. Localhost / Private IP / missing IP fallback -> return source: 'none'
  if (isPrivateOrLocalIp(ip)) {
    return { ...EMPTY_LOCATION };
  }

  // 3. External IP Geolocation Service (https://ip-api.com/json/{ip}) with 2.5s timeout over HTTPS
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(
      `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }
    );

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.status === 'success') {
        const countryCode = String(data.countryCode || 'US').toUpperCase();
        const stateCode = String(data.region || '').toUpperCase();
        const stateName = String(data.regionName || (stateCode ? getStateNameByCode(stateCode) : ''));
        const city = String(data.city || '');
        const zip = data.zip && /^\d{5}$/.test(String(data.zip)) ? String(data.zip) : '';

        if (!city && !stateCode && !zip) {
          return { ...EMPTY_LOCATION };
        }

        // If zip was returned, check USZipCode database to get authoritative city/state
        if (zip) {
          const zipInfo = await getZipInfo(zip);
          if (zipInfo) {
            return {
              city: zipInfo.city,
              state: zipInfo.state,
              stateName: zipInfo.stateName || stateName,
              country: countryCode,
              postalCode: zipInfo.zipCode,
              source: 'ip',
            };
          }
        }

        return {
          city,
          state: stateCode,
          stateName,
          country: countryCode,
          postalCode: zip,
          source: 'ip',
        };
      }
    }
  } catch (err) {
    console.warn('[getIpLocation] External IP geolocation lookup failed or timed out:', err);
  }

  // Fallback to empty location on failure
  return { ...EMPTY_LOCATION };
}

/**
 * Calculates the great-circle distance between two geographic coordinates using the Haversine formula (in km).
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const EARTH_RADIUS_KM = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Reverse-geocodes GPS coordinates (latitude, longitude) into official USZipCode location info
 * using progressive bounding box candidate searches and Haversine distance calculation.
 * Does NOT permanently store raw lat/lon coordinates.
 */
export async function reverseGeocodeGps(
  lat: number,
  lon: number
): Promise<NormalizedLocation | null> {
  // Validate coordinates: latitude in [-90, 90], longitude in [-180, 180]
  if (
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    isNaN(lat) ||
    isNaN(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  try {
    // Progressive bounding box radii (in degrees): ~30mi (0.5deg), ~90mi (1.5deg), ~180mi (3.0deg), ~600mi (10.0deg)
    const radiuses = [0.5, 1.5, 3.0, 10.0];
    let candidates: Array<{
      zipCode: string;
      city: string;
      state: string;
      stateName: string | null;
      latitude: number | null;
      longitude: number | null;
    }> = [];

    for (const radius of radiuses) {
      candidates = await db.uSZipCode.findMany({
        where: {
          latitude: { gte: lat - radius, lte: lat + radius },
          longitude: { gte: lon - radius, lte: lon + radius },
        },
        select: {
          zipCode: true,
          city: true,
          state: true,
          stateName: true,
          latitude: true,
          longitude: true,
        },
      });

      if (candidates.length > 0) {
        break;
      }
    }

    // If no candidate ZIPs found within maximum search radius, return null (location unavailable)
    if (candidates.length === 0) {
      return null;
    }

    // Nearest-neighbor candidate selection using Haversine distance
    let minDistanceKm = Infinity;
    let closestRecord = candidates[0];

    for (const rec of candidates) {
      if (rec.latitude !== null && rec.longitude !== null) {
        const distKm = calculateHaversineDistance(lat, lon, rec.latitude, rec.longitude);
        if (distKm < minDistanceKm) {
          minDistanceKm = distKm;
          closestRecord = rec;
        }
      }
    }

    return {
      city: closestRecord.city,
      state: closestRecord.state,
      stateName: closestRecord.stateName || getStateNameByCode(closestRecord.state),
      country: 'US',
      postalCode: closestRecord.zipCode,
      source: 'gps',
    };
  } catch (err) {
    console.error('[reverseGeocodeGps] Error reverse-geocoding GPS coordinates:', err);
    return null;
  }
}
