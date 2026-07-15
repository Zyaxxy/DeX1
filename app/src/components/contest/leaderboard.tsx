'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Medal, User, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LeaderboardEntry } from '@/hooks/useContestLeaderboard';
import { ROLE_LABELS } from '@/solana/client';
import { Skeleton } from '@/components/ui/skeleton';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  loading: boolean;
  matchStatus: 'live' | 'finished' | 'upcoming';
  poolMap?: Map<string, { name: string; role: number }>;
  currentUserAddress?: string;
}

const ROLE_COLORS_MAP: Record<string, string> = {
  0: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  1: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  2: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  3: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

export function Leaderboard({
  entries,
  loading,
  matchStatus,
  poolMap = new Map(),
  currentUserAddress,
}: LeaderboardProps) {
  const formatAddress = (address: string) => {
    if (!address) return 'Unknown';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const getRankStyle = (position: number) => {
    if (position === 1) return 'text-amber-400';
    if (position === 2) return 'text-gray-300';
    if (position === 3) return 'text-amber-600';
    return 'text-[#c6c9ab]';
  };

  const getRankIcon = (position: number) => {
    if (position === 1) return <Trophy className="w-5 h-5 text-amber-400" />;
    if (position === 2) return <Medal className="w-5 h-5 text-gray-300" />;
    if (position === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className={`font-mono text-[14px] font-[700] ${getRankStyle(position)}`}>#{position}</span>;
  };

  if (loading && entries.length === 0) {
    return (
      <div className="border border-[#454932] bg-[#1c1f2a]">
        <div className="p-4 border-b border-[#454932] flex items-center justify-between">
          <h3 className="font-heading text-[18px] font-[600] text-white">Leaderboard</h3>
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </div>
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="border border-[#454932] bg-[#1c1f2a] p-8 text-center">
        <User className="w-10 h-10 text-[#c6c9ab] mx-auto mb-3" />
        <p className="font-sans text-[14px] text-[#c6c9ab]">No entries yet</p>
      </div>
    );
  }

  return (
    <div className="border border-[#454932] bg-[#1c1f2a] overflow-hidden">
      <div className="p-4 border-b border-[#454932] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-heading text-[18px] font-[600] text-white">Leaderboard</h3>
          <span className="font-mono text-[12px] text-[#c6c9ab]">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {matchStatus === 'live' && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-[700] text-positive bg-positive/10 px-2 py-0.5 border border-positive/20">
              <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
              LIVE
            </span>
          )}
          {matchStatus === 'finished' && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-[700] text-blue-400 bg-blue-500/10 px-2 py-0.5 border border-blue-500/20">
              SETTLED
            </span>
          )}
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full">
          <thead className="bg-[#181b25] sticky top-0 z-10">
            <tr className="font-mono text-[11px] tracking-[0.02em] text-[#c6c9ab] uppercase">
              <th className="px-4 py-3 text-left w-16">Rank</th>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-right w-24">Score</th>
              <th className="px-4 py-3 text-right w-24">Prize</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {entries.map((entry, index) => (
                <motion.tr
                  key={entry.entryAddress}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={`
                    border-b border-[#454932]/50 hover:bg-[#181b25]/50 transition-colors
                    ${entry.isCurrentUser ? 'bg-positive/5 border-l-2 border-l-positive' : ''}
                  `}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center">
                      {getRankIcon(entry.position)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {entry.isCurrentUser && (
                        <span className="font-mono text-[10px] text-positive bg-positive/10 px-1.5 py-0.5 border border-positive/20">
                          YOU
                        </span>
                      )}
                      <span className="font-mono text-[13px] text-white">
                        {formatAddress(entry.userAddress)}
                      </span>
                    </div>
                    {entry.isCurrentUser && entry.athleteScores && Object.keys(entry.athleteScores).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(entry.athleteScores)
                          .filter(([, score]) => score > 0)
                          .map(([mint, score]) => {
                            const poolInfo = poolMap.get(mint);
                            const role = poolInfo?.role ?? 0;
                            return (
                              <span
                                key={mint}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] border ${ROLE_COLORS_MAP[String(role)]}`}
                              >
                                <span className="font-mono font-[700]">{score}</span>
                              </span>
                            );
                          })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-heading text-[18px] font-[700] text-white">
                      {entry.score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {entry.prizeEstimate > 0 ? (
                      <span className="font-mono text-[14px] font-[700] text-positive">
                        ${(entry.prizeEstimate / 1_000_000).toFixed(2)}
                      </span>
                    ) : (
                      <span className="font-mono text-[12px] text-[#c6c9ab]">-</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <div className="border border-[#454932] bg-[#1c1f2a]">
      <div className="p-4 border-b border-[#454932]">
        <Skeleton className="h-6 w-32 rounded" />
      </div>
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}