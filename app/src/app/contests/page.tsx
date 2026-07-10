'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion } from 'framer-motion';
import { Trophy, Users, Clock, Lock, CheckCircle2, ChevronRight, Wallet, ArrowRight } from 'lucide-react';
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

const STATUS_ICONS: Record<number, typeof Trophy> = {
  0: Trophy,
  1: Lock,
  2: CheckCircle2,
};

const STATUS_COLORS: Record<number, string> = {
  0: 'bg-positive/15 text-positive border-positive/20',
  1: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  2: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
};

function ContestsPage() {
  const router = useRouter();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [contests, setContests] = useState<ContestSummary[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading contests...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6 md:py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-black">Contests</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {openContests.length} active contest{openContests.length !== 1 ? 's' : ''} — build your lineup and compete
            </p>
          </div>
          {!connected && (
            <Button className="h-10 text-sm font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setVisible(true)}>
              <Wallet className="w-4 h-4 mr-2" /> Connect
            </Button>
          )}
        </div>

        {/* Open Contests */}
        {openContests.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Open for Entry</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {openContests.map((contest, i) => {
                const StatusIcon = STATUS_ICONS[contest.status];
                return (
                  <motion.button
                    key={contest.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, ease: [0.23, 1, 0.32, 1] }}
                    onClick={() => router.push(`/contest/${contest.id}`)}
                    className="surface-raised p-5 text-left hover:border-positive/40 transition-all duration-200 group w-full"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold">Contest #{contest.id}</h3>
                      <Badge className={`${STATUS_COLORS[contest.status]} border px-2 py-0.5 text-[11px]`}>
                        <StatusIcon className="w-3 h-3 mr-1 inline" />
                        {CONTEST_STATUS_LABELS[contest.status]}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Prize Pool</p>
                        <p className="text-lg font-black tabular-nums text-positive">${formatUSDC(contest.prizePool)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Entries</p>
                        <p className="text-lg font-black tabular-nums">{contest.entryCount}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(contest.startTime)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Top {contest.winnerCount}
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                      <span className="text-xs font-semibold text-positive/80 group-hover:text-positive transition-colors">Build Lineup</span>
                      <ArrowRight className="w-4 h-4 text-positive/60 group-hover:text-positive transition-colors" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* No contests */}
        {contests.length === 0 && (
          <div className="surface-raised p-12 text-center">
            <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-lg font-bold mb-2">No Contests Yet</h2>
            <p className="text-sm text-muted-foreground mb-6">There are no active contests right now. Check back later or browse the markets.</p>
            <Button className="h-11 text-sm font-bold rounded-lg" onClick={() => router.push('/markets')}>
              Browse Markets
            </Button>
          </div>
        )}

        {/* Locked/Settled Contests */}
        {otherContests.length > 0 && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Past Contests</h2>
            <div className="space-y-2">
              {otherContests.map(contest => (
                <button
                  key={contest.id}
                  onClick={() => router.push(`/contest/${contest.id}`)}
                  className="w-full surface-elevated p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${STATUS_COLORS[contest.status]}`}>
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Contest #{contest.id}</p>
                      <p className="text-xs text-muted-foreground">{formatTimestamp(contest.startTime)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums">${formatUSDC(contest.prizePool)}</p>
                      <p className="text-[10px] text-muted-foreground">prize pool</p>
                    </div>
                    <Badge className={`${STATUS_COLORS[contest.status]} border px-2 py-0.5 text-[11px]`}>
                      {CONTEST_STATUS_LABELS[contest.status]}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default dynamic(() => Promise.resolve(ContestsPage), { ssr: false });
