import Link from 'next/link';

interface ContentPageProps {
  title: string;
  subtitle?: string;
  content: string;
  lastUpdated?: string;
}

export function ContentPageLayout({ title, subtitle, content, lastUpdated }: ContentPageProps) {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-200">
        <nav className="mb-6 text-sm text-slate-500">
          <Link href="/" className="hover:text-emerald-600 transition-colors">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-slate-800 font-medium">{title}</span>
        </nav>

        <header className="border-b border-slate-200 pb-6 mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-lg text-slate-600">{subtitle}</p>}
          {lastUpdated && (
            <p className="mt-2 text-xs text-slate-400">Last updated: {lastUpdated}</p>
          )}
        </header>

        <div className="prose prose-emerald max-w-none text-slate-700 leading-relaxed space-y-6 whitespace-pre-wrap">
          {content}
        </div>
      </div>
    </div>
  );
}
