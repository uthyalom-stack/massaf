import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { updateSiteContentAction } from '@/app/admin/actions';

export const revalidate = 0;

export default async function AdminContentPage() {
  const contents = await db.siteContent.findMany({
    orderBy: { key: 'asc' },
  });

  const defaultKeys = [
    { key: 'support', title: 'Support Center' },
    { key: 'help', title: 'Help & FAQs' },
    { key: 'contact', title: 'Contact Information' },
    { key: 'therapist-verification', title: 'Therapist Verification Standard' },
    { key: 'safety', title: 'Safety Guidelines' },
    { key: 'terms', title: 'Terms of Service' },
    { key: 'privacy', title: 'Privacy Policy' },
    { key: 'cancellation-policy', title: 'Cancellation & Refund Policy' },
    { key: 'accessibility', title: 'Accessibility Statement' },
  ];

  async function handleSaveContent(formData: FormData) {
    'use server';
    const key = formData.get('key') as string;
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;

    if (key && title && content) {
      await updateSiteContentAction(key, title, content);
      revalidatePath('/admin/content');
    }
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Support & Legal Content CMS</h1>
        <p className="text-sm text-slate-500">Edit content for support, safety guidelines, and legal policy pages.</p>
      </div>

      <div className="space-y-6">
        {defaultKeys.map(({ key, title: defaultTitle }) => {
          const existing = contents.find((c) => c.key === key);

          return (
            <form
              key={key}
              action={handleSaveContent}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"
            >
              <input type="hidden" name="key" value={key} />
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">
                  /{key}
                </span>
                <button
                  type="submit"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  Save Changes
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Page Title</label>
                <input
                  name="title"
                  type="text"
                  defaultValue={existing?.title || defaultTitle}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Page Content</label>
                <textarea
                  name="content"
                  rows={4}
                  defaultValue={existing?.content || ''}
                  placeholder={`Enter content for ${defaultTitle}...`}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500 font-sans"
                />
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}
