'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { findConfigPda, findEntryPda, findContestPda, getEnterContestInstructionDataEncoder } from '@dexi/sdk';
import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useLiveScores } from '@/hooks/useLiveScores';
import { useUserEntries } from '@/hooks/useUserEntries';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Users, Search, X, Plus, ChevronRight, Wallet, Check,
  Shield, Swords, Eye, Goal, Loader2, ExternalLink, ArrowLeft,
  Clock, DollarSign, Sparkles, AlertCircle, Zap,
  Fingerprint, ChevronLeft
} from 'lucide-react';
import Navbar from '@/components/layout/navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

import { getConnection, getRpc, PROGRAM_ID, ROLE_LABELS, CONTEST_STATUS_LABELS, ROLE_COLORS, formatUSDC, formatEstimatedPrizePool, formatTimestamp, ROLE_REQUIREMENTS, LINEUP_SIZE } from '@/solana/client';
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
  name: string;
  fixtureId: string;
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
const ROLE_COLORS_MAP: Record<string, string> = {
  GK: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  DEF: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  MID: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  FWD: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

function formatCountdown(startTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, startTime - now);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function ContestDetailContent() {
  const params = useParams();
  const router = useRouter();
  const contestId = params?.id ? parseInt(params.id as string) : 1;
  const { connected, publicKey, sendTransaction, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [contest, setContest] = useState<ContestData | null>(null);
  const [contestMints, setContestMints] = useState<Set<string>>(new Set());
  const [selectedAthletes, setSelectedAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [availableAthletes, setAvailableAthletes] = useState<Athlete[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showConfirm, setShowConfirm] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { entries: userEntries } = useUserEntries();
  const { scores, loading: scoresLoading } = useLiveScores(userEntries);

  const revolvingTitles = useMemo(() => [
    contest ? `${contest.name} | DEXI` : 'Contest | DEXI',
    contest ? `${contest.name} — Draft Lineup | DEXI` : 'Contest | DEXI',
  ], [contest]);

  useRevolvingTitle(revolvingTitles);

  const meta = useMemo(() => ({
    title: contest ? `${contest.name} | DEXI` : `Contest | DEXI`,
    description: contest ? `Enter the ${contest.name} fantasy contest on DEXI. Draft athletes and compete for USDC prizes.` : 'Fantasy contest on DEXI.',
    ogTitle: contest ? `${contest.name} — DEXI` : 'Contest — DEXI',
    ogDescription: contest ? `Enter ${contest.name} on DEXI.` : 'Enter fantasy contest on DEXI.',
  }), [contest]);

  usePageMeta(meta);

  useEffect(() => {
    async function fetchAthletes() {
      try {
        const response = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
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
        setFetchError('Failed to load athlete pools. Check your RPC getConnection().');
      }
    }
    fetchAthletes();
  }, []);

  useEffect(() => {
    async function fetchContest() {
      try {
        const [contestPda] = await findContestPda({ id: contestId });
        const response = await getRpc().getAccountInfo(contestPda, { encoding: 'base64', commitment: 'confirmed' }).send();

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
          name: decoded.name || `Match #${decoded.id}`,
          fixtureId: decoded.fixtureId || '',
        });
        setFetchError(null);

        try {
          const { PublicKey } = await import('@solana/web3.js');
          const lutAddress = new PublicKey(decoded.addressLookupTable.toString());
          const lutInfo = await getConnection().getAddressLookupTable(lutAddress);
          if (lutInfo.value) {
            setContestMints(new Set(lutInfo.value.state.addresses.map(a => a.toBase58())));
          }
        } catch (e) {
          console.error("Failed to fetch LUT for available athletes filter", e);
        }
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
    if (!connected || !publicKey || !sendTransaction) {
      toast.error('Please connect your wallet');
      return;
    }

    setSubmitting(true);
    setTxSignature(null);
    try {
      if (!contest) {
        toast.error('Contest data not loaded');
        return;
      }
      const userKey = new PublicKey(publicKey.toString());
      const [contestPda] = await findContestPda({ id: contestId });
      const contestKey = new PublicKey(contestPda);
      const [configPda] = await findConfigPda();
      const [entryPda] = await findEntryPda({ contest: contestPda as any, user: publicKey.toBase58() as any });

      const uniqueMints = Array.from(new Set(selectedAthletes.map(a => a.mint)));
      const remainingAccounts: { address: string; isWritable: boolean; isSigner: boolean }[] = [];
      const ataCreationIxs: TransactionInstruction[] = [];

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

        const ataInfo = await getConnection().getAccountInfo(userAta);
        if (!ataInfo) {
          ataCreationIxs.push(
            createAssociatedTokenAccountInstruction(
              userKey,
              userAta,
              userKey,
              mintKey
            )
          );
        }
      }

      if (ataCreationIxs.length > 0) {
        toast.info('Creating token accounts...');
      }

      const PROGRAM_ID_KEY = PROGRAM_ID;
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

      const { context: { slot }, value: { blockhash, lastValidBlockHeight } } = await getConnection().getLatestBlockhashAndContext('confirmed');

      let lutAccount = null;
      try {
        const lutAddress = new PublicKey(contest.addressLookupTable);
        const lutInfo = await getConnection().getAddressLookupTable(lutAddress);
        lutAccount = lutInfo.value || null;
      } catch (lutError) {
        console.warn('Failed to fetch LUT, continuing without it:', lutError);
      }

      let signature: string;

      const trySignAndSendRaw = async (tx: VersionedTransaction): Promise<string> => {
        if (signTransaction) {
          const signedTx = await signTransaction(tx);
          const rawTx = signedTx.serialize();
          return getConnection().sendRawTransaction(rawTx, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });
        }
        return sendTransaction(tx, getConnection());
      };

      const allIxs = [...ataCreationIxs, instruction];

      try {
        const messageV0 = new TransactionMessage({
          payerKey: userKey,
          recentBlockhash: blockhash,
          instructions: allIxs,
        }).compileToV0Message(lutAccount ? [lutAccount] : []);

        const transaction = new VersionedTransaction(messageV0);
        signature = await trySignAndSendRaw(transaction);
      } catch (v0Error: any) {
        const isWalletError =
          v0Error?.message?.includes('Unexpected') ||
          v0Error?.message?.includes('disconnected') ||
          v0Error?.message?.includes('rejected') ||
          v0Error?.message?.includes('service worker');

        if (isWalletError) {
          console.warn('V0 with LUT failed, trying without LUT:', v0Error.message);
          
          try {
            const messageV0NoLut = new TransactionMessage({
              payerKey: userKey,
              recentBlockhash: blockhash,
              instructions: allIxs,
            }).compileToV0Message([]);

            const transactionNoLut = new VersionedTransaction(messageV0NoLut);
            signature = await trySignAndSendRaw(transactionNoLut);
          } catch (noLutError: any) {
            console.error('V0 without LUT also failed:', noLutError.message);
            throw new Error('Wallet connection issue. Please disconnect and reconnect your wallet, or use a different wallet (Backpack, Glow, Slope).');
          }
        } else {
          throw v0Error;
        }
      }

      const confirmation = await getConnection().confirmTransaction({
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
      console.error('Enter contest error:', error);
      let message = 'Transaction failed';
      
      if (error?.message) {
        message = error.message;
      } else if (error?.error?.message) {
        message = error.error.message;
      } else if (error?.code) {
        message = `Error code: ${error.code}`;
      }
      
      if (message.includes('overruns') || message.includes('Invalid')) {
        message = 'Wallet encoding error. Try refreshing or using a different wallet.';
      } else if (message.includes('User rejected') || message.includes('rejected')) {
        message = 'Transaction was rejected. Please approve the transaction in your wallet.';
      } else if (message.includes('disconnected port') || message.includes('service worker')) {
        message = 'Wallet connection lost. Please refresh the page and reconnect your wallet.';
      } else if (message === 'Unexpected error' || message.includes('Unexpected error')) {
        message = 'Wallet error. Try disconnecting and reconnecting your wallet, or use a different wallet.';
      } else if (message.length > 100) {
        message = 'Transaction failed. Please try again.';
      }
      
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAthletes = useMemo(() => {
    return availableAthletes.filter(athlete => {
      const isAllowed = contestMints.size === 0 || contestMints.has(athlete.mint);
      const matchesSearch = athlete.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'all' || ROLE_LABELS[athlete.role] === roleFilter;
      return isAllowed && matchesSearch && matchesRole;
    });
  }, [availableAthletes, searchQuery, roleFilter, contestMints]);

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

  const totalSlots = Object.values(maxSlotsByRole).reduce((a, b) => a + b, 0);

  if (fetchError && !contest) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0f131d]">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md text-center p-10 border border-[#454932] bg-[#1c1f2a]">
            <div className="w-16 h-16 bg-[#181b25] border border-[#454932] flex items-center justify-center mx-auto mb-5">
              <Trophy className="w-8 h-8 text-negative" />
            </div>
            <h2 className="font-heading text-[24px] font-[600] text-white mb-2">Contest Not Found</h2>
            <p className="font-sans text-[16px] leading-[24px] font-[400] text-[#c6c9ab] mb-6">{fetchError}</p>
            <Button size="lg" className="w-full h-12 font-mono text-[13px] font-[700] bg-primary text-primary-foreground hover:opacity-90 transition-opacity uppercase tracking-wider" onClick={() => router.push('/markets')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Markets
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0f131d]">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="font-sans text-[14px] text-[#c6c9ab]">Loading contest...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0f131d]">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md text-center p-10 border border-[#454932] bg-[#1c1f2a]">
            <div className="w-16 h-16 bg-[#181b25] border border-[#454932] flex items-center justify-center mx-auto mb-5">
              <Trophy className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-heading text-[24px] font-[600] text-white mb-2">Connect to Enter</h2>
            <p className="font-sans text-[16px] leading-[24px] font-[400] text-[#c6c9ab] mb-6">
              Join fantasy contests, draft your dream lineup, and compete for USDC prizes settled instantly on Solana.
            </p>
            <Button size="lg" className="w-full h-12 font-mono text-[13px] font-[700] bg-primary text-primary-foreground hover:opacity-90 transition-opacity uppercase tracking-wider" onClick={() => setVisible(true)}>
              <Wallet className="mr-2 h-4 w-4" /> Connect Wallet
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (contest.status !== 0) {
    const userEntryForContest = userEntries.find(e => e.contestId === contestId);
    const userScore = userEntryForContest ? scores[userEntryForContest.entryAddress] : undefined;

    return (
      <div className="min-h-screen flex flex-col bg-[#0f131d]">
        <Navbar />
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 py-8">
          <div className="flex items-center gap-2 font-mono text-[12px] text-[#c6c9ab] mb-6">
            <button onClick={() => router.push('/contests')} className="hover:text-white transition-colors">Contests</button>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">{contest.name}</span>
          </div>

          <div className="border border-[#454932] overflow-hidden">
            <div className="border-b border-[#454932] p-8">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="font-heading text-[clamp(1.8rem,3.5vw,2.5rem)] font-[700] text-white leading-[1.1] tracking-[-0.02em] mb-3">
                    {contest.name}
                  </h1>
                  <span className={`font-mono text-[12px] font-[700] px-3 py-1 ${contest.status === 1 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'}`}>
                    {CONTEST_STATUS_LABELS[contest.status]}
                  </span>
                </div>
                {userEntryForContest && (
                  <div className="flex items-center gap-6 p-4 bg-[#181b25] border border-[#454932]">
                    <div className="text-center">
                      <p className="font-mono text-[11px] tracking-[0.02em] text-[#c6c9ab] mb-1 uppercase">Your Score</p>
                      <p className="font-heading text-[32px] font-[700] text-primary">
                        {scoresLoading ? '-' : userScore?.score ?? '-'}
                      </p>
                    </div>
                    <div className="w-px h-12 bg-[#454932]" />
                    <div className="text-center">
                      <p className="font-mono text-[11px] tracking-[0.02em] text-[#c6c9ab] mb-1 uppercase">Position</p>
                      <p className="font-heading text-[32px] font-[700] text-white">
                        {scoresLoading ? '-' : userScore ? `#${userScore.position}` : '-'}
                      </p>
                    </div>
                    <div className="w-px h-12 bg-[#454932]" />
                    <div className="text-center">
                      <p className="font-mono text-[11px] tracking-[0.02em] text-[#c6c9ab] mb-1 uppercase">Est. Prize</p>
                      <p className="font-heading text-[32px] font-[700] text-positive">
                        {scoresLoading ? '-' : userScore?.prizeEstimate ? `$${userScore.prizeEstimate.toFixed(2)}` : '-'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 bg-[#181b25] border border-[#454932] text-center">
                  <p className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab] mb-2 uppercase">Total Entries</p>
                  <p className="font-heading text-[28px] font-[700] text-white">{contest.entryCount}</p>
                </div>
                <div className="p-5 bg-[#181b25] border border-[#454932] text-center">
                  <p className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab] mb-2 uppercase">Prize Pool</p>
                  <p className="font-heading text-[28px] font-[700] text-primary">{contest.settled ? `$${formatUSDC(contest.prizePool)}` : formatEstimatedPrizePool(contest.entryCount)}</p>
                </div>
                <div className="p-5 bg-[#181b25] border border-[#454932] text-center">
                  <p className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab] mb-2 uppercase">Winners</p>
                  <p className="font-heading text-[28px] font-[700] text-white">Top {contest.winnerCount}</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0f131d]">
      <Navbar />

      <main className="flex-1">
        {/* Breadcrumb */}
        <div className="w-full max-w-[1440px] mx-auto px-6 pt-5 pb-0">
          <div className="flex items-center gap-1.5 font-mono text-[12px] text-[#c6c9ab]">
            <button onClick={() => router.push('/contests')} className="hover:text-white transition-colors">Dashboard</button>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white font-[700]">{contest.name}</span>
          </div>
        </div>

        {/* Contest Header */}
        <div className="w-full max-w-[1440px] mx-auto px-6 py-5">
          <div className="border border-[#454932] bg-[#1c1f2a] overflow-hidden">
            <div className="p-6">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="font-heading text-[clamp(1.5rem,2.5vw,2rem)] font-[700] text-white leading-[1.1] tracking-[-0.02em]">
                      {contest.name}
                    </h1>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-[700] text-positive bg-positive/10 px-2.5 py-0.5 border border-positive/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                      OPEN
                    </span>
                  </div>
                  <p className="font-mono text-[13px] tracking-[0.02em] text-[#c6c9ab] flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    Closes in {formatCountdown(contest.startTime)}
                  </p>
                </div>
                <div className="flex items-center gap-4 md:text-right">
                  <div>
                    <p className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab] mb-0.5 uppercase">Prize Pool</p>
                    <p className="font-heading text-[24px] font-[700] text-primary">{contest.settled ? `$${formatUSDC(contest.prizePool)}` : formatEstimatedPrizePool(contest.entryCount)}</p>
                  </div>
                  <div className="w-px h-10 bg-[#454932]" />
                  <div>
                    <p className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab] mb-0.5 uppercase">Winners</p>
                    <p className="font-heading text-[24px] font-[700] text-white">Top {contest.winnerCount}</p>
                  </div>
                </div>
              </div>

              {/* Entry Progress */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab] uppercase">Entry Progress</span>
                  <span className="font-mono text-[13px] font-[700] text-[#dfe2f0]">{contest.entryCount} / 100</span>
                </div>
                <div className="w-full h-2 bg-[#262a34]">
                  <div
                    className="h-full bg-primary/60 transition-all duration-1000"
                    style={{ width: `${Math.min(100, Math.max(2, (contest.entryCount / 100) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid: Lineup Builder + Player Pool */}
        <div className="w-full max-w-[1440px] mx-auto px-6 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">

            {/* Left: Tactical Lineup */}
            <div className="space-y-5">
              <div className="border border-[#454932] overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-[#454932]">
                  <div className="flex items-center gap-2.5">
                    <Swords className="w-4 h-4 text-primary" />
                    <h2 className="font-heading text-[20px] font-[600] text-white">Tactical Lineup</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    {selectedAthletes.length > 0 && (
                      <button
                        onClick={clearLineup}
                        className="font-mono text-[11px] font-[700] text-[#c6c9ab] hover:text-negative transition-colors px-2 py-1 uppercase tracking-wider"
                      >
                        Clear
                      </button>
                    )}
                    <span className={`font-mono text-[12px] font-[700] px-2.5 py-1 ${
                      selectedAthletes.length === totalSlots
                        ? 'bg-positive/10 text-positive border border-positive/20'
                        : 'bg-[#181b25] text-[#c6c9ab] border border-[#454932]'
                    }`}>
                      {selectedAthletes.length}/{totalSlots}
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  {/* Role Summary */}
                  <div className="flex items-center justify-between mb-4 p-3 bg-[#181b25] border border-[#454932]">
                    <span className="font-mono text-[12px] tracking-[0.02em] text-[#c6c9ab]">
                      GK: <strong className={roleCounts.GK >= maxSlotsByRole.GK ? 'text-positive' : 'text-[#c6c9ab]'}>{roleCounts.GK}/{maxSlotsByRole.GK}</strong>
                      {' | '}DEF: <strong className={roleCounts.DEF >= maxSlotsByRole.DEF ? 'text-positive' : 'text-[#c6c9ab]'}>{roleCounts.DEF}/{maxSlotsByRole.DEF}</strong>
                      {' | '}MID: <strong className={roleCounts.MID >= maxSlotsByRole.MID ? 'text-positive' : 'text-[#c6c9ab]'}>{roleCounts.MID}/{maxSlotsByRole.MID}</strong>
                      {' | '}FWD: <strong className={roleCounts.FWD >= maxSlotsByRole.FWD ? 'text-positive' : 'text-[#c6c9ab]'}>{roleCounts.FWD}/{maxSlotsByRole.FWD}</strong>
                    </span>
                  </div>

                  {/* Pitch View */}
                  <div className="relative w-full aspect-[4/3] overflow-hidden border border-[#454932] bg-gradient-to-b from-emerald-950/40 via-emerald-950/20 to-emerald-950/40 mb-5">
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
                      <rect x="4" y="4" width="392" height="292" rx="4" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
                      <line x1="200" y1="4" x2="200" y2="296" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      <circle cx="200" cy="150" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      <rect x="165" y="4" width="70" height="45" rx="2" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      <rect x="165" y="251" width="70" height="45" rx="2" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      <line x1="20" y1="60" x2="380" y2="60" stroke="rgba(255,255,255,0.02)" strokeWidth="1" strokeDasharray="4,4" />
                      <line x1="20" y1="140" x2="380" y2="140" stroke="rgba(255,255,255,0.02)" strokeWidth="1" strokeDasharray="4,4" />
                      <line x1="20" y1="220" x2="380" y2="220" stroke="rgba(255,255,255,0.02)" strokeWidth="1" strokeDasharray="4,4" />
                    </svg>

                    <div className="absolute inset-0 grid grid-rows-4">
                      {ROLE_ORDER.map(role => (
                        <div key={role} className="relative border-b border-white/[0.03] last:border-b-0 p-2">
                          <span className="font-mono text-[8px] tracking-[0.02em] font-[700] text-white/15 absolute top-1 left-2.5 uppercase">{role}</span>
                          <div className="flex items-center justify-center gap-1.5 h-full pt-4">
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
                                  className={`w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center font-heading text-[12px] font-[700] transition-all cursor-pointer relative group border-2 ${
                                    ROLE_COLORS_MAP[role]?.includes('text-amber') ? 'border-amber-500/40 bg-amber-500/20 text-amber-400' :
                                    ROLE_COLORS_MAP[role]?.includes('text-blue') ? 'border-blue-500/40 bg-blue-500/20 text-blue-400' :
                                    ROLE_COLORS_MAP[role]?.includes('text-emerald') ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400' :
                                    ROLE_COLORS_MAP[role]?.includes('text-rose') ? 'border-rose-500/40 bg-rose-500/20 text-rose-400' :
                                    'border-white/20 bg-white/15 text-white'
                                  }`}
                                  title={athlete.name}
                                >
                                  {athlete.name[0]}
                                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/90 font-mono text-[10px] px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-[#454932]">
                                    {athlete.name}
                                  </span>
                                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-negative/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <X className="w-2.5 h-2.5" />
                                  </span>
                                </motion.button>
                              ))}
                            </AnimatePresence>
                            {Array.from({ length: Math.max(0, maxSlotsByRole[role] - athletesByRole[role].length) }).map((_, i) => (
                              <div
                                key={`empty-${role}-${i}`}
                                className="w-9 h-9 md:w-11 md:h-11 rounded-full border-2 border-dashed border-[#454932] bg-[#181b25]/50 flex items-center justify-center text-[#c6c9ab]"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Selected Athletes List */}
                  {selectedAthletes.length > 0 && (
                    <div className="space-y-2 mb-4">
                      <p className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab] uppercase">
                        Selected ({selectedAthletes.length})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        <AnimatePresence mode="popLayout">
                          {selectedAthletes.map(athlete => {
                            const roleLabel = ROLE_LABELS[athlete.role];
                            return (
                              <motion.div
                                key={athlete.mint}
                                layout
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.15 }}
                                className="flex items-center justify-between p-2.5 bg-[#181b25] border border-[#454932] group hover:bg-[#1c1f2a] transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-heading text-[11px] font-[700] shrink-0 ${
                                    ROLE_COLORS_MAP[roleLabel]?.split(' ')[0] || 'bg-white/10'
                                  }`}>
                                    {athlete.name[0]}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-heading text-[13px] font-[600] text-white truncate">{athlete.name}</p>
                                    <span className={`inline-block font-mono text-[10px] tracking-[0.02em] font-[700] px-1.5 py-0.5 mt-0.5 ${ROLE_COLORS_MAP[roleLabel]}`}>
                                      {roleLabel}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeAthlete(athlete.mint)}
                                  className="w-6 h-6 rounded-full bg-white/5 hover:bg-negative/20 text-[#c6c9ab] hover:text-negative flex items-center justify-center transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {selectedAthletes.length === 0 && (
                    <div className="py-8 text-center bg-[#181b25] border border-[#454932] mb-4">
                      <Users className="w-8 h-8 text-[#c6c9ab] mx-auto mb-2" />
                      <p className="font-heading text-[16px] font-[600] text-white mb-0.5">Build your lineup</p>
                      <p className="font-sans text-[14px] leading-[20px] font-[400] text-[#c6c9ab]">Select athletes from the pool to fill each role</p>
                    </div>
                  )}

                  {/* Role Errors */}
                  {roleErrors.length > 0 && selectedAthletes.length > 0 && (
                    <div className="p-3 bg-negative/10 border border-negative/20 font-mono text-[12px] text-negative flex items-start gap-2 mb-4">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span><strong>Lineup incomplete:</strong> {roleErrors.join(', ')}.</span>
                    </div>
                  )}

                  {/* Tx Success */}
                  {txSignature && (
                    <div className="p-3 bg-positive/10 border border-positive/20 font-mono text-[12px] text-positive flex items-center justify-between mb-4">
                      <span className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        Entry submitted successfully!
                      </span>
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

                  {/* Enter Contest Button */}
                  <Button
                    size="lg"
                    className={`w-full h-12 font-mono text-[13px] font-[700] transition-all uppercase tracking-wider ${
                      isValidLineup
                        ? 'bg-primary text-primary-foreground hover:opacity-90'
                        : 'bg-[#181b25] text-[#c6c9ab] border border-[#454932] cursor-not-allowed'
                    }`}
                    onClick={() => setShowConfirm(true)}
                    disabled={!isValidLineup || submitting}
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Entering Arena...</>
                    ) : (
                      <><Zap className="w-4 h-4 mr-2" /> Enter Contest</>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Right: Player Pool */}
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-120px)] lg:flex lg:flex-col">
              <div className="border border-[#454932] bg-[#1c1f2a] flex flex-col h-full">
                <div className="p-4 border-b border-[#454932] shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-heading text-[18px] font-[600] text-white">Athlete Pool</h2>
                    <span className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab]">{availableAthletes.length} athletes</span>
                  </div>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#c6c9ab]" />
                    <Input
                      placeholder="Search athletes..."
                      className="pl-9 h-9 font-mono text-[12px] bg-[#0a0e18] border-[#454932] focus-visible:border-primary/50 rounded-none"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(['all', 'GK', 'DEF', 'MID', 'FWD'] as const).map(role => (
                      <button
                        key={role}
                        onClick={() => setRoleFilter(role)}
                        className={`px-3 py-1 font-mono text-[11px] font-[700] tracking-[0.02em] transition-all uppercase ${
                          roleFilter === role
                            ? role === 'all'
                              ? 'bg-primary text-primary-foreground'
                              : `${ROLE_COLORS_MAP[role].split(' ')[0]} ${ROLE_COLORS_MAP[role].split(' ')[1]} border ${ROLE_COLORS_MAP[role].split(' ')[2]}`
                            : 'bg-[#181b25] text-[#c6c9ab] border border-[#454932] hover:bg-[#1c1f2a]'
                        }`}
                      >
                        {role === 'all' ? 'All' : role}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-y-auto flex-1 min-h-[400px] lg:min-h-0 custom-scrollbar">
                  <div className="p-3 space-y-1">
                    {availableAthletes.length === 0 && (
                      <div className="text-center py-10 font-mono text-[12px] text-[#c6c9ab]">
                        Loading athletes...
                      </div>
                    )}
                    {availableAthletes.length > 0 && filteredAthletes.length === 0 && (
                      <div className="text-center py-10 font-mono text-[12px] text-[#c6c9ab]">
                        No athletes match your search
                      </div>
                    )}
                    {filteredAthletes.length > 0 && (
                      filteredAthletes.map(athlete => {
                        const isSelected = selectedAthletes.some(a => a.mint === athlete.mint);
                        const roleLabel = ROLE_LABELS[athlete.role];
                        return (
                          <button
                            key={athlete.mint}
                            onClick={() => !isSelected && handleSelectAthlete(athlete)}
                            disabled={isSelected}
                            className={`w-full flex items-center justify-between p-3 text-left transition-all ${
                              isSelected
                                ? 'bg-positive/5 border border-positive/20 opacity-70'
                                : 'bg-[#181b25] border border-[#454932] hover:bg-[#1c1f2a] hover:border-white/20 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-heading text-[13px] font-[700] shrink-0 ${
                                ROLE_COLORS_MAP[roleLabel]?.split(' ')[0] || 'bg-white/10'
                              }`}>
                                {athlete.name[0]}
                              </div>
                              <div className="min-w-0">
                                <p className="font-heading text-[14px] font-[600] text-white truncate max-w-[120px]">{athlete.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`font-mono text-[10px] tracking-[0.02em] font-[700] px-1.5 py-0.5 ${ROLE_COLORS_MAP[roleLabel]}`}>
                                    {roleLabel}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {isSelected ? (
                              <div className="w-7 h-7 rounded-full bg-positive/20 flex items-center justify-center">
                                <Check className="w-3.5 h-3.5 text-positive" />
                              </div>
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-[#262a34] flex items-center justify-center text-[#c6c9ab] group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <Plus className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="p-3 border-t border-[#454932] shrink-0">
                  <p className="font-mono text-[11px] tracking-[0.02em] text-[#c6c9ab] text-center">
                    {filteredAthletes.length} of {availableAthletes.length} athletes
                  </p>
                </div>
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => !submitting && setShowConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md border border-[#454932] bg-[#0f131d] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-3 p-5 border-b border-[#454932]">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="w-8 h-8 bg-[#181b25] border border-[#454932] flex items-center justify-center hover:bg-[#1c1f2a] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div>
                  <h3 className="font-heading text-[18px] font-[600] text-white">Confirm Entry</h3>
                  <p className="font-sans text-[13px] text-[#c6c9ab]">Review your lineup and transaction details</p>
                </div>
              </div>

              {/* Contest Info */}
              <div className="px-5 py-4 border-b border-[#454932]">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 bg-[#181b25] border border-[#454932] flex items-center justify-center">
                    <Zap className="w-3 h-3 text-primary" />
                  </div>
                  <span className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab] uppercase">Solana Network</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-heading text-[16px] font-[600] text-white">Solana Open</span>
                  <span className="font-mono text-[12px] font-[700] text-primary">$50k GTD Prize Pool</span>
                </div>
                <div className="flex items-center gap-4 font-mono text-[12px] text-[#c6c9ab]">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Entry Fee: 25.00 USDC
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Starts in 45m
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {contest.entryCount} / 2,000 Entries
                  </span>
                </div>
              </div>

              {/* Drafted Lineup */}
              <div className="px-5 py-4 border-b border-[#454932]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab] uppercase">Drafted Lineup</h4>
                </div>
                <div className="space-y-1.5">
                  {selectedAthletes.slice(0, 5).map(athlete => {
                    const roleLabel = ROLE_LABELS[athlete.role];
                    return (
                      <div key={athlete.mint} className="flex items-center justify-between font-mono text-[13px] p-2 bg-[#181b25] border border-[#454932]">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-[700] w-6 text-center ${ROLE_COLORS_MAP[roleLabel]?.split(' ')[1] || 'text-white'}`}>
                            {roleLabel}
                          </span>
                          <span className="font-heading text-[13px] font-[600] text-white">{athlete.name}</span>
                        </div>
                        <span className="font-mono text-[13px] font-[700] text-[#c6c9ab]">$0</span>
                      </div>
                    );
                  })}
                  {selectedAthletes.length > 5 && (
                    <button className="w-full font-mono text-[12px] font-[700] text-primary text-center pt-1 hover:underline uppercase tracking-wider">
                      View Full Lineup ({selectedAthletes.length - 5} more)
                    </button>
                  )}
                </div>
              </div>

              {/* Fee Summary */}
              <div className="px-5 py-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-mono text-[13px]">
                    <span className="text-[#c6c9ab]">Available Balance</span>
                    <span className="font-[700] text-[#dfe2f0]">1,245.50 USDC</span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[13px]">
                    <span className="text-[#c6c9ab]">Entry Fee</span>
                    <span className="font-[700] text-negative">- 25.00 USDC</span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[13px]">
                    <div className="flex items-center gap-1">
                      <span className="text-[#c6c9ab]">Network Fee</span>
                      <AlertCircle className="w-3 h-3 text-[#c6c9ab]/60" />
                    </div>
                    <span className="text-[#c6c9ab]">~0.000005 SOL</span>
                  </div>
                  <div className="pt-2 border-t border-[#454932] flex items-center justify-between font-mono text-[14px]">
                    <span className="font-[700] text-white">Total Deduction</span>
                    <span className="font-[700] text-primary">25.00 USDC</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 pb-5 space-y-2">
                <Button
                  className="w-full h-11 font-mono text-[13px] font-[700] bg-primary text-primary-foreground hover:opacity-90 transition-opacity uppercase tracking-wider"
                  onClick={handleEnterContest}
                  disabled={submitting}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Confirming...</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-2" /> Confirm Entry</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-11 font-mono text-[13px] font-[700] border-[#454932] text-[#c6c9ab] hover:text-white hover:bg-[#1c1f2a] uppercase tracking-wider"
                  onClick={() => setShowConfirm(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </div>

              {/* Tx Status */}
              {submitting && (
                <div className="px-5 pb-5">
                  <div className="p-3 bg-[#181b25] border border-[#454932]">
                    <div className="flex items-center gap-2 font-mono text-[12px] mb-2">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="font-[700] text-[#dfe2f0]">Confirming Transaction...</span>
                    </div>
                    <p className="font-sans text-[12px] text-[#c6c9ab]">
                      Awaiting confirmation on Solana mainnet.
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 font-mono text-[11px] text-[#c6c9ab]">
                      <Fingerprint className="w-3 h-3" />
                      TxHash: <span className="font-mono">8f4k...9m2q</span>
                    </div>
                  </div>
                </div>
              )}
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
      <div className="min-h-screen flex items-center justify-center bg-[#0f131d]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="font-sans text-[14px] text-[#c6c9ab]">Loading contest...</p>
        </div>
      </div>
    }>
      <ContestDetailContent />
    </Suspense>
  );
}
