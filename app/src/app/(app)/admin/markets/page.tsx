'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, createMintToInstruction } from '@solana/spl-token';
import { getCreatePoolInstruction, findConfigPda, decodeAdminConfig, getUpdatePoolInstruction } from '@dexi/sdk';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getConnection, ROLE_LABELS, ROLE_COLORS, getAdminKeypair, PROGRAM_ID } from '@/solana/client';
import { toast } from 'sonner';
import { Search, Loader2 } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import type { PoolData } from '../types';
import { ROLE_FILTERS } from '../types';
import { fetchPools } from '../data';

function Markets() {
  const adminKeypair = getAdminKeypair();
  const publicKey = adminKeypair.publicKey;

  useRevolvingTitle(['Markets | DEXI', 'Admin | DEXI']);
  usePageMeta({
    title: 'Markets | DEXI',
    description: 'Manage athlete token trading pools — create, enable, disable, and configure markets.',
    ogTitle: 'Markets — DEXI',
    ogDescription: 'Manage athlete token trading pools.',
  });

  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchPools().then(setPools).catch(err => console.error("Failed to fetch pools:", err)).finally(() => setLoading(false));
  }, []);

  const [marketSearch, setMarketSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const filteredPools = useMemo(() => {
    return pools.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(marketSearch.toLowerCase()) || p.mint.toLowerCase().includes(marketSearch.toLowerCase());
      const matchesRole = roleFilter === 'all' || ROLE_LABELS[p.role] === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [pools, marketSearch, roleFilter]);

  // --- Create Pool Dialog ---
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const [newPoolMint, setNewPoolMint] = useState('');
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolRole, setNewPoolRole] = useState<string>('3');
  const [initialTokenLiquidity, setInitialTokenLiquidity] = useState('1000000');
  const [initialUsdcLiquidity, setInitialUsdcLiquidity] = useState('1000');

  const handleCreatePool = async () => {
    if (!newPoolMint || !newPoolName) { toast.error('Please fill in all fields'); return; }

    setActionLoading(true);
    try {
      const mintKey = new PublicKey(newPoolMint);
      const [configPda] = await findConfigPda();
      const configInfo = await getConnection().getAccountInfo(new PublicKey(configPda));
      if (!configInfo) throw new Error("Config not found");
      const configData = decodeAdminConfig({ address: configPda as any, data: new Uint8Array(Buffer.from(configInfo.data)), exists: true } as any).data;
      const usdcMint = new PublicKey(configData.usdcMint);
      const mintInfo = await getConnection().getAccountInfo(mintKey);
      if (!mintInfo) throw new Error("Mint not found");
      const tokenProgramId = mintInfo.owner;

      const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('pool'), mintKey.toBuffer()], PROGRAM_ID);
      const poolTokenVault = getAssociatedTokenAddressSync(mintKey, poolPda, true, tokenProgramId);
      const poolUsdcVault = getAssociatedTokenAddressSync(usdcMint, poolPda, true);
      const roleNum = parseInt(newPoolRole);

      const createPoolIxInfo = getCreatePoolInstruction({
        name: newPoolName, role: roleNum, config: configPda as any, pool: poolPda.toBase58() as any,
        mint: mintKey.toBase58() as any, tokenVault: poolTokenVault.toBase58() as any,
        usdcVault: poolUsdcVault.toBase58() as any, poolAuthority: poolPda.toBase58() as any,
        admin: publicKey.toBase58() as any, tokenProgram: tokenProgramId.toBase58() as any,
        associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as any,
        systemProgram: SystemProgram.programId.toBase58() as any,
      });

      const createPoolIx = new TransactionInstruction({
        programId: new PublicKey(createPoolIxInfo.programAddress),
        keys: createPoolIxInfo.accounts.map(a => ({ pubkey: new PublicKey(a.address), isSigner: a.role >= 2, isWritable: a.role === 1 || a.role === 3 })),
        data: Buffer.from(createPoolIxInfo.data)
      });

      const instructions = [];
      const tokenVaultInfo = await getConnection().getAccountInfo(poolTokenVault);
      const usdcVaultInfo = await getConnection().getAccountInfo(poolUsdcVault);
      if (!tokenVaultInfo) instructions.push(createAssociatedTokenAccountInstruction(publicKey, poolTokenVault, poolPda, mintKey));
      if (!usdcVaultInfo) instructions.push(createAssociatedTokenAccountInstruction(publicKey, poolUsdcVault, poolPda, usdcMint));
      instructions.push(createPoolIx);
      instructions.push(createMintToInstruction(mintKey, poolTokenVault, publicKey, BigInt(parseInt(initialTokenLiquidity) * (10 ** 6)), [], tokenProgramId));
      instructions.push(createMintToInstruction(usdcMint, poolUsdcVault, publicKey, BigInt(parseInt(initialUsdcLiquidity) * (10 ** 6))));

      const { blockhash } = await getConnection().getLatestBlockhash();
      const msg = new TransactionMessage({ payerKey: publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([adminKeypair]);
      const sig = await getConnection().sendRawTransaction(tx.serialize());

      await getConnection().confirmTransaction(sig, 'confirmed');

      setPools([{ mint: newPoolMint, name: newPoolName, role: roleNum, enabled: true }, ...pools]);
      toast.success(`Pool created for ${newPoolName}!`);
      setNewPoolMint(''); setNewPoolName(''); setPoolDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to create pool');
    } finally {
      setActionLoading(false);
    }
  };

  // --- Toggle Pool ---
  const handleTogglePool = async (mint: string) => {
    setActionLoading(true);
    try {
      const pool = pools.find(p => p.mint === mint);
      if (!pool || !publicKey) throw new Error("Invalid state");

      const mintKey = new PublicKey(mint);
      const [configPda] = await findConfigPda();
      const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('pool'), mintKey.toBuffer()], PROGRAM_ID);

      const updatePoolIxInfo = getUpdatePoolInstruction({
        name: pool.name, role: pool.role, enabled: !pool.enabled,
        config: configPda as any, pool: poolPda.toBase58() as any, admin: publicKey.toBase58() as any,
      });

      const updatePoolIx = new TransactionInstruction({
        programId: new PublicKey(updatePoolIxInfo.programAddress),
        keys: updatePoolIxInfo.accounts.map(a => ({ pubkey: new PublicKey(a.address), isSigner: a.role >= 2, isWritable: a.role === 1 || a.role === 3 })),
        data: Buffer.from(updatePoolIxInfo.data)
      });

      const { blockhash } = await getConnection().getLatestBlockhash();
      const msg = new TransactionMessage({ payerKey: publicKey, recentBlockhash: blockhash, instructions: [updatePoolIx] }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([adminKeypair]);
      const sig = await getConnection().sendRawTransaction(tx.serialize());

      await getConnection().confirmTransaction(sig, 'confirmed');

      setPools(pools.map(p => p.mint === mint ? { ...p, enabled: !p.enabled } : p));
      toast.success(`Pool ${pool.enabled ? 'disabled' : 'enabled'} successfully`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to toggle pool');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or mint..."
              className="pl-9 h-9"
              value={marketSearch}
              onChange={e => setMarketSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1">
            {ROLE_FILTERS.map(r => (
              <button key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                  roleFilter === r
                    ? r === 'all' ? 'bg-primary text-primary-foreground' : `${ROLE_COLORS[r]} text-white`
                    : 'bg-[rgba(255,255,255,0.05)] text-muted-foreground hover:bg-[rgba(255,255,255,0.1)]'
                }`}
              >
                {r === 'all' ? 'All' : r}
              </button>
            ))}
          </div>
        </div>
        <Dialog open={poolDialogOpen} onOpenChange={setPoolDialogOpen}>
          <DialogTrigger render={<Button variant="outline" size="sm">Create Pool</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Pool</DialogTitle>
              <DialogDescription>Add an existing SPL token as a trading pool</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Mint Address</Label>
                <Input placeholder="Enter token mint address" value={newPoolMint} onChange={e => setNewPoolMint(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Athlete Name</Label>
                <Input placeholder="Enter athlete name" value={newPoolName} onChange={e => setNewPoolName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newPoolRole} onValueChange={v => v && setNewPoolRole(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Goalkeeper</SelectItem>
                    <SelectItem value="1">Defender</SelectItem>
                    <SelectItem value="2">Midfielder</SelectItem>
                    <SelectItem value="3">Forward</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Initial Tokens</Label>
                  <Input type="number" value={initialTokenLiquidity} onChange={e => setInitialTokenLiquidity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Initial USDC</Label>
                  <Input type="number" value={initialUsdcLiquidity} onChange={e => setInitialUsdcLiquidity(e.target.value)} />
                </div>
              </div>
              <Button className="w-full" onClick={handleCreatePool} disabled={actionLoading}>
                {actionLoading ? 'Creating...' : 'Create Pool'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Athlete</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Mint Address</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredPools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    {pools.length === 0 ? 'No pools yet. Launch a token to create the first market.' : 'No pools match your search.'}
                  </TableCell>
                </TableRow>
              ) : filteredPools.map((pool, i) => (
                <TableRow key={pool.mint}>
                  <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                  <TableCell className="font-medium">{pool.name}</TableCell>
                  <TableCell>
                    <Badge className={`${ROLE_COLORS[ROLE_LABELS[pool.role]]} text-white border-none text-[10px]`}>
                      {ROLE_LABELS[pool.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{pool.mint.slice(0, 8)}...{pool.mint.slice(-4)}</TableCell>
                  <TableCell className="text-right">
                    <span className={`text-xs font-bold ${pool.enabled ? 'text-[#00ff88]' : 'text-[#ff4757]'}`}>
                      {pool.enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant={pool.enabled ? 'destructive' : 'outline'}
                        size="sm"
                        className="h-7 text-[11px] px-2"
                        onClick={() => handleTogglePool(pool.mint)}
                        disabled={actionLoading}
                      >
                        {pool.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Link href={`/markets/${pool.mint}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                        View
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground font-mono">Showing {filteredPools.length} of {pools.length} pools</p>
    </div>
  );
}

export default dynamic(() => Promise.resolve(Markets), { ssr: false });
