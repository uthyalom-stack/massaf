'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createMarketingLinkAction, toggleMarketingLinkActiveAction } from '@/app/admin/actions';
import { ConfirmModal } from '@/components/admin/ConfirmModal';

export interface MarketingLinkItem {
  id: string;
  name: string;
  code: string;
  destinationUrl: string;
  clicks: number;
  isActive: boolean;
  createdAt: string | Date;
  bookingsCount: number;
  totalBookingValue: number;
}

interface MarketingLinkListProps {
  initialLinks: MarketingLinkItem[];
  baseUrl: string;
}

export function MarketingLinkList({ initialLinks, baseUrl }: MarketingLinkListProps) {
  const router = useRouter();
  const [links, setLinks] = useState<MarketingLinkItem[]>(initialLinks);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeactivateState, setConfirmDeactivateState] = useState<{
    isOpen: boolean;
    linkId: string;
    linkName: string;
    currentStatus: boolean;
  }>({
    isOpen: false,
    linkId: '',
    linkName: '',
    currentStatus: false,
  });

  // Form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter links by search query
  const filteredLinks = links.filter(
    (link) =>
      link.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopyLink = (codeStr: string, id: string) => {
    const fullUrl = baseUrl ? `${baseUrl}/?ref=${codeStr}` : `/?ref=${codeStr}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleInitiateToggleActive = (link: MarketingLinkItem) => {
    if (link.isActive) {
      // Deactivation is a destructive action - open confirmation modal
      setConfirmDeactivateState({
        isOpen: true,
        linkId: link.id,
        linkName: link.name,
        currentStatus: link.isActive,
      });
    } else {
      executeToggleActive(link.id, link.isActive);
    }
  };

  const executeToggleActive = async (id: string, currentStatus: boolean) => {
    // Optimistic update
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, isActive: !currentStatus } : l))
    );

    const res = await toggleMarketingLinkActiveAction(id, !currentStatus);
    if (!res.success) {
      // Revert on failure
      setLinks((prev) =>
        prev.map((l) => (l.id === id ? { ...l, isActive: currentStatus } : l))
      );
      alert(res.error || 'Failed to update status');
    } else {
      router.refresh();
    }
    setConfirmDeactivateState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const res = await createMarketingLinkAction({
      name,
      code,
    });

    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || 'Failed to create marketing link');
      return;
    }

    // Reset form and close modal
    setName('');
    setCode('');
    setIsModalOpen(false);
    router.refresh();
  };

  const generateCodeFromName = (val: string) => {
    setName(val);
    if (!code || code === generateSlug(name)) {
      setCode(generateSlug(val));
    }
  };

  const generateSlug = (str: string) => {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  return (
    <div className="space-y-6">
      {/* Header and Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Marketing Links</h1>
          <p className="text-sm text-slate-600">
            Create tracking links and measure performance and booking attribution.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-sm cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Marketing Link
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
          />
        </div>
        <div className="text-xs font-medium text-slate-500 self-end sm:self-auto">
          Showing {filteredLinks.length} of {links.length} link(s)
        </div>
      </div>

      {/* Table / List View */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Name & Code</th>
                <th className="py-3 px-4">Generated Link</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Clicks</th>
                <th className="py-3 px-4 text-right">Bookings</th>
                <th className="py-3 px-4 text-right">Booking Value</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredLinks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <p className="font-medium">No marketing links found.</p>
                      <p className="text-xs text-slate-400">Create your first marketing link above.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLinks.map((link) => {
                  const displayUrl = `/?ref=${link.code}`;
                  return (
                    <tr key={link.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/admin/marketing-links/${link.id}`}
                          className="font-semibold text-slate-900 hover:text-emerald-600 transition-colors block"
                        >
                          {link.name}
                        </Link>
                        <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                          {link.code}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-600 truncate max-w-xs bg-slate-50 px-2 py-1 rounded border border-slate-200">
                            {displayUrl}
                          </span>
                          <button
                            onClick={() => handleCopyLink(link.code, link.id)}
                            className="p-1 text-slate-500 hover:text-emerald-600 rounded hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                            title="Copy link"
                          >
                            {copiedId === link.id ? (
                              <span className="text-xs font-bold text-emerald-600 px-1">Copied!</span>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleInitiateToggleActive(link)}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                            link.isActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${link.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {link.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium text-slate-900">
                        {link.clicks.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium text-slate-900">
                        {link.bookingsCount.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4 text-right font-semibold text-slate-900">
                        ${link.totalBookingValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/admin/marketing-links/${link.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-md transition-colors"
                        >
                          <span>Details</span>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deactivation Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDeactivateState.isOpen}
        title="Deactivate Marketing Link?"
        message={`Are you sure you want to deactivate marketing tracking link '${confirmDeactivateState.linkName}'? Future traffic on this link will no longer attribute bookings.`}
        confirmText="Deactivate Link"
        cancelText="Keep Active"
        isDestructive={true}
        onConfirm={() => executeToggleActive(confirmDeactivateState.linkId, confirmDeactivateState.currentStatus)}
        onCancel={() => setConfirmDeactivateState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Create Marketing Link Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Create Marketing Link</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-medium text-rose-800 flex items-start gap-2">
                <svg className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Campaign / Link Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Instagram September Campaign"
                  value={name}
                  onChange={(e) => generateCodeFromName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Unique Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. instagram-september"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  This code forms the tracking query parameter parameter: <span className="font-mono bg-slate-100 px-1 rounded">?ref={code || 'your-code'}</span>
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Creating...' : 'Create Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
