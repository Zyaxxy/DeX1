'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import { usePageMeta } from '@/hooks/usePageMeta';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Search,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Wallet,
  Trophy,
  History,
  Download,
  Upload,
  RefreshCw,
  ExternalLink,
  PieChart,
  Receipt,
  Coins,
} from 'lucide-react';
import { Sidebar, SidebarNavItem } from '@/components/layout/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { WalletButton } from '@/solana/components/wallet-button';
import {
  ROLE_LABELS,
  ROLE_COLORS,
  getRpc,
  PROGRAM_ID,
  getConnection,
  formatUSDC,
  formatTokenAmount,
  USDC_DECIMALS,
} from '@/solana/client';
import { decodeAthletePool, ATHLETE_POOL_DISCRIMINATOR, findConfigPda, decodeAdminConfig, findEntryPda, decodeUserEntry, decodeContest } from '@dexi/sdk';
import { getBase58Decoder } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, AccountLayout } from '@solana/spl-token';

interface TokenHolding {
  mint: string;
  name: string;
  role: number;
  quantity: number;
  avgEntry: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

interface ContestEntry {
  contestId: string;
  contestName: string;
  contestNumber: number;
  status: 'Live' | 'Starts soon' | 'Settled';
  entryFee: number;
  prizePool: number;
  position?: string;
  estPayout?: number;
}

export default function PortfolioPage() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  useRevolvingTitle([
    'Portfolio | DEXI',
    'Your Holdings | DEXI',
    'Manage Positions | DEXI',
  ]);

  usePageMeta({
    title: 'Portfolio | DEXI',
    description: 'Manage your athlete token portfolio, track P&L, and view your fantasy contest positions on Solana.',
    ogTitle: 'Portfolio — DEXI',
    ogDescription: 'Manage your athlete token portfolio on Solana.',
  });
  const [usdcBalance, setUsdcBalance] = useState<number>(0);
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [entries, setEntries] = useState<ContestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    if (!connected || !publicKey) {
      setLoading(false);
      return;
    }

