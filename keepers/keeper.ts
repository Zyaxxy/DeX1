import 'dotenv/config';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import bs58 from 'bs58';

const PROGRAM_ID = new PublicKey('A5PqjrLDne1y5iskNFxNhSpC2w1regprbaKZPTxAtAJS');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qM1xGkfE4dV5ZG1L1K2e7Z9R4'); // USDC on devnet

const POLL_INTERVAL_MS = 30_000; // 30 seconds

interface KeeperConfig {
  rpcUrl: string;
  keeperPrivateKey: string;
}

interface ContestData {
  id: number;
  admin: PublicKey;
  startTime: number;
  status: 'Open' | 'Locked' | 'Settled';
  entryCount: number;
  prizePool: number;
  winnerCount: number;
  escrowVault: PublicKey;
}

class DexiKeeper {
  private connection: Connection;
  private provider: AnchorProvider;
  private program: Program;
  private keeperKeypair: Keypair;
  private isRunning = false;

  constructor(config: KeeperConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.keeperKeypair = Keypair.fromSecretKey(
      bs58.decode(config.keeperPrivateKey)
    );
    this.provider = new AnchorProvider(
      this.connection,
      new Wallet(this.keeperKeypair),
      { commitment: 'confirmed' }
    );
    
    const idl = require('../target/idl/dexi.json');
    this.program = new Program(idl, this.provider);
  }

  async start() {
    console.log('🤖 Dexi Keeper started');
    console.log('Keeper address:', this.keeperKeypair.publicKey.toBase58());
    this.isRunning = true;
    await this.runLoop();
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 Keeper stopped');
  }

  private async runLoop() {
    while (this.isRunning) {
      try {
        await this.processContests();
      } catch (error) {
        console.error('Error in keeper loop:', error);
      }
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  private async processContests() {
    const contests = await this.findContestsNeedingAction();
    console.log(`Found ${contests.length} contests needing action`);
    
    for (const contest of contests) {
      try {
        await this.processContest(contest);
      } catch (error) {
        console.error(`Error processing contest ${contest.id}:`, error);
      }
    }
  }

  private async findContestsNeedingAction(): Promise<ContestData[]> {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          dataSize: 500, // Approximate Contest account size
        },
      ],
    });

    const contests: ContestData[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const account of accounts) {
      try {
        //@ts-ignore
        const data = this.program.coder.accounts.decode('Contest', account.account.data);
        const status = Object.keys(data.status)[0];
        
        if (status === 'open' && data.startTime && data.startTime.lte(now)) {
          contests.push({
            id: data.id.toNumber(),
            admin: data.admin,
            startTime: data.startTime.toNumber(),
            status: 'Open',
            entryCount: data.entryCount.toNumber(),
            prizePool: data.prizePool.toNumber(),
            winnerCount: data.winnerCount,
            escrowVault: data.escrowVault,
          });
        }
      } catch {
        // Skip invalid accounts
      }
    }

    return contests;
  }

  private async processContest(contest: ContestData) {
    console.log(`\n📋 Processing contest #${contest.id}`);
    console.log(`   Status: ${contest.status}, Entries: ${contest.entryCount}`);

    const contestKey = PublicKey.findProgramAddressSync(
      [Buffer.from('contest'), Buffer.from(contest.id.toString())],
      PROGRAM_ID
    )[0];

    // Step 1: Lock contest
    if (contest.status === 'Open') {
      console.log('   🔒 Locking contest...');
      try {
        await this.program.methods
          .lockContest()
          .accountsStrict({
            config: await this.getConfigAddress(),
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

    // Step 2: Set scores (mock - in production, fetch from sports API)
    console.log('   📊 Setting scores...');
    await this.setScores(contestKey);

    // Step 3: Calculate rankings
    console.log('   🏆 Calculating rankings...');
    await this.calculateRankings(contestKey, contest.entryCount);

    // Step 4: Settle contest
    console.log('   💰 Settling contest...');
    await this.settleContest(contestKey, contest.escrowVault);

    console.log(`   ✅ Contest #${contest.id} processed successfully`);
  }

  private async getConfigAddress(): Promise<PublicKey> {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('admin')],
      PROGRAM_ID
    )[0];
  }

  private async setScores(contestKey: PublicKey) {
    const entries = await this.getEntriesForContest(contestKey);
    
    for (const entry of entries) {
      const mockScore = Math.floor(Math.random() * 100) + 50;
      try {
        await this.program.methods
          .setScores(mockScore)
          .accountsStrict({
            config: await this.getConfigAddress(),
            contest: contestKey,
            entry: entry.pubkey,
            keeper: this.keeperKeypair.publicKey,
          })
          .signers([this.keeperKeypair])
          .rpc();
      } catch (e) {
        console.error('Error setting score:', e);
      }
    }
  }

  private async getEntriesForContest(contestKey: PublicKey) {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 32,
            bytes: contestKey.toBase58(),
          },
        },
      ],
    });

    return accounts.map(acc => ({ pubkey: acc.pubkey }));
  }

  private async calculateRankings(contestKey: PublicKey, entryCount: number) {
    const entries = await this.getEntriesForContest(contestKey);
    
    // Sort entries by score (mock - in production, fetch scores from chain)
    entries.sort((a, b) => Math.random() - 0.5);

    try {
      await this.program.methods
        .calculateRankings()
        .accountsStrict({
          config: await this.getConfigAddress(),
          contest: contestKey,
          keeper: this.keeperKeypair.publicKey,
        })
        .remainingAccounts(
          entries.map(e => ({
            pubkey: e.pubkey,
            isWritable: true,
            isSigner: false,
          }))
        )
        .signers([this.keeperKeypair])
        .rpc();
    } catch (e) {
      console.error('Error calculating rankings:', e);
    }
  }

  private async settleContest(contestKey: PublicKey, escrowVault: PublicKey) {
    try {
      await this.program.methods
        .settleContest()
        .accountsStrict({
          config: await this.getConfigAddress(),
          contest: contestKey,
          escrowVault: escrowVault,
          keeper: this.keeperKeypair.publicKey,
        })
        .signers([this.keeperKeypair])
        .rpc();
    } catch (e) {
      console.error('Error settling contest:', e);
    }
  }
}

// Main execution
async function main() {
  const config: KeeperConfig = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    keeperPrivateKey: process.env.KEEPER_PRIVATE_KEY || '',
  };

  if (!config.keeperPrivateKey) {
    console.error('❌ KEEPER_PRIVATE_KEY environment variable required');
    console.log('   Generate a keypair: solana-keygen new -o keeper.json');
    console.log('   Get private key: solana-keygen pubkey keeper.json');
    process.exit(1);
  }

  const keeper = new DexiKeeper(config);
  
  process.on('SIGINT', () => {
    keeper.stop();
    process.exit(0);
  });

  await keeper.start();
}

main().catch(console.error);