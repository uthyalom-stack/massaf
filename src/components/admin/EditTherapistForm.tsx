'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  updateTherapistAction,
  addTherapistPhotoAction,
  updateTherapistPhotoOrderAction,
  removeTherapistPhotoAction,
  assignTherapistServiceAction,
  removeTherapistServiceAction,
  addServiceAreaAction,
  removeServiceAreaAction,
  addTherapistAvailabilityAction,
  updateTherapistAvailabilityAction,
  removeTherapistAvailabilityAction,
} from '@/app/admin/actions';

export interface PhotoData {
  id: string;
  url: string;
  altText?: string | null;
  sortOrder: number;
}

export interface ServiceData {
  id: string;
  serviceId: string;
  customPrice?: number | null;
  customDurationMinutes?: number | null;
  isActive: boolean;
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  };
}

export interface ServiceAreaData {
  id: string;
  cityName: string;
  state: string;
  zipCode: string;
}

export interface AvailabilityData {
  id: string;
  dayOfWeek?: number | null;
  specificDate?: string | null;
  startTime: string;
  endTime: string;
  isUnavailable: boolean;
}

export interface DetailedTherapist {
  id: string;
  name: string;
  bio?: string | null;
  profileImage?: string | null;
  email?: string | null;
  phone?: string | null;
  rating: number;
  reviewCount: number;
  isActive: boolean;
  isFeatured: boolean;
  offersStudio: boolean;
  offersInHome: boolean;
  photos: PhotoData[];
  services: ServiceData[];
  serviceAreas: ServiceAreaData[];
  availabilities: AvailabilityData[];
}

