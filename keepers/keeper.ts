import 'dotenv/config';
import { Connection, PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, BorshAccountsCoder, Program, Wallet } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

const PROGRAM_ID = new PublicKey('A5PqjrLDne1y5iskNFxNhSpC2w1regprbaKZPTxAtAJS');

/**
 * Maximum number of entries that fit in a single `set_scores` / `calculate_rankings`
 * transaction without exceeding Solana's 1232-byte limit.
 * Each remaining account adds 32 bytes of address + 2 bytes of flags = 34 bytes.
 * Leaving ~200 bytes for instruction data and fixed accounts gives us ~30 entries safely.
 */
const MAX_ENTRIES_PER_TX = 30;

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5-minute safety sweep

interface KeeperConfig {
  rpcUrl: string;
  keeperPrivateKey: string;
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

class DexiKeeper {
  private readonly connection: Connection;
  private readonly provider: AnchorProvider;
  private readonly program: Program;
  private readonly keeperKeypair: Keypair;
  private isRunning = false;

  /** Cached — admin PDA is derivation-only, never changes. */
  private readonly configAddress = PublicKey.findProgramAddressSync(
    [Buffer.from('admin')],
    PROGRAM_ID,
  )[0];

  /** Anchor discriminator for Contest accounts — used for accurate RPC filters. */
  private readonly contestDiscriminator: Buffer;

  constructor(config: KeeperConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.keeperKeypair = config.keeperPrivateKey 
      ? Keypair.fromSecretKey(bs58.decode(config.keeperPrivateKey))
      : Keypair.fromSeed(new Uint8Array(32).fill(1));
    this.provider = new AnchorProvider(
      this.connection,
      new Wallet(this.keeperKeypair),
      { commitment: 'confirmed' },
    );

    const idl = require('../target/idl/dexi.json');
    this.program = new Program(idl, this.provider);

    // Compute the 8-byte discriminator that Anchor prepends to every Contest account.
    const coder = new BorshAccountsCoder(idl);
    this.contestDiscriminator = Buffer.from(
      coder.accountDiscriminator('Contest'),
    );
  }

  async start() {
    console.log('🤖 Dexi Keeper started');
    console.log('Keeper address:', this.keeperKeypair.publicKey.toBase58());
    this.isRunning = true;

    // Phase 3: Subscribe to all Contest account changes — react within one block.
    this.subscribeToContests();

    // Safety sweep every 5 minutes in case websocket events are missed.
    this.startSafetySweep();

    // Immediate first sweep on startup.
    await this.processAllContests();
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 Keeper stopped');
  }

  // ── Reactive subscription (Phase 3) ──────────────────────────────────────────

  private subscribeToContests() {
    this.connection.onProgramAccountChange(
      PROGRAM_ID,
      async (keyedAccountInfo) => {
        if (!this.isRunning) return;
        try {
          const data = keyedAccountInfo.accountInfo.data;
          // @ts-ignore — anchor coder decode
          const contest = this.program.coder.accounts.decode('Contest', data);
          const status = Object.keys(contest.status)[0] as ContestData['status'];

          // Only re-act on Open contests whose start time has passed.
          const now = Math.floor(Date.now() / 1000);
          if (status === 'open' && contest.startTime.lte(now)) {
            const contestData = this.mapContest(
              keyedAccountInfo.accountId,
              contest,
            );
            console.log(`\n🔔 Account change detected for contest #${contestData.id}`);
            await this.processContest(contestData);
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
            bytes: bs58.encode(this.contestDiscriminator),
          },
        },
      ],
    );
    console.log('📡 Subscribed to Contest account changes');
  }

  // ── Safety sweep (fallback poll) ─────────────────────────────────────────────

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

  // ── Contest discovery (Phase 1 — discriminator filter) ───────────────────────

