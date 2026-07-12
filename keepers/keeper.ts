import 'dotenv/config';
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

const PROGRAM_ID = new PublicKey('HLqcxyy9DrVH7DJ2NqTza8Vq6GWB4aUuUSjFWdq5EAmt');

const POLL_INTERVAL_MS = 5 * 60 * 1000;

const IX_LOCK_CONTEST = new Uint8Array([124, 155, 70, 224, 136, 196, 104, 207]);
const IX_PROCESS_ENTRY_MINT = new Uint8Array([25, 138, 170, 23, 67, 254, 28, 189]);
const IX_SETTLE_CONTEST = new Uint8Array([79, 122, 33, 192, 110, 98, 219, 238]);

interface KeeperConfig {
  rpcUrl: string;
  keeperPrivateKey: string;
  txlineJwt: string;
  txlineApiToken: string;
}

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
}

interface ScoredEntry {
  pubkey: PublicKey;
  score: number;
}

const STATUS_MAP: Record<number, ContestData['status']> = {
  [ContestStatus.Open]: 'open',
  [ContestStatus.Locked]: 'locked',
  [ContestStatus.Settled]: 'settled',
};

class DexiKeeper {
  private readonly connection: Connection;
  private readonly keeperKeypair: Keypair;
  private isRunning = false;

  private readonly configAddress = PublicKey.findProgramAddressSync(
    [Buffer.from('admin')],
    PROGRAM_ID,
  )[0];

  // Cached decoders
  private readonly contestDecoder = getContestDecoder();
  private readonly adminConfigDecoder = getAdminConfigDecoder();
  private readonly userEntryDecoder = getUserEntryDecoder();
  private readonly athletePoolDecoder = getAthletePoolDecoder();

  private readonly txlineBaseUrl = 'https://txline-dev.txodds.com';
  private readonly txlineJwt: string;
  private readonly txlineApiToken: string;

  constructor(config: KeeperConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.keeperKeypair = config.keeperPrivateKey
      ? Keypair.fromSecretKey(bs58.decode(config.keeperPrivateKey))
      : Keypair.fromSeed(new Uint8Array(32).fill(1));

    this.txlineJwt = config.txlineJwt;
    this.txlineApiToken = config.txlineApiToken;
  }

  async start() {
    console.log('🤖 Dexi Keeper started');
    console.log('Keeper address:', this.keeperKeypair.publicKey.toBase58());
    this.isRunning = true;

    this.subscribeToContests();
    this.startSafetySweep();
    await this.processAllContests();
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 Keeper stopped');
  }

