'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import { Rocket, TrendingUp, Trophy, List, Zap } from 'lucide-react';
import type { PoolData, ContestData } from './types';
import { STATS, STATUS_PILL } from './types';
import { fetchPools, fetchContests } from './data';

function AdminDashboard() {
  const [pools, setPools] = useState<PoolData[]>([]);
  const [contests, setContests] = useState<ContestData[]>([]);
  const [loading, setLoading] = useState(true);

  useRevolvingTitle(['Admin | DEXI', 'Dashboard | DEXI', 'Manage Protocol | DEXI']);
  usePageMeta({
    title: 'Admin | DEXI',
    description: 'DEXI protocol administration — manage athlete pools, contests, and protocol configuration.',
    ogTitle: 'Admin — DEXI',
    ogDescription: 'DEXI protocol administration.',
  });

  useEffect(() => {
    async function load() {
      try {
        const [p, c] = await Promise.all([fetchPools(), fetchContests()]);
        setPools(p);
        setContests(c);
      } catch (err) {
        console.error("Failed to fetch admin data:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
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

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/launch" className="block">
          <Card className="cursor-pointer hover:border-primary/30 transition-colors">
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
        </Link>

        <Link href="/admin/markets" className="block">
          <Card className="cursor-pointer hover:border-primary/30 transition-colors">
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
        </Link>

        <Link href="/admin/create-contest" className="block">
          <Card className="cursor-pointer hover:border-primary/30 transition-colors">
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
        </Link>

        <Link href="/admin/contests" className="block">
          <Card className="cursor-pointer hover:border-primary/30 transition-colors">
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
        </Link>
      </div>

      {/* Recent Activity */}
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
                    <span className="text-sm font-medium">"{c.name}" Created</span>
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
    </div>
  );
}

export default dynamic(() => Promise.resolve(AdminDashboard), { ssr: false });
