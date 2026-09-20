import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedTherapistSession } from '@/lib/auth-session';

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
    const { therapistServiceId, customPrice, customDurationMinutes, isActive } = body;

    if (!therapistServiceId || typeof therapistServiceId !== 'string') {
      return NextResponse.json(
        { error: 'Therapist service ID is required' },
        { status: 400 }
      );
    }

    // Strict ownership verification: verify the TherapistService belongs to the authenticated therapist
    const existingTs = await db.therapistService.findFirst({
      where: {
        id: therapistServiceId,
        therapistId: session.entityId,
      },
      include: { service: true },
    });

    if (!existingTs) {
      return NextResponse.json(
        { error: 'Therapist service record not found or unauthorized' },
        { status: 404 }
      );
    }

    let parsedCustomPrice: number | null = null;
    if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
      parsedCustomPrice = parseFloat(String(customPrice));
      if (isNaN(parsedCustomPrice) || parsedCustomPrice <= 0) {
        return NextResponse.json(
          { error: 'Custom price must be a valid positive number' },
          { status: 400 }
        );
      }
    }

    let parsedCustomDuration: number | null = null;
    if (customDurationMinutes !== undefined && customDurationMinutes !== null && customDurationMinutes !== '') {
      parsedCustomDuration = parseInt(String(customDurationMinutes), 10);
      if (isNaN(parsedCustomDuration) || parsedCustomDuration < 15) {
        return NextResponse.json(
          { error: 'Custom duration must be at least 15 minutes' },
          { status: 400 }
        );
      }
    }

    // Update ONLY the TherapistService override record; NEVER modify global Service records
    const updatedTs = await db.therapistService.update({
      where: { id: existingTs.id },
      data: {
        customPrice: parsedCustomPrice,
        customDurationMinutes: parsedCustomDuration,
        isActive: typeof isActive === 'boolean' ? isActive : existingTs.isActive,
      },
    });

    return NextResponse.json({
      message: 'Therapist service pricing updated successfully',
      therapistService: updatedTs,
    });
  } catch (error) {
    console.error('Error updating therapist service:', error);
    return NextResponse.json(
      { error: 'An error occurred while updating service parameters' },
      { status: 500 }
    );
  }
}
