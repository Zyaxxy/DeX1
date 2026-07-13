'use client';

import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import { usePageMeta } from '@/hooks/usePageMeta';
import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion } from 'framer-motion';
import {
  Trophy, Users, Clock, Lock, CheckCircle2, ChevronRight,
  Wallet, Search, Timer, TrendingUp, Swords, ArrowRight,
  Filter, ChevronDown, Eye, Sparkles
} from 'lucide-react';
import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getRpc, PROGRAM_ID, CONTEST_STATUS_LABELS, formatUSDC, formatEstimatedPrizePool, formatTimestamp } from '@/solana/client';
import { decodeContest, ContestStatus } from '@dexi/sdk';

import { useWalletModal } from '@solana/wallet-adapter-react-ui';

interface ContestSummary {
  id: number;
  startTime: number;
  status: number;
  entryCount: number;
  prizePool: bigint;
  winnerCount: number;
  address: string;
  name: string;
  fixtureId: string;
}

function formatCountdown(startTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, startTime - now);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function ContestStatusBadge({ status }: { status: number }) {
  if (status === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-[700] text-positive/90 bg-positive/10 px-2 py-0.5 border border-positive/20">
        <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
        LIVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-[700] text-[#c6c9ab] bg-white/5 px-2 py-0.5 border border-white/10">
      {CONTEST_STATUS_LABELS[status]}
    </span>
  );
}

function ContestsPage() {
  const router = useRouter();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [contests, setContests] = useState<ContestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useRevolvingTitle([
    'Contests | DEXI',
    'Fantasy Leagues | DEXI',
    'Compete to Win | DEXI',
  ]);

  usePageMeta({
    title: 'World Cup Contests | DEXI',
    description: 'Enter FIFA World Cup 2026 fantasy contests, draft your lineup, and compete for USDC prizes.',
    ogTitle: 'World Cup Contests — DEXI',
    ogDescription: 'FIFA World Cup 2026 fantasy contests on Solana.',
  });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchContests() {
      try {
        const response = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
          encoding: 'base64',
          commitment: 'confirmed',
        }).send();

        const CONTEST_DISCRIMINATOR_BYTES = [216, 26, 88, 18, 251, 80, 201, 96];
        
        const validContests = [];
        for (const account of response) {
          try {
            // Get the raw base64 data
            const rawData = account.account.data[0];
            // Decode base64 to binary
            const binaryData = Uint8Array.from(atob(rawData), c => c.charCodeAt(0));
            // Check first 8 bytes match discriminator
            const matches = CONTEST_DISCRIMINATOR_BYTES.every((b, i) => binaryData[i] === b);
            if (!matches) continue;
            
            const decoded = decodeContest({
              address: account.pubkey,
              data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
              exists: true,
            } as any).data;

            const statusNum = typeof decoded.status === 'number' ? decoded.status : 0;

            validContests.push({
              id: Number(decoded.id),
              startTime: Number(decoded.startTime),
              status: statusNum,
              entryCount: Number(decoded.entryCount),
              prizePool: decoded.prizePool,
              winnerCount: decoded.winnerCount,
              address: account.pubkey,
              name: decoded.name || `Match #${decoded.id}`,
              fixtureId: decoded.fixtureId || '',
            });
          } catch (e) {
            console.warn("Skipping bad contest account:", account.pubkey, e);
          }
        }
        setContests(validContests.sort((a, b) => b.id - a.id));
      } catch (err) {
        console.error("Failed to fetch contests:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchContests();
  }, []);

  const filteredContests = useMemo(() =>
    contests.filter(c => String(c.name).toLowerCase().includes(searchQuery.toLowerCase())),
    [contests, searchQuery]
  );
  const openContests = useMemo(() => filteredContests.filter(c => c.status === 0), [filteredContests]);
  const otherContests = useMemo(() => filteredContests.filter(c => c.status !== 0), [filteredContests]);
  const featuredContests = useMemo(() => openContests.slice(0, 2), [openContests]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="font-sans text-[14px] text-[#c6c9ab]">Loading arena...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0f131d]">
      <Navbar />

      <main className="flex-1">
        {/* Hero Header */}
        <div className="relative overflow-hidden border-b border-[#454932]">
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a3a2a]/30 via-transparent to-transparent pointer-events-none" />
          <div className="w-full max-w-[1440px] mx-auto px-6 py-10 md:py-14">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-10 h-10 bg-[#1c1f2a] border border-[#454932] flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-primary" />
                  </div>
                  <h1 className="font-heading text-[clamp(1.8rem,3.5vw,2.5rem)] font-[700] text-white leading-[1.1] tracking-[-0.02em]">
                    World Cup Contests
                  </h1>
                </div>
                <p className="font-sans text-[16px] leading-[24px] font-[400] text-[#c6c9ab] max-w-lg">
                  FIFA World Cup 2026 — Draft your lineup from real match players and compete for USDC prizes.
                </p>
              </div>
              {!connected && (
                <Button
                  className="hidden md:inline-flex h-10 px-5 font-mono text-[13px] font-[700] bg-primary text-primary-foreground hover:opacity-90 transition-opacity tracking-wider uppercase"
                  onClick={() => setVisible(true)}
                >
                  <Wallet className="w-4 h-4 mr-2" /> Connect to Play
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="w-full max-w-[1440px] mx-auto px-6 py-8 md:py-10">
          {/* Featured Contests */}
          {featuredContests.length > 0 && (
            <div className="mb-12">
              <div className="flex items-center gap-2 mb-6">
                <Sparkles className="w-4 h-4 text-primary" />
                <h2 className="font-heading text-[24px] font-[600] text-white leading-[28px]">Featured Contests</h2>
                <div className="ml-3">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-[700] text-positive bg-positive/10 px-2.5 py-0.5 border border-positive/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                    Live Now
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {featuredContests.map((contest, i) => (
                  <motion.button
                    key={contest.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1, ease: [0.23, 1, 0.32, 1] }}
                    onClick={() => router.push(`/contest/${contest.id}`)}
                    className="relative group text-left w-full overflow-hidden border border-[#454932] bg-[#1c1f2a] hover:border-primary/30 transition-all duration-300"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-primary/5 opacity-60 group-hover:opacity-80 transition-opacity pointer-events-none" />

                    <div className="relative p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">⚽</span>
                          <div>
                            <p className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab]">FIFA WC 2026</p>
                            <p className="font-heading text-[20px] font-[600] text-white leading-[1.2]">{contest.name}</p>
                          </div>
                        </div>
                        <ContestStatusBadge status={contest.status} />
                      </div>

                      <div className="flex items-center gap-2 mb-4">
                        <span className="font-heading text-[16px] font-[700] text-primary">{contest.prizePool > BigInt(0) ? `$${formatUSDC(contest.prizePool)}` : formatEstimatedPrizePool(contest.entryCount)} Prize Pool</span>
                      </div>

                      <div className="flex items-center gap-5 font-mono text-[13px] text-[#c6c9ab] mb-4">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          {contest.entryCount} entries
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5" />
                          Top {contest.winnerCount} paid
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[14px] font-[700] text-[#dfe2f0]">
                          <Timer className="w-3.5 h-3.5 text-primary" />
                          {formatCountdown(contest.startTime)}
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-mono text-[13px] font-[700] text-primary group-hover:gap-2 transition-all uppercase tracking-wider">
                          Draft Lineup <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* All Contests Section */}
          <div>
            {/* Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-[#181b25] border border-[#454932] px-3 py-1">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span className="font-mono text-[12px] font-[700] text-white tracking-wider uppercase">FIFA World Cup 2026</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#c6c9ab]" />
                  <input
                    type="text"
                    placeholder="Search matches..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-48 h-9 pl-9 pr-3 font-mono text-[12px] bg-[#0a0e18] border border-[#454932] text-[#dfe2f0] placeholder:text-[#c6c9ab] focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Contest Table */}
            {openContests.length > 0 && (
              <div className="border border-[#454932] overflow-hidden">
                {/* Table Header */}
                <div className="hidden md:grid grid-cols-[1fr_120px_100px_120px_100px_140px] gap-4 px-5 py-3 bg-[#181b25] border-b border-[#454932]">
                  {['Contest', 'Prize Pool', 'Entry', 'Entries', 'Starts In', ''].map((header, i) => (
                    <span key={header} className={`font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab] ${i > 0 ? 'text-right' : ''}`}>
                      {header}
                    </span>
                  ))}
                </div>

                <div className="divide-y divide-[#454932]">
                  {openContests.map((contest) => (
                    <button
                      key={contest.id}
                      onClick={() => router.push(`/contest/${contest.id}`)}
                      className="w-full grid grid-cols-[1fr] md:grid-cols-[1fr_120px_100px_120px_140px] gap-4 px-5 py-4 items-center hover:bg-[#1c1f2a] transition-colors text-left group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg shrink-0">⚽</span>
                        <div className="min-w-0">
                          <p className="font-heading text-[16px] font-[600] text-white truncate">{contest.name}</p>
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.02em] font-[500] text-[#c6c9ab] bg-[#181b25] px-1.5 py-0.5 mt-0.5">
                            <Trophy className="w-3 h-3" />
                            WC 2026
                          </span>
                        </div>
                      </div>
                      <div className="text-right hidden md:block">
                        <p className="font-mono text-[14px] font-[700] text-primary">{contest.prizePool > BigInt(0) ? `$${formatUSDC(contest.prizePool)}` : formatEstimatedPrizePool(contest.entryCount)}</p>
                      </div>
                      <div className="text-right hidden md:block">
                        <p className="font-mono text-[12px] font-[700] text-[#dfe2f0]">{contest.entryCount} entries</p>
                      </div>
                      <div className="text-right hidden md:block">
                        <p className="font-mono text-[14px] font-[700] text-[#dfe2f0]">{formatCountdown(contest.startTime)}</p>
                      </div>
                      <div className="text-right hidden md:block">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[12px] font-[700] text-primary group-hover:gap-2 transition-all uppercase tracking-wider">
                          Draft Lineup <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>

                      {/* Mobile row */}
                      <div className="flex items-center justify-between md:hidden pt-2 border-t border-[#454932] mt-2">
                        <div className="flex items-center gap-3 font-mono text-[12px] text-[#c6c9ab]">
                          <span className="font-[700]">{contest.prizePool > BigInt(0) ? `$${formatUSDC(contest.prizePool)}` : formatEstimatedPrizePool(contest.entryCount)}</span>
                          <span>{contest.entryCount} entries</span>
                        </div>
                        <span className="font-mono text-[13px] font-[700] text-[#dfe2f0]">{formatCountdown(contest.startTime)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {contests.length === 0 && (
              <div className="border border-[#454932] p-16 text-center bg-[#1c1f2a]">
                <div className="w-16 h-16 bg-[#181b25] border border-[#454932] flex items-center justify-center mx-auto mb-5">
                  <Swords className="w-8 h-8 text-[#c6c9ab]" />
                </div>
                <h2 className="font-heading text-[24px] font-[600] text-white mb-2">No Contests Open</h2>
                <p className="font-sans text-[16px] leading-[24px] font-[400] text-[#c6c9ab] mb-6 max-w-sm mx-auto">
                  There are no active contests right now. Check back later for the next round.
                </p>
                <Button className="h-11 px-6 font-mono text-[13px] font-[700] bg-primary text-primary-foreground hover:opacity-90 transition-opacity uppercase tracking-wider" onClick={() => router.push('/markets')}>
                  Browse Markets
                </Button>
              </div>
            )}

            {/* Past Contests */}
            {otherContests.length > 0 && (
              <div className="mt-10">
                <h2 className="font-heading text-[24px] font-[600] text-white mb-4">Past Contests</h2>
                <div className="space-y-1.5">
                  {otherContests.map(contest => (
                    <button
                      key={contest.id}
                      onClick={() => router.push(`/contest/${contest.id}`)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1c1f2a] transition-colors text-left group border border-transparent hover:border-[#454932]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#181b25] border border-[#454932] flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-[#c6c9ab]" />
                        </div>
                      <div>
                        <p className="font-heading text-[16px] font-[600] text-white">{contest.name}</p>
                        <p className="font-mono text-[12px] text-[#c6c9ab]">{formatTimestamp(contest.startTime)}</p>
                      </div>
                      </div>
                      <div className="flex items-center gap-4">
                          <span className="font-mono text-[14px] font-[700] text-[#c6c9ab]">{contest.prizePool > BigInt(0) ? `$${formatUSDC(contest.prizePool)}` : formatEstimatedPrizePool(contest.entryCount)}</span>
                        <span className="font-mono text-[11px] font-[700] text-[#c6c9ab] bg-[#181b25] border border-[#454932] px-2 py-0.5">
                          {CONTEST_STATUS_LABELS[contest.status]}
                        </span>
                        <ChevronRight className="w-4 h-4 text-[#c6c9ab]" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default dynamic(() => Promise.resolve(ContestsPage), { ssr: false });
