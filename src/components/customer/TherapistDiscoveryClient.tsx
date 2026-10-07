'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { CustomerTherapist } from '@/types/customer';
import { TherapistFilters } from '@/components/customer/TherapistFilters';
import { TherapistResults } from '@/components/customer/TherapistResults';
import { TherapistService as PublicServiceOption } from '@/types/customer';
import { FALLBACK_US_STATES } from '@/lib/us-states-data';

interface TherapistDiscoveryClientProps {
  initialTherapists: CustomerTherapist[];
  availableServices: PublicServiceOption[];
}

export function TherapistDiscoveryClient({
  initialTherapists,
  availableServices,
}: TherapistDiscoveryClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read URL parameters on mount / back-forward navigation
  const queryParam = (searchParams.get('query') || '').trim();
  const rawCity = searchParams.get('city') || '';
  const rawZip = searchParams.get('zip') || '';
  const initialLocationQuery = rawZip || rawCity || queryParam;

  const serviceIdFilter = searchParams.get('service') || searchParams.get('serviceId') || 'all';
  const serviceTypeFilter = searchParams.get('type') || 'all';
  const specialtyFilter = searchParams.get('specialty') || 'all';

  // Separation of Raw Location Input (typing) from Committed Location (matching trigger)
  const [locationInput, setLocationInput] = useState(initialLocationQuery);
  const [committedLocation, setCommittedLocation] = useState(initialLocationQuery);
  const [isSearching, setIsSearching] = useState(false);

  // Results state from authoritative server-side matching route (/api/match)
  const [filteredTherapists, setFilteredTherapists] = useState<CustomerTherapist[]>(initialTherapists);
  const [totalMatchesCount, setTotalMatchesCount] = useState<number>(initialTherapists.length);
  const [searchedZip, setSearchedZip] = useState<string | null>(
    rawZip ? rawZip.trim() : null
  );

  // Track search request sequence ID to prevent out-of-order stale response overwrites
  const lastSearchReqIdRef = useRef<number>(0);

  // Sync state if URL searchParams change externally (e.g., Browser Back / Forward)
  useEffect(() => {
    setLocationInput(initialLocationQuery);
    setCommittedLocation(initialLocationQuery);
  }, [initialLocationQuery]);

  // Helper to commit location and synchronize URL parameters
  const commitSearch = useCallback(
    (nextState: {
      serviceId: string;
      locationQuery: string;
      serviceType: string;
      specialty: string;
    }) => {
      setCommittedLocation(nextState.locationQuery);

      const params = new URLSearchParams(searchParams.toString());

      params.delete('query');
      params.delete('city');
      params.delete('zip');

      if (nextState.serviceId && nextState.serviceId !== 'all') {
        params.set('service', nextState.serviceId);
      } else {
        params.delete('service');
        params.delete('serviceId');
      }

      const cleanLoc = nextState.locationQuery.trim();
      if (cleanLoc) {
        if (rawZip && cleanLoc === rawZip.trim()) {
          params.set('zip', cleanLoc);
        } else {
          params.set('query', cleanLoc);
        }
      }

      if (nextState.serviceType && nextState.serviceType !== 'all') {
        params.set('type', nextState.serviceType);
      } else {
        params.delete('type');
      }

      if (nextState.specialty && nextState.specialty !== 'all') {
        params.set('specialty', nextState.specialty);
      } else {
        params.delete('specialty');
      }

      const queryString = params.toString();
      router.replace(`${pathname}${queryString ? `?${queryString}` : ''}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams]
  );

  // Handle filter changes: typing ONLY updates locationInput (no matching/URL sync until committed)
  const handleFilterChange = (
    updated: Partial<{
      serviceId: string;
      locationQuery: string;
      serviceType: string;
      specialty: string;
    }>
  ) => {
    // Typing input update: update visible input text ONLY, do NOT commit search
    if (updated.locationQuery !== undefined && updated.serviceId === undefined && updated.serviceType === undefined && updated.specialty === undefined) {
      setLocationInput(updated.locationQuery);
      return;
    }

    // Explicit location commitment (e.g. suggestion selected, form submit, or clear) or dropdown filter change
    const nextLoc = updated.locationQuery !== undefined ? updated.locationQuery : locationInput;
    const nextService = updated.serviceId !== undefined ? updated.serviceId : serviceIdFilter;
    const nextType = updated.serviceType !== undefined ? updated.serviceType : serviceTypeFilter;
    const nextSpecialty = updated.specialty !== undefined ? updated.specialty : specialtyFilter;

    commitSearch({
      serviceId: nextService,
      locationQuery: nextLoc,
      serviceType: nextType,
      specialty: nextSpecialty,
    });
  };

  const handleReset = () => {
    setLocationInput('');
    setCommittedLocation('');
    setIsSearching(false);
    router.replace(pathname, { scroll: false });
  };

  // Extract all unique specialties from active database dataset
  const availableSpecialties = useMemo(() => {
    const specs = new Set<string>();
    initialTherapists.forEach((t) => {
      t.specialties.forEach((s) => specs.add(s));
    });
    return Array.from(specs).sort();
  }, [initialTherapists]);

  const matchAbortControllerRef = useRef<AbortController | null>(null);

  // Execute central authoritative matching via POST /api/match whenever committed filters change
  useEffect(() => {
    const currentReqId = ++lastSearchReqIdRef.current;

    // Abort previous in-flight matching fetch if a new search is committed
    if (matchAbortControllerRef.current) {
      matchAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    matchAbortControllerRef.current = controller;

    setIsSearching(true);

    const cleanLoc = committedLocation.trim();
    const isZip = Boolean(rawZip && cleanLoc === rawZip.trim());

    const payload = {
      serviceId: serviceIdFilter !== 'all' ? serviceIdFilter : '',
      specialty: specialtyFilter !== 'all' ? specialtyFilter : '',
      locationType:
        serviceTypeFilter === 'studio'
          ? 'STUDIO'
          : serviceTypeFilter === 'in_home'
          ? 'IN_HOME'
          : undefined,
      ...(isZip ? { zipCode: cleanLoc } : { locationQuery: cleanLoc }),
    };

    fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        // Drop stale out-of-order response
        if (currentReqId !== lastSearchReqIdRef.current) return;

        if (data.success && Array.isArray(data.matches)) {
          const matchedTherapists = data.matches.map(
            (m: { therapist: CustomerTherapist }) => m.therapist
          );
          setFilteredTherapists(matchedTherapists);
          setTotalMatchesCount(
            typeof data.totalMatches === 'number' ? data.totalMatches : matchedTherapists.length
          );
          setSearchedZip(isZip ? cleanLoc : null);
        } else {
          setFilteredTherapists([]);
          setTotalMatchesCount(0);
          setSearchedZip(isZip ? cleanLoc : null);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (currentReqId !== lastSearchReqIdRef.current) return;
        console.error('[TherapistDiscoveryClient] Search error:', err);
        setFilteredTherapists([]);
        setTotalMatchesCount(0);
        setSearchedZip(isZip ? cleanLoc : null);
      })
      .finally(() => {
        if (currentReqId === lastSearchReqIdRef.current) {
          setIsSearching(false);
        }
      });
  }, [
    committedLocation,
    serviceIdFilter,
    serviceTypeFilter,
    specialtyFilter,
  ]);

  const hasActiveFilters =
    serviceIdFilter !== 'all' ||
    Boolean(locationInput.trim()) ||
    serviceTypeFilter !== 'all' ||
    specialtyFilter !== 'all';

  return (
    <div className="space-y-8">
      {/* Search & Filter Controls with live/near-live matched count */}
      <TherapistFilters
        filters={{
          serviceId: serviceIdFilter,
          locationQuery: locationInput,
          serviceType: serviceTypeFilter,
          specialty: specialtyFilter,
        }}
        onFilterChange={handleFilterChange}
        onReset={handleReset}
        availableServices={availableServices}
        availableSpecialties={availableSpecialties}
        matchedCount={totalMatchesCount}
        isSearching={isSearching}
      />

      {/* Filtered Therapist Results */}
      <TherapistResults
        therapists={filteredTherapists}
        onResetFilters={handleReset}
        hasActiveFilters={hasActiveFilters}
        isSearching={isSearching}
        searchedZip={searchedZip}
      />
    </div>
  );
}
