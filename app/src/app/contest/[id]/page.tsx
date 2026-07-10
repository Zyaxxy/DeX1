'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { findConfigPda, findEntryPda, findContestPda, getEnterContestInstructionDataEncoder } from '@dexi/sdk';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, Search, X, Plus, ChevronRight, Wallet, Check, Shield, Swords, Eye, Goal, Loader2, ExternalLink, ArrowLeft, Clock, DollarSign, Award } from 'lucide-react';
import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

import { connection, rpc, PROGRAM_ID, ROLE_LABELS, CONTEST_STATUS_LABELS, ROLE_COLORS, formatUSDC, formatTimestamp, ROLE_REQUIREMENTS, LINEUP_SIZE } from '@/solana/client';
import { toast } from 'sonner';
import { decodeAthletePool, ATHLETE_POOL_DISCRIMINATOR, decodeContest, ContestStatus } from '@dexi/sdk';
import { getBase58Decoder } from '@solana/kit';

interface Athlete {
  mint: string;
  name: string;
  role: number;
  poolAddress: string;
}

interface ContestData {
  id: number;
  startTime: number;
  status: number;
  entryCount: number;
  prizePool: bigint;
  winnerCount: number;
  prizeSplit: number[];
  settled: boolean;
  addressLookupTable: string;
}

const ROLE_ICONS: Record<string, typeof Shield> = {
  GK: Goal,
  DEF: Shield,
  MID: Swords,
  FWD: Eye,
};

const ROLE_LABEL_FULL: Record<string, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
};

const ROLE_ORDER = ['FWD', 'MID', 'DEF', 'GK'] as const;

