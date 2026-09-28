import { NextResponse } from 'next/server';
import {
  getClientIp,
  getIpLocation,
  reverseGeocodeGps,
  NormalizedLocation,
  EMPTY_LOCATION,
} from '@/lib/ip-location';
import {
  getLocationFromCookie,
  createLocationCookieHeader,
  shouldOverrideLocation,
} from '@/lib/location-cookie';
import { getActiveTherapists } from '@/lib/db-therapists';
import { rankTherapistsForMatch } from '@/lib/matching';
import { getZipInfo, getCitiesByState, getZipsByCity, FALLBACK_US_STATES } from '@/lib/us-locations';

export const dynamic = 'force-dynamic';

async function calculateMatchesForLocation(location: NormalizedLocation): Promise<number> {
  try {
    const activeTherapists = await getActiveTherapists();
    if (activeTherapists.length === 0) return 0;

    // 1. If 5-digit ZIP code is available, rank therapists using ZIP code criteria
    if (location.postalCode && /^\d{5}$/.test(location.postalCode)) {
      const matches = await rankTherapistsForMatch(
        { zipCode: location.postalCode },
        activeTherapists
      );
      return matches.length;
    }

    // 2. Otherwise rank using City / State query criteria
    const locQuery = location.rawQuery || `${location.city}, ${location.state}`;
    const matches = await rankTherapistsForMatch(
      { locationQuery: locQuery },
      activeTherapists
    );
    return matches.length;
  } catch (err) {
    console.error('[calculateMatchesForLocation] Error calculating therapist count:', err);
    return 0;
  }
}

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie');
    const existingCookieLoc = getLocationFromCookie(cookieHeader);

    let finalLocation: NormalizedLocation;

    if (existingCookieLoc) {
      finalLocation = existingCookieLoc;
    } else {
      const ip = getClientIp(request.headers);
      finalLocation = await getIpLocation(ip, request.headers);
    }

    const totalMatches = await calculateMatchesForLocation(finalLocation);

    const response = NextResponse.json(
      {
        success: true,
        location: finalLocation,
        totalMatches,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        },
      }
    );

    // Persist location cookie
    response.headers.append('Set-Cookie', createLocationCookieHeader(finalLocation));

    return response;
  } catch (err) {
    console.error('[API /api/location GET] Error processing location:', err);
    return NextResponse.json(
      {
        success: true,
        location: EMPTY_LOCATION,
        totalMatches: 0,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        },
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie');
    const existingCookieLoc = getLocationFromCookie(cookieHeader);

    const body = await request.json().catch(() => ({}));
    let newLocation: NormalizedLocation | null = null;

    // A) GPS payload ({ lat, lon })
    if (typeof body.lat === 'number' && typeof body.lon === 'number') {
      const gpsResolved = await reverseGeocodeGps(body.lat, body.lon);
      if (gpsResolved) {
        newLocation = gpsResolved;
      }
    }

    // B) Manual search / selection payload ({ query } or { manualLocation })
    const manualQuery = String(body.manualLocation || body.query || '').trim();
    if (manualQuery) {
      // 1. Is query a 5-digit ZIP code?
      if (/^\d{5}$/.test(manualQuery)) {
        const zipInfo = await getZipInfo(manualQuery);
        if (zipInfo) {
          newLocation = {
            city: zipInfo.city,
            state: zipInfo.state,
            stateName: zipInfo.stateName,
            country: 'US',
            postalCode: zipInfo.zipCode,
            source: 'manual',
            rawQuery: manualQuery,
          };
        } else {
          newLocation = {
            city: manualQuery,
            state: 'US',
            stateName: 'United States',
            country: 'US',
            postalCode: manualQuery,
            source: 'manual',
            rawQuery: manualQuery,
          };
        }
      } else {
        // 2. Parse "City, State" or state/city string
        const parts = manualQuery.split(',').map((s) => s.trim());
        if (parts.length >= 2) {
          const cityPart = parts[0];
          const statePart = parts[1].toUpperCase();

          const foundState = FALLBACK_US_STATES.find(
            (s) => s.code === statePart || s.name.toLowerCase() === statePart.toLowerCase()
          );

          newLocation = {
            city: cityPart,
            state: foundState ? foundState.code : statePart,
            stateName: foundState ? foundState.name : statePart,
            country: 'US',
            postalCode: '',
            source: 'manual',
            rawQuery: manualQuery,
          };
        } else {
          // Single word query (e.g. "California", "Chicago", "90210")
          const matchedState = FALLBACK_US_STATES.find(
            (s) =>
              s.code.toLowerCase() === manualQuery.toLowerCase() ||
              s.name.toLowerCase() === manualQuery.toLowerCase()
          );

          if (matchedState) {
            newLocation = {
              city: matchedState.name,
              state: matchedState.code,
              stateName: matchedState.name,
              country: 'US',
              postalCode: '',
              source: 'manual',
              rawQuery: manualQuery,
            };
          } else {
            newLocation = {
              city: manualQuery,
              state: '',
              stateName: manualQuery,
              country: 'US',
              postalCode: '',
              source: 'manual',
              rawQuery: manualQuery,
            };
          }
        }
      }
    }

    if (!newLocation) {
      return NextResponse.json(
        { success: false, error: 'Invalid location parameters provided.' },
        { status: 400 }
      );
    }

    // Enforce priority rule
    const shouldOverride = shouldOverrideLocation(existingCookieLoc?.source, newLocation.source);
    const finalLocation = shouldOverride ? newLocation : existingCookieLoc!;

    const totalMatches = await calculateMatchesForLocation(finalLocation);

    const response = NextResponse.json(
      {
        success: true,
        location: finalLocation,
        totalMatches,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        },
      }
    );

    response.headers.append('Set-Cookie', createLocationCookieHeader(finalLocation));

    return response;
  } catch (err) {
    console.error('[API /api/location POST] Error updating location:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to update user location.' },
      { status: 500 }
    );
  }
}
