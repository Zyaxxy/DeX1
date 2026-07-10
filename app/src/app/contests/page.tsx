'use client';

import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
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
import { rpc, PROGRAM_ID, CONTEST_STATUS_LABELS, formatUSDC, formatTimestamp } from '@/solana/client';
import { decodeContest, CONTEST_DISCRIMINATOR, ContestStatus } from '@dexi/sdk';
import { getBase58Decoder } from '@solana/kit';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

interface ContestSummary {
  id: number;
  startTime: number;
  status: number;
  entryCount: number;
  prizePool: bigint;
  winnerCount: number;
  address: string;
}

const LEAGUE_STYLES: Record<string, { label: string; icon: string; gradient: string }> = {
  NBA: { label: 'NBA', icon: '🏀', gradient: 'from-amber-500/20 to-orange-600/10' },
  NFL: { label: 'NFL', icon: '🏈', gradient: 'from-green-500/20 to-emerald-600/10' },
  MLB: { label: 'MLB', icon: '⚾', gradient: 'from-red-500/20 to-rose-600/10' },
};

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
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchContests() {
      try {
        const response = await rpc.getProgramAccounts(PROGRAM_ID.toBase58() as any, {
          encoding: 'base64',
          filters: [{ memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(CONTEST_DISCRIMINATOR) as any } }]
        }).send();

        setContests(response.map(account => {
          const decoded = decodeContest({
            address: account.pubkey,
            data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
            exists: true,
          } as any).data;

          let status = 0;
          if (decoded.status === ContestStatus.Locked) status = 1;
          else if (decoded.status === ContestStatus.Settled) status = 2;

          return {
            id: Number(decoded.id),
            startTime: Number(decoded.startTime),
            status,
            entryCount: Number(decoded.entryCount),
            prizePool: decoded.prizePool,
            winnerCount: decoded.winnerCount,
            address: account.pubkey,
          };
        }).sort((a, b) => b.id - a.id));
      } catch (err) {
        console.error("Failed to fetch contests:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchContests();
  }, []);

  const openContests = useMemo(() => contests.filter(c => c.status === 0), [contests]);
  const otherContests = useMemo(() => contests.filter(c => c.status !== 0), [contests]);

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
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
          <div className="w-full max-w-[1440px] mx-auto px-6 py-10 md:py-14">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-10 h-10 bg-[#1c1f2a] border border-[#454932] flex items-center justify-center">
                    <Swords className="w-5 h-5 text-primary" />
                  </div>
                  <h1 className="font-heading text-[clamp(1.8rem,3.5vw,2.5rem)] font-[700] text-white leading-[1.1] tracking-[-0.02em]">
                    The Arena
                  </h1>
                </div>
                <p className="font-sans text-[16px] leading-[24px] font-[400] text-[#c6c9ab] max-w-lg">
                  Build lineups, enter contests, and compete for USDC prizes settled instantly on Solana.
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
                {featuredContests.map((contest, i) => {
                  const league = i % 2 === 0 ? 'NBA' : 'NFL';
                  const style = LEAGUE_STYLES[league];
                  const entryType = i % 2 === 0 ? 'Multi-Entry (Max 5)' : 'Single Entry';
                  const maxEntries = i % 2 === 0 ? 2500 : 1000;
                  const entryFee = i % 2 === 0 ? 25 : 100;
                  return (
                    <motion.button
                      key={contest.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1, ease: [0.23, 1, 0.32, 1] }}
                      onClick={() => router.push(`/contest/${contest.id}`)}
                      className="relative group text-left w-full overflow-hidden border border-[#454932] bg-[#1c1f2a] hover:border-primary/30 transition-all duration-300"
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${style.gradient} opacity-60 group-hover:opacity-80 transition-opacity pointer-events-none`} />

                      <div className="relative p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{style.icon}</span>
                            <div>
                              <p className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab]">{style.label}</p>
                              <p className="font-heading text-[20px] font-[600] text-white leading-[1.2]">Contest #{contest.id}</p>
                            </div>
                          </div>
                          <ContestStatusBadge status={contest.status} />
                        </div>

                        <div className="flex items-center gap-2 mb-4">
                          <span className="font-mono text-[12px] font-[500] text-[#c6c9ab] bg-[#181b25] border border-[#454932] px-2 py-0.5">
                            Entry ${entryFee}
                          </span>
                          <span className="font-heading text-[16px] font-[700] text-primary">${formatUSDC(contest.prizePool)} GTD</span>
                        </div>

                        <div className="flex items-center gap-5 font-mono text-[13px] text-[#c6c9ab] mb-4">
                          <span className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            {contest.entryCount} / {maxEntries}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Swords className="w-3.5 h-3.5" />
                            {entryType}
                          </span>
                        </div>

                        <div className="w-full h-1 bg-[#262a34] mb-4">
                          <div
                            className="h-full bg-primary/60 transition-all duration-1000"
                            style={{ width: `${Math.min(100, (contest.entryCount / maxEntries) * 100)}%` }}
                          />
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
                  );
                })}
              </div>
            </div>
          )}

          {/* All Contests Section */}
          <div>
            {/* Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2 flex-wrap">
                {['all', 'NBA', 'NFL', 'MLB'].map(league => (
                  <button
                    key={league}
                    onClick={() => setLeagueFilter(league)}
                    className={`px-3.5 py-1.5 font-mono text-[12px] font-[700] tracking-[0.02em] transition-all uppercase ${
                      leagueFilter === league
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-[#181b25] text-[#c6c9ab] hover:bg-[#1c1f2a] border border-[#454932]'
                    }`}
                  >
                    {league === 'all' ? 'All' : league}
                  </button>
                ))}
                <div className="w-px h-5 bg-[#454932] mx-1" />
                {['all', 'Guaranteed', 'H2H', 'Multiplier'].map(type => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type === 'all' ? 'all' : type.toLowerCase())}
                    className={`px-3 py-1 font-mono text-[11px] font-[700] tracking-[0.02em] transition-all uppercase ${
                      typeFilter === (type === 'all' ? 'all' : type.toLowerCase())
                        ? 'bg-[#31353f] text-white border border-[#454932]'
                        : 'text-[#c6c9ab] hover:text-white'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#c6c9ab]" />
                  <input
                    type="text"
                    placeholder="Search contests..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-48 h-9 pl-9 pr-3 font-mono text-[12px] bg-[#0a0e18] border border-[#454932] text-[#dfe2f0] placeholder:text-[#c6c9ab] focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
                <button className="inline-flex items-center gap-1.5 px-3 h-9 font-mono text-[11px] font-[700] tracking-[0.02em] text-[#c6c9ab] bg-[#181b25] border border-[#454932] hover:bg-[#1c1f2a] transition-colors uppercase">
                  <Filter className="w-3.5 h-3.5" />
                  Sort by Time
                  <ChevronDown className="w-3 h-3" />
                </button>
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
                  {openContests.map((contest, i) => {
                    const league = i % 2 === 0 ? 'NBA' : 'NFL';
                    const style = LEAGUE_STYLES[league];
                    const entryType = i % 2 === 0 ? 'Multi (M20)' : 'Single Entry';
                    return (
                      <button
                        key={contest.id}
                        onClick={() => router.push(`/contest/${contest.id}`)}
                        className="w-full grid grid-cols-[1fr] md:grid-cols-[1fr_120px_100px_120px_100px_140px] gap-4 px-5 py-4 items-center hover:bg-[#1c1f2a] transition-colors text-left group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-lg shrink-0">{style.icon}</span>
                          <div className="min-w-0">
                            <p className="font-heading text-[16px] font-[600] text-white truncate">Contest #{contest.id}</p>
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.02em] font-[500] text-[#c6c9ab] bg-[#181b25] px-1.5 py-0.5 mt-0.5">
                              <Swords className="w-3 h-3" />
                              {entryType}
                            </span>
                          </div>
                        </div>
                        <div className="text-right hidden md:block">
                          <p className="font-mono text-[14px] font-[700] text-primary">${formatUSDC(contest.prizePool)}</p>
                        </div>
                        <div className="text-right hidden md:block">
                          <p className="font-mono text-[14px] font-[700] text-[#dfe2f0]">${i % 2 === 0 ? '10' : '50'}</p>
                        </div>
                        <div className="text-right hidden md:block">
                          <p className="font-mono text-[12px] font-[700] text-[#dfe2f0]">{contest.entryCount} / {i % 2 === 0 ? 1150 : 100}</p>
                          <div className="w-full h-0.5 bg-[#262a34] mt-1 overflow-hidden">
                            <div className="h-full bg-white/20" style={{ width: `${Math.min(100, (contest.entryCount / (i % 2 === 0 ? 1150 : 100)) * 100)}%` }} />
                          </div>
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
                            <span className="font-[700]">${formatUSDC(contest.prizePool)}</span>
                            <span>{contest.entryCount} entries</span>
                          </div>
                          <span className="font-mono text-[13px] font-[700] text-[#dfe2f0]">{formatCountdown(contest.startTime)}</span>
                        </div>
                      </button>
                    );
                  })}
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
                          <p className="font-heading text-[16px] font-[600] text-white">Contest #{contest.id}</p>
                          <p className="font-mono text-[12px] text-[#c6c9ab]">{formatTimestamp(contest.startTime)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-[14px] font-[700] text-[#c6c9ab]">${formatUSDC(contest.prizePool)}</span>
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
