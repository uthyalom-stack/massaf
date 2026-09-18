import React from 'react';
import Link from 'next/link';
import { LocationSearch } from '@/components/customer/LocationSearch';
import { TherapistGrid } from '@/components/customer/TherapistGrid';
import { TestimonialSection } from '@/components/customer/TestimonialSection';
import { HowItWorks } from '@/components/customer/HowItWorks';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { getActiveTherapists } from '@/lib/db-therapists';
import { db } from '@/lib/db';
import { formatUtcDateString } from '@/lib/timezone';
import { MOCK_TESTIMONIALS } from '@/lib/mock-data';
import { MockReview } from '@/types/customer';

export const dynamic = 'force-dynamic';

export default async function CustomerHomePage() {
  const activeTherapists = await getActiveTherapists();

  const mostBookedTherapists = activeTherapists.filter(
    (t) => t.isMostBooked
  );
  const featuredTherapists = activeTherapists.filter(
    (t) => t.isFeatured
  );

  // Fetch recent approved & published database reviews for homepage showcase
  let dbReviewsFormatted: MockReview[] = [];
  try {
    const dbReviews = await db.review.findMany({
      where: {
        status: 'APPROVED',
        isPublished: true,
      },
      include: {
        customer: true,
        therapist: true,
        booking: {
          include: {
            service: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    if (dbReviews.length > 0) {
      dbReviewsFormatted = dbReviews.map((rev) => {
        const rawName = rev.customer?.name || 'Verified Client';
        const nameParts = rawName.trim().split(' ');
        const formattedName =
          nameParts.length > 1
            ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
            : rawName;

        return {
          id: rev.id,
          therapistId: rev.therapistId,
          therapistName: rev.therapist?.name || 'Practitioner',
          customerName: formattedName,
          customerLocation: 'United States',
          rating: rev.rating,
          date: formatUtcDateString(rev.createdAt.toISOString()),
          comment: rev.comment || '',
          serviceType: rev.booking?.service?.name || '',
        };
      });
    }
  } catch (err) {
    console.error('Error fetching homepage reviews:', err);
  }

  return (
    <div className="flex flex-col">
      {/* 1. HERO SECTION */}
      <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-28 overflow-hidden bg-radial from-emerald-50/80 via-slate-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto space-y-6">
            {/* Value Proposition Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-emerald-100/80 text-emerald-900 border border-emerald-200/60 shadow-2xs">
              <span className="flex h-2 w-2 rounded-full bg-emerald-600" />
              Licensed & Background-Checked Massage Therapists
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900 leading-[1.15]">
              Elite Massage Therapy, <br className="hidden sm:inline" />
              <span className="text-emerald-800">Delivered To Your Door or Studio.</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Experience therapeutic wellness customized for you. Book trusted, professional massage practitioners in your city for in-home visits or local studio appointments.
            </p>

            {/* Location Search Widget */}
            <div id="search" className="pt-4 sm:pt-6">
              <LocationSearch />
            </div>

            {/* Hero Trust Indicators */}
            <div className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto text-left sm:text-center text-xs sm:text-sm text-slate-600 border-t border-slate-200/60">
              <div className="flex items-center sm:justify-center gap-2">
                <svg className="w-5 h-5 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="font-medium text-slate-800">Verified Licenses</span>
              </div>
              <div className="flex items-center sm:justify-center gap-2">
                <svg className="w-5 h-5 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-slate-800">Same-Day Slots</span>
              </div>
              <div className="flex items-center sm:justify-center gap-2">
                <svg className="w-5 h-5 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="font-medium text-slate-800">In-Home & Studio</span>
              </div>
              <div className="flex items-center sm:justify-center gap-2">
                <svg className="w-5 h-5 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <span className="font-medium text-slate-800">4.9+ Star Average</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. MOST BOOKED THERAPISTS */}
      {mostBookedTherapists.length > 0 && (
        <TherapistGrid
          badge="Popular Choice"
          title="Most Booked Therapists"
          subtitle="Consistently top-rated professionals with high client satisfaction and repeat bookings."
          therapists={mostBookedTherapists}
        />
      )}

      {/* 3. FEATURED THERAPISTS */}
      {featuredTherapists.length > 0 && (
        <TherapistGrid
          badge="Handpicked Talent"
          title="Featured Therapists"
          subtitle="Meet highlighted specialists offering exceptional bodywork, sports recovery, and deep relaxation."
          therapists={featuredTherapists}
        />
      )}

      {/* 4. HOW IT WORKS */}
      <HowItWorks />

      {/* 5. REVIEWS & TESTIMONIALS */}
      <TestimonialSection
        testimonials={MOCK_TESTIMONIALS}
        therapistReviews={dbReviewsFormatted}
      />

      {/* 6. ABOUT / COMPANY INTRO SECTION */}
      <section id="about" className="py-16 sm:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <SectionHeading
                badge="About MASSAF"
                title="Elevating Professional Bodywork Standards"
                subtitle="MASSAF was founded on a simple principle: high-quality therapeutic massage should be accessible, transparent, and effortlessly bookable."
              />
              <div className="space-y-4 text-slate-600 text-sm sm:text-base leading-relaxed">
                <p>
                  Every therapist on MASSAF undergoes state licensing checks and strict quality assessments. Whether you require recovery work after intense athletic training or stress relief in your home, our platform matches you with vetted specialists.
                </p>
                <ul className="space-y-2.5 font-medium text-slate-800">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    100% verified state licensure and credentials
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    Transparent pricing with no hidden booking fees
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    Flexible scheduling for in-home or in-studio care
                  </li>
                </ul>
              </div>
            </div>

            {/* Visual Box */}
            <div className="rounded-3xl bg-emerald-900 text-white p-8 sm:p-12 shadow-xl relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600/20 rounded-full blur-2xl pointer-events-none" />
              <div className="space-y-6 relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-emerald-800 text-emerald-200">
                  Therapist Network
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold">
                  Are you a Licensed Massage Therapist?
                </h3>
                <p className="text-emerald-100 text-sm sm:text-base leading-relaxed">
                  Join North America&apos;s fastest-growing platform for professional massage therapists. Set your own schedule, build your clientele, and keep more of what you earn.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-emerald-800/80 relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-emerald-300 block">Therapist Portal</span>
                  <span className="text-sm font-semibold text-white">Apply to join MASSAF</span>
                </div>
                <a
                  href="#about"
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-white text-emerald-950 font-semibold text-xs sm:text-sm rounded-xl hover:bg-emerald-50 transition-colors shadow-xs"
                >
                  Learn More
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. FINAL CTA */}
      <section className="py-16 sm:py-20 bg-emerald-800 text-white relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative z-10">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
            Ready for Total Relaxation?
          </h2>
          <p className="text-lg sm:text-xl text-emerald-100 max-w-2xl mx-auto leading-relaxed">
            Find and book top-rated massage therapists in your area today. Personalized care is just a few clicks away.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/find-a-therapist"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-white text-emerald-950 font-bold text-base sm:text-lg rounded-xl hover:bg-emerald-50 transition-colors shadow-lg cursor-pointer"
            >
              Find a Therapist Now
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