interface EditTherapistProps {
  initialTherapist: DetailedTherapist;
  availableGlobalServices: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  }>;
}

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function EditTherapistForm({
  initialTherapist,
  availableGlobalServices,
}: EditTherapistProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'basic' | 'photos' | 'services' | 'areas' | 'availability'
  >('basic');

  const [therapist, setTherapist] = useState<DetailedTherapist>(initialTherapist);

  // State for Basic Info Form
  const [basicForm, setBasicForm] = useState({
    name: therapist.name,
    email: therapist.email || '',
    phone: therapist.phone || '',
    profileImage: therapist.profileImage || '',
    bio: therapist.bio || '',
    isActive: therapist.isActive,
    isFeatured: therapist.isFeatured,
    offersStudio: therapist.offersStudio,
    offersInHome: therapist.offersInHome,
  });
  const [basicSaving, setBasicSaving] = useState(false);
  const [basicMsg, setBasicMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State for Add Photo
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newPhotoAlt, setNewPhotoAlt] = useState('');
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State for Editing Photo Order
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [editingPhotoSortOrder, setEditingPhotoAltSortOrder] = useState<number>(0);

  // State for Service Assignment
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceMsg, setServiceMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State for Service Area
  const [cityName, setCityName] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [areaSaving, setAreaSaving] = useState(false);
  const [areaMsg, setAreaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State for Availability Add
  const [dayOfWeek, setDayOfWeek] = useState<number>(1); // Monday default
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityMsg, setAvailabilityMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State for Editing Availability
  const [editingAvailability, setEditingAvailability] = useState<AvailabilityData | null>(null);

  // --- Handlers --- //

  // Save Basic Info
  const handleSaveBasic = async (e: React.FormEvent) => {
    e.preventDefault();
    setBasicSaving(true);
    setBasicMsg(null);

    try {
      const res = await updateTherapistAction(therapist.id, {
        name: basicForm.name.trim(),
        email: basicForm.email.trim() || undefined,
        phone: basicForm.phone.trim() || undefined,
        profileImage: basicForm.profileImage.trim() || undefined,
        bio: basicForm.bio.trim() || undefined,
        isActive: basicForm.isActive,
        isFeatured: basicForm.isFeatured,
        offersStudio: basicForm.offersStudio,
        offersInHome: basicForm.offersInHome,
      });

      if (!res.success) {
        setBasicMsg({ type: 'error', text: res.error || 'Failed to update therapist' });
        return;
      }

      if (res.therapist) {
        setTherapist((prev) => ({ ...prev, ...res.therapist }));
      }
      setBasicMsg({ type: 'success', text: 'Basic details updated successfully!' });
      router.refresh();
    } catch (err) {
      console.error('Error updating basic therapist info:', err);
      setBasicMsg({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setBasicSaving(false);
    }
  };

  // Add Photo
  const handleAddPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhotoUrl.trim()) return;

    setPhotoSaving(true);
    setPhotoMsg(null);

    try {
      const res = await addTherapistPhotoAction(therapist.id, {
        url: newPhotoUrl.trim(),
        altText: newPhotoAlt.trim() || undefined,
        sortOrder: therapist.photos.length,
      });

      if (!res.success) {
        setPhotoMsg({ type: 'error', text: res.error || 'Failed to add photo' });
        return;
      }

      if (res.photo) {
        const addedPhoto: PhotoData = {
          id: res.photo.id,
          url: res.photo.url,
          altText: res.photo.altText,
          sortOrder: res.photo.sortOrder,
        };
        setTherapist((prev) => ({
          ...prev,
          photos: [...prev.photos, addedPhoto].sort((a, b) => a.sortOrder - b.sortOrder),
        }));
      }

      setNewPhotoUrl('');
      setNewPhotoAlt('');
      setPhotoMsg({ type: 'success', text: 'Photo added successfully!' });
      router.refresh();
    } catch (err) {
      console.error('Error adding photo:', err);
      setPhotoMsg({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setPhotoSaving(false);
    }
  };

  // Update Photo Sort Order
  const handleUpdatePhotoOrder = async (photoId: string, sortOrder: number) => {
    try {
      const res = await updateTherapistPhotoOrderAction(therapist.id, { photoId, sortOrder });

      if (!res.success) {
        alert(res.error || 'Failed to update photo order');
        return;
      }

      if (res.photo) {
        const updatedSortOrder = res.photo.sortOrder;
        setTherapist((prev) => ({
          ...prev,
          photos: prev.photos
            .map((p) => (p.id === photoId ? { ...p, sortOrder: updatedSortOrder } : p))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        }));
      }

      setEditingPhotoId(null);
      router.refresh();
    } catch (err) {
      console.error('Error updating photo order:', err);
    }
  };

  // Remove Photo
  const handleRemovePhoto = async (photoId: string) => {
    try {
      const res = await removeTherapistPhotoAction(therapist.id, photoId);

      if (!res.success) {
        alert(res.error || 'Failed to delete photo');
        return;
      }

      setTherapist((prev) => ({
        ...prev,
        photos: prev.photos.filter((p) => p.id !== photoId),
      }));
      router.refresh();
    } catch (err) {
      console.error('Error removing photo:', err);
    }
  };

  // Assign Service
  const handleAssignService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId) return;

    setServiceSaving(true);
    setServiceMsg(null);

    try {
      const res = await assignTherapistServiceAction(therapist.id, {
        serviceId: selectedServiceId,
        customPrice: customPrice ? parseFloat(customPrice) : undefined,
        isActive: true,
      });

      if (!res.success) {
        setServiceMsg({ type: 'error', text: res.error || 'Failed to assign service' });
        return;
      }

      if (res.therapistService) {
        const ts: ServiceData = {
          id: res.therapistService.id,
          serviceId: res.therapistService.serviceId,
          customPrice: res.therapistService.customPrice,
          customDurationMinutes: res.therapistService.customDurationMinutes,
          isActive: res.therapistService.isActive,
          service: {
            id: res.therapistService.service.id,
            name: res.therapistService.service.name,
            durationMinutes: res.therapistService.service.durationMinutes,
            price: res.therapistService.service.price,
          },
        };
        setTherapist((prev) => {
          const filtered = prev.services.filter((s) => s.serviceId !== selectedServiceId);
          return {
            ...prev,
            services: [...filtered, ts],
          };
        });
      }

      setSelectedServiceId('');
      setCustomPrice('');
      setServiceMsg({ type: 'success', text: 'Service assigned successfully!' });
      router.refresh();
    } catch (err) {
      console.error('Error assigning service:', err);
      setServiceMsg({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setServiceSaving(false);
    }
  };

  // Remove Service Assignment
  const handleRemoveService = async (serviceId: string) => {
    try {
      const res = await removeTherapistServiceAction(therapist.id, serviceId);

      if (!res.success) {
        alert(res.error || 'Failed to remove service');
        return;
      }

      setTherapist((prev) => ({
        ...prev,
        services: prev.services.filter((s) => s.serviceId !== serviceId),
      }));
      router.refresh();
    } catch (err) {
      console.error('Error removing service:', err);
    }
  };

  // Add Service Area
  const handleAddArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityName.trim() || !stateCode.trim() || !zipCode.trim()) return;

    setAreaSaving(true);
    setAreaMsg(null);

    try {
      const res = await addServiceAreaAction(therapist.id, {
        cityName: cityName.trim(),
        state: stateCode.trim().toUpperCase(),
        zipCode: zipCode.trim(),
      });

      if (!res.success) {
        setAreaMsg({ type: 'error', text: res.error || 'Failed to add service area' });
        return;
      }

      if (res.serviceArea) {
        const sa: ServiceAreaData = {
          id: res.serviceArea.id,
          cityName: res.serviceArea.cityName,
          state: res.serviceArea.state,
          zipCode: res.serviceArea.zipCode,
        };
        setTherapist((prev) => ({
          ...prev,
          serviceAreas: [...prev.serviceAreas, sa],
        }));
      }

      setCityName('');
      setStateCode('');
      setZipCode('');
      setAreaMsg({ type: 'success', text: 'Service area added!' });
      router.refresh();
    } catch (err) {
      console.error('Error adding service area:', err);
      setAreaMsg({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setAreaSaving(false);
    }
  };

  // Remove Service Area
  const handleRemoveArea = async (areaId: string) => {
    try {
      const res = await removeServiceAreaAction(therapist.id, areaId);

      if (!res.success) {
        alert(res.error || 'Failed to remove area');
        return;
      }

      setTherapist((prev) => ({
        ...prev,
        serviceAreas: prev.serviceAreas.filter((a) => a.id !== areaId),
      }));
      router.refresh();
    } catch (err) {
      console.error('Error removing area:', err);
    }
  };

  // Add Availability
  const handleAddAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (startTime >= endTime) {
      setAvailabilityMsg({ type: 'error', text: 'Start time must be before end time.' });
      return;
    }

    setAvailabilitySaving(true);
    setAvailabilityMsg(null);

    try {
      const res = await addTherapistAvailabilityAction(therapist.id, {
        dayOfWeek: Number(dayOfWeek),
        startTime,
        endTime,
        isUnavailable: false,
      });

      if (!res.success) {
        setAvailabilityMsg({ type: 'error', text: res.error || 'Failed to add availability' });
        return;
      }

      if (res.availability) {
        const av: AvailabilityData = {
          id: res.availability.id,
          dayOfWeek: res.availability.dayOfWeek,
          specificDate: res.availability.specificDate ? res.availability.specificDate.toISOString() : null,
          startTime: res.availability.startTime,
          endTime: res.availability.endTime,
          isUnavailable: res.availability.isUnavailable,
        };
        setTherapist((prev) => ({
          ...prev,
          availabilities: [...prev.availabilities, av],
        }));
      }

      setAvailabilityMsg({ type: 'success', text: 'Availability rule added!' });
      router.refresh();
    } catch (err) {
      console.error('Error adding availability:', err);
      setAvailabilityMsg({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setAvailabilitySaving(false);
    }
  };

  // Save Edited Availability
  const handleSaveAvailabilityEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAvailability) return;

    if (editingAvailability.startTime >= editingAvailability.endTime) {
      setAvailabilityMsg({ type: 'error', text: 'Start time must be strictly before end time.' });
      return;
    }

    setAvailabilitySaving(true);
    setAvailabilityMsg(null);

    try {
      const res = await updateTherapistAvailabilityAction(therapist.id, {
        availabilityId: editingAvailability.id,
        dayOfWeek: editingAvailability.dayOfWeek !== null && editingAvailability.dayOfWeek !== undefined
          ? Number(editingAvailability.dayOfWeek)
          : null,
        startTime: editingAvailability.startTime,
        endTime: editingAvailability.endTime,
        isUnavailable: editingAvailability.isUnavailable,
      });

      if (!res.success) {
        setAvailabilityMsg({ type: 'error', text: res.error || 'Failed to update availability entry' });
        return;
      }

      if (res.availability) {
        const updatedAv: AvailabilityData = {
          id: res.availability.id,
          dayOfWeek: res.availability.dayOfWeek,
          specificDate: res.availability.specificDate ? res.availability.specificDate.toISOString() : null,
          startTime: res.availability.startTime,
          endTime: res.availability.endTime,
          isUnavailable: res.availability.isUnavailable,
        };
        setTherapist((prev) => ({
          ...prev,
          availabilities: prev.availabilities.map((a) =>
            a.id === editingAvailability.id ? updatedAv : a
          ),
        }));
      }

      setEditingAvailability(null);
      setAvailabilityMsg({ type: 'success', text: 'Availability rule updated!' });
      router.refresh();
    } catch (err) {
      console.error('Error editing availability:', err);
      setAvailabilityMsg({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setAvailabilitySaving(false);
    }
  };

  // Remove Availability
  const handleRemoveAvailability = async (availabilityId: string) => {
    try {
      const res = await removeTherapistAvailabilityAction(therapist.id, availabilityId);

      if (!res.success) {
        alert(res.error || 'Failed to remove schedule entry');
        return;
      }

      setTherapist((prev) => ({
        ...prev,
        availabilities: prev.availabilities.filter((a) => a.id !== availabilityId),
      }));
      router.refresh();
    } catch (err) {
      console.error('Error removing availability entry:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
            <Link href="/admin/therapists" className="hover:text-emerald-700">Therapists</Link>
            <span>/</span>
            <span className="text-slate-900">{therapist.name}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <span>{therapist.name}</span>
            {therapist.isActive ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                Active
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                Inactive
              </span>
            )}
          </h1>
        </div>

        <div>
          <Link
            href={`/therapists/${therapist.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <span>Preview Profile</span>
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="border-b border-slate-200 flex space-x-1 sm:space-x-4 overflow-x-auto text-sm font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('basic')}
          className={`py-3 px-3 sm:px-4 border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'basic'
              ? 'border-emerald-600 text-emerald-800 font-extrabold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          1. Basic Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('photos')}
          className={`py-3 px-3 sm:px-4 border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'photos'
              ? 'border-emerald-600 text-emerald-800 font-extrabold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          2. Photos ({therapist.photos.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('services')}
          className={`py-3 px-3 sm:px-4 border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'services'
              ? 'border-emerald-600 text-emerald-800 font-extrabold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          3. Services & Pricing ({therapist.services.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('areas')}
          className={`py-3 px-3 sm:px-4 border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'areas'
              ? 'border-emerald-600 text-emerald-800 font-extrabold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          4. Service Areas ({therapist.serviceAreas.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('availability')}
          className={`py-3 px-3 sm:px-4 border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'availability'
              ? 'border-emerald-600 text-emerald-800 font-extrabold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          5. Availability ({therapist.availabilities.length})
        </button>
      </div>

      {/* TAB 1: BASIC DETAILS */}
      {activeTab === 'basic' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-3xl space-y-6">
          <h2 className="text-lg font-bold text-slate-900">Therapist Profile Information</h2>

          {basicMsg && (
            <div
              className={`p-4 rounded-xl text-xs font-medium ${
                basicMsg.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {basicMsg.text}
            </div>
          )}

          <form onSubmit={handleSaveBasic} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={basicForm.name}
                  onChange={(e) => setBasicForm({ ...basicForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={basicForm.email}
                  onChange={(e) => setBasicForm({ ...basicForm, email: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={basicForm.phone}
                  onChange={(e) => setBasicForm({ ...basicForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Profile Main Photo URL
                </label>
                <input
                  type="url"
                  value={basicForm.profileImage}
                  onChange={(e) => setBasicForm({ ...basicForm, profileImage: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Biography
              </label>
              <textarea
                rows={4}
                value={basicForm.bio}
                onChange={(e) => setBasicForm({ ...basicForm, bio: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Status & Modalities</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={basicForm.isActive}
                    onChange={(e) => setBasicForm({ ...basicForm, isActive: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <span className="font-semibold text-slate-800">Active Status</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={basicForm.isFeatured}
                    onChange={(e) => setBasicForm({ ...basicForm, isFeatured: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <span className="font-semibold text-slate-800">Featured Practitioner</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={basicForm.offersStudio}
                    onChange={(e) => setBasicForm({ ...basicForm, offersStudio: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <span className="font-semibold text-slate-800">Offers Studio Appointments</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={basicForm.offersInHome}
                    onChange={(e) => setBasicForm({ ...basicForm, offersInHome: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <span className="font-semibold text-slate-800">Offers In-Home Appointments</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={basicSaving}
                className="px-6 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {basicSaving ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: PHOTOS */}
      {activeTab === 'photos' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-3xl space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Add Gallery Photo</h2>

            {photoMsg && (
              <div
                className={`p-4 rounded-xl text-xs font-medium ${
                  photoMsg.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                {photoMsg.text}
              </div>
            )}

            <form onSubmit={handleAddPhoto} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Photo URL
                </label>
                <input
                  type="url"
                  required
                  value={newPhotoUrl}
                  onChange={(e) => setNewPhotoUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div className="w-full sm:w-48">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Alt Caption
                </label>
                <input
                  type="text"
                  value={newPhotoAlt}
                  onChange={(e) => setNewPhotoAlt(e.target.value)}
                  placeholder="Studio setup"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={photoSaving}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              >
                {photoSaving ? 'Adding...' : 'Add Photo'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Gallery Photos ({therapist.photos.length})
            </h2>

            {therapist.photos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {therapist.photos.map((photo) => (
                  <div key={photo.id} className="relative group rounded-xl border border-slate-200 overflow-hidden bg-slate-100 flex flex-col justify-between">
                    <div>
                      <img
                        src={photo.url}
                        alt={photo.altText || 'Therapist photo'}
                        className="w-full h-36 object-cover"
                      />
                      <div className="p-2 bg-white text-xs truncate border-t border-slate-100">
                        {photo.altText || 'No caption'}
                      </div>
                    </div>

                    {/* Photo Sort Order Controls */}
                    <div className="p-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
                      {editingPhotoId === photo.id ? (
                        <div className="flex items-center gap-1 w-full">
                          <input
                            type="number"
                            value={editingPhotoSortOrder}
                            onChange={(e) => setEditingPhotoAltSortOrder(Number(e.target.value))}
                            className="w-16 px-1.5 py-0.5 border border-slate-300 rounded text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdatePhotoOrder(photo.id, editingPhotoSortOrder)}
                            className="px-2 py-0.5 rounded bg-emerald-700 text-white font-bold text-[10px]"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPhotoId(null)}
                            className="px-1.5 py-0.5 text-slate-500 hover:text-slate-800 text-[10px]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-slate-500 font-medium">Order: {photo.sortOrder}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPhotoId(photo.id);
                              setEditingPhotoAltSortOrder(photo.sortOrder);
                            }}
                            className="text-emerald-700 hover:underline font-bold text-[11px]"
                          >
                            Edit Order
                          </button>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(photo.id)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-600 text-white opacity-90 hover:opacity-100 transition-opacity cursor-pointer shadow-xs"
                      title="Remove Photo"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic py-4">No gallery photos added yet.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SERVICES & PRICING */}
      {activeTab === 'services' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Assign Offered Service</h2>

            {serviceMsg && (
              <div
                className={`p-4 rounded-xl text-xs font-medium ${
                  serviceMsg.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                {serviceMsg.text}
              </div>
            )}

            <form onSubmit={handleAssignService} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Select Service
                </label>
                <select
                  required
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                >
                  <option value="">-- Choose a Service --</option>
                  {availableGlobalServices.map((srv) => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name} ({srv.durationMinutes} mins - Base: ${srv.price})
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full sm:w-40">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Custom Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="Optional override"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={serviceSaving}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              >
                {serviceSaving ? 'Assigning...' : 'Assign Service'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Assigned Services ({therapist.services.length})
            </h2>

            {therapist.services.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {therapist.services.map((ts) => (
                  <div key={ts.id} className="py-3.5 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{ts.service.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Duration: {ts.customDurationMinutes || ts.service.durationMinutes} mins &bull; Base Price: ${ts.service.price}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-sm font-extrabold text-slate-900">
                          ${ts.customPrice !== null && ts.customPrice !== undefined ? ts.customPrice : ts.service.price}
                        </span>
                        {ts.customPrice !== null && ts.customPrice !== undefined && (
                          <span className="block text-[10px] text-emerald-700 font-semibold uppercase">Custom Override</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveService(ts.serviceId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Remove Service"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic py-4">No services assigned yet.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SERVICE AREAS */}
      {activeTab === 'areas' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Add Service Coverage Area</h2>

            {areaMsg && (
              <div
                className={`p-4 rounded-xl text-xs font-medium ${
                  areaMsg.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                {areaMsg.text}
              </div>
            )}

            <form onSubmit={handleAddArea} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  City / Neighborhood
                </label>
                <input
                  type="text"
                  required
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  placeholder="e.g. Santa Monica"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  State (2-Letter)
                </label>
                <input
                  type="text"
                  required
                  maxLength={2}
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  placeholder="CA"
                  className="w-full px-3.5 py-2 text-sm uppercase bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  ZIP Code
                </label>
                <input
                  type="text"
                  required
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="90401"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4 flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={areaSaving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {areaSaving ? 'Adding...' : 'Add Coverage Area'}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Active Coverage Areas ({therapist.serviceAreas.length})
            </h2>

            {therapist.serviceAreas.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {therapist.serviceAreas.map((area) => (
                  <div
                    key={area.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800"
                  >
                    <span>{area.cityName}, {area.state} ({area.zipCode})</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveArea(area.id)}
                      className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                      title="Remove Area"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic py-4">No coverage areas added yet.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: AVAILABILITY */}
      {activeTab === 'availability' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              {editingAvailability ? 'Edit Working Hours Rule' : 'Add Working Hours Rule'}
            </h2>

            {availabilityMsg && (
              <div
                className={`p-4 rounded-xl text-xs font-medium ${
                  availabilityMsg.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                {availabilityMsg.text}
              </div>
            )}

            {editingAvailability ? (
              <form onSubmit={handleSaveAvailabilityEdit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Day of Week
                  </label>
                  <select
                    value={editingAvailability.dayOfWeek ?? 0}
                    onChange={(e) =>
                      setEditingAvailability({
                        ...editingAvailability,
                        dayOfWeek: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  >
                    {DAYS_OF_WEEK.map((day, idx) => (
                      <option key={idx} value={idx}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={editingAvailability.startTime}
                    onChange={(e) =>
                      setEditingAvailability({
                        ...editingAvailability,
                        startTime: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={editingAvailability.endTime}
                    onChange={(e) =>
                      setEditingAvailability({
                        ...editingAvailability,
                        endTime: e.target.value,
                      })
                    }
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingAvailability(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={availabilitySaving}
                    className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {availabilitySaving ? 'Saving...' : 'Update Schedule Rule'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAddAvailability} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Day of Week
                  </label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  >
                    {DAYS_OF_WEEK.map((day, idx) => (
                      <option key={idx} value={idx}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-3 flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={availabilitySaving}
                    className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {availabilitySaving ? 'Adding...' : 'Add Schedule Rule'}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Weekly Working Hours ({therapist.availabilities.length})
            </h2>

            {therapist.availabilities.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {therapist.availabilities.map((av) => (
                  <div key={av.id} className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 text-sm">
                        {av.dayOfWeek !== null && av.dayOfWeek !== undefined
                          ? DAYS_OF_WEEK[av.dayOfWeek]
                          : 'Specific Date'}
                      </span>
                      <span className="text-xs text-slate-500 ml-3 font-mono">
                        {av.startTime} – {av.endTime}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingAvailability(av)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveAvailability(av.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Remove Schedule Rule"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic py-4">No schedule rules configured yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
