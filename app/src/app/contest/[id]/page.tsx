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
import { WalletButton } from '@/components/wallet-button';
import { connection, ROLE_LABELS, ROLE_COLORS, ROLE_REQUIREMENTS, LINEUP_SIZE, formatTimestamp, formatUSDC } from '@/lib/program/client';
import { toast } from 'sonner';

interface Athlete {
  mint: PublicKey;
  name: string;
  role: number;
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
}

function getAvailableAthletes(): Athlete[] {
  return [
    { mint: new PublicKey('A4B2xZJ8cFZ7Y2vL4NpT9rMk6H8vK3fE6wXy2sAB'), name: 'Erling Haaland', role: 3 },
    { mint: new PublicKey('B5C3yA9dHG8wAL6zM3OpT0sNlO7iH9wL4gF7yB3tCD'), name: 'Kevin De Bruyne', role: 2 },
    { mint: new PublicKey('C6D4zB0eIH9xBM7aN4PqU1tOpP8jK0iI5hH8gC4uDE'), name: 'Mohamed Salah', role: 3 },
    { mint: new PublicKey('D7E5aC1fJI0yCN8bO5QrV2uPqQ9kL1jJ6iI9hD5vEF'), name: 'Virgil van Dijk', role: 1 },
    { mint: new PublicKey('E8F6bD2gJK1zDO9cP6RvW3rRqR0kL2kK7jJ0iE6wFG'), name: 'Alisson Becker', role: 0 },
    { mint: new PublicKey('F9G7cE3hKL2zEO0dQ7SwX4sSrS1lL3mL8kK1jF7xGH'), name: 'Bruno Fernandes', role: 2 },
    { mint: new PublicKey('G0H8dF4iML3zAP1eR8TxY5tSsT2mM4nL9lL2kG8yHI'), name: 'Harry Kane', role: 3 },
    { mint: new PublicKey('H1I9eG5jMN4zBQ2fS9UyZ6uUtU3nN5oM0mM3lH9zIJ'), name: 'Son Heung-min', role: 3 },
    { mint: new PublicKey('J2K0fH6kNN5zCR3gT0VzW7vUvV4oO6pN1oN4kM0zJK'), name: 'Mohamed Amra', role: 1 },
    { mint: new PublicKey('K3L1gI7lOO6zDS4hU1W0X8wWwW5pP7oO2pO5kN1zKL'), name: 'Trent Alexander-Arnold', role: 1 },
    { mint: new PublicKey('L4M2hJ8mPP7zET5iV2X1Y9xXxX6qQ8pP3pP6kO2zLM'), name: 'Robert Lewandowski', role: 3 },
    { mint: new PublicKey('M5N3iK9nQQ8zFU6jW3Y2Z0yYyY7rR9qQ4qQ7lP3zMN'), name: 'Karim Benzema', role: 3 },
    { mint: new PublicKey('N6O4jL0oRR9zGV7kX4Z3A1zZzZ8sS0rR5rR8mQ4zNO'), name: 'Luka Modric', role: 2 },
    { mint: new PublicKey('O7P5kM1pSS0zHW8lY5Z4B2aAaA9tT1sS6sS9nR5zOP'), name: 'Toni Kroos', role: 2 },
    { mint: new PublicKey('P8Q6lN2qTT1zIX9mZ6Z5C3bBbB0uU2tT7tT0oS6zPQ'), name: 'Manuel Neuer', role: 0 },
  ];
}

function getMockContests(): Record<number, ContestData> {
  return {
    1: { id: 1, startTime: Math.floor(Date.now() / 1000) + 86400, status: 0, entryCount: 42, prizePool: BigInt(5000000), winnerCount: 3, prizeSplit: [50, 30, 20], settled: false },
    2: { id: 2, startTime: Math.floor(Date.now() / 1000) - 3600, status: 1, entryCount: 128, prizePool: BigInt(12500000), winnerCount: 5, prizeSplit: [40, 25, 15, 12, 8], settled: false },
  };
}

function ContestDetailContent() {
  const params = useParams();
  const contestId = params?.id ? parseInt(params.id as string) : 1;
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [contest, setContest] = useState<ContestData | null>(null);
  const [selectedAthletes, setSelectedAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableAthletes, setAvailableAthletes] = useState<Athlete[]>([]);

  useEffect(() => {
    setAvailableAthletes(getAvailableAthletes());
  }, []);

  useEffect(() => {
    const contests = getMockContests();
    setContest(contests[contestId] || null);
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
    if (selectedAthletes.some(a => a.mint.equals(athlete.mint))) {
      toast.error('Already in lineup');
      return;
    }
    setSelectedAthletes([...selectedAthletes, athlete]);
  };

  const handleRemoveAthlete = (mint: PublicKey) => {
    setSelectedAthletes(selectedAthletes.filter(a => !a.mint.equals(mint)));
  };

  const handleEnterContest = async () => {
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet');
      return;
    }
    if (!isValidLineup) {
      toast.error('Please complete your lineup');
      return;
    }

    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success('Successfully entered the contest!');
      setSelectedAthletes([]);
    } catch (error) {
      toast.error('Failed to enter contest');
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
                          <div key={athlete.mint.toBase58()} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Badge className={ROLE_COLORS[ROLE_LABELS[athlete.role]]}>
                                {ROLE_LABELS[athlete.role]}
                              </Badge>
                              <span className="font-medium">{athlete.name}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveAthlete(athlete.mint)}>
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
                      const isSelected = selectedAthletes.some(a => a.mint.equals(athlete.mint));
                      return (
                        <button
                          key={athlete.mint.toBase58()}
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