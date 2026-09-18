'use client';

import React, { useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { MockTherapist } from '@/types/customer';
import { TherapistFilters } from '@/components/customer/TherapistFilters';
import { TherapistResults } from '@/components/customer/TherapistResults';

interface TherapistDiscoveryClientProps {
  initialTherapists: MockTherapist[];
}

export function TherapistDiscoveryClient({
  initialTherapists,
}: TherapistDiscoveryClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Single source of truth from searchParams
  const queryParam = searchParams.get('query') || '';
  const cityFilter = searchParams.get('city') || queryParam;
  const zipFilter = searchParams.get('zip') || '';
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
      city: string;
      zip: string;
      serviceType: string;
      specialty: string;
    }>
  ) => {
    const params = new URLSearchParams(searchParams.toString());

    // If query param exists from homepage search, clear it when city is explicitly modified
    params.delete('query');

    const nextCity = updated.city !== undefined ? updated.city : cityFilter;
    const nextZip = updated.zip !== undefined ? updated.zip : zipFilter;
    const nextType = updated.serviceType !== undefined ? updated.serviceType : serviceTypeFilter;
    const nextSpecialty = updated.specialty !== undefined ? updated.specialty : specialtyFilter;

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

  // Perform client-side filtering against real database dataset
  const filteredTherapists = useMemo(() => {
    return initialTherapists.filter((therapist) => {
      // 1. City / Region filter
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

      // 2. ZIP Code filter
      if (zipFilter.trim()) {
        const zipQuery = zipFilter.trim().toLowerCase();
        const matchesZip = therapist.zipCodes.some((z) =>
          z.toLowerCase().includes(zipQuery)
        );
        if (!matchesZip) {
          return false;
        }
      }

      // 3. Service / Location preference filter
      if (serviceTypeFilter === 'in_home' && !therapist.offersInHome) {
        return false;
      }
      if (serviceTypeFilter === 'studio' && !therapist.offersStudio) {
        return false;
      }

      // 4. Specialty filter
      if (specialtyFilter !== 'all' && !therapist.specialties.includes(specialtyFilter)) {
        return false;
      }

      return true;
    });
  }, [initialTherapists, cityFilter, zipFilter, serviceTypeFilter, specialtyFilter]);

  const hasActiveFilters =
    Boolean(cityFilter.trim()) ||
    Boolean(zipFilter.trim()) ||
    serviceTypeFilter !== 'all' ||
    specialtyFilter !== 'all';

  return (
    <div className="space-y-8">
      {/* Search & Filter Controls */}
      <TherapistFilters
        filters={{
          city: cityFilter,
          zip: zipFilter,
          serviceType: serviceTypeFilter,
          specialty: specialtyFilter,
        }}
        onFilterChange={handleFilterChange}
        onReset={handleReset}
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
