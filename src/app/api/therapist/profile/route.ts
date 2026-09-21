import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedTherapistSession } from '@/lib/auth-session';

export async function GET() {
  try {
    const session = await getVerifiedTherapistSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your therapist portal access' },
        { status: 401 }
      );
    }

    const therapist = await db.therapist.findUnique({
      where: { id: session.entityId },
      include: {
        services: {
          include: { service: true },
        },
        availabilities: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        serviceAreas: {
          orderBy: { cityName: 'asc' },
        },
        photos: {
          orderBy: { sortOrder: 'asc' },
        },
        bookings: {
          include: {
            service: true,
            customer: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { appointmentDateTime: 'desc' },
        },
      },
    });

    if (!therapist || !therapist.isActive) {
      return NextResponse.json(
        { error: 'Therapist account not found or inactive' },
        { status: 404 }
      );
    }

    // Calculate earnings summary derived strictly from COMPLETED and PAID bookings
    const completedBookings = therapist.bookings.filter(
      (b) => b.status === 'COMPLETED' && b.paymentStatus === 'PAID'
    );
    const totalEarned = completedBookings.reduce((sum, b) => sum + b.amount, 0);

    return NextResponse.json({
      therapist: {
        id: therapist.id,
        name: therapist.name,
        bio: therapist.bio,
        profileImage: therapist.profileImage,
        email: therapist.email,
        phone: therapist.phone,
        rating: therapist.rating,
        reviewCount: therapist.reviewCount,
        offersStudio: therapist.offersStudio,
        offersInHome: therapist.offersInHome,
        photos: therapist.photos,
        services: therapist.services.map((ts) => ({
          id: ts.id,
          serviceId: ts.serviceId,
          serviceName: ts.service.name,
          basePrice: ts.service.price,
          baseDurationMinutes: ts.service.durationMinutes,
          customPrice: ts.customPrice,
          customDurationMinutes: ts.customDurationMinutes,
          effectivePrice: ts.customPrice ?? ts.service.price,
          effectiveDurationMinutes: ts.customDurationMinutes ?? ts.service.durationMinutes,
          isActive: ts.isActive,
        })),
        availabilities: therapist.availabilities,
        serviceAreas: therapist.serviceAreas,
        earningsSummary: {
          totalEarned,
          completedAppointmentsCount: completedBookings.length,
        },
        appointments: therapist.bookings.map((b) => ({
          id: b.id,
          bookingNumber: b.bookingNumber,
          customerName: b.customer.name,
          serviceName: b.service?.name || 'Massage Therapy Session',
          durationMinutes: b.durationMinutes,
          appointmentDateTime: b.appointmentDateTime.toISOString(),
          locationType: b.locationType,
          addressLine1: b.addressLine1,
          city: b.city,
          state: b.state,
          zipCode: b.zipCode,
          status: b.status,
          amount: b.amount,
          paymentStatus: b.paymentStatus,
        })),
      },
    });
  } catch (error) {
    console.error('Error loading therapist profile:', error);
    return NextResponse.json(
      { error: 'An error occurred while loading therapist profile' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getVerifiedTherapistSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your therapist portal access' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, bio, profileImage, offersStudio, offersInHome } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const updated = await db.therapist.update({
      where: { id: session.entityId },
      data: {
        name: name.trim(),
        bio: bio ? String(bio).trim() : null,
        profileImage: profileImage ? String(profileImage).trim() : null,
        offersStudio: typeof offersStudio === 'boolean' ? offersStudio : true,
        offersInHome: typeof offersInHome === 'boolean' ? offersInHome : true,
      },
    });

    return NextResponse.json({
      message: 'Therapist profile updated successfully',
      therapist: {
        id: updated.id,
        name: updated.name,
        bio: updated.bio,
        profileImage: updated.profileImage,
        offersStudio: updated.offersStudio,
        offersInHome: updated.offersInHome,
      },
    });
  } catch (error) {
    console.error('Error updating therapist profile:', error);
    return NextResponse.json(
      { error: 'An error occurred while updating therapist profile' },
      { status: 500 }
    );
  }
}
