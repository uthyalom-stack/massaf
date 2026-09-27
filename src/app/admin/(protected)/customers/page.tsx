import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { listCustomersAction } from '@/app/admin/actions';

export const metadata = {
  title: 'Customer Directory | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    search?: string;
    page?: string;
  }>;
}

export default async function AdminCustomersPage({ searchParams }: PageProps) {
  const session = await getVerifiedAdminSession();
  if (!session) redirect('/admin/login');
  if (session.role === 'STAFF') redirect('/admin/marketer');
  if (session.role === 'MANAGER') redirect('/admin');

  const params = await searchParams;
  const searchParam = params.search || '';
  const pageParam = parseInt(params.page || '1', 10) || 1;

  const res = await listCustomersAction(searchParam, pageParam, 20);
  const customers = res.success ? res.customers || [] : [];
  const pagination = res.pagination || { totalCount: 0, page: 1, pageSize: 20, totalPages: 1 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Customer Directory
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Read-only customer directory, booking history, and account activity records.
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <form method="GET" action="/admin/customers" className="flex items-center gap-3">
          <input
            type="text"
            name="search"
            defaultValue={searchParam}
            placeholder="Search customer name, email, phone..."
            className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-slate-50/50"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Customers Table & Mobile Cards */}
      {customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 italic">
          No customer records found matching your search.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                    <th className="p-4">Customer Name</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4 text-center">Bookings</th>
                    <th className="p-4 text-center">Reviews</th>
                    <th className="p-4">Registered</th>
                    <th className="p-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-bold text-slate-900">{c.name}</td>
                      <td className="p-4 font-mono text-slate-600">{c.email}</td>
                      <td className="p-4 text-slate-600">{c.phone}</td>
                      <td className="p-4 text-center font-bold text-emerald-700">{c.bookingCount}</td>
                      <td className="p-4 text-center text-slate-600">{c.reviewCount}</td>
                      <td className="p-4 text-slate-500">
                        {new Date(c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="p-4 text-right">
                        <Link
                          href={`/admin/customers/${c.id}`}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors"
                        >
                          View Profile &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {pagination.totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50">
                <span>
                  Showing Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.totalCount} total customers)
                </span>
                <div className="flex gap-2">
                  {pagination.page > 1 && (
                    <Link
                      href={`/admin/customers?page=${pagination.page - 1}&search=${encodeURIComponent(searchParam)}`}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold hover:bg-slate-100"
                    >
                      &larr; Previous
                    </Link>
                  )}
                  {pagination.page < pagination.totalPages && (
                    <Link
                      href={`/admin/customers?page=${pagination.page + 1}&search=${encodeURIComponent(searchParam)}`}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold hover:bg-slate-100"
                    >
                      Next &rarr;
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-4">
            {customers.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <span className="font-bold text-slate-900 text-sm block">{c.name}</span>
                    <span className="text-slate-500 font-mono text-xs block">{c.email}</span>
                  </div>
                  <Link
                    href={`/admin/customers/${c.id}`}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold text-xs"
                  >
                    View &rarr;
                  </Link>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Phone</span>
                    <span className="font-semibold text-slate-700">{c.phone || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Bookings</span>
                    <span className="font-bold text-emerald-700">{c.bookingCount}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Reviews</span>
                    <span className="font-semibold text-slate-700">{c.reviewCount}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Mobile Pagination Footer */}
            {pagination.totalPages > 1 && (
              <div className="p-4 bg-white rounded-2xl border border-slate-200 flex flex-col gap-2 text-center text-xs text-slate-500">
                <span>
                  Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.totalCount} total)
                </span>
                <div className="flex justify-center gap-2">
                  {pagination.page > 1 && (
                    <Link
                      href={`/admin/customers?page=${pagination.page - 1}&search=${encodeURIComponent(searchParam)}`}
                      className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-slate-800"
                    >
                      &larr; Previous
                    </Link>
                  )}
                  {pagination.page < pagination.totalPages && (
                    <Link
                      href={`/admin/customers?page=${pagination.page + 1}&search=${encodeURIComponent(searchParam)}`}
                      className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-slate-800"
                    >
                      Next &rarr;
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
