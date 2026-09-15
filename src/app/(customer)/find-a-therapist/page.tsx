'use client';

import React, { useMemo, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { MOCK_THERAPISTS } from '@/lib/mock-data';
import { TherapistFilters } from '@/components/customer/TherapistFilters';
import { TherapistResults } from '@/components/customer/TherapistResults';

function TherapistDiscoveryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Single source of truth from searchParams
  const queryParam = searchParams.get('query') || '';
  const cityFilter = searchParams.get('city') || queryParam;
  const zipFilter = searchParams.get('zip') || '';
  const serviceTypeFilter = searchParams.get('type') || 'all';
  const specialtyFilter = searchParams.get('specialty') || 'all';

  // Extract all unique specialties from mock dataset
  const availableSpecialties = useMemo(() => {
    const specs = new Set<string>();
    MOCK_THERAPISTS.forEach((t) => {
      t.specialties.forEach((s) => specs.add(s));
    });
    return Array.from(specs).sort();
  }, []);

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

  // Perform client-side filtering against mock dataset
  const filteredTherapists = useMemo(() => {
    return MOCK_THERAPISTS.filter((therapist) => {
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
  }, [cityFilter, zipFilter, serviceTypeFilter, specialtyFilter]);

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

export default function FindTherapistPage() {
  return (
    <div className="py-10 sm:py-16 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Page Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100/80 text-emerald-900 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            Verified Practitioner Network
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            Find a Massage Therapist
          </h1>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            Discover licensed, background-checked massage therapy professionals available for in-home visits or local studio appointments near you.
          </p>
        </div>

        {/* Discovery Content wrapped in Suspense for useSearchParams */}
        <Suspense
          fallback={
            <div className="p-12 text-center text-slate-500 font-medium">
              Loading therapist directory...
            </div>
          }
        >
          <TherapistDiscoveryContent />
        </Suspense>
      </div>
    </div>
  );
}
