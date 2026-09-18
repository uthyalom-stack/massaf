import React from 'react';
import { AddTherapistForm } from '@/components/admin/AddTherapistForm';

export const metadata = {
  title: 'Add New Therapist | MASSAF Admin',
};

export default function AddTherapistPage() {
  const apiKey = process.env.MASSAF_ADMIN_API_KEY || '';
  return <AddTherapistForm apiKey={apiKey} />;
}
