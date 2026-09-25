import { db } from '@/lib/db';
import { UsStateOption, FALLBACK_US_STATES, getAllUsStates } from '@/lib/us-states-data';

export type { UsStateOption };
export { FALLBACK_US_STATES, getAllUsStates };

export interface ZipInfo {
  zipCode: string;
  city: string;
  state: string;
  stateName: string;
  latitude?: number | null;
  longitude?: number | null;
}

// In-memory memoization caches populated strictly from database query results
let cachedStates: UsStateOption[] | null = null;
const stateCitiesCache = new Map<string, string[]>();
const stateZipsCache = new Map<string, string[]>();
const stateCityZipsCache = new Map<string, string[]>();
const zipInfoCache = new Map<string, ZipInfo | null>();

/**
 * Authoritatively retrieves all U.S. states with active records from USZipCode table.
 */
export async function getStates(): Promise<UsStateOption[]> {
  if (cachedStates && cachedStates.length > 0) {
    return cachedStates;
  }

  try {
    const states = await db.uSZipCode.findMany({
      select: {
        state: true,
        stateName: true,
      },
      distinct: ['state'],
      orderBy: { stateName: 'asc' },
    });

    if (states.length > 0) {
      cachedStates = states.map((s) => ({
        code: s.state,
        name: s.stateName || s.state,
      }));
      return cachedStates;
    }
    return FALLBACK_US_STATES;
  } catch (err) {
    console.error('Error fetching U.S. states from USZipCode database table:', err);
    return FALLBACK_US_STATES;
  }
}

/**
 * Authoritatively retrieves unique sorted cities for a state from USZipCode database table.
 */
export async function getCitiesByState(stateCode: string): Promise<string[]> {
  if (!stateCode) return [];
  const cleanState = stateCode.trim().toUpperCase();

  if (stateCitiesCache.has(cleanState)) {
    return stateCitiesCache.get(cleanState)!;
  }

  try {
    const cities = await db.uSZipCode.findMany({
      where: { state: cleanState },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    });

    const result = cities.map((c) => c.city);
    stateCitiesCache.set(cleanState, result);
    return result;
  } catch (err) {
    console.error(`Error fetching cities for state ${cleanState} from USZipCode table:`, err);
    return [];
  }
}

/**
 * Authoritatively retrieves all unique sorted 5-digit ZIP codes for a given state from USZipCode database table.
 */
export async function getZipsByState(stateCode: string): Promise<string[]> {
  if (!stateCode) return [];
  const cleanState = stateCode.trim().toUpperCase();

  if (stateZipsCache.has(cleanState)) {
    return stateZipsCache.get(cleanState)!;
  }

  try {
    const zips = await db.uSZipCode.findMany({
      where: { state: cleanState },
      select: { zipCode: true },
      distinct: ['zipCode'],
      orderBy: { zipCode: 'asc' },
    });

    const result = zips.map((z) => z.zipCode);
    stateZipsCache.set(cleanState, result);
    return result;
  } catch (err) {
    console.error(`Error fetching ZIPs for state ${cleanState} from USZipCode table:`, err);
    return [];
  }
}

/**
 * Authoritatively retrieves unique ZIP codes for a given state and city from USZipCode database table.
 */
