import { NextResponse } from 'next/server';
import { PaymentService } from '@/lib/payments/service';
import { PaymentProviderId } from '@/lib/payments/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const resolvedParams = await params;
    const providerId = resolvedParams.providerId as PaymentProviderId;
    const adapter = PaymentService.getAdapter(providerId);

    if (!adapter) {
      return NextResponse.json(
        { error: `Unknown payment provider '${providerId}'.` },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((val, key) => {
      query[key] = val;
    });

    const headers: Record<string, string> = {};
    request.headers.forEach((val, key) => {
      headers[key] = val;
    });

    const result = await adapter.handleWebhook({
      headers,
      body: {},
      query,
    });

    return NextResponse.json(
      { success: result.success, message: result.event ? 'Webhook processed' : result.error },
      { status: result.httpStatus }
    );
  } catch (err: unknown) {
    console.error('Error in GET webhook route:', err);
    return NextResponse.json(
      { error: 'Internal server error processing webhook.' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const resolvedParams = await params;
    const providerId = resolvedParams.providerId as PaymentProviderId;
    const adapter = PaymentService.getAdapter(providerId);

    if (!adapter) {
      return NextResponse.json(
        { error: `Unknown payment provider '${providerId}'.` },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((val, key) => {
      query[key] = val;
    });

    const headers: Record<string, string> = {};
    request.headers.forEach((val, key) => {
      headers[key] = val;
    });

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // Body might be raw or empty
    }

    const result = await adapter.handleWebhook({
      headers,
      body,
      query,
    });

    return NextResponse.json(
      { success: result.success, message: result.event ? 'Webhook processed' : result.error },
      { status: result.httpStatus }
    );
  } catch (err: unknown) {
    console.error('Error in POST webhook route:', err);
    return NextResponse.json(
      { error: 'Internal server error processing webhook.' },
      { status: 500 }
    );
  }
}
