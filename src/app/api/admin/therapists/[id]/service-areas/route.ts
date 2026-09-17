import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { serviceAreaSchema } from '@/lib/validations/admin-therapist';

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
    const validated = serviceAreaSchema.parse(body);

    const serviceArea = await db.serviceArea.create({
      data: {
        therapistId: id,
        cityName: validated.cityName,
        state: validated.state,
        zipCode: validated.zipCode,
      },
    });

    return NextResponse.json({ success: true, serviceArea }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error adding service area API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add service area' },
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
  const areaId = searchParams.get('areaId');

  if (!areaId) {
    return NextResponse.json(
      { success: false, error: 'areaId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const serviceArea = await db.serviceArea.findFirst({
      where: { id: areaId, therapistId: id },
    });

    if (!serviceArea) {
      return NextResponse.json(
        { success: false, error: 'Service area not found for this therapist' },
        { status: 404 }
      );
    }

    await db.serviceArea.delete({ where: { id: areaId } });

    return NextResponse.json({ success: true, message: 'Service area removed' });
  } catch (error) {
    console.error('Error deleting service area API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove service area' },
      { status: 500 }
    );
  }
}
