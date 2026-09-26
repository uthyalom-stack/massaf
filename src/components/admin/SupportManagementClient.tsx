'use client';

import React, { useState, useEffect, useCallback } from 'react';

export interface SupportTicket {
  id: string;
  customerId: string | null;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  bookingReference: string | null;
  status: string;
  createdAt: string;
}

export function SupportManagementClient() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/support');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load support tickets');
        return;
      }
      setTickets(data.supportRequests || []);
    } catch {
      setError('An error occurred while loading support requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/support', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        fetchTickets();
        if (selectedTicket && selectedTicket.id === id) {
          setSelectedTicket((prev) => (prev ? { ...prev, status } : null));
        }
      } else {
        alert('Failed to update ticket status');
      }
    } catch {
      alert('Error updating ticket status');
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (filterStatus === 'ALL') return true;
    return t.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Customer Support Tickets</h1>
          <p className="text-xs text-slate-500 mt-1">Review and manage customer support inquiries, feedback, and booking help requests.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold"
          >
            <option value="ALL">All Statuses ({tickets.length})</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded-2xl">{error}</div>
      )}

      {loading ? (
        <div className="p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 animate-pulse h-48"></div>
      ) : filteredTickets.length === 0 ? (
        <div className="p-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-500 text-xs">
          No support tickets found matching the selected status filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTickets.map((ticket) => (
            <div
              key={ticket.id}
              className={`p-5 bg-white dark:bg-slate-900 rounded-2xl border transition-all space-y-3 ${
                ticket.status === 'PENDING'
                  ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {ticket.category}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full font-black text-[10px] uppercase ${
                  ticket.status === 'RESOLVED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : ticket.status === 'IN_PROGRESS'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {ticket.status}
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{ticket.subject}</h3>
                <p className="text-xs text-slate-500 mt-0.5">From: {ticket.name} ({ticket.email})</p>
                {ticket.bookingReference && (
                  <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">Booking Ref: {ticket.bookingReference}</p>
                )}
              </div>

              <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl line-clamp-3">
                {ticket.message}
              </p>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span className="text-[10px] text-slate-400 font-mono">{new Date(ticket.createdAt).toLocaleString()}</span>
                <div className="flex items-center gap-1.5">
                  {ticket.status !== 'IN_PROGRESS' && ticket.status !== 'RESOLVED' && (
                    <button
                      onClick={() => handleUpdateStatus(ticket.id, 'IN_PROGRESS')}
                      className="px-2.5 py-1 rounded-lg font-bold text-[11px] bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      In Progress
                    </button>
                  )}
                  {ticket.status !== 'RESOLVED' && (
                    <button
                      onClick={() => handleUpdateStatus(ticket.id, 'RESOLVED')}
                      className="px-2.5 py-1 rounded-lg font-bold text-[11px] bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
