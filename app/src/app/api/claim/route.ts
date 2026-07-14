import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import {
  findConfigPda,
  findContestPda,
  findEntryPda,
  decodeContest,
  decodeUserEntry,
  decodeAdminConfig,
  ContestStatus,
  CONTEST_DISCRIMINATOR,
  USER_ENTRY_DISCRIMINATOR,
  getClaimRewardInstruction,
  CLAIM_REWARD_DISCRIMINATOR,
} from '@dexi/sdk';

export const maxDuration = 60;

const PROGRAM_ID = new PublicKey('HLqcxyy9DrVH7DJ2nqTza8Vq6GWB4aUuUSjFWdq5EAmt');
const USDC_MINT = new PublicKey('9Y27Cm2eWZ1H6KzMss5Py4BhRPBMYKCssEoWBp2MunEP');

interface RankedEntry {
  entryAddress: string;
  userAddress: string;
  score: number;
  position: number;
  prizeEstimate: number;
}

async function fetchLeaderboardScores(
  connection: Connection,
  contestAddress: string,
  fixtureId: string,
  prizePool: number,
  winnerCount: number
): Promise<Map<string, { score: number; position: number; prizeEstimate: number }>> {
  const result = new Map<string, { score: number; position: number; prizeEstimate: number }>();

  try {
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(Buffer.from(USER_ENTRY_DISCRIMINATOR)),
          },
        },
      ],
    });

    const POINTS = {
      goal: { 0: 40, 1: 30, 2: 20, 3: 10 },
      assist: 5,
      save: 5,
      cleanSheet: 10,
    };

    function getGoalPoints(role: number): number {
      return POINTS.goal[role as keyof typeof POINTS.goal] || 10;
    }

    const entriesWithScores: { entryAddress: string; userAddress: string; score: number }[] = [];

    for (const { pubkey, account } of accounts) {
      try {
        const decodedEntry = decodeUserEntry({ address: pubkey.toBase58(), data: account.data, exists: true } as any).data;
        
        if (decodedEntry.contest.toString() !== contestAddress) continue;
        if (!decodedEntry.isComplete) continue;

        const contestInfo = await connection.getAccountInfo(new PublicKey(contestAddress), 'confirmed');
        if (!contestInfo) continue;

        const decodedContest = decodeContest({ address: contestAddress, data: contestInfo.data, exists: true } as any).data;
        const contestFixtureId = String(decodedContest.fixtureId || '') || String(decodedContest.id);

        if (contestFixtureId !== fixtureId) continue;

        if (fixtureId) {
          try {
            const txlineBaseUrl = process.env.TXLINE_BASE_URL || 'https://txline-dev.txodds.com';
            const txlineJwt = process.env.TXLINE_JWT;
            const txlineApiToken = process.env.TXLINE_API_TOKEN;

            if (txlineJwt && txlineApiToken) {
              const response = await fetch(`${txlineBaseUrl}/api/scores/snapshot/${fixtureId}?asOf=${Date.now()}`, {
                headers: {
                  'Authorization': `Bearer ${txlineJwt}`,
                  'X-Api-Token': txlineApiToken,
                  'Content-Type': 'application/json',
                },
              });

              if (response.ok) {
                const data = await response.json();
                const rawEvents = Array.isArray(data) ? data : (data.events || []);

                const poolAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
                  filters: [
                    {
                      memcmp: {
                        offset: 0,
                        bytes: bs58.encode(Buffer.from([103, 246, 83, 235, 212, 232, 37, 50])),
                      },
                    },
                  ],
                });

                const poolMap = new Map<string, { name: string; role: number }>();
                for (const poolAcc of poolAccounts) {
                  try {
                    const decodedPool = decodeUserEntry({ address: poolAcc.pubkey.toBase58(), data: poolAcc.account.data, exists: true } as any).data;
                  } catch {
                    // Skip
                  }
                }

                const athletePools = await connection.getProgramAccounts(PROGRAM_ID, {
                  filters: [
                    { memcmp: { offset: 0, bytes: bs58.encode(Buffer.from([103, 246, 83, 235, 212, 232, 37, 50])) } },
                  ],
                });

                const mintToRole = new Map<string, number>();
                for (const poolAcc of athletePools) {
                  try {
                    const poolData = poolAcc.account.data;
                    const mint = new PublicKey(poolData.slice(0, 32)).toBase58();
                    const role = poolData[32];
                    mintToRole.set(mint, role);
                  } catch {
                    // Skip
                  }
                }

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

                const participant1Score = data.score?.Participant1?.Score || 0;
                const participant2Score = data.score?.Participant2?.Score || 0;

                let totalScore = 0;
                for (const athleteMint of decodedEntry.athletes) {
                  const mintStr = athleteMint.toString();
                  const role = mintToRole.get(mintStr) || 0;
                  const playerId = mintStr;

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

                  totalScore += athleteScore;
                }

                entriesWithScores.push({
                  entryAddress: pubkey.toBase58(),
                  userAddress: decodedEntry.user.toString(),
                  score: totalScore,
                });
              }
            }
          } catch (e) {
            console.error('Error fetching TxLINE scores:', e);
          }
        }
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

    for (let i = 0; i < entriesWithScores.length; i++) {
      const { entryAddress, userAddress, score } = entriesWithScores[i];
      const position = i + 1;
      let prizeEstimate = 0;

      if (position <= winnerCount && prizeSplit[position - 1] !== undefined) {
        prizeEstimate = (prizePool * prizeSplit[position - 1]) / 10000;
      }

      result.set(entryAddress, { score, position, prizeEstimate });
    }
  } catch (e) {
    console.error('Error computing leaderboard:', e);
  }

  return result;
}

