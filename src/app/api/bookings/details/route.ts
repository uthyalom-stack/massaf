import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MOCK_THERAPISTS } from '@/lib/mock-data';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Booking ID parameter is required' },
        { status: 400 }
      );
    }

    const booking = await db.booking.findUnique({
      where: { id },
      include: {
        therapist: true,
        service: true,
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    const mockTherapist = MOCK_THERAPISTS.find((t) => t.id === booking.therapistId);
    const mockService = mockTherapist?.services.find((s) => s.id === booking.serviceId);

    const therapistName = booking.therapist?.name || mockTherapist?.name || 'Assigned Therapist';
    const serviceName = booking.service?.name || mockService?.name || 'Massage Therapy Session';

    // Privacy boundary: Do NOT return customer name, customer email, full address, address line 2, or notes
    return NextResponse.json({
      booking: {
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        amount: booking.amount,
        appointmentDateTime: booking.appointmentDateTime.toISOString(),
        durationMinutes: booking.durationMinutes,
        locationType: booking.locationType,
        therapistName,
        serviceName,
      },
    });
  } catch (error) {
    console.error('Error fetching booking details:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve booking information' },
      { status: 500 }
    );
  }
}
