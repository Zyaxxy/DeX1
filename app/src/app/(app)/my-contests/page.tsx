'use client';

import { useState, useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useUserEntries, EnrichedEntry } from '@/hooks/useUserEntries';
import { useGlobalScores } from '@/hooks/useGlobalScores';
import { ScoringRules } from '@/components/contest/scoring-rules';
import { ClaimButton } from '@/components/contest/claim-button';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Trophy,
  Wallet,
  Clock,
  Users,
  ChevronRight,
  RefreshCw,
  Target,
  Award,
  TrendingUp,
  Search,
  ExternalLink,
  Zap,
  Calendar,
  DollarSign,
} from 'lucide-react';
import Navbar from '@/components/layout/navbar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ScoreData {
  score: number;
  position: number;
  prizeEstimate: number;
  matchStatus: 'live' | 'finished' | 'upcoming';
  totalEntries: number;
  athleteScores: { [athleteMint: string]: number };
}

function formatCountdown(startTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, startTime - now);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function LiveBadge({ status }: { status: 'live' | 'finished' | 'upcoming' }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-[700] text-positive bg-positive/10 px-2 py-0.5 border border-positive/20">
        <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
        LIVE
      </span>
    );
  }
  if (status === 'finished') {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-[700] text-blue-400 bg-blue-500/10 px-2 py-0.5 border border-blue-500/20">
        SETTLED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-[700] text-amber-400 bg-amber-500/10 px-2 py-0.5 border border-amber-500/20">
      <Clock className="w-3 h-3" />
      UPCOMING
    </span>
  );
}

function EntryCard({
  entry,
  scoreData,
  loading,
}: {
  entry: EnrichedEntry;
  scoreData?: ScoreData;
  loading: boolean;
}) {
  const score = scoreData?.score ?? 0;
  const position = scoreData?.position ?? 0;
  const prizeEstimate = scoreData?.prizeEstimate ?? 0;
  const matchStatus = scoreData?.matchStatus ?? 'upcoming';
  const totalEntries = scoreData?.totalEntries ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative group bg-[#1c1f2a] border border-[#454932] hover:border-primary/30 transition-all"
    >
      <Link href={`/contest/${entry.contestNumber}`} className="block p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#181b25] border border-[#454932] flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading text-[16px] font-[600] text-white group-hover:text-primary transition-colors">
                {entry.contestName}
              </h3>
              <p className="font-mono text-[11px] text-[#c6c9ab]">
                {entry.startTimeFormatted}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LiveBadge status={matchStatus} />
            <ChevronRight className="w-4 h-4 text-[#c6c9ab] group-hover:text-primary transition-colors" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.02em] text-[#c6c9ab] uppercase mb-1">Score</p>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="font-heading text-[20px] font-[700] text-white">
                {loading ? '-' : score}
              </span>
            </div>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.02em] text-[#c6c9ab] uppercase mb-1">Position</p>
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />
              <span className="font-heading text-[20px] font-[700] text-white">
                {loading ? '-' : position > 0 ? `#${position}` : '-'}
                {totalEntries > 0 && ` / ${totalEntries}`}
              </span>
            </div>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.02em] text-[#c6c9ab] uppercase mb-1">Est. Prize</p>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="font-heading text-[20px] font-[700] text-positive">
                {loading ? '-' : prizeEstimate > 0 ? `$${(prizeEstimate / 1_000_000).toFixed(2)}` : '-'}
              </span>
            </div>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.02em] text-[#c6c9ab] uppercase mb-1">Prize Pool</p>
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="font-heading text-[20px] font-[700] text-white">
                ${entry.prizePoolFormatted}
              </span>
            </div>
          </div>
        </div>

        {entry.status === 2 && (
          <div className="mt-4 pt-4 border-t border-[#454932]" onClick={(e) => e.stopPropagation()}>
            {entry.claimed ? (
              <div className="flex items-center justify-center py-2 bg-positive/10 border border-positive/30">
                <span className="font-mono text-[12px] font-[700] text-positive">✓ Claimed</span>
              </div>
            ) : prizeEstimate > 0 ? (
              <ClaimButton
                contestAddress={entry.contestAddress}
                entryAddress={entry.entryAddress}
                amount={prizeEstimate / 1_000_000}
                variant="compact"
              />
            ) : (
              <div className="text-center py-2 text-[#c6c9ab] font-mono text-[11px]">
                No prize to claim
              </div>
            )}
          </div>
        )}

        {entry.athletes.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#454932]">
            <p className="font-mono text-[10px] tracking-[0.02em] text-[#c6c9ab] uppercase mb-2">Your Lineup</p>
            <div className="flex flex-wrap gap-1">
              {entry.athletes.slice(0, 6).map((athlete, i) => {
                const athleteScore = scoreData?.athleteScores?.[athlete.mint] ?? 0;
                return (
                  <div
                    key={athlete.mint}
                    className="flex items-center gap-1.5 px-2 py-1 bg-[#181b25] border border-[#454932] text-[10px]"
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-[700] ${
                      athlete.role === 0 ? 'bg-amber-500/20 text-amber-400' :
                      athlete.role === 1 ? 'bg-blue-500/20 text-blue-400' :
                      athlete.role === 2 ? 'bg-green-500/20 text-green-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {athlete.name[0]}
                    </span>
                    <span className="font-mono text-[10px] text-white">{athlete.name}</span>
                    {athleteScore > 0 && (
                      <span className="font-mono text-[9px] font-[700] text-positive">+{athleteScore}</span>
                    )}
                  </div>
                );
              })}
              {entry.athletes.length > 6 && (
                <div className="px-2 py-1 bg-[#181b25] border border-[#454932] text-[10px] text-[#c6c9ab]">
                  +{entry.athletes.length - 6} more
                </div>
              )}
            </div>
          </div>
        )}
      </Link>
    </motion.div>
  );
}

