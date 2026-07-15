import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';
import {
  findConfigPda,
  findEntryPda,
  decodeContest,
  decodeUserEntry,
  decodeAdminConfig,
  ContestStatus,
  getClaimRewardInstruction,
} from '@dexi/sdk';
import { readLeaderboard } from '@/data/leaderboard';

export const maxDuration = 60;

const PROGRAM_ID = new PublicKey('HLqcxyy9DrVH7DJ2NqTza8Vq6GWB4aUuUSjFWdq5EAmt');

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

    console.log(`📊 calculatePrizeAmount: contest=${contestAddress}, entry=${entryAddress}`);

    const leaderboardData = await readLeaderboard(contestAddress);
    if (!leaderboardData) {
      return { amount: 0, error: 'Leaderboard data not available yet. Please try again after the keeper processes this contest.' };
    }

    const entryData = leaderboardData.entries.find(e => e.entryAddress === entryAddress);
    if (!entryData) {
      return { amount: 0, error: 'Entry not found in leaderboard' };
    }

    console.log(`✅ Entry ${entryAddress}: score=${entryData.score}, pos=${entryData.position}, prize=${entryData.prizeEstimate}`);
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

    const [configPdaAddress] = await findConfigPda();
    const configPda = new PublicKey(configPdaAddress);
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

    if (!configData.usdcMint) {
      return NextResponse.json({ error: 'USDC mint address is missing from config' }, { status: 500 });
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

    const [entryPdaAddress] = await findEntryPda({ contest: contestAddress, user: userAddress });
    const entryPda = new PublicKey(entryPdaAddress);
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

    if (!decodedContest.escrowVault) {
      return NextResponse.json({ error: 'Escrow vault address is missing from contest' }, { status: 500 });
    }
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

    const amount = typeof prizeAmountResult.amount === 'number' && isFinite(prizeAmountResult.amount) ? prizeAmountResult.amount : 0;
    log(`💵 Calculated prize amount: ${amount} uUSDC (${(amount / 1_000_000).toFixed(6)} USDC)`);

    if (amount <= 0) {
      return NextResponse.json({ error: 'No prize to claim (position outside prize pool)' }, { status: 400 });
    }

    if (!isFinite(amount) || amount < 1) {
      return NextResponse.json({ error: `Invalid prize amount: ${amount}` }, { status: 400 });
    }
    const amountMicros = Math.floor(amount);

    let claimInstruction: any;
    try {
      const userSigner = {
        address: userPubkey.toBase58(),
        signTransactions: async () => { throw new Error('User should sign on client'); },
      };
      const keeperSigner = {
        address: keeperKeypair.publicKey.toBase58(),
        signTransactions: async () => { throw new Error('Keeper should sign in submit route'); },
      };
      claimInstruction = getClaimRewardInstruction({
        config: configPda.toBase58() as any,
        contest: contestAddress as any,
        entry: entryPda.toBase58() as any,
        escrowVault: escrowVault.toBase58() as any,
        userUsdcAta: userUsdcAta.toBase58() as any,
        user: userSigner as any,
        keeper: keeperSigner as any,
        amount: amountMicros,
      });
    } catch (innerErr: any) {
      log(`❌ Failed to build claim instruction: ${innerErr.message}`);
      return NextResponse.json({ error: `Failed to build claim instruction: ${innerErr.message}` }, { status: 500 });
    }

    let instruction: TransactionInstruction;
    try {
      const keys = claimInstruction.accounts.map((acc: any, idx: number) => {
        if (!acc.address) {
          throw new Error(`Account ${idx} has no address`);
        }
        const role: number = acc.role ?? 0;
        return {
          pubkey: new PublicKey(acc.address),
          isSigner: (role & 0b10) !== 0,
          isWritable: (role & 0b01) !== 0,
        };
      });
      instruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys,
        data: Buffer.from(claimInstruction.data),
      });
    } catch (innerErr: any) {
      log(`❌ Failed to create TransactionInstruction: ${innerErr.message}`);
      log(`  Accounts: ${JSON.stringify(claimInstruction.accounts.map((a: any) => a.address))}`);
      return NextResponse.json({ error: `Failed to build transaction: ${innerErr.message}` }, { status: 500 });
    }

    const bh = await connection.getLatestBlockhash('confirmed');

    const message = new TransactionMessage({
      payerKey: userPubkey,
      recentBlockhash: bh.blockhash,
      instructions: [instruction],
    }).compileToV0Message();

    // Debug: log all account keys with their signer status
    console.log('📋 V0 message accounts:');
    for (let i = 0; i < message.staticAccountKeys.length; i++) {
      const isSigner = i < message.header.numRequiredSignatures;
      console.log(`   [${i}] ${message.staticAccountKeys[i].toBase58()} ${isSigner ? '(signer)' : '(non-signer)'}`);
    }
    console.log(`   numRequiredSignatures=${message.header.numRequiredSignatures}`);

    const tx = new VersionedTransaction(message);

    const serializedTx = Buffer.from(tx.serialize()).toString('base64');

    log(`✅ Transaction prepared (unsigned, fee payer = user)`);
    log(`📤 Returning transaction to frontend`);

    return NextResponse.json({
      transaction: serializedTx,
      amount: amount / 1_000_000,
      logs,
    });
  } catch (error: any) {
    console.error('🚨 Claim API error:', error);
    log(`🚨 Unhandled error: ${error.message}`);
    if (error.stack) {
      log(`  Stack: ${error.stack.split('\n').slice(1, 3).join('; ')}`);
    }
    return NextResponse.json({
      error: error.message || 'Unknown error',
      logs,
    }, { status: 500 });
  }
}
