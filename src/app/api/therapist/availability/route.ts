import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedTherapistSession } from '@/lib/auth-session';

function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1] || '0', 10);
  return hh * 60 + mm;
}

export async function GET() {
  try {
    const session = await getVerifiedTherapistSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your therapist portal access' },
        { status: 401 }
      );
    }

    const availabilities = await db.therapistAvailability.findMany({
      where: { therapistId: session.entityId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return NextResponse.json({ availabilities });
  } catch (error) {
    console.error('Error fetching availability schedule:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching availability' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedTherapistSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your therapist portal access' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { dayOfWeek, specificDate, startTime, endTime, isUnavailable } = body;

    if ((dayOfWeek === undefined || dayOfWeek === null) && !specificDate) {
      return NextResponse.json(
        { error: 'Either dayOfWeek (0-6) or specificDate must be provided' },
        { status: 400 }
      );
    }

    if (!startTime || !endTime) {
      return NextResponse.json(
        { error: 'Start time and end time are required' },
        { status: 400 }
      );
    }

    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);

    if (isNaN(startMins) || isNaN(endMins) || startMins >= endMins) {
      return NextResponse.json(
        { error: 'Start time must be strictly earlier than end time' },
        { status: 400 }
      );
    }

    const parsedDayOfWeek = dayOfWeek !== undefined && dayOfWeek !== null ? parseInt(String(dayOfWeek), 10) : null;
    const parsedSpecificDate = specificDate ? new Date(specificDate) : null;

    // Server-side overlap check against existing therapist availability windows
    const existing = await db.therapistAvailability.findMany({
      where: {
        therapistId: session.entityId,
        ...(parsedDayOfWeek !== null ? { dayOfWeek: parsedDayOfWeek } : {}),
        ...(parsedSpecificDate !== null ? { specificDate: parsedSpecificDate } : {}),
      },
    });

    const hasOverlap = existing.some((item) => {
      const eStart = timeToMinutes(item.startTime);
      const eEnd = timeToMinutes(item.endTime);
      return eStart < endMins && eEnd > startMins;
    });

    if (hasOverlap) {
      return NextResponse.json(
        { error: 'The submitted availability window overlaps with an existing window on the same day' },
        { status: 400 }
      );
    }

    const created = await db.therapistAvailability.create({
      data: {
        therapistId: session.entityId,
        dayOfWeek: parsedDayOfWeek,
        specificDate: parsedSpecificDate,
        startTime: String(startTime).trim(),
        endTime: String(endTime).trim(),
        isUnavailable: typeof isUnavailable === 'boolean' ? isUnavailable : false,
      },
    });

    return NextResponse.json(
      { message: 'Availability schedule window saved successfully', availability: created },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error adding availability window:', error);
    return NextResponse.json(
      { error: 'An error occurred while saving availability schedule' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getVerifiedTherapistSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your therapist portal access' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Availability ID parameter is required' },
        { status: 400 }
      );
    }

    // Strict ownership check
    const existing = await db.therapistAvailability.findFirst({
      where: {
        id,
        therapistId: session.entityId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Availability entry not found or unauthorized' },
        { status: 404 }
      );
    }

    await db.therapistAvailability.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ message: 'Availability window removed successfully' });
  } catch (error) {
    console.error('Error deleting availability entry:', error);
    return NextResponse.json(
      { error: 'An error occurred while removing availability entry' },
      { status: 500 }
    );
  }
}
