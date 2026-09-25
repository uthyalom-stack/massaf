'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { previewTherapistCsvAction, executeTherapistCsvImportAction } from '@/app/admin/actions';
import { CsvParsedRow } from '@/lib/therapist-import';

export interface RowActionState extends CsvParsedRow {
  actionChoice: 'CREATE' | 'UPDATE' | 'SKIP';
}

export function TherapistImportClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<'UPLOAD' | 'PREVIEW' | 'RESULTS'>('UPLOAD');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [previewSummary, setPreviewSummary] = useState<{
    totalRows: number;
    newCount: number;
    existingCount: number;
    duplicateCount: number;
    invalidCount: number;
    unmatchedServices: string[];
  } | null>(null);

  const [previewRows, setPreviewRows] = useState<RowActionState[]>([]);

  const [importReport, setImportReport] = useState<{
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    errors: Array<{ rowNumber: number; name: string; error: string }>;
  } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setFileContent(text || '');
    };
    reader.readAsText(file);
  };

  const handlePreview = () => {
    if (!fileContent.trim()) {
      setErrorMsg('Please select a valid CSV file.');
      return;
    }

    setErrorMsg(null);

    startTransition(async () => {
      const res = await previewTherapistCsvAction(fileContent);
      if (res.success && 'rows' in res && 'summary' in res && res.rows && res.summary) {
        const rowsWithActions: RowActionState[] = res.rows.map((r: CsvParsedRow) => {
          let actionChoice: 'CREATE' | 'UPDATE' | 'SKIP' = 'CREATE';
          if (r.classification === 'INVALID') actionChoice = 'SKIP';
          else if (r.classification === 'EXISTING') actionChoice = 'UPDATE';
          else if (r.classification === 'POSSIBLE_DUPLICATE') actionChoice = 'SKIP';
          return { ...r, actionChoice };
        });

        setPreviewSummary(res.summary);
        setPreviewRows(rowsWithActions);
        setStep('PREVIEW');
      } else {
        setErrorMsg(!res.success ? res.error || 'Failed to parse CSV file.' : 'Invalid response from parser.');
      }
    });
  };

  const handleExecuteImport = () => {
    setErrorMsg(null);

    startTransition(async () => {
      const res = await executeTherapistCsvImportAction({ rows: previewRows });
      if (!res.success || !res.report) {
        setErrorMsg(res.error || 'Failed to execute CSV import.');
      } else {
        setImportReport(res.report);
        setStep('RESULTS');
      }
    });
  };

  const handleRowActionChange = (index: number, choice: 'CREATE' | 'UPDATE' | 'SKIP') => {
    setPreviewRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], actionChoice: choice };
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Step Progress Bar */}
      <div className="flex items-center gap-2 text-xs font-bold text-slate-500 border-b border-slate-200 pb-3">
        <span className={step === 'UPLOAD' ? 'text-emerald-700 font-extrabold' : 'text-slate-400'}>
          1. Upload CSV
        </span>
        <span>→</span>
        <span className={step === 'PREVIEW' ? 'text-emerald-700 font-extrabold' : 'text-slate-400'}>
          2. Preview & Resolve Duplicates
        </span>
        <span>→</span>
        <span className={step === 'RESULTS' ? 'text-emerald-700 font-extrabold' : 'text-slate-400'}>
          3. Import Results
        </span>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
          ✕ {errorMsg}
        </div>
      )}

      {/* STEP 1: UPLOAD */}
      {step === 'UPLOAD' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Select Therapist Import CSV</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Download sample template to review supported columns and formatting.
              </p>
            </div>
            <a
              href="/api/admin/therapists/import/template"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors shrink-0"
            >
              📥 Download Template
            </a>
          </div>

          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-slate-50 transition-colors">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                id="csv-file-input"
                className="hidden"
              />
              <label htmlFor="csv-file-input" className="cursor-pointer space-y-2 block">
                <div className="text-2xl">📄</div>
                <div className="text-xs font-bold text-slate-800">
                  {fileName ? fileName : 'Click to select CSV file or drag here'}
                </div>
                <p className="text-[11px] text-slate-400">Supported format: CSV (UTF-8)</p>
              </label>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1">
              <strong className="block font-bold">Important ZIP Rule:</strong>
              <p>
                ZIP codes and eligibility rules are <strong>NOT</strong> imported from CSV files.
                Therapist ZIP coverage remains controlled by the central distribution shuffle system.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={isPending || !fileContent.trim()}
                onClick={handlePreview}
                className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isPending ? 'Parsing File...' : 'Upload & Preview →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: PREVIEW */}
      {step === 'PREVIEW' && previewSummary && (
        <div className="space-y-6">
          {/* Summary Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                CSV Parse & Preview Summary ({previewSummary.totalRows} Rows)
              </h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep('UPLOAD')}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
                >
                  ← Upload Different File
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleExecuteImport}
                  className="px-5 py-1.5 rounded-xl bg-emerald-700 text-white font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Executing Import...' : 'Confirm & Execute Import ✓'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-[10px] text-emerald-800 font-bold uppercase block">New Profiles</span>
                <span className="text-lg font-black text-emerald-950 block mt-0.5">{previewSummary.newCount}</span>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                <span className="text-[10px] text-blue-800 font-bold uppercase block">Existing Match</span>
                <span className="text-lg font-black text-blue-950 block mt-0.5">{previewSummary.existingCount}</span>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <span className="text-[10px] text-amber-800 font-bold uppercase block">Possible Duplicates</span>
                <span className="text-lg font-black text-amber-950 block mt-0.5">{previewSummary.duplicateCount}</span>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                <span className="text-[10px] text-rose-800 font-bold uppercase block">Invalid Rows</span>
                <span className="text-lg font-black text-rose-950 block mt-0.5">{previewSummary.invalidCount}</span>
              </div>
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                <span className="text-[10px] text-purple-800 font-bold uppercase block">Unmatched Services</span>
                <span className="text-lg font-black text-purple-950 block mt-0.5">{previewSummary.unmatchedServices.length}</span>
              </div>
            </div>

            {previewSummary.unmatchedServices.length > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs font-semibold">
                <strong>Unmatched Services Flagged:</strong> {previewSummary.unmatchedServices.join(', ')}.
                Rows with unmatched services will be rejected during execution to prevent silently omitting offered services.
              </div>
            )}
          </div>

          {/* Rows Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="p-3">#</th>
                    <th className="p-3">Therapist Name</th>
                    <th className="p-3">Email & Phone</th>
                    <th className="p-3">Rate</th>
                    <th className="p-3">Services Matched</th>
                    <th className="p-3">Classification</th>
                    <th className="p-3 text-right">Import Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      <td className="p-3 font-mono text-slate-400 font-bold">{r.rowNumber}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{r.name}</div>
                        {r.bio && <div className="text-[11px] text-slate-500 truncate max-w-xs">{r.bio}</div>}
                      </td>
                      <td className="p-3">
                        <div className="text-slate-800 font-medium">{r.email || 'No email'}</div>
                        <div className="text-slate-500">{r.phone || 'No phone'}</div>
                      </td>
                      <td className="p-3 font-bold text-slate-900">${r.hourlyRate.toFixed(2)}</td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">
                          {r.matchedServiceIds.length} matched service(s)
                        </div>
                        {r.unmatchedServices.length > 0 && (
                          <div className="text-[10px] text-rose-700 font-bold">
                            Unmatched: {r.unmatchedServices.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            r.classification === 'NEW'
                              ? 'bg-emerald-100 text-emerald-900'
                              : r.classification === 'EXISTING'
                              ? 'bg-blue-100 text-blue-900'
                              : r.classification === 'POSSIBLE_DUPLICATE'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-rose-100 text-rose-900'
                          }`}
                        >
                          {r.classification.replace('_', ' ')}
                        </span>
                        {r.warnings.length > 0 && (
                          <div className="text-[10px] text-slate-500 mt-0.5">{r.warnings[0]}</div>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <select
                          value={r.actionChoice}
                          onChange={(e) =>
                            handleRowActionChange(idx, e.target.value as 'CREATE' | 'UPDATE' | 'SKIP')
                          }
                          className="bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-900"
                        >
                          {r.classification === 'EXISTING' || r.classification === 'POSSIBLE_DUPLICATE' ? (
                            <>
                              <option value="UPDATE">Update Existing ({r.existingTherapistName || 'Profile'})</option>
                              <option value="SKIP">Skip Row</option>
                              <option value="CREATE">Create New Profile</option>
                            </>
                          ) : r.classification === 'NEW' ? (
                            <>
                              <option value="CREATE">Create New Therapist</option>
                              <option value="SKIP">Skip Row</option>
                            </>
                          ) : (
                            <option value="SKIP">Skip Invalid Row</option>
                          )}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: RESULTS */}
      {step === 'RESULTS' && importReport && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-2xl space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-lg font-extrabold text-slate-900">Therapist Import Completed</h2>
            <p className="text-xs text-slate-500 mt-0.5">Execution summary report for bulk therapist CSV import.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-[10px] text-emerald-800 font-bold uppercase block">Created</span>
              <span className="text-2xl font-black text-emerald-950 block mt-1">{importReport.createdCount}</span>
            </div>

            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
              <span className="text-[10px] text-blue-800 font-bold uppercase block">Updated</span>
              <span className="text-2xl font-black text-blue-950 block mt-1">{importReport.updatedCount}</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-600 font-bold uppercase block">Skipped</span>
              <span className="text-2xl font-black text-slate-900 block mt-1">{importReport.skippedCount}</span>
            </div>

            <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
              <span className="text-[10px] text-rose-800 font-bold uppercase block">Failed</span>
              <span className="text-2xl font-black text-rose-950 block mt-1">{importReport.failedCount}</span>
            </div>
          </div>

          {importReport.errors.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-200 text-xs">
              <h3 className="font-bold text-rose-800 uppercase tracking-wider text-[11px]">Row Error Report</h3>
              <div className="space-y-1.5 max-h-40 overflow-y-auto p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 font-medium">
                {importReport.errors.map((e, idx) => (
                  <div key={idx}>
                    Row #{e.rowNumber} ({e.name}): {e.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <Link
              href="/admin/therapists"
              className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors"
            >
              View Therapist Roster →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
