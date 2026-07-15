import { initDB, upsertLeaderboard, getLeaderboard } from './db.ts';

export interface LeaderboardEntry {
  entryAddress: string;
  userAddress: string;
  score: number;
  position: number;
  prizeEstimate: number;
}

export interface LeaderboardData {
  contestAddress: string;
  fixtureId: string;
  updatedAt: number;
  entries: LeaderboardEntry[];
}

async function ensureDB() {
  await initDB();
}

export async function saveLeaderboard(data: LeaderboardData): Promise<void> {
  await ensureDB();
  await upsertLeaderboard(data.contestAddress, data.fixtureId, data.updatedAt, data.entries);
}

export async function readLeaderboard(contestAddress: string): Promise<LeaderboardData | null> {
  await ensureDB();
  return getLeaderboard(contestAddress) as Promise<LeaderboardData | null>;
}
