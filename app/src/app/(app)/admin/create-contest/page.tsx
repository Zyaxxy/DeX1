'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { PublicKey, AddressLookupTableProgram, TransactionMessage, VersionedTransaction, SystemProgram, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { getCreateContestInstruction, findConfigPda, findContestPda, decodeAdminConfig } from '@dexi/sdk';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROLE_LABELS, ROLE_COLORS } from '@/solana/client';
import { createContestAction } from '../actions';
import { toast } from 'sonner';
import { Search, Check, Loader2 } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import { useRouter } from 'next/navigation';
import type { PoolData, ContestData } from '../types';
import { fetchPools, fetchContests } from '../data';

function CreateContest() {
  const router = useRouter();

  useRevolvingTitle(['Create Contest | DEXI', 'Admin | DEXI']);
  usePageMeta({
    title: 'Create Contest | DEXI',
    description: 'Set up a new fantasy sports contest with Solana address lookup tables.',
    ogTitle: 'Create Contest — DEXI',
    ogDescription: 'Set up a new fantasy sports contest.',
  });

  const [pools, setPools] = useState<PoolData[]>([]);
  const [contests, setContests] = useState<ContestData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [p, c] = await Promise.all([fetchPools(), fetchContests()]);
        setPools(p);
        setContests(c);
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const [newContestName, setNewContestName] = useState('');
  const [newContestFixtureId, setNewContestFixtureId] = useState('');
  const [newContestStartTime, setNewContestStartTime] = useState('');
  const [newContestWinnerCount, setNewContestWinnerCount] = useState('3');
  const [newContestPrizeSplit, setNewContestPrizeSplit] = useState('50,30,20');
  const [contestDialogOpen, setContestDialogOpen] = useState(false);
  const [selectedPlayerMints, setSelectedPlayerMints] = useState<Set<string>>(new Set());
  const [contestLoading, setContestLoading] = useState(false);
  const [playerPoolSearch, setPlayerPoolSearch] = useState('');

  useEffect(() => {
    if (pools.length > 0) {
      setSelectedPlayerMints(new Set(pools.map(p => p.mint)));
    }
  }, [pools]);

  const togglePlayerMint = (mint: string) => {
    setSelectedPlayerMints(prev => {
      const next = new Set(prev);
      if (next.has(mint)) next.delete(mint);
      else next.add(mint);
      return next;
    });
  };

  const handleCreateContest = async () => {
    if (!newContestStartTime || !newContestWinnerCount || !newContestPrizeSplit || !newContestName) {
      toast.error('Please fill in all fields including contest name');
      return;
    }
    if (selectedPlayerMints.size === 0) { toast.error('Select at least one player pool'); return; }
    const MAX_PLAYERS = 30;
    if (selectedPlayerMints.size > MAX_PLAYERS) { toast.error(`Maximum ${MAX_PLAYERS} players allowed per contest`); return; }

    setContestLoading(true);
    try {
      toast.info('Creating contest on-chain (Address Lookup Table + Deployment)...');
      const res = await createContestAction(
        newContestName,
        newContestFixtureId,
        newContestStartTime,
        newContestWinnerCount,
        newContestPrizeSplit,
        Array.from(selectedPlayerMints),
        contests.length
      );

      if (!res.success) {
        throw new Error(res.error);
      }

      toast.success(`Contest "${newContestName}" created!`);
      setNewContestName('');
      setNewContestFixtureId('');
      setNewContestStartTime('');
      setContestDialogOpen(false);
      router.push('/admin/contests');
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to create contest: ' + error.message);
    } finally {
      setContestLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
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
              <Label>Match Name</Label>
              <Input placeholder="e.g. Germany vs France - QF" value={newContestName} onChange={e => setNewContestName(e.target.value)} />
              <p className="text-xs text-muted-foreground">Display name for the contest shown to users</p>
            </div>

            <div className="space-y-2">
              <Label>Fixture ID (TxLINE)</Label>
              <Input placeholder="TxLINE fixture ID for scoring" value={newContestFixtureId} onChange={e => setNewContestFixtureId(e.target.value)} />
              <p className="text-xs text-muted-foreground">Optional — used by the keeper to fetch live match scores</p>
            </div>

            <div className="space-y-2">
              <Label>Start Date & Time</Label>
              <Input type="datetime-local" value={newContestStartTime} onChange={e => setNewContestStartTime(e.target.value)} />
              <p className="text-xs text-muted-foreground">Contest locks at this time. All entries must be submitted before.</p>
            </div>

            <div className="space-y-2">
              <Label>Number of Winners</Label>
              <Select value={newContestWinnerCount} onValueChange={v => v && setNewContestWinnerCount(v)}>
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
                  if (selectedPlayerMints.size === pools.length) {
                    setSelectedPlayerMints(new Set());
                  } else {
                    setSelectedPlayerMints(new Set(pools.map(p => p.mint)));
                  }
                }}
              >
                {selectedPlayerMints.size === pools.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Select which athlete tokens will be available in this contest</p>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search athletes... (comma-separated names auto-selects)"
                value={playerPoolSearch}
                onChange={e => {
                  const value = e.target.value;
                  if (value.includes(',')) {
                    const parts = value.split(',');
                    const newSearch = (parts.pop() || '').trim();
                    for (const part of parts) {
                      const trimmed = part.trim();
                      if (!trimmed) continue;
                      const matches = pools.filter(p => p.enabled && p.name.toLowerCase().includes(trimmed.toLowerCase()));
                      if (matches.length > 0) {
                        setSelectedPlayerMints(prev => {
                          const next = new Set(prev);
                          matches.forEach(m => next.add(m.mint));
                          return next;
                        });
                      }
                    }
                    setPlayerPoolSearch(newSearch);
                  } else {
                    setPlayerPoolSearch(value);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && playerPoolSearch.trim()) {
                    e.preventDefault();
                    const trimmed = playerPoolSearch.trim();
                    const matches = pools.filter(p => p.enabled && p.name.toLowerCase().includes(trimmed.toLowerCase()));
                    if (matches.length > 0) {
                      setSelectedPlayerMints(prev => {
                        const next = new Set(prev);
                        matches.forEach(m => next.add(m.mint));
                        return next;
                      });
                    }
                    setPlayerPoolSearch('');
                  }
                }}
                className="pl-9"
              />
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></p>
            ) : pools.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No player pools available. Launch tokens first.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {pools.filter(p => {
                  if (!playerPoolSearch) return true;
                  const search = playerPoolSearch.toLowerCase();
                  return p.name.toLowerCase().includes(search) || p.mint.toLowerCase().includes(search) || ROLE_LABELS[p.role]?.toLowerCase().includes(search);
                }).map(p => {
                  const selected = selectedPlayerMints.has(p.mint);
                  const roleLabel = ROLE_LABELS[p.role];
                  const isDisabled = !p.enabled;
                  return (
                    <button
                      key={p.mint}
                      onClick={() => { if (!isDisabled) togglePlayerMint(p.mint); }}
                      title={isDisabled ? 'Pool is disabled — enable it in the Pool Management tab' : ''}
                      className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${
                        selected
                          ? 'border-primary bg-primary/10'
                          : isDisabled
                            ? 'border-border/30 bg-[#181b25]/50 opacity-50 cursor-not-allowed'
                            : 'border-border bg-[#181b25] hover:border-primary/30'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        selected ? 'bg-primary border-primary' : isDisabled ? 'border-muted-foreground/30' : 'border-muted-foreground'
                      }`}>
                        {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{p.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] font-mono text-primary">${p.mint.slice(0, 4)}</span>
                          <span className={`inline-block text-[9px] font-semibold px-1 py-0.5 rounded-full ${ROLE_COLORS[roleLabel]} text-white`}>{roleLabel}</span>
                          {isDisabled && <span className="text-[9px] text-muted-foreground">⚠ disabled</span>}
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
            <Button variant="outline" className="flex-1" onClick={() => {
              setNewContestStartTime('');
              setPlayerPoolSearch('');
            }}>
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
    </div>
  );
}

export default dynamic(() => Promise.resolve(CreateContest), { ssr: false });
