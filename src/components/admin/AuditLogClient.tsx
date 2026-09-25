'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export interface AuditLogItem {
  id: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  metadataJson: string | null;
  createdAt: string;
}

interface AuditLogClientProps {
  initialLogs: AuditLogItem[];
  pagination: {
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  currentAction?: string;
  currentSearch?: string;
}

export function AuditLogClient({
  initialLogs,
  pagination,
  currentAction = 'ALL',
  currentSearch = '',
}: AuditLogClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(currentSearch);
  const [actionFilter, setActionFilter] = useState(currentAction);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const applyFilters = (newSearch: string, newAction: string) => {
    const params = new URLSearchParams();
    if (newSearch.trim()) params.set('search', newSearch.trim());
    if (newAction && newAction !== 'ALL') params.set('action', newAction);

    startTransition(() => {
      router.push(`/admin/audit-log${params.toString() ? `?${params.toString()}` : ''}`);
    });
  };

  return (
    <div className="space-y-6">
      {/* Search & Action Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters(search, actionFilter);
          }}
          className="grid grid-cols-1 sm:grid-cols-12 gap-4"
        >
          <div className="sm:col-span-8">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Search Audit Log
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actor email, action, entity, or description..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-slate-50/50"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Filter by Action
            </label>
            <input
              type="text"
              value={actionFilter === 'ALL' ? '' : actionFilter}
              onChange={(e) => setActionFilter(e.target.value || 'ALL')}
              placeholder="e.g. THERAPIST_VERIFICATION_UPDATED"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-slate-50/50"
            />
          </div>
        </form>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
              <th className="p-4">Timestamp</th>
              <th className="p-4">Admin Actor</th>
              <th className="p-4">Action</th>
              <th className="p-4">Description</th>
              <th className="p-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                  No audit log records match your filter parameters.
                </td>
              </tr>
            ) : (
              initialLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4 font-mono text-slate-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-slate-900">{log.actorEmail}</div>
                    <div className="text-[10px] uppercase font-bold text-emerald-700">{log.actorRole}</div>
                  </td>
                  <td className="p-4 font-mono font-bold text-slate-800">{log.action}</td>
                  <td className="p-4 text-slate-700 max-w-xs truncate">{log.description}</td>
                  <td className="p-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer"
                    >
                      View Metadata
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50">
            <span>
              Showing Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.totalCount} total log records)
            </span>
            <div className="flex gap-2">
              {pagination.page > 1 && (
                <Link
                  href={`/admin/audit-log?page=${pagination.page - 1}&search=${encodeURIComponent(search)}`}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold hover:bg-slate-100"
                >
                  &larr; Previous
                </Link>
              )}
              {pagination.page < pagination.totalPages && (
                <Link
                  href={`/admin/audit-log?page=${pagination.page + 1}&search=${encodeURIComponent(search)}`}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold hover:bg-slate-100"
                >
                  Next &rarr;
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Metadata Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Audit Log Details — {selectedLog.action}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px] block">Actor</span>
                <span className="font-bold text-slate-900">{selectedLog.actorEmail} ({selectedLog.actorRole})</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px] block">Description</span>
                <span className="text-slate-800">{selectedLog.description}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px] block">Entity Reference</span>
                <span className="font-mono text-slate-700">{selectedLog.entityType} ({selectedLog.entityId || 'N/A'})</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px] block">Sanitized Metadata JSON</span>
                <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] overflow-x-auto mt-1">
                  {selectedLog.metadataJson
                    ? JSON.stringify(JSON.parse(selectedLog.metadataJson), null, 2)
                    : 'No additional metadata attached.'}
                </pre>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 font-bold text-xs rounded-xl bg-slate-900 text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
