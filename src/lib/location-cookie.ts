import { LocationSource, NormalizedLocation } from '@/lib/ip-location';

export const LOCATION_COOKIE_NAME = 'massaf_user_location';

/**
 * Checks whether a new location source should override an existing location source.
 * Priority hierarchy: manual > gps > ip > none
 */
export function shouldOverrideLocation(
  currentSource: LocationSource | undefined | null,
  newSource: LocationSource
): boolean {
  if (!currentSource || currentSource === 'none') {
    return true;
  }

  const priorityOrder: Record<LocationSource, number> = {
    manual: 4,
    gps: 3,
    ip: 2,
    none: 1,
  };

  const currentPriority = priorityOrder[currentSource] || 0;
  const newPriority = priorityOrder[newSource] || 0;

  // Equal or higher priority replaces
  return newPriority >= currentPriority;
}

/**
 * Safely parses the customer location from raw Cookie header or string.
 */
export function getLocationFromCookie(cookieHeader?: string | null): NormalizedLocation | null {
  if (!cookieHeader) return null;

  try {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    const match = cookies.find((c) => c.startsWith(`${LOCATION_COOKIE_NAME}=`));

    if (!match) return null;

    const rawValue = match.substring(LOCATION_COOKIE_NAME.length + 1);
    const decoded = decodeURIComponent(rawValue);
    const parsed = JSON.parse(decoded);

    if (parsed && typeof parsed === 'object' && parsed.city && parsed.state) {
      return {
        city: String(parsed.city),
        state: String(parsed.state).toUpperCase(),
        stateName: String(parsed.stateName || parsed.state),
        country: String(parsed.country || 'US').toUpperCase(),
        postalCode: String(parsed.postalCode || ''),
        source: (parsed.source as LocationSource) || 'ip',
        rawQuery: parsed.rawQuery ? String(parsed.rawQuery) : undefined,
      };
    }
  } catch {
    // Malformed cookie handled gracefully
  }

  return null;
}

/**
 * Formats Set-Cookie header string for client response.
 */
export function createLocationCookieHeader(location: NormalizedLocation): string {
  const payload = JSON.stringify({
    city: location.city,
    state: location.state,
    stateName: location.stateName,
    country: location.country,
    postalCode: location.postalCode,
    source: location.source,
    rawQuery: location.rawQuery,
  });

  const encoded = encodeURIComponent(payload);
  // Max age 30 days, SameSite Lax, Path /
  return `${LOCATION_COOKIE_NAME}=${encoded}; Path=/; Max-Age=2592000; SameSite=Lax`;
}
