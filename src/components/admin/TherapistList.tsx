'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export interface AdminTherapistItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  profileImage: string | null;
  rating: number;
  reviewCount: number;
  isActive: boolean;
  isFeatured: boolean;
  offersStudio: boolean;
  offersInHome: boolean;
  createdAt: string;
  servicesCount: number;
  serviceAreasCount: number;
  photosCount: number;
}

interface TherapistListProps {
  initialTherapists: AdminTherapistItem[];
  apiKey: string;
}

export function TherapistList({ initialTherapists, apiKey }: TherapistListProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [therapists, setTherapists] = useState<AdminTherapistItem[]>(initialTherapists);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const filteredTherapists = useMemo(() => {
    return therapists.filter((t) => {
      // Search filter
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const nameMatch = t.name.toLowerCase().includes(query);
        const emailMatch = t.email?.toLowerCase().includes(query);
        const phoneMatch = t.phone?.toLowerCase().includes(query);
        if (!nameMatch && !emailMatch && !phoneMatch) {
          return false;
        }
      }

      // Status filter
      if (statusFilter === 'active' && !t.isActive) return false;
      if (statusFilter === 'inactive' && t.isActive) return false;

      return true;
    });
  }, [therapists, search, statusFilter]);

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      setTogglingId(id);
      const res = await fetch(`/api/admin/therapists/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-api-key': apiKey,
        },
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to update therapist status');
        return;
      }

      // Update local state
      setTherapists((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isActive: !currentStatus } : t))
      );
      router.refresh();
    } catch (err) {
      console.error('Error toggling status:', err);
      alert('An error occurred while updating status.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-4 items-center justify-between">
        {/* Search input */}
        <div className="relative w-full sm:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none transition-all"
          />
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({therapists.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active ({therapists.filter((t) => t.isActive).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('inactive')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'inactive'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Inactive ({therapists.filter((t) => !t.isActive).length})
          </button>
        </div>
      </div>

      {/* Therapist List / Table */}
      {filteredTherapists.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 tracking-wider font-semibold">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Therapist</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5">Rating</th>
                  <th scope="col" className="px-6 py-3.5">Services</th>
                  <th scope="col" className="px-6 py-3.5">Service Areas</th>
                  <th scope="col" className="px-6 py-3.5">Photos</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTherapists.map((therapist) => (
                  <tr key={therapist.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Therapist Info */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {therapist.profileImage ? (
                          <img
                            src={therapist.profileImage}
                            alt={therapist.name}
                            className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center shrink-0">
                            {therapist.name[0]}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <Link
                              href={`/admin/therapists/${therapist.id}`}
                              className="hover:text-emerald-700 hover:underline transition-colors"
                            >
                              {therapist.name}
                            </Link>
                            {therapist.isFeatured && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Featured
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {therapist.email || 'No email registered'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      {therapist.isActive ? (
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

                    {/* Rating */}
                    <td className="px-6 py-4 font-medium text-slate-700">
                      <div className="flex items-center gap-1">
                        <span className="text-amber-500">★</span>
                        <span>{therapist.rating.toFixed(1)}</span>
                        <span className="text-slate-400 text-xs">({therapist.reviewCount})</span>
                      </div>
                    </td>

                    {/* Services Count */}
                    <td className="px-6 py-4 text-xs font-medium text-slate-700">
                      {therapist.servicesCount} services
                    </td>

                    {/* Service Areas Count */}
                    <td className="px-6 py-4 text-xs font-medium text-slate-700">
                      {therapist.serviceAreasCount} areas
                    </td>

                    {/* Photos Count */}
                    <td className="px-6 py-4 text-xs font-medium text-slate-700">
                      {therapist.photosCount} photos
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        type="button"
                        disabled={togglingId === therapist.id}
                        onClick={() => handleToggleActive(therapist.id, therapist.isActive)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                          therapist.isActive
                            ? 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {togglingId === therapist.id
                          ? 'Saving...'
                          : therapist.isActive
                          ? 'Deactivate'
                          : 'Activate'}
                      </button>

                      <Link
                        href={`/admin/therapists/${therapist.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <p className="text-slate-500 text-sm">No therapists found matching your search criteria.</p>
          {(search || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
              className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
