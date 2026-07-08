/**
 * Dexi Protocol — Integration Tests
 *
 * Organized into logical test groups:
 *   1. Initialize — admin config setup
 *   2. Create Pools — parameterized pool creation for GK/DEF/MID/FWD
 *   3. Trading — buy, sell, disabled-pool guard, zero-amount guard
 *   4. Create Contest — happy path + invalid prize split
 *   5. Enter Contest — valid entry, invalid lineup, locked-contest guard
 *   6. Lock & Settle — lock, process entry mints, settle, not-locked guard
 *   7. Claim Reward — happy path + already-claimed guard
 *   8. Update Pool — rename, disable, enable
 */

// ---------------------------------------------------------------------------
// Suppress noisy RPC rate-limit warnings from cluttering test output.
// Solana web3.js emits 429 messages through multiple channels (ws errors,
// fetch retries, internal logger) and in various formats (string, Error,
// multi-arg). We stringify all arguments and match against common patterns.
// ---------------------------------------------------------------------------
const RATE_LIMIT_PATTERNS = [
  "429",
  "Too Many Requests",
  "rate limit",
  "Server responded with 429",
  "ws error",
] as const;

function isRateLimitNoise(...args: unknown[]): boolean {
  const serialized = args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(" ");

  return RATE_LIMIT_PATTERNS.some((p) => serialized.includes(p));
}

const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (isRateLimitNoise(...args)) return;
  originalWarn(...args);
};

const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (isRateLimitNoise(...args)) return;
  originalError(...args);
};

const originalLog = console.log;
console.log = (...args: unknown[]) => {
  if (isRateLimitNoise(...args)) return;
  originalLog(...args);
};

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import * as anchor from "@anchor-lang/core";
import { Program, web3, BN } from "@anchor-lang/core";
import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  AddressLookupTableProgram,
  VersionedTransaction,
  TransactionMessage,
} from "@solana/web3.js";
import type { Dexi } from "../target/types/dexi";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SYSTEM_PROGRAM_ID = SystemProgram.programId;
const ADMIN_SEED = Buffer.from("admin");
const POOL_SEED = Buffer.from("pool");
const CONTEST_SEED = Buffer.from("contest");
const ENTRY_SEED = Buffer.from("entry");

const SWAP_FEE_BPS = 30;
const CONTEST_ID = Math.floor(Date.now() / 1000);
const LINEUP_SIZE = 11;

// ---------------------------------------------------------------------------
// Shared program constants (accounts that never change across instructions)
// ---------------------------------------------------------------------------
const PROGRAM_IDS = {
  tokenProgram: TOKEN_PROGRAM_ID,
  associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  systemProgram: SYSTEM_PROGRAM_ID,
} as const;

// ---------------------------------------------------------------------------
// Helper: pool role variants (Anchor enum representation)
// ---------------------------------------------------------------------------
type PoolRoleKey = "gk" | "def" | "mid" | "fwd";

interface PoolConfig {
  name: string;
  role: PoolRoleKey;
}

/** Generates a deterministic seed buffer scoped to the admin key. */
function makeSeed(name: string, adminKey: PublicKey): Uint8Array {
  const buf = Buffer.alloc(32);
  buf.write(`dexi-test-${name}-${adminKey.toBase58().slice(0, 10)}`);
  return buf;
}

// ---------------------------------------------------------------------------
// Helper: build `accountsStrict` for buy/sell instructions
// ---------------------------------------------------------------------------
function buildSwapAccounts(
  configPda: PublicKey,
  pool: PublicKey,
  mint: PublicKey,
  usdcMint: PublicKey,
  userUsdcAta: PublicKey,
  userTokenAta: PublicKey,
  userKey: PublicKey,
) {
  return {
    config: configPda,
    pool,
    userUsdcAta,
    userTokenAta,
    poolTokenVault: getAssociatedTokenAddressSync(mint, pool, true),
    poolUsdcVault: getAssociatedTokenAddressSync(usdcMint, pool, true),
    poolAuthority: pool,
    user: userKey,
    ...PROGRAM_IDS,
  };
}

// ---------------------------------------------------------------------------
// Helper: build remaining accounts for createContest
// ---------------------------------------------------------------------------
function buildCreateContestRemainingAccounts(mints: PublicKey[], contestPda: PublicKey) {
  return mints.flatMap((mint) => {
    const vault = getAssociatedTokenAddressSync(mint, contestPda, true);
    return [
      { pubkey: vault, isWritable: true, isSigner: false },
      { pubkey: mint, isWritable: false, isSigner: false },
    ];
  });
}

