'use client';

import { useState, useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Search, LayoutGrid, List } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import Sparkline from '@/components/charts/sparkline';

import { ROLE_LABELS, ROLE_COLORS, rpc, PROGRAM_ID } from '@/solana/client';
import { decodeAthletePool, ATHLETE_POOL_DISCRIMINATOR } from '@dexi/sdk';
import { getBase58Decoder } from '@solana/kit';

interface PoolInfo {
  mint: string;
  name: string;
  role: number;
  enabled: boolean;
  price?: number;
  poolUsdc?: bigint;
  poolTokens?: bigint;
}

export default function Markets() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    async function fetchPools() {
      try {
        const response = await rpc.getProgramAccounts(PROGRAM_ID.toBase58() as any, {
          filters: [
            { memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(ATHLETE_POOL_DISCRIMINATOR) as any } }
          ]
        }).send();
        
        const formattedPools = response.map((account) => {
          const decoded = decodeAthletePool({
            address: account.pubkey,
            data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
            exists: true,
          } as any).data;

          return {
            mint: decoded.mint.toString(),
            name: decoded.name,
            role: decoded.role,
            enabled: decoded.enabled,
            price: 1.0 + Math.random() * 4, // Mock dynamic price
          };
        });
        
        setPools(formattedPools);
      } catch (err) {
        console.error("Failed to fetch pools:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchPools();
  }, []);

  const filteredPools = useMemo(() => {
    return pools.filter(pool => {
      const matchesRole = roleFilter === 'all' || pool.role === parseInt(roleFilter);
      const matchesSearch = pool.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRole && matchesSearch;
    });
  }, [pools, roleFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-10">
          <h1 className="text-4xl font-black mb-2 text-white">Markets</h1>
          <p className="text-muted-foreground">Trade athlete tokens on the decentralized exchange</p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="glass">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-muted-foreground uppercase">Total Markets</p>
              <p className="text-2xl font-black text-white">{pools.length}</p>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-muted-foreground uppercase">24h Volume</p>
              <p className="text-2xl font-black text-white">$1.2M</p>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-muted-foreground uppercase">Active Traders</p>
              <p className="text-2xl font-black text-white">3,847</p>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-muted-foreground uppercase">Top Gainer</p>
              <p className="text-2xl font-black text-[#00ff88]">+12.4%</p>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              placeholder="Search athletes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 h-12 rounded-full focus-visible:ring-primary focus-visible:border-primary"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 no-scrollbar">
            <Button
              variant={roleFilter === 'all' ? 'default' : 'outline'}
              className={`rounded-full ${roleFilter === 'all' ? 'bg-white text-black hover:bg-white/90' : 'border-white/10 text-muted-foreground'}`}
              onClick={() => setRoleFilter('all')}
            >
              All Roles
            </Button>
            {Object.entries(ROLE_LABELS).map(([key, label]) => (
              <Button
                key={key}
                variant={roleFilter === key ? 'default' : 'outline'}
                className={`rounded-full ${
                  roleFilter === key 
                    ? `${ROLE_COLORS[label].replace('bg-', 'bg-')} text-white hover:opacity-90 border-none` 
                    : 'border-white/10 text-muted-foreground hover:bg-white/5'
                }`}
                onClick={() => setRoleFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-white/10">
            <Button 
              variant="ghost" 
              size="icon" 
              className={`rounded-md ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="w-5 h-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className={`rounded-md ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}
              onClick={() => setViewMode('list')}
            >
              <List className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Card key={i} className="glass">
                <CardContent className="p-6">
                  <div className="flex gap-4 mb-4">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  </div>
                  <Skeleton className="h-10 w-full mb-4" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredPools.length === 0 ? (
          <div className="text-center py-20 glass rounded-3xl">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">No markets found</h3>
            <p className="text-muted-foreground">Try adjusting your filters or search query.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {filteredPools.map((pool, i) => {
              const isUp = Math.random() > 0.5;
              const change = (Math.random() * 10).toFixed(2);
              
              return (
                <motion.div
                  key={pool.mint}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="glass hover:-translate-y-1 hover:border-primary/30 transition-all duration-300 group overflow-hidden">
                    <CardContent className="p-0">
                      <Link href={`/markets/${pool.mint}`} className="block p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center font-bold">
                              {pool.name[0]}
                            </div>
                            <div>
                              <h3 className="font-bold text-white truncate max-w-[120px]">{pool.name}</h3>
                              <Badge className={`${ROLE_COLORS[ROLE_LABELS[pool.role]]} text-white border-none text-[10px] px-1.5 py-0`}>
                                {ROLE_LABELS[pool.role]}
                              </Badge>
                            </div>
                          </div>
                          {!pool.enabled && <Badge variant="destructive" className="text-[10px]">Disabled</Badge>}
                        </div>

                        <div className="py-2 mb-2 flex justify-center">
                          <Sparkline width={180} height={40} color={isUp ? '#00ff88' : '#ff4757'} />
                        </div>

                        <div className="flex items-end justify-between mb-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Price</p>
                            <p className="text-xl font-mono font-bold text-white">${pool.price?.toFixed(2)}</p>
                          </div>
                          <div className={`text-right ${isUp ? 'text-[#00ff88]' : 'text-[#ff4757]'}`}>
                            <p className="text-sm font-bold">{isUp ? '+' : '-'}{change}%</p>
                          </div>
                        </div>

                        {connected ? (
                          <Button className="w-full bg-white/10 hover:bg-primary hover:text-primary-foreground text-white transition-colors">
                            Trade Now
                          </Button>
                        ) : (
                          <Button 
                            className="w-full bg-white/10 hover:bg-white/20 text-white"
                            onClick={(e) => {
                              e.preventDefault();
                              setVisible(true);
                            }}
                          >
                            Connect Wallet
                          </Button>
                        )}
                      </Link>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="p-4 font-medium text-muted-foreground">Player</th>
                    <th className="p-4 font-medium text-muted-foreground">Role</th>
                    <th className="p-4 font-medium text-muted-foreground">Price</th>
                    <th className="p-4 font-medium text-muted-foreground">24h Change</th>
                    <th className="p-4 font-medium text-muted-foreground hidden md:table-cell">Chart</th>
                    <th className="p-4 font-medium text-muted-foreground text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredPools.map((pool) => {
                    const isUp = Math.random() > 0.5;
                    const change = (Math.random() * 10).toFixed(2);
                    
                    return (
                      <tr key={pool.mint} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">
                              {pool.name[0]}
                            </div>
                            <span className="font-bold text-white">{pool.name}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge className={`${ROLE_COLORS[ROLE_LABELS[pool.role]]} text-white border-none`}>
                            {ROLE_LABELS[pool.role]}
                          </Badge>
                        </td>
                        <td className="p-4 font-mono font-bold text-white">
                          ${pool.price?.toFixed(2)}
                        </td>
                        <td className={`p-4 font-bold ${isUp ? 'text-[#00ff88]' : 'text-[#ff4757]'}`}>
                          {isUp ? '+' : '-'}{change}%
                        </td>
                        <td className="p-4 hidden md:table-cell">
                          <Sparkline width={100} height={30} color={isUp ? '#00ff88' : '#ff4757'} />
                        </td>
                        <td className="p-4 text-right">
                          <Link href={`/markets/${pool.mint}`}>
                            <Button size="sm" className="bg-white/10 hover:bg-primary hover:text-primary-foreground text-white">
                              Trade
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}