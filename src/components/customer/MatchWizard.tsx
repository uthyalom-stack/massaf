'use client';

import React, { useState } from 'react';
import { TherapistService as PublicServiceOption } from '@/types/customer';
import { MatchCriteria } from '@/lib/validations/matching';
import { MatchedTherapistResult } from '@/lib/matching';
import { MatchResults } from '@/components/customer/MatchResults';

interface MatchWizardProps {
  services: PublicServiceOption[];
}

const TOTAL_STEPS = 5;

export function MatchWizard({ services }: MatchWizardProps) {
  const [step, setStep] = useState(1);

  // Questionnaire form state
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    services.length > 0 ? services[0].id : ''
  );
  const [locationType, setLocationType] = useState<'STUDIO' | 'IN_HOME'>('IN_HOME');
  const [locationQuery, setLocationQuery] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [maxBudget, setMaxBudget] = useState<number | null>(null);
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');

  // UI / Async State
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<{
    items: MatchedTherapistResult[];
    criteria: MatchCriteria;
  } | null>(null);

  const handleNext = () => {
    setErrorMsg(null);

    // Validation per step
    if (step === 1 && !selectedServiceId) {
      setErrorMsg('Please select a massage service to continue.');
      return;
    }

    if (step === 2 && !locationType) {
      setErrorMsg('Please select your preferred session location type.');
      return;
    }

    if (step < TOTAL_STEPS) {
      setStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setErrorMsg(null);
    if (step > 1) {
      setStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const criteria: MatchCriteria = {
      serviceId: selectedServiceId,
      locationType,
      locationQuery,
      zipCode,
      maxBudget: maxBudget || undefined,
      preferredDate,
      preferredTime,
    };

    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Failed to calculate matches. Please try again.');
        setLoading(false);
        return;
      }

      setResults({
        items: data.matches || [],
        criteria,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Match submission error:', msg);
      setErrorMsg('A network error occurred. Please try submitting again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setResults(null);
    setStep(1);
    setErrorMsg(null);
  };

  // If results are generated, render MatchResults component
  if (results) {
    return (
      <MatchResults
        results={results.items}
        criteria={results.criteria}
        onStartOver={handleStartOver}
      />
    );
  }

  const activeServiceObj = services.find((s) => s.id === selectedServiceId);

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Progress Header */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between text-xs font-semibold text-emerald-400 uppercase tracking-wider">
          <span>Questionnaire</span>
          <span>Step {step} of {TOTAL_STEPS}</span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className="bg-emerald-500 h-2 transition-all duration-300 ease-out"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold">
            {step === 1 && 'What type of massage are you looking for?'}
            {step === 2 && 'Where would you like to receive therapy?'}
            {step === 3 && 'When would you prefer your session?'}
            {step === 4 && 'Do you have a target session budget?'}
            {step === 5 && 'Confirm your preferences'}
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1">
            {step === 1 && 'Select from available massage treatments in our therapist network.'}
            {step === 2 && 'Choose between having a therapist visit your home or going to a studio.'}
            {step === 3 && 'Select your target date to match therapist schedules.'}
            {step === 4 && 'Filter therapists who offer your selected service within your budget limit.'}
            {step === 5 && 'Review your criteria before running our therapist matching system.'}
          </p>
        </div>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-medium flex items-center gap-2">
            <svg className="w-5 h-5 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: SERVICE SELECTION */}
        {step === 1 && (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-900">
              Select Massage Treatment <span className="text-emerald-700">*</span>
            </label>
            <div className="grid grid-cols-1 gap-3">
              {services.map((service) => {
                const isSelected = selectedServiceId === service.id;
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => setSelectedServiceId(service.id)}
                    className={`p-4 rounded-xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'border-emerald-700 bg-emerald-50/60 ring-2 ring-emerald-700/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="space-y-1">
                      <span className="text-base font-bold text-slate-900 block">
                        {service.name}
                      </span>
                      {service.description && (
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {service.description}
                        </p>
                      )}
                      <span className="inline-block text-xs font-semibold text-slate-500 pt-1">
                        Standard Duration: {service.durationMinutes} mins
                      </span>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="text-base font-extrabold text-slate-900">
                        ${service.price}
                      </span>
                      <span className="text-[10px] text-slate-500 block">base rate</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: LOCATION & SERVICE AREA */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-900">
                Session Preference <span className="text-emerald-700">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setLocationType('IN_HOME')}
                  className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${
                    locationType === 'IN_HOME'
                      ? 'border-emerald-700 bg-emerald-50/60 ring-2 ring-emerald-700/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">In-Home Session</h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Therapist travels to your home or hotel with full equipment.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setLocationType('STUDIO')}
                  className={`p-5 rounded-xl border text-left transition-all cursor-pointer ${
                    locationType === 'STUDIO'
                      ? 'border-emerald-700 bg-emerald-50/60 ring-2 ring-emerald-700/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0V11m0 0V5" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">Studio Appointment</h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Visit therapist&apos;s studio facility.
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label htmlFor="locationQuery" className="block text-xs font-semibold text-slate-700 mb-1">
                  City / Area (Optional)
                </label>
                <input
                  id="locationQuery"
                  type="text"
                  value={locationQuery}
                  onChange={(e) => setLocationQuery(e.target.value)}
                  placeholder="e.g. Los Angeles, Manhattan"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-emerald-700 focus:ring-1 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label htmlFor="zipCode" className="block text-xs font-semibold text-slate-700 mb-1">
                  5-Digit ZIP Code (Optional)
                </label>
                <input
                  id="zipCode"
                  type="text"
                  maxLength={5}
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="e.g. 90210"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-emerald-700 focus:ring-1 focus:ring-emerald-700"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: PREFERRED DATE & TIME */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <label htmlFor="preferredDate" className="block text-sm font-semibold text-slate-900 mb-1">
                Preferred Date (Optional)
              </label>
              <p className="text-xs text-slate-500 mb-3">
                Select your target session date to check therapist availability windows.
              </p>
              <input
                id="preferredDate"
                type="date"
                value={preferredDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-emerald-700 focus:ring-1 focus:ring-emerald-700"
              />
            </div>

            <div>
              <label htmlFor="preferredTime" className="block text-sm font-semibold text-slate-900 mb-1">
                Time of Day Preference (Optional)
              </label>
              <div className="grid grid-cols-3 gap-3 pt-1">
                {[
                  { id: 'morning', label: 'Morning (8am - 12pm)' },
                  { id: 'afternoon', label: 'Afternoon (12pm - 5pm)' },
                  { id: 'evening', label: 'Evening (5pm - 9pm)' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setPreferredTime(preferredTime === opt.id ? '' : opt.id)
                    }
                    className={`py-3 px-2 rounded-xl border text-xs font-semibold text-center transition-all cursor-pointer ${
                      preferredTime === opt.id
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-700/20'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: BUDGET / PRICE CAP */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-1">
                Max Target Session Budget
              </label>
              <p className="text-xs text-slate-500 mb-4">
                We will prioritize therapists whose prices for your selected treatment fit within your budget.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { value: 120, label: 'Under $120' },
                  { value: 150, label: 'Under $150' },
                  { value: 200, label: 'Under $200' },
                  { value: null, label: 'No Limit' },
                ].map((opt) => {
                  const isSelected = maxBudget === opt.value;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setMaxBudget(opt.value)}
                      className={`p-4 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-700 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-700/20 font-bold'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <span className="text-sm block">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: REVIEW & SUBMIT */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3 text-sm">
              <h3 className="font-bold text-slate-900 uppercase tracking-wider text-xs border-b border-slate-200 pb-2">
                Summary of Your Matching Requirements
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Massage Treatment:</span>
                  <span className="font-semibold text-slate-900">
                    {activeServiceObj?.name || 'Selected Treatment'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Session Type:</span>
                  <span className="font-semibold text-slate-900">
                    {locationType === 'IN_HOME' ? 'In-Home Visit' : 'Studio Appointment'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Target Location / ZIP:</span>
                  <span className="font-semibold text-slate-900">
                    {locationQuery || zipCode ? `${locationQuery} ${zipCode}`.trim() : 'Any location'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Max Budget:</span>
                  <span className="font-semibold text-slate-900">
                    {maxBudget ? `$${maxBudget}` : 'No limit'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Preferred Date:</span>
                  <span className="font-semibold text-slate-900">
                    {preferredDate || 'Flexible'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls / Navigation */}
        <div className="pt-6 border-t border-slate-100 flex items-center justify-between gap-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-xs sm:text-sm cursor-pointer disabled:opacity-50"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 font-semibold text-white transition-colors text-xs sm:text-sm cursor-pointer shadow-xs"
            >
              Continue
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 font-bold text-white transition-colors text-xs sm:text-sm cursor-pointer shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Calculating Matches...
                </>
              ) : (
                'Find My Matches'
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
