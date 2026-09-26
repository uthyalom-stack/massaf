'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createAdminNoteAction } from '@/app/admin/actions';

export interface SerializedAdminNote {
  id: string;
  entityType: string;
  entityId: string;
  authorEmail: string;
  content: string;
  createdAt: string;
}

interface AdminNotesSectionProps {
  entityType: 'BOOKING' | 'CUSTOMER' | 'THERAPIST';
  entityId: string;
  notes: SerializedAdminNote[];
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

export function AdminNotesSection({ entityType, entityId, notes: initialNotes }: AdminNotesSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [notes, setNotes] = useState<SerializedAdminNote[]>(initialNotes);
  const [newContent, setNewContent] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    setErrorMsg(null);

    startTransition(async () => {
      const res = await createAdminNoteAction({
        entityType,
        entityId,
        content: newContent.trim(),
      });

      if (!res.success || !res.note) {
        setErrorMsg(res.error || 'Failed to add internal note.');
      } else {
        setNotes([res.note, ...notes]);
        setNewContent('');
        router.refresh();
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Internal Admin Notes
            </h2>
            <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[9px] font-black uppercase">
              Admin Only
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Internal notes are never visible to customers or therapists.
          </p>
        </div>
        <span className="text-xs font-bold text-slate-400">{notes.length} Note{notes.length === 1 ? '' : 's'}</span>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
          ✕ {errorMsg}
        </div>
      )}

      {/* Add Note Form */}
      <form onSubmit={handleAddNote} className="space-y-2">
        <textarea
          rows={2}
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder={`Add internal operational note for this ${entityType.toLowerCase()}...`}
          className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 font-medium"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending || !newContent.trim()}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isPending ? 'Saving...' : 'Add Internal Note'}
          </button>
        </div>
      </form>

      {/* Notes List */}
      <div className="space-y-2.5 pt-2">
        {notes.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No internal notes recorded yet.
          </p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-200/60 pb-1 mb-1">
                <span className="font-bold text-slate-800">{n.authorEmail}</span>
                <span className="font-mono text-slate-400">{formatDate(n.createdAt)}</span>
              </div>
              <p className="text-slate-800 whitespace-pre-wrap font-medium leading-relaxed">
                {n.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
