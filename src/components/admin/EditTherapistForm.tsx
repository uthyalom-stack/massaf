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
  deleteTherapistAction,
} from '@/app/admin/actions';
import { ConfirmModal } from '@/components/admin/ConfirmModal';
import { getAllUsStates } from '@/lib/us-states-data';
import {
  fetchCitiesForStateAction,
  fetchZipsForStateAction,
} from '@/app/actions/locations';

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
  endZipCode?: string | null;
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
  telegramChatId?: string | null;
  hourlyRate?: number;
  rating: number;
  reviewCount: number;
  isActive: boolean;
  isFeatured: boolean;
  isHomepageSelected?: boolean;
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
    telegramChatId: therapist.telegramChatId || '',
    profileImage: therapist.profileImage || '',
    bio: therapist.bio || '',
    hourlyRate: therapist.hourlyRate ?? 100.0,
    isActive: therapist.isActive,
    isFeatured: therapist.isFeatured,
    isHomepageSelected: therapist.isHomepageSelected ?? false,
    offersStudio: therapist.offersStudio,
    offersInHome: therapist.offersInHome,
  });

  // Local state for deferred profile image file & preview
  const [selectedProfileFile, setSelectedProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);

  const [basicSaving, setBasicSaving] = useState(false);
  const [basicSubmitStepText, setBasicSubmitStepText] = useState<string | null>(null);
  const [basicMsg, setBasicMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State for Gallery Upload (Supports Multiple Files)
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [newPhotoAlt, setNewPhotoAlt] = useState('');
  const [photoSaving, setPhotoSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State for External Photo URL Form
  const [externalPhotoUrl, setExternalPhotoUrl] = useState('');
  const [externalPhotoAlt, setExternalPhotoAlt] = useState('');
  const [externalPhotoSaving, setExternalPhotoSaving] = useState(false);

  // State for Editing Photo Order
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [editingPhotoSortOrder, setEditingPhotoAltSortOrder] = useState<number>(0);

  // State for Service Assignment
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customDuration, setCustomDuration] = useState('');
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceMsg, setServiceMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State for Service Area (Real U.S. Location Dropdowns via Server Actions)
  const usStatesList = getAllUsStates();
  const [stateCode, setStateCode] = useState('CA');
  const [cityName, setCityName] = useState('Los Angeles');
  const [zipCode, setZipCode] = useState('90001');
  const [endZipCode, setEndZipCode] = useState('92692');
  const [availableCities, setAvailableCities] = useState<string[]>(['Los Angeles', 'Beverly Hills', 'Santa Monica', 'Irvine', 'San Francisco', 'San Diego']);
  const [stateZips, setStateZips] = useState<string[]>([]);
  const [areaSaving, setAreaSaving] = useState(false);
  const [areaMsg, setAreaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Async location loaders when state changes
  const handleStateChange = async (newSegState: string) => {
    setStateCode(newSegState);
    const cities = await fetchCitiesForStateAction(newSegState);
    setAvailableCities(cities);
    const firstCity = cities[0] || '';
    setCityName(firstCity);

    const zips = await fetchZipsForStateAction(newSegState);
    setStateZips(zips);
    const firstZip = zips[0] || '';
    const lastZip = zips.length > 1 ? zips[zips.length - 1] : firstZip;
    setZipCode(firstZip);
    setEndZipCode(lastZip);
  };

  // Load state ZIP universe on initial tab load
  React.useEffect(() => {
    if (activeTab === 'areas' && stateZips.length === 0) {
      fetchCitiesForStateAction(stateCode).then(setAvailableCities);
      fetchZipsForStateAction(stateCode).then((zips) => {
        setStateZips(zips);
        if (zips.length > 0 && !zipCode) {
          setZipCode(zips[0]);
          setEndZipCode(zips[zips.length - 1]);
        }
      });
    }
  }, [activeTab, stateCode, stateZips.length, zipCode]);

  // State for Availability Add
  const [dayOfWeek, setDayOfWeek] = useState<number>(1); // Monday default
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityMsg, setAvailabilityMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State for Editing Availability
  const [editingAvailability, setEditingAvailability] = useState<AvailabilityData | null>(null);

  // Modal State for Confirming Destructive Actions
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    isLoading: boolean;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Delete',
    isLoading: false,
    onConfirm: async () => {},
  });

  // --- Handlers --- //

  // Profile Image Local Device File Selection (Deferred until Save)
  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBasicMsg(null);

    if (file.size > 10 * 1024 * 1024) {
      setBasicMsg({ type: 'error', text: 'Selected image exceeds the maximum 10 MB size limit.' });
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setBasicMsg({ type: 'error', text: 'Invalid image format. Please select JPEG, PNG, or WebP.' });
      return;
    }

    setSelectedProfileFile(file);
    setProfilePreview(URL.createObjectURL(file));
  };

  const handleClearProfileImage = () => {
    setSelectedProfileFile(null);
    setProfilePreview(null);
    setBasicForm((prev) => ({ ...prev, profileImage: '' }));
  };

  // Save Basic Info (Uploads profile image file if selected, then calls updateTherapistAction)
  const handleSaveBasic = async (e: React.FormEvent) => {
    e.preventDefault();
    setBasicSaving(true);
    setBasicMsg(null);

    let finalProfileUrl = basicForm.profileImage.trim();

    try {
      // 1. If a new profile image file was selected from device, upload it to R2 FIRST
      if (selectedProfileFile) {
        setBasicSubmitStepText('Uploading profile image to Cloudflare R2...');

        const uploadData = new FormData();
        uploadData.append('file', selectedProfileFile);
        uploadData.append('folder', 'profile');
        uploadData.append('therapistId', therapist.id);

        const uploadRes = await fetch('/api/admin/media/upload', {
          method: 'POST',
          body: uploadData,
        });

        const uploadJson = await uploadRes.json();

        if (!uploadRes.ok || !uploadJson.success || !uploadJson.url) {
          setBasicMsg({
            type: 'error',
            text: uploadJson.error || 'Failed to upload profile image to Cloudflare R2.',
          });
          setBasicSaving(false);
          setBasicSubmitStepText(null);
          return;
        }

        finalProfileUrl = uploadJson.url;
      }

      // 2. Persist therapist updates to DB (updateTherapistAction handles deleting old R2 image if replacement succeeds, or cleaning up new R2 image if DB update fails)
      setBasicSubmitStepText('Saving profile updates...');
      const res = await updateTherapistAction(therapist.id, {
        name: basicForm.name.trim(),
        email: basicForm.email.trim() || undefined,
        phone: basicForm.phone.trim() || undefined,
        telegramChatId: basicForm.telegramChatId.trim() || undefined,
        profileImage: finalProfileUrl || undefined,
        bio: basicForm.bio.trim() || undefined,
        hourlyRate: Number(basicForm.hourlyRate) || 100.0,
        isActive: basicForm.isActive,
        isFeatured: basicForm.isFeatured,
        isHomepageSelected: basicForm.isHomepageSelected,
        offersStudio: basicForm.offersStudio,
        offersInHome: basicForm.offersInHome,
      });

      if (!res.success) {
        setBasicMsg({ type: 'error', text: res.error || 'Failed to update therapist details.' });
        return;
      }

      if (res.therapist) {
        setTherapist((prev) => ({ ...prev, ...res.therapist }));
        setBasicForm((prev) => ({ ...prev, profileImage: res.therapist?.profileImage || '' }));
      }

      setSelectedProfileFile(null);
      setProfilePreview(null);
      setBasicMsg({ type: 'success', text: 'Basic details updated successfully!' });
      router.refresh();
    } catch (err) {
      console.error('Error updating basic therapist info:', err);
      setBasicMsg({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setBasicSaving(false);
      setBasicSubmitStepText(null);
    }
  };

  // Gallery File Selection (Supports multiple files)
  const handleGalleryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    setPhotoMsg(null);

    const validFiles: File[] = [];
    const previews: string[] = [];
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];

    for (const file of selectedFiles) {
      if (file.size > 10 * 1024 * 1024) {
        setPhotoMsg({ type: 'error', text: `File "${file.name}" exceeds the maximum 10 MB limit.` });
        return;
      }
      if (!validTypes.includes(file.type.toLowerCase())) {
        setPhotoMsg({ type: 'error', text: `File "${file.name}" is invalid. Only JPEG, PNG, and WebP are supported.` });
        return;
      }
      validFiles.push(file);
      previews.push(URL.createObjectURL(file));
    }

    setGalleryFiles((prev) => [...prev, ...validFiles]);
    setGalleryPreviews((prev) => [...prev, ...previews]);
  };

  // Remove individual file from pre-upload gallery selection
  const handleRemoveSelectedGalleryFile = (index: number) => {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    setGalleryPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear all pre-upload selected gallery files
  const handleClearGallerySelection = () => {
    setGalleryFiles([]);
    setGalleryPreviews([]);
    setUploadProgress(null);
  };

  // Add Gallery Photos (Upload to R2 & save records - Appends to existing gallery)
  const handleAddPhotos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (galleryFiles.length === 0) {
      setPhotoMsg({ type: 'error', text: 'Please select one or more image files to upload.' });
      return;
    }

    setPhotoSaving(true);
    setPhotoMsg(null);

    const newAddedPhotos: PhotoData[] = [];
    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < galleryFiles.length; i++) {
        const file = galleryFiles[i];
        setUploadProgress(`Uploading photo ${i + 1} of ${galleryFiles.length}...`);

        // 1. Upload image to R2 endpoint
        const uploadFormData = new FormData();
        uploadFormData.append('file', file);
        uploadFormData.append('folder', 'gallery');
        uploadFormData.append('therapistId', therapist.id);

        const uploadRes = await fetch('/api/admin/media/upload', {
          method: 'POST',
          body: uploadFormData,
        });

        const uploadData = await uploadRes.json();

        if (!uploadRes.ok || !uploadData.success) {
          console.error(`Failed to upload file ${file.name}:`, uploadData.error);
          failCount++;
          continue;
        }

        // 2. Add photo record to database
        const res = await addTherapistPhotoAction(therapist.id, {
          url: uploadData.url,
          altText: newPhotoAlt.trim() || undefined,
          sortOrder: therapist.photos.length + newAddedPhotos.length,
        });

        if (!res.success || !res.photo) {
          console.error(`Failed to create database record for ${file.name}:`, res.error);
          failCount++;
          continue;
        }

        newAddedPhotos.push({
          id: res.photo.id,
          url: res.photo.url,
          altText: res.photo.altText,
          sortOrder: res.photo.sortOrder,
        });
        successCount++;
      }

      // Update state by appending newly added photos to existing gallery
      if (newAddedPhotos.length > 0) {
        setTherapist((prev) => ({
          ...prev,
          photos: [...prev.photos, ...newAddedPhotos].sort((a, b) => a.sortOrder - b.sortOrder),
        }));
      }

      setGalleryFiles([]);
      setGalleryPreviews([]);
      setNewPhotoAlt('');
      setUploadProgress(null);

      if (failCount === 0) {
        setPhotoMsg({
          type: 'success',
          text: successCount === 1
            ? 'Photo uploaded to R2 and added to gallery!'
            : `All ${successCount} photos uploaded to R2 and added to gallery!`,
        });
      } else if (successCount > 0) {
        setPhotoMsg({
          type: 'error',
          text: `Uploaded ${successCount} photo(s) successfully, but ${failCount} file(s) failed.`,
        });
      } else {
        setPhotoMsg({
          type: 'error',
          text: 'Failed to upload selected gallery photos. Please try again.',
        });
      }

      router.refresh();
    } catch (err) {
      console.error('Error adding gallery photos:', err);
      setPhotoMsg({ type: 'error', text: 'An unexpected error occurred during photo upload.' });
    } finally {
      setPhotoSaving(false);
      setUploadProgress(null);
    }
  };

  // Add External Photo URL (Option B)
  const handleAddExternalPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!externalPhotoUrl.trim()) return;

    setExternalPhotoSaving(true);
    setPhotoMsg(null);

    try {
      const res = await addTherapistPhotoAction(therapist.id, {
        url: externalPhotoUrl.trim(),
        altText: externalPhotoAlt.trim() || undefined,
        sortOrder: therapist.photos.length,
      });

      if (!res.success) {
        setPhotoMsg({ type: 'error', text: res.error || 'Failed to add external photo' });
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

      setExternalPhotoUrl('');
      setExternalPhotoAlt('');
      setPhotoMsg({ type: 'success', text: 'External photo URL added to gallery!' });
      router.refresh();
    } catch (err) {
      console.error('Error adding external photo:', err);
      setPhotoMsg({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setExternalPhotoSaving(false);
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

  // Remove Photo (Trigger Modal & remove from DB and R2)
  const triggerRemovePhoto = (photoId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Gallery Photo?',
      message: 'Are you sure you want to remove this photo from the therapist gallery? If stored on Cloudflare R2, the object will also be safely deleted.',
      confirmText: 'Remove Photo',
      isLoading: false,
      onConfirm: async () => {
        try {
          setConfirmModal((prev) => ({ ...prev, isLoading: true }));
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
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
        }
      },
    });
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
        customDurationMinutes: customDuration ? parseInt(customDuration, 10) : undefined,
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
      setCustomDuration('');
      setServiceMsg({ type: 'success', text: 'Service assigned successfully!' });
      router.refresh();
    } catch (err) {
      console.error('Error assigning service:', err);
      setServiceMsg({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setServiceSaving(false);
    }
  };

  // Remove Service Assignment (Trigger Modal)
  const triggerRemoveService = (serviceId: string, serviceName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Service Assignment?',
      message: `Are you sure you want to remove '${serviceName}' from this therapist's offered services list?`,
      confirmText: 'Remove Service',
      isLoading: false,
      onConfirm: async () => {
        try {
          setConfirmModal((prev) => ({ ...prev, isLoading: true }));
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
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
        }
      },
    });
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
        endZipCode: endZipCode.trim() || undefined,
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
          endZipCode: res.serviceArea.endZipCode,
        };
        setTherapist((prev) => ({
          ...prev,
          serviceAreas: [...prev.serviceAreas, sa],
        }));
      }

      setCityName('');
      setStateCode('');
      setZipCode('');
      setEndZipCode('');
      setAreaMsg({ type: 'success', text: 'Service area added!' });
      router.refresh();
    } catch (err) {
      console.error('Error adding service area:', err);
      setAreaMsg({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setAreaSaving(false);
    }
  };

  // Remove Service Area (Trigger Modal)
  const triggerRemoveArea = (areaId: string, cityName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Service Coverage Area?',
      message: `Are you sure you want to remove '${cityName}' from this therapist's coverage area?`,
      confirmText: 'Remove Area',
      isLoading: false,
      onConfirm: async () => {
        try {
          setConfirmModal((prev) => ({ ...prev, isLoading: true }));
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
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
        }
      },
    });
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

  // Remove Availability (Trigger Modal)
  const triggerRemoveAvailability = (availabilityId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Schedule Rule?',
      message: 'Are you sure you want to remove this working hours schedule entry?',
      confirmText: 'Remove Rule',
      isLoading: false,
      onConfirm: async () => {
        try {
          setConfirmModal((prev) => ({ ...prev, isLoading: true }));
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
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
        }
      },
    });
  };

  // Delete Therapist (Trigger Modal)
  const triggerDeleteTherapist = () => {
    setConfirmModal({
      isOpen: true,
      title: `Delete Therapist Record: ${therapist.name}?`,
      message: `Are you sure you want to permanently delete therapist profile for ${therapist.name}? This will check for existing booking/review dependencies before proceeding.`,
      confirmText: 'Permanently Delete Therapist',
      isLoading: false,
      onConfirm: async () => {
        try {
          setConfirmModal((prev) => ({ ...prev, isLoading: true }));
          const res = await deleteTherapistAction(therapist.id);
          if (!res.success) {
            alert(res.error || 'Failed to delete therapist record');
            return;
          }
          router.push('/admin/therapists');
        } catch (err) {
          console.error('Error deleting therapist:', err);
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
        }
      },
    });
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  Hourly Rate ($/hr) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="10"
                  step="5"
                  required
                  value={basicForm.hourlyRate}
                  onChange={(e) => setBasicForm({ ...basicForm, hourlyRate: parseFloat(e.target.value) || 0 })}
                  placeholder="100"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none font-semibold text-emerald-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Telegram Chat ID
                </label>
                <input
                  type="text"
                  value={basicForm.telegramChatId}
                  onChange={(e) => setBasicForm({ ...basicForm, telegramChatId: e.target.value })}
                  placeholder="e.g. 123456789"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Profile Image Selection Component (Device Upload + Deferred Save OR External URL) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Profile Image
              </label>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Image Preview */}
                <div className="relative w-24 h-24 rounded-2xl border border-slate-200 overflow-hidden bg-slate-200 shrink-0 flex items-center justify-center">
                  {profilePreview || basicForm.profileImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={profilePreview || basicForm.profileImage}
                      alt="Profile preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl text-slate-400">👤</span>
                  )}
                </div>

                {/* Device Upload Controls (Deferred Save) */}
                <div className="space-y-2 flex-1 w-full">
                  <input
                    type="file"
                    id="edit-profile-image-upload"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleProfileImageChange}
                    disabled={basicSaving}
                    className="hidden"
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="edit-profile-image-upload"
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                        basicSaving
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-700 text-white hover:bg-emerald-800'
                      }`}
                    >
                      <span>📷</span>
                      <span>{selectedProfileFile ? 'Change Selected Image' : 'Choose Image From Device'}</span>
                    </label>

                    {(profilePreview || basicForm.profileImage || selectedProfileFile) && (
                      <button
                        type="button"
                        onClick={handleClearProfileImage}
                        disabled={basicSaving}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 transition-colors cursor-pointer"
                      >
                        Remove Image
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Select JPEG, PNG, or WebP image from phone or PC (max 10 MB). Upload occurs when clicking Save Profile Changes below.
                  </p>

                  {selectedProfileFile && (
                    <p className="text-[10px] font-mono text-emerald-800 truncate max-w-md">
                      Selected: {selectedProfileFile.name} ({(selectedProfileFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </p>
                  )}
                </div>
              </div>

              {/* Option B: External Image URL */}
              <div className="pt-2 border-t border-slate-200">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  OR External Image URL
                </label>
                <input
                  type="url"
                  value={basicForm.profileImage}
                  onChange={(e) => {
                    setSelectedProfileFile(null);
                    setProfilePreview(null);
                    setBasicForm({ ...basicForm, profileImage: e.target.value });
                  }}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-none font-mono"
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
                    checked={basicForm.isHomepageSelected}
                    onChange={(e) => setBasicForm({ ...basicForm, isHomepageSelected: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <span className="font-semibold text-slate-800">Display on Homepage</span>
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
                {basicSaving ? basicSubmitStepText || 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>

          {/* Danger Zone: Delete Therapist */}
          <div className="pt-6 mt-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-600">Danger Zone</h3>
              <p className="text-xs text-slate-500 mt-0.5">Permanently delete therapist profile if no historical bookings exist.</p>
            </div>
            <button
              type="button"
              onClick={triggerDeleteTherapist}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer shrink-0"
            >
              Delete Therapist Profile
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: PHOTOS */}
      {activeTab === 'photos' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-3xl space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Upload Gallery Photos</h2>

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

            {/* Option A: Upload Device Photos */}
            <form onSubmit={handleAddPhotos} className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Option A: Choose Device Photos (Multiple Allowed)
                </label>

                {/* Gallery Previews Grid with individual removal */}
                {galleryPreviews.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-2">
                    {galleryPreviews.map((prevUrl, idx) => (
                      <div key={idx} className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-200 group flex flex-col justify-between">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={prevUrl} alt={`Selected ${idx + 1}`} className="w-full h-24 object-cover" />
                        <div className="p-1.5 bg-white text-[10px] font-mono text-slate-600 truncate border-t border-slate-100">
                          {galleryFiles[idx]?.name}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSelectedGalleryFile(idx)}
                          className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-md text-[10px] font-bold opacity-90 hover:opacity-100"
                          title="Remove file"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 flex-1 w-full">
                  <input
                    type="file"
                    id="gallery-photos-upload"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleGalleryFileChange}
                    disabled={photoSaving}
                    className="hidden"
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="gallery-photos-upload"
                      className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <span>📷</span>
                      <span>
                        {galleryFiles.length > 0
                          ? `Add More Files (${galleryFiles.length} Selected)`
                          : 'Choose Gallery Photos'}
                      </span>
                    </label>

                    {galleryFiles.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearGallerySelection}
                        disabled={photoSaving}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-red-700 border border-slate-200 transition-colors cursor-pointer"
                      >
                        Clear All Selected
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Select JPEG, PNG, or WebP photos from phone or PC (max 10 MB per file). Uploading appends to existing gallery.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Alt Caption / Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={newPhotoAlt}
                    onChange={(e) => setNewPhotoAlt(e.target.value)}
                    placeholder="e.g. Studio massage room setup"
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={photoSaving || galleryFiles.length === 0}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer shrink-0 shadow-xs"
                >
                  {photoSaving
                    ? uploadProgress || 'Uploading to R2...'
                    : `Upload & Add ${galleryFiles.length > 1 ? `${galleryFiles.length} Photos` : 'Photo'}`}
                </button>
              </div>
            </form>

            <hr className="my-6 border-slate-200" />

            {/* Option B: Add External Photo URL */}
            <form onSubmit={handleAddExternalPhoto} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Option B: Add External Photo URL
              </h3>

              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Photo URL
                  </label>
                  <input
                    type="url"
                    required
                    value={externalPhotoUrl}
                    onChange={(e) => setExternalPhotoUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-none font-mono"
                  />
                </div>

                <div className="w-full sm:w-48">
                  <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Alt Caption
                  </label>
                  <input
                    type="text"
                    value={externalPhotoAlt}
                    onChange={(e) => setExternalPhotoAlt(e.target.value)}
                    placeholder="Studio setup"
                    className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={externalPhotoSaving || !externalPhotoUrl.trim()}
                  className="w-full sm:w-auto px-5 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs hover:bg-slate-900 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {externalPhotoSaving ? 'Adding...' : 'Add External URL'}
                </button>
              </div>
            </form>
          </div>

          {/* Existing Gallery Display */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Gallery Photos ({therapist.photos.length})
            </h2>

            {therapist.photos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {therapist.photos.map((photo) => (
                  <div key={photo.id} className="relative group rounded-xl border border-slate-200 overflow-hidden bg-slate-100 flex flex-col justify-between">
                    <div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
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
                      onClick={() => triggerRemovePhoto(photo.id)}
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

              <div className="w-full sm:w-36">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Custom Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="Use default"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div className="w-full sm:w-36">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Custom Duration (min)
                </label>
                <input
                  type="number"
                  step="5"
                  min="15"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder="Use default"
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
                        onClick={() => triggerRemoveService(ts.serviceId, ts.service.name)}
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
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  State
                </label>
                <select
                  required
                  value={stateCode}
                  onChange={(e) => handleStateChange(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                >
                  {usStatesList.map((st) => (
                    <option key={st.code} value={st.code}>
                      {st.name} ({st.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  City / Location Label
                </label>
                <select
                  required
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                >
                  {availableCities.map((ct) => (
                    <option key={ct} value={ct}>
                      {ct}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Start ZIP
                </label>
                {stateZips.length > 0 ? (
                  <select
                    required
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none font-mono"
                  >
                    {stateZips.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    maxLength={5}
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none font-mono"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  End ZIP (Multi-City Range)
                </label>
                {stateZips.length > 0 ? (
                  <select
                    value={endZipCode}
                    onChange={(e) => setEndZipCode(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none font-mono"
                  >
                    {stateZips.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    maxLength={5}
                    value={endZipCode}
                    onChange={(e) => setEndZipCode(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none font-mono"
                  />
                )}
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
                    <span>
                      {area.cityName}, {area.state} &mdash; {area.endZipCode && area.endZipCode !== area.zipCode ? `${area.zipCode}–${area.endZipCode}` : area.zipCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => triggerRemoveArea(area.id, area.cityName)}
                      className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer ml-1"
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
                        onClick={() => triggerRemoveAvailability(av.id)}
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

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText="Cancel"
        isDestructive={true}
        isLoading={confirmModal.isLoading}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
