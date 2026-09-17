import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { therapistBaseSchema } from '@/lib/validations/admin-therapist';

export async function GET() {
  try {
    const therapists = await db.therapist.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            services: true,
            serviceAreas: true,
            photos: true,
          },
        },
      },
    });
    return NextResponse.json({ success: true, therapists });
  } catch (error) {
    console.error('Error fetching therapists API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch therapists' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = therapistBaseSchema.parse(body);

    // Check for duplicate email if email is provided
    if (validated.email) {
      const existing = await db.therapist.findUnique({
        where: { email: validated.email },
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'A therapist with this email address already exists.' },
          { status: 400 }
        );
      }
    }

    const therapist = await db.therapist.create({
      data: {
        name: validated.name,
        bio: validated.bio || null,
        profileImage: validated.profileImage || null,
        email: validated.email || null,
        phone: validated.phone || null,
        isActive: validated.isActive,
        isFeatured: validated.isFeatured,
        offersStudio: validated.offersStudio,
        offersInHome: validated.offersInHome,
      },
    });

    return NextResponse.json({ success: true, therapist }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating therapist API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create therapist record' },
      { status: 500 }
    );
  }
}
