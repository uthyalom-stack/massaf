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
        customer: true,
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

    // Fall back to mock therapist/service names if DB relations aren't populated completely
    const mockTherapist = MOCK_THERAPISTS.find((t) => t.id === booking.therapistId);
    const mockService = mockTherapist?.services.find((s) => s.id === booking.serviceId);

    const therapistName = booking.therapist?.name || mockTherapist?.name || 'Assigned Therapist';
    const serviceName = booking.service?.name || mockService?.name || 'Massage Therapy Session';

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
        addressLine1: booking.addressLine1,
        addressLine2: booking.addressLine2,
        city: booking.city,
        state: booking.state,
        zipCode: booking.zipCode,
        notes: booking.notes,
        therapistName,
        serviceName,
        customerName: booking.customer.name,
        customerEmail: booking.customer.email,
      },
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve booking information' },
      { status: 500 }
    );
  }
}
