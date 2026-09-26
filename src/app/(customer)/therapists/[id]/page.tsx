import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getActiveTherapistById } from '@/lib/db-therapists';
import { RatingDisplay } from '@/components/ui/RatingDisplay';
import { ReviewCard } from '@/components/customer/ReviewCard';
import { TherapistGallery } from '@/components/customer/TherapistGallery';
import { FavoriteButton } from '@/components/customer/FavoriteButton';
import { db } from '@/lib/db';
import { formatUtcDateString } from '@/lib/timezone';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const therapist = await getActiveTherapistById(id);

  if (!therapist) {
    return {
      title: 'Therapist Not Found | MASSAF',
      description: 'The requested therapist profile could not be found or is currently inactive.',
    };
  }

  const titleText = therapist.title ? ` - ${therapist.title}` : '';
  const bioExcerpt = therapist.bio ? `${therapist.bio.slice(0, 150)}...` : '';

  return {
    title: `${therapist.name} | MASSAF Massage Therapy`,
    description: `${therapist.name}${titleText} in ${therapist.location}. ${bioExcerpt}`,
  };
}

export default async function TherapistProfilePage({ params }: PageProps) {
  const { id } = await params;
  const therapist = await getActiveTherapistById(id);

  if (!therapist) {
    notFound();
  }

  // Fetch approved and published database reviews for this therapist
  let dbReviewsFormatted: Array<{
    id: string;
    customerName: string;
    customerLocation: string;
    rating: number;
    date: string;
    comment: string;
    serviceType?: string;
  }> = [];

  const dbReviews = await db.review.findMany({
    where: {
      therapistId: therapist.id,
      status: 'APPROVED',
      isPublished: true,
    },
    include: {
      customer: true,
      booking: {
        include: {
          service: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const availableDurations = Array.from(
    new Set(therapist.services.map((s) => s.durationMinutes))
  ).sort((a, b) => a - b);

  dbReviewsFormatted = dbReviews.map((rev) => {
    const rawName = rev.authorName || rev.customer?.name || 'Verified Client';
    const nameParts = rawName.trim().split(' ');
    const formattedName =
      nameParts.length > 1
        ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
        : rawName;

    return {
      id: rev.id,
      customerName: formattedName,
      customerLocation: therapist.location,
      rating: rev.rating,
      date: formatUtcDateString(rev.createdAt.toISOString()),
      comment: rev.comment || '',
      serviceType: rev.booking?.service?.name || undefined,
    };
  });

  return (
    <div className="min-h-screen bg-slate-50 py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Back Navigation */}
        <div>
          <Link
            href="/find-a-therapist"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-emerald-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 rounded-md py-1 px-2 -ml-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Find a Therapist
          </Link>
        </div>

        {/* Header / Profile Hero Section */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden p-6 sm:p-8 lg:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Gallery Column */}
            <div className="lg:col-span-5">
              <TherapistGallery
                images={therapist.galleryImages.length > 0 ? therapist.galleryImages : [therapist.image]}
                therapistName={therapist.name}
              />
            </div>

            {/* Main Info Column */}
            <div className="lg:col-span-7 flex flex-col justify-between h-full space-y-6">
              <div className="space-y-4">
                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                    {therapist.availability}
                  </span>

                  {therapist.offersInHome && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                      In-Home Available
                    </span>
                  )}

                  {therapist.offersStudio && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                      Studio Location
                    </span>
                  )}

                  {(therapist.isFeatured || therapist.bookingCount > 0) && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      Top Rated Practitioner
                    </span>
                  )}
                </div>

                {/* Name & Title with Favorite Action */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                      {therapist.name}
                    </h1>
                    {therapist.title && (
                      <p className="text-base sm:text-lg font-medium text-slate-600 mt-1">
                        {therapist.title}
                      </p>
                    )}
                  </div>
                  <FavoriteButton therapistId={therapist.id} size="lg" />
                </div>

                {/* Rating & Location */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 pt-1">
                  <RatingDisplay rating={therapist.rating} reviewCount={therapist.reviewCount} size="md" />
                  <span className="text-slate-300" aria-hidden="true">•</span>
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Based in {therapist.location}
                  </span>
                </div>

                {/* Specialties list summary */}
                {therapist.specialties && therapist.specialties.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Primary Specialties
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {therapist.specialties.map((spec) => (
                        <span
                          key={spec}
                          className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200/60"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Pricing & Call To Action */}
              <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/70 p-5 rounded-2xl">
                <div>
                  <p className="text-xs font-medium text-slate-500">Starting price</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-slate-900">
                      {therapist.startingPrice > 0 ? `$${therapist.startingPrice}` : 'N/A'}
                    </span>
                    {therapist.startingPrice > 0 && (
                      <span className="text-sm text-slate-500 font-medium">/ session</span>
                    )}
                  </div>
                  {availableDurations.length > 0 && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Session Durations: {availableDurations.join(', ')} mins
                    </p>
                  )}
                </div>

                <Link
                  href={`/booking?therapist=${therapist.id}`}
                  className="inline-flex items-center justify-center px-8 py-3.5 text-base font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 transition-all shadow-xs hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 cursor-pointer text-center"
                >
                  Book Now
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Content Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Body (Left 2 Columns) */}
          <div className="lg:col-span-2 space-y-8">
            {/* About Section */}
            <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 pb-3 border-b border-slate-100">
                About {therapist.name}
              </h2>

              <div className="space-y-4 text-slate-600 leading-relaxed text-sm sm:text-base">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-1">
                    Biography
                  </h3>
                  <p>{therapist.bio || 'No biography details provided.'}</p>
                </div>

                {therapist.experience && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-1">
                      Experience & Background
                    </h3>
                    <p>{therapist.experience}</p>
                  </div>
                )}

                {therapist.approach && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-1">
                      Therapeutic Approach
                    </h3>
                    <p>{therapist.approach}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Services & Pricing Section */}
            <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Services & Pricing
                </h2>
                <span className="text-xs font-medium text-slate-500">
                  {therapist.services.length} options available
                </span>
              </div>

              {therapist.services.length > 0 ? (
                <div className="space-y-4">
                  {therapist.services.map((service) => (
                    <div
                      key={service.id}
                      className="p-5 rounded-2xl border border-slate-200 hover:border-slate-300 transition-all bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-lg font-bold text-slate-900">
                            {service.name}
                          </h3>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-200/80 text-slate-700">
                            {service.durationMinutes} mins
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {service.description}
                        </p>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                        <span className="text-xl sm:text-2xl font-extrabold text-slate-900">
                          ${service.price}
                        </span>
                        <Link
                          href={`/booking?therapist=${therapist.id}&service=${service.id}`}
                          className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                        >
                          Select
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 text-sm bg-slate-50 rounded-2xl border border-slate-200">
                  No services currently listed for this therapist.
                </div>
              )}
            </section>

            {/* Reviews Section */}
            <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                    Client Reviews
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verified ratings from completed MASSAF appointments
                  </p>
                </div>
                <RatingDisplay rating={therapist.rating} reviewCount={therapist.reviewCount} size="md" />
              </div>

              {dbReviewsFormatted.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {dbReviewsFormatted.map((rev) => (
                    <ReviewCard
                      key={rev.id}
                      reviewerName={rev.customerName}
                      location={rev.customerLocation}
                      rating={rev.rating}
                      date={rev.date}
                      comment={rev.comment}
                      serviceType={rev.serviceType}
                      verifiedBooking
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic py-4">
                  No written reviews yet for {therapist.name}.
                </p>
              )}
            </section>
          </div>

          {/* Sidebar / Secondary Info (Right Column) */}
          <div className="space-y-6">
            {/* Service Locations Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
              <h3 className="text-lg font-bold text-slate-900 pb-2 border-b border-slate-100">
                Service Locations
              </h3>

              <div className="space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700 shrink-0 mt-0.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">In-Home Appointments</h4>
                    <p className="text-slate-600 text-xs mt-0.5">
                      {therapist.offersInHome
                        ? `Available across ${therapist.location} & surrounding service areas.`
                        : 'Currently not offering in-home visits.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700 shrink-0 mt-0.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0v-4a1 1 0 011-1h2a1 1 0 011 1v4" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Studio Appointments</h4>
                    <p className="text-slate-600 text-xs mt-0.5">
                      {therapist.offersStudio
                        ? `Private studio location in ${therapist.location}.`
                        : 'Currently in-home only.'}
                    </p>
                  </div>
                </div>

                {therapist.serviceAreas && therapist.serviceAreas.length > 0 && (
                  <div className="pt-3 border-t border-slate-100">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Service Areas & Neighborhoods
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {therapist.serviceAreas.map((area) => (
                        <span
                          key={area}
                          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* General Availability Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
              <h3 className="text-lg font-bold text-slate-900 pb-2 border-b border-slate-100">
                General Availability
              </h3>

              <div className="space-y-3 text-xs sm:text-sm">
                {therapist.schedule.map((window, idx) => (
                  <div key={idx} className="flex justify-between items-center py-1">
                    <span className="font-medium text-slate-700">{window.days}</span>
                    <span className="text-slate-500 font-mono text-xs">{window.hours}</span>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-900 text-xs leading-relaxed">
                <span className="font-semibold block mb-0.5">Display Only</span>
                Exact appointment time slots are selected during the booking process.
              </div>
            </div>

            {/* Book CTA Card */}
            <div className="bg-emerald-900 text-white rounded-3xl p-6 shadow-md space-y-4 text-center">
              <h3 className="text-xl font-bold">Ready to relax?</h3>
              <p className="text-xs text-emerald-200 leading-relaxed">
                Book a personalized session with {therapist.name}. Vetted, background checked, and highly rated.
              </p>
              <Link
                href={`/booking?therapist=${therapist.id}`}
                className="block w-full py-3 px-4 rounded-xl bg-white text-emerald-900 font-bold text-sm hover:bg-emerald-50 transition-colors shadow-xs"
              >
                Book Session Now
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