  private subscribeToContests() {
    this.connection.onProgramAccountChange(
      PROGRAM_ID,
      async (keyedAccountInfo) => {
        if (!this.isRunning) return;
        try {
          const decoded = this.contestDecoder.decode(keyedAccountInfo.accountInfo.data);
          const status = STATUS_MAP[decoded.status];
          const now = Math.floor(Date.now() / 1000);
          if (status === 'open' && Number(decoded.startTime) <= now) {
            console.log(`\n🔔 Account change detected for contest #${decoded.id}`);
            await this.processContest(contestDataFromSdk(decoded, new PublicKey(keyedAccountInfo.accountId.toBase58())));
          }
        } catch {
          // Non-Contest accounts or decode errors are silently ignored.
        }
      },
      'confirmed',
      [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(Buffer.from(CONTEST_DISCRIMINATOR)),
          },
        },
      ],
    );
    console.log('📡 Subscribed to Contest account changes');
  }

  private startSafetySweep() {
    const interval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(interval);
        return;
      }
      console.log('\n🔄 Running safety sweep...');
      await this.processAllContests();
    }, POLL_INTERVAL_MS);
  }

  private async processAllContests() {
    const contests = await this.findOpenContests();
    console.log(`Found ${contests.length} contest(s) needing action`);
    for (const contest of contests) {
      try {
        await this.processContest(contest);
      } catch (error) {
        console.error(`Error processing contest ${contest.id}:`, error);
      }
    }
  }

  private async findOpenContests(): Promise<ContestData[]> {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(Buffer.from(CONTEST_DISCRIMINATOR)),
          },
        },
      ],
    });

    console.log(`📊 Found ${accounts.length} contest(s) on chain`);

    const contests: ContestData[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const { pubkey, account } of accounts) {
      try {
        const decoded = this.contestDecoder.decode(account.data);
        const status = STATUS_MAP[decoded.status];
        const startTime = Number(decoded.startTime);

        if (status === 'open' && startTime <= now) {
          contests.push(contestDataFromSdk(decoded, pubkey));
        }
      } catch (e) {
        console.error(`   Error decoding account ${pubkey.toBase58()}:`, e);
      }
    }

    return contests;
  }

  private async processContest(contest: ContestData) {
    console.log(`\n📋 Processing contest #${contest.id}`);
    console.log(`   Status: ${contest.status}, Entries: ${contest.entryCount}`);

    const contestKey = contest.pubkey;

    // Step 1: Lock
    if (contest.status === 'open') {
      console.log('   🔒 Locking contest...');
      try {
        const ix = this.lockContestIx(contestKey);
        const sig = await this.sendAndConfirm([ix]);
        console.log(`   ✅ Contest locked: ${sig}`);
      } catch (e: any) {
        if (e.message?.includes('ContestNotStarted') || e.message?.includes('0x179c')) {
          console.log('   ⏳ Contest not started yet, skipping...');
          return;
        }
        throw e;
      }
    }

    // Step 2: Process mints
    console.log(`   🔄 Processing ${contest.totalMintCount} athlete mint(s)...`);
    await this.processEntryMints(contestKey, contest);

    // Step 3: Fetch live scores from TxLINE
    console.log('   📊 Fetching live scores from TxLINE...');
    const scoredEntries = await this.calculateScoresFromTxline(contest);

    // Step 4: Calculate rankings
    console.log('   🏆 Calculating final rankings...');
    scoredEntries.sort((a, b) => b.score - a.score);
    console.log('Top 3 Entries:', scoredEntries.slice(0, 3).map(e => `${e.pubkey.toBase58()}: ${e.score} pts`));

    const isMatchFinished = await this.checkIfMatchFinished(contest.id);
    if (!isMatchFinished) {
      console.log('   ⏳ Match is still ongoing, postponing settlement...');
      return;
    }

    // Step 5: Settle
    console.log('   💰 Settling contest...');
    await this.settleContest(contestKey, contest.escrowVault);

    console.log(`   ✅ Contest #${contest.id} processed successfully`);
  }

  // ── Instruction builders ─────────────────────────────────────────────────────

  private lockContestIx(contestKey: PublicKey): TransactionInstruction {
    return new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: this.configAddress, isSigner: false, isWritable: false },
        { pubkey: contestKey, isSigner: false, isWritable: true },
        { pubkey: this.keeperKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.from(IX_LOCK_CONTEST),
    });
  }

  private processEntryMintIx(
    contestKey: PublicKey,
    mint: PublicKey,
    poolAddress: PublicKey,
    escrowVault: PublicKey,
    usdcMint: PublicKey,
    poolTokenVault: PublicKey,
    poolUsdcVault: PublicKey,
    contestTokenVault: PublicKey,
  ): TransactionInstruction {
    return new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: contestKey, isSigner: false, isWritable: true },
        { pubkey: poolAddress, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: contestTokenVault, isSigner: false, isWritable: true },
        { pubkey: escrowVault, isSigner: false, isWritable: true },
        { pubkey: this.configAddress, isSigner: false, isWritable: false },
        { pubkey: poolTokenVault, isSigner: false, isWritable: true },
        { pubkey: poolUsdcVault, isSigner: false, isWritable: true },
        { pubkey: poolAddress, isSigner: false, isWritable: false },
        { pubkey: this.keeperKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(IX_PROCESS_ENTRY_MINT),
    });
  }

  private settleContestIx(contestKey: PublicKey, escrowVault: PublicKey): TransactionInstruction {
    return new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: this.configAddress, isSigner: false, isWritable: false },
        { pubkey: contestKey, isSigner: false, isWritable: true },
        { pubkey: escrowVault, isSigner: false, isWritable: true },
        { pubkey: this.keeperKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.from(IX_SETTLE_CONTEST),
    });
  }

  private async sendAndConfirm(ixs: TransactionInstruction[]): Promise<string> {
    const tx = new Transaction();
    for (const ix of ixs) tx.add(ix);
    tx.feePayer = this.keeperKeypair.publicKey;
    const bh = await this.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = bh.blockhash;
    tx.sign(this.keeperKeypair);
    return await this.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  }

  // ── SDK-based account fetching ────────────────────────────────────────────────

  private async fetchAdminConfig() {
    const response = await this.connection.getAccountInfo(this.configAddress, 'confirmed');
    if (!response) throw new Error('AdminConfig not found');
    return this.adminConfigDecoder.decode(response.data);
  }

  private async fetchUserEntry(address: PublicKey) {
    const response = await this.connection.getAccountInfo(address, 'confirmed');
    if (!response) throw new Error('UserEntry not found');
    return this.userEntryDecoder.decode(response.data);
  }

  private async fetchAthletePool(address: PublicKey) {
    const response = await this.connection.getAccountInfo(address, 'confirmed');
    if (!response) throw new Error('AthletePool not found');
    return this.athletePoolDecoder.decode(response.data);
  }

  // ── Process entry mints ───────────────────────────────────────────────────────

  private async processEntryMints(contestKey: PublicKey, contest: ContestData) {
    console.log(`   🔄 Processing entry mints. Processed so far: ${contest.processedMintCount}/${contest.totalMintCount}`);

    const configData = await this.fetchAdminConfig();
    const usdcMint = new PublicKey(configData.usdcMint);

    const tokenAccounts = await this.connection.getTokenAccountsByOwner(contestKey, {
      programId: TOKEN_PROGRAM_ID,
    });

    let processedCount = contest.processedMintCount;
    for (const { pubkey, account } of tokenAccounts.value) {
      if (processedCount >= contest.totalMintCount) break;
      const mintPubkey = new PublicKey(account.data.slice(0, 32));
      if (mintPubkey.equals(usdcMint)) continue;

      const amountBytes = account.data.slice(64, 72);
      const amount = amountBytes.readBigUInt64LE(0);
      if (amount === 0n) continue;

      const poolAddress = PublicKey.findProgramAddressSync(
        [Buffer.from('pool'), mintPubkey.toBuffer()],
        PROGRAM_ID,
      )[0];

      const poolTokenVault = getAssociatedTokenAddressSync(mintPubkey, poolAddress, true);
      const poolUsdcVault = getAssociatedTokenAddressSync(usdcMint, poolAddress, true);
      const contestTokenVault = pubkey;

      try {
        const ix = this.processEntryMintIx(
          contestKey, mintPubkey, poolAddress, contest.escrowVault,
          usdcMint, poolTokenVault, poolUsdcVault, contestTokenVault,
        );
        const sig = await this.sendAndConfirm([ix]);
        processedCount++;
        console.log(`      ✅ Processed mint ${mintPubkey.toBase58()} (${processedCount}/${contest.totalMintCount}): ${sig}`);
      } catch (e: any) {
        console.error(`      ❌ Error processing mint ${mintPubkey.toBase58()}:`, e.message);
      }
    }
  }

  // ── TxLINE scoring ───────────────────────────────────────────────────────────

  private async calculateScoresFromTxline(contest: ContestData): Promise<ScoredEntry[]> {
    const entries = await this.getEntriesForContest(contest.pubkey);
    if (entries.length === 0) return [];

    const fixtureId = contest.id;

    let txlineEvents: any[] = [];
    try {
      const response = await fetch(`${this.txlineBaseUrl}/api/scores/snapshot/${fixtureId}?asOf=${Date.now()}`, {
        headers: {
          'Authorization': `Bearer ${this.txlineJwt}`,
          'X-Api-Token': this.txlineApiToken,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const data: any = await response.json();
        txlineEvents = Array.isArray(data) ? data : (data.events || []);
      }
    } catch (e) {
      console.error(`Error fetching TxLINE snapshot for fixture ${fixtureId}:`, e);
    }

    const playerPoints = new Map<string, number>();

    for (const event of txlineEvents) {
      const action = event.action?.toLowerCase();
      const playerId = event.playerId?.toString();
      if (!playerId || !action) continue;

      let pts = playerPoints.get(playerId) || 0;
      if (action.includes('goal')) pts += 20;
      if (action.includes('assist')) pts += 5;
      if (action.includes('save')) pts += 5;
      playerPoints.set(playerId, pts);
    }

    const scored: ScoredEntry[] = [];
    for (const entry of entries) {
      const entryData = await this.fetchUserEntry(entry.pubkey);
      const athletes: string[] = entryData.athletes;

      let totalScore = 0;
      for (const athleteAddr of athletes) {
        const athleteMint = new PublicKey(athleteAddr);
        const poolAddress = PublicKey.findProgramAddressSync(
          [Buffer.from('pool'), athleteMint.toBuffer()],
          PROGRAM_ID,
        )[0];
        try {
          const poolData = await this.fetchAthletePool(poolAddress);
          const playerId = poolData.name;
          totalScore += playerPoints.get(playerId) || 0;
        } catch {
          // pool might not exist
        }
      }
      scored.push({ pubkey: entry.pubkey, score: totalScore });
    }

    return scored;
  }

  private async checkIfMatchFinished(fixtureId: number): Promise<boolean> {
    try {
      const response = await fetch(`${this.txlineBaseUrl}/api/scores/snapshot/${fixtureId}?asOf=${Date.now()}`, {
        headers: {
          'Authorization': `Bearer ${this.txlineJwt}`,
          'X-Api-Token': this.txlineApiToken,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const data: any = await response.json();
        return data.statusSoccerId === 'F' || data.gameState === 'Ended' || data.statusId === 'F';
      }
    } catch (e) {
      console.error(`Error checking if match ${fixtureId} is finished:`, e);
    }
    return true;
  }

  private async settleContest(contestKey: PublicKey, escrowVault: PublicKey) {
    try {
      const ix = this.settleContestIx(contestKey, escrowVault);
      const sig = await this.sendAndConfirm([ix]);
      console.log(`   ✅ Contest settled: ${sig}`);
    } catch (e) {
      console.error('   ❌ Error settling contest:', e);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async getEntriesForContest(contestKey: PublicKey) {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 40,
            bytes: contestKey.toBase58(),
          },
        },
      ],
    });
    return accounts.map(acc => ({ pubkey: acc.pubkey }));
  }
}

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
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const config: KeeperConfig = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    keeperPrivateKey: process.env.KEEPER_PRIVATE_KEY || '',
    txlineJwt: process.env.TXLINE_JWT || '',
    txlineApiToken: process.env.TXLINE_API_TOKEN || '',
  };

  const keeper = new DexiKeeper(config);

  process.on('SIGINT', () => {
    keeper.stop();
    process.exit(0);
  });

  await keeper.start();
}

main().catch(console.error);
