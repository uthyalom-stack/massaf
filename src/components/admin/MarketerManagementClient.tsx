'use client';

import { useState } from 'react';
import {
  createMarketerAction,
  regenerateMarketerPasswordAction,
  deleteMarketerAction,
} from '@/app/admin/actions';
import { ConfirmModal } from './ConfirmModal';

interface MarketerLink {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  clicks: number;
}

interface MarketerItem {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: Date | string;
  marketingLinks: MarketerLink[];
  clicks: number;
  totalBookings: number;
  paidBookings: number;
  paidRevenue: number;
}

interface MarketerCredentials {
  id?: string;
  name: string | null;
  loginId: string;
  password?: string;
  newPassword?: string;
  referralCode?: string;
  referralUrl?: string;
}

interface Props {
  initialMarketers: MarketerItem[];
  userRole: string;
}

export default function MarketerManagementClient({ initialMarketers, userRole }: Props) {
  const [marketers, setMarketers] = useState<MarketerItem[]>(initialMarketers);
  const [newMarketerName, setNewMarketerName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<MarketerCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Modal states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMarketerName.trim()) return;

    setIsCreating(true);
    setErrorMsg(null);
    setCreatedCredentials(null);

    const res = await createMarketerAction({ name: newMarketerName.trim() });
    setIsCreating(false);

    if (!res.success || !res.credentials) {
      setErrorMsg(res.error || 'Failed to create marketer');
      return;
    }

    setCreatedCredentials(res.credentials);
    setNewMarketerName('');

    // Update list dynamically
    setMarketers((prev) => [
      {
        id: res.credentials!.id!,
        name: res.credentials!.name,
        email: res.credentials!.loginId,
        role: 'STAFF',
        createdAt: new Date(),
        marketingLinks: [
          {
            id: 'new',
            name: `${res.credentials!.name || 'Marketer'}'s Referral Link`,
            code: res.credentials!.referralCode!,
            isActive: true,
            clicks: 0,
          },
        ],
        clicks: 0,
        totalBookings: 0,
        paidBookings: 0,
        paidRevenue: 0,
      },
      ...prev,
    ]);
  };

  const handleRegeneratePassword = async (userId: string) => {
    setRegeneratingId(userId);
    setErrorMsg(null);

    const res = await regenerateMarketerPasswordAction(userId);
    setRegeneratingId(null);

    if (!res.success || !res.credentials) {
      setErrorMsg(res.error || 'Failed to regenerate password');
      return;
    }

    setCreatedCredentials({
      name: res.credentials.name,
      loginId: res.credentials.loginId,
      newPassword: res.credentials.newPassword,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    setErrorMsg(null);

    const res = await deleteMarketerAction(deletingId);
    setIsDeleting(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to delete marketer account');
      setDeletingId(null);
      return;
    }

    setMarketers((prev) => prev.filter((m) => m.id !== deletingId));
    setDeletingId(null);
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const isSuperAdmin = userRole === 'SUPER_ADMIN';

  return (
    <div className="space-y-8">
      {/* Create Marketer Section (SUPER_ADMIN only) */}
      {isSuperAdmin && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Create New Marketer Account</h2>
          <p className="text-sm text-slate-600 mb-4">
            Enter the marketer&apos;s full name. Unique login ID, secure password, and primary referral link will be generated automatically.
          </p>

          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 max-w-xl">
            <input
              type="text"
              placeholder="Marketer Name (e.g. Sarah Jenkins)"
              value={newMarketerName}
              onChange={(e) => setNewMarketerName(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3.5 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
              required
            />
            <button
              type="submit"
              disabled={isCreating || !newMarketerName.trim()}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {isCreating ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          {errorMsg && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {errorMsg}
            </div>
          )}
        </div>
      )}

      {/* Newly Created / Regenerated Credentials Banner */}
      {createdCredentials && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="text-base font-bold text-amber-900">
                ⚡ {createdCredentials.newPassword ? 'Password Regenerated' : 'Marketer Account Created Successfully'}
              </h3>
              <p className="text-xs text-amber-700 mt-1">
                Please copy these credentials now. The raw password will not be displayed again.
              </p>
            </div>
            <button
              onClick={() => setCreatedCredentials(null)}
              className="text-amber-700 hover:text-amber-900 text-sm font-semibold"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm bg-white p-4 rounded border border-amber-200">
            <div>
              <span className="text-slate-500 text-xs block">Full Name</span>
              <span className="font-semibold text-slate-900">{createdCredentials.name}</span>
            </div>

            <div>
              <span className="text-slate-500 text-xs block">Login ID</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-900">{createdCredentials.loginId}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdCredentials.loginId, 'loginId')}
                  className="text-xs text-amber-600 hover:underline"
                >
                  {copiedField === 'loginId' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {(createdCredentials.password || createdCredentials.newPassword) && (
              <div>
                <span className="text-slate-500 text-xs block">Generated Password</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    {createdCredentials.password || createdCredentials.newPassword}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(createdCredentials.password || createdCredentials.newPassword!, 'password')}
                    className="text-xs text-amber-600 hover:underline"
                  >
                    {copiedField === 'password' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {createdCredentials.referralCode && (
              <div>
                <span className="text-slate-500 text-xs block">Referral Code</span>
                <span className="font-mono text-slate-900">{createdCredentials.referralCode}</span>
              </div>
            )}

            {createdCredentials.referralUrl && (
              <div className="md:col-span-2">
                <span className="text-slate-500 text-xs block">Referral URL</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-800 truncate bg-slate-100 px-2 py-1 rounded flex-1">
                    {createdCredentials.referralUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(createdCredentials.referralUrl!, 'referralUrl')}
                    className="text-xs text-amber-600 hover:underline shrink-0"
                  >
                    {copiedField === 'referralUrl' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Marketers Table */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-800">Marketers ({marketers.length})</h2>
        </div>

        {marketers.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No marketer accounts found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Marketer</th>
                  <th className="px-6 py-3">Referral Links</th>
                  <th className="px-6 py-3 text-center">Clicks</th>
                  <th className="px-6 py-3 text-center">Paid Bookings</th>
                  <th className="px-6 py-3 text-right">Revenue</th>
                  {isSuperAdmin && <th className="px-6 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {marketers.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{m.name || m.email}</div>
                      <div className="text-xs text-slate-500 font-mono">{m.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {m.marketingLinks.map((l) => (
                          <div key={l.id} className="text-xs flex items-center gap-2">
                            <span className="font-mono bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">
                              {l.code}
                            </span>
                            <span className="text-slate-500 truncate max-w-[150px]">{l.name}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center font-medium">{m.clicks}</td>
                    <td className="px-6 py-4 text-center font-medium">
                      {m.paidBookings} / {m.totalBookings}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">
                      ${m.paidRevenue.toFixed(2)}
                    </td>
                    {isSuperAdmin && (
                      <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => handleRegeneratePassword(m.id)}
                          disabled={regeneratingId === m.id}
                          className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors"
                        >
                          {regeneratingId === m.id ? 'Resetting...' : 'Reset Pass'}
                        </button>
                        <button
                          onClick={() => setDeletingId(m.id)}
                          className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <ConfirmModal
          isOpen={!!deletingId}
          title="Delete Marketer Account"
          message="Are you sure you want to delete this marketer account? Referral links will be deactivated, but historical bookings and marketing attribution will be preserved."
          confirmText={isDeleting ? 'Deleting...' : 'Delete Marketer'}
          isDestructive={true}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
