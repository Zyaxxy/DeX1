import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import {
  getContestDecoder,
  getAdminConfigDecoder,
  getUserEntryDecoder,
  getAthletePoolDecoder,
  CONTEST_DISCRIMINATOR,
  ContestStatus,
} from '@dexi/sdk';

export const maxDuration = 60; // Extend duration for serverless processing execution limits

const PROGRAM_ID = new PublicKey('HLqcxyy9DrVH7DJ2NqTza8Vq6GWB4aUuUSjFWdq5EAmt');

const IX_LOCK_CONTEST = new Uint8Array([124, 155, 70, 224, 136, 196, 104, 207]);
const IX_PROCESS_ENTRY_MINT = new Uint8Array([25, 138, 170, 23, 67, 254, 28, 189]);
const IX_SETTLE_CONTEST = new Uint8Array([79, 122, 33, 192, 110, 98, 219, 238]);

const STATUS_MAP: Record<number, 'open' | 'locked' | 'settled'> = {
  [ContestStatus.Open]: 'open',
  [ContestStatus.Locked]: 'locked',
  [ContestStatus.Settled]: 'settled',
};

interface ContestData {
  pubkey: PublicKey;
  id: number;
  startTime: number;
  status: 'open' | 'locked' | 'settled';
  entryCount: number;
  prizePool: number;
  winnerCount: number;
  totalMintCount: number;
  processedMintCount: number;
  escrowVault: PublicKey;
  fixtureId: string;
}

// Helper to decode SDK contest structures
function contestDataFromSdk(decoded: any, pubkey: PublicKey): ContestData {
  return {
    pubkey,
    id: Number(decoded.id),
    startTime: Number(decoded.startTime),
    status: STATUS_MAP[decoded.status],
    entryCount: Number(decoded.entryCount),
    prizePool: Number(decoded.prizePool),
    winnerCount: decoded.winnerCount,
    totalMintCount: decoded.totalMintCount,
    processedMintCount: decoded.processedMintCount,
    escrowVault: new PublicKey(decoded.escrowVault),
    fixtureId: String(decoded.fixtureId || ''),
  };
}

export async function GET(req: NextRequest) {
  return handleKeeperRequest(req);
}

export async function POST(req: NextRequest) {
  return handleKeeperRequest(req);
}

