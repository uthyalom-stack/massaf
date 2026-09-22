'use server';

import { getCitiesByState, getZipsByCity, getStates } from '@/lib/us-locations';

export async function fetchCitiesForStateAction(stateCode: string): Promise<string[]> {
  try {
    return await getCitiesByState(stateCode);
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
