import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingSchema } from '@/lib/validations/booking';
import { formatDbTherapistToPublic } from '@/lib/db-therapists';
import { isAppointmentTimeAvailable } from '@/lib/availability';
import { parseAppointmentDateTime } from '@/lib/timezone';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Zod schema validation
    const parseResult = bookingSchema.safeParse(body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const issues = parseResult.error.issues;
      const firstErrorMessage =
        issues[0]?.message || 'Invalid booking details provided';
      return NextResponse.json(
        { error: firstErrorMessage, details: fieldErrors },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // 2. Validate therapist existence in database (must be active)
    const therapist = await db.therapist.findFirst({
      where: {
        id: data.therapistId,
        isActive: true,
      },
      include: {
        services: {
          where: {
            isActive: true,
            service: { isActive: true },
          },
          include: { service: true },
        },
        availabilities: true,
        photos: true,
        serviceAreas: true,
      },
    });

    if (!therapist) {
      return NextResponse.json(
        { error: 'Selected therapist could not be found or is unavailable' },
        { status: 404 }
      );
    }

    // 3. Validate service belongs to selected therapist and is active
    const therapistService = therapist.services.find(
      (ts) => ts.serviceId === data.serviceId || ts.service.id === data.serviceId
    );

    if (!therapistService || !therapistService.service) {
      return NextResponse.json(
        { error: 'Selected service is not offered by this therapist' },
        { status: 400 }
      );
    }

    const service = therapistService.service;
    const authoritativePrice = therapistService.customPrice ?? service.price;
    const durationMinutes = therapistService.customDurationMinutes ?? service.durationMinutes;

    // 4. Validate location type is supported by therapist & validate ServiceArea for IN_HOME
    if (data.locationType === 'STUDIO' && !therapist.offersStudio) {
      return NextResponse.json(
        { error: 'This therapist does not offer studio appointments' },
        { status: 400 }
      );
    }

    if (data.locationType === 'IN_HOME') {
      if (!therapist.offersInHome) {
        return NextResponse.json(
          { error: 'This therapist does not offer in-home appointments' },
          { status: 400 }
        );
      }

      if (therapist.serviceAreas.length === 0) {
        return NextResponse.json(
          { error: 'This therapist is not currently accepting in-home appointments in your area.' },
          { status: 400 }
        );
      }

      const reqZip = data.zipCode?.trim().toLowerCase();
      const reqCity = data.city?.trim().toLowerCase();
      const reqState = data.state?.trim().toLowerCase();

      const isSupportedArea = therapist.serviceAreas.some((sa) => {
        const zipMatch = sa.zipCode.trim().toLowerCase() === reqZip;
        const cityMatch =
          sa.cityName.trim().toLowerCase() === reqCity &&
          sa.state.trim().toLowerCase() === reqState;
        return zipMatch || cityMatch;
      });

      if (!isSupportedArea) {
        return NextResponse.json(
          { error: "This location is outside this therapist's service area." },
          { status: 400 }
        );
      }
    }

    // 5. Authoritative Server-side Availability Check
    const publicTherapist = formatDbTherapistToPublic(therapist);
    const availabilityCheck = isAppointmentTimeAvailable(
      publicTherapist,
      data.date,
      data.time,
      durationMinutes
    );

    if (!availabilityCheck.isValid) {
      return NextResponse.json(
        { error: availabilityCheck.reason || 'Selected date/time is outside therapist working hours' },
        { status: 400 }
      );
    }

    // 6. Consistent Timezone Date/Time Parsing
    let appointmentDateTime: Date;
    try {
      appointmentDateTime = parseAppointmentDateTime(data.date, data.time);
    } catch {
      return NextResponse.json(
        { error: 'Invalid appointment date or time format' },
        { status: 400 }
      );
    }

    // 6b. Server-side Marketing Link Resolution from trusted first-party cookie
    let marketingLinkId: string | null = null;
    try {
      const cookieStore = await cookies();
      const refCode = cookieStore.get('massaf_marketing_ref')?.value;
      if (refCode) {
        const marketingLink = await db.marketingLink.findUnique({
          where: { code: refCode },
        });
        if (marketingLink && marketingLink.isActive) {
          marketingLinkId = marketingLink.id;
        }
      }
    } catch {
      // Ignore attribution lookup failures to ensure customer booking flow never fails
    }

    // 7. Atomic Database Transaction: Customer creation/update, Conflict Check, and Booking Creation
    const requestedStart = appointmentDateTime.getTime();
    const requestedEnd = requestedStart + durationMinutes * 60 * 1000;
    const customerName = `${data.firstName} ${data.lastName}`.trim();
    const bookingNumber = `MSF-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const bookingResult = await db.$transaction(async (tx) => {
      // Check for overlapping active bookings inside atomic transaction
      const existingBookings = await tx.booking.findMany({
        where: {
          therapistId: therapist.id,
          status: {
            notIn: ['CANCELLED', 'REFUNDED'],
          },
          appointmentDateTime: {
            lt: new Date(requestedEnd),
          },
        },
        select: {
          id: true,
          appointmentDateTime: true,
          durationMinutes: true,
        },
      });

      const hasConflict = existingBookings.some((existing) => {
        const existingStart = existing.appointmentDateTime.getTime();
        const existingEnd = existingStart + existing.durationMinutes * 60 * 1000;
        return existingStart < requestedEnd && existingEnd > requestedStart;
      });

      if (hasConflict) {
        return { conflict: true };
      }

      // Find or create customer inside transaction
      let customer = await tx.customer.findUnique({
        where: { email: data.email.toLowerCase() },
      });

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: customerName,
            email: data.email.toLowerCase(),
            phone: data.phone,
          },
        });
      } else {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            name: customerName,
            phone: data.phone,
          },
        });
      }

      // Create booking inside transaction
      const createdBooking = await tx.booking.create({
        data: {
          bookingNumber,
          customerId: customer.id,
          therapistId: therapist.id,
          serviceId: service.id,
          marketingLinkId,
          appointmentDateTime,
          durationMinutes,
          locationType: data.locationType,
          addressLine1: data.locationType === 'IN_HOME' ? data.addressLine1 : null,
          addressLine2: data.locationType === 'IN_HOME' ? data.addressLine2 : null,
          city: data.locationType === 'IN_HOME' ? data.city : null,
          state: data.locationType === 'IN_HOME' ? data.state : null,
          zipCode: data.locationType === 'IN_HOME' ? data.zipCode : null,
          notes: data.notes || null,
          amount: authoritativePrice,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
        },
      });

      return { booking: createdBooking };
    });

    if (!('booking' in bookingResult) || !bookingResult.booking) {
      return NextResponse.json(
        { error: 'That appointment time is no longer available. Please choose another time.' },
        { status: 400 }
      );
    }

    const createdBooking = bookingResult.booking;

    return NextResponse.json(
      {
        message: 'Booking created successfully',
        booking: {
          id: createdBooking.id,
          bookingNumber: createdBooking.bookingNumber,
          status: createdBooking.status,
          paymentStatus: createdBooking.paymentStatus,
          amount: createdBooking.amount,
          appointmentDateTime: createdBooking.appointmentDateTime.toISOString(),
          locationType: createdBooking.locationType,
          therapistName: therapist.name,
          serviceName: service.name,
          durationMinutes,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating booking:', error);

    // Explicitly catch transaction write conflicts / busy lock exceptions from SQLite/libSQL/Prisma (e.g., P2034)
    const errorMsg = error instanceof Error ? error.message.toLowerCase() : '';
    const isPrismaConflict = typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2034';
    const isSqliteBusy = errorMsg.includes('sqlite_busy') || errorMsg.includes('busy') || errorMsg.includes('locked') || errorMsg.includes('write conflict') || errorMsg.includes('transaction failed');

    if (isPrismaConflict || isSqliteBusy) {
      return NextResponse.json(
        { error: 'That appointment time is no longer available. Please choose another time.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred while processing your booking. Please try again.' },
      { status: 500 }
    );
  }
}
