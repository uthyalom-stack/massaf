'use client';

import React, { useState, useRef } from 'react';
import { updateBrandingSettingsAction, resetBrandingSettingsAction } from '@/app/admin/actions';
import { BrandingSettings } from '@/lib/branding';

interface BrandingSettingsSectionProps {
  initialSettings: BrandingSettings;
}

export function BrandingSettingsSection({ initialSettings }: BrandingSettingsSectionProps) {
  const [settings, setSettings] = useState<BrandingSettings>(initialSettings);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialSettings.logoUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image format
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setMsg({
        type: 'error',
        text: 'Invalid file format. Only JPEG, PNG, and WebP images are permitted.',
      });
      return;
    }

    // Validate size limit (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setMsg({
        type: 'error',
        text: 'File size exceeds the 5 MB limit.',
      });
      return;
    }

    setMsg(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleClearSelectedFile = () => {
    setSelectedFile(null);
    setPreviewUrl(settings.logoUrl);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setSettings((prev) => ({ ...prev, logoUrl: null }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);

    let activeLogoUrl = settings.logoUrl;

    try {
      // 1. If a new file is selected, upload it first to /api/admin/media/upload
      if (selectedFile) {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('folder', 'branding');
        formData.append('therapistId', 'system');

        const uploadRes = await fetch('/api/admin/media/upload', {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadRes.json();
        setUploading(false);

        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.error || 'Failed to upload branding image.');
        }

        activeLogoUrl = uploadData.url;
      }

      // 2. Persist updated branding settings
      const res = await updateBrandingSettingsAction({
        logoUrl: activeLogoUrl,
        siteName: settings.siteName,
        tagline: settings.tagline,
      });

      if (res.success && res.settings) {
        setSettings(res.settings);
        setPreviewUrl(res.settings.logoUrl);
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setMsg({ type: 'success', text: 'Branding settings saved successfully!' });
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to save branding settings.' });
      }
    } catch (err: unknown) {
      setMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'An error occurred while saving branding settings.',
      });
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset branding settings to system defaults?')) {
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      const res = await resetBrandingSettingsAction();
      if (res.success && res.settings) {
        setSettings(res.settings);
        setPreviewUrl(res.settings.logoUrl);
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setMsg({ type: 'success', text: 'Branding settings reset to system default.' });
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to reset branding settings.' });
      }
    } catch (err: unknown) {
      setMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'An error occurred while resetting branding settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>🎨</span> Branding & Brand Identity
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure the official MASSAF logo image, application name, and tagline across all public surfaces.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving || uploading}
            onClick={handleReset}
            className="px-3.5 py-2 min-h-[38px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Reset Default
          </button>

          <button
            type="button"
            disabled={saving || uploading}
            aria-busy={saving || uploading}
            onClick={handleSave}
            className="px-4 py-2 min-h-[38px] bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving || uploading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{uploading ? 'Uploading Image...' : 'Saving...'}</span>
              </>
            ) : (
              <span>Save Branding Settings</span>
            )}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between ${
            msg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <span>{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} className="font-bold underline ml-2 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Branding Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Logo Upload & Preview Card */}
        <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4">
          <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            Official Logo / Brand Image
          </label>

          <div className="flex items-center gap-4">
            {/* Live Preview Box */}
            <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
              {previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={previewUrl} alt="MASSAF Logo Preview" className="w-full h-full object-contain p-1" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-emerald-700 flex items-center justify-center text-white font-extrabold text-xl shadow-xs">
                  {settings.siteName.charAt(0) || 'M'}
                </div>
              )}
            </div>

            {/* Info & Upload Controls */}
            <div className="space-y-2 text-xs flex-1">
              <p className="text-slate-600 leading-normal">
                {previewUrl ? (
                  <span className="text-emerald-700 font-bold">Custom logo image active.</span>
                ) : (
                  <span className="text-slate-500 italic">No custom image set. Using styled fallback badge.</span>
                )}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                  id="branding-logo-upload"
                />

                <label
                  htmlFor="branding-logo-upload"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-2xs"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>Upload Logo Image</span>
                </label>

                {selectedFile && (
                  <button
                    type="button"
                    onClick={handleClearSelectedFile}
                    className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium underline cursor-pointer"
                  >
                    Clear Selected
                  </button>
                )}

                {previewUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="px-2.5 py-1.5 text-xs text-rose-600 hover:text-rose-800 font-bold bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Remove Logo
                  </button>
                )}
              </div>

              <p className="text-[11px] text-slate-400">
                Recommended: Square or horizontal PNG / WebP image (max 5 MB).
              </p>
            </div>
          </div>
        </div>

        {/* Site Name & Tagline Form */}
        <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Platform / Site Name
            </label>
            <input
              type="text"
              value={settings.siteName}
              onChange={(e) => setSettings((prev) => ({ ...prev, siteName: e.target.value }))}
              placeholder="MASSAF"
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-emerald-600 focus:border-emerald-600"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Brand Tagline / Subtitle
            </label>
            <input
              type="text"
              value={settings.tagline}
              onChange={(e) => setSettings((prev) => ({ ...prev, tagline: e.target.value }))}
              placeholder="Wellness & Therapy"
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:ring-emerald-600 focus:border-emerald-600"
            />
          </div>

          {settings.updatedAt && (
            <p className="text-[11px] text-slate-400 italic pt-1">
              Last updated: {new Date(settings.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
