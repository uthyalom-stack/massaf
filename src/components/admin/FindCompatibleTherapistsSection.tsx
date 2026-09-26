'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  findCompatibleTherapistsAction,
  assignBookingTherapistAction,
  TherapistChecklistResult,
} from '@/app/admin/actions';

interface FindCompatibleTherapistsSectionProps {
  bookingId: string;
  isUnassigned: boolean;
  isCancellable: boolean;
}

export function FindCompatibleTherapistsSection({
  bookingId,
  isUnassigned,
  isCancellable,
}: FindCompatibleTherapistsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [candidates, setCandidates] = useState<TherapistChecklistResult[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [assignSuccessMsg, setSuccessMsg] = useState<string | null>(null);
  const [assigningTherapistId, setAssigningTherapistId] = useState<string | null>(null);

  const handleSearchCandidates = () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await findCompatibleTherapistsAction(bookingId);
      if (!res.success || !res.candidates) {
        setErrorMsg(res.error || 'Failed to search compatible therapists.');
      } else {
        setCandidates(res.candidates);
      }
    });
  };

  const handleAssignCandidate = (therapistId: string) => {
    setAssigningTherapistId(therapistId);
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await assignBookingTherapistAction({
        bookingId,
        therapistId,
      });

      setAssigningTherapistId(null);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to assign therapist.');
      } else {
        setSuccessMsg('Therapist assigned successfully!');
        router.refresh();
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Find Compatible Therapists
            </h2>
            {isUnassigned && (
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-black uppercase">
                Action Required
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Evaluate all therapists against date/time, working schedule, ZIP eligibility, and booking conflicts.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSearchCandidates}
          disabled={isPending || !isCancellable}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-colors disabled:opacity-50 cursor-pointer self-start sm:self-auto"
        >
          {isPending ? 'Evaluating...' : '🔍 Find Candidates'}
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
          ✕ {errorMsg}
        </div>
      )}

      {assignSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          ✓ {assignSuccessMsg}
        </div>
      )}

      {candidates && (
        <div className="space-y-3 pt-2">
          <p className="text-xs font-bold text-slate-700">
            Evaluated {candidates.length} active therapists for this appointment:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {candidates.map((cand) => {
              return (
                <div
                  key={cand.therapistId}
                  className={`p-4 rounded-xl border text-xs space-y-2 transition-all ${
                    cand.isCompatible
                      ? 'bg-emerald-50/50 border-emerald-300'
                      : 'bg-slate-50 border-slate-200 opacity-90'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900 text-sm">{cand.therapistName}</span>
                    {cand.isCompatible ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-extrabold text-[10px] uppercase">
                        Fully Eligible
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] uppercase">
                        Ineligible
                      </span>
                    )}
                  </div>

                  {/* Checklist Items */}
                  <div className="space-y-1 text-[11px] pt-1">
                    {Object.entries(cand.checklist).map(([key, item]) => (
                      <div
                        key={key}
                        className={`flex items-center gap-1.5 ${
                          item.pass ? 'text-emerald-800 font-medium' : 'text-rose-700 font-semibold'
                        }`}
                      >
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Action Button */}
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleAssignCandidate(cand.therapistId)}
                      disabled={isPending || assigningTherapistId === cand.therapistId || !isCancellable}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        cand.isCompatible
                          ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                          : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                      } disabled:opacity-50`}
                    >
                      {assigningTherapistId === cand.therapistId ? 'Assigning...' : 'Assign'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
