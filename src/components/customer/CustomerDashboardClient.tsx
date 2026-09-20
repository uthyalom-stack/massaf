'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CustomerAuthModal } from './CustomerAuthModal';
import { ReviewForm } from './ReviewForm';

export interface BookingItem {
  id: string;
  bookingNumber: string;
  appointmentDateTime: string;
  durationMinutes: number;
  locationType: 'STUDIO' | 'IN_HOME';
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  notes: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED' | 'NO_SHOW';
  amount: number;
  paymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  paymentMethod: string | null;
  therapistId: string | null;
  serviceId: string;
  therapistName: string;
  therapistImage: string | null;
  serviceName: string;
  hasReview: boolean;
  review?: {
    id: string;
    rating: number;
    comment: string | null;
    status: string;
  } | null;
}

export interface CustomerAddressItem {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zipCode: string;
}

export interface CustomerFavoriteItem {
  id: string;
  therapistId: string;
  therapistName: string;
  profileImage?: string | null;
  rating: number;
  reviewCount: number;
  offersStudio: boolean;
  offersInHome: boolean;
}

export interface CustomerProfileData {
  id: string;
  name: string;
  email: string;
  phone: string;
  addresses: CustomerAddressItem[];
  favorites: CustomerFavoriteItem[];
  bookings: BookingItem[];
}

