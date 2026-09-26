'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { TherapistAuthModal } from './TherapistAuthModal';

export interface TherapistAppointment {
  id: string;
  bookingNumber: string;
  customerName: string;
  serviceName: string;
  durationMinutes: number;
  appointmentDateTime: string;
  locationType: 'STUDIO' | 'IN_HOME';
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  status: string;
  amount: number;
  paymentStatus: string;
}

export interface TherapistServiceItem {
  id: string;
  serviceId: string;
  serviceName: string;
  basePrice: number;
  baseDurationMinutes: number;
  customPrice: number | null;
  customDurationMinutes: number | null;
  effectivePrice: number;
  effectiveDurationMinutes: number;
  isActive: boolean;
}

export interface TherapistAvailabilityItem {
  id: string;
  dayOfWeek: number | null;
  specificDate: string | null;
  startTime: string;
  endTime: string;
  isUnavailable: boolean;
}

export interface TherapistServiceAreaItem {
  id: string;
  cityName: string;
  state: string;
  zipCode: string;
}

export interface TherapistPhotoItem {
  id: string;
  url: string;
  sortOrder: number;
}

export interface TherapistPortalData {
  id: string;
  name: string;
  bio: string | null;
  profileImage: string | null;
  email: string | null;
  phone: string | null;
  rating: number;
  reviewCount: number;
  offersStudio: boolean;
  offersInHome: boolean;
  photos: TherapistPhotoItem[];
  services: TherapistServiceItem[];
  availabilities: TherapistAvailabilityItem[];
  serviceAreas: TherapistServiceAreaItem[];
  earningsSummary: {
    totalEarned: number;
    completedAppointmentsCount: number;
  };
  appointments: TherapistAppointment[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TherapistDashboardClient() {
  const [data, setData] = useState<TherapistPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'appointments' | 'schedule' | 'services' | 'areas' | 'gallery' | 'profile'>('appointments');

  // Profile Edit State
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editOffersStudio, setEditOffersStudio] = useState(true);
  const [editOffersInHome, setEditOffersInHome] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Availability Schedule Form
  const [addDayOfWeek, setAddDayOfWeek] = useState<number>(1); // Monday
  const [addStartTime, setAddStartTime] = useState('09:00');
  const [addEndTime, setAddEndTime] = useState('17:00');
  const [addIsUnavailable, setAddIsUnavailable] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Service Area Form
  const [addCity, setAddCity] = useState('');
  const [addState, setAddState] = useState('');
  const [addZip, setAddZip] = useState('');
  const [savingArea, setSavingArea] = useState(false);

  // R2 Photo Upload State
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchPortalData() {
      try {
        const res = await fetch('/api/therapist/profile');
        if (!active) return;
        if (res.status === 401) {
          setShowAuthModal(true);
          setLoading(false);
          return;
        }

        const resData = await res.json();
        if (!res.ok) {
          setError(resData.error || 'Failed to load therapist profile');
          setLoading(false);
          return;
        }

        setData(resData.therapist);
        setEditName(resData.therapist.name || '');
        setEditBio(resData.therapist.bio || '');
        setEditOffersStudio(resData.therapist.offersStudio);
        setEditOffersInHome(resData.therapist.offersInHome);
      } catch {
        if (active) setError('An error occurred loading therapist portal');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchPortalData();
    return () => {
      active = false;
    };
  }, []);

  const loadPortalData = useCallback(async () => {
    try {
      const res = await fetch('/api/therapist/profile');
      if (res.status === 401) {
        setShowAuthModal(true);
        return;
      }
      const resData = await res.json();
      if (res.ok && resData.therapist) {
        setData(resData.therapist);
        setEditName(resData.therapist.name || '');
        setEditBio(resData.therapist.bio || '');
        setEditOffersStudio(resData.therapist.offersStudio);
        setEditOffersInHome(resData.therapist.offersInHome);
      }
    } catch {
      // ignore reload error
    }
  }, []);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);

