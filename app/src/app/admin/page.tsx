'use client';

import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
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
import { ROLE_LABELS, ROLE_COLORS, rpc, PROGRAM_ID, connection, formatUSDC } from '@/solana/client';
import { toast } from 'sonner';
import React from 'react';
import { Search, Trophy, Users, BarChart3, Rocket, List, ChevronRight, Loader2, Plus, X, Check, Wallet, Zap, TrendingUp, Medal, Clock } from 'lucide-react';

import { decodeAthletePool, ATHLETE_POOL_DISCRIMINATOR, decodeContest, CONTEST_DISCRIMINATOR, ContestStatus } from '@dexi/sdk';
import { getBase58Decoder } from '@solana/kit';

const ADMIN_WALLET_ADDRESS = 'FsHawHBmgvn5uGZHDWt2NQMbpFGFnCqiC4Knmw31NCrr';

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
  statusCode: number;
  entryCount: number;
  prizePool: bigint;
  winnerCount: number;
  prizeSplit: number[];
}

const STATS = [
  { label: 'Total Pools', getValue: (p: PoolData[]) => p.length, accent: 'text-primary' },
  { label: 'Active Contests', getValue: (_: PoolData[], c: ContestData[]) => c.filter(x => x.status === 'Open').length, accent: 'text-positive' },
  { label: 'Total Prize Pool', getValue: (_: PoolData[], c: ContestData[]) => `$${formatUSDC(c.reduce((a, b) => a + b.prizePool, BigInt(0)))}`, accent: 'text-[#00ff88]' },
  { label: 'Total Entries', getValue: (_: PoolData[], c: ContestData[]) => c.reduce((a, b) => a + b.entryCount, 0), accent: 'text-primary' },
];

const ROLE_FILTERS = ['all', 'GK', 'DEF', 'MID', 'FWD'] as const;
const STATUS_PILL: Record<string, { bg: string; text: string; dot: string }> = {
  Open: { bg: 'bg-[rgba(0,255,136,0.15)]', text: 'text-[#00ff88]', dot: 'bg-[#00ff88]' },
  Locked: { bg: 'bg-[rgba(255,191,0,0.15)]', text: 'text-[#ffbf00]', dot: 'bg-[#ffbf00]' },
  Settled: { bg: 'bg-[rgba(59,130,246,0.15)]', text: 'text-[#3b82f6]', dot: 'bg-[#3b82f6]' },
};

