import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { therapistServiceSchema } from '@/lib/validations/admin-therapist';
import { verifyAdminApiKey } from '@/lib/admin-guard';

export async function GET(request: Request) {
  const authError = verifyAdminApiKey(request);
  if (authError) return authError;

  try {
    const services = await db.service.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ success: true, services });
  } catch (error) {
    console.error('Error fetching services API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch services' },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const validated = therapistServiceSchema.parse(body);

    const service = await db.service.findUnique({
      where: { id: validated.serviceId },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: 'Referenced service not found' },
        { status: 404 }
      );
    }

    const therapistService = await db.therapistService.upsert({
      where: {
        therapistId_serviceId: {
          therapistId: id,
          serviceId: validated.serviceId,
        },
      },
      update: {
        customPrice: validated.customPrice ?? null,
        customDurationMinutes: validated.customDurationMinutes ?? null,
        isActive: validated.isActive,
      },
      create: {
        therapistId: id,
        serviceId: validated.serviceId,
        customPrice: validated.customPrice ?? null,
        customDurationMinutes: validated.customDurationMinutes ?? null,
        isActive: validated.isActive,
      },
      include: {
        service: true,
      },
    });

    return NextResponse.json({ success: true, therapistService }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error assigning therapist service API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to assign service' },
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
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get('serviceId');

  if (!serviceId) {
    return NextResponse.json(
      { success: false, error: 'serviceId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const therapistService = await db.therapistService.findUnique({
      where: {
        therapistId_serviceId: {
          therapistId: id,
          serviceId: serviceId,
        },
      },
    });

    if (!therapistService) {
      return NextResponse.json(
        { success: false, error: 'Service assignment not found for therapist' },
        { status: 404 }
      );
    }

    await db.therapistService.delete({
      where: {
        therapistId_serviceId: {
          therapistId: id,
          serviceId: serviceId,
        },
      },
    });

    return NextResponse.json({ success: true, message: 'Service assignment removed' });
  } catch (error) {
    console.error('Error deleting therapist service API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove service assignment' },
      { status: 500 }
    );
  }
}
