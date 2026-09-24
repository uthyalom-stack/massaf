'use client';

import React from 'react';

import { TherapistService as PublicServiceOption } from '@/types/customer';

export interface FilterState {
  serviceId: string;
  city: string;
  zip: string;
  serviceType: string;
  specialty: string;
}

export interface TherapistFiltersProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onReset: () => void;
  availableServices: PublicServiceOption[];
  availableSpecialties: string[];
}

export function TherapistFilters({
  filters,
  onFilterChange,
  onReset,
  availableServices,
  availableSpecialties,
}: TherapistFiltersProps) {
  const hasActiveFilters =
    filters.serviceId !== 'all' ||
    Boolean(filters.city.trim()) ||
    Boolean(filters.zip.trim()) ||
    filters.serviceType !== 'all' ||
    filters.specialty !== 'all';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({
      serviceId: filters.serviceId,
      city: filters.city,
      zip: filters.zip,
      serviceType: filters.serviceType,
      specialty: filters.specialty,
    });
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          {/* Massage Service Selector */}
          <div className="space-y-1.5">
            <label
              htmlFor="filter-service"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
            >
              Massage Service
            </label>
            <div className="relative">
              <select
                id="filter-service"
                name="serviceId"
                value={filters.serviceId}
                onChange={(e) => onFilterChange({ serviceId: e.target.value })}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all appearance-none cursor-pointer pr-8"
              >
                <option value="all">All Services</option>
                {availableServices.map((srv) => (
                  <option key={srv.id} value={srv.id}>
                    {srv.name} ({srv.durationMinutes}m - ${srv.price})
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
          {/* City / Location Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="filter-city"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
            >
              City / Region
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                id="filter-city"
                name="city"
                value={filters.city}
                onChange={(e) => onFilterChange({ city: e.target.value })}
                placeholder="e.g. Los Angeles, Austin"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* ZIP Code Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="filter-zip"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
            >
              ZIP / Postal Code
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0v-5a2 2 0 012-2h2a2 2 0 012 2v5m-6 0h6"
                  />
                </svg>
              </div>
              <input
                type="text"
                id="filter-zip"
                name="zip"
                value={filters.zip}
                onChange={(e) => onFilterChange({ zip: e.target.value })}
                placeholder="e.g. 90210, 10001"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Service / Location Preference */}
          <div className="space-y-1.5">
            <label
              htmlFor="filter-service-type"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
            >
              Session Location
            </label>
            <div className="relative">
              <select
                id="filter-service-type"
                name="serviceType"
                value={filters.serviceType}
                onChange={(e) => onFilterChange({ serviceType: e.target.value })}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all appearance-none cursor-pointer pr-8"
              >
                <option value="all">All Locations (In-Home & Studio)</option>
                <option value="in_home">In-Home Visit</option>
                <option value="studio">Studio Visit</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Specialty Filter */}
          <div className="space-y-1.5">
            <label
              htmlFor="filter-specialty"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
            >
              Specialty
            </label>
            <div className="relative">
              <select
                id="filter-specialty"
                name="specialty"
                value={filters.specialty}
                onChange={(e) => onFilterChange({ specialty: e.target.value })}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all appearance-none cursor-pointer pr-8"
              >
                <option value="all">All Specialties</option>
                {availableSpecialties.map((spec) => (
                  <option key={spec} value={spec}>
                    {spec}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Search Button */}
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm rounded-xl transition-colors shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span>Search Therapists</span>
          </button>
        </div>

        {/* Clear & Active Indicator Bar */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Client-side filtered search against verified practitioners</span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 rounded-md px-2 py-1 cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Clear / Reset Filters
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