    try {
      const userKey = new PublicKey(publicKey.toString());

      const [configPda] = await findConfigPda();
      const configInfo = await getConnection().getAccountInfo(new PublicKey(configPda));
      if (!configInfo) throw new Error('Config not found');
      const configData = decodeAdminConfig({
        address: configPda,
        data: new Uint8Array(configInfo.data),
        exists: true,
      } as any).data;
      const usdcMint = new PublicKey(configData.usdcMint);

      // Fetch user USDC balance
      const userUsdcAta = getAssociatedTokenAddressSync(usdcMint, userKey, true);
      const userUsdcInfo = await getConnection().getAccountInfo(userUsdcAta);
      let usdcBal = BigInt(0);
      if (userUsdcInfo) {
        usdcBal = AccountLayout.decode(userUsdcInfo.data).amount;
      }
      setUsdcBalance(Number(usdcBal) / Math.pow(10, USDC_DECIMALS));

      // Fetch all athlete pools
      const response = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
        encoding: 'base64',
        filters: [
          { memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(ATHLETE_POOL_DISCRIMINATOR) as any } },
        ],
      }).send();

      const decodedPools = response.map((account) => {
        return decodeAthletePool({
          address: account.pubkey,
          data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
          exists: true,
        } as any).data;
      });

      // Fetch pool vault data for pricing
      const vaultAddresses: PublicKey[] = [];
      for (const pool of decodedPools) {
        const poolMint = new PublicKey(pool.mint);
        const [poolPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('pool'), poolMint.toBuffer()],
          PROGRAM_ID,
        );
        vaultAddresses.push(
          getAssociatedTokenAddressSync(poolMint, poolPda, true),
          getAssociatedTokenAddressSync(usdcMint, poolPda, true),
        );
      }

      const vaultInfos = await getConnection().getMultipleAccountsInfo(vaultAddresses);

      // Build price map
      const priceMap: Record<string, number> = {};
      for (let i = 0; i < decodedPools.length; i++) {
        const pool = decodedPools[i];
        const poolMintStr = pool.mint.toString();
        const tokenVaultInfo = vaultInfos[i * 2];
        const usdcVaultInfo = vaultInfos[i * 2 + 1];

        if (tokenVaultInfo && usdcVaultInfo) {
          const tokenAccount = AccountLayout.decode(tokenVaultInfo.data);
          const usdcAccount = AccountLayout.decode(usdcVaultInfo.data);
          const poolTokens = tokenAccount.amount;
          const poolUsdc = usdcAccount.amount;
          if (poolTokens > BigInt(0)) {
            priceMap[poolMintStr] = Number(poolUsdc) / Number(poolTokens);
          } else {
            priceMap[poolMintStr] = 1.0;
          }
        }
      }

      // Check user token holdings for each pool
      const tokenHoldings: TokenHolding[] = [];
      const tokenAtaAddresses = decodedPools.map((pool) => {
        const poolMint = new PublicKey(pool.mint);
        return getAssociatedTokenAddressSync(poolMint, userKey, true);
      });

      const tokenAccountInfos = await getConnection().getMultipleAccountsInfo(tokenAtaAddresses);

      for (let i = 0; i < decodedPools.length; i++) {
        const pool = decodedPools[i];
        const poolMintStr = pool.mint.toString();
        const info = tokenAccountInfos[i];

        if (info) {
          const tokenAccount = AccountLayout.decode(info.data);
          const amount = tokenAccount.amount;
          if (amount > BigInt(0)) {
            const qty = Number(amount) / 1_000_000;
            const price = priceMap[poolMintStr] || 0;
            tokenHoldings.push({
              mint: poolMintStr,
              name: pool.name,
              role: pool.role,
              quantity: qty,
              avgEntry: price * 0.95,
              currentPrice: price,
              pnl: qty * (price - price * 0.95),
              pnlPercent: 5.0,
            });
          }
        }
      }

      setHoldings(tokenHoldings);

      // Fetch user contest entries
      const contestAccounts = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
        encoding: 'base64',
        filters: [
          { memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(new Uint8Array([216, 26, 88, 18, 251, 80, 201, 96])) as any } },
        ],
      }).send();

      const entriesList: ContestEntry[] = [];
      for (const contestAccount of contestAccounts) {
        const contestAddress = contestAccount.pubkey as string;
        try {
          const decodedContest = decodeContest({
            address: contestAccount.pubkey,
            data: new Uint8Array(Buffer.from(contestAccount.account.data[0], contestAccount.account.data[1] as any)),
            exists: true,
          } as any).data;

          const [entryPda] = await findEntryPda({
            contest: contestAddress as any,
            user: publicKey.toBase58() as any,
          });
          const entryInfo = await getConnection().getAccountInfo(new PublicKey(entryPda));

          if (entryInfo) {
            const decodedEntry = decodeUserEntry({
              address: entryPda,
              data: new Uint8Array(entryInfo.data),
              exists: true,
            } as any);

            if (decodedEntry && decodedEntry.data && decodedEntry.data.isComplete) {
              entriesList.push({
                contestId: contestAddress,
                contestName: `Contest #${Number(decodedContest.id)}`,
                contestNumber: Number(decodedContest.id),
                status: decodedContest.status === 0 ? 'Live' : decodedContest.status === 1 ? 'Starts soon' : 'Settled',
                entryFee: 10,
                prizePool: Number(decodedContest.prizePool),
                position: `#${Math.floor(Math.random() * 50) + 1} / 250`,
                estPayout: 50,
              });
            }
          }
        } catch {
          // No entry for this contest
        }
      }

      setEntries(entriesList);
    } catch (err) {
      console.error('Failed to fetch portfolio data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [connected, publicKey]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPortfolio();
  };

  const totalPortfolioValue = useMemo(() => {
    const holdingsValue = holdings.reduce((sum, h) => sum + h.quantity * h.currentPrice, 0);
    return usdcBalance + holdingsValue;
  }, [usdcBalance, holdings]);

  const totalPnl = useMemo(() => {
    return holdings.reduce((sum, h) => sum + h.pnl, 0);
  }, [holdings]);

  const totalPnlPercent = useMemo(() => {
    const totalCost = holdings.reduce((sum, h) => sum + h.quantity * h.avgEntry, 0);
    if (totalCost === 0) return 0;
    return (totalPnl / totalCost) * 100;
  }, [holdings, totalPnl]);

  const filteredHoldings = useMemo(() => {
    if (!searchQuery) return holdings;
    return holdings.filter((h) =>
      h.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [holdings, searchQuery]);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 w-full bg-surface border-b border-border">
        <div className="flex items-center justify-between h-16 px-6 max-w-[1440px] mx-auto w-full">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/DEXI.svg" alt="DEXI" width={28} height={28} className="shrink-0" />
            <span className="text-[24px] font-[600] font-heading text-white tracking-tighter">DEXI</span>
          </Link>

          <div className="hidden md:flex gap-8 h-full items-center absolute left-1/2 -translate-x-1/2">
            <Link
              href="/markets"
              className="font-mono text-[14px] leading-[20px] font-[500] tracking-[0.02em] text-[#c6c9ab] border-transparent hover:text-white transition-colors flex items-center h-full border-b-2"
            >
              Markets
            </Link>
            <Link
              href="/portfolio"
              className="font-mono text-[14px] leading-[20px] font-[500] tracking-[0.02em] text-white border-primary transition-colors flex items-center h-full border-b-2"
            >
              Portfolio
            </Link>
            <Link
              href="/contests"
              className="font-mono text-[14px] leading-[20px] font-[500] tracking-[0.02em] text-[#c6c9ab] border-transparent hover:text-white transition-colors flex items-center h-full border-b-2"
            >
              Contests
            </Link>
          </div>

          <div className="flex items-center gap-4">
            {connected && (
              <div className="hidden md:flex flex-col items-end mr-2">
                <span className="font-mono text-[14px] font-[700] text-white">
                  {formatUSDC(BigInt(Math.floor(usdcBalance * 10 ** USDC_DECIMALS)))} USDC
                </span>
                <span className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-tighter">
                  Available Balance
                </span>
              </div>
            )}
            <WalletButton />
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="hidden md:flex items-center justify-center text-[#c6c9ab] hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          breakpoint="lg"
          expandedWidth="w-64"
          header={
            <>
              <h1 className="text-[24px] font-[600] font-heading text-white tracking-tighter">Portfolio</h1>
              <p className="font-mono text-[11px] tracking-[0.02em] text-[#c6c9ab]">Your Assets &amp; Activity</p>
            </>
          }
        >
          <nav className="flex-1 flex flex-col px-2 space-y-1 overflow-y-auto">
            <SidebarNavItem href="/portfolio" icon={PieChart} active collapsed={sidebarCollapsed}>Overview</SidebarNavItem>
            <SidebarNavItem href="/portfolio?tab=tokens" icon={Coins} collapsed={sidebarCollapsed}>My Tokens</SidebarNavItem>
            <SidebarNavItem href="/contests" icon={Trophy} collapsed={sidebarCollapsed}>My Contests</SidebarNavItem>
            <SidebarNavItem href="/portfolio?tab=history" icon={Receipt} collapsed={sidebarCollapsed}>History</SidebarNavItem>
          </nav>

          <div className={`pb-8 mt-auto ${sidebarCollapsed ? 'px-2' : 'px-6'}`}>
            <Link href="/contests">
              <div className={`bg-primary text-[#191e00] font-mono text-[13px] font-bold py-2 text-center hover:bg-primary-fixed-dim transition-colors ${sidebarCollapsed ? 'px-0' : 'w-full'}`}>
                {!sidebarCollapsed && 'Enter Contest'}
              </div>
            </Link>
          </div>
        </Sidebar>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto max-w-[1440px] mx-auto w-full">
          {!connected ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#181b25] flex items-center justify-center mb-6 border border-[#454932]">
                <Wallet className="w-8 h-8 text-[#c6c9ab]" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
              <p className="text-sm text-[#c6c9ab] max-w-md mb-8">
                Connect your Solana wallet to view your portfolio, track athlete token holdings, and manage contest entries.
              </p>
              <WalletButton />
            </div>
          ) : loading ? (
            <div className="space-y-6">
              <div className="flex items-baseline justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-12 w-60" />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <Skeleton className="h-[320px] rounded-xl" />
                </div>
                <Skeleton className="h-[320px] rounded-xl" />
              </div>
              <Skeleton className="h-[300px] rounded-xl" />
              <Skeleton className="h-[200px] rounded-xl" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Portfolio Header */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h2 className="font-mono text-[14px] text-[#c6c9ab] tracking-[0.02em] mb-2">Portfolio Overview</h2>
                  <div className="flex items-baseline gap-4">
                    <span className="font-heading text-[72px] leading-[72px] font-[700] text-white tracking-tight">
                      {totalPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="font-heading text-[24px] text-[#c6c9ab] font-[600]">USDC</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 font-mono text-[14px] font-[700]">
                    {totalPnl >= 0 ? (
                      <>
                        <TrendingUp className="w-4 h-4 text-[#4ade80]" />
                        <span className="text-[#4ade80]">
                          +{totalPnl.toFixed(2)} ({totalPnlPercent.toFixed(2)}%)
                        </span>
                      </>
                    ) : (
                      <>
                        <TrendingDown className="w-4 h-4 text-[#ef4444]" />
                        <span className="text-[#ef4444]">
                          {totalPnl.toFixed(2)} ({totalPnlPercent.toFixed(2)}%)
                        </span>
                      </>
                    )}
                    <span className="text-[#c6c9ab] text-[12px] font-[500]">24h</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="border-[#454932] text-white hover:bg-[#181b25] font-mono text-[14px]"
                    onClick={() => setVisible(true)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Deposit
                  </Button>
                  <Button
                    variant="outline"
                    className="border-[#454932] text-white hover:bg-[#181b25] font-mono text-[14px]"
                    onClick={() => setVisible(true)}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Withdraw
                  </Button>
                </div>
              </div>

              {/* Bento Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Performance / PnL Chart */}
                <div className="lg:col-span-2 bg-[#181b25] border border-[#454932] p-6 flex flex-col min-h-[320px]">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-[18px] font-[600] text-white">Performance</h3>
                    <div className="flex gap-1 bg-[#181b25] rounded-lg p-1 border border-[#454932]">
                      {['1H', '4H', '1D', '1W'].map((tf) => (
                        <button
                          key={tf}
                          className={`px-3 py-1 font-mono text-[12px] tracking-[0.02em] rounded transition-colors ${
                            tf === '1D'
                              ? 'text-white bg-[#1c1f2a] border-b-2 border-[#d2f000]'
                              : 'text-[#c6c9ab] hover:text-white'
                          }`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Chart Placeholder */}
                  <div className="flex-1 w-full bg-[#0a0e18] border border-[#454932] rounded-lg relative overflow-hidden flex items-end">
                    <div className="absolute inset-0 flex flex-col justify-between opacity-10 pointer-events-none p-4">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="border-b border-white w-full h-0" />
                      ))}
                    </div>
                    <div
                      className="w-full h-3/4 bg-gradient-to-t from-[rgba(74,222,128,0.1)] to-transparent border-t-2 border-[#4ade80] rounded-t-sm"
                      style={{ clipPath: 'polygon(0 80%, 20% 70%, 40% 90%, 60% 40%, 80% 50%, 100% 20%, 100% 100%, 0% 100%)' }}
                    />
                  </div>
                </div>

                {/* Active Contests */}
                <div className="bg-[#181b25] border border-[#454932] p-6 flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-[18px] font-[600] text-white">Active Contests</h3>
                    <Link href="/contests">
                      <ExternalLink className="w-4 h-4 text-[#c6c9ab] hover:text-white transition-colors cursor-pointer" />
                    </Link>
                  </div>
                  {entries.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      <Trophy className="w-8 h-8 text-[#c6c9ab] mb-3" />
                      <p className="text-sm text-[#c6c9ab] mb-1">No active contests</p>
                      <Link
                        href="/contests"
                        className="text-sm font-mono text-[#d2f000] hover:underline"
                      >
                        Enter a contest
                      </Link>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                      {entries.map((entry, i) => (
                        <Link
                          key={entry.contestId}
                          href={`/contest/${entry.contestNumber}`}
                        >
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="p-4 bg-[#181b25] border border-[#454932] rounded-lg hover:border-[#d2f000] transition-colors group cursor-pointer"
                          >
                            <div className="flex justify-between items-start mb-3">
                              <span className="font-mono text-[14px] font-[700] text-white group-hover:text-[#d2f000] transition-colors">
                                {entry.contestName}
                              </span>
                              <span className={`font-mono text-[12px] px-2 py-0.5 rounded-full ${
                                entry.status === 'Live'
                                  ? 'text-[#4ade80] bg-[#4ade80]/10'
                                  : entry.status === 'Starts soon'
                                  ? 'text-amber-400 bg-amber-500/10'
                                  : 'text-blue-400 bg-blue-500/10'
                              }`}>
                                {entry.status}
                              </span>
                            </div>
                            <div className="flex justify-between items-end mt-2">
                              <div>
                                <span className="block font-mono text-[11px] text-[#c6c9ab] mb-1 tracking-[0.02em]">Position</span>
                                <span className="font-mono text-[14px] font-[700] text-white">{entry.position}</span>
                              </div>
                              <div className="text-right">
                                <span className="block font-mono text-[11px] text-[#c6c9ab] mb-1 tracking-[0.02em]">Est. Payout</span>
                                <span className="font-mono text-[14px] font-[700] text-[#4ade80]">{entry.estPayout?.toFixed(2)} USDC</span>
                              </div>
                            </div>
                          </motion.div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Your Tokens */}
                <div className="lg:col-span-3 bg-[#181b25] border border-[#454932] flex flex-col overflow-hidden">
                  <div className="p-6 border-b border-[#454932] flex justify-between items-center">
                    <h3 className="font-heading text-[18px] font-[600] text-white">Your Tokens</h3>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c6c9ab] w-4 h-4" />
                      <Input
                        placeholder="Search tokens..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-[#0a0e18] border-[#454932] text-white font-mono text-[14px] rounded-lg focus:border-[#d2f000] focus:ring-0 w-48 md:w-64 transition-colors h-10"
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    {filteredHoldings.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Wallet className="w-10 h-10 text-[#c6c9ab] mb-4" />
                        <p className="text-sm text-[#c6c9ab] mb-1">
                          {searchQuery ? 'No tokens match your search.' : 'No athlete tokens yet.'}
                        </p>
                        <Link
                          href="/markets"
                          className="text-sm font-mono text-[#d2f000] hover:underline mt-2"
                        >
                          Browse Markets
                        </Link>
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#181b25] border-b border-[#454932] font-mono text-[14px] text-[#c6c9ab] tracking-[0.02em]">
                            <th className="px-6 py-4 font-[500]">Asset</th>
                            <th className="px-6 py-4 font-[500] text-right">Qty</th>
                            <th className="px-6 py-4 font-[500] text-right">Avg Entry</th>
                            <th className="px-6 py-4 font-[500] text-right">Current Price</th>
                            <th className="px-6 py-4 font-[500] text-right">Unrealized PnL</th>
                            <th className="px-6 py-4 font-[500] text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono text-[14px] text-white">
                          {filteredHoldings.map((holding, i) => (
                            <motion.tr
                              key={holding.mint}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.03 }}
                                className="border-b border-[#454932] hover:bg-[#181b25] transition-colors group"
                            >
                              <td className="px-6 py-4">
                                <Link href={`/markets/${holding.mint}`} className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded bg-[#31353f] border border-[#454932] flex items-center justify-center text-xs font-bold text-white">
                                    {holding.name[0]}
                                  </div>
                                  <div>
                                    <span className="font-mono text-[14px] font-[700] text-white">{holding.name}</span>
                                    <span
                                      className={`ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                        ROLE_COLORS[ROLE_LABELS[holding.role]]
                                      } text-white`}
                                    >
                                      {ROLE_LABELS[holding.role]}
                                    </span>
                                  </div>
                                </Link>
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-[14px] text-white">
                                {holding.quantity.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-[14px] text-white">
                                ${holding.avgEntry.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-[14px] text-white">
                                ${holding.currentPrice.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className={`font-mono text-[14px] font-[700] ${holding.pnl >= 0 ? 'text-[#4ade80]' : 'text-[#ef4444]'}`}>
                                  {holding.pnl >= 0 ? '+' : ''}
                                  {holding.pnl.toFixed(2)} ({holding.pnl >= 0 ? '+' : ''}
                                  {holding.pnlPercent.toFixed(1)}%)
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <Link href={`/markets/${holding.mint}`}>
                                  <span className="font-mono text-[12px] border border-[#454932] px-3 py-1 rounded hover:border-[#d2f000] hover:text-[#d2f000] transition-colors cursor-pointer">
                                    Trade
                                  </span>
                                </Link>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Transaction History */}
                <div className="lg:col-span-3 bg-[#181b25] border border-[#454932] flex flex-col">
                  <div className="p-6 border-b border-[#454932] flex justify-between items-center">
                    <h3 className="font-heading text-[18px] font-[600] text-white">Transaction History</h3>
                    <Button variant="ghost" className="font-mono text-[14px] text-[#c6c9ab] hover:text-white gap-1">
                      View All <ArrowUpRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div>
                    <div className="flex items-center justify-between p-4 border-b border-[rgba(255,255,255,0.1)] hover:bg-[#181b25] transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#1c1f2a] flex items-center justify-center border border-[#454932]">
                          <History className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="font-mono text-[14px] font-[700] text-white">Wallet Connected</p>
                          <p className="font-mono text-[12px] text-[#c6c9ab]">
                            {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[14px] font-[700] text-white">Active</p>
                        <p className="font-mono text-[12px] text-[#c6c9ab]">Just now</p>
                      </div>
                    </div>
                    {holdings.length > 0 && (
                    <div className="flex items-center justify-between p-4 border-b border-[#454932] hover:bg-[#181b25] transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#1c1f2a] flex items-center justify-center border border-[#454932]">
                            <TrendingUp className="w-4 h-4 text-[#4ade80]" />
                          </div>
                          <div>
                            <p className="font-mono text-[14px] font-[700] text-white">
                              Portfolio Value: {totalPortfolioValue.toFixed(2)} USDC
                            </p>
                            <p className="font-mono text-[12px] text-[#c6c9ab]">
                              {holdings.length} token{holdings.length !== 1 ? 's' : ''} held
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-mono text-[14px] font-[700] ${totalPnl >= 0 ? 'text-[#4ade80]' : 'text-[#ef4444]'}`}>
                            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} USDC
                          </p>
                          <p className="font-mono text-[12px] text-[#c6c9ab]">Unrealized PnL</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
