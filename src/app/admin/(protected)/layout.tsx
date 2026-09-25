import React from 'react';
import { redirect } from 'next/navigation';
import { getVerifiedAdminSession, clearAdminSessionCookie } from '@/lib/auth-session';
import { AdminSidebarLayout, NavSection } from '@/components/admin/AdminSidebarLayout';

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect('/admin/login');
  }

  const isMarketer = session.role === 'STAFF';

  const navSections: NavSection[] = isMarketer
    ? [
        {
          title: 'PORTAL',
          links: [
            { label: 'Dashboard', href: '/admin/marketer' },
            { label: 'Leaderboard', href: '/admin/leaderboard' },
          ],
        },
      ]
    : [
        {
          title: 'OVERVIEW',
          links: [{ label: 'Dashboard', href: '/admin' }],
        },
        {
          title: 'OPERATIONS',
          links: [
            { label: 'Bookings', href: '/admin/bookings' },
            { label: 'Payments', href: '/admin/payments' },
            { label: 'Customers', href: '/admin/customers' },
            { label: 'Notifications', href: '/admin/notifications' },
          ],
        },
        {
          title: 'PEOPLE',
          links: [
            { label: 'Therapists', href: '/admin/therapists' },
            { label: 'Reviews', href: '/admin/reviews' },
            { label: 'Testimonials', href: '/admin/testimonials' },
          ],
        },
        {
          title: 'MARKETING',
          links: [
            { label: 'Marketers', href: '/admin/marketers' },
            { label: 'Marketing Links', href: '/admin/marketing-links' },
            { label: 'Leaderboard', href: '/admin/leaderboard' },
          ],
        },
        {
          title: 'CONTENT',
          links: [{ label: 'Content CMS', href: '/admin/content' }],
        },
        {
          title: 'SYSTEM',
          links: [
            { label: 'Services', href: '/admin/services' },
            { label: 'Categories', href: '/admin/categories' },
            { label: 'Settings', href: '/admin/settings' },
            { label: 'Audit Log', href: '/admin/audit-log' },
            ...(session.role === 'SUPER_ADMIN'
              ? [{ label: 'Admin Users', href: '/admin/admin-users' }]
              : []),
          ],
        },
      ];

  async function handleSignOut() {
    'use server';
    await clearAdminSessionCookie();
    redirect('/admin/login');
  }

  return (
    <AdminSidebarLayout
      navSections={navSections}
      isMarketer={isMarketer}
      userEmail={session.email}
      userRole={session.role || 'ADMIN'}
      signOutAction={handleSignOut}
    >
      {children}
    </AdminSidebarLayout>
  );
}
