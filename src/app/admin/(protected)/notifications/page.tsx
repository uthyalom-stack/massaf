import React from 'react';
import { redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { listAdminNotificationsAction } from '@/app/admin/actions';
import { NotificationCenterClient } from '@/components/admin/NotificationCenterClient';

export const metadata = {
  title: 'Admin Notifications Center | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    unreadOnly?: string;
  }>;
}

export default async function AdminNotificationsPage({ searchParams }: PageProps) {
  const session = await getVerifiedAdminSession();
  if (!session) redirect('/admin/login');
  if (session.role === 'STAFF') redirect('/admin/marketer');

  const params = await searchParams;
  const unreadOnly = params.unreadOnly === 'true';

  const res = await listAdminNotificationsAction(unreadOnly, 50);
  const notifications = res.success ? res.notifications || [] : [];
  const unreadCount = res.success ? res.unreadCount || 0 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Admin Notifications Center
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Operational alerts for new bookings, gift card payments, submitted reviews, and system events.
        </p>
      </div>

      <NotificationCenterClient
        initialNotifications={notifications}
        unreadCount={unreadCount}
        unreadOnlyFilter={unreadOnly}
      />
    </div>
  );
}
