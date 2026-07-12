'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import { formatUSDC } from '@/solana/client';
import React from 'react';
import type { ContestData } from '../types';
import { STATUS_PILL } from '../types';
import { fetchContests } from '../data';

function Contests() {
  useRevolvingTitle(['Contests | DEXI', 'Admin | DEXI']);
  usePageMeta({
    title: 'Contests | DEXI',
    description: 'Monitor fantasy contests, view entries, and track prize pools.',
    ogTitle: 'Contests — DEXI',
    ogDescription: 'Monitor fantasy contests, view entries, and track prize pools.',
  });

  const [contests, setContests] = useState<ContestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [contestSearch, setContestSearch] = useState('');
  const [contestStatusFilter, setContestStatusFilter] = useState('all');
  const [expandedContest, setExpandedContest] = useState<number | null>(null);

  useEffect(() => {
    fetchContests().then(setContests).catch(err => console.error("Failed to fetch contests:", err)).finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="space-y-4">
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
        <Link href="/admin/create-contest" className="ml-auto">
          <Button variant="outline" size="sm">Create Contest</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contest</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Prize Pool</TableHead>
                <TableHead className="text-right">Winners</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filteredContests.length === 0 ? (
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
                      <TableCell className="font-medium">{c.name}</TableCell>
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
                          <Link href={`/contest/${c.id}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                            View
                          </Link>
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
    </div>
  );
}

export default dynamic(() => Promise.resolve(Contests), { ssr: false });
