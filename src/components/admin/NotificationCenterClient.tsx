'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  markAdminNotificationReadAction,
  markAllAdminNotificationsReadAction,
} from '@/app/admin/actions';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationCenterClientProps {
  initialNotifications: NotificationItem[];
  unreadCount: number;
  unreadOnlyFilter?: boolean;
}

export function NotificationCenterClient({
  initialNotifications,
  unreadCount,
  unreadOnlyFilter = false,
}: NotificationCenterClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleMarkRead = (id: string) => {
    startTransition(async () => {
      await markAdminNotificationReadAction(id);
      router.refresh();
    });
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllAdminNotificationsReadAction();
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar & Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/notifications"
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              !unreadOnlyFilter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Notifications
          </Link>
          <Link
            href="/admin/notifications?unreadOnly=true"
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              unreadOnlyFilter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Unread ({unreadCount})
          </Link>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleMarkAllRead}
            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
          >
            Mark All as Read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden divide-y divide-slate-100">
        {initialNotifications.length === 0 ? (
          <div className="p-12 text-center text-slate-400 italic">
            No notifications found in this view.
          </div>
        ) : (
          initialNotifications.map((n) => (
            <div
              key={n.id}
              className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                !n.isRead ? 'bg-emerald-50/30' : ''
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-900 text-sm">{n.title}</span>
                  {!n.isRead && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
                      New
                    </span>
                  )}
                  <span className="text-xs text-slate-400 font-mono">
                    {new Date(n.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">{n.message}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {n.link && (
                  <Link
                    href={n.link}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors"
                  >
                    Open Record &rarr;
                  </Link>
                )}
                {!n.isRead && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleMarkRead(n.id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs cursor-pointer"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
