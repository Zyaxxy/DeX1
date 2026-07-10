'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import Image from 'next/image';
import { TrendingUp, ArrowUp, ArrowDown, Search } from 'lucide-react';
import Navbar from '@/components/layout/navbar';
import { Sidebar, SidebarNavItem } from '@/components/layout/sidebar';
import Sparkline from '@/components/charts/sparkline';
import { useMarketData } from '@/hooks/useMarketData';
import { ROLE_LABELS, ROLE_COLORS } from '@/solana/client';

const ROLE_KEYS = Object.keys(ROLE_LABELS).map(Number).sort((a, b) => a - b);

const SORT_OPTIONS = [
  { value: 'volume', label: 'Volume (24h)' },
  { value: 'price-desc', label: 'Price (High-Low)' },
  { value: 'price-asc', label: 'Price (Low-High)' },
  { value: 'cap', label: 'Market Cap' },
] as const;

function formatPrice(price: number): string {
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(4);
  if (price < 1000) return price.toFixed(2);
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}k`;
  return vol.toFixed(0);
}

function formatTimeAgo(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MarketsPage() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { pools, activities, loading } = useMarketData();

  useRevolvingTitle([
    'Markets | DEXI',
    'Live Athlete Markets | DEXI',
    'Trade Now | DEXI',
    'On-Chain Markets | DEXI',
  ]);

  const [roleFilter, setRoleFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<string>('volume');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const [flashMap, setFlashMap] = useState<Map<string, 'up' | 'down' | null>>(new Map());

  useEffect(() => {
    const newFlash = new Map<string, 'up' | 'down' | null>();
    for (const p of pools) {
      const prev = prevPricesRef.current.get(p.mint);
      if (prev !== undefined && prev !== p.price) {
        newFlash.set(p.mint, p.price > prev ? 'up' : 'down');
      } else {
        newFlash.set(p.mint, null);
      }
      prevPricesRef.current.set(p.mint, p.price);
    }
    setFlashMap(newFlash);
    const timer = setTimeout(() => setFlashMap(new Map()), 1000);
    return () => clearTimeout(timer);
  }, [pools]);

  const filteredPools = useMemo(() => {
    let result = pools.filter(p => {
      if (roleFilter !== null && p.role !== roleFilter) return false;
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case 'price-desc': return b.price - a.price;
        case 'price-asc': return a.price - b.price;
        case 'cap': return (Number(b.poolTokens) * b.price) - (Number(a.poolTokens) * a.price);
        default: return b.volume24h - a.volume24h;
      }
    });

    return result;
  }, [pools, roleFilter, searchQuery, sortBy]);

  const activeCount = pools.length;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          header={
            <>
              <span className="text-[24px] font-[600] font-heading text-white tracking-tighter">Trade</span>
              <p className="font-mono text-[11px] tracking-[0.02em] text-[#c6c9ab]">On-Chain Athlete Markets</p>
            </>
          }
        >
          <div className="flex flex-col px-2 space-y-1">
            <SidebarNavItem href="/markets" icon={TrendingUp} active collapsed={sidebarCollapsed}>Markets</SidebarNavItem>
            <div className={`flex items-center gap-3 px-4 py-2 text-[#c6c9ab] font-mono text-[13px] tracking-[0.02em] cursor-not-allowed ${sidebarCollapsed ? 'justify-center px-2' : ''}`}>
              <ArrowUp className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Research</span>}
            </div>
            <div className={`flex items-center gap-3 px-4 py-2 text-[#c6c9ab] font-mono text-[13px] tracking-[0.02em] cursor-not-allowed ${sidebarCollapsed ? 'justify-center px-2' : ''}`}>
              <ArrowUp className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Leaderboard</span>}
            </div>
          </div>

          {!sidebarCollapsed && (
            <div className="px-6 mt-8">
              <p className="font-mono text-[11px] tracking-[0.02em] text-[#c6c9ab] mb-4 uppercase">Positions</p>
              <div className="flex flex-col space-y-1">
                <button
                  onClick={() => setRoleFilter(null)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-sm text-[13px] font-mono tracking-[0.02em] transition-colors text-left ${
                    roleFilter === null
                      ? 'bg-primary/10 text-primary border-l-2 border-primary'
                      : 'text-[#c6c9ab] hover:text-white hover:bg-surface-container-low'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${roleFilter === null ? 'bg-primary' : 'bg-[#454932]'}`} />
                  All Positions
                </button>
                {ROLE_KEYS.map(key => (
                  <button
                    key={key}
                    onClick={() => setRoleFilter(key)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-sm text-[13px] font-mono tracking-[0.02em] transition-colors text-left ${
                      roleFilter === key
                        ? 'bg-primary/10 text-primary border-l-2 border-primary'
                        : 'text-[#c6c9ab] hover:text-white hover:bg-surface-container-low'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      roleFilter === key ? 'bg-primary' : 'bg-[#454932]'
                    }`} />
                    {ROLE_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={`mt-auto pt-6 ${sidebarCollapsed ? 'px-2' : 'px-6'}`}>
            <Link
              href="/markets"
              className={`block bg-primary text-[#191e00] font-mono text-[13px] font-bold py-2 text-center hover:bg-primary-fixed-dim transition-colors ${sidebarCollapsed ? 'px-0' : 'w-full'}`}
            >
              {!sidebarCollapsed && 'Trade Now'}
            </Link>
          </div>
        </Sidebar>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-3 bg-surface">
          <div className="flex justify-between items-end mb-4 px-1">
            <div>
              <h1 className="text-[40px] font-[700] font-heading text-white leading-[44px] tracking-[-0.02em]">
                Market Board
              </h1>
              <p className="font-mono text-[14px] tracking-[0.02em] text-[#c6c9ab] mt-1">
                {loading ? 'Loading...' : `${activeCount} Live Athlete Markets`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#c6c9ab]" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-44 bg-surface-container-lowest border border-border text-white font-mono text-[13px] py-1.5 pl-8 pr-3 focus:outline-none focus:border-primary transition-colors placeholder:text-[#c6c9ab]"
                />
              </div>
              <div className="flex items-center gap-2 font-mono text-[13px]">
                <span className="text-[#c6c9ab]">Sort:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="bg-surface-container-lowest border border-border text-white py-1.5 pl-2 pr-6 focus:outline-none focus:border-primary cursor-pointer text-[13px]"
                >
                  {SORT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-surface-container-low border border-border p-4 animate-pulse">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-surface-container-highest rounded-sm" />
                      <div className="space-y-2">
                        <div className="h-3 w-16 bg-surface-container-highest rounded-sm" />
                        <div className="h-2.5 w-12 bg-surface-container-highest rounded-sm" />
                      </div>
                    </div>
                    <div className="text-right space-y-1.5">
                      <div className="h-3 w-20 bg-surface-container-highest rounded-sm" />
                      <div className="h-2.5 w-10 bg-surface-container-highest rounded-sm ml-auto" />
                    </div>
                  </div>
                  <div className="h-14 bg-surface-container-highest mb-4 rounded-sm" />
                  <div className="flex justify-between items-center">
                    <div className="h-2.5 w-20 bg-surface-container-highest rounded-sm" />
                    <div className="h-7 w-16 bg-surface-container-highest rounded-sm" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPools.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-12 h-12 rounded-sm bg-surface-container-high flex items-center justify-center mb-4 border border-border">
                <TrendingUp className="w-6 h-6 text-[#c6c9ab]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">No markets found</h3>
              <p className="text-sm text-[#c6c9ab] max-w-xs font-mono">
                {searchQuery || roleFilter !== null
                  ? 'Try adjusting your search or position filter.'
                  : 'No athlete markets have been created yet.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredPools.map((pool, i) => {
                const flash = flashMap.get(pool.mint);
                const changeColor = pool.priceChange >= 0 ? 'text-primary' : 'text-negative';
                const changeIcon = pool.priceChange >= 0 ? '+' : '';
                const sparkColor = pool.priceChange >= 0 ? '#d2f000' : '#ffb4ab';
                const priceHistoryValues = pool.priceHistory.map(p => p.price);

                return (
                  <motion.div
                    key={pool.mint}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.025, duration: 0.2, ease: 'easeOut' }}
                  >
                    <Link
                      href={`/markets/${pool.mint}`}
                      className="block bg-surface-container-low border border-border p-4 flex flex-col hover:bg-surface-container transition-all duration-200 group"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 shrink-0 rounded-sm bg-surface-container-highest flex items-center justify-center font-bold text-base text-white border border-border">
                            {pool.name[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="font-mono text-[14px] font-[700] text-white leading-[20px] truncate">
                              ${pool.name.length > 8 ? pool.name.replace(/\s+/g, '').toUpperCase().slice(0, 7) : pool.name.replace(/\s+/g, '').toUpperCase()}
                            </div>
                            <span className={`inline-block text-[11px] font-mono font-[500] tracking-[0.02em] px-1.5 py-0.5 mt-0.5 text-white ${ROLE_COLORS[ROLE_LABELS[pool.role]]}`}>
                              {ROLE_LABELS[pool.role]}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className={`font-mono text-[14px] font-[700] leading-[20px] tabular-nums transition-colors duration-300 ${
                            flash === 'up' ? 'text-primary' : flash === 'down' ? 'text-negative' : 'text-white'
                          }`}>
                            ${formatPrice(pool.price)}
                          </div>
                          <div className={`font-mono text-[13px] font-[500] tracking-[0.02em] ${changeColor}`}>
                            {changeIcon}{pool.priceChange.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      <div className="h-14 mb-4 bg-surface-container-lowest border-t border-b border-border flex items-center justify-center overflow-hidden">
                        {priceHistoryValues.length > 1 ? (
                          <Sparkline
                            data={priceHistoryValues}
                            width={180}
                            height={48}
                            color={sparkColor}
                          />
                        ) : (
                          <span className="font-mono text-[11px] text-[#c6c9ab]">Awaiting trades...</span>
                        )}
                      </div>

                      <div className="flex justify-between items-center mt-auto">
                        <span className="font-mono text-[12px] text-[#c6c9ab]">
                          Vol: {formatVolume(pool.volume24h)} USDC
                        </span>
                        <span className="font-mono text-[12px] font-[700] tracking-[0.02em] text-white border border-border px-4 py-1 hover:border-primary hover:text-primary transition-colors">
                          Trade
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </main>

        {/* Market Activity Panel */}
        <aside className="w-80 bg-surface-container-lowest border-l border-border hidden xl:flex flex-col shrink-0">
          <div className="p-4 border-b border-border">
            <h3 className="text-[24px] font-[600] font-heading text-white leading-[28px]">Market Activity</h3>
            <p className="font-mono text-[12px] tracking-[0.02em] text-[#c6c9ab]">Live on-chain feed</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
            {activities.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-center px-4">
                <p className="font-mono text-[13px] text-[#c6c9ab]">No recent activity</p>
              </div>
            ) : (
              activities.slice(0, 40).map((act) => (
                <div
                  key={act.id}
                  className="flex justify-between items-center p-2 hover:bg-surface-container-low transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {act.type === 'buy' ? (
                      <ArrowUp className="w-3.5 h-3.5 shrink-0 text-primary" />
                    ) : (
                      <ArrowDown className="w-3.5 h-3.5 shrink-0 text-negative" />
                    )}
                    <div className="min-w-0">
                      <div className="font-mono text-[13px] font-[700] text-white leading-[18px] truncate">
                        ${act.athleteName.length > 8 ? act.athleteName.replace(/\s+/g, '').toUpperCase().slice(0, 7) : act.athleteName.replace(/\s+/g, '').toUpperCase()}
                      </div>
                      <div className="font-mono text-[11px] text-[#c6c9ab]">{act.wallet}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="font-mono text-[13px] font-[700] text-white leading-[18px]">
                      {act.usdcAmount.toFixed(0)} USDC
                    </div>
                    <div className="font-mono text-[11px] text-[#c6c9ab]">{formatTimeAgo(act.timestamp)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
