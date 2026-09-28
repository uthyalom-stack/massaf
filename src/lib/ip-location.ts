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

export const FALLBACK_DEFAULT_LOCATION: NormalizedLocation = {
  city: 'Los Angeles',
  state: 'CA',
  stateName: 'California',
  country: 'US',
  postalCode: '90001',
  source: 'ip',
};

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
        postalCode: zip || '90001',
        source: 'ip',
      };
    }
  }

  // 2. Localhost / Private IP / missing IP fallback
  if (isPrivateOrLocalIp(ip)) {
    return { ...FALLBACK_DEFAULT_LOCATION };
  }

  // 3. External IP Geolocation Service (http://ip-api.com/json/{ip}) with 2.5s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon`,
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
        const stateName = String(data.regionName || getStateNameByCode(stateCode));
        const city = String(data.city || 'Los Angeles');
        const zip = data.zip && /^\d{5}$/.test(String(data.zip)) ? String(data.zip) : '';

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
          state: stateCode || 'CA',
          stateName: stateName || 'California',
          country: countryCode,
          postalCode: zip || '90001',
          source: 'ip',
        };
      }
    }
  } catch (err) {
    console.warn('[getIpLocation] External IP geolocation lookup failed or timed out:', err);
  }

  // Fallback to default U.S. location on failure
  return { ...FALLBACK_DEFAULT_LOCATION };
}

/**
 * Reverse-geocodes GPS coordinates (latitude, longitude) into official USZipCode location info
 * using nearest-neighbor spatial search against the database.
 * Does NOT permanently store raw lat/lon coordinates.
 */
export async function reverseGeocodeGps(
  lat: number,
  lon: number
): Promise<NormalizedLocation | null> {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return null;
  }

  try {
    // Spatial bounding box query (~1 degree ~ 60 miles)
    let candidates = await db.uSZipCode.findMany({
      where: {
        latitude: { gte: lat - 1.5, lte: lat + 1.5 },
        longitude: { gte: lon - 1.5, lte: lon + 1.5 },
      },
      select: {
        zipCode: true,
        city: true,
        state: true,
        stateName: true,
        latitude: true,
        longitude: true,
      },
      take: 100,
    });

    if (candidates.length === 0) {
      // Fallback query if candidate bounding box is empty
      candidates = await db.uSZipCode.findMany({
        where: {
          latitude: { not: null },
          longitude: { not: null },
        },
        select: {
          zipCode: true,
          city: true,
          state: true,
          stateName: true,
          latitude: true,
          longitude: true,
        },
        take: 500,
      });
    }

    if (candidates.length === 0) {
      return null;
    }

    let minDistanceSq = Infinity;
    let closestRecord = candidates[0];

    for (const rec of candidates) {
      if (rec.latitude !== null && rec.longitude !== null) {
        const dLat = rec.latitude - lat;
        const dLon = rec.longitude - lon;
        const distSq = dLat * dLat + dLon * dLon;

        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
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
