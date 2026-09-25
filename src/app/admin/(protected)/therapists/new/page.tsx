import React from 'react';
import { redirect } from 'next/navigation';
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

  return <AddTherapistForm />;
}
