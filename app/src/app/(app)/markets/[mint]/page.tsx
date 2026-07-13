'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import { usePageMeta } from '@/hooks/usePageMeta';
import { Copy, Check, BarChart3, Clock } from 'lucide-react';

import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import CandlestickChart from '@/components/charts/candlestick-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

import { getConnection, ROLE_LABELS, ROLE_COLORS, formatTokenAmount, formatUSDC, getRpc } from '@/solana/client';
import { toast } from 'sonner';
import { PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, AccountLayout } from '@solana/spl-token';
import { decodeAthletePool, findPoolPda, findConfigPda, decodeAdminConfig, getBuyInstruction, getSellInstruction } from '@dexi/sdk';
import { usePoolTrades } from '@/hooks/usePoolTrades';

interface PoolInfo {
  mint: string;
  name: string;
  role: number;
  enabled: boolean;
  usdcBalance?: bigint;
  tokenBalance?: bigint;
  poolUsdc?: bigint;
  poolTokens?: bigint;
  price?: number;
  image?: string;
}

function PoolDetailContent() {
  const params = useParams();
  const mintParam = params?.mint as string;
  const { connected, publicKey, sendTransaction, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [pool, setPool] = useState<PoolInfo | null>(null);

  const revolvingTitles = useMemo(() => {
    const base = pool?.name ? pool.name.replace(/\s+/g, '').toUpperCase() : 'Market';
    return [
      `${base} | Markets | DEXI`,
      `${base} — Live Price | DEXI`,
      `${base} — Trade Now | DEXI`,
    ];
  }, [pool?.name]);

  useRevolvingTitle(revolvingTitles);

  const meta = useMemo(() => {
    const name = pool?.name ? pool.name.replace(/\s+/g, '').toUpperCase() : 'Market';
    return {
      title: `${name} | Markets | DEXI`,
      description: `Trade ${name} athlete tokens on Solana. Live prices, charts, and on-chain data.`,
      ogTitle: `${name} — Markets | DEXI`,
      ogDescription: `Trade ${name} tokens on Solana.`,
    };
  }, [pool?.name]);

  usePageMeta(meta);
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<bigint>(BigInt(0));
  const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0));
  const [copied, setCopied] = useState(false);
  const [slippage, setSlippage] = useState(1.0);
  const [poolUsdcVault, setPoolUsdcVault] = useState<string | null>(null);
  const [poolTokenVault, setPoolTokenVault] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'1H' | '4H' | '1D' | '1W' | '1M'>('1D');
  const [swapFeeBps, setSwapFeeBps] = useState(30);

  const fetchPool = useCallback(async () => {
    if (!mintParam) return;
    try {
      const [poolPda] = await findPoolPda({ mint: mintParam as any });
      const response = await getRpc().getAccountInfo(poolPda, { encoding: 'base64', commitment: 'confirmed' }).send();

      if (!response || !response.value) return;

      const decoded = decodeAthletePool({
        address: poolPda,
        data: new Uint8Array(Buffer.from(response.value.data[0], response.value.data[1] as any)),
        exists: true,
      } as any).data;

      const [configPda] = await findConfigPda();
      const configInfo = await getConnection().getAccountInfo(new PublicKey(configPda));
      if (!configInfo) throw new Error("Config not found");
      const configData = decodeAdminConfig({
        address: configPda,
        data: new Uint8Array(configInfo.data),
        exists: true,
      } as any).data;

      const usdcMint = new PublicKey(configData.usdcMint);
      const poolMint = new PublicKey(mintParam);
      const poolAuth = new PublicKey(poolPda);

      const poolTokenVault = getAssociatedTokenAddressSync(poolMint, poolAuth, true);
      const poolUsdcVault = getAssociatedTokenAddressSync(usdcMint, poolAuth, true);

      setPoolUsdcVault(poolUsdcVault.toBase58());
      setPoolTokenVault(poolTokenVault.toBase58());

      const accountInfos = await getConnection().getMultipleAccountsInfo([poolTokenVault, poolUsdcVault]);

      let poolTokens = BigInt(0);
      let poolUsdc = BigInt(0);
      let price = 0;

      if (accountInfos[0] && accountInfos[1]) {
        const tokenAccount = AccountLayout.decode(accountInfos[0].data);
        const usdcAccount = AccountLayout.decode(accountInfos[1].data);
        poolTokens = tokenAccount.amount;
        poolUsdc = usdcAccount.amount;

        if (poolTokens > BigInt(0)) {
          price = Number(poolUsdc) / Number(poolTokens);
        }
      }

      setSwapFeeBps(configData.swapFeeBps);

      setPool({
        mint: decoded.mint.toString(),
        name: decoded.name,
        role: decoded.role,
        enabled: decoded.enabled,
        poolUsdc,
        poolTokens,
        price: price || 1.0,
      });

    } catch (err) {
      console.error("Failed to fetch pool details:", err);
      setPool({
        mint: mintParam,
        name: 'Unknown Athlete',
        role: 3,
        enabled: false,
        price: 0,
      });
    }
  }, [mintParam]);

  useEffect(() => {
    fetchPool();
  }, [fetchPool]);

  useEffect(() => {
    async function fetchBalances() {
      if (!connected || !publicKey) return;
      try {
        const [configPda] = await findConfigPda();
        const configInfo = await getConnection().getAccountInfo(new PublicKey(configPda));
        if (!configInfo) throw new Error("Config not found");
        const configData = decodeAdminConfig({
          address: configPda,
          data: new Uint8Array(configInfo.data),
          exists: true,
        } as any).data;

        const userKey = new PublicKey(publicKey.toString());
        const usdcMintKey = new PublicKey(configData.usdcMint);
        const poolMintKey = new PublicKey(mintParam);

        const userUsdcAta = getAssociatedTokenAddressSync(usdcMintKey, userKey, true);
        const userTokenAta = getAssociatedTokenAddressSync(poolMintKey, userKey, true);

        const accountInfos = await getConnection().getMultipleAccountsInfo([userUsdcAta, userTokenAta]);

        let usdcBal = BigInt(0);
        let tokenBal = BigInt(0);

        if (accountInfos[0]) {
          usdcBal = AccountLayout.decode(accountInfos[0].data).amount;
        }
        if (accountInfos[1]) {
          tokenBal = AccountLayout.decode(accountInfos[1].data).amount;
        }

        setUsdcBalance(usdcBal);
        setTokenBalance(tokenBal);
      } catch (error) {
        console.error('Error fetching balances:', error);
      }
    }
    if (connected && publicKey) {
      fetchBalances();
    }
  }, [connected, publicKey]);

  const poolTrades = usePoolTrades({
    poolUsdcVault: poolUsdcVault || '',
    poolTokenVault: poolTokenVault || '',
    initialPrice: pool?.price,
    enabled: !!pool && !!poolUsdcVault && !!poolTokenVault,
  });

  const handleBuy = async () => {
    if (!connected || !publicKey || !sendTransaction || !pool) {
      setVisible(true);
      return;
    }

    const amount = parseFloat(buyAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (BigInt(Math.floor(amount * 1_000_000)) > usdcBalance) {
      toast.error('Insufficient USDC balance');
      return;
    }

    setLoading(true);
    try {
      const [configPda] = await findConfigPda();
      const userKey = new PublicKey(publicKey.toString());
      const configInfo = await getConnection().getAccountInfo(new PublicKey(configPda));
      if (!configInfo) throw new Error("Config not found");
      const configData = decodeAdminConfig({
        address: configPda,
        data: new Uint8Array(configInfo.data),
        exists: true,
      } as any).data;
      const usdcMintKey = new PublicKey(configData.usdcMint);
      const poolMintKey = new PublicKey(mintParam);
      const [poolAddress] = await findPoolPda({ mint: poolMintKey.toString() as any });
      const poolKey = new PublicKey(poolAddress);

      const userUsdcAta = getAssociatedTokenAddressSync(usdcMintKey, userKey, true);
      const userTokenAta = getAssociatedTokenAddressSync(poolMintKey, userKey, true);
      const poolTokenVault = getAssociatedTokenAddressSync(poolMintKey, poolKey, true);
      const poolUsdcVault = getAssociatedTokenAddressSync(usdcMintKey, poolKey, true);

      const usdcAmount = BigInt(Math.floor(amount * (10 ** 6)));
      const swapFeeBpsVal = configData.swapFeeBps;

      // Pre-check: pool must have tokens to sell
      const poolTok = pool.poolTokens;
      const poolUsd = pool.poolUsdc;
      if (!poolTok || poolTok <= BigInt(0)) {
        toast.error('Pool has no liquidity');
        setLoading(false);
        return;
      }
      if (!poolUsd || poolUsd <= BigInt(0)) {
        toast.error('Pool has no USDC reserves');
        setLoading(false);
        return;
      }
      const fee = usdcAmount * BigInt(swapFeeBpsVal) / BigInt(10000);
      const dyAfterFee = usdcAmount - fee;
      if (dyAfterFee <= BigInt(0)) {
        toast.error('Trade amount too small after fees');
        setLoading(false);
        return;
      }
      const outputTokens = (poolTok * dyAfterFee) / (poolUsd + dyAfterFee);
      if (outputTokens <= BigInt(0)) {
        toast.error('Trade amount too small, try increasing the amount');
        setLoading(false);
        return;
      }

      const buyIx = getBuyInstruction({
        config: configPda.toString() as any,
        pool: poolAddress as any,
        userUsdcAta: userUsdcAta.toBase58() as any,
        userTokenAta: userTokenAta.toBase58() as any,
        poolTokenVault: poolTokenVault.toBase58() as any,
        poolUsdcVault: poolUsdcVault.toBase58() as any,
        poolAuthority: poolAddress as any,
        user: userKey.toBase58() as any,
        usdcAmount: usdcAmount as any,
        tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as any,
        associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as any,
        systemProgram: '11111111111111111111111111111111' as any,
      });

      const instructions: any[] = [];

      const userUsdcAtaInfo = await getConnection().getAccountInfo(userUsdcAta);
      if (!userUsdcAtaInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(userKey, userUsdcAta, userKey, usdcMintKey)
        );
      }

      const userTokenAtaInfo = await getConnection().getAccountInfo(userTokenAta);
      if (!userTokenAtaInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(userKey, userTokenAta, userKey, poolMintKey)
        );
      }

      const instruction = new TransactionInstruction({
        programId: new PublicKey(buyIx.programAddress),
        keys: buyIx.accounts.map(a => ({
          pubkey: new PublicKey(a.address),
          isSigner: (a as any).role >= 2,
          isWritable: (a as any).role === 1 || (a as any).role === 3,
        })),
        data: Buffer.from(buyIx.data)
      });
      instructions.push(instruction);

      const { context: { slot }, value: { blockhash, lastValidBlockHeight } } = await getConnection().getLatestBlockhashAndContext();
      const messageV0 = new TransactionMessage({
        payerKey: userKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);

      try {
        const simResult = await getConnection().simulateTransaction(transaction, {
          sigVerify: false,
        });
        if (simResult.value.err) {
          console.error('Simulation error:', simResult.value.logs);
          const errorLogs = simResult.value.logs || [];
          const anchorLog = errorLogs.find((log: string) => log.includes('AnchorError'));
          const msg = anchorLog
            ? anchorLog.split('Error Message: ')[1]?.split('.')[0] || 'Insufficient liquidity'
            : 'Transaction simulation failed';
          throw new Error(msg);
        }
      } catch (simError) {
        console.error('Simulation failed:', simError);
        toast.error(simError instanceof Error ? simError.message : 'Transaction would fail');
        setLoading(false);
        return;
      }

      const signature = await sendTransaction(transaction, getConnection(), {
        minContextSlot: slot,
      });
      await getConnection().confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      toast.success(`Bought ${amount} USDC worth of ${pool.name}!`);
      setBuyAmount('');
      fetchPool();
      poolTrades.refresh();
    } catch (error) {
      console.error(error);
      if (error instanceof Error && error.name === 'WalletSendTransactionError') {
        toast.error('Transaction cancelled or timed out. Please try again.');
      } else {
        toast.error(error instanceof Error ? error.message : 'Transaction failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    if (!connected || !publicKey || !sendTransaction || !pool) {
      setVisible(true);
      return;
    }

    const amount = parseFloat(sellAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (BigInt(Math.floor(amount * 1_000_000)) > tokenBalance) {
      toast.error('Insufficient balance');
      return;
    }

    setLoading(true);
    try {
      const [configPda] = await findConfigPda();
      const userKey = new PublicKey(publicKey.toString());
      const configInfo = await getConnection().getAccountInfo(new PublicKey(configPda));
      if (!configInfo) throw new Error("Config not found");
      const configData = decodeAdminConfig({
        address: configPda,
        data: new Uint8Array(configInfo.data),
        exists: true,
      } as any).data;
      const usdcMintKey = new PublicKey(configData.usdcMint);
      const poolMintKey = new PublicKey(mintParam);
      const [poolAddress] = await findPoolPda({ mint: poolMintKey.toString() as any });
      const poolKey = new PublicKey(poolAddress);

      const userUsdcAta = getAssociatedTokenAddressSync(usdcMintKey, userKey, true);
      const userTokenAta = getAssociatedTokenAddressSync(poolMintKey, userKey, true);
      const poolTokenVault = getAssociatedTokenAddressSync(poolMintKey, poolKey, true);
      const poolUsdcVault = getAssociatedTokenAddressSync(usdcMintKey, poolKey, true);

      const tokenAmount = BigInt(Math.floor(amount * 1_000_000));
      const swapFeeBpsVal = configData.swapFeeBps;

      // Pre-check: pool must have USDC to pay out
      const poolUsd = pool.poolUsdc;
      const poolTok = pool.poolTokens;
      if (!poolUsd || poolUsd <= BigInt(0)) {
        toast.error('Pool has no USDC liquidity');
        setLoading(false);
        return;
      }
      if (!poolTok || poolTok <= BigInt(0)) {
        toast.error('Pool has no token reserves');
        setLoading(false);
        return;
      }
      const fee = tokenAmount * BigInt(swapFeeBpsVal) / BigInt(10000);
      const dxAfterFee = tokenAmount - fee;
      if (dxAfterFee <= BigInt(0)) {
        toast.error('Trade amount too small after fees');
        setLoading(false);
        return;
      }
      const outputUsdc = (poolUsd * dxAfterFee) / (poolTok + dxAfterFee);
      if (outputUsdc <= BigInt(0)) {
        toast.error('Trade amount too small, try increasing the amount');
        setLoading(false);
        return;
      }

      const sellIx = getSellInstruction({
        config: configPda.toString() as any,
        pool: poolAddress as any,
        userUsdcAta: userUsdcAta.toBase58() as any,
        userTokenAta: userTokenAta.toBase58() as any,
        poolTokenVault: poolTokenVault.toBase58() as any,
        poolUsdcVault: poolUsdcVault.toBase58() as any,
        poolAuthority: poolAddress as any,
        user: userKey.toBase58() as any,
        tokenAmount: tokenAmount as any,
        tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as any,
        associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as any,
        systemProgram: '11111111111111111111111111111111' as any,
      });

      const instructions: any[] = [];

      const userUsdcAtaInfo = await getConnection().getAccountInfo(userUsdcAta);
      if (!userUsdcAtaInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(userKey, userUsdcAta, userKey, usdcMintKey)
        );
      }

      const userTokenAtaInfo = await getConnection().getAccountInfo(userTokenAta);
      if (!userTokenAtaInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(userKey, userTokenAta, userKey, poolMintKey)
        );
      }

      const instruction = new TransactionInstruction({
        programId: new PublicKey(sellIx.programAddress),
        keys: sellIx.accounts.map(a => ({
          pubkey: new PublicKey(a.address),
          isSigner: (a as any).role >= 2,
          isWritable: (a as any).role === 1 || (a as any).role === 3,
        })),
        data: Buffer.from(sellIx.data)
      });
      instructions.push(instruction);

      const { context: { slot }, value: { blockhash, lastValidBlockHeight } } = await getConnection().getLatestBlockhashAndContext();
      const messageV0 = new TransactionMessage({
        payerKey: userKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);

      try {
        const simResult = await getConnection().simulateTransaction(transaction, {
          sigVerify: false,
        });
        if (simResult.value.err) {
          console.error('Simulation error:', simResult.value.logs);
          const errorLogs = simResult.value.logs || [];
          const anchorLog = errorLogs.find((log: string) => log.includes('AnchorError'));
          const msg = anchorLog
            ? anchorLog.split('Error Message: ')[1]?.split('.')[0] || 'Insufficient liquidity'
            : 'Transaction simulation failed';
          throw new Error(msg);
        }
      } catch (simError) {
        console.error('Simulation failed:', simError);
        toast.error(simError instanceof Error ? simError.message : 'Transaction would fail');
        setLoading(false);
        return;
      }

      const signature = await sendTransaction(transaction, getConnection(), {
        minContextSlot: slot,
      });
      await getConnection().confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      toast.success(`Sold ${amount} ${pool.name}!`);
      setSellAmount('');
      fetchPool();
      poolTrades.refresh();
    } catch (error) {
      console.error(error);
      if (error instanceof Error && error.name === 'WalletSendTransactionError') {
        toast.error('Transaction cancelled or timed out. Please try again.');
      } else {
        toast.error(error instanceof Error ? error.message : 'Transaction failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateBuyOutput = (usdcInput: number, poolTokens: bigint, poolUsdc: bigint, swapFeeBps: number) => {
    if (poolTokens <= BigInt(0) || poolUsdc <= BigInt(0) || usdcInput <= 0) return 0;
    const dy = BigInt(Math.floor(usdcInput * 1_000_000));
    if (dy <= BigInt(0)) return 0;
    const fee = dy * BigInt(swapFeeBps) / BigInt(10000);
    const dyAfterFee = dy - fee;
    if (dyAfterFee <= BigInt(0)) return 0;
    const dx = (poolTokens * dyAfterFee) / (poolUsdc + dyAfterFee);
    return Number(dx) / 1_000_000;
  };

  const calculateSellOutput = (tokenInput: number, poolTokens: bigint, poolUsdc: bigint, swapFeeBps: number) => {
    if (poolTokens <= BigInt(0) || poolUsdc <= BigInt(0) || tokenInput <= 0) return 0;
    const dx = BigInt(Math.floor(tokenInput * 1_000_000));
    if (dx <= BigInt(0)) return 0;
    const fee = dx * BigInt(swapFeeBps) / BigInt(10000);
    const dxAfterFee = dx - fee;
    if (dxAfterFee <= BigInt(0)) return 0;
    const dy = (poolUsdc * dxAfterFee) / (poolTokens + dxAfterFee);
    return Number(dy) / 1_000_000;
  };

  const copyToClipboard = () => {
    if (pool?.mint) {
      navigator.clipboard.writeText(pool.mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Address copied to clipboard');
    }
  };

  const formatTradeTime = (timestamp: number): string => {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  if (!pool) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-6 w-32" />
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-16 rounded-full" />
              <div className="space-y-3">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <Skeleton className="h-8 w-40" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-[450px] rounded-xl" />
              <div className="grid grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
              <Skeleton className="h-64 rounded-xl" />
            </div>
            <Skeleton className="h-[500px] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <a href="/markets" className="hover:text-white transition-colors">Markets</a>
          <span>/</span>
          <span className="text-white">{pool.name}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 bg-white/[0.02] border border-white/[0.06] rounded-xl p-6">
          <div className="flex items-center gap-5">
            {pool.image ? (
              <img src={pool.image} alt={pool.name} className="w-16 h-16 rounded-full object-cover border border-white/[0.12]" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white/[0.06] flex items-center justify-center">
                <span className="text-2xl font-black text-white">{pool.name[0]}</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">{pool.name}</h1>
                <Badge className={`${ROLE_COLORS[ROLE_LABELS[pool.role]]} text-white border-none px-2 py-0.5 text-xs`}>
                  {ROLE_LABELS[pool.role]}
                </Badge>
                {!pool.enabled && <Badge variant="destructive">Disabled</Badge>}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="font-mono text-sm">{pool.mint.slice(0, 6)}...{pool.mint.slice(-4)}</span>
                <button onClick={copyToClipboard} className="hover:text-white transition-colors p-1 rounded-md hover:bg-white/[0.08]">
                  {copied ? <Check className="w-4 h-4 text-positive" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="text-right ml-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Current Price</p>
            <p className="text-3xl font-mono font-black text-positive tabular-nums">
              ${!poolTrades.currentPrice && poolTrades.currentPrice !== 0
                ? (pool.price && pool.price < 0.01 ? pool.price.toFixed(6) : pool.price?.toFixed(2))
                : (poolTrades.currentPrice < 0.01 ? poolTrades.currentPrice.toFixed(6) : poolTrades.currentPrice.toFixed(2))}
            </p>
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column (Chart & Info) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-white">Price Chart</span>
                </div>
                <div className="flex gap-1 bg-white/[0.04] p-0.5 rounded-lg">
                  {(['1H', '4H', '1D', '1W', '1M'] as const).map(tf => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        timeframe === tf
                          ? 'bg-white/[0.08] text-white'
                          : 'text-muted-foreground hover:bg-white/[0.04] hover:text-white'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              <CandlestickChart
                height={450}
                className="w-full"
                priceHistory={poolTrades.priceHistory}
                timeframe={timeframe}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                <p className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider mb-1">Pool USDC</p>
                <p className="text-lg font-mono font-bold text-white">${formatUSDC(pool.poolUsdc || BigInt(0))}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                <p className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider mb-1">Pool Tokens</p>
                <p className="text-lg font-mono font-bold text-white">{formatTokenAmount(pool.poolTokens || BigInt(0), 6)}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                <p className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider mb-1">Market Cap</p>
                <p className="text-lg font-mono font-bold text-white">
                  ${pool.price && pool.poolTokens ? formatUSDC(BigInt(Math.floor(Number(pool.poolTokens) * pool.price))) : '0.00'}
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                <p className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider mb-1">24h Vol</p>
                <p className="text-lg font-mono font-bold text-white">N/A</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="p-4 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Recent Trades
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-muted-foreground">
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">Time</th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">Type</th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">Price</th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-right">Amount</th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03] font-mono">
                    {poolTrades.loading && poolTrades.trades.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          Loading trades...
                        </td>
                      </tr>
                    ) : poolTrades.trades.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          No recent trades yet
                        </td>
                      </tr>
                    ) : (
                      poolTrades.trades.slice(0, 20).map((trade) => (
                        <tr key={trade.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">
                            {formatTradeTime(trade.timestamp)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              trade.type === 'buy'
                                ? 'bg-positive/10 text-positive'
                                : 'bg-negative/10 text-negative'
                            }`}>
                              {trade.type === 'buy' ? 'BUY' : 'SELL'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-white">
                            ${trade.price.toFixed(6)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-white">
                            {trade.tokenAmount.toFixed(4)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">
                            ${trade.usdcAmount.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column (Trade Panel) */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] sticky top-24">
              <div className="p-5">
                <Tabs defaultValue="buy" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-5 bg-white/[0.04] p-0.5 rounded-lg">
                    <TabsTrigger
                      value="buy"
                      className="rounded-md data-[state=active]:bg-positive/15 data-[state=active]:text-positive data-[state=active]:font-bold transition-all text-sm py-1.5"
                    >
                      Buy
                    </TabsTrigger>
                    <TabsTrigger
                      value="sell"
                      className="rounded-md data-[state=active]:bg-negative/15 data-[state=active]:text-negative data-[state=active]:font-bold transition-all text-sm py-1.5"
                    >
                      Sell
                    </TabsTrigger>
                  </TabsList>

                  {/* BUY TAB */}
                  <TabsContent value="buy" className="space-y-4 mt-0">
                    <div className="flex justify-between items-end">
                      <Label className="text-xs text-muted-foreground font-semibold">You Pay</Label>
                      <span className="text-xs text-muted-foreground">
                        Balance: <span className="text-white font-mono">${formatUSDC(usdcBalance)}</span>
                      </span>
                    </div>

                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-400 font-bold text-[10px] border border-blue-500/20">
                        $
                      </div>
                      <Input
                        type="number"
                        placeholder="0.00"
                        className="pl-10 pr-14 h-12 bg-white/[0.03] border-white/[0.08] text-lg font-mono text-white focus-visible:ring-positive"
                        value={buyAmount}
                        onChange={(e) => setBuyAmount(e.target.value)}
                      />
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/[0.06] hover:bg-white/[0.1] text-[10px] font-bold px-2 py-1 rounded text-white transition-colors">
                        MAX
                      </button>
                    </div>

                    <div className="flex justify-between items-end">
                      <Label className="text-xs text-muted-foreground font-semibold">You Receive (Est.)</Label>
                    </div>

                    <div className="relative">
                      {pool.image ? (
                        <img src={pool.image} alt={pool.name} className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center font-bold text-[10px] text-white">
                          {pool.name[0]}
                        </div>
                      )}
                      <div className="pl-10 h-12 bg-white/[0.03] border border-white/[0.06] rounded-lg flex items-center text-lg font-mono text-white">
                        {buyAmount && parseFloat(buyAmount) > 0
                          ? calculateBuyOutput(parseFloat(buyAmount), pool.poolTokens || BigInt(0), pool.poolUsdc || BigInt(0), swapFeeBps).toFixed(4)
                          : '0.0000'}
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-3 border-t border-white/[0.06]">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Slippage Tolerance</span>
                        <div className="flex gap-1">
                          {[0.5, 1.0, 2.0].map(val => (
                            <button
                              key={val}
                              onClick={() => setSlippage(val)}
                              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                slippage === val
                                  ? 'bg-white/[0.08] text-white'
                                  : 'text-muted-foreground hover:text-white'
                              }`}
                            >
                              {val}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Price Impact</span>
                        <span className="text-positive font-mono">&lt; 0.1%</span>
                      </div>
                    </div>

                    <Button
                      className="w-full h-12 text-base font-bold rounded-lg bg-positive hover:bg-positive/90 text-black transition-all"
                      onClick={handleBuy}
                      disabled={loading || !buyAmount || parseFloat(buyAmount) <= 0}
                    >
                      {loading ? 'Swapping...' : !connected ? 'Connect Wallet' : 'Buy Tokens'}
                    </Button>
                  </TabsContent>

                  {/* SELL TAB */}
                  <TabsContent value="sell" className="space-y-4 mt-0">
                    <div className="flex justify-between items-end">
                      <Label className="text-xs text-muted-foreground font-semibold">You Pay</Label>
                      <span className="text-xs text-muted-foreground">
                        Balance: <span className="text-white font-mono">{formatTokenAmount(tokenBalance, 6)}</span>
                      </span>
                    </div>

                    <div className="relative">
                      {pool.image ? (
                        <img src={pool.image} alt={pool.name} className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center font-bold text-[10px] text-white">
                          {pool.name[0]}
                        </div>
                      )}
                      <Input
                        type="number"
                        placeholder="0.00"
                        className="pl-10 pr-14 h-12 bg-white/[0.03] border-white/[0.08] text-lg font-mono text-white focus-visible:ring-negative"
                        value={sellAmount}
                        onChange={(e) => setSellAmount(e.target.value)}
                      />
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/[0.06] hover:bg-white/[0.1] text-[10px] font-bold px-2 py-1 rounded text-white transition-colors">
                        MAX
                      </button>
                    </div>

                    <div className="flex justify-between items-end">
                      <Label className="text-xs text-muted-foreground font-semibold">You Receive (Est.)</Label>
                    </div>

                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-400 font-bold text-[10px] border border-blue-500/20">
                        $
                      </div>
                      <div className="pl-10 h-12 bg-white/[0.03] border border-white/[0.06] rounded-lg flex items-center text-lg font-mono text-white">
                        {sellAmount && parseFloat(sellAmount) > 0
                          ? calculateSellOutput(parseFloat(sellAmount), pool.poolTokens || BigInt(0), pool.poolUsdc || BigInt(0), swapFeeBps).toFixed(2)
                          : '0.00'}
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-3 border-t border-white/[0.06]">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Slippage Tolerance</span>
                        <div className="flex gap-1">
                          {[0.5, 1.0, 2.0].map(val => (
                            <button
                              key={val}
                              onClick={() => setSlippage(val)}
                              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                slippage === val
                                  ? 'bg-white/[0.08] text-white'
                                  : 'text-muted-foreground hover:text-white'
                              }`}
                            >
                              {val}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Price Impact</span>
                        <span className="text-positive font-mono">&lt; 0.1%</span>
                      </div>
                    </div>

                    <Button
                      className="w-full h-12 text-base font-bold rounded-lg bg-negative hover:bg-negative/90 text-white transition-all"
                      onClick={handleSell}
                      disabled={loading || !sellAmount || parseFloat(sellAmount) <= 0}
                    >
                      {loading ? 'Swapping...' : !connected ? 'Connect Wallet' : 'Sell Tokens'}
                    </Button>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default dynamic(() => Promise.resolve(PoolDetailPage), { ssr: false });

function PoolDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-96 px-4">
          <Skeleton className="h-6 w-32 mx-auto" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-12 w-60 mx-auto" />
        </div>
      </div>
    }>
      <PoolDetailContent />
    </Suspense>
  );
}
