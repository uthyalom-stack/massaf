import { NextResponse } from 'next/server';
import { PaymentService } from '@/lib/payments/service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const providers = await PaymentService.getAvailableCustomerProviders();
    return NextResponse.json(
      {
        success: true,
        providers,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (err: unknown) {
    console.error('Error in /api/payments/providers:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve available payment providers.' },
      { status: 500 }
    );
  }
}
