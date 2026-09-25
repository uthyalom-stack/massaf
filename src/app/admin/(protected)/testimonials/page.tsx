import React from 'react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { TestimonialManagementClient } from '@/components/admin/TestimonialManagementClient';

export const metadata = {
  title: 'Testimonials Management | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

export default async function AdminTestimonialsPage() {
  const session = await getVerifiedAdminSession();
  if (!session) redirect('/admin/login');
  if (session.role === 'STAFF') redirect('/admin/marketer');

  const [rawTestimonials, rawTherapists] = await Promise.all([
    db.testimonial.findMany({
      include: {
        therapist: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.therapist.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const testimonials = rawTestimonials.map((t) => ({
    id: t.id,
    authorName: t.authorName,
    authorLocation: t.authorLocation,
    rating: t.rating,
    comment: t.comment,
    isPublished: t.isPublished,
    sortOrder: t.sortOrder,
    therapistId: t.therapistId,
    therapistName: t.therapist.name,
    createdAt: t.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Testimonials Management
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Manage promotional testimonials displayed on the public homepage.
        </p>
      </div>

      <TestimonialManagementClient
        initialTestimonials={testimonials}
        therapists={rawTherapists}
      />
    </div>
  );
}
