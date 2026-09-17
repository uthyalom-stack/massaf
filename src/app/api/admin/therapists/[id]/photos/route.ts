import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { photoSchema } from '@/lib/validations/admin-therapist';

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
    const validated = photoSchema.parse(body);

    const photo = await db.therapistPhoto.create({
      data: {
        therapistId: id,
        url: validated.url,
        altText: validated.altText || null,
        sortOrder: validated.sortOrder ?? 0,
      },
    });

    return NextResponse.json({ success: true, photo }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error adding therapist photo API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add photo' },
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
  const photoId = searchParams.get('photoId');

  if (!photoId) {
    return NextResponse.json(
      { success: false, error: 'photoId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const photo = await db.therapistPhoto.findFirst({
      where: { id: photoId, therapistId: id },
    });

    if (!photo) {
      return NextResponse.json(
        { success: false, error: 'Photo not found for this therapist' },
        { status: 404 }
      );
    }

    await db.therapistPhoto.delete({ where: { id: photoId } });

    return NextResponse.json({ success: true, message: 'Photo deleted' });
  } catch (error) {
    console.error('Error deleting therapist photo API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete photo' },
      { status: 500 }
    );
  }
}
