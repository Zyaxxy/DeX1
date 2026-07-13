'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getBase58Decoder } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import { getRpc, PROGRAM_ID, USDC_DECIMALS } from '@/solana/client';
import {
  decodeAthletePool,
  ATHLETE_POOL_DISCRIMINATOR,
  findContestPda,
  decodeContest,
  ContestStatus,
} from '@dexi/sdk';
import type { EnrichedEntry } from './useUserEntries';

const POINTS = {
  goal: 20,
  assist: 5,
  save: 5,
};

const POLL_INTERVAL = 30000;

export interface TxlineEvent {
  playerId: string;
  action: string;
  minute?: number;
  [key: string]: unknown;
}

export interface ScoreData {
  score: number;
  position: number;
  prizeEstimate: number;
  events: TxlineEvent[];
  matchStatus: 'live' | 'finished' | 'upcoming';
  totalEntries: number;
  athleteScores: { [athleteMint: string]: number };
}

export interface UseLiveScoresResult {
  scores: { [entryAddress: string]: ScoreData };
  loading: boolean;
  error: string | null;
}

export function useLiveScores(entries: EnrichedEntry[]): UseLiveScoresResult {
  const [scores, setScores] = useState<{ [entryAddress: string]: ScoreData }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const poolMapRef = useRef<Map<string, string>>(new Map());
  const allEntriesRef = useRef<EnrichedEntry[]>([]);

  const lockedEntries = useMemo(() => entries.filter(e => e.status === 1), [entries]);

  useEffect(() => {
    allEntriesRef.current = entries;
  }, [entries]);

  const fetchPoolMap = useCallback(async () => {
    if (poolMapRef.current.size > 0) return poolMapRef.current;

    try {
      const response = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
        encoding: 'base64',
        filters: [
          { memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(ATHLETE_POOL_DISCRIMINATOR) as any } },
        ],
      }).send();

      const poolMap = new Map<string, string>();
      for (const account of response) {
        try {
          const data = new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any));
          const decodedPool = decodeAthletePool({
            address: account.pubkey,
            data,
            exists: true,
          } as any).data;
          poolMap.set(decodedPool.mint.toString(), decodedPool.name);
        } catch {
          // Skip bad pool accounts
        }
      }
      poolMapRef.current = poolMap;
      return poolMap;
    } catch (err) {
      console.error('Failed to fetch pool map:', err);
      return poolMapRef.current;
    }
  }, []);

  const fetchScoresForEntry = useCallback(async (
    entry: EnrichedEntry,
    poolMap: Map<string, string>
  ): Promise<{ score: number; events: TxlineEvent[]; matchStatus: 'live' | 'finished' | 'upcoming'; athleteScores: { [key: string]: number } }> => {
    const fixtureId = entry.fixtureId;
    if (!fixtureId) {
      return { score: 0, events: [], matchStatus: 'upcoming', athleteScores: {} };
    }

    try {
      const response = await fetch(`/api/scores/${fixtureId}`);
      if (!response.ok) {
        console.error('Failed to fetch scores:', response.status);
        return { score: 0, events: [], matchStatus: 'upcoming', athleteScores: {} };
      }

      const data = await response.json();
      const rawEvents = Array.isArray(data) ? data : (data.events || []);
      
      const matchStatus: 'live' | 'finished' | 'upcoming' = 
        (data.statusSoccerId === 'F' || data.gameState === 'Ended' || data.statusId === 'F') ? 'finished' :
        (data.statusSoccerId === 'H' || data.gameState === 'InPlay' || data.statusId === 'H') ? 'live' : 'upcoming';

      const playerPoints = new Map<string, number>();
      for (const event of rawEvents) {
        const action = (event.action || '').toLowerCase();
        const playerId = String(event.playerId);
        if (!playerId || !action) continue;

        let pts = playerPoints.get(playerId) || 0;
        if (action.includes('goal')) pts += POINTS.goal;
        if (action.includes('assist')) pts += POINTS.assist;
        if (action.includes('save')) pts += POINTS.save;
        playerPoints.set(playerId, pts);
      }

      const athleteScores: { [key: string]: number } = {};
      let totalScore = 0;

      for (const athlete of entry.athletes) {
        const playerId = poolMap.get(athlete.mint);
        const athleteScore = playerPoints.get(playerId || '') || 0;
        athleteScores[athlete.mint] = athleteScore;
        totalScore += athleteScore;
      }

      const events: TxlineEvent[] = rawEvents.map((e: any) => ({
        playerId: String(e.playerId || ''),
        action: String(e.action || ''),
        minute: e.minute,
      }));

      return { score: totalScore, events, matchStatus, athleteScores };
    } catch (err) {
      console.error('Error fetching scores for fixture:', fixtureId, err);
      return { score: 0, events: [], matchStatus: 'upcoming', athleteScores: {} };
    }
  }, []);

  const calculateScores = useCallback(async () => {
    if (lockedEntries.length === 0) {
      setScores(prev => Object.keys(prev).length === 0 ? prev : {});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const poolMap = await fetchPoolMap();

      const results: { [entryAddress: string]: ScoreData } = {};
      const scoresByFixture: { [fixtureId: string]: { entry: EnrichedEntry; score: number }[] } = {};

      for (const entry of lockedEntries) {
        const result = await fetchScoresForEntry(entry, poolMap);
        
        const fixtureId = entry.fixtureId;
        if (!scoresByFixture[fixtureId]) {
          scoresByFixture[fixtureId] = [];
        }
        scoresByFixture[fixtureId].push({ entry, score: result.score });
      }

      for (const fixtureId in scoresByFixture) {
        const entriesWithScores = scoresByFixture[fixtureId];
        entriesWithScores.sort((a, b) => b.score - a.score);

        for (let i = 0; i < entriesWithScores.length; i++) {
          const { entry, score } = entriesWithScores[i];
          
          const result = await fetchScoresForEntry(entry, poolMap);
          
          const prizeEstimate = entry.prizePool > 0 && entry.winnerCount > 0
            ? calculatePrizeEstimate(entry.prizePool, i + 1, entriesWithScores.length, entry.winnerCount)
            : 0;

          results[entry.entryAddress] = {
            score,
            position: i + 1,
            prizeEstimate,
            events: result.events,
            matchStatus: result.matchStatus,
            totalEntries: entriesWithScores.length,
            athleteScores: result.athleteScores,
          };
        }
      }

      for (const entry of lockedEntries) {
        if (!results[entry.entryAddress]) {
          const result = await fetchScoresForEntry(entry, poolMap);
          results[entry.entryAddress] = {
            score: result.score,
            position: 0,
            prizeEstimate: 0,
            events: result.events,
            matchStatus: result.matchStatus,
            totalEntries: 0,
            athleteScores: result.athleteScores,
          };
        }
      }

      setScores(results);
    } catch (err) {
      console.error('Failed to calculate scores:', err);
      setError('Failed to load live scores');
    } finally {
      setLoading(false);
    }
  }, [lockedEntries, fetchPoolMap, fetchScoresForEntry]);

  useEffect(() => {
    if (lockedEntries.length === 0) {
      setScores(prev => Object.keys(prev).length === 0 ? prev : {});
      return;
    }

    calculateScores();

    const interval = setInterval(calculateScores, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [lockedEntries, calculateScores]);

  return { scores, loading, error };
}

function calculatePrizeEstimate(prizePool: number, position: number, totalEntries: number, winnerCount: number): number {
  if (position > winnerCount || totalEntries === 0 || prizePool === 0) {
    return 0;
  }

  const topPercentage = 0.5;
  const bottomPercentage = 0.3;
  const restPercentage = 0.2;

  const prizeSplit = winnerCount === 1 
    ? [10000]
    : winnerCount === 2 
    ? [6000, 4000]
    : winnerCount === 3
    ? [5000, 3000, 2000]
    : [5000, 3000, 1500, 500];

  if (position <= winnerCount && prizeSplit[position - 1] !== undefined) {
    return (prizePool * prizeSplit[position - 1]) / 10000;
  }

  return 0;
}