import React from 'react';
import { redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { TherapistImportClient } from '@/components/admin/TherapistImportClient';

export const metadata = {
  title: 'Import Therapists from CSV | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

export default async function AdminTherapistImportPage() {
  const session = await getVerifiedAdminSession();
  if (!session) redirect('/admin/login');
  if (session.role === 'STAFF') redirect('/admin/marketer');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Import Therapists from CSV
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Bulk import known therapist profile information, service offerings, and recurring availability schedules from CSV files.
        </p>
      </div>

      <TherapistImportClient />
    </div>
  );
}