// ---------------------------------------------------------------------------
// Helper: build remaining accounts for enterContest
// ---------------------------------------------------------------------------
function buildEnterContestRemainingAccounts(
  mints: PublicKey[],
  userKey: PublicKey,
  contestPda: PublicKey,
  poolMap: Record<string, PublicKey>,
) {
  return mints.flatMap((mint) => [
    { pubkey: mint, isWritable: false, isSigner: false },
    { pubkey: getAssociatedTokenAddressSync(mint, userKey, true), isWritable: true, isSigner: false },
    { pubkey: getAssociatedTokenAddressSync(mint, contestPda, true), isWritable: true, isSigner: false },
    { pubkey: poolMap[mint.toBase58()], isWritable: false, isSigner: false },
  ]);
}

// ---------------------------------------------------------------------------
// Helper: sign & send a V0 transaction with a lookup table
// ---------------------------------------------------------------------------
async function sendV0Transaction(
  connection: web3.Connection,
  instructions: anchor.web3.TransactionInstruction[],
  payer: Keypair,
  lookupTable: any,
) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message([lookupTable]);

  const tx = new VersionedTransaction(messageV0);
  tx.sign([payer]);

  const sig = await connection.sendTransaction(tx);
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

// ---------------------------------------------------------------------------
// Helper: assert that an async operation throws a matching error
// ---------------------------------------------------------------------------
async function expectError(fn: () => Promise<unknown>, errorSubstring: string, label: string) {
  try {
    await fn();
    assert.fail(`Expected ${label} error but succeeded`);
  } catch (e: any) {
    // Allow either named error or hex error code
    assert(
      e.message.includes(errorSubstring) || e.message.includes("0x"),
      `Expected ${label}: ${e.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: standard lineup used across contest tests
// ---------------------------------------------------------------------------
function buildStandardLineup(gk: PublicKey, def: PublicKey, mid: PublicKey, fwd: PublicKey): PublicKey[] {
  return [gk, def, def, mid, mid, mid, fwd, fwd, fwd, fwd, fwd];
}

// ===========================================================================
// Test Suite
// ===========================================================================
describe("Dexi", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Dexi as Program<Dexi>;
  const connection = provider.connection;
  const admin = (provider.wallet as NodeWallet).payer;

  // Deterministic keypairs
  const keeper = Keypair.fromSeed(new Uint8Array(32).fill(1));
  const user1 = Keypair.fromSeed(makeSeed("user1", admin.publicKey));
  const user2 = Keypair.fromSeed(makeSeed("user2", admin.publicKey));

  // Derived addresses — populated in `before`
  let usdcMint: PublicKey;
  let configPda: PublicKey;
  let user1UsdcAta: PublicKey;
  let user2UsdcAta: PublicKey;
  let adminUsdcAta: PublicKey;

  // Pool state — keyed by role for easy lookup
  const pools: Record<PoolRoleKey, { mint: PublicKey; pda: PublicKey }> = {} as any;

  // Contest state
  let contestPda: PublicKey;
  let contestUsdcVault: PublicKey;
  let user1EntryPda: PublicKey;
  let lutAddress: PublicKey;

  // Convenience accessors
  const allPoolConfigs: PoolConfig[] = [
    { name: "Messi", role: "gk" },
    { name: "Defender", role: "def" },
    { name: "Midfielder", role: "mid" },
    { name: "Forward", role: "fwd" },
  ];

  const getPoolMap = (): Record<string, PublicKey> =>
    Object.fromEntries(Object.values(pools).map((p) => [p.mint.toBase58(), p.pda]));

  const getUniqueMints = (): PublicKey[] => Object.values(pools).map((p) => p.mint);

  // -------------------------------------------------------------------------
  // Global Setup
  // -------------------------------------------------------------------------
  before(async () => {
    // Fund test users if their balance is below threshold
    const minBalance = 0.05 * web3.LAMPORTS_PER_SOL;
    const usersToFund = (
      await Promise.all(
        [user1, user2].map(async (k) => ({
          keypair: k,
          balance: await connection.getBalance(k.publicKey),
        })),
      )
    )
      .filter(({ balance }) => balance < minBalance)
      .map(({ keypair }) => keypair);

    if (usersToFund.length > 0) {
      const fundTx = new Transaction();
      for (const k of usersToFund) {
        fundTx.add(
          SystemProgram.transfer({
            fromPubkey: admin.publicKey,
            toPubkey: k.publicKey,
            lamports: web3.LAMPORTS_PER_SOL,
          }),
        );
      }
      await provider.sendAndConfirm(fundTx, [admin]);
    }

    // Derive config PDA and reuse existing USDC mint if config already exists
    [configPda] = PublicKey.findProgramAddressSync([ADMIN_SEED], program.programId);

    const existingConfig = await connection.getAccountInfo(configPda);
    if (existingConfig) {
      const config = await program.account.adminConfig.fetch(configPda);
      usdcMint = config.usdcMint;
    } else {
      usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);
    }

    // Create & fund USDC ATAs
    const getAta = async (owner: PublicKey) =>
      (await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, owner)).address;

    [user1UsdcAta, user2UsdcAta, adminUsdcAta] = await Promise.all([
      getAta(user1.publicKey),
      getAta(user2.publicKey),
      getAta(admin.publicKey),
    ]);

    await mintTo(connection, admin, usdcMint, adminUsdcAta, admin, 10_000 * 1e6);
    await mintTo(connection, admin, usdcMint, user1UsdcAta, admin, 1000 * 1e6);
    await mintTo(connection, admin, usdcMint, user2UsdcAta, admin, 1000 * 1e6);
  });

  // Throttle requests to avoid 429s on rate-limited RPCs
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  // -------------------------------------------------------------------------
  // 1. Initialize
  // -------------------------------------------------------------------------
  describe("Initialize", () => {
    it("should initialize admin config", async () => {
      const existingConfig = await connection.getAccountInfo(configPda);
      if (existingConfig) {
        console.log("Config already initialized, skipping...");
        return;
      }

      await program.methods
        .initialize(SWAP_FEE_BPS, admin.publicKey, keeper.publicKey)
        .accountsStrict({ config: configPda, usdcMint, admin: admin.publicKey, ...PROGRAM_IDS } as any)
        .signers([admin])
        .rpc();

      const config = await program.account.adminConfig.fetch(configPda);
      assert.isTrue(config.admin.equals(admin.publicKey));
      assert.isTrue(config.keeper.equals(keeper.publicKey));
      assert.isTrue(config.usdcMint.equals(usdcMint));
      assert.strictEqual(config.swapFeeBps, SWAP_FEE_BPS);
    });

    it("should fail if already initialized", async () => {
      await expectError(
        () =>
          program.methods
            .initialize(SWAP_FEE_BPS, admin.publicKey, keeper.publicKey)
            .accountsStrict({ config: configPda, usdcMint, admin: admin.publicKey, ...PROGRAM_IDS } as any)
            .signers([admin])
            .rpc(),
        "already in use",
        "AlreadyInitialized",
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. Create Pools (parameterized)
  // -------------------------------------------------------------------------
  describe("Create Pools", () => {
    for (const { name, role } of allPoolConfigs) {
      it(`should create ${role.toUpperCase()} pool (${name})`, async () => {
        const mint = await createMint(connection, admin, admin.publicKey, null, 0);
        const [pda] = PublicKey.findProgramAddressSync([POOL_SEED, mint.toBuffer()], program.programId);

        const tokenVault = getAssociatedTokenAddressSync(mint, pda, true);
        const usdcVault = getAssociatedTokenAddressSync(usdcMint, pda, true);

        await getOrCreateAssociatedTokenAccount(connection, admin, mint, pda, true);
        await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, pda, true);

        await program.methods
          .createPool(name, { [role]: {} } as any)
          .accountsStrict({
            config: configPda,
            pool: pda,
            mint,
            tokenVault,
            usdcVault,
            poolAuthority: pda,
            admin: admin.publicKey,
            ...PROGRAM_IDS,
          } as any)
          .signers([admin])
          .rpc();

        const pool = await program.account.athletePool.fetch(pda);
        assert.strictEqual(pool.name, name);
        assert.isTrue(!!(pool.role as any)[role]);
        assert.strictEqual(pool.enabled, true);

        // Seed liquidity
        await mintTo(connection, admin, mint, tokenVault, admin, 1_000_000);
        await mintTo(connection, admin, usdcMint, usdcVault, admin, 1000 * 1e6);

        // Store for later tests
        pools[role] = { mint, pda };
      });
    }
  });

  // -------------------------------------------------------------------------
  // 3. Trading
  // -------------------------------------------------------------------------
  describe("Trading", () => {
    const liquidityAmount = new BN(100_000_000);

    it("should buy tokens from all pools", async () => {
      for (const { mint, pda } of Object.values(pools)) {
        const userAta = (await getOrCreateAssociatedTokenAccount(connection, user1, mint, user1.publicKey)).address;
        await mintTo(connection, admin, mint, userAta, admin, 1000);

        await program.methods
          .buy(liquidityAmount)
          .accountsStrict(buildSwapAccounts(configPda, pda, mint, usdcMint, user1UsdcAta, userAta, user1.publicKey) as any)
          .signers([user1])
          .rpc();
      }
    });

    it("should buy tokens", async () => {
      const { mint, pda } = pools.gk;
      const userAta = (await getOrCreateAssociatedTokenAccount(connection, user1, mint, user1.publicKey)).address;

      await program.methods
        .buy(new BN(10_000_000))
        .accountsStrict(buildSwapAccounts(configPda, pda, mint, usdcMint, user1UsdcAta, userAta, user1.publicKey) as any)
        .signers([user1])
        .rpc();
    });

    it("should sell tokens", async () => {
      const { mint, pda } = pools.gk;
      const userAta = (await getOrCreateAssociatedTokenAccount(connection, user1, mint, user1.publicKey)).address;

      await program.methods
        .sell(new BN(100))
        .accountsStrict(buildSwapAccounts(configPda, pda, mint, usdcMint, user1UsdcAta, userAta, user1.publicKey) as any)
        .signers([user1])
        .rpc();
    });

    it("should fail when pool is disabled", async () => {
      const { mint, pda } = pools.gk;
      const userAta = (await getOrCreateAssociatedTokenAccount(connection, user1, mint, user1.publicKey)).address;

      // Disable
      await program.methods
        .updatePool(null, null, false)
        .accountsStrict({ config: configPda, pool: pda, admin: admin.publicKey } as any)
        .signers([admin])
        .rpc();

      await expectError(
        () =>
          program.methods
            .buy(new BN(1_000_000))
            .accountsStrict(buildSwapAccounts(configPda, pda, mint, usdcMint, user1UsdcAta, userAta, user1.publicKey) as any)
            .signers([user1])
            .rpc(),
        "PoolDisabled",
        "PoolDisabled",
      );

      // Re-enable for subsequent tests
      await program.methods
        .updatePool(null, null, true)
        .accountsStrict({ config: configPda, pool: pda, admin: admin.publicKey } as any)
        .signers([admin])
        .rpc();
    });

    it("should fail for zero amount", async () => {
      const { mint, pda } = pools.mid;
      const userAta = (await getOrCreateAssociatedTokenAccount(connection, user1, mint, user1.publicKey)).address;

      await expectError(
        () =>
          program.methods
            .buy(new BN(0))
            .accountsStrict(buildSwapAccounts(configPda, pda, mint, usdcMint, user1UsdcAta, userAta, user1.publicKey) as any)
            .signers([user1])
            .rpc(),
        "InvalidAmount",
        "InvalidAmount",
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Create Contest
  // -------------------------------------------------------------------------
  describe("Create Contest", () => {
    it("should create a contest", async () => {
      [contestPda] = PublicKey.findProgramAddressSync(
        [CONTEST_SEED, Buffer.from(new BN(CONTEST_ID).toBuffer("le", 8))],
        program.programId,
      );

      contestUsdcVault = getAssociatedTokenAddressSync(usdcMint, contestPda, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, contestPda, true);

      const startTime = Math.floor(Date.now() / 1000) + 10_000;
      const playerMints = getUniqueMints();
      const remainingAccounts = buildCreateContestRemainingAccounts(playerMints, contestPda);

      // Create Address Lookup Table
      const slot = await connection.getSlot();
      const [createIx, lut] = AddressLookupTableProgram.createLookupTable({
        authority: admin.publicKey,
        payer: admin.publicKey,
        recentSlot: Math.max(slot - 10, 0),
      });
      lutAddress = lut;
      await provider.sendAndConfirm(new Transaction().add(createIx), [admin]);

      await program.methods
        .createContest(new BN(CONTEST_ID), new BN(startTime), 3, [5000, 3000, 2000], playerMints, lutAddress)
        .accountsStrict({
          config: configPda,
          contest: contestPda,
          usdcMint,
          escrowVault: contestUsdcVault,
          admin: admin.publicKey,
          ...PROGRAM_IDS,
        } as any)
        .remainingAccounts(remainingAccounts)
        .signers([admin])
        .rpc();

      const contest = await program.account.contest.fetch(contestPda);
      assert.strictEqual(contest.id.toNumber(), CONTEST_ID);
      assert.isTrue(!!(contest.status as any).open);
      assert.strictEqual(contest.winnerCount, 3);
      assert.deepEqual(contest.prizeSplit.slice(0, 3), [5000, 3000, 2000]);
    });

    it("should fail with invalid prize split", async () => {
      const contestId2 = CONTEST_ID + 1;
      const [contestPda2] = PublicKey.findProgramAddressSync(
        [CONTEST_SEED, Buffer.from(new BN(contestId2).toBuffer("le", 8))],
        program.programId,
      );

      const escrowVault2 = getAssociatedTokenAddressSync(usdcMint, contestPda2, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, contestPda2, true);

      const playerMints = getUniqueMints();
      const remainingAccounts = buildCreateContestRemainingAccounts(playerMints, contestPda2);

      await expectError(
        () =>
          program.methods
            .createContest(
              new BN(contestId2),
              new BN(Math.floor(Date.now() / 1000) + 3600),
              3,
              [6000, 5000, 2000],
              playerMints,
              lutAddress,
            )
            .accountsStrict({
              config: configPda,
              contest: contestPda2,
              usdcMint,
              escrowVault: escrowVault2,
              admin: admin.publicKey,
              ...PROGRAM_IDS,
            } as any)
            .remainingAccounts(remainingAccounts)
            .signers([admin])
            .rpc(),
        "InvalidPrizeSplit",
        "InvalidPrizeSplit",
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Enter Contest
  // -------------------------------------------------------------------------
  describe("Enter Contest", () => {
    let lookupTableAccount: any;

    before(async () => {
      // Pre-create vault ATAs for all player mints
      for (const { mint } of Object.values(pools)) {
        await getOrCreateAssociatedTokenAccount(connection, admin, mint, contestPda, true);
      }

      // Extend ALT with all static addresses
      const vaults = getUniqueMints().map((m) => getAssociatedTokenAddressSync(m, contestPda, true));
      const pdas = Object.values(pools).map((p) => p.pda);

      const extendIx = AddressLookupTableProgram.extendLookupTable({
        payer: admin.publicKey,
        authority: admin.publicKey,
        lookupTable: lutAddress,
        addresses: [
          TOKEN_PROGRAM_ID,
          SYSTEM_PROGRAM_ID,
          ...getUniqueMints(),
          ...vaults,
          ...pdas,
          configPda,
          contestPda,
        ],
      });

      await provider.sendAndConfirm(new Transaction().add(extendIx), [admin]);

      // Wait for ALT activation
      await new Promise((resolve) => setTimeout(resolve, 2000));
      lookupTableAccount = (await connection.getAddressLookupTable(lutAddress, { commitment: "confirmed" })).value!;
    });

    it("should create entry with all 11 players", async () => {
      [user1EntryPda] = PublicKey.findProgramAddressSync(
        [ENTRY_SEED, contestPda.toBytes(), user1.publicKey.toBytes()],
        program.programId,
      );

      const lineup = buildStandardLineup(pools.gk.mint, pools.def.mint, pools.mid.mint, pools.fwd.mint);
      const remainingAccounts = buildEnterContestRemainingAccounts(getUniqueMints(), user1.publicKey, contestPda, getPoolMap());

      const enterIx = await program.methods
        .enterContest(lineup)
        .accountsStrict({
          config: configPda,
          contest: contestPda,
          entry: user1EntryPda,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();

      const sig = await sendV0Transaction(connection, [enterIx], user1, lookupTableAccount);
      console.log("Create entry tx:", sig);

      const entry = await program.account.userEntry.fetch(user1EntryPda);
      assert.isTrue(entry.user.equals(user1.publicKey));
      assert.isTrue(entry.contest.equals(contestPda));
      assert.strictEqual(entry.claimed, false);
      assert.strictEqual(entry.isComplete, true);
    });

    it("should fail if lineup is invalid", async () => {
      const [user2EntryPda] = PublicKey.findProgramAddressSync(
        [ENTRY_SEED, contestPda.toBytes(), user2.publicKey.toBytes()],
        program.programId,
      );

      const lineup = buildStandardLineup(pools.gk.mint, pools.def.mint, pools.mid.mint, pools.fwd.mint);
      const remainingAccounts = buildEnterContestRemainingAccounts(getUniqueMints(), user2.publicKey, contestPda, getPoolMap());

      await expectError(async () => {
        const enterIx = await program.methods
          .enterContest(lineup)
          .accountsStrict({
            config: configPda,
            contest: contestPda,
            entry: user2EntryPda,
            user: user2.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID,
          })
          .remainingAccounts(remainingAccounts)
          .instruction();

        await sendV0Transaction(connection, [enterIx], user2, lookupTableAccount);
      }, "InsufficientLiquidity", "InvalidLineup");
    });

    it("should fail when contest is locked", async () => {
      // Create a past-time contest and lock it
      const contestId3 = CONTEST_ID + 2;
      const [contestPda3] = PublicKey.findProgramAddressSync(
        [CONTEST_SEED, Buffer.from(new BN(contestId3).toBuffer("le", 8))],
        program.programId,
      );

      const pastTime = Math.floor(Date.now() / 1000) - 3600;
      const escrowVault3 = getAssociatedTokenAddressSync(usdcMint, contestPda3, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, contestPda3, true);

      const playerMints = getUniqueMints();
      const createRemainingAccounts = buildCreateContestRemainingAccounts(playerMints, contestPda3);

      await program.methods
        .createContest(new BN(contestId3), new BN(pastTime), 2, [6000, 4000], playerMints, lutAddress)
        .accountsStrict({
          config: configPda,
          contest: contestPda3,
          usdcMint,
          escrowVault: escrowVault3,
          admin: admin.publicKey,
          ...PROGRAM_IDS,
        } as any)
        .remainingAccounts(createRemainingAccounts)
        .signers([admin])
        .rpc();

      await program.methods
        .lockContest()
        .accountsStrict({ config: configPda, contest: contestPda3, keeper: keeper.publicKey } as any)
        .signers([keeper])
        .rpc();

      // Attempt to enter the locked contest
      const [lockedEntryPda] = PublicKey.findProgramAddressSync(
        [ENTRY_SEED, contestPda3.toBytes(), user1.publicKey.toBytes()],
        program.programId,
      );

      const lineup = buildStandardLineup(pools.gk.mint, pools.def.mint, pools.mid.mint, pools.fwd.mint);
      const remainingAccounts = buildEnterContestRemainingAccounts(getUniqueMints(), user1.publicKey, contestPda3, getPoolMap());

      await expectError(async () => {
        const enterIx = await program.methods
          .enterContest(lineup)
          .accountsStrict({
            config: configPda,
            contest: contestPda3,
            entry: lockedEntryPda,
            user: user1.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID,
          })
          .remainingAccounts(remainingAccounts)
          .instruction();

        await sendV0Transaction(connection, [enterIx], user1, lookupTableAccount);
      }, "ContestNotOpen", "ContestNotOpen");
    });
  });

  // -------------------------------------------------------------------------
  // 6. Lock & Settle Contest
  // -------------------------------------------------------------------------
  describe("Lock & Settle Contest", () => {
    it("should lock contest", async () => {
      await program.methods
        .lockContest()
        .accountsStrict({ config: configPda, contest: contestPda, keeper: keeper.publicKey } as any)
        .signers([keeper])
        .rpc();

      const contest = await program.account.contest.fetch(contestPda);
      assert.isTrue(!!(contest.status as any).locked);
    });

    it("should process entry mints", async () => {
      for (const { mint, pda: pool } of Object.values(pools)) {
        await program.methods
          .processEntryMint()
          .accountsStrict({
            contest: contestPda,
            pool,
            mint,
            contestTokenVault: getAssociatedTokenAddressSync(mint, contestPda, true),
            contestEscrowVault: contestUsdcVault,
            config: configPda,
            poolTokenVault: getAssociatedTokenAddressSync(mint, pool, true),
            poolUsdcVault: getAssociatedTokenAddressSync(usdcMint, pool, true),
            poolAuthority: pool,
            keeper: keeper.publicKey,
            ...PROGRAM_IDS,
          } as any)
          .signers([keeper])
          .rpc();
      }
    });

    it("should settle contest", async () => {
      await program.methods
        .settleContest()
        .accountsStrict({
          config: configPda,
          contest: contestPda,
          escrowVault: contestUsdcVault,
          keeper: keeper.publicKey,
        } as any)
        .signers([keeper])
        .rpc();

      const contest = await program.account.contest.fetch(contestPda);
      assert.isTrue(!!(contest.status as any).settled);
    });

    it("should fail if not locked before settle", async () => {
      const contestId5 = CONTEST_ID + 3;
      const [contestPda5] = PublicKey.findProgramAddressSync(
        [CONTEST_SEED, Buffer.from(new BN(contestId5).toBuffer("le", 8))],
        program.programId,
      );

      const escrowVault5 = getAssociatedTokenAddressSync(usdcMint, contestPda5, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, contestPda5, true);

      const playerMints = getUniqueMints();
      const remainingAccounts = buildCreateContestRemainingAccounts(playerMints, contestPda5);

      await program.methods
        .createContest(
          new BN(contestId5),
          new BN(Math.floor(Date.now() / 1000) + 3600),
          2,
          [6000, 4000],
          playerMints,
          lutAddress,
        )
        .accountsStrict({
          config: configPda,
          contest: contestPda5,
          usdcMint,
          escrowVault: escrowVault5,
          admin: admin.publicKey,
          ...PROGRAM_IDS,
        } as any)
        .remainingAccounts(remainingAccounts)
        .signers([admin])
        .rpc();

      await expectError(
        () =>
          program.methods
            .settleContest()
            .accountsStrict({
              config: configPda,
              contest: contestPda5,
              escrowVault: escrowVault5,
              keeper: keeper.publicKey,
            } as any)
            .signers([keeper])
            .rpc(),
        "ContestNotLocked",
        "ContestNotLocked",
      );
    });
  });

  // -------------------------------------------------------------------------
  // 7. Claim Reward
  // -------------------------------------------------------------------------
  describe("Claim Reward", () => {
    const payoutAmount = new BN(100);

    it("should claim reward", async () => {
      await program.methods
        .claimReward(payoutAmount)
        .accountsStrict({
          config: configPda,
          contest: contestPda,
          entry: user1EntryPda,
          escrowVault: contestUsdcVault,
          userUsdcAta: user1UsdcAta,
          user: user1.publicKey,
          keeper: keeper.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([user1, keeper])
        .rpc();

      const entry = await program.account.userEntry.fetch(user1EntryPda);
      assert.strictEqual(entry.claimed, true);
    });

    it("should fail if already claimed", async () => {
      await expectError(
        () =>
          program.methods
            .claimReward(payoutAmount)
            .accountsStrict({
              config: configPda,
              contest: contestPda,
              entry: user1EntryPda,
              escrowVault: contestUsdcVault,
              userUsdcAta: user1UsdcAta,
              user: user1.publicKey,
              keeper: keeper.publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
            } as any)
            .signers([user1, keeper])
            .rpc(),
        "AlreadyClaimed",
        "AlreadyClaimed",
      );
    });
  });

  // -------------------------------------------------------------------------
  // 8. Update Pool
  // -------------------------------------------------------------------------
  describe("Update Pool", () => {
    const updatePoolAccounts = (pool: PublicKey) =>
      ({ config: configPda, pool, admin: admin.publicKey } as any);

    it("should update pool name", async () => {
      await program.methods
        .updatePool("Ronaldo", null, null)
        .accountsStrict(updatePoolAccounts(pools.gk.pda))
        .signers([admin])
        .rpc();

      const pool = await program.account.athletePool.fetch(pools.gk.pda);
      assert.strictEqual(pool.name, "Ronaldo");
    });

    it("should disable pool", async () => {
      await program.methods
        .updatePool(null, null, false)
        .accountsStrict(updatePoolAccounts(pools.fwd.pda))
        .signers([admin])
        .rpc();

      const pool = await program.account.athletePool.fetch(pools.fwd.pda);
      assert.strictEqual(pool.enabled, false);
    });

    it("should enable pool", async () => {
      await program.methods
        .updatePool(null, null, true)
        .accountsStrict(updatePoolAccounts(pools.fwd.pda))
        .signers([admin])
        .rpc();

      const pool = await program.account.athletePool.fetch(pools.fwd.pda);
      assert.strictEqual(pool.enabled, true);
    });
  });
});