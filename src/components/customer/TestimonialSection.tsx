import React from 'react';
import { MockTestimonial, MockReview } from '@/types/customer';
import { ReviewCard } from '@/components/customer/ReviewCard';
import { SectionHeading } from '@/components/ui/SectionHeading';

interface TestimonialSectionProps {
  testimonials: MockTestimonial[];
  therapistReviews: MockReview[];
}

export function TestimonialSection({ testimonials, therapistReviews }: TestimonialSectionProps) {
  return (
    <section id="reviews" className="py-16 sm:py-24 bg-white border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Section 1: Platform/Company-wide Testimonials */}
        {testimonials.length > 0 && (
          <div>
            <SectionHeading
              badge="Client Testimonials"
              title="Trusted by Thousands Across North America"
              subtitle="Discover how MASSAF connects clients with elite, background-checked massage professionals for wellness and recovery."
            />
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((t) => (
                <ReviewCard
                  key={t.id}
                  reviewerName={t.customerName}
                  location={t.customerLocation}
                  rating={t.rating}
                  date={t.date}
                  comment={t.comment}
                  title={t.title}
                  verifiedBooking={t.verifiedBooking}
                />
              ))}
            </div>
          </div>
        )}

        {/* Section 2: Therapist-Specific Recent Reviews */}
        {therapistReviews.length > 0 && (
          <div>
            <SectionHeading
              badge="Therapist Reviews"
              title="Recent Client Experiences"
              subtitle="Real feedback from recent bookings with top-rated therapists on our platform."
            />
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              {therapistReviews.map((r) => (
                <ReviewCard
                  key={r.id}
                  reviewerName={r.customerName}
                  location={r.customerLocation}
                  rating={r.rating}
                  date={r.date}
                  comment={r.comment}
                  therapistName={r.therapistName}
                  serviceType={r.serviceType}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