async function calculatePrizeAmount(
  connection: Connection,
  contestAddress: string,
  entryAddress: string,
  userAddress: string
): Promise<{ amount: number; error?: string }> {
  try {
    const contestInfo = await connection.getAccountInfo(new PublicKey(contestAddress), 'confirmed');
    if (!contestInfo) {
      return { amount: 0, error: 'Contest not found' };
    }

    const decodedContest = decodeContest({ address: contestAddress, data: contestInfo.data, exists: true } as any).data;

    if (decodedContest.status !== ContestStatus.Settled) {
      return { amount: 0, error: 'Contest is not settled yet' };
    }

    const prizePool = Number(decodedContest.prizePool);
    const winnerCount = decodedContest.winnerCount;
    const fixtureId = String(decodedContest.fixtureId || '') || String(decodedContest.id);

    const leaderboard = await fetchLeaderboardScores(connection, contestAddress, fixtureId, prizePool, winnerCount);
    const entryData = leaderboard.get(entryAddress);

    if (!entryData) {
      return { amount: 0, error: 'Entry not found in leaderboard' };
    }

    return { amount: entryData.prizeEstimate };
  } catch (e) {
    console.error('Error calculating prize amount:', e);
    return { amount: 0, error: 'Failed to calculate prize amount' };
  }
}

