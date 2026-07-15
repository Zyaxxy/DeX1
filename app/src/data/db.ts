import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS leaderboards (
      contest_address TEXT PRIMARY KEY,
      fixture_id TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      entries JSONB NOT NULL
    )
  `;
}

export async function upsertLeaderboard(
  contestAddress: string,
  fixtureId: string,
  updatedAt: number,
  entries: any[]
) {
  await sql`
    INSERT INTO leaderboards (contest_address, fixture_id, updated_at, entries)
    VALUES (${contestAddress}, ${fixtureId}, ${updatedAt}, ${JSON.stringify(entries)})
    ON CONFLICT (contest_address)
    DO UPDATE SET fixture_id = EXCLUDED.fixture_id, updated_at = EXCLUDED.updated_at, entries = EXCLUDED.entries
  `;
}

export async function getLeaderboard(contestAddress: string) {
  const rows = await sql`
    SELECT contest_address, fixture_id, updated_at, entries
    FROM leaderboards
    WHERE contest_address = ${contestAddress}
  `;
  if (rows.length === 0) return null;
  const row = rows[0] as any;
  return {
    contestAddress: row.contest_address,
    fixtureId: row.fixture_id,
    updatedAt: Number(row.updated_at),
    entries: row.entries as any[],
  };
}
