import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { availabilitySchema, availabilityUpdateSchema } from '@/lib/validations/admin-therapist';
import { verifyAdminApiKey } from '@/lib/admin-guard';
import { parseTimeStringToMinutes } from '@/lib/availability';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await verifyAdminApiKey(request);
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
    const validated = availabilitySchema.parse(body);

    const startMins = parseTimeStringToMinutes(validated.startTime);
    const endMins = parseTimeStringToMinutes(validated.endTime);
    if (startMins >= endMins) {
      return NextResponse.json(
        { success: false, error: 'Start time must be strictly before end time.' },
        { status: 400 }
      );
    }

    if (validated.dayOfWeek !== undefined && validated.dayOfWeek !== null) {
      if (validated.dayOfWeek < 0 || validated.dayOfWeek > 6) {
        return NextResponse.json(
          { success: false, error: 'Invalid day of week. Must be between 0 and 6.' },
          { status: 400 }
        );
      }
    }

    const specDate = validated.specificDate ? new Date(validated.specificDate) : null;
    const existingWindows = await db.therapistAvailability.findMany({
      where: {
        therapistId: id,
        dayOfWeek: validated.dayOfWeek ?? null,
        specificDate: specDate,
      },
    });

    const hasOverlap = existingWindows.some((e) => {
      const eStart = parseTimeStringToMinutes(e.startTime);
      const eEnd = parseTimeStringToMinutes(e.endTime);
      return startMins < eEnd && endMins > eStart;
    });

    if (hasOverlap) {
      return NextResponse.json(
        { success: false, error: 'This time range overlaps with an existing availability entry for this therapist.' },
        { status: 400 }
      );
    }

    const availability = await db.therapistAvailability.create({
      data: {
        therapistId: id,
        dayOfWeek: validated.dayOfWeek ?? null,
        specificDate: specDate,
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
  const authError = await verifyAdminApiKey(request);
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

    const targetDayOfWeek = validated.dayOfWeek !== undefined ? validated.dayOfWeek : existingAvailability.dayOfWeek;
    const targetSpecDate = validated.specificDate !== undefined
      ? (validated.specificDate ? new Date(validated.specificDate) : null)
      : existingAvailability.specificDate;
    const targetStartTime = validated.startTime ?? existingAvailability.startTime;
    const targetEndTime = validated.endTime ?? existingAvailability.endTime;

    const startMins = parseTimeStringToMinutes(targetStartTime);
    const endMins = parseTimeStringToMinutes(targetEndTime);
    if (startMins >= endMins) {
      return NextResponse.json(
        { success: false, error: 'Start time must be strictly before end time.' },
        { status: 400 }
      );
    }

    if (targetDayOfWeek !== undefined && targetDayOfWeek !== null) {
      if (targetDayOfWeek < 0 || targetDayOfWeek > 6) {
        return NextResponse.json(
          { success: false, error: 'Invalid day of week. Must be between 0 and 6.' },
          { status: 400 }
        );
      }
    }

    const existingWindows = await db.therapistAvailability.findMany({
      where: {
        therapistId: id,
        id: { not: validated.availabilityId },
        dayOfWeek: targetDayOfWeek,
        specificDate: targetSpecDate,
      },
    });

    const hasOverlap = existingWindows.some((e) => {
      const eStart = parseTimeStringToMinutes(e.startTime);
      const eEnd = parseTimeStringToMinutes(e.endTime);
      return startMins < eEnd && endMins > eStart;
    });

    if (hasOverlap) {
      return NextResponse.json(
        { success: false, error: 'This time range overlaps with an existing availability entry for this therapist.' },
        { status: 400 }
      );
    }

    const updated = await db.therapistAvailability.update({
      where: { id: validated.availabilityId },
      data: {
        dayOfWeek: targetDayOfWeek,
        specificDate: targetSpecDate,
        startTime: targetStartTime,
        endTime: targetEndTime,
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
  const authError = await verifyAdminApiKey(request);
  if (authError) return authError;

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
