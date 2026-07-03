'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Connection } from '@solana/web3.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WalletButton } from '@/components/wallet-button';
import { connection, ROLE_LABELS, ROLE_COLORS, RPC_URL, getConfigPda } from '@/lib/program/client';
import { toast } from 'sonner';

const ADMIN_WALLET_ADDRESS = '4bEzGK4DWA2s5RXqK3z3D3Y7JZJqC7yK9P8x3W2Q5tR';

interface PoolData {
  mint: PublicKey;
  name: string;
  role: number;
  enabled: boolean;
}

interface ContestData {
  id: number;
  startTime: number;
  status: string;
  entryCount: number;
  prizePool: number;
  winnerCount: number;
}

function getMockPools(): PoolData[] {
  return [
    { mint: new PublicKey('A4B2xZJ8cFZ7Y2vL4NpT9rMk6H8vK3fE6wXy2sAB'), name: 'Erling Haaland', role: 3, enabled: true },
    { mint: new PublicKey('B5C3yA9dHG8wAL6zM3OpT0sNlO7iH9wL4gF7yB3tCD'), name: 'Kevin De Bruyne', role: 2, enabled: true },
    { mint: new PublicKey('C6D4zB0eIH9xBM7aN4PqU1tOpP8jK0iI5hH8gC4uDE'), name: 'Mohamed Salah', role: 3, enabled: true },
  ];
}

function getMockContests(): ContestData[] {
  return [
    { id: 1, startTime: Date.now() / 1000 + 86400, status: 'Open', entryCount: 42, prizePool: 5000, winnerCount: 3 },
    { id: 2, startTime: Date.now() / 1000 - 3600, status: 'Locked', entryCount: 128, prizePool: 12500, winnerCount: 5 },
  ];
}

