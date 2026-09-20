import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedCustomerSession } from '@/lib/auth-session';

export async function POST(request: Request) {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to rebook' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { bookingId } = body;

    if (!bookingId || typeof bookingId !== 'string') {
      return NextResponse.json(
        { error: 'Original Booking ID parameter is required' },
        { status: 400 }
      );
    }

    // 1. Fetch original booking verifying customer ownership
    const originalBooking = await db.booking.findFirst({
      where: {
        id: bookingId,
        customerId: session.entityId,
      },
      include: {
        therapist: {
          include: {
            services: {
              where: { isActive: true, service: { isActive: true } },
              include: { service: true },
            },
            serviceAreas: true,
          },
        },
        service: true,
      },
    });

    if (!originalBooking) {
      return NextResponse.json(
        { error: 'Original booking not found or unauthorized' },
        { status: 404 }
      );
    }

    if (!originalBooking.therapist || !originalBooking.therapist.isActive) {
      return NextResponse.json(
        { error: 'Therapist is no longer active or available for booking' },
        { status: 400 }
      );
    }

    if (!originalBooking.service || !originalBooking.service.isActive) {
      return NextResponse.json(
        { error: 'Selected service is no longer offered' },
        { status: 400 }
      );
    }

    // 2. Validate therapist still offers the service
    const therapistService = originalBooking.therapist.services.find(
      (ts) => ts.serviceId === originalBooking.serviceId || ts.service.id === originalBooking.serviceId
    );

    if (!therapistService || !therapistService.service) {
      return NextResponse.json(
        { error: 'Selected therapist no longer offers this service' },
        { status: 400 }
      );
    }

    // 3. RECALCULATE AUTHORITATIVE CURRENT PRICE & DURATION FROM CURRENT DATABASE STATE
    const currentAuthoritativePrice = therapistService.customPrice ?? therapistService.service.price;
    const currentDurationMinutes = therapistService.customDurationMinutes ?? therapistService.service.durationMinutes;

    return NextResponse.json({
      message: 'Rebooking data prepared successfully',
      rebookData: {
        therapistId: originalBooking.therapist.id,
        therapistName: originalBooking.therapist.name,
        serviceId: originalBooking.service.id,
        serviceName: originalBooking.service.name,
        locationType: originalBooking.locationType,
        addressLine1: originalBooking.addressLine1,
        addressLine2: originalBooking.addressLine2,
        city: originalBooking.city,
        state: originalBooking.state,
        zipCode: originalBooking.zipCode,
        currentAuthoritativePrice,
        currentDurationMinutes,
      },
    });
  } catch (error) {
    console.error('Error preparing rebooking:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while processing your rebooking request' },
      { status: 500 }
    );
  }
}
