'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WalletButton } from '@/solana/components/wallet-button';
import { ROLE_LABELS, ROLE_COLORS, rpc, PROGRAM_ID } from '@/solana/client';
import { decodeAthletePool, ATHLETE_POOL_DISCRIMINATOR, AthleteRole } from '@dexi/sdk';
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
            price: 1.0,
            poolUsdc: BigInt(0),
            poolTokens: BigInt(0),
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

  const handleRoleFilterChange = (value: string | null) => {
    if (value) setRoleFilter(value);
  };

  const filteredPools = useMemo(() => {
    return pools.filter(pool => {
      const matchesRole = roleFilter === 'all' || pool.role === parseInt(roleFilter);
      const matchesSearch = pool.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRole && matchesSearch;
    });
  }, [pools, roleFilter, searchQuery]);

  const poolsByRole = useMemo(() => {
    const gk = pools.filter(p => p.role === 0);
    const def = pools.filter(p => p.role === 1);
    const mid = pools.filter(p => p.role === 2);
    const fwd = pools.filter(p => p.role === 3);
    return { gk, def, mid, fwd };
  }, [pools]);

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
              <a href="/markets" className="text-sm font-medium text-foreground">Markets</a>
              {connected && <a href="/admin" className="text-sm font-medium text-muted-foreground hover:text-foreground">Admin</a>}
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
                <CardTitle className="text-3xl">Connect Wallet</CardTitle>
                <CardDescription>
                  Connect your wallet to trade athlete tokens
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <Button size="lg" className="w-full rounded-full" onClick={() => setVisible(true)}>
                  Connect Wallet
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Markets</h2>
                <p className="text-muted-foreground">
                  Trade athlete tokens on the decentralized exchange
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search athletes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={handleRoleFilterChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="0">Goalkeeper</SelectItem>
                  <SelectItem value="1">Defender</SelectItem>
                  <SelectItem value="2">Midfielder</SelectItem>
                  <SelectItem value="3">Forward</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Goalkeepers</CardTitle>
                  <CardDescription>{poolsByRole.gk.length} tokens</CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Defenders</CardTitle>
                  <CardDescription>{poolsByRole.def.length} tokens</CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Midfielders</CardTitle>
                  <CardDescription>{poolsByRole.mid.length} tokens</CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Forwards</CardTitle>
                  <CardDescription>{poolsByRole.fwd.length} tokens</CardDescription>
                </CardHeader>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredPools.map((pool) => (
                <a key={pool.mint} href={`/markets/${pool.mint}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Badge className={ROLE_COLORS[ROLE_LABELS[pool.role]]}>
                          {ROLE_LABELS[pool.role]}
                        </Badge>
                        {!pool.enabled && <Badge variant="destructive">Disabled</Badge>}
                      </div>
                      <CardTitle className="text-lg">{pool.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        <p>Mint: {pool.mint.slice(0, 8)}...</p>
                      </div>
                      <Button className="w-full" variant={pool.enabled ? 'default' : 'outline'} disabled={!pool.enabled}>
                        Trade
                      </Button>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>

            {filteredPools.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No athletes found matching your criteria.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}