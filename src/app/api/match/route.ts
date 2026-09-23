import { NextResponse } from 'next/server';
import { matchCriteriaSchema } from '@/lib/validations/matching';
import { getActiveTherapists } from '@/lib/db-therapists';
import { rankTherapistsForMatch } from '@/lib/matching';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid request body. JSON object expected.' },
        { status: 400 }
      );
    }

    const parseResult = matchCriteriaSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid questionnaire input criteria.',
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    const criteria = parseResult.data;
    const activeTherapists = await getActiveTherapists();

    const matches = await rankTherapistsForMatch(criteria, activeTherapists);

    // Apply customer-specific 5-therapist rolling rotation if ZIP is supplied
    let finalMatches = matches;
    if (criteria.zipCode) {
      const { getRotatingTherapistsForZip } = await import('@/lib/matching');
      const { getVerifiedCustomerSession } = await import('@/lib/auth-session');

      const reqCookieHeader = request.headers.get('cookie') || undefined;
      const customerSession = await getVerifiedCustomerSession(reqCookieHeader);

      const rotatingTherapists = await getRotatingTherapistsForZip(
        criteria.zipCode,
        activeTherapists,
        { customerId: customerSession?.entityId || null }
      );

      const rotatingIds = new Set(rotatingTherapists.map((t) => t.id));
      finalMatches = matches.filter((m) => rotatingIds.has(m.therapist.id));
    }

    return NextResponse.json(
      {
        success: true,
        count: matches.length,
        matches,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /api/match] Matching error:', message);

    return NextResponse.json(
      {
        success: false,
        error: 'An internal server error occurred while processing therapist matches.',
      },
      { status: 500 }
    );
  }
}
