'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TherapistService as PublicServiceOption } from '@/types/customer';
import { LocationSuggestion } from '@/app/api/location/suggestions/route';

export interface FilterState {
  serviceId: string;
  locationQuery: string;
  serviceType: string;
  specialty: string;
}

export interface TherapistFiltersProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onReset: () => void;
  availableServices: PublicServiceOption[];
  availableSpecialties: string[];
  matchedCount?: number;
  isSearching?: boolean;
}

export function TherapistFilters({
  filters,
  onFilterChange,
  onReset,
  availableServices,
  availableSpecialties,
  matchedCount,
  isSearching = false,
}: TherapistFiltersProps) {
  // Local draft state for location query to ensure completely stable typing without keystroke drops
  const [draftLocation, setDraftLocation] = useState(filters.locationQuery);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync draft state if external filters change (e.g., Reset or URL change)
  useEffect(() => {
    setDraftLocation(filters.locationQuery);
  }, [filters.locationQuery]);

  const hasActiveFilters =
    filters.serviceId !== 'all' ||
    Boolean(filters.locationQuery.trim()) ||
    filters.serviceType !== 'all' ||
    filters.specialty !== 'all';

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleLocationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDraftLocation(val);
    onFilterChange({ locationQuery: val });

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const cleanVal = val.trim();
    if (!cleanVal) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const params = new URLSearchParams({ query: cleanVal });
      if (filters.serviceId && filters.serviceId !== 'all') {
        params.set('service', filters.serviceId);
      }
      if (filters.serviceType && filters.serviceType !== 'all') {
        params.set('type', filters.serviceType);
      }

      fetch(`/api/location/suggestions?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.suggestions)) {
            setSuggestions(data.suggestions);
            setShowSuggestions(data.suggestions.length > 0);
          } else {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        });
    }, 200);
  };

  const handleSelectSuggestion = (sug: LocationSuggestion) => {
    setDraftLocation(sug.query);
    setShowSuggestions(false);
    onFilterChange({ locationQuery: sug.query });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    onFilterChange({
      serviceId: filters.serviceId,
      locationQuery: draftLocation,
      serviceType: filters.serviceType,
      specialty: filters.specialty,
    });
  };

  const handleClear = () => {
    setDraftLocation('');
    setSuggestions([]);
    setShowSuggestions(false);
    onReset();
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

          {/* Unified Location Search (ZIP, City, State) */}
          <div className="space-y-1.5 lg:col-span-2 relative">
            <div className="flex items-center justify-between">
              <label
                htmlFor="filter-location"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
              >
                Location (ZIP, City, or State)
              </label>
              {/* Live result count badge while typing/filtering */}
              {matchedCount !== undefined && (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                  {isSearching ? (
                    <span className="animate-pulse">Searching...</span>
                  ) : (
                    <>
                      <span className="font-semibold">{matchedCount}</span>
                      <span>{matchedCount === 1 ? 'therapist' : 'therapists'} available</span>
                    </>
                  )}
                </span>
              )}
            </div>
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
                id="filter-location"
                name="locationQuery"
                value={draftLocation}
                onChange={handleLocationInputChange}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder="Search ZIP (e.g. 90210), City (Los Angeles), or State (CA, Texas)"
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
              />
              {draftLocation && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftLocation('');
                    setSuggestions([]);
                    setShowSuggestions(false);
                    onFilterChange({ locationQuery: '' });
                  }}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Clear location"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}

              {/* Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {suggestions.map((sug, idx) => (
                    <button
                      key={`${sug.query}-${idx}`}
                      type="button"
                      onClick={() => handleSelectSuggestion(sug)}
                      className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm hover:bg-emerald-50/80 transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                    >
                      <span className="font-medium text-slate-900 group-hover:text-emerald-950">
                        {sug.label}
                      </span>
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 shrink-0">
                        {sug.count} {sug.count === 1 ? 'therapist' : 'therapists'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
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
        </div>

        {/* Clear & Active Indicator Bar */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Search by 5-digit ZIP, City, or State (e.g. CA, Texas)</span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClear}
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
