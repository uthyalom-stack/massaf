import React from 'react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { AddTherapistForm } from '@/components/admin/AddTherapistForm';

export const metadata = {
  title: 'Add New Therapist | MASSAF Admin',
};

export default async function AddTherapistPage() {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect('/admin/login');
  }
  if (session.role === 'STAFF') {
    redirect('/admin/marketer');
  }

  const globalServices = await db.service.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, durationMinutes: true, price: true },
  });

  return <AddTherapistForm availableGlobalServices={globalServices} />;
}
