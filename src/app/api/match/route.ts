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

    // Apply customer-specific rolling 5-therapist rotation if ZIP is supplied
    let finalMatches = matches;
    let visitorSessionId: string | null = null;

    if (criteria.zipCode) {
      const { getRotatingTherapistsForZip } = await import('@/lib/matching');
      const { getVerifiedCustomerSession, getOrCreateVisitorSessionCookie } = await import('@/lib/auth-session');

      const reqCookieHeader = request.headers.get('cookie') || undefined;
      const customerSession = await getVerifiedCustomerSession(reqCookieHeader);
      visitorSessionId = await getOrCreateVisitorSessionCookie(reqCookieHeader);

      // Extract fully qualified therapists from matches (filtered by service, location type, and availability)
      const qualifiedTherapists = matches.map((m) => m.therapist);

      const rotatingTherapists = await getRotatingTherapistsForZip(
        criteria.zipCode,
        qualifiedTherapists,
        {
          customerId: customerSession?.entityId || null,
          visitorSessionId,
        }
      );

      // STRICT ZIP ELIGIBILITY: Filter matches strictly to returned rotating therapist pool (max 5)
      const rotatingIds = new Set(rotatingTherapists.map((t) => t.id));
      finalMatches = matches.filter((m) => rotatingIds.has(m.therapist.id)).slice(0, 5);
    }

    const response = NextResponse.json(
      {
        success: true,
        count: finalMatches.length,
        matches: finalMatches,
      },
      { status: 200 }
    );

    return response;
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
