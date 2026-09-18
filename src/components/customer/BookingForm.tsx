'use client';

import React, { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { CustomerTherapist, TherapistService } from '@/types/customer';
import { bookingSchema } from '@/lib/validations/booking';
import {
  getScheduleWindowForDate,
  getAvailableTimeSlots,
  isAppointmentTimeAvailable,
} from '@/lib/availability';
import { formatUtcDateString, formatUtcTimeString } from '@/lib/timezone';

interface BookingFormProps {
  activeTherapists: CustomerTherapist[];
}

export function BookingForm({ activeTherapists }: BookingFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const therapistParam = searchParams.get('therapist');
  const serviceParam = searchParams.get('service');

  // Check therapist validity if parameter provided
  const foundTherapist = therapistParam
    ? activeTherapists.find((t) => t.id === therapistParam) || null
    : null;

  // Selected therapist state
  const [selectedTherapist, setSelectedTherapist] = useState<CustomerTherapist | null>(() => {
    if (therapistParam) return foundTherapist;
    return activeTherapists[0] || null;
  });

  // Invalid Therapist URL State
  const invalidTherapistUrl = Boolean(therapistParam && !foundTherapist);

  // Check service validity if parameter provided
  const foundService = useMemo(() => {
    if (!selectedTherapist || !serviceParam) return null;
    return selectedTherapist.services.find((s) => s.id === serviceParam) || null;
  }, [selectedTherapist, serviceParam]);

  const invalidServiceUrl = Boolean(serviceParam && !foundService);

  // Selected service state
  const [selectedService, setSelectedService] = useState<TherapistService | null>(() => {
    if (serviceParam !== null) {
      return foundService;
    }
    return selectedTherapist?.services[0] || null;
  });

  // Location state
  const [locationType, setLocationType] = useState<'STUDIO' | 'IN_HOME'>(() => {
    if (selectedTherapist?.offersStudio) return 'STUDIO';
    if (selectedTherapist?.offersInHome) return 'IN_HOME';
    return 'STUDIO';
  });

  // Active step in checkout workflow:
  // 1: Therapist & Service, 2: Location, 3: Date & Time, 4: Customer Details, 5: Review
  const [activeStep, setActiveStep] = useState<number>(1);

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

  // Availability calculation
  const currentScheduleWindow = useMemo(() => {
    if (!selectedTherapist || !date) return null;
    return getScheduleWindowForDate(selectedTherapist.schedule, date);
  }, [selectedTherapist, date]);

  const availableTimeSlots = useMemo(() => {
    if (!selectedTherapist || !date || !selectedService) return [];
    return getAvailableTimeSlots(selectedTherapist, date, selectedService.durationMinutes);
  }, [selectedTherapist, date, selectedService]);

  const handleTherapistChange = (therapistId: string) => {
    const therapist = activeTherapists.find((t) => t.id === therapistId) || null;
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

  // Step Validation Helpers before moving forward
  const handleStep1Next = () => {
    setServerError(null);
    setFieldErrors({});
    if (!selectedTherapist) {
      setServerError('This therapist is no longer available.');
      return;
    }
    if (!selectedService) {
      setServerError('This service is no longer available.');
      return;
    }
    setActiveStep(2);
  };

  const handleStep2Next = () => {
    setServerError(null);
    setFieldErrors({});
    if (locationType === 'STUDIO' && !selectedTherapist?.offersStudio) {
      setServerError('This therapist does not offer studio appointments.');
      return;
    }
    if (locationType === 'IN_HOME' && !selectedTherapist?.offersInHome) {
      setServerError('This therapist does not offer in-home appointments.');
      return;
    }
    setActiveStep(3);
  };

  const handleStep3Next = () => {
    setServerError(null);
    setFieldErrors({});
    if (!selectedTherapist || !selectedService) return;

    const availabilityCheck = isAppointmentTimeAvailable(
      selectedTherapist,
      date,
      time,
      selectedService.durationMinutes
    );

    if (!availabilityCheck.isValid) {
      setServerError('That appointment time is no longer available. Please choose another time.');
      return;
    }
    setActiveStep(4);
  };

  const handleStep4Next = () => {
    setServerError(null);
    setFieldErrors({});

    const payload = {
      therapistId: selectedTherapist?.id || '',
      serviceId: selectedService?.id || '',
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
    setActiveStep(5);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});

    if (!selectedTherapist) {
      setServerError('This therapist is no longer available.');
      return;
    }

    if (!selectedService) {
      setServerError('This service is no longer available.');
      return;
    }

    const availabilityCheck = isAppointmentTimeAvailable(
      selectedTherapist,
      date,
      time,
      selectedService.durationMinutes
    );

    if (!availabilityCheck.isValid) {
      setServerError('That appointment time is no longer available. Please choose another time.');
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
      setActiveStep(4);
      return;
    }

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
        setServerError(resData.error || 'An unexpected error occurred. Please try again.');
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

      // Success! Redirect to booking confirmation / success page
      router.push(`/booking/success?id=${resData.booking.id}`);
    } catch (err) {
      console.error('Booking submission error:', err);
      setServerError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  // 1. Invalid Therapist Parameter Error State
  if (invalidTherapistUrl) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-rose-200 p-8 sm:p-12 shadow-xs text-center space-y-6">
        <div className="w-16 h-16 bg-rose-100 text-rose-700 rounded-2xl flex items-center justify-center mx-auto">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Therapist Not Available
          </h1>
          <p className="text-slate-600 text-sm">
            This therapist is no longer available. Please select another practitioner.
          </p>
        </div>
        <Link
          href="/find-a-therapist"
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-emerald-700 text-white font-semibold text-sm hover:bg-emerald-800 transition-colors"
        >
          Explore Available Therapists
        </Link>
      </div>
    );
  }

  // 2. Empty Therapists State
  if (activeTherapists.length === 0 || !selectedTherapist) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-xs text-center space-y-6">
        <div className="w-16 h-16 bg-amber-50 text-amber-700 rounded-2xl flex items-center justify-center mx-auto">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            No Therapists Currently Available
          </h1>
          <p className="text-slate-600 text-sm">
            There are currently no active massage therapists available for booking. Please check back later.
          </p>
        </div>
        <Link
          href="/find-a-therapist"
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-emerald-700 text-white font-semibold text-sm hover:bg-emerald-800 transition-colors"
        >
          Return to Find a Therapist
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Main Steps Column */}
      <div className="lg:col-span-7 space-y-6">

        {/* Workflow Progress Steps Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center justify-between text-xs font-semibold text-slate-600 overflow-x-auto gap-2">
          {[
            { id: 1, label: 'Therapist & Service' },
            { id: 2, label: 'Location' },
            { id: 3, label: 'Date & Time' },
            { id: 4, label: 'Customer Details' },
            { id: 5, label: 'Review' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveStep(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                activeStep === s.id
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : s.id < activeStep
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'hover:bg-slate-100 text-slate-600'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                activeStep === s.id
                  ? 'bg-white text-emerald-800'
                  : s.id < activeStep
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}>
                {s.id < activeStep ? '✓' : s.id}
              </span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Global Error Notice */}
        {serverError && (
          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-xs font-semibold">
            {serverError}
          </div>
        )}

        {/* Step 1: Therapist & Service Selection */}
        {activeStep === 1 && (
          <section className="bg-white rounded-3xl border border-emerald-600 ring-2 ring-emerald-600/10 p-6 sm:p-8 shadow-xs transition-all space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center">
                1
              </span>
              <h2 className="text-xl font-bold text-slate-900">Therapist & Service Selection</h2>
            </div>

            {invalidServiceUrl && (
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs space-y-1">
                <span className="font-bold block">This service is no longer available.</span>
                <p>
                  The requested service (&quot;{serviceParam}&quot;) is not offered by {selectedTherapist.name}.
                  Please choose from the available services below.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <label htmlFor="therapistSelect" className="block text-sm font-semibold text-slate-700">
                Selected Massage Therapist
              </label>
              <select
                id="therapistSelect"
                value={selectedTherapist.id}
                onChange={(e) => handleTherapistChange(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all"
              >
                {activeTherapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.title ? `— ${t.title}` : ''} ({t.location})
                  </option>
                ))}
              </select>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-4">
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
                  <p className="text-xs text-slate-500 truncate">{selectedTherapist.location}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                      ★ {selectedTherapist.rating}
                    </span>
                    <span className="text-xs text-slate-400">({selectedTherapist.reviewCount} reviews)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">
                Select Service <span className="text-rose-500">*</span>
              </label>
              {fieldErrors.serviceId && (
                <p className="text-xs font-medium text-rose-600">{fieldErrors.serviceId}</p>
              )}
              {selectedTherapist.services.length > 0 ? (
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
              ) : (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600">
                  This service is no longer available for this therapist.
                </div>
              )}
            </div>

            <div className="mt-6 text-right">
              <button
                type="button"
                onClick={handleStep1Next}
                className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Continue to Location →
              </button>
            </div>
          </section>
        )}

        {/* Step 2: Location Selection */}
        {activeStep === 2 && (
          <section className="bg-white rounded-3xl border border-emerald-600 ring-2 ring-emerald-600/10 p-6 sm:p-8 shadow-xs transition-all space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center">
                2
              </span>
              <h2 className="text-xl font-bold text-slate-900">Appointment Type & Location</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    : 'Not offered by this therapist.'}
                </p>
              </button>

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
                    : 'Not offered by this therapist.'}
                </p>
              </button>
            </div>

            <div className="mt-6 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="px-4 py-2 text-slate-600 font-semibold text-sm hover:underline cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleStep2Next}
                className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Continue to Date & Time →
              </button>
            </div>
          </section>
        )}

        {/* Step 3: Date & Time Selection */}
        {activeStep === 3 && (
          <section className="bg-white rounded-3xl border border-emerald-600 ring-2 ring-emerald-600/10 p-6 sm:p-8 shadow-xs transition-all space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center">
                3
              </span>
              <h2 className="text-xl font-bold text-slate-900">Date & Time Selection</h2>
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
                  onChange={(e) => {
                    setDate(e.target.value);
                    setTime('');
                  }}
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
                  disabled={!selectedService || !currentScheduleWindow || availableTimeSlots.length === 0}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none disabled:opacity-50 disabled:bg-slate-100"
                >
                  <option value="">-- Choose Time Slot --</option>
                  {availableTimeSlots.map((slot) => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.time && (
                  <p className="text-xs font-medium text-rose-600 mt-1">{fieldErrors.time}</p>
                )}
              </div>
            </div>

            <div className="mt-4">
              {!selectedService ? (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                  <span className="font-bold block mb-0.5">Please Select a Service</span>
                  Select a service in Step 1 to view available appointment times.
                </div>
              ) : !currentScheduleWindow ? (
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800">
                  <span className="font-bold block mb-0.5">Therapist Unavailable on Selected Date</span>
                  {selectedTherapist.name} does not work on this day of the week. Please choose another date.
                </div>
              ) : availableTimeSlots.length === 0 ? (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                  <span className="font-bold block mb-0.5">That appointment time is no longer available. Please choose another time.</span>
                  The selected service duration ({selectedService?.durationMinutes} mins) cannot fit inside working hours ({currentScheduleWindow.hoursStr}) for this date.
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900">
                  <span className="font-semibold block mb-0.5">Working Schedule for Selected Day</span>
                  {currentScheduleWindow.daysStr}: {currentScheduleWindow.hoursStr} ({availableTimeSlots.length} available slots)
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="px-4 py-2 text-slate-600 font-semibold text-sm hover:underline cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleStep3Next}
                className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Continue to Customer Details →
              </button>
            </div>
          </section>
        )}

        {/* Step 4: Customer Details */}
        {activeStep === 4 && (
          <section className="bg-white rounded-3xl border border-emerald-600 ring-2 ring-emerald-600/10 p-6 sm:p-8 shadow-xs transition-all space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center">
                4
              </span>
              <h2 className="text-xl font-bold text-slate-900">Your Contact & Address Details</h2>
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

            {locationType === 'IN_HOME' && (
              <div className="pt-4 mt-4 border-t border-slate-100 space-y-4">
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

            <div className="mt-4">
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

            <div className="mt-6 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="px-4 py-2 text-slate-600 font-semibold text-sm hover:underline cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleStep4Next}
                className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Review Summary →
              </button>
            </div>
          </section>
        )}

        {/* Step 5: Complete Booking Review */}
        {activeStep === 5 && (
          <section className="bg-white rounded-3xl border border-emerald-600 ring-2 ring-emerald-600/10 p-6 sm:p-8 shadow-xs transition-all space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center justify-center">
                5
              </span>
              <h2 className="text-xl font-bold text-slate-900">Review Booking Details</h2>
            </div>

            <div className="space-y-4 text-sm divide-y divide-slate-100">
              <div className="flex justify-between items-start pt-2">
                <div>
                  <span className="text-xs text-slate-500 block uppercase font-semibold">Therapist</span>
                  <span className="font-bold text-slate-900 text-base">{selectedTherapist.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
                >
                  Edit
                </button>
              </div>

              <div className="flex justify-between items-start pt-3">
                <div>
                  <span className="text-xs text-slate-500 block uppercase font-semibold">Service & Duration</span>
                  <span className="font-bold text-slate-900 text-base">
                    {selectedService ? `${selectedService.name} (${selectedService.durationMinutes} mins)` : 'Not selected'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
                >
                  Edit
                </button>
              </div>

              <div className="flex justify-between items-start pt-3">
                <div>
                  <span className="text-xs text-slate-500 block uppercase font-semibold">Appointment Mode</span>
                  <span className="font-semibold text-slate-800 text-base">
                    {locationType === 'STUDIO' ? 'Studio Visit' : 'In-Home Session'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
                >
                  Edit
                </button>
              </div>

              <div className="flex justify-between items-start pt-3">
                <div>
                  <span className="text-xs text-slate-500 block uppercase font-semibold">Scheduled Date & Start Time</span>
                  <span className="font-semibold text-slate-800 text-base">
                    {date && time ? `${formatUtcDateString(`${date}T00:00:00Z`)} @ ${formatUtcTimeString(`2000-01-01T${time}:00Z`)}` : '—'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
                >
                  Edit
                </button>
              </div>

              {locationType === 'IN_HOME' && (
                <div className="flex justify-between items-start pt-3">
                  <div>
                    <span className="text-xs text-slate-500 block uppercase font-semibold">Service Address</span>
                    <span className="font-medium text-slate-800 text-sm">
                      {addressLine1}{addressLine2 ? `, ${addressLine2}` : ''}, {city}, {state} {zipCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep(4)}
                    className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
              )}

              <div className="flex justify-between items-start pt-3">
                <div>
                  <span className="text-xs text-slate-500 block uppercase font-semibold">Customer Information</span>
                  <span className="font-medium text-slate-800 text-sm">
                    {firstName} {lastName} ({email} • {phone})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStep(4)}
                  className="text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
                >
                  Edit
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
              <span className="text-base font-bold text-slate-900">Calculated Booking Total</span>
              <span className="text-3xl font-extrabold text-emerald-800">
                ${selectedService ? selectedService.price : 0}
              </span>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 text-amber-900 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">Payment Placeholder</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                  Payment Pending
                </span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Booking details confirmed. Payment will be completed in the next step. No charge will be made right now.
              </p>
            </div>

            <div className="mt-6 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setActiveStep(4)}
                className="px-4 py-2 text-slate-600 font-semibold text-sm hover:underline cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedService || !currentScheduleWindow || availableTimeSlots.length === 0}
                className={`py-3.5 px-8 rounded-xl font-bold text-base text-white transition-all shadow-md flex items-center justify-center gap-2 ${
                  isSubmitting || !selectedService || !currentScheduleWindow || availableTimeSlots.length === 0
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
                    <span>Processing Request...</span>
                  </>
                ) : (
                  <span>Continue to Payment</span>
                )}
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Sidebar Summary Panel */}
      <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-8">
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          <h2 className="text-xl font-bold text-slate-900 pb-3 border-b border-slate-100">
            Booking Summary
          </h2>

          <div className="space-y-4 text-sm">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div>
                <span className="text-slate-500 text-xs block">Therapist</span>
                <span className="font-bold text-slate-900">{selectedTherapist.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="text-xs text-emerald-700 font-semibold hover:underline cursor-pointer"
              >
                Edit
              </button>
            </div>

            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div>
                <span className="text-slate-500 text-xs block">Service</span>
                <span className="font-bold text-slate-900">
                  {selectedService ? selectedService.name : 'Not selected'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="text-xs text-emerald-700 font-semibold hover:underline cursor-pointer"
              >
                Edit
              </button>
            </div>

            {selectedService && (
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <span className="text-slate-500">Duration</span>
                <span className="font-semibold text-slate-800">{selectedService.durationMinutes} minutes</span>
              </div>
            )}

            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="text-slate-500 text-xs block">Date & Time</span>
                <span className="font-semibold text-slate-800">
                  {date && time ? `${formatUtcDateString(`${date}T00:00:00Z`)} @ ${formatUtcTimeString(`2000-01-01T${time}:00Z`)}` : '—'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="text-xs text-emerald-700 font-semibold hover:underline cursor-pointer"
              >
                Edit
              </button>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="text-slate-500 text-xs block">Appointment Type</span>
                <span className="font-semibold text-slate-800">
                  {locationType === 'STUDIO' ? 'Studio' : 'In-Home'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="text-xs text-emerald-700 font-semibold hover:underline cursor-pointer"
              >
                Edit
              </button>
            </div>

            {locationType === 'IN_HOME' && addressLine1 && (
              <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                <div>
                  <span className="text-slate-500 text-xs block">Location</span>
                  <span className="font-medium text-slate-700 text-xs">
                    {addressLine1}{addressLine2 ? `, ${addressLine2}` : ''}<br />
                    {city}, {state} {zipCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStep(4)}
                  className="text-xs text-emerald-700 font-semibold hover:underline cursor-pointer"
                >
                  Edit
                </button>
              </div>
            )}

            {/* Total Price */}
            <div className="pt-2 flex justify-between items-baseline">
              <span className="text-base font-bold text-slate-900">Total Price</span>
              <span className="text-2xl font-extrabold text-emerald-800">
                ${selectedService ? selectedService.price : 0}
              </span>
            </div>

            {/* Payment Placeholder Banner */}
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 text-amber-900 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">Payment Step</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                  Payment Pending
                </span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Booking details confirmed. Payment will be completed in the next step. No charge will be made right now.
              </p>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
