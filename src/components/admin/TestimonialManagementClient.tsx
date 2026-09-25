'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createTestimonialAction,
  updateTestimonialAction,
  toggleTestimonialPublishedAction,
  deleteTestimonialAction,
} from '@/app/admin/actions';

export interface TestimonialItem {
  id: string;
  authorName: string;
  authorLocation: string | null;
  rating: number;
  comment: string;
  isPublished: boolean;
  sortOrder: number;
  therapistId: string;
  therapistName: string;
  createdAt: string;
}

export interface TherapistOption {
  id: string;
  name: string;
}

interface TestimonialManagementClientProps {
  initialTestimonials: TestimonialItem[];
  therapists: TherapistOption[];
}

export function TestimonialManagementClient({
  initialTestimonials,
  therapists,
}: TestimonialManagementClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [isModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TestimonialItem | null>(null);

  const [formAuthorName, setFormAuthorName] = useState('');
  const [formAuthorLocation, setFormAuthorLocation] = useState('');
  const [formRating, setFormRating] = useState(5);
  const [formComment, setFormComment] = useState('');
  const [formTherapistId, setFormTherapistId] = useState('');
  const [formIsPublished, setFormIsPublished] = useState(true);

  const openAddModal = () => {
    setEditingItem(null);
    setFormAuthorName('');
    setFormAuthorLocation('');
    setFormRating(5);
    setFormComment('');
    setFormTherapistId(therapists.length > 0 ? therapists[0].id : '');
    setFormIsPublished(true);
    setIsAddModalOpen(true);
  };

  const openEditModal = (t: TestimonialItem) => {
    setEditingItem(t);
    setFormAuthorName(t.authorName);
    setFormAuthorLocation(t.authorLocation || '');
    setFormRating(t.rating);
    setFormComment(t.comment);
    setFormTherapistId(t.therapistId);
    setFormIsPublished(t.isPublished);
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage(null);
    setActionError(null);

    startTransition(async () => {
      let res;
      if (editingItem) {
        res = await updateTestimonialAction(editingItem.id, {
          authorName: formAuthorName,
          authorLocation: formAuthorLocation,
          rating: formRating,
          comment: formComment,
          therapistId: formTherapistId,
          isPublished: formIsPublished,
        });
      } else {
        res = await createTestimonialAction({
          authorName: formAuthorName,
          authorLocation: formAuthorLocation,
          rating: formRating,
          comment: formComment,
          therapistId: formTherapistId,
          isPublished: formIsPublished,
        });
      }

      if (res.success) {
        setActionMessage(`Testimonial ${editingItem ? 'updated' : 'created'} successfully.`);
        setIsAddModalOpen(false);
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to save testimonial.');
      }
    });
  };

  const handleTogglePublished = (id: string, currentStatus: boolean) => {
    startTransition(async () => {
      const res = await toggleTestimonialPublishedAction(id, !currentStatus);
      if (res.success) {
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to toggle publication status.');
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this promotional testimonial?')) return;
    startTransition(async () => {
      const res = await deleteTestimonialAction(id);
      if (res.success) {
        setActionMessage('Testimonial deleted successfully.');
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to delete testimonial.');
      }
    });
  };

  const filteredTestimonials = initialTestimonials.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.authorName.toLowerCase().includes(q) ||
      t.comment.toLowerCase().includes(q) ||
      t.therapistName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter testimonials by reviewer or therapist..."
          className="px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white max-w-sm"
        />
        <button
          type="button"
          onClick={openAddModal}
          className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          + Add Promotional Testimonial
        </button>
      </div>

      {/* Banners */}
      {actionMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
          {actionError}
        </div>
      )}

      {/* Testimonials List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
              <th className="p-4">Author / Reviewer</th>
              <th className="p-4">Associated Therapist</th>
              <th className="p-4">Rating & Comment</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTestimonials.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                  No promotional testimonials found.
                </td>
              </tr>
            ) : (
              filteredTestimonials.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-slate-900">{t.authorName}</div>
                    <div className="text-slate-400 text-xs">{t.authorLocation || 'No location'}</div>
                  </td>
                  <td className="p-4 font-semibold text-slate-800">{t.therapistName}</td>
                  <td className="p-4 space-y-1">
                    <div className="text-amber-600 font-bold">★ {t.rating}/5</div>
                    <div className="text-slate-600 line-clamp-2 italic">&ldquo;{t.comment}&rdquo;</div>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        t.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {t.isPublished ? 'Published' : 'Draft / Unpublished'}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePublished(t.id, t.isPublished)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs cursor-pointer"
                    >
                      {t.isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(t)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
              {editingItem ? 'Edit Testimonial' : 'Add Testimonial'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Associated Therapist</label>
                <select
                  value={formTherapistId}
                  onChange={(e) => setFormTherapistId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50/50 text-sm"
                  required
                >
                  {therapists.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Author Name</label>
                  <input
                    type="text"
                    value={formAuthorName}
                    onChange={(e) => setFormAuthorName(e.target.value)}
                    placeholder="e.g. Rachel K."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Location (Optional)</label>
                  <input
                    type="text"
                    value={formAuthorLocation}
                    onChange={(e) => setFormAuthorLocation(e.target.value)}
                    placeholder="e.g. Los Angeles, CA"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Star Rating</label>
                <select
                  value={formRating}
                  onChange={(e) => setFormRating(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-medium text-amber-600"
                >
                  <option value={5}>5 Stars ★★★★★</option>
                  <option value={4}>4 Stars ★★★★☆</option>
                  <option value={3}>3 Stars ★★★☆☆</option>
                  <option value={2}>2 Stars ★★☆☆☆</option>
                  <option value={1}>1 Star ★☆☆☆☆</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Testimonial Comment</label>
                <textarea
                  rows={3}
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  placeholder="Enter testimonial text..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="pub-check"
                  checked={formIsPublished}
                  onChange={(e) => setFormIsPublished(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                <label htmlFor="pub-check" className="font-semibold text-slate-800">
                  Publish testimonial publicly on homepage
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 font-semibold rounded-xl bg-slate-100 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  {isPending ? 'Saving...' : 'Save Testimonial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