export async function POST(request: NextRequest) {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    const { contestAddress, userAddress } = await request.json();

    if (!contestAddress || !userAddress) {
      return NextResponse.json({ error: 'Missing contestAddress or userAddress' }, { status: 400 });
    }

    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    const keeperPrivateKey = process.env.KEEPER_PRIVATE_KEY;

    if (!keeperPrivateKey) {
      return NextResponse.json({ error: 'KEEPER_PRIVATE_KEY is not configured' }, { status: 500 });
    }

    const connection = new Connection(rpcUrl, 'confirmed');
    const keeperKeypair = Keypair.fromSecretKey(bs58.decode(keeperPrivateKey.trim()));
    log(`🗝️ Keeper: ${keeperKeypair.publicKey.toBase58()}`);

    const contestPubkey = new PublicKey(contestAddress);
    const userPubkey = new PublicKey(userAddress);

    const configPdaResult = await findConfigPda() as unknown as { address: string };
    const configPda = new PublicKey(configPdaResult.address);
    log(`📋 Config PDA: ${configPda.toBase58()}`);

    const configInfo = await connection.getAccountInfo(configPda, 'confirmed');
    if (!configInfo) {
      return NextResponse.json({ error: 'Config account not found' }, { status: 404 });
    }

    const configData = decodeAdminConfig({ address: configPda.toBase58(), data: configInfo.data, exists: true } as any).data;
    const keeperFromConfig = configData.keeper.toString();
    log(`👤 Keeper from config: ${keeperFromConfig}`);

    if (keeperFromConfig !== keeperKeypair.publicKey.toBase58()) {
      log('⚠️ Keeper key mismatch, but continuing...');
    }

    const usdcMint = new PublicKey(configData.usdcMint);
    log(`💰 USDC Mint: ${usdcMint.toBase58()}`);

    const contestInfo = await connection.getAccountInfo(contestPubkey, 'confirmed');
    if (!contestInfo) {
      return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
    }

    const decodedContest = decodeContest({ address: contestAddress, data: contestInfo.data, exists: true } as any).data;

    if (decodedContest.status !== ContestStatus.Settled) {
      return NextResponse.json({ error: `Contest is not settled yet (status: ${decodedContest.status})` }, { status: 400 });
    }

    log(`🏆 Contest status: Settled, Prize Pool: ${decodedContest.prizePool}`);

    const entryPdaResult = await findEntryPda({ contest: contestAddress, user: userAddress }) as unknown as { address: string };
    const entryPda = new PublicKey(entryPdaResult.address);
    log(`📝 Entry PDA: ${entryPda.toBase58()}`);

    const entryInfo = await connection.getAccountInfo(entryPda, 'confirmed');
    if (!entryInfo) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    const decodedEntry = decodeUserEntry({ address: entryPda.toBase58(), data: entryInfo.data, exists: true } as any).data;

    if (decodedEntry.claimed) {
      return NextResponse.json({ error: 'Reward already claimed', code: 'ALREADY_CLAIMED' }, { status: 400 });
    }

    log(`👤 Entry user: ${decodedEntry.user.toString()}`);
    log(`✅ Entry claimed: ${decodedEntry.claimed}`);

    const escrowVault = new PublicKey(decodedContest.escrowVault);
    log(`🔐 Escrow Vault: ${escrowVault.toBase58()}`);

    const userUsdcAta = getAssociatedTokenAddressSync(usdcMint, userPubkey, true);
    log(`💳 User USDC ATA: ${userUsdcAta.toBase58()}`);

    const userAtaInfo = await connection.getAccountInfo(userUsdcAta, 'confirmed');
    if (!userAtaInfo) {
      return NextResponse.json({ error: 'User does not have a USDC account. Please create one first.' }, { status: 400 });
    }

    const prizeAmountResult = await calculatePrizeAmount(connection, contestAddress, entryPda.toBase58(), userAddress);
    if (prizeAmountResult.error) {
      log(`⚠️ Could not calculate prize amount: ${prizeAmountResult.error}`);
    }

    const amount = prizeAmountResult.amount > 0 ? prizeAmountResult.amount : 0;
    log(`💵 Calculated prize amount: ${amount} USDC`);

    if (amount === 0) {
      return NextResponse.json({ error: 'No prize to claim (position outside prize pool)' }, { status: 400 });
    }

    const amountBigInt = BigInt(Math.floor(amount * 1_000_000));

    const claimInstruction: any = getClaimRewardInstruction({
      config: configPda.toBase58() as any,
      contest: contestAddress as any,
      entry: entryPda.toBase58() as any,
      escrowVault: escrowVault.toBase58() as any,
      userUsdcAta: userUsdcAta.toBase58() as any,
      user: userPubkey.toBase58() as any,
      keeper: keeperKeypair.publicKey.toBase58() as any,
      amount: amountBigInt,
    });

    const instruction = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: claimInstruction.accounts.map((acc: any) => ({
        pubkey: new PublicKey(acc.address),
        isSigner: (acc as any).isSigner ?? false,
        isWritable: (acc as any).isWritable ?? false,
      })),
      data: Buffer.from(claimInstruction.data),
    });

    const tx = new Transaction();
    tx.add(instruction);
    tx.feePayer = keeperKeypair.publicKey;

    const bh = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = bh.blockhash;

    tx.partialSign(keeperKeypair);

    const serializedTx = tx.serialize({ requireAllSignatures: false }).toString('base64');

    log(`✅ Transaction prepared and signed by keeper`);
    log(`📤 Returning transaction to frontend`);

    return NextResponse.json({
      transaction: serializedTx,
      amount: amount,
      logs,
    });
  } catch (error: any) {
    console.error('🚨 Claim API error:', error);
    return NextResponse.json({
      error: error.message || 'Unknown error',
      logs,
    }, { status: 500 });
  }
}