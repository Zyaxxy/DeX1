'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { WalletButton } from '@/solana/components/wallet-button';
import { formatUSDC, formatTimestamp, CONTEST_STATUS_LABELS, getStatusLabel, rpc, PROGRAM_ID } from '@/solana/client';
import { decodeContest, CONTEST_DISCRIMINATOR, ContestStatus } from '@dexi/sdk';
import { getBase58Decoder } from '@solana/kit';
import { Trophy, Timer, Users, Wallet, ChevronRight, Activity, CircleDollarSign } from 'lucide-react';

interface ContestData {
  id: number;
  startTime: number;
  status: number;
  entryCount: number;
  prizePool: bigint;
  winnerCount: number;
}

export default function Home() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [contests, setContests] = useState<ContestData[]>([]);

  useEffect(() => {
    async function fetchContests() {
      try {
        const response = await rpc.getProgramAccounts(PROGRAM_ID.toBase58() as any, {
          filters: [
            { memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(CONTEST_DISCRIMINATOR) as any } }
          ]
        }).send();
        
        const formattedContests = response.map((account) => {
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
          };
        });
        
        // Sort by ID descending
        formattedContests.sort((a, b) => b.id - a.id);
        setContests(formattedContests);
      } catch (err) {
        console.error("Failed to fetch contests:", err);
      }
    }
    
    fetchContests();
  }, []);

  return (
    <div className="min-h-screen bg-background selection:bg-primary/30">
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
                <span className="text-xl font-black text-primary-foreground italic">D</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight italic">DEXI</h1>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/" className="px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-bold">Dashboard</Link>
              <Link href="/markets" className="px-4 py-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground text-sm font-medium transition-colors">Markets</Link>
            </nav>
          </div>
          <WalletButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {!connected ? (
          <div className="flex flex-col items-center justify-center py-12 md:py-20 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="relative w-full max-w-4xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-2xl shadow-primary/20">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay"></div>
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-black/10 rounded-full blur-3xl"></div>
              
              <div className="relative z-10 px-6 py-16 md:px-12 md:py-24 text-center space-y-8">
                <Badge variant="secondary" className="mb-4 bg-white/20 text-white hover:bg-white/30 border-none px-4 py-1.5 text-sm font-semibold backdrop-blur-md">
                  <Trophy className="w-4 h-4 mr-2 inline" />
                  The #1 Fantasy Web3 Platform
                </Badge>
                <h2 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1]">
                  Build Your<br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">Dream Lineup</span>
                </h2>
                <p className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mx-auto font-medium">
                  Compete with thousands of players. Draft athlete tokens, score points, and win USDC prizes instantly on Solana.
                </p>
                <div className="pt-6">
                  <Button size="lg" className="rounded-full bg-white text-primary hover:bg-white/90 font-bold text-lg px-8 py-7 h-auto shadow-xl transition-all hover:scale-105 hover:shadow-2xl" onClick={() => setVisible(true)}>
                    <Wallet className="mr-3 h-6 w-6" /> Connect Wallet to Play
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 w-full max-w-5xl">
              {[
                { title: 'Draft Teams', desc: 'Select top athletes within your salary cap.', icon: Users },
                { title: 'Score Points', desc: 'Real-world performance turns into points.', icon: Activity },
                { title: 'Win Crypto', desc: 'Top the leaderboards and earn USDC.', icon: CircleDollarSign },
              ].map((feature, i) => (
                <div key={i} className="bg-card border border-border/50 rounded-3xl p-6 text-center space-y-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-14 h-14 mx-auto bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                    <feature.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-card/50 border border-border/50 p-6 rounded-3xl backdrop-blur-sm">
              <div className="space-y-1">
                <h2 className="text-3xl font-black tracking-tight">Dashboard</h2>
                <p className="text-muted-foreground font-medium">
                  Welcome back! Ready to dominate the leaderboards?
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/markets">
                  <Button variant="outline" className="rounded-full font-bold h-11 px-6 border-border/60 hover:bg-muted">Trade Tokens</Button>
                </Link>
                <Link href="/admin">
                  <Button className="rounded-full font-bold h-11 px-6 shadow-md hover:shadow-lg transition-all">Admin Panel</Button>
                </Link>
              </div>
            </div>

            <Tabs defaultValue="all" className="space-y-6">
              <div className="px-2 border-b border-border/40">
                <TabsList className="w-full justify-start rounded-none bg-transparent p-0 h-auto gap-6 sm:gap-8 overflow-x-auto no-scrollbar flex-nowrap">
                  <TabsTrigger value="all" className="relative h-12 rounded-none border-b-2 border-b-transparent bg-transparent px-1 pb-3 pt-2 font-bold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none hover:text-foreground whitespace-nowrap">All Contests</TabsTrigger>
                  <TabsTrigger value="active" className="relative h-12 rounded-none border-b-2 border-b-transparent bg-transparent px-1 pb-3 pt-2 font-bold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none hover:text-foreground whitespace-nowrap">Active</TabsTrigger>
                  <TabsTrigger value="entered" className="relative h-12 rounded-none border-b-2 border-b-transparent bg-transparent px-1 pb-3 pt-2 font-bold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none hover:text-foreground whitespace-nowrap">My Entries</TabsTrigger>
                  <TabsTrigger value="closed" className="relative h-12 rounded-none border-b-2 border-b-transparent bg-transparent px-1 pb-3 pt-2 font-bold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none hover:text-foreground whitespace-nowrap">Closed</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="all" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-6">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {contests.map((contest) => (
                    <Link key={contest.id} href={`/contest/${contest.id}`} className="block focus-visible:outline-none">
                      <Card className="overflow-hidden hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full border-border/60 bg-card backdrop-blur-sm group">
                        <CardHeader className="pb-3 border-b border-border/40 bg-muted/30">
                          <div className="flex items-center justify-between mb-3">
                            <Badge className={contest.status === 0 ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20' : contest.status === 1 ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'} variant="outline">
                              <span className="flex items-center gap-1.5 font-bold">
                                {contest.status === 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>}
                                {getStatusLabel(contest.status)}
                              </span>
                            </Badge>
                            <span className="text-xs font-bold font-mono text-muted-foreground bg-muted px-2 py-1 rounded-md">
                              #{contest.id}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mt-3">
                            <div className="flex flex-col">
                              <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1">Matchday</span>
                              <CardTitle className="text-2xl font-black group-hover:text-primary transition-colors">{contest.id}</CardTitle>
                            </div>
                            <div className="flex flex-col items-end text-right bg-background/80 px-3 py-1.5 rounded-xl border border-border/40">
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-bold uppercase tracking-wider mb-0.5">
                                <Timer className="w-3 h-3" /> Starts In
                              </span>
                              <span className="text-sm font-black text-foreground">
                                {formatTimestamp(contest.startTime)}
                              </span>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-5 pb-0 space-y-5">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                                <Trophy className="w-6 h-6 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Prize Pool</p>
                                <p className="text-xl font-black">${formatUSDC(contest.prizePool)}</p>
                              </div>
                            </div>
                            <div className="text-right">
                               <p className="text-xs text-muted-foreground flex items-center justify-end gap-1 font-semibold uppercase tracking-wider mb-0.5"><Users className="w-3 h-3"/> Entries</p>
                               <p className="text-lg font-bold">{contest.entryCount}</p>
                            </div>
                          </div>
                          
                          <div className="px-1 bg-muted/20 p-3 rounded-2xl border border-border/40">
                            <div className="flex justify-between text-xs mb-2">
                               <span className="text-muted-foreground font-medium"><span className="text-foreground font-bold">{contest.winnerCount}</span> Winners</span>
                               <span className="text-primary font-bold flex items-center gap-1"><CircleDollarSign className="w-3 h-3"/> Guaranteed</span>
                            </div>
                            {/* Fake progress bar to make it look active */}
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, Math.max(5, (contest.entryCount / 100) * 100))}%` }}></div>
                            </div>
                          </div>
                        </CardContent>
                        <div className="p-5 pt-4 mt-auto">
                           <Button className="w-full rounded-xl font-bold h-12 shadow-sm group-hover:shadow-primary/25 transition-all flex items-center justify-center gap-2 text-md" variant={contest.status === 0 ? 'default' : 'secondary'}>
                             {contest.status === 0 ? 'Join Contest' : 'View Details'}
                             <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity group-hover:translate-x-1 duration-300" />
                           </Button>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="active">
                <Card className="rounded-3xl border-border/50 overflow-hidden">
                  <CardHeader className="bg-muted/30 border-b border-border/40 pb-6">
                    <CardTitle className="text-2xl font-black">Active Contests</CardTitle>
                    <CardDescription className="text-base font-medium">
                      Contests that are currently accepting entries
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="font-bold uppercase tracking-wider text-xs">Match</TableHead>
                          <TableHead className="font-bold uppercase tracking-wider text-xs">Start Time</TableHead>
                          <TableHead className="font-bold uppercase tracking-wider text-xs text-right">Entries</TableHead>
                          <TableHead className="font-bold uppercase tracking-wider text-xs text-right">Prize Pool</TableHead>
                          <TableHead className="font-bold uppercase tracking-wider text-xs text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contests.filter(c => c.status === 0 || c.status === 1).map((contest) => (
                          <TableRow key={contest.id} className="group">
                            <TableCell className="font-black text-base">#{contest.id}</TableCell>
                            <TableCell className="font-medium text-muted-foreground">{formatTimestamp(contest.startTime)}</TableCell>
                            <TableCell className="text-right font-bold">{contest.entryCount}</TableCell>
                            <TableCell className="text-right font-black text-primary">${formatUSDC(contest.prizePool)}</TableCell>
                            <TableCell className="text-right">
                              <Link href={`/contest/${contest.id}`}>
                                <Button size="sm" className="rounded-full font-bold px-6" variant={contest.status === 0 ? 'default' : 'secondary'}>
                                  {contest.status === 0 ? 'Enter' : 'View'}
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="entered">
                <Card className="rounded-3xl border-border/50 border-dashed bg-card/30">
                  <CardContent className="flex flex-col items-center justify-center text-center py-24 space-y-4">
                    <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Trophy className="w-10 h-10 text-muted-foreground/50" />
                    </div>
                    <CardTitle className="text-2xl font-black">No Entries Yet</CardTitle>
                    <p className="text-muted-foreground font-medium max-w-md mx-auto">
                      You haven't entered any contests. Go to "All Contests" to draft your first lineup and start winning!
                    </p>
                    <Button variant="outline" className="rounded-full mt-4 font-bold border-border/60">
                      Browse Contests
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="closed">
                <Card className="rounded-3xl border-border/50 overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
                  <CardHeader className="bg-muted/30 border-b border-border/40">
                    <CardTitle className="text-2xl font-black">Closed Contests</CardTitle>
                    <CardDescription className="font-medium">
                      Past contests with settled prizes
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="font-bold uppercase tracking-wider text-xs">Match</TableHead>
                          <TableHead className="font-bold uppercase tracking-wider text-xs">Status</TableHead>
                          <TableHead className="font-bold uppercase tracking-wider text-xs">Rank</TableHead>
                          <TableHead className="font-bold uppercase tracking-wider text-xs text-right">Prize Won</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contests.filter(c => c.status === 2).map((contest) => (
                          <TableRow key={contest.id}>
                            <TableCell className="font-black">
                              <Link href={`/contest/${contest.id}`} className="hover:text-primary transition-colors">
                                #{contest.id}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="bg-muted font-bold text-muted-foreground">Settled</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground font-medium">-</TableCell>
                            <TableCell className="text-right text-muted-foreground font-medium">-</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
}