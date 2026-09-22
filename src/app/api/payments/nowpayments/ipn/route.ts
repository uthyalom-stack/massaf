import { NextResponse } from 'next/server';
import { processNowPaymentsIpn } from '@/lib/nowpayments';

export async function POST(request: Request) {
  try {
    const signature = request.headers.get('x-nowpayments-sig') || '';
    const payload = await request.json();

    const result = await processNowPaymentsIpn({
      payload,
      signature,
    });

    return NextResponse.json(
      { success: result.success, message: result.message || result.error },
      { status: result.status }
    );
  } catch (err: unknown) {
    console.error('Error handling NOWPayments IPN callback:', err);
    return NextResponse.json(
      { error: 'Failed to process NOWPayments callback.' },
      { status: 500 }
    );
  }
}
