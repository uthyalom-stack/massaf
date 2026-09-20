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

    const serviceAreas = await db.serviceArea.findMany({
      where: { therapistId: session.entityId },
      orderBy: { cityName: 'asc' },
    });

    return NextResponse.json({ serviceAreas });
  } catch (error) {
    console.error('Error fetching service areas:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching service coverage areas' },
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
    const { cityName, state, zipCode } = body;

    if (!cityName || !state || !zipCode) {
      return NextResponse.json(
        { error: 'City name, state code, and ZIP code are required' },
        { status: 400 }
      );
    }

    const cleanCity = String(cityName).trim();
    const cleanState = String(state).trim().toUpperCase();
    const cleanZip = String(zipCode).trim();

    if (cleanState.length !== 2) {
      return NextResponse.json(
        { error: 'State must be a 2-letter state abbreviation (e.g. NY, CA)' },
        { status: 400 }
      );
    }

    // Check for duplicate service area record for this therapist
    const existing = await db.serviceArea.findFirst({
      where: {
        therapistId: session.entityId,
        zipCode: cleanZip,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Service area ZIP code is already in your covered locations' },
        { status: 400 }
      );
    }

    const created = await db.serviceArea.create({
      data: {
        therapistId: session.entityId,
        cityName: cleanCity,
        state: cleanState,
        zipCode: cleanZip,
      },
    });

    return NextResponse.json(
      { message: 'Service coverage area added successfully', serviceArea: created },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error adding service area:', error);
    return NextResponse.json(
      { error: 'An error occurred while adding service area' },
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
        { error: 'Service Area ID parameter is required' },
        { status: 400 }
      );
    }

    // Strict ownership verification
    const existing = await db.serviceArea.findFirst({
      where: {
        id,
        therapistId: session.entityId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Service area not found or unauthorized' },
        { status: 404 }
      );
    }

    await db.serviceArea.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ message: 'Service area removed successfully' });
  } catch (error) {
    console.error('Error deleting service area:', error);
    return NextResponse.json(
      { error: 'An error occurred while deleting service area' },
      { status: 500 }
    );
  }
}
