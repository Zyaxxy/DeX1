'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Timer, Users, Search, X, Plus, ChevronRight, Wallet } from 'lucide-react';
import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

import { connection, rpc, PROGRAM_ID, ROLE_LABELS, CONTEST_STATUS_LABELS, ROLE_COLORS, CONTEST_STATUS_COLORS, formatUSDC, formatTimestamp, ROLE_REQUIREMENTS, LINEUP_SIZE } from '@/solana/client';
import { toast } from 'sonner';
import { decodeAthletePool, ATHLETE_POOL_DISCRIMINATOR, decodeContest, CONTEST_DISCRIMINATOR, findContestPda, AthleteRole, ContestStatus } from '@dexi/sdk';
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

function ContestDetailContent() {
  const params = useParams();
  const contestId = params?.id ? parseInt(params.id as string) : 1;
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [contest, setContest] = useState<ContestData | null>(null);
  const [selectedAthletes, setSelectedAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableAthletes, setAvailableAthletes] = useState<Athlete[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  useEffect(() => {
    async function fetchAthletes() {
      try {
        const response = await rpc.getProgramAccounts(PROGRAM_ID.toBase58() as any, {
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
      } catch (err) {
        console.error("Failed to fetch athletes:", err);
      }
    }
    fetchAthletes();
  }, []);

  useEffect(() => {
    async function fetchContest() {
      try {
        const [contestPda] = await findContestPda({ id: contestId });
        const response = await rpc.getAccountInfo(contestPda, { commitment: 'confirmed' }).send();
        
        if (!response || !response.value) return;

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
      } catch (err) {
        console.error("Failed to fetch contest:", err);
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

  const handleSelectAthlete = (athlete: Athlete) => {
    if (selectedAthletes.length >= LINEUP_SIZE) {
      toast.error('Lineup is full');
      return;
    }
    if (selectedAthletes.some(a => a.mint === athlete.mint)) {
      toast.error('Already in lineup');
      return;
    }
    setSelectedAthletes([...selectedAthletes, athlete]);
  };

  const removeAthlete = (mint: string) => {
    setSelectedAthletes(selectedAthletes.filter(a => a.mint !== mint));
  };

  const handleEnterContest = async () => {
    if (!connected || !publicKey || !signTransaction) {
      toast.error('Please connect your wallet');
      return;
    }

    if (selectedAthletes.length !== 11) {
      toast.error('You must select exactly 11 athletes');
      return;
    }

    setLoading(true);
    try {
      const { AddressLookupTableProgram, TransactionMessage, VersionedTransaction, PublicKey, SystemProgram } = await import('@solana/web3.js');
      const { getAssociatedTokenAddressSync } = await import('@solana/spl-token');
      const { getEnterContestInstruction, findConfigPda, findEntryPda, findContestPda } = await import('@dexi/sdk');

      const userKey = new PublicKey(publicKey.toString());
      const [contestPda] = await findContestPda({ id: contestId });
      const contestKey = new PublicKey(contestPda);
      const [configPda] = await findConfigPda();
      const [entryPda] = await findEntryPda({ contest: contestKey.toString() as any, user: userKey.toString() as any });

      const uniqueMints = Array.from(new Set(selectedAthletes.map(a => a.mint)));
      const remainingAccounts = [];

      for (const mintStr of uniqueMints) {
        const mintKey = new PublicKey(mintStr);
        const athlete = selectedAthletes.find(a => a.mint === mintStr)!;
        const poolKey = new PublicKey(athlete.poolAddress);
        const userAta = getAssociatedTokenAddressSync(mintKey, userKey, true);
        const vault = getAssociatedTokenAddressSync(mintKey, contestKey, true);

        remainingAccounts.push(
          { address: mintStr, isWritable: false, isSigner: false },
          { address: userAta.toBase58(), isWritable: true, isSigner: false },
          { address: vault.toBase58(), isWritable: true, isSigner: false },
          { address: poolKey.toBase58(), isWritable: false, isSigner: false }
        );
      }

      toast.info('Fetching Contest Lookup Table...');
      const lutAddress = new PublicKey(contest!.addressLookupTable);
      const lookupTableAccount = (await connection.getAddressLookupTable(lutAddress, { commitment: 'confirmed' })).value!;

      toast.info('Entering contest... Please approve the transaction.');
      const lineupAddresses = selectedAthletes.map(a => a.mint);
      
      const enterIxFixed = getEnterContestInstruction({
        config: configPda.toString() as any,
        contest: contestKey.toBase58() as any,
        entry: entryPda.toString() as any,
        user: userKey.toBase58() as any,
        athletes: lineupAddresses as any, 
      });

      const { TransactionInstruction } = await import('@solana/web3.js');
      const instruction = new TransactionInstruction({
        programId: new PublicKey(enterIxFixed.programAddress),
        keys: [...enterIxFixed.accounts.map(a => ({
          pubkey: new PublicKey(a.address),
          isSigner: (a as any).role >= 2,
          isWritable: (a as any).role === 1 || (a as any).role === 3,
        })), ...remainingAccounts.map(a => ({
          pubkey: new PublicKey(a.address),
          isSigner: a.isSigner,
          isWritable: a.isWritable,
        }))],
        data: Buffer.from(enterIxFixed.data)
      });

      const { blockhash } = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: userKey,
        recentBlockhash: blockhash,
        instructions: [instruction],
      }).compileToV0Message([lookupTableAccount]);
      
      const transaction = new VersionedTransaction(messageV0);
      const signedTransaction = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      toast.success('Successfully entered contest!');
    } catch (error) {
      console.error(error);
      toast.error('Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredAthletes = useMemo(() => {
    return availableAthletes.filter(athlete => {
      const matchesSearch = athlete.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'all' || ROLE_LABELS[athlete.role] === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [availableAthletes, searchQuery, roleFilter]);

  if (!contest) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="glass w-full max-w-md text-center p-8 border-white/10 shadow-[0_0_50px_rgba(0,255,136,0.1)]">
            <div className="w-24 h-24 bg-gradient-to-br from-[#00ff88]/20 to-transparent rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-12 h-12 text-[#00ff88]" />
            </div>
            <h2 className="text-3xl font-black text-white mb-4">Connect to Enter</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Join fantasy contests, draft your dream lineup, and compete for USDC prizes settled instantly on Solana.
            </p>
            <Button size="lg" className="w-full h-14 bg-[#00ff88] hover:bg-[#00ff88]/90 text-black font-bold rounded-xl text-lg glow-green" onClick={() => setVisible(true)}>
              <Wallet className="mr-2 h-5 w-5" /> Connect Wallet
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  if (contest.status !== 0) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <a href="/" className="hover:text-white transition-colors">Dashboard</a>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">Contest #{contest.id}</span>
          </div>

          <Card className="glass overflow-hidden border-white/10">
            <div className="bg-gradient-to-r from-white/5 to-transparent border-b border-white/5 p-8">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-4xl font-black text-white mb-4">Contest #{contest.id}</h1>
                  <Badge className={`${contest.status === 1 ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'} border-none text-sm px-3 py-1`}>
                    {CONTEST_STATUS_LABELS[contest.status]}
                  </Badge>
                </div>
              </div>
            </div>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                <div className="p-6 bg-white/5 rounded-2xl">
                  <p className="text-muted-foreground uppercase tracking-wider text-sm font-medium mb-2">Total Entries</p>
                  <p className="text-4xl font-black text-white">{contest.entryCount}</p>
                </div>
                <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-muted-foreground uppercase tracking-wider text-sm font-medium mb-2">Prize Pool</p>
                  <p className="text-4xl font-black text-[#00ff88]">${formatUSDC(contest.prizePool)}</p>
                </div>
                <div className="p-6 bg-white/5 rounded-2xl">
                  <p className="text-muted-foreground uppercase tracking-wider text-sm font-medium mb-2">Winners</p>
                  <p className="text-4xl font-black text-white">Top {contest.winnerCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col overflow-hidden">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <a href="/" className="hover:text-white transition-colors">Dashboard</a>
          <ChevronRight className="w-4 h-4" />
          <span className="text-white">Contest #{contest.id}</span>
        </div>

        {/* Contest Info Header */}
        <Card className="glass mb-8 border-t-4 border-t-[#00ff88] border-x-white/10 border-b-white/10 overflow-hidden">
          <div className="bg-gradient-to-r from-[#00ff88]/5 to-transparent p-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-black text-white">Contest #{contest.id}</h1>
              <Badge className="bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30 px-3 py-1">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse"></span>
                  Open
                </span>
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Prize Pool</p>
                <p className="text-3xl font-black text-[#00ff88]">${formatUSDC(contest.prizePool)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Start Time</p>
                <div className="flex items-center gap-2 text-white font-medium text-lg">
                  <Timer className="w-5 h-5 text-muted-foreground" />
                  {formatTimestamp(contest.startTime)}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Entries</p>
                <div className="flex items-center gap-2 text-white font-medium text-lg">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  {contest.entryCount}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Winners</p>
                <p className="text-xl font-bold text-white">Top {contest.winnerCount}</p>
              </div>
            </div>
          </div>
          
          <div className="px-6 py-3 bg-white/5 border-t border-white/5">
            <div className="w-full h-2 bg-black rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#00ff88] rounded-full transition-all duration-1000" 
                style={{ width: `${Math.min(100, Math.max(5, (contest.entryCount / 100) * 100))}%` }}
              ></div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Left: Lineup Builder */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass border-white/10 shadow-xl">
              <CardHeader className="border-b border-white/5 flex flex-row items-center justify-between py-4">
                <CardTitle className="text-xl">Your Lineup</CardTitle>
                <Badge variant="outline" className={`px-3 py-1 border-white/10 ${selectedAthletes.length === 11 ? 'bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30' : 'bg-white/5 text-white'}`}>
                  {selectedAthletes.length} / 11 Players
                </Badge>
              </CardHeader>
              <CardContent className="p-6">
                
                {/* Role Requirements */}
                <div className="flex flex-wrap gap-2 mb-6 p-4 bg-black/40 rounded-xl border border-white/5">
                  <Badge className={`px-3 py-1 text-sm border-none ${roleCounts.GK >= ROLE_REQUIREMENTS.GK ? 'bg-amber-500/20 text-amber-500' : 'bg-white/5 text-muted-foreground'}`}>
                    GK: {roleCounts.GK}/{ROLE_REQUIREMENTS.GK}
                  </Badge>
                  <Badge className={`px-3 py-1 text-sm border-none ${roleCounts.DEF >= ROLE_REQUIREMENTS.DEF ? 'bg-sky-500/20 text-sky-500' : 'bg-white/5 text-muted-foreground'}`}>
                    DEF: {roleCounts.DEF}/{ROLE_REQUIREMENTS.DEF}
                  </Badge>
                  <Badge className={`px-3 py-1 text-sm border-none ${roleCounts.MID >= ROLE_REQUIREMENTS.MID ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white/5 text-muted-foreground'}`}>
                    MID: {roleCounts.MID}/{ROLE_REQUIREMENTS.MID}
                  </Badge>
                  <Badge className={`px-3 py-1 text-sm border-none ${roleCounts.FWD >= ROLE_REQUIREMENTS.FWD ? 'bg-rose-500/20 text-rose-500' : 'bg-white/5 text-muted-foreground'}`}>
                    FWD: {roleCounts.FWD}/{ROLE_REQUIREMENTS.FWD}
                  </Badge>
                </div>

                {/* Lineup Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8 min-h-[300px]">
                  <AnimatePresence>
                    {selectedAthletes.map((athlete) => (
                      <motion.div
                        key={athlete.mint}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        layout
                        className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between group hover:border-white/20 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/20 to-transparent flex items-center justify-center font-bold text-white text-sm border border-white/5 shadow-inner">
                            {athlete.name[0]}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">{athlete.name}</p>
                            <Badge className={`${ROLE_COLORS[ROLE_LABELS[athlete.role]]} text-white border-none text-[10px] px-1.5 py-0`}>
                              {ROLE_LABELS[athlete.role]}
                            </Badge>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeAthlete(athlete.mint)}
                          className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-muted-foreground hover:bg-[#ff4757]/20 hover:text-[#ff4757] transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Empty Slots */}
                  {Array.from({ length: Math.max(0, LINEUP_SIZE - selectedAthletes.length) }).map((_, i) => (
                    <div key={`empty-${i}`} className="border-2 border-dashed border-white/10 rounded-xl p-3 flex items-center justify-center bg-white/[0.01] h-[66px]">
                      <span className="text-sm font-medium text-muted-foreground/50 flex items-center gap-2">
                        + Empty Slot
                      </span>
                    </div>
                  ))}
                </div>

                {/* Errors */}
                {roleErrors.length > 0 && selectedAthletes.length > 0 && (
                  <div className="mb-6 p-4 rounded-xl bg-[#ff4757]/10 border border-[#ff4757]/20 text-[#ff4757] text-sm">
                    <strong>Lineup Requirements:</strong> You need {roleErrors.join(', ')}.
                  </div>
                )}

                {/* Submit */}
                <Button 
                  size="lg"
                  className={`w-full h-14 text-lg font-bold rounded-xl transition-all ${
                    isValidLineup 
                      ? 'bg-[#00ff88] hover:bg-[#00ff88]/90 text-black glow-green' 
                      : 'bg-white/5 text-muted-foreground border border-white/10'
                  }`}
                  onClick={handleEnterContest}
                  disabled={loading || !isValidLineup}
                >
                  {loading ? 'Entering Contest...' : 'Enter Contest'}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Athlete Pool */}
          <div className="lg:col-span-1">
            <Card className="glass border-white/10 sticky top-24 max-h-[calc(100vh-120px)] flex flex-col shadow-xl">
              <CardHeader className="border-b border-white/5 pb-4 shrink-0">
                <CardTitle className="text-xl mb-4">Player Pool</CardTitle>
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search athletes..." 
                      className="pl-9 bg-black/40 border-white/10 focus-visible:ring-[#00ff88]"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => setRoleFilter('all')}
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${roleFilter === 'all' ? 'bg-white text-black' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
                    >
                      All
                    </button>
                    {['GK', 'DEF', 'MID', 'FWD'].map(role => (
                      <button
                        key={role}
                        onClick={() => setRoleFilter(role)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          roleFilter === role 
                            ? `${ROLE_COLORS[role]} text-white border-none` 
                            : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-y-auto custom-scrollbar flex-1 min-h-[400px]">
                <div className="p-4 space-y-2">
                  {filteredAthletes.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      No athletes found matching criteria.
                    </div>
                  ) : (
                    filteredAthletes.map(athlete => {
                      const isSelected = selectedAthletes.some(a => a.mint === athlete.mint);
                      return (
                        <button
                          key={athlete.mint}
                          onClick={() => !isSelected && handleSelectAthlete(athlete)}
                          disabled={isSelected}
                          className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                            isSelected 
                              ? 'bg-black/20 opacity-50 cursor-not-allowed border border-transparent' 
                              : 'bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center font-bold text-white text-sm border border-white/5">
                              {athlete.name[0]}
                            </div>
                            <div>
                              <p className="font-bold text-white text-sm truncate max-w-[150px]">{athlete.name}</p>
                              <Badge className={`${ROLE_COLORS[ROLE_LABELS[athlete.role]]} text-white border-none text-[10px] px-1.5 py-0`}>
                                {ROLE_LABELS[athlete.role]}
                              </Badge>
                            </div>
                          </div>
                          {isSelected ? (
                            <span className="text-xs font-semibold text-muted-foreground px-2">Added</span>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-[#00ff88] hover:text-black transition-colors">
                              <Plus className="w-4 h-4" />
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

export default dynamic(() => Promise.resolve(ContestDetailPage), { ssr: false });

function ContestDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#00ff88] border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <ContestDetailContent />
    </Suspense>
  );
}