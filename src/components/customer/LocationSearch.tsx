'use client';

import React, { useState } from 'react';

export function LocationSearch() {
  const [locationQuery, setLocationQuery] = useState('');
  const [serviceType, setServiceType] = useState('all');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Non-functional search presentational control for Phase 2 as per scope rules
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-white p-3 sm:p-4 rounded-2xl shadow-xl ring-1 ring-slate-900/5 backdrop-blur-md">
      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3 items-stretch">
        {/* City or ZIP Code Input */}
        <div className="relative flex-1 flex items-center">
          <div className="absolute left-3.5 text-slate-400 pointer-events-none">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            placeholder="Enter City or ZIP code (e.g., 90210, New York)"
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 text-sm sm:text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
          />
        </div>

        {/* Location / Session Preference */}
        <div className="relative md:w-48 flex items-center">
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm sm:text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all appearance-none cursor-pointer"
          >
            <option value="all">All Services</option>
            <option value="in_home">In-Home Visit</option>
            <option value="studio">Studio Visit</option>
          </select>
          <div className="absolute right-3 text-slate-400 pointer-events-none">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Search CTA */}
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm sm:text-base rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 shadow-sm cursor-pointer shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>Find Therapists</span>
        </button>
      </form>

      {/* Quick location suggestions indicator */}
      <div className="mt-2.5 px-1 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
          Supported across major U.S. cities and suburbs
        </span>
        <span className="hidden sm:inline text-slate-400">Phase 2 Preview</span>
      </div>
    </div>
  );
}