  private async findOpenContests(): Promise<ContestData[]> {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          // Accurate discriminator filter replaces the brittle dataSize approximation.
          memcmp: {
            offset: 0,
            bytes: bs58.encode(this.contestDiscriminator),
          },
        },
      ],
    });

    const contests: ContestData[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const { pubkey, account } of accounts) {
      try {
        // @ts-ignore — anchor coder decode
        const data = this.program.coder.accounts.decode('Contest', account.data);
        const status = Object.keys(data.status)[0] as ContestData['status'];

        if (status === 'open' && data.startTime.lte(now)) {
          contests.push(this.mapContest(pubkey, data));
        }
      } catch {
        // Skip non-Contest or malformed accounts.
      }
    }

    return contests;
  }

  private mapContest(pubkey: PublicKey, data: any): ContestData {
    return {
      pubkey,
      id: data.id.toNumber(),
      startTime: data.startTime.toNumber(),
      status: Object.keys(data.status)[0] as ContestData['status'],
      entryCount: data.entryCount.toNumber(),
      prizePool: data.prizePool.toNumber(),
      winnerCount: data.winnerCount,
      totalMintCount: data.totalMintCount,
      processedMintCount: data.processedMintCount,
      escrowVault: data.escrowVault,
    };
  }

  // ── Contest PDA derivation (Phase 1 — LE bytes fix) ──────────────────────────

  private deriveContestPda(id: number): PublicKey {
    // On-chain seed is [CONTEST_SEED, id.to_le_bytes()] where id is a u64 (8 bytes LE).
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(BigInt(id));
    return PublicKey.findProgramAddressSync(
      [Buffer.from('contest'), idBuf],
      PROGRAM_ID,
    )[0];
  }

  // ── Full contest lifecycle ────────────────────────────────────────────────────

  private async processContest(contest: ContestData) {
    console.log(`\n📋 Processing contest #${contest.id}`);
    console.log(`   Status: ${contest.status}, Entries: ${contest.entryCount}`);

    const contestKey = contest.pubkey;

    // Step 1: Lock
    if (contest.status === 'open') {
      console.log('   🔒 Locking contest...');
      try {
        await this.program.methods
          .lockContest()
          .accountsStrict({
            config: this.configAddress,
            contest: contestKey,
            keeper: this.keeperKeypair.publicKey,
          })
          .signers([this.keeperKeypair])
          .rpc();
        console.log('   ✅ Contest locked');
      } catch (e: any) {
        if (e.message?.includes('ContestNotStarted')) {
          console.log('   ⏳ Contest not started yet, skipping...');
          return;
        }
        throw e;
      }
    }

    // Step 2: Process every athlete mint vault (Phase 1 — was completely missing)
    console.log(`   🔄 Processing ${contest.totalMintCount} athlete mint(s)...`);
    await this.processEntryMints(contestKey, contest);

    // Step 3: Fetch + set scores in batches (Phase 2 — N txns → batched)
    console.log('   📊 Setting scores...');
    const scoredEntries = await this.setScoresBatched(contestKey);

    // Step 4: Calculate rankings (entries already sorted desc by step 3)
    console.log('   🏆 Calculating rankings...');
    await this.calculateRankingsBatched(contestKey, scoredEntries);

    // Step 5: Settle
    console.log('   💰 Settling contest...');
    await this.settleContest(contestKey, contest.escrowVault);

    console.log(`   ✅ Contest #${contest.id} processed successfully`);
  }

  // ── Step 2: process_entry_mint per athlete mint ───────────────────────────────

  private async processEntryMints(contestKey: PublicKey, contest: ContestData) {
    console.log(`   🔄 Processing entry mints. Processed so far: ${contest.processedMintCount}/${contest.totalMintCount}`);

    // @ts-ignore
    const configData = await this.program.account.adminConfig.fetch(this.configAddress);
    const usdcMint = configData.usdcMint as PublicKey;

    const tokenAccounts = await this.connection.getTokenAccountsByOwner(contestKey, {
      programId: TOKEN_PROGRAM_ID
    });

    let processedCount = contest.processedMintCount;
    for (const { pubkey, account } of tokenAccounts.value) {
      if (processedCount >= contest.totalMintCount) {
        break;
      }
      const mintPubkey = new PublicKey(account.data.slice(0, 32));

      if (mintPubkey.equals(usdcMint)) {
        continue;
      }

      const amountBytes = account.data.slice(64, 72);
      const amount = amountBytes.readBigUInt64LE(0);

      if (amount === 0n) {
        continue;
      }

      const poolAddress = PublicKey.findProgramAddressSync(
        [Buffer.from('pool'), mintPubkey.toBuffer()],
        PROGRAM_ID
      )[0];

      const poolTokenVault = getAssociatedTokenAddressSync(mintPubkey, poolAddress, true);
      const poolUsdcVault = getAssociatedTokenAddressSync(usdcMint, poolAddress, true);
      const contestTokenVault = pubkey;

      try {
        await this.program.methods
          .processEntryMint()
          .accountsStrict({
            contest: contestKey,
            pool: poolAddress,
            mint: mintPubkey,
            contestTokenVault,
            contestEscrowVault: contest.escrowVault,
            config: this.configAddress,
            poolTokenVault,
            poolUsdcVault,
            poolAuthority: poolAddress,
            keeper: this.keeperKeypair.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([this.keeperKeypair])
          .rpc();
        
        processedCount++;
        console.log(`      ✅ Processed mint ${mintPubkey.toBase58()} (${processedCount}/${contest.totalMintCount})`);
      } catch (e: any) {
        console.error(`      ❌ Error processing mint ${mintPubkey.toBase58()}:`, e.message);
      }
    }
  }

  // ── Step 3: batch set_scores (Phase 2) ───────────────────────────────────────

  private async setScoresBatched(contestKey: PublicKey): Promise<ScoredEntry[]> {
    const entries = await this.getEntriesForContest(contestKey);
    if (entries.length === 0) return [];

    // Fetch real scores from a sports API; use mock here.
    const scored: ScoredEntry[] = entries.map((e, idx) => ({
      pubkey: e.pubkey,
      score: Math.floor(Math.random() * 100) + 50 + idx, // deterministic-ish for tests
    }));

    // Chunk into batches of MAX_ENTRIES_PER_TX to respect Solana's tx size limit.
    for (let i = 0; i < scored.length; i += MAX_ENTRIES_PER_TX) {
      const batch = scored.slice(i, i + MAX_ENTRIES_PER_TX);
      try {
        await this.program.methods
          .setScores(batch.map(e => e.score))
          .accountsStrict({
            config: this.configAddress,
            contest: contestKey,
            keeper: this.keeperKeypair.publicKey,
          })
          .remainingAccounts(
            batch.map(e => ({ pubkey: e.pubkey, isWritable: true, isSigner: false })),
          )
          .signers([this.keeperKeypair])
          .rpc();
        console.log(`   ✅ Scored entries ${i + 1}–${i + batch.length}`);
      } catch (e) {
        console.error(`   ❌ Error scoring batch ${i}–${i + batch.length}:`, e);
      }
    }

    return scored;
  }

  // ── Step 4: calculate_rankings (Phase 1 — sorts by score desc) ───────────────

  private async calculateRankingsBatched(
    contestKey: PublicKey,
    scoredEntries: ScoredEntry[],
  ) {
    if (scoredEntries.length === 0) {
      // Re-fetch entries and their scores from chain if we don't have them in memory.
      const entries = await this.getEntriesForContest(contestKey);
      scoredEntries = await this.fetchScoresFromChain(entries.map(e => e.pubkey));
    }

    // Sort descending — on-chain calculate_rankings verifies this ordering.
    scoredEntries.sort((a, b) => b.score - a.score);

    for (let i = 0; i < scoredEntries.length; i += MAX_ENTRIES_PER_TX) {
      const batch = scoredEntries.slice(i, i + MAX_ENTRIES_PER_TX);
      try {
        await this.program.methods
          .calculateRankings()
          .accountsStrict({
            config: this.configAddress,
            contest: contestKey,
            keeper: this.keeperKeypair.publicKey,
          })
          .remainingAccounts(
            batch.map(e => ({ pubkey: e.pubkey, isWritable: true, isSigner: false })),
          )
          .signers([this.keeperKeypair])
          .rpc();
        console.log(`   ✅ Ranked entries ${i + 1}–${i + batch.length}`);
      } catch (e) {
        console.error('   ❌ Error calculating rankings batch:', e);
      }
    }
  }

  private async settleContest(contestKey: PublicKey, escrowVault: PublicKey) {
    try {
      await this.program.methods
        .settleContest()
        .accountsStrict({
          config: this.configAddress,
          contest: contestKey,
          escrowVault,
          keeper: this.keeperKeypair.publicKey,
        })
        .signers([this.keeperKeypair])
        .rpc();
    } catch (e) {
      console.error('   ❌ Error settling contest:', e);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Fetches all UserEntry accounts belonging to a contest.
   *
   * UserEntry layout: discriminator(8) + user(32) + contest(32) + ...
   * The `contest` field starts at byte offset 40.
   */
  private async getEntriesForContest(contestKey: PublicKey) {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 40, // discriminator(8) + user(32) = 40
            bytes: contestKey.toBase58(),
          },
        },
      ],
    });

    return accounts.map(acc => ({ pubkey: acc.pubkey }));
  }

  /**
   * Re-reads each UserEntry's `score` field from chain.
   * Used when in-memory scored entries are unavailable (e.g., safety sweep path).
   */
  private async fetchScoresFromChain(pubkeys: PublicKey[]): Promise<ScoredEntry[]> {
    const results: ScoredEntry[] = [];

    for (const pubkey of pubkeys) {
      try {
        // @ts-ignore
        const entry = await this.program.account.userEntry.fetch(pubkey);
        results.push({ pubkey, score: entry.score.toNumber() });
      } catch (e) {
        console.error('Error fetching entry score:', e);
      }
    }

    return results;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const config: KeeperConfig = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    keeperPrivateKey: process.env.KEEPER_PRIVATE_KEY || '',
  };

  const keeper = new DexiKeeper(config);

  process.on('SIGINT', () => {
    keeper.stop();
    process.exit(0);
  });

  await keeper.start();
}

main().catch(console.error);