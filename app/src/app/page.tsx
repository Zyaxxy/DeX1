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
import { WalletButton } from '@/components/wallet-button';
import { formatUSDC, formatTimestamp, CONTEST_STATUS_LABELS, getStatusLabel } from '@/lib/program/client';

interface ContestData {
  id: number;
  startTime: number;
  status: number;
  entryCount: number;
  prizePool: bigint;
  winnerCount: number;
}

function getMockContests(): ContestData[] {
  return [
    { id: 1, startTime: Math.floor(Date.now() / 1000) + 86400, status: 0, entryCount: 42, prizePool: BigInt(5000000), winnerCount: 3 },
    { id: 2, startTime: Math.floor(Date.now() / 1000) - 3600, status: 1, entryCount: 128, prizePool: BigInt(12500000), winnerCount: 5 },
    { id: 3, startTime: Math.floor(Date.now() / 1000) - 86400, status: 2, entryCount: 256, prizePool: BigInt(25000000), winnerCount: 10 },
  ];
}

export default function Home() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [contests, setContests] = useState<ContestData[]>(getMockContests());

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xl font-bold text-primary-foreground">D</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Dexi</h1>
            </Link>
            <nav className="flex items-center gap-6 ml-8">
              <Link href="/" className="text-sm font-medium text-foreground">Dashboard</Link>
              <Link href="/markets" className="text-sm font-medium text-muted-foreground hover:text-foreground">Markets</Link>
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
                <CardTitle className="text-3xl">Welcome to Dexi</CardTitle>
                <CardDescription>
                  Fantasy football meets DeFi on Solana
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Build your dream lineup of athlete tokens, compete for USDC prizes, 
                  and trade your athletes on the market.
                </p>
                <Button size="lg" className="w-full rounded-full" onClick={() => setVisible(true)}>
                  Connect Wallet to Get Started
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <p className="text-muted-foreground">
                  Welcome back! Here are your contests.
                </p>
              </div>
              <div className="flex gap-2">
                <Link href="/markets">
                  <Button variant="outline">Trade Tokens</Button>
                </Link>
                <Link href="/admin">
                  <Button>Admin Panel</Button>
                </Link>
              </div>
            </div>

            <Tabs defaultValue="all" className="space-y-4">
              <TabsList>
                <TabsTrigger value="all">All Contests</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="entered">My Entries</TabsTrigger>
                <TabsTrigger value="closed">Closed</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {contests.map((contest) => (
                    <Link key={contest.id} href={`/contest/${contest.id}`}>
                      <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer h-full">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <Badge className={contest.status === 0 ? 'bg-green-500' : contest.status === 1 ? 'bg-yellow-500' : 'bg-blue-500'}>
                              {getStatusLabel(contest.status)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              #{contest.id}
                            </span>
                          </div>
                          <CardTitle className="text-xl">
                            Matchday {contest.id}
                          </CardTitle>
                          <CardDescription>
                            {formatTimestamp(contest.startTime)}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Entries</p>
                              <p className="text-lg font-semibold">{contest.entryCount}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Prize Pool</p>
                              <p className="text-lg font-semibold">${formatUSDC(contest.prizePool)}</p>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Top {contest.winnerCount} winners split the prize pool
                          </div>
                          <Button className="w-full" variant={contest.status === 0 ? 'default' : 'outline'}>
                            {contest.status === 0 ? 'Enter Contest' : 'View Details'}
                          </Button>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="active">
                <Card>
                  <CardHeader>
                    <CardTitle>Active Contests</CardTitle>
                    <CardDescription>
                      Contests that are currently accepting entries
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Start Time</TableHead>
                          <TableHead>Entries</TableHead>
                          <TableHead>Prize Pool</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contests.filter(c => c.status === 0 || c.status === 1).map((contest) => (
                          <TableRow key={contest.id}>
                            <TableCell className="font-medium">#{contest.id}</TableCell>
                            <TableCell>{formatTimestamp(contest.startTime)}</TableCell>
                            <TableCell>{contest.entryCount}</TableCell>
                            <TableCell>${formatUSDC(contest.prizePool)}</TableCell>
                            <TableCell>
                              <Link href={`/contest/${contest.id}`}>
                                <Button size="sm" variant={contest.status === 0 ? 'default' : 'outline'}>
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
                <Card>
                  <CardHeader>
                    <CardTitle>My Entries</CardTitle>
                    <CardDescription>
                      Your submitted lineups
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-center py-8">
                      You haven't entered any contests yet.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="closed">
                <Card>
                  <CardHeader>
                    <CardTitle>Closed Contests</CardTitle>
                    <CardDescription>
                      Past contests with settled prizes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Result</TableHead>
                          <TableHead>Rank</TableHead>
                          <TableHead>Prize Won</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contests.filter(c => c.status === 2).map((contest) => (
                          <TableRow key={contest.id}>
                            <TableCell className="font-medium">
                              <Link href={`/contest/${contest.id}`} className="hover:underline">
                                #{contest.id}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">Completed</Badge>
                            </TableCell>
                            <TableCell>#-</TableCell>
                            <TableCell>-</TableCell>
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