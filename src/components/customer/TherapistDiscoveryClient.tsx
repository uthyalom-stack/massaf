'use client';

import React, { useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { CustomerTherapist } from '@/types/customer';
import { TherapistFilters } from '@/components/customer/TherapistFilters';
import { TherapistResults } from '@/components/customer/TherapistResults';
import { PublicServiceOption, therapistCoversZip } from '@/lib/db-therapists';

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

  // Single source of truth from searchParams
  const queryParam = (searchParams.get('query') || '').trim();
  const serviceIdFilter = searchParams.get('service') || searchParams.get('serviceId') || 'all';
  const rawCity = searchParams.get('city') || '';
  const rawZip = searchParams.get('zip') || '';

  // If query is 5-digit numeric, treat as ZIP parameter automatically
  const isQueryZip = /^\d{5}$/.test(queryParam);
  const cityFilter = rawCity || (!isQueryZip ? queryParam : '');
  const zipFilter = rawZip || (isQueryZip ? queryParam : '');

  // Pre-seed USZipCode database cache for requested customer ZIP via server action
  React.useEffect(() => {
    const cleanZip = zipFilter.trim();
    if (cleanZip && /^\d{5}$/.test(cleanZip)) {
      import('@/app/actions/locations').then(({ fetchZipInfoAction }) => {
        fetchZipInfoAction(cleanZip).catch(() => null);
      });
    }
  }, [zipFilter]);

  const serviceTypeFilter = searchParams.get('type') || 'all';
  const specialtyFilter = searchParams.get('specialty') || 'all';

  // Extract all unique specialties from active database dataset
  const availableSpecialties = useMemo(() => {
    const specs = new Set<string>();
    initialTherapists.forEach((t) => {
      t.specialties.forEach((s) => specs.add(s));
    });
    return Array.from(specs).sort();
  }, [initialTherapists]);

  // Update URL search parameters
  const handleFilterChange = (
    updated: Partial<{
      serviceId: string;
      city: string;
      zip: string;
      serviceType: string;
      specialty: string;
    }>
  ) => {
    const params = new URLSearchParams(searchParams.toString());

    // Clear generic query param when specific filters are changed
    params.delete('query');

    const nextService = updated.serviceId !== undefined ? updated.serviceId : serviceIdFilter;
    const nextCity = updated.city !== undefined ? updated.city : cityFilter;
    const nextZip = updated.zip !== undefined ? updated.zip : zipFilter;
    const nextType = updated.serviceType !== undefined ? updated.serviceType : serviceTypeFilter;
    const nextSpecialty = updated.specialty !== undefined ? updated.specialty : specialtyFilter;

    if (nextService && nextService !== 'all') params.set('service', nextService);
    else {
      params.delete('service');
      params.delete('serviceId');
    }

    if (nextCity.trim()) params.set('city', nextCity.trim());
    else params.delete('city');

    if (nextZip.trim()) params.set('zip', nextZip.trim());
    else params.delete('zip');

    if (nextType && nextType !== 'all') params.set('type', nextType);
    else params.delete('type');

    if (nextSpecialty && nextSpecialty !== 'all') params.set('specialty', nextSpecialty);
    else params.delete('specialty');

    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ''}`, {
      scroll: false,
    });
  };

  const handleReset = () => {
    router.replace(pathname, { scroll: false });
  };

  // Base filtered therapists
  const baseFilteredTherapists = useMemo(() => {
    return initialTherapists
      .filter((therapist) => {
        // 1. Service Filtering: Therapist MUST offer the selected active service
        if (serviceIdFilter !== 'all') {
          const offersService = therapist.services.some((s) => s.id === serviceIdFilter);
          if (!offersService) {
            return false;
          }
        }

        // 2. Service Location Type Filtering
        if (serviceTypeFilter === 'in_home' && !therapist.offersInHome) return false;
        if (serviceTypeFilter === 'studio' && !therapist.offersStudio) return false;

        // 3. City / Region filter
        if (cityFilter.trim()) {
          const query = cityFilter.trim().toLowerCase();
          const matchesLocation = therapist.location.toLowerCase().includes(query);
          const matchesServiceArea = therapist.serviceAreas.some((area) =>
            area.toLowerCase().includes(query)
          );
          const matchesName = therapist.name.toLowerCase().includes(query);
          if (!matchesLocation && !matchesServiceArea && !matchesName) {
            return false;
          }
        }

        // 4. Specialty filter
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
    cityFilter,
    serviceTypeFilter,
    specialtyFilter,
  ]);

  const [filteredTherapists, setFilteredTherapists] = React.useState<CustomerTherapist[]>(baseFilteredTherapists);

  // Apply rolling 5-therapist rotation when ZIP is requested
  React.useEffect(() => {
    const cleanZip = zipFilter.trim();
    if (cleanZip && /^\d{5}$/.test(cleanZip)) {
      // Execute rotation match via server API or dynamic import
      const payload = {
        serviceId: serviceIdFilter !== 'all' ? serviceIdFilter : (availableServices[0]?.id || ''),
        locationType: serviceTypeFilter === 'studio' ? 'STUDIO' : 'IN_HOME',
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
            const matchedTherapists = data.matches.map((m: { therapist: CustomerTherapist }) => m.therapist);
            setFilteredTherapists(matchedTherapists.slice(0, 5));
          } else {
            setFilteredTherapists(baseFilteredTherapists.slice(0, 5));
          }
        })
        .catch(() => setFilteredTherapists(baseFilteredTherapists.slice(0, 5)));
    } else {
      setFilteredTherapists(baseFilteredTherapists);
    }
  }, [zipFilter, serviceIdFilter, serviceTypeFilter, baseFilteredTherapists, availableServices]);

  const hasActiveFilters =
    serviceIdFilter !== 'all' ||
    Boolean(cityFilter.trim()) ||
    Boolean(zipFilter.trim()) ||
    serviceTypeFilter !== 'all' ||
    specialtyFilter !== 'all';

  return (
    <div className="space-y-8">
      {/* Search & Filter Controls */}
      <TherapistFilters
        filters={{
          serviceId: serviceIdFilter,
          city: cityFilter,
          zip: zipFilter,
          serviceType: serviceTypeFilter,
          specialty: specialtyFilter,
        }}
        onFilterChange={handleFilterChange}
        onReset={handleReset}
        availableServices={availableServices}
        availableSpecialties={availableSpecialties}
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
