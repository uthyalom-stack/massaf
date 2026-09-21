import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedCustomerSession } from '@/lib/auth-session';

export async function GET() {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to view favorites' },
        { status: 401 }
      );
    }

    const favorites = await db.customerFavorite.findMany({
      where: { customerId: session.entityId },
      include: {
        therapist: {
          select: {
            id: true,
            name: true,
            profileImage: true,
            rating: true,
            reviewCount: true,
            offersStudio: true,
            offersInHome: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      favorites: favorites.map((f) => ({
        id: f.id,
        therapistId: f.therapistId,
        therapistName: f.therapist.name,
        profileImage: f.therapist.profileImage,
        rating: f.therapist.rating,
        reviewCount: f.therapist.reviewCount,
        offersStudio: f.therapist.offersStudio,
        offersInHome: f.therapist.offersInHome,
        bio: f.therapist.bio,
      })),
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching saved therapists' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to manage favorites' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { therapistId } = body;

    if (!therapistId || typeof therapistId !== 'string') {
      return NextResponse.json(
        { error: 'Therapist ID parameter is required' },
        { status: 400 }
      );
    }

    const therapist = await db.therapist.findFirst({
      where: { id: therapistId, isActive: true },
    });

    if (!therapist) {
      return NextResponse.json(
        { error: 'Therapist not found or inactive' },
        { status: 404 }
      );
    }

    // Toggle logic: If already favorited, remove it; if not, create it.
    const existing = await db.customerFavorite.findUnique({
      where: {
        customerId_therapistId: {
          customerId: session.entityId,
          therapistId,
        },
      },
    });

    if (existing) {
      await db.customerFavorite.delete({
        where: { id: existing.id },
      });
      return NextResponse.json({
        message: 'Therapist removed from favorites',
        isFavorite: false,
      });
    } else {
      const created = await db.customerFavorite.create({
        data: {
          customerId: session.entityId,
          therapistId,
        },
      });
      return NextResponse.json({
        message: 'Therapist added to favorites',
        isFavorite: true,
        favoriteId: created.id,
      });
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
    return NextResponse.json(
      { error: 'An error occurred while updating saved therapists' },
      { status: 500 }
    );
  }
}
