import React from 'react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';

export const metadata = {
  title: 'Marketer Leaderboard | MASSAF Admin',
  description: 'Performance rankings across platform marketing partners',
};

export const dynamic = 'force-dynamic';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  email: string;
  clicks: number;
  totalBookings: number;
  paidBookings: number;
  paidRevenue: number;
}

export default async function LeaderboardPage() {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect('/admin/login');
  }

  // Fetch all STAFF marketer accounts and their marketing links + bookings
  const marketers = await db.user.findMany({
    where: { role: 'STAFF' },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      marketingLinks: {
        select: {
          id: true,
          clicks: true,
          bookings: {
            select: {
              id: true,
              amount: true,
              paymentStatus: true,
            },
          },
        },
      },
    },
  });

  // Calculate real performance metrics per marketer
  const entriesRaw = marketers.map((m) => {
    let clicks = 0;
    let totalBookings = 0;
    let paidBookings = 0;
    let paidRevenue = 0.0;

    for (const link of m.marketingLinks) {
      clicks += link.clicks;
      totalBookings += link.bookings.length;

      for (const b of link.bookings) {
        if (b.paymentStatus === 'PAID') {
          paidBookings++;
          paidRevenue += b.amount;
        }
      }
    }

    return {
      userId: m.id,
      name: m.name || m.email,
      email: m.email,
      clicks,
      totalBookings,
      paidBookings,
      paidRevenue: Math.round(paidRevenue * 100) / 100,
    };
  });

  // Deterministic Leaderboard Sorting:
  // Primary: Paid Revenue (desc)
  // Secondary: Paid Bookings (desc)
  // Tertiary: Total Clicks (desc)
  // Tie-breaker: Name / Email (asc)
  entriesRaw.sort((a, b) => {
    if (b.paidRevenue !== a.paidRevenue) {
      return b.paidRevenue - a.paidRevenue;
    }
    if (b.paidBookings !== a.paidBookings) {
      return b.paidBookings - a.paidBookings;
    }
    if (b.clicks !== a.clicks) {
      return b.clicks - a.clicks;
    }
    return a.name.localeCompare(b.name);
  });

  const leaderboard: LeaderboardEntry[] = entriesRaw.map((entry, index) => ({
    rank: index + 1,
    ...entry,
  }));

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-amber-400/20 text-amber-800 border-amber-300 font-black';
      case 2:
        return 'bg-slate-200 text-slate-800 border-slate-300 font-bold';
      case 3:
        return 'bg-amber-700/10 text-amber-900 border-amber-600/30 font-bold';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 font-semibold';
    }
  };

  const getRankMedal = (rank: number) => {
    switch (rank) {
      case 1:
        return '🥇 #1';
      case 2:
        return '🥈 #2';
      case 3:
        return '🥉 #3';
      default:
        return `#${rank}`;
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Marketer Performance Leaderboard
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Real-time performance rankings based on verified paid booking revenue.
          </p>
        </div>
        <div className="text-xs font-semibold bg-white text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs self-start sm:self-auto">
          {leaderboard.length} Marketer Partner(s)
        </div>
      </div>

      {/* Leaderboard Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 text-center">Rank</th>
                <th className="py-3.5 px-4">Marketer Name</th>
                <th className="py-3.5 px-4 text-right">Link Clicks</th>
                <th className="py-3.5 px-4 text-right">Total Bookings</th>
                <th className="py-3.5 px-4 text-right">Paid Bookings</th>
                <th className="py-3.5 px-4 text-right">Paid Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No marketer partner accounts registered yet.
                  </td>
                </tr>
              ) : (
                leaderboard.map((m) => {
                  const isCurrentUser = m.userId === session.entityId;
                  return (
                    <tr
                      key={m.userId}
                      className={`transition-colors ${
                        isCurrentUser
                          ? 'bg-emerald-50/60 hover:bg-emerald-50'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs border ${getRankBadge(
                            m.rank
                          )}`}
                        >
                          {getRankMedal(m.rank)}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{m.name}</span>
                          {isCurrentUser && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{m.email}</div>
                      </td>

                      <td className="py-4 px-4 text-right font-medium text-slate-900">
                        {m.clicks.toLocaleString()}
                      </td>

                      <td className="py-4 px-4 text-right font-medium text-slate-900">
                        {m.totalBookings.toLocaleString()}
                      </td>

                      <td className="py-4 px-4 text-right font-semibold text-emerald-800">
                        {m.paidBookings.toLocaleString()}
                      </td>

                      <td className="py-4 px-4 text-right font-black text-emerald-700 text-base">
                        ${m.paidRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
