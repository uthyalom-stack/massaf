'use server';

import {
  getCitiesByState,
  getZipsByCity,
  getZipsByState,
  getStates,
  getZipInfo,
  isZipInCoverage,
} from '@/lib/us-locations';

export async function fetchCitiesForStateAction(stateCode: string): Promise<string[]> {
  try {
    return await getCitiesByState(stateCode);
  } catch {
    return [];
  }
}

export async function fetchZipsForStateAction(stateCode: string): Promise<string[]> {
  try {
    return await getZipsByState(stateCode);
  } catch {
    return [];
  }
}

export async function fetchZipsForCityAction(stateCode: string, cityName: string): Promise<string[]> {
  try {
    return await getZipsByCity(stateCode, cityName);
  } catch {
    return [];
  }
}

export async function fetchUsStatesAction() {
  try {
    return await getStates();
  } catch {
    return [];
  }
}

export async function fetchZipInfoAction(zipCode: string) {
  try {
    return await getZipInfo(zipCode);
  } catch {
    return null;
  }
}

export async function verifyZipCoverageAction(
  customerZip: string,
  stateCode: string,
  startZip: string,
  endZip?: string | null
): Promise<boolean> {
  try {
    return await isZipInCoverage(customerZip, stateCode, startZip, endZip);
  } catch {
    return false;
  }
}

export async function fetchLocationSuggestionsAction(query: string) {
  if (!query || !query.trim()) return [];
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/location/suggestions?query=${encodeURIComponent(query.trim())}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.suggestions || [];
  } catch {
    return [];
  }
}
