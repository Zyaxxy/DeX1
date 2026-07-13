'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getBase58Decoder } from '@solana/kit';
import {
  getRpc,
  PROGRAM_ID,
  CONTEST_STATUS_LABELS,
  formatUSDC,
  formatEstimatedPrizePool,
  formatTimestamp,
  ROLE_LABELS,
} from '@/solana/client';
import {
  USER_ENTRY_DISCRIMINATOR,
  decodeUserEntry,
  decodeContest,
  ContestStatus,
  findEntryPda,
  findContestPda,
  decodeAthletePool,
  ATHLETE_POOL_DISCRIMINATOR,
} from '@dexi/sdk';

export interface AthleteInfo {
  mint: string;
  name: string;
  role: number;
  roleLabel: string;
}

export interface EnrichedEntry {
  entryAddress: string;
  contestAddress: string;
  contestId: number;
  contestName: string;
  contestNumber: number;
  status: number;
  statusLabel: string;
  startTime: number;
  startTimeFormatted: string;
  prizePool: number;
  prizePoolFormatted: string;
  winnerCount: number;
  fixtureId: string;
  entryFee: number;
  athletes: AthleteInfo[];
  claimed: boolean;
  isComplete: boolean;
}

export interface UseUserEntriesResult {
  entries: EnrichedEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useUserEntries(): UseUserEntriesResult {
  const { connected, publicKey } = useWallet();
  const [entries, setEntries] = useState<EnrichedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!connected || !publicKey) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userKey = publicKey.toBase58();
      const response = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
        encoding: 'base64',
        filters: [
          { memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(USER_ENTRY_DISCRIMINATOR) as any } },
        ],
      }).send();

      const decoder = getBase58Decoder();
      const enrichedEntries: EnrichedEntry[] = [];

      for (const account of response) {
        try {
          const data = new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any));
          const decodedEntry = decodeUserEntry({
            address: account.pubkey,
            data,
            exists: true,
          } as any).data;

          if (decodedEntry.user.toString() !== userKey) continue;
          if (!decodedEntry.isComplete) continue;

          const contestAddress = decodedEntry.contest.toString();
          const contestInfo = await getRpc().getAccountInfo(contestAddress as any, { encoding: 'base64' }).send();

          if (!contestInfo || !contestInfo.value) continue;

          const contestData = new Uint8Array(Buffer.from(contestInfo.value.data[0], contestInfo.value.data[1] as any));
          const decodedContest = decodeContest({
            address: contestAddress,
            data: contestData,
            exists: true,
          } as any).data;

          const athletePoolData = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
            encoding: 'base64',
            filters: [
              { memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(ATHLETE_POOL_DISCRIMINATOR) as any } },
            ],
          }).send();

          const poolMap = new Map<string, { name: string; role: number }>();
          for (const poolAcc of athletePoolData) {
            try {
              const poolData = new Uint8Array(Buffer.from(poolAcc.account.data[0], poolAcc.account.data[1] as any));
              const decodedPool = decodeAthletePool({
                address: poolAcc.pubkey,
                data: poolData,
                exists: true,
              } as any).data;
              poolMap.set(decodedPool.mint.toString(), {
                name: decodedPool.name,
                role: decodedPool.role,
              });
            } catch {
              // Skip bad pool accounts
            }
          }

          const athletes: AthleteInfo[] = [];
          for (const athleteMint of decodedEntry.athletes) {
            const mintStr = athleteMint.toString();
            const poolInfo = poolMap.get(mintStr);
            athletes.push({
              mint: mintStr,
              name: poolInfo?.name || 'Unknown',
              role: poolInfo?.role ?? 0,
              roleLabel: ROLE_LABELS[poolInfo?.role ?? 0],
            });
          }

          const statusNum = decodedContest.status === ContestStatus.Open ? 0 
            : decodedContest.status === ContestStatus.Locked ? 1 
            : 2;

          enrichedEntries.push({
            entryAddress: account.pubkey,
            contestAddress,
            contestId: Number(decodedContest.id),
            contestName: decodedContest.name || `Match #${decodedContest.id}`,
            contestNumber: Number(decodedContest.id),
            status: statusNum,
            statusLabel: CONTEST_STATUS_LABELS[statusNum],
            startTime: Number(decodedContest.startTime),
            startTimeFormatted: formatTimestamp(decodedContest.startTime),
            prizePool: Number(decodedContest.prizePool),
            prizePoolFormatted: decodedContest.prizePool > BigInt(0)
              ? formatUSDC(decodedContest.prizePool)
              : formatEstimatedPrizePool(Number(decodedContest.entryCount)),
            winnerCount: decodedContest.winnerCount,
            fixtureId: decodedContest.fixtureId || String(decodedContest.id),
            entryFee: 10,
            athletes,
            claimed: decodedEntry.claimed,
            isComplete: decodedEntry.isComplete,
          });
        } catch {
          // Skip bad entry accounts
        }
      }

      enrichedEntries.sort((a, b) => {
        if (a.status === 0 && b.status !== 0) return -1;
        if (b.status === 0 && a.status !== 0) return 1;
        if (a.status === 1 && b.status === 2) return -1;
        if (b.status === 1 && a.status === 2) return 1;
        return b.contestId - a.contestId;
      });

      setEntries(enrichedEntries);
    } catch (err) {
      console.error('Failed to fetch user entries:', err);
      setError('Failed to load contest entries');
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return { entries, loading, error, refetch: fetchEntries };
}