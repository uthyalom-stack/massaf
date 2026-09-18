import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { availabilitySchema, availabilityUpdateSchema } from '@/lib/validations/admin-therapist';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const validated = availabilitySchema.parse(body);

    const availability = await db.therapistAvailability.create({
      data: {
        therapistId: id,
        dayOfWeek: validated.dayOfWeek ?? null,
        specificDate: validated.specificDate ? new Date(validated.specificDate) : null,
        startTime: validated.startTime,
        endTime: validated.endTime,
        isUnavailable: validated.isUnavailable,
      },
    });

    return NextResponse.json({ success: true, availability }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error adding availability API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add availability entry' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const validated = availabilityUpdateSchema.parse(body);

    const existingAvailability = await db.therapistAvailability.findFirst({
      where: {
        id: validated.availabilityId,
        therapistId: id,
      },
    });

    if (!existingAvailability) {
      return NextResponse.json(
        { success: false, error: 'Availability entry not found for this therapist' },
        { status: 404 }
      );
    }

    const updated = await db.therapistAvailability.update({
      where: { id: validated.availabilityId },
      data: {
        dayOfWeek: validated.dayOfWeek !== undefined ? validated.dayOfWeek : existingAvailability.dayOfWeek,
        specificDate: validated.specificDate !== undefined
          ? (validated.specificDate ? new Date(validated.specificDate) : null)
          : existingAvailability.specificDate,
        startTime: validated.startTime ?? existingAvailability.startTime,
        endTime: validated.endTime ?? existingAvailability.endTime,
        isUnavailable: validated.isUnavailable !== undefined ? validated.isUnavailable : existingAvailability.isUnavailable,
      },
    });

    return NextResponse.json({ success: true, availability: updated });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating availability API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update availability entry' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const availabilityId = searchParams.get('availabilityId');

  if (!availabilityId) {
    return NextResponse.json(
      { success: false, error: 'availabilityId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const availability = await db.therapistAvailability.findFirst({
      where: { id: availabilityId, therapistId: id },
    });

    if (!availability) {
      return NextResponse.json(
        { success: false, error: 'Availability entry not found for this therapist' },
        { status: 404 }
      );
    }

    await db.therapistAvailability.delete({ where: { id: availabilityId } });

    return NextResponse.json({ success: true, message: 'Availability entry removed' });
  } catch (error) {
    console.error('Error deleting availability API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove availability entry' },
      { status: 500 }
    );
  }
}