function AdminPage() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [pools, setPools] = useState<PoolData[]>([]);
  const [contests, setContests] = useState<ContestData[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useRevolvingTitle([
    'Admin | DEXI',
    'Dashboard | DEXI',
    'Manage Protocol | DEXI',
  ]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    async function fetchData() {
      try {
        const [poolAccounts, contestAccounts] = await Promise.all([
          rpc.getProgramAccounts(PROGRAM_ID.toBase58() as any, {
            encoding: 'base64',
            filters: [{ memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(ATHLETE_POOL_DISCRIMINATOR) as any } }]
          }).send(),
          rpc.getProgramAccounts(PROGRAM_ID.toBase58() as any, {
            encoding: 'base64',
            filters: [{ memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(CONTEST_DISCRIMINATOR) as any } }]
          }).send()
        ]);

        setPools(poolAccounts.map(account => {
          const decoded = decodeAthletePool({
            address: account.pubkey,
            data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
            exists: true,
          } as any).data;
          return { mint: decoded.mint.toString(), name: decoded.name, role: decoded.role, enabled: decoded.enabled };
        }));

        setContests(contestAccounts.map(account => {
          const decoded = decodeContest({
            address: account.pubkey,
            data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
            exists: true,
          } as any).data;

          let statusStr = 'Open';
          let code = 0;
          if (decoded.status === ContestStatus.Locked) { statusStr = 'Locked'; code = 1; }
          else if (decoded.status === ContestStatus.Settled) { statusStr = 'Settled'; code = 2; }

          return {
            id: Number(decoded.id),
            startTime: Number(decoded.startTime),
            status: statusStr,
            statusCode: code,
            entryCount: Number(decoded.entryCount),
            prizePool: decoded.prizePool,
            winnerCount: decoded.winnerCount,
            prizeSplit: decoded.prizeSplit.slice(0, decoded.winnerCount),
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

  useEffect(() => {
    if (connected && publicKey) {
      setIsAdmin(publicKey.toBase58() === ADMIN_WALLET_ADDRESS);
    }
  }, [connected, publicKey]);

  // --- Launch Token State ---
  const [ltName, setLtName] = useState('');
  const [ltTicker, setLtTicker] = useState('');
  const [ltRole, setLtRole] = useState('3');
  const [ltDesc, setLtDesc] = useState('');
  const [ltLiquidity, setLtLiquidity] = useState(100);
  const [ltImagePreview, setLtImagePreview] = useState('');
  const [ltLoading, setLtLoading] = useState(false);

  const handleLaunchToken = async () => {
    if (!ltName || !ltTicker) {
      toast.error('Please fill in name and ticker');
      return;
    }
    if (!signTransaction || !publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    setLtLoading(true);
    try {
      const { Keypair, SystemProgram, TransactionMessage, VersionedTransaction, TransactionInstruction } = await import('@solana/web3.js');
      const { createInitializeMintInstruction, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, createMintToInstruction, MINT_SIZE, TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
      const { createCreateMetadataAccountV3Instruction } = await import('@metaplex-foundation/mpl-token-metadata');
      const { getCreatePoolInstruction, findConfigPda, decodeAdminConfig } = await import('@dexi/sdk');

      const mintKeypair = Keypair.generate();
      const decimals = 6;
      const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

      const createAccountIx = SystemProgram.createAccount({
        fromPubkey: publicKey, newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE, lamports, programId: TOKEN_PROGRAM_ID,
      });

      const initializeMintIx = createInitializeMintInstruction(
        mintKeypair.publicKey, decimals, publicKey, publicKey, TOKEN_PROGRAM_ID
      );

      const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), MPL_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
        MPL_PROGRAM_ID
      );

      const initializeMetadataIx = createCreateMetadataAccountV3Instruction(
        { metadata: metadataPda, mint: mintKeypair.publicKey, mintAuthority: publicKey, payer: publicKey, updateAuthority: publicKey },
        { createMetadataAccountArgsV3: { data: { name: ltName, symbol: ltTicker, uri: '', sellerFeeBasisPoints: 0, creators: null, collection: null, uses: null }, isMutable: true, collectionDetails: null } }
      );

      const [configPda] = await findConfigPda();
      const configInfo = await connection.getAccountInfo(new PublicKey(configPda));
      if (!configInfo) throw new Error("Config not found");
      const configData = decodeAdminConfig({ address: configPda as any, data: new Uint8Array(Buffer.from(configInfo.data)), exists: true } as any).data;
      const usdcMint = new PublicKey(configData.usdcMint);
      const usdcMintInfo = await connection.getAccountInfo(usdcMint);
      const usdcTokenProgramId = usdcMintInfo?.owner || TOKEN_PROGRAM_ID;

      const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('pool'), mintKeypair.publicKey.toBuffer()], PROGRAM_ID);
      const poolTokenVault = getAssociatedTokenAddressSync(mintKeypair.publicKey, poolPda, true, TOKEN_PROGRAM_ID);
      const poolUsdcVault = getAssociatedTokenAddressSync(usdcMint, poolPda, true, usdcTokenProgramId);

      const createTokenAtaIx = createAssociatedTokenAccountInstruction(publicKey, poolTokenVault, poolPda, mintKeypair.publicKey, TOKEN_PROGRAM_ID);
      const createUsdcAtaIx = createAssociatedTokenAccountInstruction(publicKey, poolUsdcVault, poolPda, usdcMint, usdcTokenProgramId);

      const roleNum = parseInt(ltRole);
      const createPoolIxInfo = getCreatePoolInstruction({
        name: ltName, role: roleNum,
        config: configPda as any, pool: poolPda.toBase58() as any,
        mint: mintKeypair.publicKey.toBase58() as any,
        tokenVault: poolTokenVault.toBase58() as any,
        usdcVault: poolUsdcVault.toBase58() as any,
        poolAuthority: poolPda.toBase58() as any,
        admin: publicKey.toBase58() as any,
        tokenProgram: TOKEN_PROGRAM_ID.toBase58() as any,
        associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as any,
        systemProgram: SystemProgram.programId.toBase58() as any,
      });

      const createPoolIx = new TransactionInstruction({
        programId: new PublicKey(createPoolIxInfo.programAddress),
        keys: createPoolIxInfo.accounts.map(a => ({ pubkey: new PublicKey(a.address), isSigner: a.role >= 2, isWritable: a.role === 1 || a.role === 3 })),
        data: Buffer.from(createPoolIxInfo.data)
      });

      const mintTokensToPoolIx = createMintToInstruction(mintKeypair.publicKey, poolTokenVault, publicKey, BigInt(1000000 * (10 ** decimals)), [], TOKEN_PROGRAM_ID);
      const mintUsdcToPoolIx = createMintToInstruction(usdcMint, poolUsdcVault, publicKey, BigInt(ltLiquidity * (10 ** 6)));

      const tokenVaultInfo = await connection.getAccountInfo(poolTokenVault);
      const usdcVaultInfo = await connection.getAccountInfo(poolUsdcVault);

      const instructions = [
        createAccountIx, initializeMintIx, initializeMetadataIx,
        ...(tokenVaultInfo ? [] : [createTokenAtaIx]),
        ...(usdcVaultInfo ? [] : [createUsdcAtaIx]),
        createPoolIx, mintTokensToPoolIx, mintUsdcToPoolIx,
      ];

      const { blockhash } = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({ payerKey: publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([mintKeypair]);
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');

      setPools([{ mint: mintKeypair.publicKey.toBase58(), name: ltName, role: roleNum, enabled: true }, ...pools]);
      toast.success(`${ltName} token launched + pool created!`);
      setLtName(''); setLtTicker(''); setLtDesc(''); setLtImagePreview(''); setLtLiquidity(100);
    } catch (error: any) {
      console.error(error);
      toast.error('Launch failed: ' + (error.message || 'Unknown error'));
    } finally {
      setLtLoading(false);
    }
  };

  // --- Markets State ---
  const [newPoolMint, setNewPoolMint] = useState('');
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolRole, setNewPoolRole] = useState<string>('3');
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const [initialTokenLiquidity, setInitialTokenLiquidity] = useState('1000000');
  const [initialUsdcLiquidity, setInitialUsdcLiquidity] = useState('1000');
  const [marketSearch, setMarketSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const filteredPools = useMemo(() => {
    return pools.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(marketSearch.toLowerCase()) || p.mint.toLowerCase().includes(marketSearch.toLowerCase());
      const matchesRole = roleFilter === 'all' || ROLE_LABELS[p.role] === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [pools, marketSearch, roleFilter]);

  const handlePoolRoleChange = (value: string | null) => { if (value) setNewPoolRole(value); };

  const handleCreatePool = async () => {
    if (!newPoolMint || !newPoolName) { toast.error('Please fill in all fields'); return; }
    if (!signTransaction || !publicKey) { toast.error('Wallet not connected'); return; }

    setLoading(true);
    try {
      const { TransactionMessage, VersionedTransaction, SystemProgram, TransactionInstruction } = await import('@solana/web3.js');
      const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, createMintToInstruction } = await import('@solana/spl-token');
      const { getCreatePoolInstruction, findConfigPda, decodeAdminConfig } = await import('@dexi/sdk');

      const mintKey = new PublicKey(newPoolMint);
      const adminKey = new PublicKey(publicKey.toString());
      const [configPda] = await findConfigPda();
      const configInfo = await connection.getAccountInfo(new PublicKey(configPda));
      if (!configInfo) throw new Error("Config not found");
      const configData = decodeAdminConfig({ address: configPda as any, data: new Uint8Array(Buffer.from(configInfo.data)), exists: true } as any).data;
      const usdcMint = new PublicKey(configData.usdcMint);
      const mintInfo = await connection.getAccountInfo(mintKey);
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
        admin: adminKey.toBase58() as any, tokenProgram: tokenProgramId.toBase58() as any,
        associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as any,
        systemProgram: SystemProgram.programId.toBase58() as any,
      });

      const createPoolIx = new TransactionInstruction({
        programId: new PublicKey(createPoolIxInfo.programAddress),
        keys: createPoolIxInfo.accounts.map(a => ({ pubkey: new PublicKey(a.address), isSigner: a.role >= 2, isWritable: a.role === 1 || a.role === 3 })),
        data: Buffer.from(createPoolIxInfo.data)
      });

      const instructions = [];
      const tokenVaultInfo = await connection.getAccountInfo(poolTokenVault);
      const usdcVaultInfo = await connection.getAccountInfo(poolUsdcVault);
      if (!tokenVaultInfo) instructions.push(createAssociatedTokenAccountInstruction(adminKey, poolTokenVault, poolPda, mintKey));
      if (!usdcVaultInfo) instructions.push(createAssociatedTokenAccountInstruction(adminKey, poolUsdcVault, poolPda, usdcMint));
      instructions.push(createPoolIx);
      instructions.push(createMintToInstruction(mintKey, poolTokenVault, adminKey, BigInt(parseInt(initialTokenLiquidity) * (10 ** 6)), [], tokenProgramId));
      instructions.push(createMintToInstruction(usdcMint, poolUsdcVault, adminKey, BigInt(parseInt(initialUsdcLiquidity) * (10 ** 6))));

      const { blockhash } = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({ payerKey: adminKey, recentBlockhash: blockhash, instructions }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');

      setPools([{ mint: newPoolMint, name: newPoolName, role: roleNum, enabled: true }, ...pools]);
      toast.success(`Pool created for ${newPoolName}!`);
      setNewPoolMint(''); setNewPoolName(''); setPoolDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to create pool');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePool = async (mint: string) => {
    setLoading(true);
    try {
      const { getUpdatePoolInstruction, findConfigPda } = await import('@dexi/sdk');
      const { TransactionMessage, VersionedTransaction, PublicKey, TransactionInstruction } = await import('@solana/web3.js');

      const pool = pools.find(p => p.mint === mint);
      if (!pool || !publicKey || !signTransaction) throw new Error("Invalid state");

      const adminKey = new PublicKey(publicKey.toString());
      const mintKey = new PublicKey(mint);
      const [configPda] = await findConfigPda();
      const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('pool'), mintKey.toBuffer()], PROGRAM_ID);

      const updatePoolIxInfo = getUpdatePoolInstruction({
        name: pool.name, role: pool.role, enabled: !pool.enabled,
        config: configPda as any, pool: poolPda.toBase58() as any, admin: adminKey.toBase58() as any,
      });

      const updatePoolIx = new TransactionInstruction({
        programId: new PublicKey(updatePoolIxInfo.programAddress),
        keys: updatePoolIxInfo.accounts.map(a => ({ pubkey: new PublicKey(a.address), isSigner: a.role >= 2, isWritable: a.role === 1 || a.role === 3 })),
        data: Buffer.from(updatePoolIxInfo.data)
      });

      const { blockhash } = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({ payerKey: adminKey, recentBlockhash: blockhash, instructions: [updatePoolIx] }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');

      setPools(pools.map(p => p.mint === mint ? { ...p, enabled: !p.enabled } : p));
      toast.success(`Pool ${pool.enabled ? 'disabled' : 'enabled'} successfully`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to toggle pool');
    } finally {
      setLoading(false);
    }
  };

  // --- Create Contest State ---
  const [newContestStartTime, setNewContestStartTime] = useState('');
  const [newContestWinnerCount, setNewContestWinnerCount] = useState('3');
  const [newContestPrizeSplit, setNewContestPrizeSplit] = useState('50,30,20');
  const [contestDialogOpen, setContestDialogOpen] = useState(false);
  const [selectedPlayerMints, setSelectedPlayerMints] = useState<Set<string>>(new Set());
  const [contestLoading, setContestLoading] = useState(false);

  useEffect(() => {
    if (pools.length > 0) {
      setSelectedPlayerMints(new Set(pools.filter(p => p.enabled).map(p => p.mint)));
    }
  }, [pools]);

  const handleWinnerCountChange = (value: string | null) => { if (value) setNewContestWinnerCount(value); };

  const togglePlayerMint = (mint: string) => {
    setSelectedPlayerMints(prev => {
      const next = new Set(prev);
      if (next.has(mint)) next.delete(mint);
      else next.add(mint);
      return next;
    });
  };

  const handleCreateContest = async () => {
    if (!newContestStartTime || !newContestWinnerCount || !newContestPrizeSplit) {
      toast.error('Please fill in all fields');
      return;
    }
    if (!signTransaction || !publicKey) { toast.error('Wallet not connected'); return; }
    if (selectedPlayerMints.size === 0) { toast.error('Select at least one player pool'); return; }

    setContestLoading(true);
    try {
      const { AddressLookupTableProgram, TransactionMessage, VersionedTransaction, SystemProgram, TransactionInstruction } = await import('@solana/web3.js');
      const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
      const { getCreateContestInstruction, findConfigPda, findContestPda, decodeAdminConfig } = await import('@dexi/sdk');

      const adminKey = new PublicKey(publicKey.toString());
      const newId = contests.length > 0 ? Math.max(...contests.map(c => c.id)) + 1 : 1;
      const startTimeNum = Math.floor(new Date(newContestStartTime).getTime() / 1000);
      const winnerCountNum = parseInt(newContestWinnerCount);
      const prizeSplitArr = newContestPrizeSplit.split(',').map(s => parseInt(s.trim()) * 100);

      const [configPda] = await findConfigPda();
      const configInfo = await connection.getAccountInfo(new PublicKey(configPda));
      const configData = decodeAdminConfig({ address: configPda, data: new Uint8Array(Buffer.from(configInfo!.data)), exists: true } as any).data;
      const usdcMint = new PublicKey(configData.usdcMint);
      const usdcMintInfo = await connection.getAccountInfo(usdcMint);
      const usdcTokenProgramId = usdcMintInfo?.owner || new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

      const [contestPda] = await findContestPda({ id: newId });
      const contestKey = new PublicKey(contestPda);
      const escrowVault = getAssociatedTokenAddressSync(usdcMint, contestKey, true, usdcTokenProgramId);

      const escrowInfo = await connection.getAccountInfo(escrowVault);
      if (!escrowInfo) {
        const { blockhash } = await connection.getLatestBlockhash();
        const msg = new TransactionMessage({ payerKey: adminKey, recentBlockhash: blockhash, instructions: [createAssociatedTokenAccountInstruction(adminKey, escrowVault, contestKey, usdcMint, usdcTokenProgramId)] }).compileToV0Message();
        const tx = new VersionedTransaction(msg);
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, 'confirmed');
      }

      toast.info('Creating Lookup Table (1/3)...');
      const slot = await connection.getSlot();
      const [createIx, lutAddress] = AddressLookupTableProgram.createLookupTable({ authority: adminKey, payer: adminKey, recentSlot: Math.max(slot - 10, 0) });
      const { blockhash: lutBlockhash } = await connection.getLatestBlockhash();
      const lutMsg = new TransactionMessage({ payerKey: adminKey, recentBlockhash: lutBlockhash, instructions: [createIx] }).compileToV0Message();
      const lutTx = new VersionedTransaction(lutMsg);
      const signedLutTx = await signTransaction(lutTx);
      await connection.confirmTransaction(await connection.sendRawTransaction(signedLutTx.serialize()), 'confirmed');

      toast.info('Populating Lookup Table (2/3)...');
      const staticAddresses: PublicKey[] = [
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        SystemProgram.programId, new PublicKey(configPda), contestKey, adminKey, escrowVault,
      ];

      const playerMints: string[] = [];
      const remainingAccounts: any[] = [];

      for (const p of pools) {
        if (!selectedPlayerMints.has(p.mint)) continue;
        const mintKey = new PublicKey(p.mint);
        playerMints.push(mintKey.toBase58());
        const poolKey = new PublicKey(PublicKey.findProgramAddressSync([Buffer.from('pool'), mintKey.toBuffer()], PROGRAM_ID)[0]);
        const mintInfo = await connection.getAccountInfo(mintKey);
        const tpId = mintInfo?.owner || new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        const vault = getAssociatedTokenAddressSync(mintKey, contestKey, true, tpId);
        staticAddresses.push(mintKey, vault, poolKey);
        remainingAccounts.push({ pubkey: vault, isWritable: true, isSigner: false }, { pubkey: mintKey, isWritable: false, isSigner: false });
      }

      const extendIx = AddressLookupTableProgram.extendLookupTable({ payer: adminKey, authority: adminKey, lookupTable: lutAddress, addresses: staticAddresses });
      const { blockhash: extBlockhash } = await connection.getLatestBlockhash();
      const extTx = new VersionedTransaction(new TransactionMessage({ payerKey: adminKey, recentBlockhash: extBlockhash, instructions: [extendIx] }).compileToV0Message());
      const signedExtTx = await signTransaction(extTx);
      await connection.confirmTransaction(await connection.sendRawTransaction(signedExtTx.serialize()), 'confirmed');

      await new Promise(resolve => setTimeout(resolve, 3000));

      toast.info('Deploying Contest (3/3)...');
      const createIxFixed = getCreateContestInstruction({
        id: newId, startTime: startTimeNum as any, winnerCount: winnerCountNum, prizeSplit: prizeSplitArr,
        playerMints: playerMints as any[], addressLookupTable: lutAddress.toBase58() as any,
        config: configPda.toString() as any, contest: contestKey.toBase58() as any,
        usdcMint: usdcMint.toBase58() as any, escrowVault: escrowVault.toBase58() as any,
        admin: adminKey.toBase58() as any,
      });

      const instruction = new TransactionInstruction({
        programId: new PublicKey(createIxFixed.programAddress),
        keys: [...createIxFixed.accounts.map(a => ({ pubkey: new PublicKey(a.address), isSigner: a.role >= 2, isWritable: a.role === 1 || a.role === 3 })), ...remainingAccounts],
        data: Buffer.from(createIxFixed.data)
      });

      const { blockhash: contestBlockhash } = await connection.getLatestBlockhash();
      const contestMsg = new TransactionMessage({ payerKey: adminKey, recentBlockhash: contestBlockhash, instructions: [instruction] }).compileToV0Message();
      const contestTx = new VersionedTransaction(contestMsg);
      const signedContestTx = await signTransaction(contestTx);
      await connection.confirmTransaction(await connection.sendRawTransaction(signedContestTx.serialize()), 'confirmed');

      setContests([{
        id: newId, startTime: startTimeNum, status: 'Open', statusCode: 0,
        entryCount: 0, prizePool: BigInt(0), winnerCount: winnerCountNum, prizeSplit: prizeSplitArr,
      }, ...contests]);
      toast.success(`Contest #${newId} created!`);
      setNewContestStartTime('');
      setContestDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to create contest');
    } finally {
      setContestLoading(false);
    }
  };

  // --- Manage Contests State ---
  const [contestSearch, setContestSearch] = useState('');
  const [contestStatusFilter, setContestStatusFilter] = useState('all');
  const [expandedContest, setExpandedContest] = useState<number | null>(null);

  const filteredContests = useMemo(() => {
    return contests.filter(c => {
      const matchesSearch = String(c.id).includes(contestSearch);
      const matchesStatus = contestStatusFilter === 'all' || c.status === contestStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contests, contestSearch, contestStatusFilter]);

  const contestStats = useMemo(() => ({
    total: contests.length,
    active: contests.filter(c => c.status === 'Open').length,
    locked: contests.filter(c => c.status === 'Locked').length,
    settled: contests.filter(c => c.status === 'Settled').length,
  }), [contests]);

  // --- Render helpers ---
  if (!connected) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xl font-bold text-primary-foreground">D</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Dexi</h1>
            </a>
            <WalletButton />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Card className="max-w-md w-full">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl">Connect Wallet</CardTitle>
                <CardDescription>Connect your wallet to access the admin panel</CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <Button size="lg" className="w-full" onClick={() => setVisible(true)}>
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
            <a href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xl font-bold text-primary-foreground">D</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Dexi</h1>
            </a>
            <WalletButton />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Card className="max-w-md w-full">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl">Access Denied</CardTitle>
                <CardDescription>Only the admin wallet can access this page</CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p className="text-muted-foreground">Your wallet: {publicKey?.toBase58().slice(0, 8)}...</p>
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
          <a href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xl font-bold text-primary-foreground">D</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dexi</h1>
          </a>
          <nav className="hidden md:flex items-center gap-6">
            <a href="/markets" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Markets</a>
            <a href="/portfolio" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Portfolio</a>
            <a href="/admin" className="text-sm font-medium text-foreground">Admin</a>
          </nav>
          <WalletButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight font-heading">Admin Panel</h2>
              <p className="text-muted-foreground text-sm">Manage pools, contests, tokens, and protocol settings</p>
            </div>
            <TabsList>
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="launch">Launch Token</TabsTrigger>
              <TabsTrigger value="markets">Markets</TabsTrigger>
              <TabsTrigger value="create">Create Contest</TabsTrigger>
              <TabsTrigger value="contests">Contests</TabsTrigger>
            </TabsList>
          </div>

          {/* ============ DASHBOARD ============ */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {STATS.map(s => (
                <Card key={s.label}>
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">{s.label}</p>
                    <p className={`text-3xl font-black tabular-nums ${s.accent}`}>{s.getValue(pools, contests)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setActiveTab('launch')}>
                <CardContent className="p-5 space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Rocket className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Launch Player Token</p>
                    <p className="text-xs text-muted-foreground mt-1">Create SPL token + AMM pool in one tx</p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full">Launch Token</Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setActiveTab('markets')}>
                <CardContent className="p-5 space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Manage Markets</p>
                    <p className="text-xs text-muted-foreground mt-1">View, enable/disable trading pools</p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full">Open Markets</Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setActiveTab('create')}>
                <CardContent className="p-5 space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Create Contest</p>
                    <p className="text-xs text-muted-foreground mt-1">Set up a new fantasy contest</p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full">Create Contest</Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setActiveTab('contests')}>
                <CardContent className="p-5 space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <List className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Manage Contests</p>
                    <p className="text-xs text-muted-foreground mt-1">Monitor entries, lock/settle contests</p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full">View Contests</Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {contests.length === 0 && pools.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No activity yet. Launch a token or create a contest to get started.</p>
                ) : (
                  <div className="space-y-2">
                    {contests.slice(0, 5).map(c => (
                      <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-[#181b25] hover:bg-[#1c1f2a] transition-colors border border-[#454932]/50">
                        <div className="flex items-center gap-3">
                          <Trophy className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Contest #{c.id} Created</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`${STATUS_PILL[c.status]?.bg} ${STATUS_PILL[c.status]?.text} border-none text-[10px]`}>{c.status}</Badge>
                          <span className="text-xs text-muted-foreground">{new Date(c.startTime * 1000).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                    {pools.slice(0, 3).map(p => (
                      <div key={p.mint} className="flex items-center justify-between p-3 rounded-lg bg-[#181b25] hover:bg-[#1c1f2a] transition-colors border border-[#454932]/50">
                        <div className="flex items-center gap-3">
                          <Zap className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{p.name} Pool Created</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className="bg-primary/15 text-primary border-none text-[10px]">Active</Badge>
                          <span className="text-xs text-muted-foreground font-mono">{p.mint.slice(0, 6)}...</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ LAUNCH TOKEN ============ */}
          <TabsContent value="launch" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl font-heading">Launch Player Token</CardTitle>
                    <CardDescription>Create a new athlete SPL token with Metaplex metadata. An AMM trading pool is created automatically.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-2">
                      <Label>Athlete Name</Label>
                      <Input placeholder="e.g., Lionel Messi" value={ltName} onChange={e => setLtName(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label>Ticker Symbol</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                        <Input
                          placeholder="MESSI" maxLength={6}
                          className="pl-8 uppercase"
                          value={ltTicker}
                          onChange={e => setLtTicker(e.target.value.toUpperCase())}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Position</Label>
                      <Select value={ltRole} onValueChange={v => v && setLtRole(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_COLORS).map(([label, colorClass]) => (
                            <SelectItem key={label} value={String(Object.keys(ROLE_LABELS).find(k => ROLE_LABELS[Number(k)] === label))}>
                              <span className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${colorClass}`} />
                                {label === 'GK' ? 'Goalkeeper' : label === 'DEF' ? 'Defender' : label === 'MID' ? 'Midfielder' : 'Forward'} ({label})
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <textarea
                        placeholder="Tell us about this athlete..."
                        className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                        value={ltDesc}
                        onChange={e => setLtDesc(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Token Image</Label>
                      <div className="relative border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-background overflow-hidden">
                        <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          onChange={e => {
                            if (e.target.files?.[0]) setLtImagePreview(URL.createObjectURL(e.target.files[0]));
                          }}
                        />
                        {ltImagePreview ? (
                          <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-border">
                            <img src={ltImagePreview} alt="Preview" className="object-cover w-full h-full" />
                          </div>
                        ) : (
                          <>
                            <Plus className="w-8 h-8 text-muted-foreground mb-2" />
                            <p className="text-sm font-medium">Drop image or click to upload</p>
                            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF up to 5MB</p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label>Initial Liquidity (USDC)</Label>
                        <span className="font-mono text-primary font-bold">${ltLiquidity}</span>
                      </div>
                      <input type="range" min="10" max="1000" step="10" value={ltLiquidity}
                        onChange={e => setLtLiquidity(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                      <p className="text-xs text-muted-foreground">Funds the AMM pool for instant trading</p>
                    </div>

                    <Button
                      className="w-full h-12 text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={handleLaunchToken}
                      disabled={ltLoading}
                    >
                      {ltLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Launching...</> : <><Rocket className="w-4 h-4 mr-2" /> Launch Token</>}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">~0.05 SOL in network fees</p>
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground">Token Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-[#262a34] border border-[#454932] flex items-center justify-center font-bold text-lg text-white">
                          {ltName ? ltName[0].toUpperCase() : '?'}
                        </div>
                        <div>
                          <p className="font-bold">{ltName || 'Athlete Name'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-primary font-mono text-sm">${ltTicker || 'TICKER'}</span>
                            <Badge className={`${ROLE_COLORS[ROLE_LABELS[parseInt(ltRole)]]} text-white border-none text-[10px]`}>
                              {ROLE_LABELS[parseInt(ltRole)]}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Price</p>
                        <p className="font-mono font-bold text-primary">$0.01</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground">Bonding Curve Preview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <svg width="100%" height="120" viewBox="0 0 300 120" preserveAspectRatio="none" className="overflow-visible">
                      <defs>
                        <linearGradient id="curveG" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="oklch(0.72 0.2 160)" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="oklch(0.72 0.2 160)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {[20, 60, 100].map(y => <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,0.05)" />)}
                      <path d={`M 0,100 L ${Array.from({ length: 21 }, (_, i) => {
                        const x = i * 15;
                        const y = 100 - Math.pow(i / 20, 2) * 80;
                        return `${x},${y}`;
                      }).join(' L ')} L 300,100 Z`} fill="url(#curveG)" />
                      <path d={`M 0,100 ${Array.from({ length: 21 }, (_, i) => {
                        const x = i * 15;
                        const y = 100 - Math.pow(i / 20, 2) * 80;
                        return `L ${x},${y}`;
                      }).join(' ')}`} fill="none" stroke="oklch(0.72 0.2 160)" strokeWidth="2" />
                      <circle cx={(ltLiquidity / 1000) * 300} cy={100 - Math.pow(ltLiquidity / 1000, 2) * 80} r="4" fill="white" stroke="oklch(0.72 0.2 160)" strokeWidth="2" />
                    </svg>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Supply</span>
                      <span>Price</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Starting Price</span><span className="font-mono">$0.01</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Market Cap</span><span className="font-mono">${(ltLiquidity * 2).toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Curve Type</span><span>Bonding Curve</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Initial Supply</span><span className="font-mono">1,000,000</span></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ============ MARKETS ============ */}
          <TabsContent value="markets" className="space-y-4">
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
                      <Select value={newPoolRole} onValueChange={handlePoolRoleChange}>
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
                    <Button className="w-full" onClick={handleCreatePool} disabled={loading}>
                      {loading ? 'Creating...' : 'Create Pool'}
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
                    {filteredPools.length === 0 ? (
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
                              disabled={loading}
                            >
                              {pool.enabled ? 'Disable' : 'Enable'}
                            </Button>
                            <a href={`/markets/${pool.mint}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                              View
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground font-mono">Showing {filteredPools.length} of {pools.length} pools</p>
          </TabsContent>

          {/* ============ CREATE CONTEST ============ */}
          <TabsContent value="create" className="space-y-6 max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-heading">Create New Contest</CardTitle>
                <CardDescription>
                  Set up a new fantasy sports contest. Players will stake athlete tokens to enter. A Solana Address Lookup Table is created automatically for efficient transactions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contest Details</p>

                  <div className="space-y-2">
                    <Label>Start Date & Time</Label>
                    <Input type="datetime-local" value={newContestStartTime} onChange={e => setNewContestStartTime(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Contest locks at this time. All entries must be submitted before.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Number of Winners</Label>
                    <Select value={newContestWinnerCount} onValueChange={handleWinnerCountChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">Top 3</SelectItem>
                        <SelectItem value="5">Top 5</SelectItem>
                        <SelectItem value="10">Top 10</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Prize Split (comma separated)</Label>
                    <Input placeholder="50,30,20" value={newContestPrizeSplit} onChange={e => setNewContestPrizeSplit(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Example: 50,30,20 means 1st gets 50%, 2nd 30%, 3rd 20%. Must sum to 100.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Player Pool Selection</p>
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        if (selectedPlayerMints.size === pools.filter(p => p.enabled).length) {
                          setSelectedPlayerMints(new Set());
                        } else {
                          setSelectedPlayerMints(new Set(pools.filter(p => p.enabled).map(p => p.mint)));
                        }
                      }}
                    >
                      {selectedPlayerMints.size === pools.filter(p => p.enabled).length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Select which athlete tokens will be available in this contest</p>

                  {pools.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No player pools available. Launch tokens first.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {pools.filter(p => p.enabled).map(p => {
                        const selected = selectedPlayerMints.has(p.mint);
                        const roleLabel = ROLE_LABELS[p.role];
                        return (
                          <button
                            key={p.mint}
                            onClick={() => togglePlayerMint(p.mint)}
                            className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${
                              selected
                                ? 'border-primary bg-primary/10'
                                : 'border-border bg-[#181b25] hover:border-primary/30'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              selected ? 'bg-primary border-primary' : 'border-muted-foreground'
                            }`}>
                              {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{p.name}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[10px] font-mono text-primary">${p.mint.slice(0, 4)}</span>
                                <span className={`inline-block text-[9px] font-semibold px-1 py-0.5 rounded-full ${ROLE_COLORS[roleLabel]} text-white`}>{roleLabel}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-[#181b25] border border-border space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contest Summary</p>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Athletes</span><span className="font-semibold">{selectedPlayerMints.size} selected</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Address Lookup Table</span><span className="font-mono text-xs">Created automatically</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Estimated Gas</span><span className="font-mono text-xs">~3 transactions (ALT → Extend → Contest)</span></div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1"
                    onClick={() => {
                      setNewContestStartTime('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                    onClick={handleCreateContest}
                    disabled={contestLoading || selectedPlayerMints.size === 0}
                  >
                    {contestLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Create Contest'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ CONTESTS ============ */}
          <TabsContent value="contests" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-lg font-black tabular-nums">{contestStats.total}</span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Active</span>
                  <span className="text-lg font-black tabular-nums text-[#00ff88]">{contestStats.active}</span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Locked</span>
                  <span className="text-lg font-black tabular-nums text-[#ffbf00]">{contestStats.locked}</span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Settled</span>
                  <span className="text-lg font-black tabular-nums text-[#3b82f6]">{contestStats.settled}</span>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by contest ID..."
                  className="pl-9 h-9"
                  value={contestSearch}
                  onChange={e => setContestSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                {['all', 'Open', 'Locked', 'Settled'].map(s => (
                  <button key={s}
                    onClick={() => setContestStatusFilter(s)}
                    className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors ${
                      contestStatusFilter === s
                        ? s === 'all' ? 'bg-primary text-primary-foreground' : `${STATUS_PILL[s]?.bg} ${STATUS_PILL[s]?.text}`
                        : 'bg-[rgba(255,255,255,0.05)] text-muted-foreground hover:bg-[rgba(255,255,255,0.1)]'
                    }`}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => setActiveTab('create')}>
                Create Contest
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contest ID</TableHead>
                      <TableHead>Start Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Entries</TableHead>
                      <TableHead className="text-right">Prize Pool</TableHead>
                      <TableHead className="text-right">Winners</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          {contests.length === 0 ? 'No contests yet. Create your first contest.' : 'No contests match your filters.'}
                        </TableCell>
                      </TableRow>
                    ) : filteredContests.map(c => {
                      const sp = STATUS_PILL[c.status] || STATUS_PILL.Open;
                      return (
                        <React.Fragment key={c.id}>
                          <TableRow className="cursor-pointer" onClick={() => setExpandedContest(expandedContest === c.id ? null : c.id)}>
                            <TableCell className="font-medium">Contest #{c.id}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{new Date(c.startTime * 1000).toLocaleString()}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${sp.bg} ${sp.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${sp.dot} ${c.status === 'Open' ? 'animate-pulse' : ''}`} />
                                {c.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">{c.entryCount}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-[#00ff88]">${formatUSDC(c.prizePool)}</TableCell>
                            <TableCell className="text-right text-sm">Top {c.winnerCount}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <a href={`/contest/${c.id}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                                  View
                                </a>
                                {c.status === 'Open' && (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                                {c.status === 'Settled' && (
                                  <span className="text-xs text-positive">✓</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedContest === c.id && (
                            <TableRow key={`${c.id}-detail`}>
                              <TableCell colSpan={7} className="bg-[#181b25] p-4">
                                <div className="grid grid-cols-3 gap-4">
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Prize Split</p>
                                    <div className="space-y-1">
                                      {c.prizeSplit.map((pct, i) => (
                                        <p key={i} className="text-xs font-mono">#{i + 1}: {pct / 100}% (${formatUSDC(c.prizePool * BigInt(pct) / BigInt(10000))})</p>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Entry Progress</p>
                                    <div className="w-full h-2 bg-[#0f131d] rounded-full overflow-hidden">
                                      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${Math.min(100, c.entryCount)}%` }} />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">{c.entryCount} entries</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Status</p>
                                    {c.status === 'Locked' ? (
                                      <p className="text-xs text-muted-foreground">Awaiting settlement</p>
                                    ) : c.status === 'Open' ? (
                                      <p className="text-xs text-positive">Open for entries</p>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">Completed</p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground font-mono">Showing {filteredContests.length} of {contests.length} contests</p>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default dynamic(() => Promise.resolve(AdminPage), { ssr: false });
