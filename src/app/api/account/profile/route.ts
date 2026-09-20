import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedCustomerSession } from '@/lib/auth-session';

export async function GET() {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to view your bookings' },
        { status: 401 }
      );
    }

    const customer = await db.customer.findUnique({
      where: { id: session.entityId },
      include: {
        bookings: {
          include: {
            therapist: {
              select: {
                id: true,
                name: true,
                profileImage: true,
                phone: true,
                email: true,
              },
            },
            service: true,
            review: true,
          },
          orderBy: { appointmentDateTime: 'desc' },
        },
        addresses: true,
        favorites: {
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
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        addresses: customer.addresses,
        favorites: customer.favorites.map((f) => ({
          id: f.id,
          therapistId: f.therapistId,
          therapistName: f.therapist.name,
          profileImage: f.therapist.profileImage,
          rating: f.therapist.rating,
          reviewCount: f.therapist.reviewCount,
          offersStudio: f.therapist.offersStudio,
          offersInHome: f.therapist.offersInHome,
        })),
        bookings: customer.bookings.map((b) => ({
          id: b.id,
          bookingNumber: b.bookingNumber,
          appointmentDateTime: b.appointmentDateTime.toISOString(),
          durationMinutes: b.durationMinutes,
          locationType: b.locationType,
          addressLine1: b.addressLine1,
          addressLine2: b.addressLine2,
          city: b.city,
          state: b.state,
          zipCode: b.zipCode,
          notes: b.notes,
          status: b.status,
          amount: b.amount,
          paymentStatus: b.paymentStatus,
          paymentMethod: b.paymentMethod,
          therapistId: b.therapistId,
          serviceId: b.serviceId,
          therapistName: b.therapist?.name || 'Assigned Therapist',
          therapistImage: b.therapist?.profileImage || null,
          serviceName: b.service?.name || 'Massage Therapy Session',
          hasReview: !!b.review,
          review: b.review
            ? {
                id: b.review.id,
                rating: b.review.rating,
                comment: b.review.comment,
                status: b.review.status,
              }
            : null,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching customer account profile:', error);
    return NextResponse.json(
      { error: 'An error occurred while loading your profile' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to edit profile' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, phone } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    const updatedCustomer = await db.customer.update({
      where: { id: session.entityId },
      data: {
        name: name.trim(),
        phone: phone.trim(),
      },
    });

    return NextResponse.json({
      message: 'Profile updated successfully',
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        email: updatedCustomer.email,
        phone: updatedCustomer.phone,
      },
    });
  } catch (error) {
    console.error('Error updating customer profile:', error);
    return NextResponse.json(
      { error: 'An error occurred while updating your profile' },
      { status: 500 }
    );
  }
}