async function handleKeeperRequest(req: NextRequest) {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    // 1. Authorize CRON Trigger
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    // In local development or if CRON_SECRET is not configured yet, skip auth check.
    // However, if CRON_SECRET is configured, we enforce it to protect against unauthorized calls.
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    const keeperPrivateKey = process.env.KEEPER_PRIVATE_KEY;
    const txlineJwt = process.env.TXLINE_JWT;
    const txlineApiToken = process.env.TXLINE_API_TOKEN;

    if (!keeperPrivateKey) {
      return NextResponse.json({ error: 'KEEPER_PRIVATE_KEY is not configured in environment variables' }, { status: 500 });
    }

    // Initialize connection and keys
    const connection = new Connection(rpcUrl, 'confirmed');
    const keeperKeypair = Keypair.fromSecretKey(bs58.decode(keeperPrivateKey.trim()));
    log(`🤖 Vercel Cron Keeper Active: ${keeperKeypair.publicKey.toBase58()}`);

    const configAddress = PublicKey.findProgramAddressSync([Buffer.from('admin')], PROGRAM_ID)[0];
    const contestDecoder = getContestDecoder();
    const adminConfigDecoder = getAdminConfigDecoder();

    // 2. Fetch all contests from Solana chain
    log('📊 Fetching all contests on-chain...');
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(Buffer.from(CONTEST_DISCRIMINATOR)),
          },
        },
      ],
    });

    const now = Math.floor(Date.now() / 1000);
    const contests: ContestData[] = [];

    for (const { pubkey, account } of accounts) {
      try {
        const decoded = contestDecoder.decode(account.data);
        const status = STATUS_MAP[decoded.status];
        const startTime = Number(decoded.startTime);

        // Sweeping contests that are:
        // - 'open' and start time has passed (needs to be locked)
        // - 'locked' (needs processing mints or settlement)
        if ((status === 'open' && startTime <= now) || status === 'locked') {
          contests.push(contestDataFromSdk(decoded, pubkey));
        }
      } catch (e: any) {
        log(`❌ Error decoding account ${pubkey.toBase58()}: ${e.message}`);
      }
    }

    log(`Found ${contests.length} contest(s) requiring action.`);

    // 3. Process each candidate contest
    for (const contest of contests) {
      log(`\n📋 Processing contest #${contest.id} (${contest.pubkey.toBase58()})`);
      log(`   Status: ${contest.status}, Entries: ${contest.entryCount}`);

      const contestKey = contest.pubkey;

      // STEP A: Lock Contest
      if (contest.status === 'open') {
        log('   🔒 Contest is open and start time passed. Locking...');
        try {
          const ix = new TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
              { pubkey: configAddress, isSigner: false, isWritable: false },
              { pubkey: contestKey, isSigner: false, isWritable: true },
              { pubkey: keeperKeypair.publicKey, isSigner: true, isWritable: false },
            ],
            data: Buffer.from(IX_LOCK_CONTEST),
          });
          const sig = await sendAndConfirm(connection, keeperKeypair, [ix]);
          log(`   ✅ Contest locked successfully: ${sig}`);
          contest.status = 'locked'; // Update local status for next steps
        } catch (e: any) {
          if (e.message?.includes('ContestNotStarted') || e.message?.includes('0x179c')) {
            log('   ⏳ Contest not started yet on chain. Skipping...');
            continue;
          }
          log(`   ❌ Error locking contest: ${e.message}`);
          continue;
        }
      }

      // STEP B: Process Entry Mints
      if (contest.status === 'locked') {
        log(`   🔄 Processing entry mints. Processed so far: ${contest.processedMintCount}/${contest.totalMintCount}`);
        
        if (contest.processedMintCount < contest.totalMintCount) {
          const configResponse = await connection.getAccountInfo(configAddress, 'confirmed');
          if (!configResponse) throw new Error('AdminConfig not found');
          const configData = adminConfigDecoder.decode(configResponse.data);
          const usdcMint = new PublicKey(configData.usdcMint);

          const tokenAccounts = await connection.getTokenAccountsByOwner(contestKey, {
            programId: TOKEN_PROGRAM_ID,
          });

          let processedCount = contest.processedMintCount;
          // In a single Cron request, limit to max 5 mint processes to prevent timeout
          let batchCount = 0;

          for (const { pubkey, account } of tokenAccounts.value) {
            if (processedCount >= contest.totalMintCount || batchCount >= 5) break;
            const mintPubkey = new PublicKey(account.data.slice(0, 32));
            if (mintPubkey.equals(usdcMint)) continue;

            const amountBytes = account.data.slice(64, 72);
            const amount = amountBytes.readBigUInt64LE(0);
            if (amount === BigInt(0)) continue;

            const poolAddress = PublicKey.findProgramAddressSync(
              [Buffer.from('pool'), mintPubkey.toBuffer()],
              PROGRAM_ID,
            )[0];

            const poolTokenVault = getAssociatedTokenAddressSync(mintPubkey, poolAddress, true);
            const poolUsdcVault = getAssociatedTokenAddressSync(usdcMint, poolAddress, true);
            const contestTokenVault = pubkey;

            try {
              const ix = new TransactionInstruction({
                programId: PROGRAM_ID,
                keys: [
                  { pubkey: contestKey, isSigner: false, isWritable: true },
                  { pubkey: poolAddress, isSigner: false, isWritable: true },
                  { pubkey: mintPubkey, isSigner: false, isWritable: false },
                  { pubkey: contestTokenVault, isSigner: false, isWritable: true },
                  { pubkey: contest.escrowVault, isSigner: false, isWritable: true },
                  { pubkey: configAddress, isSigner: false, isWritable: false },
                  { pubkey: poolTokenVault, isSigner: false, isWritable: true },
                  { pubkey: poolUsdcVault, isSigner: false, isWritable: true },
                  { pubkey: poolAddress, isSigner: false, isWritable: false },
                  { pubkey: keeperKeypair.publicKey, isSigner: true, isWritable: false },
                  { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                  { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                  { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                ],
                data: Buffer.from(IX_PROCESS_ENTRY_MINT),
              });

              const sig = await sendAndConfirm(connection, keeperKeypair, [ix]);
              processedCount++;
              batchCount++;
              log(`      ✅ Processed mint ${mintPubkey.toBase58()} (${processedCount}/${contest.totalMintCount}): ${sig}`);
            } catch (e: any) {
              log(`      ❌ Error processing mint ${mintPubkey.toBase58()}: ${e.message}`);
            }
          }

          // If we reached batch limit, exit this contest processing for now (will resume in next cron trigger)
          if (processedCount < contest.totalMintCount) {
            log(`   ⏳ Batch processing limit reached for contest #${contest.id}. Will continue in the next cron run.`);
            continue;
          }
        }

        // STEP C: Settle Contest (only if all mints are processed)
        if (contest.processedMintCount === contest.totalMintCount || contest.totalMintCount === 0) {
          log('   📊 Checking if match is finished on TxLINE...');
          
          if (!txlineJwt || !txlineApiToken) {
            log('   ⚠️ TxLINE credentials missing. Cannot check scores/status. Settle postponed.');
            continue;
          }

          let isMatchFinished = false;
          try {
            const txlineBaseUrl = process.env.TXLINE_BASE_URL || 'https://txline-dev.txodds.com';
            const fixtureId = contest.fixtureId || String(contest.id);
            const response = await fetch(`${txlineBaseUrl}/api/scores/snapshot/${fixtureId}?asOf=${Date.now()}`, {
              headers: {
                'Authorization': `Bearer ${txlineJwt}`,
                'X-Api-Token': txlineApiToken,
                'Content-Type': 'application/json',
              },
            });
            if (response.ok) {
              const data: any = await response.json();
              isMatchFinished = data.statusSoccerId === 'F' || data.gameState === 'Ended' || data.statusId === 'F';
            }
          } catch (e: any) {
            log(`   ❌ Error checking TxLINE match status: ${e.message}`);
          }

          if (!isMatchFinished) {
            log('   ⏳ Match is still ongoing, postponing settlement...');
            continue;
          }

          log('   💰 Match finished! Settling contest...');
          try {
            const ix = new TransactionInstruction({
              programId: PROGRAM_ID,
              keys: [
                { pubkey: configAddress, isSigner: false, isWritable: false },
                { pubkey: contestKey, isSigner: false, isWritable: true },
                { pubkey: contest.escrowVault, isSigner: false, isWritable: true },
                { pubkey: keeperKeypair.publicKey, isSigner: true, isWritable: false },
              ],
              data: Buffer.from(IX_SETTLE_CONTEST),
            });
            const sig = await sendAndConfirm(connection, keeperKeypair, [ix]);
            log(`   ✅ Contest #${contest.id} settled successfully: ${sig}`);
          } catch (e: any) {
            log(`   ❌ Error settling contest: ${e.message}`);
          }
        }
      }
    }

    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    log(`🚨 Fatal keeper error: ${error.message}`);
    return NextResponse.json({ success: false, error: error.message, logs }, { status: 500 });
  }
}

async function sendAndConfirm(connection: Connection, keeperKeypair: Keypair, ixs: TransactionInstruction[]): Promise<string> {
  const tx = new Transaction();
  for (const ix of ixs) tx.add(ix);
  tx.feePayer = keeperKeypair.publicKey;
  const bh = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = bh.blockhash;
  tx.sign(keeperKeypair);
  return await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
}
