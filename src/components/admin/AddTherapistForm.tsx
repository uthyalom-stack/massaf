'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createTherapistAction } from '@/app/admin/actions';

export function AddTherapistForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    telegramChatId: '',
    profileImage: '',
    bio: '',
    isActive: true,
    isFeatured: false,
    offersStudio: true,
    offersInHome: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);

    // Validate size (10 MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Selected image exceeds the maximum 10 MB size limit.');
      return;
    }

    // Validate client type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setErrorMessage('Invalid image type. Please select a JPEG, PNG, or WebP image.');
      return;
    }

    // Show instant local preview
    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);

    try {
      setUploadingImage(true);
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('folder', 'profile');
      uploadData.append('therapistId', 'temp');
      if (formData.profileImage) {
        uploadData.append('oldUrl', formData.profileImage);
      }

      const res = await fetch('/api/admin/media/upload', {
        method: 'POST',
        body: uploadData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Failed to upload image. Please try again.');
        return;
      }

      setFormData((prev) => ({ ...prev, profileImage: data.url }));
    } catch (err) {
      console.error('Error uploading image:', err);
      setErrorMessage('Network error while uploading image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleClearImage = () => {
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, profileImage: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.name.trim()) {
      setErrorMessage('Therapist name is required.');
      return;
    }

    if (uploadingImage) {
      setErrorMessage('Please wait for the image upload to complete.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await createTherapistAction({
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        telegramChatId: formData.telegramChatId.trim() || undefined,
        profileImage: formData.profileImage.trim() || undefined,
        bio: formData.bio.trim() || undefined,
        isActive: formData.isActive,
        isFeatured: formData.isFeatured,
        offersStudio: formData.offersStudio,
        offersInHome: formData.offersInHome,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to create therapist profile.');
        return;
      }

      // Redirect to edit page of newly created therapist
      if (res.therapist?.id) {
        router.push(`/admin/therapists/${res.therapist.id}?created=true`);
      }
    } catch (err) {
      console.error('Error submitting form:', err);
      setErrorMessage('An unexpected network error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/admin/therapists"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-700 transition-colors"
        >
          &larr; Back to Therapists Roster
        </Link>
      </div>

      {/* Form Container */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Add New Therapist</h1>
          <p className="text-xs text-slate-500 mt-1">
            Create a new massage therapist record in the database.
          </p>
        </div>

        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Elena Rostova, LMT"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="elena@example.com"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Phone & Telegram Chat ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(310) 555-0192"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Telegram Chat ID
              </label>
              <input
                type="text"
                value={formData.telegramChatId}
                onChange={(e) => setFormData({ ...formData, telegramChatId: e.target.value })}
                placeholder="e.g. 123456789"
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Profile Image Upload Component */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Profile Image
            </label>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Image Preview */}
              <div className="relative w-24 h-24 rounded-2xl border border-slate-200 overflow-hidden bg-slate-200 shrink-0 flex items-center justify-center">
                {imagePreview || formData.profileImage ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imagePreview || formData.profileImage}
                    alt="Profile preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl text-slate-400">👤</span>
                )}
                {uploadingImage && (
                  <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center text-white text-[10px] font-bold">
                    Uploading...
                  </div>
                )}
              </div>

              {/* Upload Controls */}
              <div className="space-y-2 flex-1 w-full">
                <input
                  type="file"
                  id="profile-image-upload"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  disabled={uploadingImage}
                  className="hidden"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="profile-image-upload"
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                      uploadingImage
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-emerald-700 text-white hover:bg-emerald-800'
                    }`}
                  >
                    <span>📷</span>
                    <span>{uploadingImage ? 'Uploading Image...' : 'Choose Image'}</span>
                  </label>

                  {(imagePreview || formData.profileImage) && (
                    <button
                      type="button"
                      onClick={handleClearImage}
                      disabled={uploadingImage}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-500">
                  Select JPEG, PNG, or WebP image from your phone, tablet, or desktop (max 10 MB).
                </p>

                {formData.profileImage && (
                  <p className="text-[10px] font-mono text-emerald-800 truncate max-w-md">
                    R2 URL: {formData.profileImage}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Biography & Background
            </label>
            <textarea
              rows={4}
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Describe clinical experience, certifications, and massage techniques..."
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
            />
          </div>

          {/* Checkboxes & Switches */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Settings & Availability</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <span className="font-semibold text-slate-800">Active (Visible in directory)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isFeatured}
                  onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <span className="font-semibold text-slate-800">Featured Therapist</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.offersStudio}
                  onChange={(e) => setFormData({ ...formData, offersStudio: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <span className="font-semibold text-slate-800">Offers Studio Appointments</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.offersInHome}
                  onChange={(e) => setFormData({ ...formData, offersInHome: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <span className="font-semibold text-slate-800">Offers In-Home Appointments</span>
              </label>
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Link
              href="/admin/therapists"
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || uploadingImage}
              className="px-6 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {submitting ? 'Creating Profile...' : 'Save & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
