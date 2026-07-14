'use client';

import { useMemo, useEffect, useRef } from 'react';
import { getBase58Decoder } from '@solana/kit';
import { getRpc, PROGRAM_ID } from '@/solana/client';
import { decodeAthletePool, ATHLETE_POOL_DISCRIMINATOR } from '@dexi/sdk';
import { Leaderboard } from '@/components/contest/leaderboard';
import { useContestLeaderboard, LeaderboardEntry } from '@/hooks/useContestLeaderboard';

interface ContestLeaderboardProps {
  contestAddress: string;
  fixtureId: string;
  prizePool: number;
  winnerCount: number;
  currentUserAddress?: string;
}

export function ContestLeaderboard({
  contestAddress,
  fixtureId,
  prizePool,
  winnerCount,
  currentUserAddress,
}: ContestLeaderboardProps) {
  const { leaderboard, loading, matchStatus } = useContestLeaderboard(
    contestAddress,
    fixtureId,
    prizePool,
    winnerCount,
    currentUserAddress
  );

  const poolMapRef = useRef<Map<string, { name: string; role: number }>>(new Map());

  useEffect(() => {
    async function fetchPoolMap() {
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
      } catch (err) {
        console.error('Failed to fetch pool map:', err);
      }
    }
    fetchPoolMap();
  }, []);

  return (
    <Leaderboard
      entries={leaderboard}
      loading={loading}
      matchStatus={matchStatus}
      poolMap={poolMapRef.current}
      currentUserAddress={currentUserAddress}
    />
  );
}