export function CustomerDashboardClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'addresses' | 'favorites' | 'profile'>('overview');

  // Profile Edit State
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);

  // Address Add Form State
  const [addAddrLabel, setAddAddrLabel] = useState('Home');
  const [addAddr1, setAddAddr1] = useState('');
  const [addAddr2, setAddAddr2] = useState('');
  const [addCity, setAddCity] = useState('');
  const [addState, setAddState] = useState('');
  const [addZip, setAddZip] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);

  // Reschedule Modal State
  const [rescheduleBooking, setRescheduleBooking] = useState<BookingItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('10:00');
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Review Modal State
  const [reviewBooking, setReviewBooking] = useState<BookingItem | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchProfile() {
      try {
        const res = await fetch('/api/account/profile');
        if (!active) return;
        if (res.status === 401) {
          setShowAuthModal(true);
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to load customer profile');
          setLoading(false);
          return;
        }

        setProfile(data.customer);
        setEditName(data.customer.name || '');
        setEditPhone(data.customer.phone || '');
      } catch {
        if (active) setError('An error occurred while loading your profile');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchProfile();
    return () => {
      active = false;
    };
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/account/profile');
      if (res.status === 401) {
        setShowAuthModal(true);
        return;
      }

      const data = await res.json();
      if (res.ok && data.customer) {
        setProfile(data.customer);
        setEditName(data.customer.name || '');
        setEditPhone(data.customer.phone || '');
      }
    } catch {
      // ignore reload error
    }
  }, []);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccessMsg(null);
    setError(null);

    try {
      const res = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, phone: editPhone }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update profile');
        return;
      }

      setProfileSuccessMsg('Profile details updated successfully');
      loadProfile();
    } catch {
      setError('An error occurred while updating profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAddress(true);
    setError(null);

    try {
      const res = await fetch('/api/account/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: addAddrLabel,
          addressLine1: addAddr1,
          addressLine2: addAddr2,
          city: addCity,
          state: addState,
          zipCode: addZip,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save address');
        return;
      }

      setAddAddr1('');
      setAddAddr2('');
      setAddCity('');
      setAddState('');
      setAddZip('');
      loadProfile();
    } catch {
      setError('An error occurred while adding address');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (!confirm('Are you sure you want to remove this saved address?')) return;
    try {
      const res = await fetch(`/api/account/addresses?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadProfile();
      }
    } catch {
      alert('Failed to delete address');
    }
  };

  const handleRemoveFavorite = async (therapistId: string) => {
    try {
      const res = await fetch('/api/account/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ therapistId }),
      });
      if (res.ok) {
        loadProfile();
      }
    } catch {
      alert('Failed to remove favorite');
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    try {
      const res = await fetch('/api/account/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to cancel booking');
        return;
      }
      alert('Booking cancelled successfully.');
      loadProfile();
    } catch {
      alert('An error occurred while cancelling the booking.');
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleBooking || !rescheduleDate || !rescheduleTime) return;

    setRescheduling(true);
    setRescheduleError(null);

    try {
      const res = await fetch('/api/account/bookings/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: rescheduleBooking.id,
          date: rescheduleDate,
          time: rescheduleTime,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRescheduleError(data.error || 'Failed to reschedule appointment');
        return;
      }

      alert('Appointment rescheduled successfully!');
      setRescheduleBooking(null);
      loadProfile();
    } catch {
      setRescheduleError('An error occurred while rescheduling');
    } finally {
      setRescheduling(false);
    }
  };

  const handleBookAgain = async (bookingId: string) => {
    try {
      const res = await fetch('/api/account/bookings/rebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to prepare rebooking');
        return;
      }

      const { therapistId, serviceId, locationType } = data.rebookData;
      router.push(`/booking?therapistId=${therapistId}&serviceId=${serviceId}&type=${locationType}`);
    } catch {
      alert('An error occurred preparing rebooking');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/customer/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    setProfile(null);
    setShowAuthModal(true);
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/3"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/2"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
            <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-slate-200 dark:border-slate-800 shadow-xl max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-2xl mx-auto mb-4">
            🔒
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Customer Access Required</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 leading-relaxed">
            Verify your customer email address and booking reference to securely access your MASSAF appointments, profile, addresses, and saved therapists.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-md"
          >
            Verify Account Access
          </button>
        </div>

        <CustomerAuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onVerified={loadProfile}
        />
      </div>
    );
  }

  const upcomingBookings = profile.bookings.filter(
    (b) => b.status === 'PENDING' || b.status === 'CONFIRMED' || b.status === 'ASSIGNED' || b.status === 'IN_PROGRESS'
  );
  const pastBookings = profile.bookings.filter(
    (b) => b.status === 'COMPLETED' || b.status === 'CANCELLED' || b.status === 'REFUNDED' || b.status === 'NO_SHOW'
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/50 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold mb-2">
            <span>Customer Dashboard</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            Welcome back, {profile.name}!
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {profile.email} • {profile.phone}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleLogout}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
          >
            Sign Out
          </button>
          <Link
            href="/find-a-therapist"
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-xs"
          >
            + Book Appointment
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-2xl">
          {error}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'overview'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('bookings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'bookings'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          My Bookings ({profile.bookings.length})
        </button>
        <button
          onClick={() => setActiveTab('addresses')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'addresses'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Saved Addresses ({profile.addresses.length})
        </button>
        <button
          onClick={() => setActiveTab('favorites')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'favorites'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Saved Therapists ({profile.favorites.length})
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            activeTab === 'profile'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Profile Settings
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Upcoming Appointments</span>
              <span className="text-3xl font-black text-slate-900 dark:text-white mt-1 block">{upcomingBookings.length}</span>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Past Sessions</span>
              <span className="text-3xl font-black text-slate-900 dark:text-white mt-1 block">{pastBookings.length}</span>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Saved Therapists</span>
              <span className="text-3xl font-black text-slate-900 dark:text-white mt-1 block">{profile.favorites.length}</span>
            </div>
          </div>

          {/* Next Upcoming Booking Card */}
          {upcomingBookings.length > 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-emerald-200 dark:border-emerald-800/50 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Next Upcoming Appointment</span>
                <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-300">
                  Ref: {upcomingBookings[0].bookingNumber}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{upcomingBookings[0].serviceName}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    With <strong className="text-slate-800 dark:text-slate-200">{upcomingBookings[0].therapistName}</strong> ({upcomingBookings[0].durationMinutes} mins)
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    📅 {new Date(upcomingBookings[0].appointmentDateTime).toLocaleString()} • {upcomingBookings[0].locationType === 'STUDIO' ? 'Studio' : 'In-Home'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setRescheduleBooking(upcomingBookings[0]);
                      setRescheduleDate(upcomingBookings[0].appointmentDateTime.split('T')[0]);
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                  >
                    Reschedule
                  </button>
                  <button
                    onClick={() => handleCancelBooking(upcomingBookings[0].id)}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 text-center">
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No upcoming appointments scheduled.</p>
              <Link href="/find-a-therapist" className="inline-block mt-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
                Find a Therapist & Book Now →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BOOKINGS */}
      {activeTab === 'bookings' && (
        <div className="space-y-6">
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Upcoming Appointments</h2>
          {upcomingBookings.length === 0 ? (
            <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center">
              No upcoming appointments found.
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingBookings.map((b) => (
                <div key={b.id} className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-slate-500">{b.bookingNumber}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {b.status} • {b.paymentStatus}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">{b.serviceName}</h3>
                      <p className="text-xs text-slate-500">Therapist: {b.therapistName} | Duration: {b.durationMinutes}m | Amount: ${b.amount.toFixed(2)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Date: {new Date(b.appointmentDateTime).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setRescheduleBooking(b);
                          setRescheduleDate(b.appointmentDateTime.split('T')[0]);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300"
                      >
                        Reschedule
                      </button>
                      <button
                        onClick={() => handleCancelBooking(b.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white pt-6">Past Appointments</h2>
          {pastBookings.length === 0 ? (
            <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center">
              No past appointment history.
            </div>
          ) : (
            <div className="space-y-4">
              {pastBookings.map((b) => (
                <div key={b.id} className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-slate-500">{b.bookingNumber}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {b.status}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">{b.serviceName}</h3>
                      <p className="text-xs text-slate-500">Therapist: {b.therapistName} | Date: {new Date(b.appointmentDateTime).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleBookAgain(b.id)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        Book Again
                      </button>
                      {b.status === 'COMPLETED' && !b.hasReview && (
                        <button
                          onClick={() => setReviewBooking(b)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-white"
                        >
                          Leave Review
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ADDRESSES */}
      {activeTab === 'addresses' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Add New Saved In-Home Address</h2>
            <form onSubmit={handleAddAddress} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Address Label</label>
                <input
                  type="text"
                  value={addAddrLabel}
                  onChange={(e) => setAddAddrLabel(e.target.value)}
                  placeholder="e.g. Home, Vacation"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Street Address</label>
                <input
                  type="text"
                  value={addAddr1}
                  onChange={(e) => setAddAddr1(e.target.value)}
                  placeholder="123 Main St"
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Apt / Suite (Optional)</label>
                <input
                  type="text"
                  value={addAddr2}
                  onChange={(e) => setAddAddr2(e.target.value)}
                  placeholder="Apt 4B"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">City</label>
                <input
                  type="text"
                  value={addCity}
                  onChange={(e) => setAddCity(e.target.value)}
                  placeholder="New York"
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">State (2-letter code)</label>
                <input
                  type="text"
                  value={addState}
                  onChange={(e) => setAddState(e.target.value)}
                  placeholder="NY"
                  required
                  maxLength={2}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">ZIP Code</label>
                <input
                  type="text"
                  value={addZip}
                  onChange={(e) => setAddZip(e.target.value)}
                  placeholder="10001"
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                />
              </div>
              <div className="sm:col-span-2 pt-2">
                <button
                  type="submit"
                  disabled={savingAddress}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                >
                  {savingAddress ? 'Saving...' : 'Save Address'}
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {profile.addresses.map((a) => (
              <div key={a.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {a.label}
                  </span>
                  <p className="text-xs font-bold text-slate-900 dark:text-white mt-2">{a.addressLine1} {a.addressLine2 || ''}</p>
                  <p className="text-xs text-slate-500">{a.city}, {a.state} {a.zipCode}</p>
                </div>
                <button
                  onClick={() => handleDeleteAddress(a.id)}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: FAVORITES */}
      {activeTab === 'favorites' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {profile.favorites.length === 0 ? (
            <div className="sm:col-span-3 p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              No saved therapists yet. Explore local therapists and tap ♡ to save them.
            </div>
          ) : (
            profile.favorites.map((f) => (
              <div key={f.id} className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-200 overflow-hidden shrink-0">
                    {f.profileImage ? (
                      <Image src={f.profileImage} alt={f.therapistName} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full bg-emerald-600 flex items-center justify-center text-white font-black">M</div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{f.therapistName}</h3>
                    <p className="text-xs text-slate-500">★ {f.rating.toFixed(1)} ({f.reviewCount} reviews)</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Link
                    href={`/therapists/${f.therapistId}`}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    View Profile
                  </Link>
                  <button
                    onClick={() => handleRemoveFavorite(f.therapistId)}
                    className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 5: PROFILE SETTINGS */}
      {activeTab === 'profile' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 max-w-xl space-y-4">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Customer Profile Details</h2>
          {profileSuccessMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl">
              {profileSuccessMsg}
            </div>
          )}
          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address (Read-only)</label>
              <input
                type="email"
                value={profile.email}
                disabled
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 text-slate-500 text-xs cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              {savingProfile ? 'Saving Changes...' : 'Update Profile'}
            </button>
          </form>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Reschedule Appointment</h3>
            <p className="text-xs text-slate-500">Ref: {rescheduleBooking.bookingNumber} • {rescheduleBooking.serviceName}</p>
            {rescheduleError && (
              <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl">{rescheduleError}</div>
            )}
            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">New Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">New Time</label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRescheduleBooking(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduling}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  {rescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Leave Review</h3>
              <button onClick={() => setReviewBooking(null)} className="text-slate-400 text-sm">✕</button>
            </div>
            <ReviewForm
              bookingId={reviewBooking.id}
              therapistName={reviewBooking.therapistName}
              onSuccess={() => {
                setReviewBooking(null);
                loadProfile();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