    try {
      const res = await fetch('/api/therapist/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          bio: editBio,
          offersStudio: editOffersStudio,
          offersInHome: editOffersInHome,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        setError(resData.error || 'Failed to update therapist profile');
        return;
      }

      alert('Profile updated successfully');
      loadPortalData();
    } catch {
      setError('An error occurred while updating profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdateService = async (
    therapistServiceId: string,
    customPrice: string,
    customDurationMinutes: string,
    isActive: boolean
  ) => {
    try {
      const res = await fetch('/api/therapist/services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          therapistServiceId,
          customPrice: customPrice ? parseFloat(customPrice) : null,
          customDurationMinutes: customDurationMinutes ? parseInt(customDurationMinutes, 10) : null,
          isActive,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        alert(resData.error || 'Failed to update service');
        return;
      }

      loadPortalData();
    } catch {
      alert('Error updating service');
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSchedule(true);
    setError(null);

    try {
      const res = await fetch('/api/therapist/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayOfWeek: addDayOfWeek,
          startTime: addStartTime,
          endTime: addEndTime,
          isUnavailable: addIsUnavailable,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        setError(resData.error || 'Failed to add schedule window');
        return;
      }

      loadPortalData();
    } catch {
      setError('Error adding schedule window');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('Remove this schedule window?')) return;
    try {
      const res = await fetch(`/api/therapist/availability?id=${id}`, { method: 'DELETE' });
      if (res.ok) loadPortalData();
    } catch {
      alert('Error deleting schedule window');
    }
  };

  const handleAddArea = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingArea(true);
    setError(null);

    try {
      const res = await fetch('/api/therapist/service-areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityName: addCity,
          state: addState,
          zipCode: addZip,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        setError(resData.error || 'Failed to add service area');
        return;
      }

      setAddCity('');
      setAddState('');
      setAddZip('');
      loadPortalData();
    } catch {
      setError('Error adding service area');
    } finally {
      setSavingArea(false);
    }
  };

  const handleDeleteArea = async (id: string) => {
    if (!confirm('Remove this service area?')) return;
    try {
      const res = await fetch(`/api/therapist/service-areas?id=${id}`, { method: 'DELETE' });
      if (res.ok) loadPortalData();
    } catch {
      alert('Error deleting service area');
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !data) return;

    setUploadingPhoto(true);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        formData.append('type', 'gallery');
        formData.append('therapistId', data.id);

        const res = await fetch('/api/admin/media/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json();
          alert(`Failed to upload ${files[i].name}: ${errData.error}`);
        }
      }
      loadPortalData();
    } catch {
      alert('Error uploading gallery photos');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/therapist/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    setData(null);
    setShowAuthModal(true);
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/3"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-slate-200 dark:border-slate-800 shadow-xl max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-2xl mx-auto mb-4">
            🔑
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Therapist Portal Access</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 leading-relaxed">
            Please verify your therapist account access token to manage your appointments, availability, pricing, and profile.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-md"
          >
            Access Therapist Portal
          </button>
        </div>

        <TherapistAuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onVerified={loadPortalData}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-200 overflow-hidden shrink-0 relative">
            {data.profileImage ? (
              <Image src={data.profileImage} alt={data.name} fill className="object-cover" />
            ) : (
              <div className="w-full h-full bg-emerald-600 flex items-center justify-center text-white font-black text-xl">
                {data.name[0]}
              </div>
            )}
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/50 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold mb-1">
              <span>Therapist Portal</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">{data.name}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ★ {data.rating.toFixed(1)} ({data.reviewCount} reviews) • {data.email}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
        >
          Sign Out
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-2xl">
          {error}
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Appointments</span>
          <span className="text-3xl font-black text-slate-900 dark:text-white mt-1 block">{data.appointments.length}</span>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Completed Sessions</span>
          <span className="text-3xl font-black text-slate-900 dark:text-white mt-1 block">{data.earningsSummary.completedAppointmentsCount}</span>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Gross Completed Earnings</span>
          <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">${data.earningsSummary.totalEarned.toFixed(2)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('appointments')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'appointments' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          Appointments ({data.appointments.length})
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'schedule' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          Availability Schedule
        </button>
        <button
          onClick={() => setActiveTab('services')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'services' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          Service Pricing ({data.services.length})
        </button>
        <button
          onClick={() => setActiveTab('areas')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'areas' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          Service Areas ({data.serviceAreas.length})
        </button>
        <button
          onClick={() => setActiveTab('gallery')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'gallery' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          Profile Gallery ({data.photos.length})
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'profile' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100'
          }`}
        >
          Profile Settings
        </button>
      </div>

      {/* TAB 1: APPOINTMENTS */}
      {activeTab === 'appointments' && (
        <div className="space-y-4">
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Scheduled Appointments</h2>
          {data.appointments.length === 0 ? (
            <div className="p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              No appointments scheduled yet.
            </div>
          ) : (
            <div className="space-y-3">
              {data.appointments.map((a) => (
                <div key={a.id} className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-slate-500">{a.bookingNumber}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {a.status} • {a.paymentStatus}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">{a.serviceName}</h3>
                      <p className="text-xs text-slate-500">
                        Customer: <strong className="text-slate-800 dark:text-slate-200">{a.customerName}</strong> | {a.durationMinutes} mins | ${a.amount.toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        📅 {new Date(a.appointmentDateTime).toLocaleString()} • {a.locationType === 'STUDIO' ? 'Studio' : `In-Home (${a.addressLine1 || ''}, ${a.city || ''})`}
                      </p>
                    </div>

                    {/* Appointment Progress Actions */}
                    <div className="flex items-center gap-2 pt-2 sm:pt-0">
                      {a.status !== 'COMPLETED' && a.status !== 'CANCELLED' && a.status !== 'REFUNDED' && (
                        <>
                          {a.status !== 'IN_PROGRESS' && (
                            <button
                              onClick={async () => {
                                const res = await fetch('/api/therapist/appointments', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ bookingId: a.id, status: 'IN_PROGRESS' }),
                                });
                                if (res.ok) loadPortalData();
                                else {
                                  const err = await res.json();
                                  alert(err.error || 'Failed to update status');
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                            >
                              In Progress
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              const res = await fetch('/api/therapist/appointments', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ bookingId: a.id, status: 'COMPLETED' }),
                              });
                              if (res.ok) loadPortalData();
                              else {
                                const err = await res.json();
                                alert(err.error || 'Failed to update status');
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                          >
                            Mark Completed
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('Record customer no-show for this appointment?')) return;
                              const res = await fetch('/api/therapist/appointments', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ bookingId: a.id, status: 'NO_SHOW' }),
                              });
                              if (res.ok) loadPortalData();
                              else {
                                const err = await res.json();
                                alert(err.error || 'Failed to update status');
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                          >
                            Record No-Show
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SCHEDULE */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Add Recurring Weekly Availability Window</h2>
            <form onSubmit={handleAddSchedule} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Day of Week</label>
                <select
                  value={addDayOfWeek}
                  onChange={(e) => setAddDayOfWeek(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                >
                  {DAY_NAMES.map((name, idx) => (
                    <option key={idx} value={idx}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Start Time</label>
                <input
                  type="time"
                  value={addStartTime}
                  onChange={(e) => setAddStartTime(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">End Time</label>
                <input
                  type="time"
                  value={addEndTime}
                  onChange={(e) => setAddEndTime(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={savingSchedule}
                  className="w-full py-2 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {savingSchedule ? 'Adding...' : 'Add Window'}
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.availabilities.map((av) => (
              <div key={av.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-extrabold uppercase text-emerald-600 dark:text-emerald-400 block">
                    {av.dayOfWeek !== null ? DAY_NAMES[av.dayOfWeek] : 'Specific Date'}
                  </span>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                    {av.startTime} – {av.endTime}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteSchedule(av.id)}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SERVICES */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Custom Service Pricing & Duration Override</h2>
          <p className="text-xs text-slate-500">
            You can set custom prices and durations for services you offer. Leave empty to use default standard platform pricing.
          </p>
          <div className="space-y-4">
            {data.services.map((s) => (
              <div key={s.id} className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{s.serviceName}</h3>
                    <p className="text-xs text-slate-400">Default: ${s.basePrice.toFixed(2)} / {s.baseDurationMinutes}m</p>
                  </div>
                  <span className="text-xs font-extrabold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Active Effective: ${s.effectivePrice.toFixed(2)} / {s.effectiveDurationMinutes}m
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Custom Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={s.customPrice !== null ? s.customPrice : ''}
                      onBlur={(e) => handleUpdateService(s.id, e.target.value, String(s.customDurationMinutes || ''), s.isActive)}
                      placeholder={`Default: $${s.basePrice}`}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">Custom Duration (Mins)</label>
                    <input
                      type="number"
                      step="15"
                      defaultValue={s.customDurationMinutes !== null ? s.customDurationMinutes : ''}
                      onBlur={(e) => handleUpdateService(s.id, String(s.customPrice || ''), e.target.value, s.isActive)}
                      placeholder={`Default: ${s.baseDurationMinutes}m`}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SERVICE AREAS */}
      {activeTab === 'areas' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Add Covered In-Home Service Location</h2>
            <form onSubmit={handleAddArea} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">City Name</label>
                <input
                  type="text"
                  value={addCity}
                  onChange={(e) => setAddCity(e.target.value)}
                  placeholder="e.g. Brooklyn"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">State (2-letter code)</label>
                <input
                  type="text"
                  value={addState}
                  onChange={(e) => setAddState(e.target.value)}
                  placeholder="NY"
                  maxLength={2}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">ZIP Code</label>
                <input
                  type="text"
                  value={addZip}
                  onChange={(e) => setAddZip(e.target.value)}
                  placeholder="11201"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={savingArea}
                  className="w-full py-2 px-4 rounded-xl text-xs font-bold bg-emerald-600 text-white"
                >
                  {savingArea ? 'Adding...' : 'Add Location'}
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {data.serviceAreas.map((sa) => (
              <div key={sa.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{sa.cityName}, {sa.state}</p>
                  <span className="text-xs font-mono text-slate-500">ZIP: {sa.zipCode}</span>
                </div>
                <button
                  onClick={() => handleDeleteArea(sa.id)}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: GALLERY */}
      {activeTab === 'gallery' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Upload New Profile Gallery Photos</h2>
            <p className="text-xs text-slate-500">Select image files (JPEG, PNG, WebP up to 10MB) to upload directly to Cloudflare R2 storage.</p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleGalleryUpload}
              disabled={uploadingPhoto}
              className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
            />
            {uploadingPhoto && <p className="text-xs font-bold text-emerald-600">Uploading photos to Cloudflare R2...</p>}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {data.photos.map((p) => (
              <div key={p.id} className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                <Image src={p.url} alt="Gallery Photo" fill className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: PROFILE */}
      {activeTab === 'profile' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-w-xl space-y-4">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Therapist Profile Information</h2>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Display Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Professional Bio</label>
              <textarea
                rows={4}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editOffersStudio}
                  onChange={(e) => setEditOffersStudio(e.target.checked)}
                  className="rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Offers Studio Sessions
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editOffersInHome}
                  onChange={(e) => setEditOffersInHome(e.target.checked)}
                  className="rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Offers In-Home Sessions
              </label>
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white"
            >
              {savingProfile ? 'Saving...' : 'Update Profile'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
