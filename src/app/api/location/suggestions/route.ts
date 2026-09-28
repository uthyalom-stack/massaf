import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getActiveTherapists } from '@/lib/db-therapists';
import { rankTherapistsForMatch } from '@/lib/matching';
import { FALLBACK_US_STATES } from '@/lib/us-states-data';

export const dynamic = 'force-dynamic';

export interface LocationSuggestion {
  label: string;
  query: string;
  city: string;
  state: string;
  stateName: string;
  postalCode?: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('query') || '').trim();

    if (!query || query.length < 1) {
      return NextResponse.json(
        { success: true, suggestions: [] },
        {
          status: 200,
          headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' },
        }
      );
    }

    const suggestions: LocationSuggestion[] = [];
    const seenKeys = new Set<string>();

    const clean = query.toLowerCase();
    const isNumeric = /^\d+$/.test(clean);

    if (isNumeric) {
      // 1. LIGHTWEIGHT ZIP Code Prefix Suggestions (No therapist ranking on typing)
      const zipMatches = await db.uSZipCode.findMany({
        where: { zipCode: { startsWith: clean } },
        select: { zipCode: true, city: true, state: true, stateName: true },
        orderBy: { zipCode: 'asc' },
        take: 8,
      });

      for (const zipRecord of zipMatches) {
        const key = `zip:${zipRecord.zipCode}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);

          suggestions.push({
            label: `${zipRecord.zipCode} — ${zipRecord.city}, ${zipRecord.state}`,
            query: zipRecord.zipCode,
            city: zipRecord.city,
            state: zipRecord.state,
            stateName: zipRecord.stateName || zipRecord.state,
            postalCode: zipRecord.zipCode,
          });
        }
      }
    } else {
      // 2. LIGHTWEIGHT City & State Name Suggestions
      const stateMatch = FALLBACK_US_STATES.find(
        (s) => s.code.toLowerCase() === clean || s.name.toLowerCase().startsWith(clean)
      );

      if (stateMatch) {
        const key = `state:${stateMatch.code}`;
        seenKeys.add(key);

        suggestions.push({
          label: `${stateMatch.name} (${stateMatch.code})`,
          query: stateMatch.name,
          city: stateMatch.name,
          state: stateMatch.code,
          stateName: stateMatch.name,
        });
      }

      // Query USZipCode for matching cities
      const cityMatches = await db.uSZipCode.findMany({
        where: {
          city: { contains: clean },
        },
        select: { city: true, state: true, stateName: true },
        distinct: ['city', 'state'],
        take: 6,
      });

      for (const rec of cityMatches) {
        const key = `city:${rec.city.toLowerCase()}:${rec.state.toLowerCase()}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);

          suggestions.push({
            label: `${rec.city}, ${rec.state}`,
            query: `${rec.city}, ${rec.state}`,
            city: rec.city,
            state: rec.state,
            stateName: rec.stateName || rec.state,
          });
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        suggestions,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        },
      }
    );
  } catch (err) {
    console.error('[API /api/location/suggestions] Error fetching suggestions:', err);
    return NextResponse.json(
      { success: true, suggestions: [] },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' },
      }
    );
  }
}
