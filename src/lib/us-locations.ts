import { db } from '@/lib/db';

export interface UsStateOption {
  code: string; // 2-letter postal code e.g. "CA", "IN", "NY"
  name: string; // Full state name e.g. "California", "Indiana"
}

export interface ZipInfo {
  zipCode: string;
  city: string;
  state: string;
  stateName: string;
  latitude?: number | null;
  longitude?: number | null;
}

// In-memory memoization caches for high-performance server-side lookups
let cachedStates: UsStateOption[] | null = null;
const stateCitiesCache = new Map<string, string[]>();
const stateCityZipsCache = new Map<string, string[]>();
const zipInfoCache = new Map<string, ZipInfo | null>();

/**
 * Returns all U.S. states with active ZIP records sorted alphabetically by name.
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

    cachedStates = states.map((s) => ({
      code: s.state,
      name: s.stateName || s.state,
    }));

    return cachedStates;
  } catch (err) {
    console.error('Error fetching U.S. states from database:', err);
    return FALLBACK_US_STATES;
  }
}

// Aliases for compatibility
export const getAllUsStates = () => FALLBACK_US_STATES;

export function getCitiesForStateSync(stateCode: string): string[] {
  if (!stateCode) return [];
  const cleanState = stateCode.trim().toUpperCase();
  const cached = stateCitiesCache.get(cleanState);
  if (cached) return cached;

  // Basic major cities fallback for common states before async DB load
  const FALLBACK_CITIES: Record<string, string[]> = {
    CA: ['Los Angeles', 'Beverly Hills', 'Santa Monica', 'San Francisco', 'San Diego', 'Irvine'],
    IN: ['Indianapolis', 'Gary', 'Fort Wayne', 'South Bend', 'Bloomington'],
    IL: ['Chicago', 'Evanston', 'Naperville', 'Peoria', 'Springfield'],
    NY: ['New York', 'Brooklyn', 'Buffalo', 'Rochester', 'Holtsville'],
    TX: ['Austin', 'Dallas', 'Houston', 'San Antonio', 'Allen'],
    FL: ['Miami', 'Orlando', 'Tampa', 'Jacksonville'],
    OH: ['Columbus', 'Cleveland', 'Cincinnati', 'Akron'],
  };

  return FALLBACK_CITIES[cleanState] || ['Central Metro', 'Downtown Area'];
}

export function getZipCodesForCitySync(stateCode: string, cityName: string): string[] {
  if (!stateCode || !cityName) return [];
  const cleanState = stateCode.trim().toUpperCase();
  const cleanCity = cityName.trim().toLowerCase();
  const cacheKey = `${cleanState}:${cleanCity}`;
  const cached = stateCityZipsCache.get(cacheKey);
  if (cached) return cached;

  const FALLBACK_ZIPS: Record<string, string[]> = {
    'ca:los angeles': ['90001', '90010', '90012', '90020'],
    'ca:beverly hills': ['90210', '90212', '90230'],
    'ca:santa monica': ['90401', '90403', '90405'],
    'in:indianapolis': ['46001', '46201', '46225', '46298'],
    'il:chicago': ['60001', '60601', '60614', '60699'],
    'ny:new york': ['10001', '10003', '10019'],
    'tx:austin': ['78701', '78704'],
  };

  return FALLBACK_ZIPS[cacheKey] || ['90001'];
}

export const getCitiesForState = getCitiesForStateSync;
export const getZipCodesForCity = getZipCodesForCitySync;
export const isValidUsZip = (zip: string) => /^\d{5}$/.test(zip.trim());

/**
 * Returns distinct cities in a given state sorted alphabetically.
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
    console.error(`Error fetching cities for state ${cleanState}:`, err);
    return [];
  }
}

/**
 * Returns all unique ZIP codes for a given state sorted numerically.
 */
export async function getZipsByState(stateCode: string): Promise<string[]> {
  if (!stateCode) return [];
  const cleanState = stateCode.trim().toUpperCase();

  try {
    const zips = await db.uSZipCode.findMany({
      where: { state: cleanState },
      select: { zipCode: true },
      distinct: ['zipCode'],
      orderBy: { zipCode: 'asc' },
    });

    return zips.map((z) => z.zipCode);
  } catch (err) {
    console.error(`Error fetching ZIPs for state ${cleanState}:`, err);
    return [];
  }
}

/**
 * Returns unique real ZIP codes for a given state and city.
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
    console.error(`Error fetching ZIPs for ${cleanCity}, ${cleanState}:`, err);
    return [];
  }
}

/**
 * Retrieves detailed location information for a specific 5-digit U.S. ZIP code.
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
    console.error(`Error looking up ZIP info for ${cleanZip}:`, err);
    return null;
  }
}

/**
 * Synchronous state lookup helper for a ZIP code from local memory cache / regex heuristic.
 */
export function getStateForZip(zipCode: string): string | null {
  if (!zipCode || !zipCode.trim()) return null;
  const cleanZip = zipCode.trim().padStart(5, '0');
  if (zipInfoCache.has(cleanZip)) {
    const cached = zipInfoCache.get(cleanZip);
    if (cached) return cached.state;
  }
  return null;
}

/**
 * Validates whether a 5-digit ZIP code exists in the official USZipCode database table.
 */
export async function isValidUSZip(zipCode: string): Promise<boolean> {
  const info = await getZipInfo(zipCode);
  return Boolean(info);
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

// Client-side synchronous state fallback helpers
export const FALLBACK_US_STATES: UsStateOption[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];

export function getStateNameByCode(stateCode: string): string {
  if (!stateCode) return '';
  const clean = stateCode.trim().toUpperCase();
  const found = FALLBACK_US_STATES.find((s) => s.code === clean);
  return found ? found.name : clean;
}
