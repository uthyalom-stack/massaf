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

  // Controlled draft location input state (does NOT trigger router replacement while typing)
  const [locationQuery, setLocationQuery] = useState(initialLocationQuery);
  const [debouncedLocationQuery, setDebouncedLocationQuery] = useState(initialLocationQuery);
  const [isSearching, setIsSearching] = useState(false);

  // Results state from authoritative server-side matching route (/api/match)
  const [filteredTherapists, setFilteredTherapists] = useState<CustomerTherapist[]>(initialTherapists);
  const [totalMatchesCount, setTotalMatchesCount] = useState<number>(initialTherapists.length);
  const [searchedZip, setSearchedZip] = useState<string | null>(
    /^\d{5}$/.test(initialLocationQuery.trim()) ? initialLocationQuery.trim() : null
  );

  // Track search request sequence ID to prevent out-of-order stale response overwrites
  const lastSearchReqIdRef = useRef<number>(0);

  // Sync state if URL searchParams change externally (e.g., Browser Back / Forward)
  useEffect(() => {
    setLocationQuery(initialLocationQuery);
    setDebouncedLocationQuery(initialLocationQuery);
  }, [initialLocationQuery]);

  // Debounce debouncedLocationQuery updates (250ms) to prevent URL router thrashing while typing
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLocationQueryChange = useCallback((newQuery: string) => {
    setLocationQuery(newQuery);
    setIsSearching(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedLocationQuery(newQuery);
    }, 250);
  }, []);

  // Update URL search parameters when debounced query or select dropdown filters change
  const syncUrlParams = useCallback(
    (nextState: {
      serviceId: string;
      locationQuery: string;
      serviceType: string;
      specialty: string;
    }) => {
      const params = new URLSearchParams(searchParams.toString());

      // Delete deprecated single parameters
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
        if (/^\d{5}$/.test(cleanLoc)) {
          params.set('zip', cleanLoc);
        } else {
          params.set('city', cleanLoc);
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

  // Sync debounced query to URL
  useEffect(() => {
    syncUrlParams({
      serviceId: serviceIdFilter,
      locationQuery: debouncedLocationQuery,
      serviceType: serviceTypeFilter,
      specialty: specialtyFilter,
    });
  }, [debouncedLocationQuery]);

  // Handle immediate dropdown selection filter changes
  const handleFilterChange = (
    updated: Partial<{
      serviceId: string;
      locationQuery: string;
      serviceType: string;
      specialty: string;
    }>
  ) => {
    if (updated.locationQuery !== undefined) {
      handleLocationQueryChange(updated.locationQuery);
      return;
    }

    const nextService = updated.serviceId !== undefined ? updated.serviceId : serviceIdFilter;
    const nextType = updated.serviceType !== undefined ? updated.serviceType : serviceTypeFilter;
    const nextSpecialty = updated.specialty !== undefined ? updated.specialty : specialtyFilter;

    syncUrlParams({
      serviceId: nextService,
      locationQuery: debouncedLocationQuery,
      serviceType: nextType,
      specialty: nextSpecialty,
    });
  };

  const handleReset = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setLocationQuery('');
    setDebouncedLocationQuery('');
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

  // Execute central authoritative matching via POST /api/match whenever filters change
  useEffect(() => {
    const currentReqId = ++lastSearchReqIdRef.current;
    setIsSearching(true);

    const cleanLoc = debouncedLocationQuery.trim();
    const isZip = /^\d{5}$/.test(cleanLoc);

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
    debouncedLocationQuery,
    serviceIdFilter,
    serviceTypeFilter,
    specialtyFilter,
  ]);

  const hasActiveFilters =
    serviceIdFilter !== 'all' ||
    Boolean(locationQuery.trim()) ||
    serviceTypeFilter !== 'all' ||
    specialtyFilter !== 'all';

  return (
    <div className="space-y-8">
      {/* Search & Filter Controls with live/near-live matched count */}
      <TherapistFilters
        filters={{
          serviceId: serviceIdFilter,
          locationQuery: locationQuery,
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
