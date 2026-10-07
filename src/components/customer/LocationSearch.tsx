'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { NormalizedLocation } from '@/lib/ip-location';
import { LocationSuggestion } from '@/app/api/location/suggestions/route';

export function LocationSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [locationQuery, setLocationQuery] = useState('');
  const [serviceType, setServiceType] = useState('all');
  const [isSearching, setIsSearching] = useState(false);

  // Auto location states
  const [detectedLoc, setDetectedLoc] = useState<NormalizedLocation | null>(null);
  const [totalMatches, setTotalMatches] = useState<number | null>(null);
  const [isLocLoading, setIsLocLoading] = useState(true);
  const [isGpsRequesting, setIsGpsRequesting] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial IP-derived or cookie location on mount without delaying page render
  useEffect(() => {
    let isMounted = true;

    fetch('/api/location', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success && data.location) {
          setDetectedLoc(data.location);
          setTotalMatches(typeof data.totalMatches === 'number' ? data.totalMatches : null);

          // Pre-fill input if not already touched
          setLocationQuery((prev) => {
            if (!prev) {
              return data.location.rawQuery || `${data.location.city}, ${data.location.state}`;
            }
            return prev;
          });
        }
      })
      .catch((err) => {
        console.error('[LocationSearch] Error loading location:', err);
      })
      .finally(() => {
        if (isMounted) setIsLocLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch location suggestions while user types (debounced 250ms)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocationQuery(val);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!val.trim() || val.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      fetch(`/api/location/suggestions?query=${encodeURIComponent(val.trim())}`, { cache: 'no-store' })
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
        .catch(() => {
          setSuggestions([]);
          setShowSuggestions(false);
        });
    }, 250);
  };

  // Precise Browser Geolocation Handler
  const handleUsePreciseLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setIsGpsRequesting(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        fetch('/api/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lon }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.location) {
              setDetectedLoc(data.location);
              setTotalMatches(typeof data.totalMatches === 'number' ? data.totalMatches : null);
              const display = `${data.location.city}, ${data.location.state}`;
              setLocationQuery(display);
              setGpsError(null);
            } else {
              setGpsError("Could not resolve your location from GPS. You can search manually.");
            }
          })
          .catch(() => {
            setGpsError("Network error while resolving GPS location.");
          })
          .finally(() => {
            setIsGpsRequesting(false);
          });
      },
      (error) => {
        setIsGpsRequesting(false);
        if (error.code === error.PERMISSION_DENIED) {
          setGpsError("Location permission wasn't granted. You can still search by ZIP code, city, or state.");
        } else if (error.code === error.TIMEOUT) {
          setGpsError("Browser location request timed out. Please search manually.");
        } else {
          setGpsError("Location unavailable. You can search by ZIP code, city, or state.");
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // Change Location / Focus Search Input
  const handleChangeLocation = useCallback(() => {
    setShowSuggestions(false);
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // Format display text for detected location
  const getLocationDisplay = (loc: NormalizedLocation): string => {
    if (loc.rawQuery && loc.rawQuery.trim()) {
      return loc.rawQuery.trim();
    }
    if (loc.city && loc.state) {
      return `${loc.city}, ${loc.state}`;
    }
    if (loc.city) {
      return loc.city;
    }
    if (loc.postalCode) {
      return loc.postalCode;
    }
    return '';
  };

  // Navigate to existing therapist discovery/results flow with detected location applied
  const handleViewTherapists = useCallback(() => {
    if (!detectedLoc) return;

    const params = new URLSearchParams();
    if (detectedLoc.postalCode && detectedLoc.postalCode.trim()) {
      params.set('zip', detectedLoc.postalCode.trim());
    } else if (detectedLoc.city && detectedLoc.city.trim()) {
      params.set('city', detectedLoc.city.trim());
    } else {
      const locStr = getLocationDisplay(detectedLoc);
      if (locStr) {
        params.set('query', locStr);
      }
    }

    if (serviceType && serviceType !== 'all') {
      params.set('type', serviceType);
    }
    const queryString = params.toString();
    router.push(`/find-a-therapist${queryString ? `?${queryString}` : ''}`);
  }, [detectedLoc, serviceType, router]);

  // Select a suggestion from the autocomplete dropdown
  const handleSelectSuggestion = (sug: LocationSuggestion) => {
    setLocationQuery(sug.query);
    setShowSuggestions(false);

    // Update manual location state server-side
    fetch('/api/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualLocation: sug.query }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.location) {
          setDetectedLoc(data.location);
          setTotalMatches(typeof data.totalMatches === 'number' ? data.totalMatches : null);
        }
      })
      .catch(() => null);

    // Direct search
    const params = new URLSearchParams();
    if (sug.postalCode && sug.postalCode.trim()) {
      params.set('zip', sug.postalCode.trim());
    } else {
      params.set('query', sug.query);
    }
    if (serviceType && serviceType !== 'all') {
      params.set('type', serviceType);
    }
    router.push(`/find-a-therapist?${params.toString()}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSearching) return;

    const cleanQuery = locationQuery.trim();

    if (!cleanQuery) {
      handleChangeLocation();
      return;
    }

    setIsSearching(true);
    setShowSuggestions(false);

    fetch('/api/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualLocation: cleanQuery }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.location) {
          setDetectedLoc(data.location);
          setTotalMatches(typeof data.totalMatches === 'number' ? data.totalMatches : null);
        }
      })
      .catch(() => null);

    const params = new URLSearchParams();
    if (cleanQuery) {
      params.set('query', cleanQuery);
    }
    if (serviceType && serviceType !== 'all') {
      params.set('type', serviceType);
    }
    const queryString = params.toString();
    router.push(`/find-a-therapist${queryString ? `?${queryString}` : ''}`);
  };

  const hasValidLocation = Boolean(
    detectedLoc &&
    detectedLoc.source !== 'none' &&
    (detectedLoc.city || detectedLoc.rawQuery || detectedLoc.postalCode)
  );

  return (
    <div className="w-full max-w-3xl mx-auto bg-white p-3 sm:p-5 rounded-2xl shadow-xl ring-1 ring-slate-900/5 backdrop-blur-md relative z-30">
      {/* 1. LOCATION DETECTION STATUS & BANNER */}
      {isLocLoading ? (
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 mb-3.5 text-xs text-slate-500 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span>Detecting your approximate location...</span>
        </div>
      ) : isGpsRequesting ? (
        <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl px-3.5 py-2.5 mb-3.5 text-xs text-emerald-900 flex items-center gap-2">
          <svg className="animate-spin h-3.5 w-3.5 text-emerald-700 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-semibold">Finding therapists near you...</span>
        </div>
      ) : hasValidLocation && detectedLoc ? (
        totalMatches !== null && totalMatches > 0 ? (
          /* STATE 1: Detected location WITH therapists available */
          <div className="rounded-xl p-3 sm:p-4 mb-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm bg-emerald-50/80 border border-emerald-200/80">
            <div className="space-y-1 text-left">
              <div className="font-bold text-slate-900 text-sm sm:text-base">
                Therapists near you
              </div>
              <div className="text-slate-600">
                Based on your approximate location:{' '}
                <strong className="text-slate-900 font-semibold">
                  {getLocationDisplay(detectedLoc)}
                </strong>
              </div>
              <div className="font-bold text-emerald-800 text-xs sm:text-sm">
                {totalMatches} {totalMatches === 1 ? 'therapist' : 'therapists'} nearby
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 pt-1 sm:pt-0">
              {detectedLoc.source === 'ip' && (
                <button
                  type="button"
                  onClick={handleUsePreciseLocation}
                  className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium rounded-lg transition-colors cursor-pointer text-xs"
                >
                  Use Precise Location
                </button>
              )}
              <button
                type="button"
                onClick={handleViewTherapists}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl transition-colors cursor-pointer text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-xs"
              >
                <span>View therapists</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>
        ) : (
          /* STATE 2: Detected location WITH 0 therapists available */
          <div className="rounded-xl p-3 sm:p-4 mb-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm bg-amber-50/80 border border-amber-200/80">
            <div className="space-y-1 text-left">
              <div className="font-bold text-slate-900 text-sm sm:text-base">
                Therapists near you
              </div>
              <div className="text-slate-600">
                Based on your approximate location:{' '}
                <strong className="text-slate-900 font-semibold">
                  {getLocationDisplay(detectedLoc)}
                </strong>
              </div>
              <div className="font-bold text-amber-800 text-xs sm:text-sm">
                No therapists currently available nearby.
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
              <button
                type="button"
                onClick={handleChangeLocation}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100/50 font-bold rounded-xl transition-colors cursor-pointer text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-2xs"
              >
                <span>Search another location</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>
        )
      ) : (
        /* STATE 3: Location Unavailable */
        <div className="rounded-xl p-3 sm:p-4 mb-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm bg-slate-50 border border-slate-200/80">
          <div className="space-y-1 text-left">
            <div className="font-bold text-slate-900 text-sm sm:text-base">
              Therapists near you
            </div>
            <div className="text-slate-600 font-medium">
              Find therapists available in your area.
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
            <button
              type="button"
              onClick={handleChangeLocation}
              className="min-h-[44px] sm:min-h-[38px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl transition-colors cursor-pointer text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-xs"
            >
              <span>Find therapists</span>
              <span>&rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. GPS ERROR NOTICE */}
      {gpsError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3.5 text-xs text-amber-900 flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{gpsError}</span>
          </div>
          <button
            type="button"
            onClick={() => setGpsError(null)}
            className="text-amber-700 font-bold hover:text-amber-900 cursor-pointer p-1"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. SEARCH FORM */}
      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3 items-stretch relative">
        {/* City or ZIP Code Input */}
        <div className="relative flex-1 flex items-center">
          <div className="absolute left-3.5 text-slate-400 pointer-events-none">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={locationQuery}
            onChange={handleInputChange}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            placeholder="Enter City or ZIP code (e.g., 90210, New York, CA)"
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 text-sm sm:text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
          />

          {/* Autocomplete Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {suggestions.map((sug, idx) => (
                <button
                  key={`${sug.query}-${idx}`}
                  type="button"
                  onClick={() => handleSelectSuggestion(sug)}
                  className="w-full px-4 py-3 text-left text-xs sm:text-sm hover:bg-emerald-50/80 transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                >
                  <span className="font-medium text-slate-900 group-hover:text-emerald-950">
                    {sug.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Session Preference Dropdown */}
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
          disabled={isSearching}
          aria-busy={isSearching}
          className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm sm:text-base rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 shadow-sm cursor-pointer shrink-0 disabled:opacity-70 disabled:cursor-not-allowed min-h-[44px]"
        >
          {isSearching ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Searching...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Find Therapists</span>
            </>
          )}
        </button>
      </form>

      {/* Footer trust badge */}
      <div className="mt-2.5 px-1 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          Supported across major U.S. cities and ZIP codes
        </span>
      </div>
    </div>
  );
}
