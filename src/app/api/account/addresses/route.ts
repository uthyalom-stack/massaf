import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedCustomerSession } from '@/lib/auth-session';

export async function GET() {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to view saved addresses' },
        { status: 401 }
      );
    }

    const addresses = await db.customerAddress.findMany({
      where: { customerId: session.entityId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ addresses });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching saved addresses' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to add addresses' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { label, addressLine1, addressLine2, city, state, zipCode } = body;

    if (!addressLine1 || !city || !state || !zipCode) {
      return NextResponse.json(
        { error: 'Street address, city, state, and ZIP code are required' },
        { status: 400 }
      );
    }

    const newAddress = await db.customerAddress.create({
      data: {
        customerId: session.entityId,
        label: label ? String(label).trim() : 'Home',
        addressLine1: String(addressLine1).trim(),
        addressLine2: addressLine2 ? String(addressLine2).trim() : null,
        city: String(city).trim(),
        state: String(state).trim().toUpperCase(),
        zipCode: String(zipCode).trim(),
      },
    });

    return NextResponse.json(
      { message: 'Address saved successfully', address: newAddress },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating address:', error);
    return NextResponse.json(
      { error: 'An error occurred while saving address' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to delete addresses' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Address ID parameter is required' },
        { status: 400 }
      );
    }

    // Strict server-side ownership verification
    const existing = await db.customerAddress.findFirst({
      where: {
        id,
        customerId: session.entityId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Address not found or unauthorized' },
        { status: 404 }
      );
    }

    await db.customerAddress.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ message: 'Address removed successfully' });
  } catch (error) {
    console.error('Error deleting address:', error);
    return NextResponse.json(
      { error: 'An error occurred while deleting address' },
      { status: 500 }
    );
  }
}
