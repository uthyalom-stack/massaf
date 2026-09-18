import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { therapistBaseSchema } from '@/lib/validations/admin-therapist';
import { verifyAdminApiKey } from '@/lib/admin-guard';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyAdminApiKey(request);
  if (authError) return authError;

  const { id } = await params;

  try {
    const therapist = await db.therapist.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        services: { include: { service: true } },
        serviceAreas: { orderBy: { cityName: 'asc' } },
        availabilities: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      },
    });

    if (!therapist) {
      return NextResponse.json(
        { success: false, error: 'Therapist not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, therapist });
  } catch (error) {
    console.error('Error fetching therapist API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch therapist' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyAdminApiKey(request);
  if (authError) return authError;

  const { id } = await params;

  try {
    const therapist = await db.therapist.findUnique({ where: { id } });
    if (!therapist) {
      return NextResponse.json(
        { success: false, error: 'Therapist not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validated = therapistBaseSchema.partial().parse(body);

    if (validated.email && validated.email !== therapist.email) {
      const existing = await db.therapist.findUnique({
        where: { email: validated.email },
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Email address is already in use by another therapist.' },
          { status: 400 }
        );
      }
    }

    const updated = await db.therapist.update({
      where: { id },
      data: {
        ...(validated.name !== undefined && { name: validated.name }),
        ...(validated.bio !== undefined && { bio: validated.bio }),
        ...(validated.profileImage !== undefined && { profileImage: validated.profileImage }),
        ...(validated.email !== undefined && { email: validated.email }),
        ...(validated.phone !== undefined && { phone: validated.phone }),
        ...(validated.isActive !== undefined && { isActive: validated.isActive }),
        ...(validated.isFeatured !== undefined && { isFeatured: validated.isFeatured }),
        ...(validated.offersStudio !== undefined && { offersStudio: validated.offersStudio }),
        ...(validated.offersInHome !== undefined && { offersInHome: validated.offersInHome }),
      },
    });

    return NextResponse.json({ success: true, therapist: updated });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating therapist API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update therapist' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyAdminApiKey(request);
  if (authError) return authError;

  const { id } = await params;

  try {
    const therapist = await db.therapist.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            bookings: true,
            reviews: true,
          },
        },
      },
    });

    if (!therapist) {
      return NextResponse.json(
        { success: false, error: 'Therapist not found' },
        { status: 404 }
      );
    }

    // Safety check: Prevent deletion if therapist has associated bookings or reviews
    if (therapist._count.bookings > 0 || therapist._count.reviews > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete therapist with active records (${therapist._count.bookings} booking(s), ${therapist._count.reviews} review(s)). Consider deactivating instead.`,
        },
        { status: 400 }
      );
    }

    await db.therapist.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Therapist deleted successfully' });
  } catch (error) {
    console.error('Error deleting therapist API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete therapist' },
      { status: 500 }
    );
  }
}
