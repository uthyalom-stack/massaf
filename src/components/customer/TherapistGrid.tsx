import React from 'react';
import { MockTherapist } from '@/types/customer';
import { TherapistCard } from '@/components/customer/TherapistCard';
import { SectionHeading } from '@/components/ui/SectionHeading';

interface TherapistGridProps {
  id?: string;
  badge?: string;
  title: string;
  subtitle?: string;
  therapists: MockTherapist[];
}

export function TherapistGrid({
  id,
  badge,
  title,
  subtitle,
  therapists,
}: TherapistGridProps) {
  return (
    <section id={id} className="py-12 sm:py-16 bg-slate-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 sm:mb-12">
          <SectionHeading badge={badge} title={title} subtitle={subtitle} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {therapists.map((therapist) => (
            <TherapistCard key={therapist.id} therapist={therapist} />
          ))}
        </div>
      </div>
    </section>
  );
}
