'use client';

import React, { useMemo } from 'react';

export interface TimelineAuditLog {
  id: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  description: string;
  metadataJson: string | null;
  createdAt: string;
}

export interface TimelineRefund {
  id: string;
  amount: number;
  reason: string | null;
  status: string;
  requestedBy: string;
  processedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BookingTimelineSectionProps {
  bookingCreatedAt: string;
  customerEmail: string;
  reminder24hSentAt: string | null;
  reminder3hSentAt: string | null;
  auditLogs: TimelineAuditLog[];
  refunds: TimelineRefund[];
}

interface TimelineItem {
  id: string;
  timestamp: string;
  title: string;
  actor: string;
  description: string;
  type: 'creation' | 'audit' | 'reminder' | 'refund';
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoStr;
  }
}

export function BookingTimelineSection({
  bookingCreatedAt,
  customerEmail,
  reminder24hSentAt,
  reminder3hSentAt,
  auditLogs,
  refunds,
}: BookingTimelineSectionProps) {
  const events = useMemo(() => {
    const items: TimelineItem[] = [];

    items.push({
      id: `create-${bookingCreatedAt}`,
      timestamp: bookingCreatedAt,
      title: 'Booking Created',
      actor: customerEmail,
      description: 'Customer initialized appointment reservation.',
      type: 'creation',
    });

    for (const log of auditLogs) {
      items.push({
        id: log.id,
        timestamp: log.createdAt,
        title: log.action.replace(/_/g, ' '),
        actor: `${log.actorEmail} (${log.actorRole})`,
        description: log.description,
        type: 'audit',
      });
    }

    if (reminder24hSentAt) {
      items.push({
        id: `rem24-${reminder24hSentAt}`,
        timestamp: reminder24hSentAt,
        title: '24-Hour Reminder Sent',
        actor: 'System Cron',
        description: 'Automated 24-hour appointment reminder email & notification dispatched.',
        type: 'reminder',
      });
    }

    if (reminder3hSentAt) {
      items.push({
        id: `rem3-${reminder3hSentAt}`,
        timestamp: reminder3hSentAt,
        title: '3-Hour Reminder Sent',
        actor: 'System Cron',
        description: 'Automated 3-hour appointment reminder email & notification dispatched.',
        type: 'reminder',
      });
    }

    for (const ref of refunds) {
      items.push({
        id: ref.id,
        timestamp: ref.createdAt,
        title: `Refund Requested ($${ref.amount.toFixed(2)})`,
        actor: ref.requestedBy,
        description: `Status: ${ref.status}${ref.reason ? `. Reason: ${ref.reason}` : ''}`,
        type: 'refund',
      });

      if (ref.processedBy && ref.updatedAt !== ref.createdAt) {
        items.push({
          id: `${ref.id}-proc`,
          timestamp: ref.updatedAt,
          title: `Refund ${ref.status} ($${ref.amount.toFixed(2)})`,
          actor: ref.processedBy,
          description: `Refund record marked as ${ref.status}`,
          type: 'refund',
        });
      }
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items;
  }, [bookingCreatedAt, customerEmail, reminder24hSentAt, reminder3hSentAt, auditLogs, refunds]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          Booking Timeline & Activity History
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Audited record of status changes, therapist assignments, reschedules, and notifications.
        </p>
      </div>

      <div className="relative pl-6 border-l-2 border-slate-200 space-y-6 pt-2">
        {events.map((evt) => (
          <div key={evt.id} className="relative group">
            <div
              className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white ${
                evt.type === 'creation'
                  ? 'bg-blue-600'
                  : evt.type === 'refund'
                  ? 'bg-purple-600'
                  : evt.type === 'reminder'
                  ? 'bg-amber-500'
                  : 'bg-emerald-600'
              }`}
            />

            <div className="space-y-1 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-extrabold text-slate-900 uppercase text-[11px] tracking-wide">
                  {evt.title}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {formatDate(evt.timestamp)}
                </span>
              </div>

              <div className="text-slate-700 font-medium">{evt.description}</div>

              <div className="text-[10px] text-slate-500 font-semibold">
                Actor: <span className="text-slate-800">{evt.actor}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
