import Link from 'next/link';
import { db } from '@/lib/db';

export const revalidate = 60;

export default async function ServicesPage() {
  const categories = await db.serviceCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      services: {
        where: { isActive: true },
      },
    },
  });

  const uncategorizedServices = await db.service.findMany({
    where: { isActive: true, categoryId: null },
  });

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header Hero */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1 rounded-full text-xs font-semibold">
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Therapeutic Massage Offerings
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">
            Explore Massage Services & Treatment Categories
          </h1>
          <p className="text-lg text-slate-600">
            Discover customized bodywork treatments performed by licensed, background-checked massage therapy professionals in your home or at a local studio.
          </p>
        </div>

        {/* Service Categories */}
        {categories.map((cat) => (
          <section key={cat.id} className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-2xl font-bold text-slate-900">{cat.name}</h2>
              {cat.description && <p className="mt-1 text-slate-600 text-sm">{cat.description}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cat.services.map((srv) => (
                <div
                  key={srv.id}
                  className="bg-slate-50 rounded-xl p-6 border border-slate-200 flex flex-col justify-between space-y-4 hover:border-emerald-300 transition-colors"
                >
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{srv.name}</h3>
                    {srv.description && (
                      <p className="mt-2 text-sm text-slate-600 line-clamp-3">{srv.description}</p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {srv.durationMinutes} mins
                      </div>
                      <div className="text-lg font-bold text-emerald-700">${srv.price}</div>
                    </div>

                    <Link
                      href={`/find-a-therapist?service=${encodeURIComponent(srv.name)}`}
                      className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      Book Now
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Uncategorized Services */}
        {uncategorizedServices.length > 0 && (
          <section className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-2xl font-bold text-slate-900">Additional Services</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {uncategorizedServices.map((srv) => (
                <div
                  key={srv.id}
                  className="bg-slate-50 rounded-xl p-6 border border-slate-200 flex flex-col justify-between space-y-4 hover:border-emerald-300 transition-colors"
                >
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{srv.name}</h3>
                    {srv.description && (
                      <p className="mt-2 text-sm text-slate-600 line-clamp-3">{srv.description}</p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {srv.durationMinutes} mins
                      </div>
                      <div className="text-lg font-bold text-emerald-700">${srv.price}</div>
                    </div>

                    <Link
                      href={`/find-a-therapist?service=${encodeURIComponent(srv.name)}`}
                      className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      Book Now
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
