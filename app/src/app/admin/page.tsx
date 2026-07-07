'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { WalletButton } from '@/solana/components/wallet-button';
import { ROLE_LABELS, ROLE_COLORS, rpc, PROGRAM_ID, connection } from '@/solana/client';
import { toast } from 'sonner';

import { decodeAthletePool, ATHLETE_POOL_DISCRIMINATOR, decodeContest, CONTEST_DISCRIMINATOR, ContestStatus, AthleteRole } from '@dexi/sdk';
import { getBase58Decoder } from '@solana/kit';

const ADMIN_WALLET_ADDRESS = '9VyhrVM1SessmR92Cz2CwrM2wFP4egbjCAP69yv2Tb9N';

interface PoolData {
  mint: string;
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

function AdminPage() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [pools, setPools] = useState<PoolData[]>([]);
  const [contests, setContests] = useState<ContestData[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [poolAccounts, contestAccounts] = await Promise.all([
          rpc.getProgramAccounts(PROGRAM_ID.toBase58() as any, {
            filters: [{ memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(ATHLETE_POOL_DISCRIMINATOR) as any } }]
          }).send(),
          rpc.getProgramAccounts(PROGRAM_ID.toBase58() as any, {
            filters: [{ memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(CONTEST_DISCRIMINATOR) as any } }]
          }).send()
        ]);
        
        setPools(poolAccounts.map(account => {
          const decoded = decodeAthletePool({
            address: account.pubkey,
            data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
            exists: true,
          } as any).data;

          return {
            mint: decoded.mint.toString(),
            name: decoded.name,
            role: decoded.role,
            enabled: decoded.enabled
          };
        }));

        setContests(contestAccounts.map(account => {
          const decoded = decodeContest({
            address: account.pubkey,
            data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
            exists: true,
          } as any).data;

          let statusStr = 'Open';
          if (decoded.status === ContestStatus.Locked) statusStr = 'Locked';
          else if (decoded.status === ContestStatus.Settled) statusStr = 'Settled';

          return {
            id: Number(decoded.id),
            startTime: Number(decoded.startTime),
            status: statusStr,
            entryCount: Number(decoded.entryCount),
            prizePool: Number(decoded.prizePool),
            winnerCount: decoded.winnerCount
          };
        }).sort((a, b) => b.id - a.id));

      } catch (err) {
        console.error("Failed to fetch admin data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);
  
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
      setIsAdmin(publicKey.toBase58() === ADMIN_WALLET_ADDRESS);
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
        mint: newPoolMint,
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

    if (!signTransaction || !publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    setLoading(true);
    try {
      const { AddressLookupTableProgram, TransactionMessage, VersionedTransaction, SystemProgram, Transaction, TransactionInstruction } = await import('@solana/web3.js');
      const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
      const { getCreateContestInstruction, findConfigPda, findContestPda, decodeAdminConfig } = await import('@dexi/sdk');

      const adminKey = new PublicKey(publicKey.toString());
      const newId = contests.length > 0 ? Math.max(...contests.map(c => c.id)) + 1 : 1;
      const startTimeNum = Math.floor(new Date(newContestStartTime).getTime() / 1000);
      const winnerCountNum = parseInt(newContestWinnerCount);
      const prizeSplitArr = newContestPrizeSplit.split(',').map(s => parseInt(s.trim()) * 100);

      const [configPda] = await findConfigPda();
      const configInfo = await connection.getAccountInfo(new PublicKey(configPda));
      const configData = decodeAdminConfig({
        address: configPda,
        data: new Uint8Array(Buffer.from(configInfo!.data)),
        exists: true
      } as any).data;
      
      const usdcMint = new PublicKey(configData.usdcMint);
      const [contestPda] = await findContestPda({ id: newId });
      const contestKey = new PublicKey(contestPda);
      const escrowVault = getAssociatedTokenAddressSync(usdcMint, contestKey, true);

      // We need to create the escrow vault ATA if it doesn't exist
      const escrowInfo = await connection.getAccountInfo(escrowVault);
      if (!escrowInfo) {
        toast.info('Creating USDC escrow vault...');
        const createAtaIx = createAssociatedTokenAccountInstruction(
          adminKey,
          escrowVault,
          contestKey,
          usdcMint
        );
        const { blockhash } = await connection.getLatestBlockhash();
        const msg = new TransactionMessage({
          payerKey: adminKey,
          recentBlockhash: blockhash,
          instructions: [createAtaIx],
        }).compileToV0Message();
        const tx = new VersionedTransaction(msg);
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, 'confirmed');
      }

      // 1. Create ALT
      toast.info('Creating Contest Lookup Table (Transaction 1/3)...');
      const slot = await connection.getSlot();
      const [createIx, lutAddress] = AddressLookupTableProgram.createLookupTable({
        authority: adminKey,
        payer: adminKey,
        recentSlot: Math.max(slot - 10, 0),
      });

      const { blockhash: lutBlockhash } = await connection.getLatestBlockhash();
      const lutMsg = new TransactionMessage({
        payerKey: adminKey,
        recentBlockhash: lutBlockhash,
        instructions: [createIx],
      }).compileToV0Message();
      
      const lutTx = new VersionedTransaction(lutMsg);
      const signedLutTx = await signTransaction(lutTx);
      const lutSig = await connection.sendRawTransaction(signedLutTx.serialize());
      await connection.confirmTransaction(lutSig, 'confirmed');

      // 2. Extend ALT with all enabled pools
      toast.info('Populating Lookup Table (Transaction 2/3)...');
      const enabledPools = pools.filter(p => p.enabled);
      const staticAddresses: PublicKey[] = [
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // Token Program
        SystemProgram.programId,
        new PublicKey(configPda),
        contestKey,
        adminKey,
        escrowVault,
      ];

      const playerMints = [];
      const remainingAccounts = [];

      for (const p of enabledPools) {
        const mintKey = new PublicKey(p.mint);
        playerMints.push(mintKey.toBase58());
        const poolKey = new PublicKey(
          PublicKey.findProgramAddressSync([Buffer.from('pool'), mintKey.toBuffer()], PROGRAM_ID)[0]
        );
        const vault = getAssociatedTokenAddressSync(mintKey, contestKey, true);
        staticAddresses.push(mintKey, vault, poolKey);

        remainingAccounts.push(
          { pubkey: vault, isWritable: true, isSigner: false },
          { pubkey: mintKey, isWritable: false, isSigner: false }
        );
      }

      // Note: If addresses > 30, we'd need to chunk this. Assuming small test set here.
      const extendIx = AddressLookupTableProgram.extendLookupTable({
        payer: adminKey,
        authority: adminKey,
        lookupTable: lutAddress,
        addresses: staticAddresses,
      });

      const { blockhash: extBlockhash } = await connection.getLatestBlockhash();
      const extMsg = new TransactionMessage({
        payerKey: adminKey,
        recentBlockhash: extBlockhash,
        instructions: [extendIx],
      }).compileToV0Message();
      
      const extTx = new VersionedTransaction(extMsg);
      const signedExtTx = await signTransaction(extTx);
      const extSig = await connection.sendRawTransaction(signedExtTx.serialize());
      await connection.confirmTransaction(extSig, 'confirmed');

      toast.info('Waiting for Lookup Table to activate...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 3. Create Contest
      toast.info('Deploying Contest (Transaction 3/3)...');
      
      const createIxFixed = getCreateContestInstruction({
        id: newId,
        startTime: startTimeNum as any,
        winnerCount: winnerCountNum,
        prizeSplit: prizeSplitArr,
        playerMints: playerMints as any[],
        addressLookupTable: lutAddress.toBase58() as any,
        config: configPda.toString() as any,
        contest: contestKey.toBase58() as any,
        usdcMint: usdcMint.toBase58() as any,
        escrowVault: escrowVault.toBase58() as any,
        admin: adminKey.toBase58() as any,
      });

      const instruction = new TransactionInstruction({
        programId: new PublicKey(createIxFixed.programAddress),
        keys: [...createIxFixed.accounts.map(a => ({
          pubkey: new PublicKey(a.address),
          isSigner: a.role >= 2,
          isWritable: a.role === 1 || a.role === 3,
        })), ...remainingAccounts],
        data: Buffer.from(createIxFixed.data)
      });

      const { blockhash: contestBlockhash } = await connection.getLatestBlockhash();
      const contestMsg = new TransactionMessage({
        payerKey: adminKey,
        recentBlockhash: contestBlockhash,
        instructions: [instruction],
      }).compileToV0Message();
      
      const contestTx = new VersionedTransaction(contestMsg);
      const signedContestTx = await signTransaction(contestTx);
      const contestSig = await connection.sendRawTransaction(signedContestTx.serialize());
      await connection.confirmTransaction(contestSig, 'confirmed');

      const newContest: ContestData = {
        id: newId,
        startTime: startTimeNum,
        status: 'Open',
        entryCount: 0,
        prizePool: 0,
        winnerCount: winnerCountNum,
      };
      setContests([newContest, ...contests]);
      toast.success(`Contest #${newId} created!`);
      setNewContestStartTime('');
    } catch (error) {
      console.error(error);
      toast.error('Failed to create contest');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePool = async (mint: string) => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setPools(pools.map(p => 
        p.mint === mint ? { ...p, enabled: !p.enabled } : p
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
                  <DialogTrigger render={<Button onClick={() => setPoolDialogOpen(true)} />}>
                    Create Pool
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
                  <Card key={pool.mint}>
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
                      <span className="font-mono text-sm">
                        {pool.mint.slice(0, 12)}...
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="contests" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={contestDialogOpen} onOpenChange={setContestDialogOpen}>
                  <DialogTrigger render={<Button onClick={() => setContestDialogOpen(true)} />}>
                    Create Contest
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