export async function getZipsByCity(stateCode: string, cityName: string): Promise<string[]> {
  if (!stateCode || !cityName) return [];
  const cleanState = stateCode.trim().toUpperCase();
  const cleanCity = cityName.trim();
  const cacheKey = `${cleanState}:${cleanCity.toLowerCase()}`;

  if (stateCityZipsCache.has(cacheKey)) {
    return stateCityZipsCache.get(cacheKey)!;
  }

  try {
    const zips = await db.uSZipCode.findMany({
      where: {
        state: cleanState,
        city: cleanCity,
      },
      select: { zipCode: true },
      distinct: ['zipCode'],
      orderBy: { zipCode: 'asc' },
    });

    const result = zips.map((z) => z.zipCode);
    stateCityZipsCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error fetching ZIPs for ${cleanCity}, ${cleanState} from USZipCode table:`, err);
    return [];
  }
}

/**
 * Retrieves detailed location information for a specific 5-digit U.S. ZIP code from USZipCode table.
 */
export async function getZipInfo(zipCode: string): Promise<ZipInfo | null> {
  if (!zipCode || !zipCode.trim()) return null;
  const cleanZip = zipCode.trim().padStart(5, '0');

  if (zipInfoCache.has(cleanZip)) {
    return zipInfoCache.get(cleanZip)!;
  }

  try {
    const record = await db.uSZipCode.findUnique({
      where: { zipCode: cleanZip },
    });

    if (!record) {
      zipInfoCache.set(cleanZip, null);
      return null;
    }

    const info: ZipInfo = {
      zipCode: record.zipCode,
      city: record.city,
      state: record.state,
      stateName: record.stateName,
      latitude: record.latitude,
      longitude: record.longitude,
    };

    zipInfoCache.set(cleanZip, info);
    return info;
  } catch (err) {
    console.error(`Error looking up ZIP info for ${cleanZip} from USZipCode table:`, err);
    return null;
  }
}

/**
 * Validates whether a 5-digit ZIP code exists in the official USZipCode database table.
 */
export async function isValidUSZip(zipCode: string): Promise<boolean> {
  const info = await getZipInfo(zipCode);
  return Boolean(info);
}

/**
 * State lookup for a ZIP code from local memory cache or USZipCode table.
 */
export async function getStateForZip(zipCode: string): Promise<string | null> {
  const info = await getZipInfo(zipCode);
  return info ? info.state : null;
}

/**
 * Synchronous state lookup helper for a 5-digit U.S. ZIP code strictly using
 * in-memory cache populated from USZipCode database queries.
 */
export function getStateForZipSync(zipCode: string): string | null {
  if (!zipCode || !zipCode.trim()) return null;
  const cleanZip = zipCode.trim().padStart(5, '0');

  if (zipInfoCache.has(cleanZip)) {
    const cached = zipInfoCache.get(cleanZip);
    return cached ? cached.state : null;
  }

  return null;
}

/**
 * Authoritative coverage validation rule:
 * Customer ZIP is covered ONLY if:
 * 1. The customer ZIP exists in the real USZipCode database table
 * 2. It belongs to the configured state
 * 3. Its numeric ZIP value falls between the configured startZip and endZip
 */
export async function isZipInCoverage(
  customerZip: string,
  stateCode: string,
  startZip: string,
  endZip?: string | null
): Promise<boolean> {
  if (!customerZip || !stateCode || !startZip) return false;

  const reqZip = customerZip.trim().padStart(5, '0');
  const reqState = stateCode.trim().toUpperCase();
  const sZip = startZip.trim().padStart(5, '0');
  const eZip = endZip ? endZip.trim().padStart(5, '0') : sZip;

  // 1. Verify customer ZIP exists in USZipCode database
  const zipInfo = await getZipInfo(reqZip);
  if (!zipInfo) {
    return false;
  }

  // 2. Verify state match
  if (zipInfo.state !== reqState) {
    return false;
  }

  // 3. Verify numeric range inclusion (startZip <= customerZip <= endZip)
  const reqNum = parseInt(reqZip, 10);
  const startNum = parseInt(sZip, 10);
  const endNum = parseInt(eZip, 10);

  if (isNaN(reqNum) || isNaN(startNum) || isNaN(endNum)) {
    return false;
  }

  const minNum = Math.min(startNum, endNum);
  const maxNum = Math.max(startNum, endNum);

  return reqNum >= minNum && reqNum <= maxNum;
}

export function clearZipLocationCaches() {
  zipInfoCache.clear();
  stateCitiesCache.clear();
  stateZipsCache.clear();
  stateCityZipsCache.clear();
  cachedStates = null;
}

export function getStateNameByCode(stateCode: string): string {
  if (!stateCode) return '';
  const clean = stateCode.trim().toUpperCase();
  const found = FALLBACK_US_STATES.find((s) => s.code === clean);
  return found ? found.name : clean;
}
