import React from 'react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import {
  ServiceManagementClient,
  AdminServiceItem,
  AdminCategoryOption,
} from '@/components/admin/ServiceManagementClient';

export const metadata = {
  title: 'Service Management | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

export default async function AdminServicesPage() {
  const session = await getVerifiedAdminSession();
  if (!session || session.role === 'STAFF') {
    redirect('/admin/marketer');
  }

  let initialServices: AdminServiceItem[] = [];
  let categories: AdminCategoryOption[] = [];

  try {
    const dbCategories = await db.serviceCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    });
    categories = dbCategories;

    const dbServices = await db.service.findMany({
      include: {
        category: {
          select: { name: true },
        },
        _count: {
          select: {
            therapists: true,
            bookings: true,
          },
        },
      },
      orderBy: [{ name: 'asc' }],
    });

    initialServices = dbServices.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      price: s.price,
      isActive: s.isActive,
      categoryId: s.categoryId,
      categoryName: s.category?.name || null,
      therapistCount: s._count.therapists,
      bookingCount: s._count.bookings,
    }));
  } catch (err) {
    console.error('Error loading admin services:', err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Service Management
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Manage system global services, categories, default duration, price, and active availability.
        </p>
      </div>

      <ServiceManagementClient
        initialServices={initialServices}
        categories={categories}
      />
    </div>
  );
}
