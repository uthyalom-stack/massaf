'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createAdminUserAction,
  toggleAdminUserActiveAction,
} from '@/app/admin/actions';

export interface AdminUserItem {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface AdminUserManagementClientProps {
  initialUsers: AdminUserItem[];
  currentUserEmail: string;
}

export function AdminUserManagementClient({
  initialUsers,
  currentUserEmail,
}: AdminUserManagementClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generatedCreds, setGeneratedCreds] = useState<{ email: string; pass: string } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<'ADMIN' | 'SUPER_ADMIN'>('ADMIN');

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage(null);
    setActionError(null);
    setGeneratedCreds(null);

    startTransition(async () => {
      const res = await createAdminUserAction({
        name: formName.trim(),
        email: formEmail.trim(),
        role: formRole,
      });

      if (res.success && res.generatedPassword) {
        setGeneratedCreds({
          email: formEmail.trim(),
          pass: res.generatedPassword,
        });
        setIsModalOpen(false);
        setFormName('');
        setFormEmail('');
        setFormRole('ADMIN');
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to create admin user.');
      }
    });
  };

  const handleToggleActive = (userId: string, targetActive: boolean) => {
    setActionMessage(null);
    setActionError(null);

    startTransition(async () => {
      const res = await toggleAdminUserActiveAction(userId, targetActive);
      if (res.success) {
        setActionMessage(`Admin account ${targetActive ? 'reactivated' : 'deactivated'} successfully.`);
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to update admin user status.');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Super Admin Management Console — Manage platform administrative accounts and privileges.
        </p>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
        >
          + Add Admin User
        </button>
      </div>

      {/* Generated Credentials Alert */}
      {generatedCreds && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
          <strong className="block text-sm">One-Time Administrator Credentials Generated</strong>
          <div>User Email: <code className="font-bold">{generatedCreds.email}</code></div>
          <div>Temporary Password: <code className="p-1 bg-amber-100 rounded font-bold">{generatedCreds.pass}</code></div>
          <p className="text-[11px] text-amber-700 pt-1">Copy these credentials now. The password will not be shown again.</p>
        </div>
      )}

      {/* Banners */}
      {actionMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
          {actionError}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
              <th className="p-4">Name</th>
              <th className="p-4">Email</th>
              <th className="p-4">Role</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialUsers.map((u) => {
              const isSelf = u.email === currentUserEmail;
              return (
                <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4 font-bold text-slate-900">
                    {u.name || 'Unnamed Admin'} {isSelf && <span className="text-[10px] text-emerald-700 font-bold uppercase ml-1">(You)</span>}
                  </td>
                  <td className="p-4 font-mono text-slate-600">{u.email}</td>
                  <td className="p-4 font-bold text-emerald-800">{u.role}</td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {!isSelf && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleToggleActive(u.id, !u.isActive)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          u.isActive
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                      >
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
              Add New Admin User
            </h3>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Alex Johnson"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Email Address</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="e.g. alex@massaf.com"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Role Privileges</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as 'ADMIN' | 'SUPER_ADMIN')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                >
                  <option value="ADMIN">ADMIN (Full Operations Access)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Includes Admin User Management)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-semibold rounded-xl bg-slate-100 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  {isPending ? 'Creating...' : 'Create Admin Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