function AdminPage() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [pools, setPools] = useState<PoolData[]>(getMockPools());
  const [contests, setContests] = useState<ContestData[]>(getMockContests());
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [newPoolMint, setNewPoolMint] = useState('');
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolRole, setNewPoolRole] = useState<string>('3');
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  
  const handlePoolRoleChange = (value: string | null) => {
    if (value) setNewPoolRole(value);
  };
  
  const [newContestStartTime, setNewContestStartTime] = useState('');
  const [newContestWinnerCount, setNewContestWinnerCount] = useState('3');
  const [newContestPrizeSplit, setNewContestPrizeSplit] = useState('50,30,20');
  const [contestDialogOpen, setContestDialogOpen] = useState(false);
  
  const handleWinnerCountChange = (value: string | null) => {
    if (value) setNewContestWinnerCount(value);
  };

  useEffect(() => {
    if (connected && publicKey) {
      const adminKey = new PublicKey(ADMIN_WALLET_ADDRESS);
      setIsAdmin(publicKey.equals(adminKey));
    }
  }, [connected, publicKey]);

  const handleCreatePool = async () => {
    if (!newPoolMint || !newPoolName) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const newPool: PoolData = {
        mint: new PublicKey(newPoolMint),
        name: newPoolName,
        role: parseInt(newPoolRole),
        enabled: true,
      };
      setPools([...pools, newPool]);
      toast.success(`Pool created for ${newPoolName}!`);
      setNewPoolMint('');
      setNewPoolName('');
      setNewPoolRole('3');
    } catch (error) {
      toast.error('Failed to create pool');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContest = async () => {
    if (!newContestStartTime || !newContestWinnerCount || !newContestPrizeSplit) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const newContest: ContestData = {
        id: contests.length + 1,
        startTime: Math.floor(new Date(newContestStartTime).getTime() / 1000),
        status: 'Open',
        entryCount: 0,
        prizePool: 0,
        winnerCount: parseInt(newContestWinnerCount),
      };
      setContests([...contests, newContest]);
      toast.success(`Contest #${newContest.id} created!`);
      setNewContestStartTime('');
      setNewContestWinnerCount('3');
      setNewContestPrizeSplit('50,30,20');
    } catch (error) {
      toast.error('Failed to create contest');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePool = async (mint: PublicKey) => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setPools(pools.map(p => 
        p.mint.equals(mint) ? { ...p, enabled: !p.enabled } : p
      ));
      toast.success('Pool updated');
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
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
              </nav>
            </div>
            <WalletButton />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Card className="max-w-md w-full">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl">Connect Wallet</CardTitle>
                <CardDescription>
                  Connect your wallet to access the admin panel
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <Button size="lg" className="w-full rounded-full" onClick={() => setVisible(true)}>
                  Connect Wallet
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
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
              </nav>
            </div>
            <WalletButton />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Card className="max-w-md w-full">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl">Access Denied</CardTitle>
                <CardDescription>
                  Only the admin wallet can access this page
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Your wallet: {publicKey?.toBase58().slice(0, 8)}...
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
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
              <a href="/admin" className="text-sm font-medium text-foreground">Admin</a>
            </nav>
          </div>
          <WalletButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Admin Panel</h2>
            <p className="text-muted-foreground">
              Manage pools, contests, and protocol settings
            </p>
          </div>

          <Tabs defaultValue="pools" className="space-y-4">
            <TabsList>
              <TabsTrigger value="pools">Pools</TabsTrigger>
              <TabsTrigger value="contests">Contests</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="pools" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={poolDialogOpen} onOpenChange={setPoolDialogOpen}>
                  <DialogTrigger>
                    <Button onClick={() => setPoolDialogOpen(true)}>Create Pool</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Pool</DialogTitle>
                      <DialogDescription>
                        Create a new athlete token pool for trading
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Mint Address</Label>
                        <Input
                          placeholder="Enter token mint address"
                          value={newPoolMint}
                          onChange={(e) => setNewPoolMint(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Athlete Name</Label>
                        <Input
                          placeholder="Enter athlete name"
                          value={newPoolName}
                          onChange={(e) => setNewPoolName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={newPoolRole} onValueChange={handlePoolRoleChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Goalkeeper</SelectItem>
                            <SelectItem value="1">Defender</SelectItem>
                            <SelectItem value="2">Midfielder</SelectItem>
                            <SelectItem value="3">Forward</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button className="w-full" onClick={handleCreatePool} disabled={loading}>
                        {loading ? 'Creating...' : 'Create Pool'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pools.map((pool) => (
                  <Card key={pool.mint.toBase58()}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Badge className={ROLE_COLORS[ROLE_LABELS[pool.role]]}>
                          {ROLE_LABELS[pool.role]}
                        </Badge>
                        <Button 
                          variant={pool.enabled ? 'destructive' : 'outline'} 
                          size="sm"
                          onClick={() => handleTogglePool(pool.mint)}
                        >
                          {pool.enabled ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                      <CardTitle className="text-lg">{pool.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {pool.mint.toBase58().slice(0, 12)}...
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="contests" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={contestDialogOpen} onOpenChange={setContestDialogOpen}>
                  <DialogTrigger>
                    <Button onClick={() => setContestDialogOpen(true)}>Create Contest</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Contest</DialogTitle>
                      <DialogDescription>
                        Set up a new fantasy sports contest
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Start Time</Label>
                        <Input
                          type="datetime-local"
                          value={newContestStartTime}
                          onChange={(e) => setNewContestStartTime(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Winner Count</Label>
                        <Select value={newContestWinnerCount} onValueChange={handleWinnerCountChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">Top 3</SelectItem>
                            <SelectItem value="5">Top 5</SelectItem>
                            <SelectItem value="10">Top 10</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Prize Split (comma separated)</Label>
                        <Input
                          placeholder="50,30,20"
                          value={newContestPrizeSplit}
                          onChange={(e) => setNewContestPrizeSplit(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Example: 50,30,20 means 1st gets 50%, 2nd gets 30%, 3rd gets 20%
                        </p>
                      </div>
                      <Button className="w-full" onClick={handleCreateContest} disabled={loading}>
                        {loading ? 'Creating...' : 'Create Contest'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Active Contests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {contests.map((contest) => (
                      <div key={contest.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">Contest #{contest.id}</p>
                          <p className="text-sm text-muted-foreground">
                            Start: {new Date(contest.startTime * 1000).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge>{contest.status}</Badge>
                          <p className="text-sm text-muted-foreground mt-1">
                            {contest.entryCount} entries
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Protocol Settings</CardTitle>
                  <CardDescription>
                    Configure global protocol parameters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Swap Fee</p>
                      <p className="text-sm text-muted-foreground">Fee charged on each trade</p>
                    </div>
                    <p className="font-bold">0.3%</p>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">USDC Mint</p>
                      <p className="text-sm text-muted-foreground">Token used for trading</p>
                    </div>
                    <p className="text-sm">EPjFWdd5AufqSSqeM2qNDbThKcE9Mvo2F4r2N5mZBqS</p>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Keeper</p>
                      <p className="text-sm text-muted-foreground">Automated bot address</p>
                    </div>
                    <p className="text-sm">...K33r</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

export default dynamic(() => Promise.resolve(AdminPage), { ssr: false });