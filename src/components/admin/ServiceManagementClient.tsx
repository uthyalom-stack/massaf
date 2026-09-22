'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createGlobalServiceAction,
  updateGlobalServiceAction,
  deleteGlobalServiceAction,
} from '@/app/admin/actions';

export interface AdminCategoryOption {
  id: string;
  name: string;
}

export interface AdminServiceItem {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  categoryId: string | null;
  categoryName: string | null;
  therapistCount: number;
  bookingCount: number;
}

interface ServiceManagementClientProps {
  initialServices: AdminServiceItem[];
  categories: AdminCategoryOption[];
}

export function ServiceManagementClient({
  initialServices,
  categories,
}: ServiceManagementClientProps) {
  const router = useRouter();
  const [services, setServices] = useState<AdminServiceItem[]>(initialServices);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal / Form state for Create
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    durationMinutes: '60',
    price: '120',
    categoryId: '',
    isActive: true,
  });

  // Modal / Form state for Edit
  const [editingService, setEditingService] = useState<AdminServiceItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    durationMinutes: '60',
    price: '120',
    categoryId: '',
    isActive: true,
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const name = createForm.name.trim();
    if (!name || name.length < 2) {
      setErrorMsg('Service name must be at least 2 characters.');
      return;
    }

    const duration = parseInt(createForm.durationMinutes, 10);
    if (isNaN(duration) || duration <= 0) {
      setErrorMsg('Duration must be a positive integer.');
      return;
    }

    const price = parseFloat(createForm.price);
    if (isNaN(price) || price <= 0) {
      setErrorMsg('Price must be a positive dollar amount.');
      return;
    }

    try {
      setLoading(true);
      const res = await createGlobalServiceAction({
        name,
        description: createForm.description.trim() || undefined,
        durationMinutes: duration,
        price,
        categoryId: createForm.categoryId || undefined,
        isActive: createForm.isActive,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to create service.');
        return;
      }

      setSuccessMsg(`Service "${name}" created successfully.`);
      setIsCreateOpen(false);
      setCreateForm({
        name: '',
        description: '',
        durationMinutes: '60',
        price: '120',
        categoryId: '',
        isActive: true,
      });
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (service: AdminServiceItem) => {
    setEditingService(service);
    setEditForm({
      name: service.name,
      description: service.description || '',
      durationMinutes: String(service.durationMinutes),
      price: String(service.price),
      categoryId: service.categoryId || '',
      isActive: service.isActive,
    });
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const name = editForm.name.trim();
    if (!name || name.length < 2) {
      setErrorMsg('Service name must be at least 2 characters.');
      return;
    }

    const duration = parseInt(editForm.durationMinutes, 10);
    if (isNaN(duration) || duration <= 0) {
      setErrorMsg('Duration must be a positive integer.');
      return;
    }

    const price = parseFloat(editForm.price);
    if (isNaN(price) || price <= 0) {
      setErrorMsg('Price must be a positive dollar amount.');
      return;
    }

    try {
      setLoading(true);
      const res = await updateGlobalServiceAction(editingService.id, {
        name,
        description: editForm.description.trim() || undefined,
        durationMinutes: duration,
        price,
        categoryId: editForm.categoryId || undefined,
        isActive: editForm.isActive,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to update service.');
        return;
      }

      setSuccessMsg(`Service "${name}" updated successfully.`);
      setEditingService(null);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (service: AdminServiceItem) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      setLoading(true);
      const newStatus = !service.isActive;
      const res = await updateGlobalServiceAction(service.id, {
        isActive: newStatus,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to update status.');
        return;
      }

      setSuccessMsg(
        `Service "${service.name}" ${newStatus ? 'activated' : 'deactivated'}.`
      );
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (service: AdminServiceItem) => {
    if (!confirm(`Are you sure you want to delete or deactivate "${service.name}"?`)) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      setLoading(true);
      const res = await deleteGlobalServiceAction(service.id);

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to delete service.');
        return;
      }

      if (res.deactivated) {
        setSuccessMsg(res.message || 'Service deactivated safely due to existing bookings.');
      } else {
        setSuccessMsg(`Service "${service.name}" deleted successfully.`);
      }
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Messages */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl flex justify-between items-center">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold text-xs hover:underline">
            Dismiss
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex justify-between items-center">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="font-bold text-xs hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Action Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Global Service Catalog</h2>
          <p className="text-xs text-slate-500">
            Define default pricing, durations, categories, and status for platform massage offerings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsCreateOpen(true);
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add New Service
        </button>
      </div>

      {/* Services Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 tracking-wider font-semibold">
              <tr>
                <th scope="col" className="px-6 py-3.5">Service</th>
                <th scope="col" className="px-6 py-3.5">Category</th>
                <th scope="col" className="px-6 py-3.5">Duration</th>
                <th scope="col" className="px-6 py-3.5">Default Price</th>
                <th scope="col" className="px-6 py-3.5">Status</th>
                <th scope="col" className="px-6 py-3.5">Therapists</th>
                <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {initialServices.map((srv) => (
                <tr key={srv.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Service Info */}
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{srv.name}</div>
                    {srv.description && (
                      <div className="text-xs text-slate-500 truncate max-w-xs">{srv.description}</div>
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-6 py-4 text-xs font-medium text-slate-700">
                    {srv.categoryName ? (
                      <span className="px-2 py-1 rounded bg-slate-100 text-slate-800 font-medium">
                        {srv.categoryName}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Uncategorized</span>
                    )}
                  </td>

                  {/* Duration */}
                  <td className="px-6 py-4 text-xs font-semibold text-slate-800">
                    {srv.durationMinutes} min
                  </td>

                  {/* Default Price */}
                  <td className="px-6 py-4 font-bold text-slate-900">
                    ${srv.price.toFixed(2)}
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    {srv.isActive ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        Inactive
                      </span>
                    )}
                  </td>

                  {/* Assigned Therapists Count */}
                  <td className="px-6 py-4 text-xs font-medium text-slate-700">
                    {srv.therapistCount} assigned
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleStartEdit(srv)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors cursor-pointer"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleToggleActive(srv)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                        srv.isActive
                          ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      {srv.isActive ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleDelete(srv)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {initialServices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 text-sm">
                    No services found in database. Click &quot;Add New Service&quot; above to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE SERVICE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Create New Service</h3>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                  Service Name *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g., Deep Tissue Massage"
                  className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                  Category
                </label>
                <select
                  value={createForm.categoryId}
                  onChange={(e) => setCreateForm({ ...createForm, categoryId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600 bg-white"
                >
                  <option value="">-- No Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                    Duration (Minutes) *
                  </label>
                  <input
                    type="number"
                    required
                    min={15}
                    step={15}
                    value={createForm.durationMinutes}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, durationMinutes: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                    Default Price ($ USD) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    step={1}
                    value={createForm.price}
                    onChange={(e) => setCreateForm({ ...createForm, price: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Summary of treatment technique and benefits..."
                  className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="create-is-active"
                  checked={createForm.isActive}
                  onChange={(e) => setCreateForm({ ...createForm, isActive: e.target.checked })}
                  className="rounded text-emerald-600 h-4 w-4"
                />
                <label htmlFor="create-is-active" className="text-sm font-semibold text-slate-800 cursor-pointer">
                  Service is Active and Available
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  {loading ? 'Saving...' : 'Create Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SERVICE MODAL */}
      {editingService && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Edit Service: {editingService.name}</h3>
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                  Service Name *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                  Category
                </label>
                <select
                  value={editForm.categoryId}
                  onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600 bg-white"
                >
                  <option value="">-- No Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                    Duration (Minutes) *
                  </label>
                  <input
                    type="number"
                    required
                    min={15}
                    step={15}
                    value={editForm.durationMinutes}
                    onChange={(e) =>
                      setEditForm({ ...editForm, durationMinutes: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                    Default Price ($ USD) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    step={1}
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="edit-is-active"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  className="rounded text-emerald-600 h-4 w-4"
                />
                <label htmlFor="edit-is-active" className="text-sm font-semibold text-slate-800 cursor-pointer">
                  Service is Active and Available
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  {loading ? 'Saving...' : 'Update Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
