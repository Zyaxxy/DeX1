import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';
import {
  getContestDecoder,
  getUserEntryDecoder,
  getAthletePoolDecoder,
  ContestStatus,
} from '@dexi/sdk';
import { CONTEST_DISCRIMINATOR } from '@dexi/sdk';
import { saveLeaderboard } from '../app/src/data/leaderboard';

const PROGRAM_ID = new PublicKey('HLqcxyy9DrVH7DJ2NqTza8Vq6GWB4aUuUSjFWdq5EAmt');

async function main() {
  const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const contestDecoder = getContestDecoder();

  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(Buffer.from(CONTEST_DISCRIMINATOR)) } }],
  });

  console.log(`Found ${accounts.length} contest(s)`);

  for (const { pubkey, account } of accounts) {
    const decoded = contestDecoder.decode(account.data);
    if (decoded.status !== ContestStatus.Settled) {
      console.log(`  Skipping contest #${decoded.id} (status=${decoded.status})`);
      continue;
    }

    const contestAddress = pubkey.toBase58();
    console.log(`\n📋 Contest #${decoded.id} (${contestAddress}) — Settled`);

    const fixtureId = decoded.fixtureId !== undefined && decoded.fixtureId !== null ? String(decoded.fixtureId) : '';
    const winnerCount = decoded.winnerCount;
    const prizePool = Number(decoded.prizePool);

    // Fetch entries for this contest
    const entryAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ memcmp: { offset: 40, bytes: contestAddress } }],
    });
    console.log(`   Entries: ${entryAccounts.length}`);

    if (entryAccounts.length === 0) {
      console.log('   No entries found, saving empty leaderboard');
      await saveLeaderboard({ contestAddress, fixtureId, updatedAt: Date.now(), entries: [] });
      continue;
    }

    // Fetch TxLINE scores
    const txlineJwt = process.env.TXLINE_JWT;
    const txlineApiToken = process.env.TXLINE_API_TOKEN;
    const txlineBaseUrl = process.env.TXLINE_BASE_URL || 'https://txline-dev.txodds.com';

    let txlineEvents: any[] = [];
    let txlineData: any = null;
    if (txlineJwt && txlineApiToken && fixtureId) {
      try {
        const resp = await fetch(`${txlineBaseUrl}/api/scores/snapshot/${fixtureId}?asOf=${Date.now()}`, {
          headers: { Authorization: `Bearer ${txlineJwt}`, 'X-Api-Token': txlineApiToken, 'Content-Type': 'application/json' },
        });
        if (resp.ok) {
          txlineData = await resp.json();
          txlineEvents = Array.isArray(txlineData) ? txlineData : (txlineData.events || []);
        }
      } catch (e: any) {
        console.error(`   Error fetching TxLINE: ${e.message}`);
      }
    }

    // Decode entries and compute scores
    const userEntryDecoder = getUserEntryDecoder();
    const athletePoolDecoder = getAthletePoolDecoder();

    // Build player events map and pool roles
    const playerEvents = new Map<string, string[]>();
    for (const event of txlineEvents) {
      const action = (event.action ?? event.Action ?? '').toLowerCase();
      const playerId = (event.playerId ?? event.PlayerId ?? event.data?.PlayerId ?? event.Data?.PlayerId)?.toString();
      if (!playerId || !action) continue;
      if (!playerEvents.has(playerId)) playerEvents.set(playerId, []);
      playerEvents.get(playerId)!.push(action);
    }

    const lastScoreEvent = Array.isArray(txlineData) ? txlineData[txlineData.length - 1] : txlineData;
    const evtScore = lastScoreEvent?.score ?? lastScoreEvent?.Score ?? {};
    const opponentScore = evtScore?.Participant2?.Score || evtScore?.Participant1?.Score || 0;
    const cleanSheetOverall = opponentScore === 0;

    const scoredEntries: { entryAddress: string; userAddress: string; score: number }[] = [];

    for (const { pubkey: entryPubkey } of entryAccounts) {
      try {
        const entryData = userEntryDecoder.decode((await connection.getAccountInfo(entryPubkey, 'confirmed'))!.data);
        const athletes: string[] = entryData.athletes;

        let totalScore = 0;
        for (const athleteAddr of athletes) {
          const athleteMint = new PublicKey(athleteAddr);
          const poolAddress = PublicKey.findProgramAddressSync([Buffer.from('pool'), athleteMint.toBuffer()], PROGRAM_ID)[0];

          try {
            const poolData = athletePoolDecoder.decode((await connection.getAccountInfo(poolAddress, 'confirmed'))!.data);
            const playerId = poolData.name;
            const role = typeof poolData.role === 'number' ? poolData.role : 0;

            const events = playerEvents.get(playerId) || [];
            let athleteScore = 0;
            for (const action of events) {
              if (action.includes('goal')) {
                const goalPoints = [40, 30, 20, 10];
                athleteScore += goalPoints[role] || 10;
              }
              if (action.includes('assist')) athleteScore += 5;
              if (action.includes('save') && role === 0) athleteScore += 5;
            }
            if (cleanSheetOverall && (role === 0 || role === 1)) athleteScore += 10;
            totalScore += athleteScore;
          } catch {}
        }

        scoredEntries.push({
          entryAddress: entryPubkey.toBase58(),
          userAddress: entryData.user.toString(),
          score: totalScore,
        });
      } catch {}
    }

    // Sort by score descending
    scoredEntries.sort((a, b) => b.score - a.score);

    // Calculate prizes
    const prizeSplits: Record<number, number[]> = { 1: [10000], 2: [6000, 4000], 3: [5000, 3000, 2000], 4: [5000, 3000, 1500, 500] };
    const split = prizeSplits[winnerCount] || prizeSplits[3];

    const entries = scoredEntries.map((e, i) => {
      const position = i + 1;
      let prizeEstimate = 0;
      if (position <= winnerCount && split[position - 1] !== undefined) {
        prizeEstimate = (prizePool * split[position - 1]) / 10000;
      }
      return { ...e, position, prizeEstimate };
    });

    await saveLeaderboard({ contestAddress, fixtureId, updatedAt: Date.now(), entries });
    console.log(`   ✅ Leaderboard saved with ${entries.length} entries`);
    if (entries.length > 0) {
      console.log(`   🏆 Top: ${entries[0].entryAddress} — ${entries[0].score} pts`);
    }
  }

  console.log('\n✅ Backfill complete');
}

main().catch(console.error);
