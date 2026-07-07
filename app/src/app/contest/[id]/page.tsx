'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WalletButton } from '@/solana/components/wallet-button';
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

      // Unique mints in lineup
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

      // Step 2: Enter Contest
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

  if (!contest) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Contest not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xl font-bold text-primary-foreground">D</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Dexi</h1>
            </a>
            <nav className="flex items-center gap-6 ml-8">
              <a href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">Dashboard</a>
              <a href="/markets" className="text-sm font-medium text-muted-foreground hover:text-foreground">Markets</a>
              {connected && <a href="/admin" className="text-sm font-medium text-muted-foreground hover:text-foreground">Admin</a>}
            </nav>
          </div>
          <WalletButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!connected ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Card className="max-w-md w-full">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl">Connect Wallet</CardTitle>
                <CardDescription>
                  Connect your wallet to enter the contest
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <Button size="lg" className="w-full rounded-full" onClick={() => setVisible(true)}>
                  Connect Wallet
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : contest.status !== 0 ? (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <a href="/" className="hover:text-foreground">Dashboard</a>
              <span>/</span>
              <span>Contest #{contest.id}</span>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Contest #{contest.id}</CardTitle>
                <CardDescription>
                  {contest.status === 1 ? 'In Progress' : 'Completed'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Entries</p>
                    <p className="text-2xl font-bold">{contest.entryCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Prize Pool</p>
                    <p className="text-2xl font-bold">${formatUSDC(contest.prizePool)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Winners</p>
                    <p className="text-2xl font-bold">Top {contest.winnerCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <a href="/" className="hover:text-foreground">Dashboard</a>
              <span>/</span>
              <span>Contest #{contest.id}</span>
            </div>

            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Contest #{contest.id}</CardTitle>
                    <CardDescription>
                      Starts {formatTimestamp(contest.startTime)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Entries</p>
                        <p className="text-2xl font-bold">{contest.entryCount}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Prize Pool</p>
                        <p className="text-2xl font-bold">${formatUSDC(contest.prizePool)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Winners</p>
                        <p className="text-2xl font-bold">Top {contest.winnerCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Your Lineup</CardTitle>
                    <CardDescription>
                      Select {LINEUP_SIZE} athletes ({selectedAthletes.length}/{LINEUP_SIZE})
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 text-sm">
                        <Badge className={ROLE_COLORS.GK}>GK: {roleCounts.GK}/{ROLE_REQUIREMENTS.GK}</Badge>
                        <Badge className={ROLE_COLORS.DEF}>DEF: {roleCounts.DEF}/{ROLE_REQUIREMENTS.DEF}</Badge>
                        <Badge className={ROLE_COLORS.MID}>MID: {roleCounts.MID}/{ROLE_REQUIREMENTS.MID}</Badge>
                        <Badge className={ROLE_COLORS.FWD}>FWD: {roleCounts.FWD}/{ROLE_REQUIREMENTS.FWD}</Badge>
                      </div>

                      <div className="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                        {selectedAthletes.map((athlete) => (
                          <div key={athlete.mint} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Badge className={ROLE_COLORS[ROLE_LABELS[athlete.role]]}>
                                {ROLE_LABELS[athlete.role]}
                              </Badge>
                              <span className="font-medium">{athlete.name}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeAthlete(athlete.mint)}>
                              ×
                            </Button>
                          </div>
                        ))}
                        {selectedAthletes.length === 0 && (
                          <p className="text-muted-foreground col-span-3 text-center py-4">
                            Select athletes from the pool below
                          </p>
                        )}
                      </div>

                      {roleErrors.length > 0 && (
                        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                          {roleErrors.join(', ')}
                        </div>
                      )}

                      <Button 
                        className="w-full" 
                        size="lg"
                        onClick={handleEnterContest}
                        disabled={loading || !isValidLineup}
                      >
                        {loading ? 'Entering Contest...' : 'Enter Contest'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="w-[400px]">
                <CardHeader>
                  <CardTitle>Athlete Pool</CardTitle>
                  <CardDescription>
                    Select athletes for your lineup
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {availableAthletes.map((athlete) => {
                    const isSelected = selectedAthletes.some(a => a.mint === athlete.mint);
                      return (
                        <button
                          key={athlete.mint}
                          onClick={() => !isSelected && handleSelectAthlete(athlete)}
                          disabled={isSelected}
                          className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-left"
                        >
                          <div className="flex items-center gap-3">
                            <Badge className={ROLE_COLORS[ROLE_LABELS[athlete.role]]}>
                              {ROLE_LABELS[athlete.role]}
                            </Badge>
                            <span className="font-medium">{athlete.name}</span>
                          </div>
                          {isSelected && <Badge variant="secondary">Selected</Badge>}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default dynamic(() => Promise.resolve(ContestDetailPage), { ssr: false });

function ContestDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Loading...</p>
      </div>
    }>
      <ContestDetailContent />
    </Suspense>
  );
}