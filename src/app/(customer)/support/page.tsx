import { db } from '@/lib/db';
import { SupportForm } from '@/components/customer/SupportForm';

export const revalidate = 60;

export default async function SupportPage() {
  const content = await db.siteContent.findUnique({ where: { key: 'support' } });

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10">
      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
          {content?.title || 'MASSAF Support Center'}
        </h1>
        <p className="text-slate-500 text-sm max-w-xl mx-auto">
          How can we assist you today? Reach out directly via our support form or review our help documentation below.
        </p>
      </div>

      <SupportForm />

      {content?.content && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap max-w-2xl mx-auto">
          {content.content}
        </div>
      )}
    </div>
  );
}