function MyContestsPage() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { entries, loading, error, refetch } = useUserEntries();
  const { scores, loading: scoresLoading } = useGlobalScores(entries, publicKey?.toBase58());

  useRevolvingTitle([
    'My Contests | DEXI',
    'Your Active Contests | DEXI',
    'Track Your Entries | DEXI',
  ]);

  usePageMeta({
    title: 'My Contests | DEXI',
    description: 'Track your active fantasy contest entries, live scores, and prizes on DEXI.',
    ogTitle: 'My Contests — DEXI',
    ogDescription: 'Track your fantasy contest entries on DEXI.',
  });

  const [searchQuery, setSearchQuery] = useState('');

  const activeEntries = useMemo(() => 
    entries.filter(e => e.status === 0),
    [entries]
  );

  const liveEntries = useMemo(() => 
    entries.filter(e => e.status === 1),
    [entries]
  );

  const settledEntries = useMemo(() => 
    entries.filter(e => e.status === 2),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(e => 
      e.contestName.toLowerCase().includes(q) ||
      e.athletes.some(a => a.name.toLowerCase().includes(q))
    );
  }, [entries, searchQuery]);

  const totalPrizeEstimate = useMemo(() => {
    return Object.values(scores).reduce((sum, s) => sum + (s.prizeEstimate || 0), 0);
  }, [scores]);

  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0f131d]">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md text-center p-10 border border-[#454932] bg-[#1c1f2a]">
            <div className="w-16 h-16 bg-[#181b25] border border-[#454932] flex items-center justify-center mx-auto mb-5">
              <Trophy className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-heading text-[24px] font-[600] text-white mb-2">Connect Your Wallet</h2>
            <p className="font-sans text-[16px] leading-[24px] font-[400] text-[#c6c9ab] mb-6">
              Connect your Solana wallet to view your contest entries, track live scores, and see your prizes.
            </p>
            <Button size="lg" className="w-full h-12 font-mono text-[13px] font-[700] bg-primary text-primary-foreground hover:opacity-90 transition-opacity uppercase tracking-wider" onClick={() => setVisible(true)}>
              <Wallet className="mr-2 h-4 w-4" /> Connect Wallet
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0f131d]">
      <Navbar />

      <main className="flex-1">
        <div className="w-full max-w-[1440px] mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-heading text-[32px] font-[700] text-white mb-2">My Contests</h1>
              <p className="font-sans text-[16px] text-[#c6c9ab]">
                Track your entries, live scores, and prizes across all contests
              </p>
            </div>
            <Button
              variant="outline"
              className="border-[#454932] text-white hover:bg-[#181b25] font-mono text-[12px]"
              onClick={() => refetch()}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="mb-6 max-w-md">
            <ScoringRules compact />
          </div>

          {error && (
            <div className="mb-6 p-4 bg-negative/10 border border-negative/20 text-negative font-mono text-[12px]">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-6">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-16 border border-[#454932] bg-[#1c1f2a]">
              <div className="w-16 h-16 bg-[#181b25] border border-[#454932] flex items-center justify-center mx-auto mb-5">
                <Trophy className="w-8 h-8 text-[#c6c9ab]" />
              </div>
              <h2 className="font-heading text-[24px] font-[600] text-white mb-2">No Contest Entries</h2>
              <p className="font-sans text-[16px] leading-[24px] font-[400] text-[#c6c9ab] mb-6 max-w-sm mx-auto">
                You haven&apos;t entered any contests yet. Browse available contests and draft your lineup!
              </p>
              <Link href="/contests">
                <Button className="h-11 px-6 font-mono text-[13px] font-[700] bg-primary text-primary-foreground hover:opacity-90 transition-opacity uppercase tracking-wider">
                  Browse Contests
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {liveEntries.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-4 h-4 text-positive animate-pulse" />
                    <h2 className="font-heading text-[20px] font-[600] text-white">Live Now</h2>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-[700] text-positive bg-positive/10 px-2 py-0.5 border border-positive/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                      {liveEntries.length} active
                    </span>
                  </div>
                  <div className="space-y-3">
                    {liveEntries.map((entry) => (
                      <EntryCard
                        key={entry.entryAddress}
                        entry={entry}
                        scoreData={scores[entry.entryAddress]}
                        loading={scoresLoading}
                      />
                    ))}
                  </div>
                </div>
              )}

              {activeEntries.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    <h2 className="font-heading text-[20px] font-[600] text-white">Starting Soon</h2>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-[700] text-amber-400 bg-amber-500/10 px-2 py-0.5 border border-amber-500/20">
                      {activeEntries.length} upcoming
                    </span>
                  </div>
                  <div className="space-y-3">
                    {activeEntries.map((entry) => (
                      <EntryCard
                        key={entry.entryAddress}
                        entry={entry}
                        scoreData={undefined}
                        loading={false}
                      />
                    ))}
                  </div>
                </div>
              )}

              {settledEntries.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-4 h-4 text-blue-400" />
                    <h2 className="font-heading text-[20px] font-[600] text-white">Completed</h2>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-[700] text-blue-400 bg-blue-500/10 px-2 py-0.5 border border-blue-500/20">
                      {settledEntries.length} settled
                    </span>
                  </div>
                  <div className="space-y-3">
                    {settledEntries.map((entry) => (
                      <EntryCard
                        key={entry.entryAddress}
                        entry={entry}
                        scoreData={scores[entry.entryAddress]}
                        loading={scoresLoading}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default MyContestsPage;