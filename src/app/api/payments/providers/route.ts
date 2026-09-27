import { NextResponse } from 'next/server';
import { PaymentService } from '@/lib/payments/service';

export async function GET() {
  try {
    const providers = await PaymentService.getAvailableCustomerProviders();
    return NextResponse.json({
      success: true,
      providers,
    });
  } catch (err: unknown) {
    console.error('Error in /api/payments/providers:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve available payment providers.' },
      { status: 500 }
    );
  }
}