function ContestDetailContent() {
  const params = useParams();
  const router = useRouter();
  const contestId = params?.id ? parseInt(params.id as string) : 1;
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [contest, setContest] = useState<ContestData | null>(null);
  const [selectedAthletes, setSelectedAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [availableAthletes, setAvailableAthletes] = useState<Athlete[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showConfirm, setShowConfirm] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAthletes() {
      try {
        const response = await rpc.getProgramAccounts(PROGRAM_ID.toBase58() as any, {
          encoding: 'base64',
          filters: [{ memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(ATHLETE_POOL_DISCRIMINATOR) as any } }]
        }).send();

        setAvailableAthletes(response.map((account) => {
          const decoded = decodeAthletePool({
            address: account.pubkey,
            data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
            exists: true,
          } as any).data;

          return { mint: decoded.mint.toString(), name: decoded.name, role: decoded.role, poolAddress: account.pubkey };
        }));
        setFetchError(null);
      } catch (err) {
        console.error("Failed to fetch athletes:", err);
        setFetchError('Failed to load athlete pools. Check your RPC connection.');
      }
    }
    fetchAthletes();
  }, []);

  useEffect(() => {
    async function fetchContest() {
      try {
        const [contestPda] = await findContestPda({ id: contestId });
        const response = await rpc.getAccountInfo(contestPda, { encoding: 'base64', commitment: 'confirmed' }).send();

        if (!response || !response.value) {
          setFetchError('Contest not found. It may not exist yet.');
          return;
        }

        const decoded = decodeContest({
          address: contestPda,
          data: new Uint8Array(Buffer.from(response.value.data[0], response.value.data[1] as any)),
          exists: true,
        } as any).data;

        let status = 0;
        if (decoded.status === ContestStatus.Locked) status = 1;
        else if (decoded.status === ContestStatus.Settled) status = 2;

        setContest({
          id: Number(decoded.id),
          startTime: Number(decoded.startTime),
          status,
          entryCount: Number(decoded.entryCount),
          prizePool: decoded.prizePool,
          winnerCount: decoded.winnerCount,
          prizeSplit: decoded.prizeSplit.slice(0, decoded.winnerCount),
          settled: decoded.status === ContestStatus.Settled,
          addressLookupTable: decoded.addressLookupTable.toString(),
        });
        setFetchError(null);
      } catch (err) {
        console.error("Failed to fetch contest:", err);
        setFetchError('Failed to load contest data.');
      }
    }
    fetchContest();
  }, [contestId]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    selectedAthletes.forEach(a => {
      const roleLabel = ROLE_LABELS[a.role] as string;
      if (roleLabel && counts[roleLabel] !== undefined) {
        counts[roleLabel]++;
      }
    });
    return counts;
  }, [selectedAthletes]);

  const isValidLineup = useMemo(() => {
    return (
      roleCounts.GK >= ROLE_REQUIREMENTS.GK &&
      roleCounts.DEF >= ROLE_REQUIREMENTS.DEF &&
      roleCounts.MID >= ROLE_REQUIREMENTS.MID &&
      roleCounts.FWD >= ROLE_REQUIREMENTS.FWD &&
      selectedAthletes.length === LINEUP_SIZE
    );
  }, [roleCounts, selectedAthletes]);

  const roleErrors = useMemo(() => {
    const errors: string[] = [];
    if (roleCounts.GK < ROLE_REQUIREMENTS.GK) errors.push(`${ROLE_REQUIREMENTS.GK - roleCounts.GK} more GK`);
    if (roleCounts.DEF < ROLE_REQUIREMENTS.DEF) errors.push(`${ROLE_REQUIREMENTS.DEF - roleCounts.DEF} more DEF`);
    if (roleCounts.MID < ROLE_REQUIREMENTS.MID) errors.push(`${ROLE_REQUIREMENTS.MID - roleCounts.MID} more MID`);
    if (roleCounts.FWD < ROLE_REQUIREMENTS.FWD) errors.push(`${ROLE_REQUIREMENTS.FWD - roleCounts.FWD} more FWD`);
    if (selectedAthletes.length < LINEUP_SIZE) errors.push(`${LINEUP_SIZE - selectedAthletes.length} more players`);
    return errors;
  }, [roleCounts, selectedAthletes]);

  const handleSelectAthlete = useCallback((athlete: Athlete) => {
    if (selectedAthletes.length >= LINEUP_SIZE) {
      toast.error('Lineup is full');
      return;
    }
    if (selectedAthletes.some(a => a.mint === athlete.mint)) {
      toast.error('Already in lineup');
      return;
    }
    setSelectedAthletes(prev => [...prev, athlete]);
  }, [selectedAthletes]);

  const removeAthlete = useCallback((mint: string) => {
    setSelectedAthletes(prev => prev.filter(a => a.mint !== mint));
  }, []);

  const clearLineup = useCallback(() => {
    setSelectedAthletes([]);
  }, []);

  const handleEnterContest = async () => {
    if (!connected || !publicKey || !signTransaction) {
      toast.error('Please connect your wallet');
      return;
    }

    setSubmitting(true);
    setTxSignature(null);
    try {
      const userKey = new PublicKey(publicKey.toString());
      const [contestPda] = await findContestPda({ id: contestId });
      const contestKey = new PublicKey(contestPda);
      const [configPda] = await findConfigPda();
      const [entryPda] = await findEntryPda({ contest: contestPda as any, user: publicKey.toBase58() as any });

      // Deduplicate mints like the Rust program does, so remaining accounts match
      const uniqueMints = Array.from(new Set(selectedAthletes.map(a => a.mint)));
      const remainingAccounts: { address: string; isWritable: boolean; isSigner: boolean }[] = [];

      for (const mintStr of uniqueMints) {
        const mintKey = new PublicKey(mintStr);
        const poolKey = new PublicKey(selectedAthletes.find(a => a.mint === mintStr)!.poolAddress);
        const userAta = getAssociatedTokenAddressSync(mintKey, userKey, true);
        const vault = getAssociatedTokenAddressSync(mintKey, contestKey, true);

        remainingAccounts.push(
          { address: mintStr, isWritable: false, isSigner: false },
          { address: userAta.toBase58(), isWritable: true, isSigner: false },
          { address: vault.toBase58(), isWritable: true, isSigner: false },
          { address: poolKey.toBase58(), isWritable: false, isSigner: false }
        );
      }

      toast.info('Please approve the transaction in your wallet.');

      const PROGRAM_ID_KEY = new PublicKey('5RjcrhEhspU8YLLjWN7SJ3TRJkoLZW3LnkrCWCNgTDb3');
      const SYSTEM_PROGRAM_KEY = SystemProgram.programId;
      const TOKEN_PROGRAM_KEY = TOKEN_PROGRAM_ID;

      const lineupAddresses = selectedAthletes.map(a => a.mint);

      const dataEncoder = getEnterContestInstructionDataEncoder();
      const instructionData = dataEncoder.encode({ athletes: lineupAddresses as any });

      const keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [
        { pubkey: new PublicKey(configPda), isSigner: false, isWritable: false },
        { pubkey: contestKey, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(entryPda), isSigner: false, isWritable: true },
        { pubkey: userKey, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_KEY, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_KEY, isSigner: false, isWritable: false },
        ...remainingAccounts.map(a => ({
          pubkey: new PublicKey(a.address),
          isSigner: a.isSigner,
          isWritable: a.isWritable,
        })),
      ];

      const instruction = new TransactionInstruction({
        programId: PROGRAM_ID_KEY,
        keys,
        data: Buffer.from(instructionData),
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

      const messageV0 = new TransactionMessage({
        payerKey: userKey,
        recentBlockhash: blockhash,
        instructions: [instruction],
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      const signedTransaction = await signTransaction(transaction);
      const signature = await connection.sendTransaction(signedTransaction);

      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      if (confirmation.value?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      setTxSignature(signature);
      toast.success('Successfully entered contest!', {
        action: {
          label: 'View',
          onClick: () => window.open(`https://solscan.io/tx/${signature}${process.env.NEXT_PUBLIC_CLUSTER === 'devnet' ? '?cluster=devnet' : ''}`, '_blank'),
        },
      });
      setShowConfirm(false);
      setSelectedAthletes([]);
    } catch (error: any) {
      console.error(error);
      const message = error?.message || 'Transaction failed';
      toast.error(message.includes('overruns') ? 'Wallet encoding error. Try refreshing or using a different wallet.' : message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAthletes = useMemo(() => {
    return availableAthletes.filter(athlete => {
      const matchesSearch = athlete.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'all' || ROLE_LABELS[athlete.role] === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [availableAthletes, searchQuery, roleFilter]);

  const athletesByRole = useMemo(() => {
    const map: Record<string, Athlete[]> = {};
    for (const role of ROLE_ORDER) {
      map[role] = selectedAthletes.filter(a => ROLE_LABELS[a.role] === role);
    }
    return map;
  }, [selectedAthletes]);

  const maxSlotsByRole: Record<string, number> = {
    GK: ROLE_REQUIREMENTS.GK,
    DEF: ROLE_REQUIREMENTS.DEF,
    MID: ROLE_REQUIREMENTS.MID,
    FWD: ROLE_REQUIREMENTS.FWD,
  };

  if (fetchError && !contest) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="surface-raised w-full max-w-md text-center p-10">
            <div className="w-20 h-20 rounded-2xl surface-elevated flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-negative" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Contest Not Found</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed text-sm">{fetchError}</p>
            <Button size="lg" className="w-full h-12 text-base font-bold rounded-lg" onClick={() => router.push('/markets')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Markets
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading contest...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="surface-raised w-full max-w-md text-center p-10">
            <div className="w-20 h-20 rounded-2xl surface-elevated flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Connect to Enter</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed text-sm">
              Join fantasy contests, draft your dream lineup, and compete for USDC prizes settled instantly on Solana.
            </p>
            <Button size="lg" className="w-full h-12 text-base font-bold rounded-lg" onClick={() => setVisible(true)}>
              <Wallet className="mr-2 h-4 w-4" /> Connect Wallet
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (contest.status !== 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <button onClick={() => router.push('/markets')} className="hover:text-foreground transition-colors">Markets</button>
            <ChevronRight className="w-4 h-4" />
            <button onClick={() => router.push('/portfolio')} className="hover:text-foreground transition-colors">Portfolio</button>
            <ChevronRight className="w-4 h-4" />
            <span>Contest #{contest.id}</span>
          </div>

          <div className="surface-raised overflow-hidden">
            <div className="surface-matte border-b border-white/[0.06] p-6 md:p-8">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-3xl md:text-4xl font-black mb-4">Contest #{contest.id}</h1>
                  <Badge className={`${contest.status === 1 ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'} border-none text-sm px-3 py-1`}>
                    {CONTEST_STATUS_LABELS[contest.status]}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 surface-elevated text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Total Entries</p>
                  <p className="text-3xl font-black tabular-nums">{contest.entryCount}</p>
                </div>
                <div className="p-5 surface-elevated text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Prize Pool</p>
                  <p className="text-3xl font-black tabular-nums text-positive">${formatUSDC(contest.prizePool)}</p>
                </div>
                <div className="p-5 surface-elevated text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Winners</p>
                  <p className="text-3xl font-black tabular-nums">Top {contest.winnerCount}</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-6 md:py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <button onClick={() => router.push('/markets')} className="hover:text-foreground transition-colors">Markets</button>
          <ChevronRight className="w-4 h-4" />
          <button onClick={() => router.push('/portfolio')} className="hover:text-foreground transition-colors">Portfolio</button>
          <ChevronRight className="w-4 h-4" />
          <span>Contest #{contest.id}</span>
        </div>

        {/* Contest Header */}
        <div className="surface-raised mb-6 overflow-hidden">
          <div className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-xl md:text-2xl font-black">Contest #{contest.id}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimestamp(contest.startTime)}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {contest.entryCount} entered
                  </p>
                </div>
              </div>
              <Badge className="bg-positive/15 text-positive border-positive/20 px-3 py-1 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                  Open
                </span>
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-4 md:gap-6">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Prize Pool
                </p>
                <p className="text-xl md:text-2xl font-black tabular-nums text-positive">${formatUSDC(contest.prizePool)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Entries
                </p>
                <p className="text-xl md:text-2xl font-black tabular-nums">{contest.entryCount}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5 flex items-center gap-1">
                  <Award className="w-3 h-3" /> Winners
                </p>
                <p className="text-xl md:text-2xl font-black tabular-nums">Top {contest.winnerCount}</p>
              </div>
            </div>
          </div>

          {/* Prize distribution bar */}
          {contest.prizeSplit.length > 0 && (
            <div className="px-5 md:px-6 pb-4 md:pb-5">
              <div className="flex items-center gap-1 h-2">
                {contest.prizeSplit.map((share, i) => (
                  <div
                    key={i}
                    className="h-full rounded-full first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${share / 100}%`,
                      backgroundColor: `oklch(0.7 0.15 ${140 + i * 30})`,
                    }}
                    title={`#${i + 1}: ${share / 100}%`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1.5">
                {contest.prizeSplit.map((share, i) => (
                  <span key={i} className="text-[10px] text-muted-foreground">
                    #{i + 1} {(share / 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="px-5 md:px-6 pb-4 md:pb-5">
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-positive/60 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(100, Math.max(4, (contest.entryCount / 100) * 100))}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* Left: Lineup Builder */}
          <div className="lg:col-span-2 space-y-6">
            <div className="surface-raised">
              <div className="flex items-center justify-between p-4 md:p-5 border-b border-white/[0.06]">
                <h2 className="text-sm font-bold">Your Lineup</h2>
                <div className="flex items-center gap-2">
                  {selectedAthletes.length > 0 && (
                    <button
                      onClick={clearLineup}
                      className="text-[11px] text-muted-foreground hover:text-negative transition-colors px-2 py-1 rounded"
                    >
                      Clear
                    </button>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    selectedAthletes.length === LINEUP_SIZE
                      ? 'bg-positive/15 text-positive'
                      : 'bg-white/5 text-muted-foreground'
                  }`}>
                    {selectedAthletes.length} / {LINEUP_SIZE}
                  </span>
                </div>
              </div>

              <div className="p-4 md:p-5 space-y-5">
                {/* Role Requirements Bar */}
                {(['GK', 'DEF', 'MID', 'FWD'] as const).map(role => {
                  const count = roleCounts[role];
                  const needed = maxSlotsByRole[role];
                  const met = count >= needed;
                  const RoleIcon = ROLE_ICONS[role];
                  return (
                    <div key={role} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        met ? 'bg-positive/15 text-positive' : 'bg-white/5 text-muted-foreground'
                      }`}>
                        <RoleIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">{ROLE_LABEL_FULL[role]}</span>
                          <span className={`text-xs font-bold tabular-nums ${
                            met ? 'text-positive' : 'text-muted-foreground'
                          }`}>
                            {count}/{needed}
                          </span>
                        </div>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              met ? 'bg-positive' : 'bg-white/20'
                            }`}
                            style={{ width: `${Math.min(100, (count / needed) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Pitch Visualization */}
                <div className="relative w-full aspect-[3/4] md:aspect-[4/3] rounded-xl overflow-hidden border border-white/[0.06] bg-[oklch(0.1_0.02_140)]">
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
                    <rect x="4" y="4" width="392" height="292" rx="8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
                    <line x1="200" y1="4" x2="200" y2="296" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
                    <circle cx="200" cy="150" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
                    <rect x="160" y="4" width="80" height="50" rx="4" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
                    <rect x="160" y="246" width="80" height="50" rx="4" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
                    <line x1="20" y1="60" x2="380" y2="60" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="4,4" />
                    <line x1="20" y1="140" x2="380" y2="140" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="4,4" />
                    <line x1="20" y1="220" x2="380" y2="220" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="4,4" />
                  </svg>

                  <div className="absolute inset-0 grid grid-rows-4">
                    {ROLE_ORDER.map(role => (
                      <div key={role} className="relative border-b border-white/[0.03] last:border-b-0 p-1.5 md:p-2">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/20 absolute top-1 left-2">{role}</span>
                        <div className="flex items-center justify-center gap-1 h-full pt-3">
                          <AnimatePresence mode="popLayout">
                            {athletesByRole[role].map(athlete => (
                              <motion.button
                                key={athlete.mint}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                                onClick={() => removeAthlete(athlete.mint)}
                                className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/15 hover:bg-negative/30 border border-white/10 flex items-center justify-center text-[10px] md:text-xs font-bold transition-colors cursor-pointer relative group"
                                title={athlete.name}
                              >
                                {athlete.name[0]}
                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/80 text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                  {athlete.name}
                                </span>
                              </motion.button>
                            ))}
                          </AnimatePresence>
                          {Array.from({ length: Math.max(0, maxSlotsByRole[role] - athletesByRole[role].length) }).map((_, i) => (
                            <div
                              key={`empty-${role}-${i}`}
                              className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-dashed border-white/10 bg-white/[0.02]"
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selected Athletes List */}
                {selectedAthletes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Selected ({selectedAthletes.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <AnimatePresence mode="popLayout">
                        {selectedAthletes.map(athlete => (
                          <motion.div
                            key={athlete.mint}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center justify-between p-2.5 rounded-lg surface-elevated group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">
                                {athlete.name[0]}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">{athlete.name}</p>
                                <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full mt-0.5 ${ROLE_COLORS[ROLE_LABELS[athlete.role]]} text-white`}>
                                  {ROLE_LABELS[athlete.role]}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => removeAthlete(athlete.mint)}
                              className="w-7 h-7 rounded-full bg-white/5 hover:bg-negative/20 text-muted-foreground hover:text-negative flex items-center justify-center transition-colors shrink-0"
                              aria-label={`Remove ${athlete.name}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {selectedAthletes.length === 0 && (
                  <div className="py-10 text-center surface-elevated rounded-xl">
                    <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-semibold mb-1">No athletes selected</p>
                    <p className="text-xs text-muted-foreground">Select athletes from the pool to build your lineup</p>
                  </div>
                )}

                {/* Error State */}
                {roleErrors.length > 0 && selectedAthletes.length > 0 && (
                  <div className="p-3 rounded-lg bg-negative/10 border border-negative/20 text-negative text-xs">
                    <strong className="text-xs">Lineup incomplete: </strong>
                    {roleErrors.join(', ')}.
                  </div>
                )}

                {/* Success signature display */}
                {txSignature && (
                  <div className="p-3 rounded-lg bg-positive/10 border border-positive/20 text-positive text-xs flex items-center justify-between">
                    <span>Entry submitted successfully!</span>
                    <a
                      href={`https://solscan.io/tx/${txSignature}${process.env.NEXT_PUBLIC_CLUSTER === 'devnet' ? '?cluster=devnet' : ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:underline"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Submit */}
                <div className="flex flex-col gap-2">
                  <Button
                    size="lg"
                    className={`w-full h-12 text-base font-bold rounded-lg transition-all ${
                      isValidLineup
                        ? 'bg-positive hover:bg-positive/90 text-black'
                        : 'bg-white/5 text-muted-foreground'
                    }`}
                    onClick={() => setShowConfirm(true)}
                    disabled={!isValidLineup || submitting}
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Entering Contest...</>
                    ) : (
                      <>Enter Contest</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Player Pool */}
          <div className="lg:col-span-1">
            <div className="surface-raised sticky top-24 max-h-[calc(100vh-120px)] flex flex-col">
              <div className="p-4 border-b border-white/[0.06] shrink-0">
                <h2 className="text-sm font-bold mb-3">Player Pool</h2>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search athletes..."
                    className="pl-8 h-9 text-sm bg-white/5 border-white/10 focus-visible:ring-primary"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['all', 'GK', 'DEF', 'MID', 'FWD'] as const).map(role => (
                    <button
                      key={role}
                      onClick={() => setRoleFilter(role)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                        roleFilter === role
                          ? role === 'all'
                            ? 'bg-white text-black'
                            : `${ROLE_COLORS[role]} text-white`
                          : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                      }`}
                    >
                      {role === 'all' ? 'All' : role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-y-auto flex-1 custom-scrollbar min-h-[300px]">
                <div className="p-3 space-y-1.5">
                  {availableAthletes.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-xs">
                      Loading athletes...
                    </div>
                  )}
                  {availableAthletes.length > 0 && filteredAthletes.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-xs">
                      No athletes match your search
                    </div>
                  )}
                  {filteredAthletes.length > 0 && (
                    filteredAthletes.map(athlete => {
                      const isSelected = selectedAthletes.some(a => a.mint === athlete.mint);
                      return (
                        <button
                          key={athlete.mint}
                          onClick={() => !isSelected && handleSelectAthlete(athlete)}
                          disabled={isSelected}
                          className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-all ${
                            isSelected
                              ? 'bg-positive/10 opacity-60 cursor-default'
                              : 'surface-elevated hover:bg-white/10 hover:border-white/20 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">
                              {athlete.name[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate max-w-[120px]">{athlete.name}</p>
                              <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full mt-0.5 ${ROLE_COLORS[ROLE_LABELS[athlete.role]]} text-white`}>
                                {ROLE_LABELS[athlete.role]}
                              </span>
                            </div>
                          </div>
                          {isSelected ? (
                            <Check className="w-4 h-4 text-positive" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground group-hover:bg-positive group-hover:text-black transition-colors">
                              <Plus className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="p-3 border-t border-white/[0.06] shrink-0">
                <p className="text-[10px] text-muted-foreground text-center">
                  {availableAthletes.length} athletes available
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => !submitting && setShowConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onClick={e => e.stopPropagation()}
              className="surface-raised w-full max-w-md p-6"
            >
              <h3 className="text-lg font-bold mb-1">Confirm Entry</h3>
              <p className="text-sm text-muted-foreground mb-5">
                You&apos;re about to enter Contest #{contest.id} with the following lineup:
              </p>

              <div className="space-y-1.5 mb-5 max-h-60 overflow-y-auto custom-scrollbar">
                {selectedAthletes.map(athlete => {
                  const roleLabel = ROLE_LABELS[athlete.role];
                  return (
                    <div key={athlete.mint} className="flex items-center justify-between text-sm p-2 rounded-lg bg-white/5">
                      <span className="font-medium">{athlete.name}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_COLORS[roleLabel]} text-white`}>
                        {roleLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 h-11 text-sm"
                  onClick={() => setShowConfirm(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 h-11 text-sm font-bold bg-positive hover:bg-positive/90 text-black"
                  onClick={handleEnterContest}
                  disabled={submitting}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                  ) : (
                    'Confirm & Submit'
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default dynamic(() => Promise.resolve(ContestDetailPage), { ssr: false });

function ContestDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading contest...</p>
        </div>
      </div>
    }>
      <ContestDetailContent />
    </Suspense>
  );
}
