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

  // Perform authoritative filtering against real database dataset
  const filteredTherapists = useMemo(() => {
    return initialTherapists
      .filter((therapist) => {
        // 1. Service Filtering: Therapist MUST offer the selected active service
        if (serviceIdFilter !== 'all') {
          const offersService = therapist.services.some((s) => s.id === serviceIdFilter);
          if (!offersService) {
            return false;
          }
        }

        // 2. Service Location Type Filtering & ZIP Coverage Matching
        if (serviceTypeFilter === 'in_home') {
          if (!therapist.offersInHome) return false;
          // In-home requires requested ZIP to fall inside therapist coverage
          if (zipFilter.trim()) {
            if (!therapistCoversZip(therapist, zipFilter.trim())) {
              return false;
            }
          }
        } else if (serviceTypeFilter === 'studio') {
          if (!therapist.offersStudio) return false;
          // Studio does NOT require in-home ZIP coverage range
        } else {
          // 'all' location types
          if (zipFilter.trim()) {
            const coversInHome = therapist.offersInHome && therapistCoversZip(therapist, zipFilter.trim());
            const offersStudioZip = therapist.offersStudio && therapist.zipCodes.some((z) => z.trim() === zipFilter.trim());
            if (!coversInHome && !offersStudioZip) {
              return false;
            }
          }
        }

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
        // Resolve service-specific price if a specific service is selected
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
    zipFilter,
    serviceTypeFilter,
    specialtyFilter,
  ]);

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
