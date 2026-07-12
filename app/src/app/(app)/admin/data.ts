import type { PoolData, ContestData } from './types';
import { POOL_DISCRIMINATOR_BYTES, CONTEST_DISCRIMINATOR_BYTES } from './types';
import { getRpc } from '@/solana/client';
import { PROGRAM_ID } from '@/solana/client';
import { decodeAthletePool, decodeContest } from '@dexi/sdk';

function uint8ArrayFromBase64(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

export async function fetchPools(): Promise<PoolData[]> {
  const allAccounts = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
    encoding: 'base64',
    commitment: 'confirmed',
  }).send();

  const validPools: PoolData[] = [];

  for (const account of allAccounts) {
    const rawData = account.account.data[0];
    const binaryData = uint8ArrayFromBase64(rawData);

    if (POOL_DISCRIMINATOR_BYTES.every((b, i) => binaryData[i] === b)) {
      try {
        const decoded = decodeAthletePool({
          address: account.pubkey,
          data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
          exists: true,
        } as any).data;
        validPools.push({ mint: decoded.mint.toString(), name: decoded.name, role: decoded.role, enabled: decoded.enabled });
      } catch (e) {
        console.warn("Skipping bad pool account:", account.pubkey, e);
      }
    }
  }

  return validPools;
}

export async function fetchContests(): Promise<ContestData[]> {
  const allAccounts = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
    encoding: 'base64',
    commitment: 'confirmed',
  }).send();

  const validContests: ContestData[] = [];

  for (const account of allAccounts) {
    const rawData = account.account.data[0];
    const binaryData = uint8ArrayFromBase64(rawData);

    if (CONTEST_DISCRIMINATOR_BYTES.every((b, i) => binaryData[i] === b)) {
      try {
        const decoded = decodeContest({
          address: account.pubkey,
          data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
          exists: true,
        } as any).data;
        const statusNum = typeof decoded.status === 'number' ? decoded.status : 0;
        const statusStr = statusNum === 0 ? 'Open' : statusNum === 1 ? 'Locked' : 'Settled';
        validContests.push({
          id: Number(decoded.id),
          startTime: Number(decoded.startTime),
          status: statusStr,
          statusCode: statusNum,
          entryCount: Number(decoded.entryCount),
          prizePool: decoded.prizePool,
          winnerCount: decoded.winnerCount,
          prizeSplit: decoded.prizeSplit.slice(0, decoded.winnerCount),
          name: decoded.name || `Match #${decoded.id}`,
          fixtureId: decoded.fixtureId || '',
        });
      } catch (e) {
        console.warn("Skipping bad contest account:", account.pubkey, e);
      }
    }
  }

  return validContests.sort((a, b) => b.id - a.id);
}
