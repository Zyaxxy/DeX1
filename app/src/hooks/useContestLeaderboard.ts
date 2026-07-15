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
  USER_ENTRY_DISCRIMINATOR,
  decodeUserEntry,
} from '@dexi/sdk';

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

export interface LeaderboardEntry {
  entryAddress: string;
  userAddress: string;
  score: number;
  position: number;
  prizeEstimate: number;
  athleteScores: { [athleteMint: string]: number };
  isCurrentUser: boolean;
}

export interface UseContestLeaderboardResult {
  leaderboard: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
  matchStatus: 'live' | 'finished' | 'upcoming';
  totalEntries: number;
  prizePool: number;
  winnerCount: number;
}

export function useContestLeaderboard(
  contestAddress: string,
  fixtureId: string,
  prizePool: number,
  winnerCount: number,
  currentUserAddress?: string
): UseContestLeaderboardResult {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchStatus, setMatchStatus] = useState<'live' | 'finished' | 'upcoming'>('upcoming');
  const [totalEntries, setTotalEntries] = useState(0);

  const poolMapRef = useRef<Map<string, { name: string; role: number }>>(new Map());

  const fetchPoolMap = useCallback(async () => {
    if (poolMapRef.current.size > 0) return poolMapRef.current;

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
      poolMapRef.current = poolMap;
      return poolMap;
    } catch (err) {
      console.error('Failed to fetch pool map:', err);
      return poolMapRef.current;
    }
  }, []);

  const calculateScores = useCallback(async () => {
    if (!fixtureId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const poolMap = await fetchPoolMap();

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

      setMatchStatus(newMatchStatus);

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
      setTotalEntries(entriesWithScores.length);

      const prizeSplit = winnerCount === 1
        ? [10000]
        : winnerCount === 2
        ? [6000, 4000]
        : winnerCount === 3
        ? [5000, 3000, 2000]
        : [5000, 3000, 1500, 500];

      const rankedEntries: LeaderboardEntry[] = entriesWithScores.map((entry, index) => {
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
        };
      });

      setLeaderboard(rankedEntries);
    } catch (err) {
      console.error('Failed to calculate leaderboard:', err);
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [contestAddress, fixtureId, prizePool, winnerCount, currentUserAddress, fetchPoolMap]);

  useEffect(() => {
    if (!fixtureId) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    calculateScores();

    const interval = setInterval(calculateScores, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fixtureId, calculateScores]);

  return {
    leaderboard,
    loading,
    error,
    matchStatus,
    totalEntries,
    prizePool,
    winnerCount,
  };
}