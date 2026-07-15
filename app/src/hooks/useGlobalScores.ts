'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getBase58Decoder } from '@solana/kit';
import { getRpc, PROGRAM_ID, USDC_DECIMALS } from '@/solana/client';
import {
  decodeAthletePool,
  ATHLETE_POOL_DISCRIMINATOR,
  decodeUserEntry,
  USER_ENTRY_DISCRIMINATOR,
  decodeContest,
  ContestStatus,
} from '@dexi/sdk';
import type { EnrichedEntry } from './useUserEntries';

const POINTS = {
  goal: { 0: 40, 1: 30, 2: 20, 3: 10 },
  assist: 5,
  save: 5,
  cleanSheet: 10,
};

function getGoalPoints(role: number): number {
  return POINTS.goal[role as keyof typeof POINTS.goal] || 10;
}

const POLL_INTERVAL = 30000;

export interface ScoreData {
  score: number;
  position: number;
  prizeEstimate: number;
  matchStatus: 'live' | 'finished' | 'upcoming';
  totalEntries: number;
  athleteScores: { [athleteMint: string]: number };
}

export interface UseGlobalScoresResult {
  scores: { [entryAddress: string]: ScoreData };
  loading: boolean;
  error: string | null;
}

export function useGlobalScores(
  entries: EnrichedEntry[],
  currentUserAddress?: string
): UseGlobalScoresResult {
  const [scores, setScores] = useState<{ [entryAddress: string]: ScoreData }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockedEntries = useMemo(() => entries.filter(e => e.status === 1 || e.status === 2), [entries]);

  const uniqueContests = useMemo(() => {
    const map = new Map<string, EnrichedEntry[]>();
    for (const entry of lockedEntries) {
      const key = entry.contestAddress;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(entry);
    }
    return map;
  }, [lockedEntries]);

  const fetchPoolMap = useCallback(async () => {
    try {
      const response = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
        encoding: 'base64',
        filters: [
          { memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(ATHLETE_POOL_DISCRIMINATOR) as any } },
        ],
      }).send();

      const poolMap = new Map<string, { name: string; role: number }>();
      for (const account of response) {
        try {
          const data = new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any));
          const decodedPool = decodeAthletePool({
            address: account.pubkey,
            data,
            exists: true,
          } as any).data;
          poolMap.set(decodedPool.mint.toString(), { name: decodedPool.name, role: decodedPool.role });
        } catch {
          // Skip bad pool accounts
        }
      }
      return poolMap;
    } catch (err) {
      console.error('Failed to fetch pool map:', err);
      return new Map<string, { name: string; role: number }>();
    }
  }, []);

  const fetchContestLeaderboard = useCallback(async (
    contestAddress: string,
    fixtureId: string,
    prizePool: number,
    winnerCount: number,
    poolMap: Map<string, { name: string; role: number }>
  ) => {
    try {
      const response = await fetch(`/api/scores/${fixtureId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch scores');
      }

      const data = await response.json();
      const rawEvents = Array.isArray(data) ? data : (data.events || []);
      const lastEvent = rawEvents[rawEvents.length - 1];

      const finishedStatuses = ['F', 'FET', 'FPE', 'A', 'C'];
      const newMatchStatus: 'live' | 'finished' | 'upcoming' =
        (lastEvent && (finishedStatuses.includes(lastEvent.statusSoccerId) || lastEvent.gameState === 'Ended' || lastEvent.statusId === '100' || lastEvent.action === 'game_finalised')) ? 'finished' :
        (lastEvent && (lastEvent.statusSoccerId === 'H' || lastEvent.gameState === 'InPlay' || lastEvent.statusId === 'H')) ? 'live' : 'upcoming';

      const playerEvents = new Map<string, string[]>();
      for (const event of rawEvents) {
        const action = String(event.action || '');
        const playerId = String(event.playerId);
        if (!playerId || !action) continue;
        if (!playerEvents.has(playerId)) {
          playerEvents.set(playerId, []);
        }
        playerEvents.get(playerId)!.push(action.toLowerCase());
      }

      const participant1Score = lastEvent?.score?.Participant1?.Score || 0;
      const participant2Score = lastEvent?.score?.Participant2?.Score || 0;

      const accountsResponse = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
        encoding: 'base64',
        filters: [
          { memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(USER_ENTRY_DISCRIMINATOR) as any } },
        ],
      }).send();

      const entriesWithScores: {
        entryAddress: string;
        userAddress: string;
        athleteMints: string[];
        score: number;
        athleteScores: { [key: string]: number };
      }[] = [];

      for (const account of accountsResponse) {
        try {
          const data = new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any));
          const decodedEntry = decodeUserEntry({
            address: account.pubkey,
            data,
            exists: true,
          } as any).data;

          if (decodedEntry.contest.toString() !== contestAddress) continue;
          if (!decodedEntry.isComplete) continue;

          const athleteMints = decodedEntry.athletes.map(a => a.toString());
          const athleteScores: { [key: string]: number } = {};
          let totalScore = 0;

          for (const athleteMint of athleteMints) {
            const role = poolMap.get(athleteMint)?.role || 0;
            const playerId = athleteMint;
            const events = playerEvents.get(playerId) || [];

            let athleteScore = 0;
            for (const action of events) {
              if (action.includes('goal')) {
                athleteScore += getGoalPoints(role);
              }
              if (action.includes('assist')) {
                athleteScore += POINTS.assist;
              }
              if (action.includes('save')) {
                if (role === 0) athleteScore += POINTS.save;
              }
            }

            const opponentScore = role === 0 ? participant2Score : participant1Score;
            if (opponentScore === 0 && (role === 0 || role === 1)) {
              athleteScore += POINTS.cleanSheet;
            }

            athleteScores[athleteMint] = athleteScore;
            totalScore += athleteScore;
          }

          entriesWithScores.push({
            entryAddress: account.pubkey,
            userAddress: decodedEntry.user.toString(),
            athleteMints,
            score: totalScore,
            athleteScores,
          });
        } catch {
          // Skip bad entries
        }
      }

      entriesWithScores.sort((a, b) => b.score - a.score);

      const prizeSplit = winnerCount === 1
        ? [10000]
        : winnerCount === 2
        ? [6000, 4000]
        : winnerCount === 3
        ? [5000, 3000, 2000]
        : [5000, 3000, 1500, 500];

      return entriesWithScores.map((entry, index) => {
        const position = index + 1;
        let prizeEstimate = 0;
        if (position <= winnerCount && prizeSplit[position - 1] !== undefined) {
          prizeEstimate = (prizePool * prizeSplit[position - 1]) / 10000;
        }

        return {
          entryAddress: entry.entryAddress,
          userAddress: entry.userAddress,
          score: entry.score,
          position,
          prizeEstimate,
          athleteScores: entry.athleteScores,
          isCurrentUser: currentUserAddress ? entry.userAddress === currentUserAddress : false,
          matchStatus: newMatchStatus,
          totalEntries: entriesWithScores.length,
        };
      });
    } catch (err) {
      console.error('Failed to fetch contest leaderboard:', err);
      return [];
    }
  }, [currentUserAddress]);

  const calculateScores = useCallback(async () => {
    if (lockedEntries.length === 0) {
      setScores({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const poolMap = await fetchPoolMap();
      const newScores: { [entryAddress: string]: ScoreData } = {};

      for (const [contestAddress, contestEntries] of uniqueContests) {
        const firstEntry = contestEntries[0];
        const fixtureId = firstEntry.fixtureId;
        const prizePool = firstEntry.prizePool;
        const winnerCount = firstEntry.winnerCount;

        const leaderboard = await fetchContestLeaderboard(
          contestAddress,
          fixtureId,
          prizePool,
          winnerCount,
          poolMap
        );

        for (const entry of leaderboard) {
          newScores[entry.entryAddress] = {
            score: entry.score,
            position: entry.position,
            prizeEstimate: entry.prizeEstimate,
            matchStatus: entry.matchStatus,
            totalEntries: entry.totalEntries,
            athleteScores: entry.athleteScores,
          };
        }
      }

      setScores(newScores);
    } catch (err) {
      console.error('Failed to calculate scores:', err);
      setError('Failed to load scores');
    } finally {
      setLoading(false);
    }
  }, [lockedEntries, uniqueContests, fetchPoolMap, fetchContestLeaderboard]);

  useEffect(() => {
    if (lockedEntries.length === 0) {
      setScores({});
      return;
    }

    calculateScores();

    const interval = setInterval(calculateScores, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [lockedEntries, calculateScores]);

  return { scores, loading, error };
}