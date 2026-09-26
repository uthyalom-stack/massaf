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

  // Track total ZIP matching count separately from displayed 5 rotated therapists
  const [totalZipMatches, setTotalZipMatches] = useState<number | null>(null);

  // Sync state if URL searchParams change externally (e.g., Browser Back / Forward)
  useEffect(() => {
    setLocationQuery(initialLocationQuery);
    setDebouncedLocationQuery(initialLocationQuery);
  }, [initialLocationQuery]);

  // Debounce debouncedLocationQuery updates (300ms) to prevent URL router thrashing while typing
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLocationQueryChange = useCallback((newQuery: string) => {
    setLocationQuery(newQuery);
    setIsSearching(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedLocationQuery(newQuery);
      setIsSearching(false);
    }, 300);
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
    setTotalZipMatches(null);
    setIsSearching(false);
    router.replace(pathname, { scroll: false });
  };

  // Pre-seed USZipCode database cache for requested customer 5-digit ZIP
  useEffect(() => {
    const cleanZip = debouncedLocationQuery.trim();
    if (cleanZip && /^\d{5}$/.test(cleanZip)) {
      import('@/app/actions/locations').then(({ fetchZipInfoAction }) => {
        fetchZipInfoAction(cleanZip).catch(() => null);
      });
    }
  }, [debouncedLocationQuery]);

  // Extract all unique specialties from active database dataset
  const availableSpecialties = useMemo(() => {
    const specs = new Set<string>();
    initialTherapists.forEach((t) => {
      t.specialties.forEach((s) => specs.add(s));
    });
    return Array.from(specs).sort();
  }, [initialTherapists]);

  // Filter therapists against service, location (ZIP, City, State abbreviation, State name), session type, and specialty
  const baseFilteredTherapists = useMemo(() => {
    const cleanQuery = debouncedLocationQuery.trim().toLowerCase();
    const isZip = /^\d{5}$/.test(cleanQuery);

    // Identify if query matches a U.S. State abbreviation or full name
    const matchedState = cleanQuery
      ? FALLBACK_US_STATES.find(
          (s) => s.code.toLowerCase() === cleanQuery || s.name.toLowerCase() === cleanQuery
        )
      : null;

    return initialTherapists
      .filter((therapist) => {
        // 1. Service Filtering
        if (serviceIdFilter !== 'all') {
          const offersService = therapist.services.some((s) => s.id === serviceIdFilter);
          if (!offersService) return false;
        }

        // 2. Service Location Type Filtering
        if (serviceTypeFilter === 'in_home' && !therapist.offersInHome) return false;
        if (serviceTypeFilter === 'studio' && !therapist.offersStudio) return false;

        // 3. Location Query Filtering (ZIP, City, State abbreviation, State name)
        if (cleanQuery && !isZip) {
          const matchesLocationStr = therapist.location.toLowerCase().includes(cleanQuery);
          const matchesServiceAreas = therapist.serviceAreas.some((sa) =>
            sa.toLowerCase().includes(cleanQuery)
          );
          const matchesRawServiceAreas = (therapist.rawServiceAreas || []).some(
            (rsa) =>
              rsa.cityName.toLowerCase().includes(cleanQuery) ||
              rsa.state.toLowerCase() === cleanQuery
          );
          const matchesState = matchedState
            ? therapist.location.toLowerCase().includes(matchedState.code.toLowerCase()) ||
              therapist.location.toLowerCase().includes(matchedState.name.toLowerCase()) ||
              therapist.serviceAreas.some(
                (sa) =>
                  sa.toLowerCase().includes(matchedState.code.toLowerCase()) ||
                  sa.toLowerCase().includes(matchedState.name.toLowerCase())
              ) ||
              (therapist.rawServiceAreas || []).some(
                (rsa) => rsa.state.toLowerCase() === matchedState.code.toLowerCase()
              )
            : false;

          if (!matchesLocationStr && !matchesServiceAreas && !matchesRawServiceAreas && !matchesState) {
            return false;
          }
        }

        // 4. Specialty Filtering
        if (specialtyFilter !== 'all' && !therapist.specialties.includes(specialtyFilter)) {
          return false;
        }

        return true;
      })
      .map((therapist) => {
        if (serviceIdFilter !== 'all') {
          const serviceMatch = therapist.services.find((s) => s.id === serviceIdFilter);
          if (serviceMatch) {
            return {
              ...therapist,
              startingPrice: serviceMatch.price,
            };
          }
        }
        return therapist;
      });
  }, [
    initialTherapists,
    serviceIdFilter,
    debouncedLocationQuery,
    serviceTypeFilter,
    specialtyFilter,
  ]);

  const [filteredTherapists, setFilteredTherapists] = useState<CustomerTherapist[]>(baseFilteredTherapists);

  // Apply authoritative 5-therapist rotation when a 5-digit ZIP is entered
  useEffect(() => {
    const cleanZip = debouncedLocationQuery.trim();
    if (cleanZip && /^\d{5}$/.test(cleanZip)) {
      const payload = {
        serviceId: serviceIdFilter !== 'all' ? serviceIdFilter : '',
        locationType:
          serviceTypeFilter === 'studio'
            ? 'STUDIO'
            : serviceTypeFilter === 'in_home'
            ? 'IN_HOME'
            : undefined,
        zipCode: cleanZip,
      };

      fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.matches)) {
            const matchedTherapists = data.matches.map(
              (m: { therapist: CustomerTherapist }) => m.therapist
            );
            setFilteredTherapists(matchedTherapists.slice(0, 5));
            setTotalZipMatches(typeof data.totalMatches === 'number' ? data.totalMatches : matchedTherapists.length);
          } else {
            setFilteredTherapists([]);
            setTotalZipMatches(0);
          }
        })
        .catch(() => {
          setFilteredTherapists([]);
          setTotalZipMatches(0);
        });
    } else {
      setFilteredTherapists(baseFilteredTherapists);
      setTotalZipMatches(null);
    }
  }, [debouncedLocationQuery, serviceIdFilter, serviceTypeFilter, baseFilteredTherapists]);

  const hasActiveFilters =
    serviceIdFilter !== 'all' ||
    Boolean(locationQuery.trim()) ||
    serviceTypeFilter !== 'all' ||
    specialtyFilter !== 'all';

  const cleanZipQuery = debouncedLocationQuery.trim();
  const isZipQuery = cleanZipQuery && /^\d{5}$/.test(cleanZipQuery);
  const totalMatchedCount = isZipQuery && totalZipMatches !== null ? totalZipMatches : baseFilteredTherapists.length;

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
        matchedCount={totalMatchedCount}
        isSearching={isSearching}
      />

      {/* Filtered Therapist Results */}
      <TherapistResults
        therapists={filteredTherapists}
        onResetFilters={handleReset}
        hasActiveFilters={hasActiveFilters}
      />
    </div>
  );
}
