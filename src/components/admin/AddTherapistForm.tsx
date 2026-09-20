'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createTherapistAction, updateTherapistAction } from '@/app/admin/actions';

export function AddTherapistForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    telegramChatId: '',
    bio: '',
    isActive: true,
    isFeatured: false,
    offersStudio: true,
    offersInHome: true,
  });

  // Local state for deferred profile image file & preview
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitStepText, setSubmitStepText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);

    // Validate size (10 MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Selected image exceeds the maximum 10 MB size limit.');
      return;
    }

    // Validate client MIME type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setErrorMessage('Invalid image type. Please select a JPEG, PNG, or WebP image.');
      return;
    }

    // Store local File reference and generate instant browser preview
    setSelectedFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleClearImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.name.trim()) {
      setErrorMessage('Therapist name is required.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitStepText('Creating therapist profile...');

      // 1. Create therapist record FIRST (profileImage initially undefined)
      const res = await createTherapistAction({
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        telegramChatId: formData.telegramChatId.trim() || undefined,
        bio: formData.bio.trim() || undefined,
        isActive: formData.isActive,
        isFeatured: formData.isFeatured,
        offersStudio: formData.offersStudio,
        offersInHome: formData.offersInHome,
      });

      if (!res.success || !res.therapist?.id) {
        setErrorMessage(res.error || 'Failed to create therapist profile.');
        return;
      }

      const createdTherapistId = res.therapist.id;

      // 2. If a profile image file was selected, upload to R2 using the REAL therapist ID
      if (selectedFile) {
        setSubmitStepText('Uploading profile image to Cloudflare R2...');

        const uploadData = new FormData();
        uploadData.append('file', selectedFile);
        uploadData.append('folder', 'profile');
        uploadData.append('therapistId', createdTherapistId);

        const uploadRes = await fetch('/api/admin/media/upload', {
          method: 'POST',
          body: uploadData,
        });

        const uploadJson = await uploadRes.json();

        if (!uploadRes.ok || !uploadJson.success || !uploadJson.url) {
          console.error('Profile image upload failed after therapist creation:', uploadJson.error);
          // Preserve therapist record, alert user, and redirect to edit page
          alert(
            `Therapist profile created successfully, but profile image upload failed: ${
              uploadJson.error || 'Unknown error'
            }. You can upload the image from the profile edit page.`
          );
          router.push(`/admin/therapists/${createdTherapistId}?created=true&imageError=true`);
          return;
        }

        // 3. Update therapist record with the returned R2 URL
        setSubmitStepText('Updating profile image reference...');
        const updateRes = await updateTherapistAction(createdTherapistId, {
          profileImage: uploadJson.url,
        });

        if (!updateRes.success) {
          console.error('Failed to update therapist record with profile image URL:', updateRes.error);
          router.push(`/admin/therapists/${createdTherapistId}?created=true&imageUpdateError=true`);
          return;
        }
      }

      // Redirect to edit page of newly created therapist
      router.push(`/admin/therapists/${createdTherapistId}?created=true`);
    } catch (err) {
      console.error('Error submitting form:', err);
      setErrorMessage('An unexpected network error occurred.');
    } finally {
      setSubmitting(false);
      setSubmitStepText(null);
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

          {/* Profile Image Selection Component (Deferred Upload) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Profile Image (Optional)
            </label>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Local Image Preview */}
              <div className="relative w-24 h-24 rounded-2xl border border-slate-200 overflow-hidden bg-slate-200 shrink-0 flex items-center justify-center">
                {imagePreview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imagePreview}
                    alt="Profile preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl text-slate-400">👤</span>
                )}
              </div>

              {/* Selection Controls */}
              <div className="space-y-2 flex-1 w-full">
                <input
                  type="file"
                  id="profile-image-upload"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  disabled={submitting}
                  className="hidden"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="profile-image-upload"
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                      submitting
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-emerald-700 text-white hover:bg-emerald-800'
                    }`}
                  >
                    <span>📷</span>
                    <span>{selectedFile ? 'Change Selected Image' : 'Choose Image'}</span>
                  </label>

                  {selectedFile && (
                    <button
                      type="button"
                      onClick={handleClearImage}
                      disabled={submitting}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-500">
                  Select JPEG, PNG, or WebP image from your device (max 10 MB). Uploads automatically after profile creation.
                </p>

                {selectedFile && (
                  <p className="text-[10px] font-mono text-emerald-800 truncate max-w-md">
                    Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
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
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {submitting ? submitStepText || 'Creating Profile...' : 'Save & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
