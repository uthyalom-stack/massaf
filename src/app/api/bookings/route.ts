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
    const requestedDuration = Number(data.durationMinutes) || therapistService.customDurationMinutes || service.durationMinutes;
    const durationMinutes = [30, 45, 60, 90, 120].includes(requestedDuration) ? requestedDuration : service.durationMinutes;

    // Server-authoritative hourly rate calculation: Total = HourlyRate * (DurationMinutes / 60)
    const hourlyRateUsed = therapist.hourlyRate || 100.0;
    const calculatedTotal = Math.round(hourlyRateUsed * (durationMinutes / 60) * 100) / 100;
    const authoritativePrice = calculatedTotal;

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

      const reqZip = data.zipCode?.trim();
      const reqState = data.state?.trim();

      if (!reqZip) {
        return NextResponse.json(
          { error: 'ZIP code is required for in-home appointments' },
          { status: 400 }
        );
      }

      // 1. Authoritative check that customer ZIP exists in USZipCode database
      const { getZipInfo } = await import('@/lib/us-locations');
      const zipInfo = await getZipInfo(reqZip);
      if (!zipInfo) {
        return NextResponse.json(
          { error: `ZIP code ${reqZip} is not recognized in the official U.S. ZIP database.` },
          { status: 400 }
        );
      }

      if (reqState && reqState.toUpperCase() !== zipInfo.state) {
        return NextResponse.json(
          { error: `ZIP code ${reqZip} belongs to ${zipInfo.stateName} (${zipInfo.state}), not ${reqState.toUpperCase()}.` },
          { status: 400 }
        );
      }

      // 2. Revalidate location eligibility using therapistCoversZipAsync (checking TherapistZipEligibility)
      const { therapistCoversZipAsync } = await import('@/lib/db-therapists');
      const publicTherapistForZip = formatDbTherapistToPublic(therapist);
      const isSupportedArea = await therapistCoversZipAsync(publicTherapistForZip, reqZip);

      if (!isSupportedArea) {
        return NextResponse.json(
          { error: `Selected therapist does not offer in-home coverage for ZIP ${reqZip}.` },
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
          status: true,
          paymentStatus: true,
          createdAt: true,
          appointmentDateTime: true,
          durationMinutes: true,
        },
      });

      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const hasConflict = existingBookings.some((existing) => {
        // Unpaid PENDING booking created >= 30 minutes ago is expired and does not block time slot
        if (
          existing.status === 'PENDING' &&
          existing.paymentStatus !== 'PAID' &&
          existing.createdAt <= thirtyMinutesAgo
        ) {
          return false;
        }

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
          hourlyRateUsed,
          calculatedTotal,
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

    try {
      const { createAdminNotification } = await import('@/lib/admin-notifications');
      await createAdminNotification({
        type: 'BOOKING_CREATED',
        title: 'New Booking Created',
        message: `Booking ${createdBooking.bookingNumber} created for ${customerName}`,
        link: `/admin/bookings/${createdBooking.id}`,
      });
    } catch (notifErr) {
      console.error('Error creating admin notification for new booking:', notifErr);
    }

    // Await notification dispatch with failure isolation
    try {
      const { notifyBookingCreated } = await import('@/lib/notifications');
      const notifRes = await notifyBookingCreated(createdBooking.id);
      if (!notifRes.success) {
        console.warn('notifyBookingCreated dispatch warning:', notifRes.error);
      }
    } catch (notifErr) {
      console.error('Failed to dispatch notifyBookingCreated:', notifErr);
    }

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
