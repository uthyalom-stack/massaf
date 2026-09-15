'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { MOCK_THERAPISTS } from '@/lib/mock-data';
import { MockTherapist, TherapistService } from '@/types/customer';
import { bookingSchema } from '@/lib/validations/booking';

export function BookingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const therapistParam = searchParams.get('therapist');
  const serviceParam = searchParams.get('service');

  // Compute initial therapist based on URL param or fallback
  const initialTherapist =
    MOCK_THERAPISTS.find((t) => t.id === therapistParam) || MOCK_THERAPISTS[0] || null;

  // Selected therapist state
  const [selectedTherapist, setSelectedTherapist] = useState<MockTherapist | null>(initialTherapist);

  // Selected service state
  const [selectedService, setSelectedService] = useState<TherapistService | null>(() => {
    if (!initialTherapist) return null;
    const foundService = initialTherapist.services.find((s) => s.id === serviceParam);
    return foundService || initialTherapist.services[0] || null;
  });

  // Location state
  const [locationType, setLocationType] = useState<'STUDIO' | 'IN_HOME'>(() => {
    if (initialTherapist?.offersStudio) return 'STUDIO';
    if (initialTherapist?.offersInHome) return 'IN_HOME';
    return 'STUDIO';
  });

  // Date and Time state
  const todayStr = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState<string>(todayStr);
  const [time, setTime] = useState<string>('10:00');

  // Customer contact details
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Address details for IN_HOME
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [notes, setNotes] = useState('');

  // Submission & Error handling
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const handleTherapistChange = (therapistId: string) => {
    const therapist = MOCK_THERAPISTS.find((t) => t.id === therapistId) || null;
    setSelectedTherapist(therapist);
    if (therapist) {
      setSelectedService(therapist.services[0] || null);
      if (!therapist.offersStudio && therapist.offersInHome) {
        setLocationType('IN_HOME');
      } else if (therapist.offersStudio && !therapist.offersInHome) {
        setLocationType('STUDIO');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});

    if (!selectedTherapist || !selectedService) {
      setServerError('Please select a valid therapist and service.');
      return;
    }

    const payload = {
      therapistId: selectedTherapist.id,
      serviceId: selectedService.id,
      locationType,
      date,
      time,
      firstName,
      lastName,
      email,
      phone,
      addressLine1: locationType === 'IN_HOME' ? addressLine1 : undefined,
      addressLine2: locationType === 'IN_HOME' ? addressLine2 : undefined,
      city: locationType === 'IN_HOME' ? city : undefined,
      state: locationType === 'IN_HOME' ? state : undefined,
      zipCode: locationType === 'IN_HOME' ? zipCode : undefined,
      notes: notes.trim() || undefined,
    };

    // Client-side Zod validation
    const validationResult = bookingSchema.safeParse(payload);
    if (!validationResult.success) {
      const newFieldErrors: Record<string, string> = {};
      for (const issue of validationResult.error.issues) {
        const pathKey = issue.path[0]?.toString();
        if (pathKey && !newFieldErrors[pathKey]) {
          newFieldErrors[pathKey] = issue.message;
        }
      }
      setFieldErrors(newFieldErrors);
      return;
    }

    // Double-submission protection
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();

      if (!response.ok) {
        setServerError(resData.error || 'Failed to submit booking. Please try again.');
        if (resData.details) {
          const apiFieldErrors: Record<string, string> = {};
          for (const [key, val] of Object.entries(resData.details)) {
            if (Array.isArray(val) && val.length > 0) {
              apiFieldErrors[key] = val[0] as string;
            }
          }
          setFieldErrors(apiFieldErrors);
        }
        setIsSubmitting(false);
        return;
      }

      // Success! Redirect to booking confirmation page
      router.push(`/booking/success?id=${resData.booking.id}`);
    } catch (err) {
      console.error('Booking submission error:', err);
      setServerError('Network error. Please check your connection and try again.');
      setIsSubmitting(false);
    }
  };

  if (!selectedTherapist) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">Therapist not found.</p>
        <Link href="/find-a-therapist" className="text-emerald-700 underline text-sm mt-2 inline-block">
          Browse Therapists
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Main Steps Column */}
      <div className="lg:col-span-7 space-y-8">

        {/* Section 1: Therapist & Service Selection */}
        <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center">
              1
            </span>
            <h2 className="text-xl font-bold text-slate-900">Therapist & Service</h2>
          </div>

          {/* Therapist Selection Dropdown / Card */}
          <div className="space-y-3">
            <label htmlFor="therapistSelect" className="block text-sm font-semibold text-slate-700">
              Selected Massage Practitioner
            </label>
            <select
              id="therapistSelect"
              value={selectedTherapist.id}
              onChange={(e) => handleTherapistChange(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all"
            >
              {MOCK_THERAPISTS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.title} ({t.location})
                </option>
              ))}
            </select>

            {/* Selected Therapist Mini Badge */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-4 mt-2">
              <div className="relative w-14 h-14 rounded-full overflow-hidden bg-slate-200 shrink-0">
                <Image
                  src={selectedTherapist.image}
                  alt={selectedTherapist.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-900 truncate">{selectedTherapist.name}</h3>
                <p className="text-xs text-slate-500 truncate">{selectedTherapist.title} • {selectedTherapist.location}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                    ★ {selectedTherapist.rating}
                  </span>
                  <span className="text-xs text-slate-400">({selectedTherapist.reviewCount} reviews)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Service Radio List */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              Select Service
            </label>
            {fieldErrors.serviceId && (
              <p className="text-xs font-medium text-rose-600">{fieldErrors.serviceId}</p>
            )}
            <div className="space-y-3">
              {selectedTherapist.services.map((svc) => {
                const isSelected = selectedService?.id === svc.id;
                return (
                  <div
                    key={svc.id}
                    onClick={() => setSelectedService(svc)}
                    className={`cursor-pointer p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="service"
                        checked={isSelected}
                        onChange={() => setSelectedService(svc)}
                        className="mt-1 h-4 w-4 text-emerald-700 border-slate-300 focus:ring-emerald-600"
                      />
                      <div>
                        <p className="text-sm font-bold text-slate-900">{svc.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{svc.description}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-7 sm:pl-0">
                      <p className="text-base font-extrabold text-slate-900">${svc.price}</p>
                      <p className="text-xs font-medium text-slate-500">{svc.durationMinutes} mins</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 2: Location Selection */}
        <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center">
              2
            </span>
            <h2 className="text-xl font-bold text-slate-900">Appointment Location</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Studio Option */}
            <button
              type="button"
              disabled={!selectedTherapist.offersStudio}
              onClick={() => setLocationType('STUDIO')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                locationType === 'STUDIO'
                  ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              } ${!selectedTherapist.offersStudio ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 text-sm">Studio Location</span>
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${locationType === 'STUDIO' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
                  {locationType === 'STUDIO' && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {selectedTherapist.offersStudio
                  ? `Visit practitioner's private studio in ${selectedTherapist.location}.`
                  : 'Not offered by this practitioner.'}
              </p>
            </button>

            {/* In-Home Option */}
            <button
              type="button"
              disabled={!selectedTherapist.offersInHome}
              onClick={() => setLocationType('IN_HOME')}
              className={`p-4 rounded-2xl border text-left transition-all ${
                locationType === 'IN_HOME'
                  ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              } ${!selectedTherapist.offersInHome ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 text-sm">In-Home Appointment</span>
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${locationType === 'IN_HOME' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
                  {locationType === 'IN_HOME' && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {selectedTherapist.offersInHome
                  ? 'Practitioner comes to your home, hotel, or office with full equipment.'
                  : 'Not offered by this practitioner.'}
              </p>
            </button>
          </div>
        </section>

        {/* Section 3: Date & Time Selection */}
        <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center">
              3
            </span>
            <h2 className="text-xl font-bold text-slate-900">Date & Time</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="dateInput" className="block text-xs font-semibold text-slate-700 mb-1">
                Select Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="dateInput"
                type="date"
                min={todayStr}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
              />
              {fieldErrors.date && (
                <p className="text-xs font-medium text-rose-600 mt-1">{fieldErrors.date}</p>
              )}
            </div>

            <div>
              <label htmlFor="timeSelect" className="block text-xs font-semibold text-slate-700 mb-1">
                Select Start Time <span className="text-rose-500">*</span>
              </label>
              <select
                id="timeSelect"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
              >
                <option value="08:00">08:00 AM</option>
                <option value="09:00">09:00 AM</option>
                <option value="10:00">10:00 AM</option>
                <option value="11:00">11:00 AM</option>
                <option value="12:00">12:00 PM</option>
                <option value="13:00">01:00 PM</option>
                <option value="14:00">02:00 PM</option>
                <option value="15:00">03:00 PM</option>
                <option value="16:00">04:00 PM</option>
                <option value="17:00">05:00 PM</option>
                <option value="18:00">06:00 PM</option>
                <option value="19:00">07:00 PM</option>
              </select>
              {fieldErrors.time && (
                <p className="text-xs font-medium text-rose-600 mt-1">{fieldErrors.time}</p>
              )}
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
            <span className="font-semibold text-slate-900 block mb-0.5">Therapist Schedule Reference</span>
            {selectedTherapist.schedule.map((s, idx) => (
              <span key={idx} className="inline-block mr-3">
                {s.days}: {s.hours}
              </span>
            ))}
          </div>
        </section>

        {/* Section 4: Customer Contact & Address Information */}
        <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center">
              4
            </span>
            <h2 className="text-xl font-bold text-slate-900">Your Contact Details</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-xs font-semibold text-slate-700 mb-1">
                First Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="firstName"
                type="text"
                placeholder="Jane"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
              />
              {fieldErrors.firstName && (
                <p className="text-xs font-medium text-rose-600 mt-1">{fieldErrors.firstName}</p>
              )}
            </div>

            <div>
              <label htmlFor="lastName" className="block text-xs font-semibold text-slate-700 mb-1">
                Last Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="lastName"
                type="text"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
              />
              {fieldErrors.lastName && (
                <p className="text-xs font-medium text-rose-600 mt-1">{fieldErrors.lastName}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                placeholder="jane.doe@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
              />
              {fieldErrors.email && (
                <p className="text-xs font-medium text-rose-600 mt-1">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number <span className="text-rose-500">*</span>
              </label>
              <input
                id="phone"
                type="tel"
                placeholder="(555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
              />
              {fieldErrors.phone && (
                <p className="text-xs font-medium text-rose-600 mt-1">{fieldErrors.phone}</p>
              )}
            </div>
          </div>

          {/* In-Home Address Fields */}
          {locationType === 'IN_HOME' && (
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">In-Home Service Address</h3>

              <div>
                <label htmlFor="addressLine1" className="block text-xs font-semibold text-slate-700 mb-1">
                  Street Address <span className="text-rose-500">*</span>
                </label>
                <input
                  id="addressLine1"
                  type="text"
                  placeholder="123 Main Street"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
                />
                {fieldErrors.addressLine1 && (
                  <p className="text-xs font-medium text-rose-600 mt-1">{fieldErrors.addressLine1}</p>
                )}
              </div>

              <div>
                <label htmlFor="addressLine2" className="block text-xs font-semibold text-slate-700 mb-1">
                  Apt, Suite, Unit (Optional)
                </label>
                <input
                  id="addressLine2"
                  type="text"
                  placeholder="Apt 4B"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="city" className="block text-xs font-semibold text-slate-700 mb-1">
                    City <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="city"
                    type="text"
                    placeholder="Los Angeles"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
                  />
                  {fieldErrors.city && (
                    <p className="text-xs font-medium text-rose-600 mt-1">{fieldErrors.city}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="state" className="block text-xs font-semibold text-slate-700 mb-1">
                    State <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="state"
                    type="text"
                    placeholder="CA"
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none uppercase"
                  />
                  {fieldErrors.state && (
                    <p className="text-xs font-medium text-rose-600 mt-1">{fieldErrors.state}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="zipCode" className="block text-xs font-semibold text-slate-700 mb-1">
                    ZIP Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="zipCode"
                    type="text"
                    placeholder="90210"
                    maxLength={10}
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
                  />
                  {fieldErrors.zipCode && (
                    <p className="text-xs font-medium text-rose-600 mt-1">{fieldErrors.zipCode}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Special Instructions or Focus Areas (Optional)
            </label>
            <textarea
              id="notes"
              rows={3}
              placeholder="e.g. Focus on neck and shoulder strain, gate code for entry..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
            />
          </div>
        </section>
      </div>

      {/* Sidebar Summary Column */}
      <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-8">
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <h2 className="text-xl font-bold text-slate-900 pb-3 border-b border-slate-100">
            Booking Summary
          </h2>

          <div className="space-y-4 text-sm">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <span className="text-slate-500">Therapist</span>
              <span className="font-bold text-slate-900 text-right">{selectedTherapist.name}</span>
            </div>

            {selectedService && (
              <>
                <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                  <span className="text-slate-500">Service</span>
                  <span className="font-bold text-slate-900 text-right">{selectedService.name}</span>
                </div>

                <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                  <span className="text-slate-500">Duration</span>
                  <span className="font-semibold text-slate-800">{selectedService.durationMinutes} minutes</span>
                </div>
              </>
            )}

            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <span className="text-slate-500">Date & Time</span>
              <span className="font-semibold text-slate-800 text-right">
                {date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} @ {time}
              </span>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <span className="text-slate-500">Location</span>
              <span className="font-semibold text-slate-800">
                {locationType === 'STUDIO' ? 'Studio' : 'In-Home'}
              </span>
            </div>

            {locationType === 'IN_HOME' && addressLine1 && (
              <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                <span className="text-slate-500">Address</span>
                <span className="font-medium text-slate-700 text-right text-xs max-w-[200px]">
                  {addressLine1}{addressLine2 ? `, ${addressLine2}` : ''}<br />
                  {city}, {state} {zipCode}
                </span>
              </div>
            )}

            {/* Price breakdown */}
            <div className="pt-2 flex justify-between items-baseline">
              <span className="text-base font-bold text-slate-900">Total Base Price</span>
              <span className="text-2xl font-extrabold text-emerald-800">
                ${selectedService ? selectedService.price : 0}
              </span>
            </div>

            {/* Payment Status Label */}
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 text-amber-900 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">Payment Status</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                  Payment: Pending
                </span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Payment has NOT been processed yet. Payment integration will be completed in a subsequent phase.
              </p>
            </div>
          </div>

          {serverError && (
            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-xs font-medium">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-4 px-6 rounded-2xl font-bold text-base text-white transition-all shadow-md flex items-center justify-center gap-2 ${
              isSubmitting
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-emerald-700 hover:bg-emerald-800 cursor-pointer active:scale-[0.99]'
            }`}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Submitting Appointment...</span>
              </>
            ) : (
              <span>Confirm & Book Appointment</span>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
