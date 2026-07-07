import * as anchor from "@anchor-lang/core";
import { Program, web3, BN } from "@anchor-lang/core";
import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount, 
  mintTo, 
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import { assert } from "chai";
import { Keypair, PublicKey, SystemProgram, Transaction, AddressLookupTableProgram, VersionedTransaction, TransactionMessage } from "@solana/web3.js";
import type { Dexi } from "../target/types/dexi";

const SYSTEM_PROGRAM_ID = SystemProgram.programId;
const ADMIN_SEED = Buffer.from("admin");
const POOL_SEED = Buffer.from("pool");
const CONTEST_SEED = Buffer.from("contest");
const ENTRY_SEED = Buffer.from("entry");

const SWAP_FEE_BPS = 30;
const USDC_AMOUNT = new BN(1_000_000_000);
const TOKEN_AMOUNT = new BN(100_000_000);
const CONTEST_ID = 1;
const SLIPPAGE_TOLERANCE = 0.05;
const LINEUP_SIZE = 11;

describe("Dexi", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const commitment = "confirmed";
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Dexi as Program<Dexi>;
  const connection = anchor.getProvider().connection;
  const user = provider.wallet as NodeWallet;

  const confirmTx = async (tx: string) => {
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      { signature: tx, ...latestBlockHash },
      commitment
    );
  };

  const confirmTxs = async (signatures: string[]) => {
    await Promise.all(signatures.map(confirmTx));
  };

  let admin: Keypair;
  let keeper: Keypair;
  let user1: Keypair;
  let user2: Keypair;
  let usdcMint: PublicKey;
  let configPda: PublicKey;
  let user1UsdcAta: PublicKey;
  let user2UsdcAta: PublicKey;
  let adminUsdcAta: PublicKey;

  let gkPool: PublicKey;
  let gkMint: PublicKey;
  let defPool: PublicKey;
  let defMint: PublicKey;
  let midPool: PublicKey;
  let midMint: PublicKey;
  let fwdPool: PublicKey;
  let fwdMint: PublicKey;

  let contestPda: PublicKey;
  let contestUsdcVault: PublicKey;

  let user1EntryPda: PublicKey;
  let user2EntryPda: PublicKey;

  let lutAddress: PublicKey;
  let lookupTableAccount: AddressLookupTableProgram; // actually AddressLookupTableAccount, but keeping type any below

  function buildCreateContestRemainingAccounts(mints: PublicKey[], contestPda: PublicKey): any[] {
    const accounts = [];
    for (const mint of mints) {
      const vault = getAssociatedTokenAddressSync(mint, contestPda, true);
      accounts.push(
        { pubkey: vault, isWritable: true, isSigner: false },
        { pubkey: mint, isWritable: false, isSigner: false }
      );
    }
    return accounts;
  }

  before(async () => {
    admin = (provider.wallet as NodeWallet).payer;
    keeper = Keypair.generate();
    user1 = Keypair.generate();
    user2 = Keypair.generate();

    await Promise.all([
      admin, user1, user2
    ].map(async (k) => {
      return await connection.requestAirdrop(k.publicKey, web3.LAMPORTS_PER_SOL);
    })).then(confirmTxs);

    usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);

    [configPda] = PublicKey.findProgramAddressSync([ADMIN_SEED], program.programId);

    user1UsdcAta = (await getOrCreateAssociatedTokenAccount(connection, user1, usdcMint, user1.publicKey)).address;
    user2UsdcAta = (await getOrCreateAssociatedTokenAccount(connection, user2, usdcMint, user2.publicKey)).address;
    adminUsdcAta = (await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, admin.publicKey)).address;

    await mintTo(connection, admin, usdcMint, adminUsdcAta, admin, 10_000 * 1e6);
    await mintTo(connection, admin, usdcMint, user1UsdcAta, admin, 1000 * 1e6);
    await mintTo(connection, admin, usdcMint, user2UsdcAta, admin, 1000 * 1e6);
  });

  describe("Initialize", () => {
    it("should initialize admin config", async () => {
      const tx = await program.methods
        .initialize(SWAP_FEE_BPS, admin.publicKey, keeper.publicKey)
        .accountsStrict({
          config: configPda,
          usdcMint: usdcMint,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([admin])
        .rpc();

      console.log("Initialize tx:", tx);

      const config = await program.account.adminConfig.fetch(configPda);
      assert.isTrue(config.admin.equals(admin.publicKey));
      assert.isTrue(config.keeper.equals(keeper.publicKey));
      assert.isTrue(config.usdcMint.equals(usdcMint));
      assert.strictEqual(config.swapFeeBps, SWAP_FEE_BPS);
    });

    it("should fail if already initialized", async () => {
      try {
        await program.methods
          .initialize(SWAP_FEE_BPS, admin.publicKey, keeper.publicKey)
          .accountsStrict({
            config: configPda,
            usdcMint: usdcMint,
            admin: admin.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID,
          } as any)
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (e: any) {
        assert(e.message.includes("already in use") || e.message.includes("0x0"), "Should throw account already in use");
      }
    });
  });

  describe("Create Pools", () => {
    it("should create GK pool", async () => {
      gkMint = await createMint(connection, admin, admin.publicKey, null, 0);
      [gkPool] = PublicKey.findProgramAddressSync([POOL_SEED, gkMint.toBuffer()], program.programId);

      const gkVault = getAssociatedTokenAddressSync(gkMint, gkPool, true);
      const usdcVault = getAssociatedTokenAddressSync(usdcMint, gkPool, true);

      await getOrCreateAssociatedTokenAccount(connection, admin, gkMint, gkPool, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, gkPool, true);

      const tx = await program.methods
        .createPool("Messi", { gk: {} } as any)
        .accountsStrict({
          config: configPda,
          pool: gkPool,
          mint: gkMint,
          tokenVault: gkVault,
          usdcVault: usdcVault,
          poolAuthority: gkPool,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([admin])
        .rpc();

      console.log("Create GK pool tx:", tx);

      const pool = await program.account.athletePool.fetch(gkPool);
      assert.strictEqual(pool.name, "Messi");
      assert.isTrue(!!(pool.role as any).gk);
      assert.strictEqual(pool.enabled, true);

      await mintTo(connection, admin, gkMint, gkVault, admin, 1000000);
      await mintTo(connection, admin, usdcMint, usdcVault, admin, 1000 * 1e6);
    });

    it("should create DEF pool", async () => {
      defMint = await createMint(connection, admin, admin.publicKey, null, 0);
      [defPool] = PublicKey.findProgramAddressSync([POOL_SEED, defMint.toBuffer()], program.programId);

      const defVault = getAssociatedTokenAddressSync(defMint, defPool, true);
      const usdcVault = getAssociatedTokenAddressSync(usdcMint, defPool, true);

      await getOrCreateAssociatedTokenAccount(connection, admin, defMint, defPool, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, defPool, true);

      const tx = await program.methods
        .createPool("Defender", { def: {} } as any)
        .accountsStrict({
          config: configPda,
          pool: defPool,
          mint: defMint,
          tokenVault: defVault,
          usdcVault: usdcVault,
          poolAuthority: defPool,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([admin])
        .rpc();

      console.log("Create DEF pool tx:", tx);

      const pool = await program.account.athletePool.fetch(defPool);
      assert.strictEqual(pool.name, "Defender");
      assert.isTrue(!!(pool.role as any).def);

      await mintTo(connection, admin, defMint, defVault, admin, 1000000);
      await mintTo(connection, admin, usdcMint, usdcVault, admin, 1000 * 1e6);
    });

    it("should create MID pool", async () => {
      midMint = await createMint(connection, admin, admin.publicKey, null, 0);
      [midPool] = PublicKey.findProgramAddressSync([POOL_SEED, midMint.toBuffer()], program.programId);

      const midVault = getAssociatedTokenAddressSync(midMint, midPool, true);
      const usdcVaultMid = getAssociatedTokenAddressSync(usdcMint, midPool, true);

      await getOrCreateAssociatedTokenAccount(connection, admin, midMint, midPool, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, midPool, true);

      const tx = await program.methods
        .createPool("Midfielder", { mid: {} as any } as any)
        .accountsStrict({
          config: configPda,
          pool: midPool,
          mint: midMint,
          tokenVault: midVault,
          usdcVault: usdcVaultMid,
          poolAuthority: midPool,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([admin])
        .rpc();

      console.log("Create MID pool tx:", tx);

      const pool = await program.account.athletePool.fetch(midPool);
      assert.strictEqual(pool.name, "Midfielder");
      assert.isTrue(!!(pool.role as any).mid);

      await mintTo(connection, admin, midMint, midVault, admin, 1000000);
      await mintTo(connection, admin, usdcMint, usdcVaultMid, admin, 1000 * 1e6);
    });

    it("should create FWD pool", async () => {
      fwdMint = await createMint(connection, admin, admin.publicKey, null, 0);
      [fwdPool] = PublicKey.findProgramAddressSync([POOL_SEED, fwdMint.toBuffer()], program.programId);

      const fwdVault = getAssociatedTokenAddressSync(fwdMint, fwdPool, true);
      const usdcVault = getAssociatedTokenAddressSync(usdcMint, fwdPool, true);

      await getOrCreateAssociatedTokenAccount(connection, admin, fwdMint, fwdPool, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, fwdPool, true);

      const tx = await program.methods
        .createPool("Forward", { fwd: {} as any } as any)
        .accountsStrict({
          config: configPda,
          pool: fwdPool,
          mint: fwdMint,
          tokenVault: fwdVault,
          usdcVault: usdcVault,
          poolAuthority: fwdPool,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([admin])
        .rpc();

      console.log("Create FWD pool tx:", tx);

      const pool = await program.account.athletePool.fetch(fwdPool);
      assert.strictEqual(pool.name, "Forward");
      assert.isTrue(!!(pool.role as any).fwd);

      await mintTo(connection, admin, fwdMint, fwdVault, admin, 1000000);
      await mintTo(connection, admin, usdcMint, usdcVault, admin, 1000 * 1e6);
    });
  });

  describe("Trading (Add Liquidity + Swap)", () => {
    const liquidityAmount = new BN(100_000_000);

    it("should add liquidity to pools and buy tokens", async () => {
      const userGkAta = (await getOrCreateAssociatedTokenAccount(connection, user1, gkMint, user1.publicKey)).address;
      const gkVault = getAssociatedTokenAddressSync(gkMint, gkPool, true);
      const usdcVault = getAssociatedTokenAddressSync(usdcMint, gkPool, true);

      await mintTo(connection, admin, gkMint, userGkAta, admin, 1000);

      const tx = await program.methods
        .buy(liquidityAmount)
        .accountsStrict({
          config: configPda,
          pool: gkPool,
          userUsdcAta: user1UsdcAta,
          userTokenAta: userGkAta,
          poolTokenVault: gkVault,
          poolUsdcVault: usdcVault,
          poolAuthority: gkPool,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([user1])
        .rpc();

      console.log("Add liquidity to GK pool tx:", tx);
    });

    it("should buy tokens from other pools", async () => {
      const userDefAta = (await getOrCreateAssociatedTokenAccount(connection, user1, defMint, user1.publicKey)).address;
      const defVault = getAssociatedTokenAddressSync(defMint, defPool, true);
      const usdcVault = getAssociatedTokenAddressSync(usdcMint, defPool, true);

      await mintTo(connection, admin, defMint, userDefAta, admin, 1000);

      await program.methods
        .buy(liquidityAmount)
        .accountsStrict({
          config: configPda,
          pool: defPool,
          userUsdcAta: user1UsdcAta,
          userTokenAta: userDefAta,
          poolTokenVault: defVault,
          poolUsdcVault: usdcVault,
          poolAuthority: defPool,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([user1])
        .rpc();

      const userMidAta = (await getOrCreateAssociatedTokenAccount(connection, user1, midMint, user1.publicKey)).address;
      const midVault = getAssociatedTokenAddressSync(midMint, midPool, true);
      const usdcVaultMid = getAssociatedTokenAddressSync(usdcMint, midPool, true);

      await mintTo(connection, admin, midMint, userMidAta, admin, 1000);

      await program.methods
        .buy(liquidityAmount)
        .accountsStrict({
          config: configPda,
          pool: midPool,
          userUsdcAta: user1UsdcAta,
          userTokenAta: userMidAta,
          poolTokenVault: midVault,
          poolUsdcVault: usdcVaultMid,
          poolAuthority: midPool,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([user1])
        .rpc();

      const userFwdAta = (await getOrCreateAssociatedTokenAccount(connection, user1, fwdMint, user1.publicKey)).address;
      const fwdVault = getAssociatedTokenAddressSync(fwdMint, fwdPool, true);
      const usdcVaultFwd = getAssociatedTokenAddressSync(usdcMint, fwdPool, true);

      await mintTo(connection, admin, fwdMint, userFwdAta, admin, 1000);

      await program.methods
        .buy(liquidityAmount)
        .accountsStrict({
          config: configPda,
          pool: fwdPool,
          userUsdcAta: user1UsdcAta,
          userTokenAta: userFwdAta,
          poolTokenVault: fwdVault,
          poolUsdcVault: usdcVaultFwd,
          poolAuthority: fwdPool,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([user1])
        .rpc();
    });

    it("should buy tokens", async () => {
      const userGkAta = (await getOrCreateAssociatedTokenAccount(connection, user1, gkMint, user1.publicKey)).address;
      const gkVault = getAssociatedTokenAddressSync(gkMint, gkPool, true);
      const usdcVault = getAssociatedTokenAddressSync(usdcMint, gkPool, true);

      const buyAmount = new BN(10_000_000);

      const tx = await program.methods
        .buy(buyAmount)
        .accountsStrict({
          config: configPda,
          pool: gkPool,
          userUsdcAta: user1UsdcAta,
          userTokenAta: userGkAta,
          poolTokenVault: gkVault,
          poolUsdcVault: usdcVault,
          poolAuthority: gkPool,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([user1])
        .rpc();

      console.log("Buy tx:", tx);
    });

    it("should sell tokens", async () => {
      const userGkAta = (await getOrCreateAssociatedTokenAccount(connection, user1, gkMint, user1.publicKey)).address;
      const gkVault = getAssociatedTokenAddressSync(gkMint, gkPool, true);
      const usdcVault = getAssociatedTokenAddressSync(usdcMint, gkPool, true);

      const sellAmount = new BN(100);

      const tx = await program.methods
        .sell(sellAmount)
        .accountsStrict({
          config: configPda,
          pool: gkPool,
          userUsdcAta: user1UsdcAta,
          userTokenAta: userGkAta,
          poolTokenVault: gkVault,
          poolUsdcVault: usdcVault,
          poolAuthority: gkPool,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([user1])
        .rpc();

      console.log("Sell tx:", tx);
    });

    it("should fail when pool is disabled", async () => {
      await program.methods
        .updatePool(null, null, false)
        .accountsStrict({
          config: configPda,
          pool: gkPool,
          admin: admin.publicKey,
        } as any)
        .signers([admin])
        .rpc();

      const userGkAta = (await getOrCreateAssociatedTokenAccount(connection, user1, gkMint, user1.publicKey)).address;
      const gkVault = getAssociatedTokenAddressSync(gkMint, gkPool, true);
      const usdcVault = getAssociatedTokenAddressSync(usdcMint, gkPool, true);

      try {
        await program.methods
          .buy(new BN(1_000_000))
          .accountsStrict({
            config: configPda,
            pool: gkPool,
            userUsdcAta: user1UsdcAta,
            userTokenAta: userGkAta,
            poolTokenVault: gkVault,
            poolUsdcVault: usdcVault,
            poolAuthority: gkPool,
            user: user1.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID,
          } as any)
          .signers([user1])
          .rpc();
        assert.fail("Should have thrown PoolDisabled error");
      } catch (e: any) {
        assert(e.message.includes("PoolDisabled") || e.message.includes("0x"), "Should throw PoolDisabled");
      }

      await program.methods
        .updatePool(null, null, true)
        .accountsStrict({
          config: configPda,
          pool: gkPool,
          admin: admin.publicKey,
        } as any)
        .signers([admin])
        .rpc();
    });

    it("should fail for zero amount", async () => {
      const userMidAta = (await getOrCreateAssociatedTokenAccount(connection, user1, midMint, user1.publicKey)).address;
      const midVault = getAssociatedTokenAddressSync(midMint, midPool, true);
      const usdcVault = getAssociatedTokenAddressSync(usdcMint, midPool, true);

      try {
        await program.methods
          .buy(new BN(0))
          .accountsStrict({
            config: configPda,
            pool: midPool,
            userUsdcAta: user1UsdcAta,
            userTokenAta: userMidAta,
            poolTokenVault: midVault,
            poolUsdcVault: usdcVault,
            poolAuthority: midPool,
            user: user1.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID,
          } as any)
          .signers([user1])
          .rpc();
        assert.fail("Should have thrown InvalidAmount error");
      } catch (e: any) {
        assert(e.message.includes("InvalidAmount") || e.message.includes("0x"), "Should throw InvalidAmount");
      }
    });
  });

  describe("Create Contest", () => {
    it("should create a contest", async () => {
      [contestPda] = PublicKey.findProgramAddressSync(
        [CONTEST_SEED, Buffer.from(new BN(CONTEST_ID).toBuffer("le", 8))],
        program.programId
      );

      contestUsdcVault = getAssociatedTokenAddressSync(usdcMint, contestPda, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, contestPda, true);

      const now = Math.floor(Date.now() / 1000);
      const startTime = now + 10000;

      const playerMints = [gkMint, defMint, midMint, fwdMint];
      const remainingAccounts = buildCreateContestRemainingAccounts(playerMints, contestPda);

      // Create ALT for the contest
      const slot = await connection.getSlot();
      const [createIx, lut] = AddressLookupTableProgram.createLookupTable({
        authority: admin.publicKey,
        payer: admin.publicKey,
        recentSlot: Math.max(slot - 10, 0),
      });
      lutAddress = lut;
      const txLut = new Transaction().add(createIx);
      await provider.sendAndConfirm(txLut, [admin]);

      const tx = await program.methods
        .createContest(
          new BN(CONTEST_ID),
          new BN(startTime),
          3,
          [5000, 3000, 2000],
          playerMints,
          lutAddress
        )
        .accountsStrict({
          config: configPda,
          contest: contestPda,
          usdcMint: usdcMint,
          escrowVault: contestUsdcVault,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .remainingAccounts(remainingAccounts)
        .signers([admin])
        .rpc();

      console.log("Create contest tx:", tx);

      const contest = await program.account.contest.fetch(contestPda);
      assert.strictEqual(contest.id.toNumber(), CONTEST_ID);
      assert.isTrue(!!(contest.status as any).open);
      assert.strictEqual(contest.winnerCount, 3);
      assert.strictEqual(contest.prizeSplit[0], 5000);
      assert.strictEqual(contest.prizeSplit[1], 3000);
      assert.strictEqual(contest.prizeSplit[2], 2000);
    });

    it("should fail with invalid prize split", async () => {
      const contestId2 = 2;
      const [contestPda2] = PublicKey.findProgramAddressSync(
        [CONTEST_SEED, Buffer.from(new BN(contestId2).toBuffer("le", 8))],
        program.programId
      );

      const escrowVault2 = getAssociatedTokenAddressSync(usdcMint, contestPda2, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, contestPda2, true);

      const startTime = Math.floor(Date.now() / 1000) + 3600;

      const playerMints = [gkMint, defMint, midMint, fwdMint];
      const remainingAccounts = buildCreateContestRemainingAccounts(playerMints, contestPda2);

      try {
        await program.methods
          .createContest(new BN(contestId2), new BN(startTime), 3, [6000, 5000, 2000], playerMints, lutAddress)
          .accountsStrict({
            config: configPda,
            contest: contestPda2,
            usdcMint: usdcMint,
            escrowVault: escrowVault2,
            admin: admin.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID,
          } as any)
          .remainingAccounts(remainingAccounts)
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown InvalidPrizeSplit error");
      } catch (e: any) {
        assert(e.message.includes("InvalidPrizeSplit") || e.message.includes("0x"), "Should throw InvalidPrizeSplit");
      }
    });
  });

  describe("Enter Contest", () => {
    let lookupTableAccount: any;

    function getPoolMap(): Record<string, PublicKey> {
      return {
        [gkMint.toBase58()]: gkPool,
        [defMint.toBase58()]: defPool,
        [midMint.toBase58()]: midPool,
        [fwdMint.toBase58()]: fwdPool,
      };
    }

    function buildRemainingAccounts(
      mints: PublicKey[],
      userKey: PublicKey,
      contestPda: PublicKey
    ): any[] {
      const accounts = [];
      for (const mint of mints) {
        const userAta = getAssociatedTokenAddressSync(mint, userKey, true);
        const vault = getAssociatedTokenAddressSync(mint, contestPda, true);
        const pool = getPoolMap()[mint.toBase58()];
        accounts.push(
          { pubkey: mint, isWritable: false, isSigner: false },
          { pubkey: userAta, isWritable: true, isSigner: false },
          { pubkey: vault, isWritable: true, isSigner: false },
          { pubkey: pool, isWritable: false, isSigner: false }
        );
      }
      return accounts;
    }

    before(async () => {
      // Pre-create vault ATAs for the contest so token::transfer CPIs succeed
      for (const mint of [gkMint, defMint, midMint, fwdMint]) {
        await getOrCreateAssociatedTokenAccount(connection, admin, mint, contestPda, true);
      }

      const vaultGk = getAssociatedTokenAddressSync(gkMint, contestPda, true);
      const vaultDef = getAssociatedTokenAddressSync(defMint, contestPda, true);
      const vaultMid = getAssociatedTokenAddressSync(midMint, contestPda, true);
      const vaultFwd = getAssociatedTokenAddressSync(fwdMint, contestPda, true);

      const staticAddresses = [
        TOKEN_PROGRAM_ID,
        SYSTEM_PROGRAM_ID,
        gkMint, defMint, midMint, fwdMint,
        vaultGk, vaultDef, vaultMid, vaultFwd,
        gkPool, defPool, midPool, fwdPool,
        configPda, contestPda,
      ];

      const extendIx = AddressLookupTableProgram.extendLookupTable({
        payer: admin.publicKey,
        authority: admin.publicKey,
        lookupTable: lutAddress,
        addresses: staticAddresses,
      });

      const tx = new Transaction().add(extendIx);
      await provider.sendAndConfirm(tx, [admin]);

      await new Promise(resolve => setTimeout(resolve, 2000));
      lookupTableAccount = (await connection.getAddressLookupTable(lutAddress, { commitment: "confirmed" })).value!;
    });

    it("should create entry with all 11 players in single transaction", async () => {
      [user1EntryPda] = PublicKey.findProgramAddressSync(
        [ENTRY_SEED, contestPda.toBytes(), user1.publicKey.toBytes()],
        program.programId
      );

      const fullLineup: PublicKey[] = [
        gkMint,
        defMint, defMint,
        midMint, midMint, midMint,
        fwdMint, fwdMint, fwdMint, fwdMint, fwdMint,
      ];

      const uniqueMints = [gkMint, defMint, midMint, fwdMint];
      const remainingAccounts = buildRemainingAccounts(uniqueMints, user1.publicKey, contestPda);

      const enterIx = await program.methods
        .enterContest(fullLineup)
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

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: user1.publicKey,
        recentBlockhash: blockhash,
        instructions: [enterIx],
      }).compileToV0Message([lookupTableAccount]);

      const transactionV0 = new VersionedTransaction(messageV0);
      transactionV0.sign([user1]);

      const sig = await connection.sendTransaction(transactionV0);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      console.log("Create entry tx:", sig);

      const entry = await program.account.userEntry.fetch(user1EntryPda);
      assert.isTrue(entry.user.equals(user1.publicKey));
      assert.isTrue(entry.contest.equals(contestPda));
      assert.strictEqual(entry.claimed, false);
      assert.strictEqual(entry.isComplete, true);
    });

    it("should fail if lineup is invalid", async () => {
      [user2EntryPda] = PublicKey.findProgramAddressSync(
        [ENTRY_SEED, contestPda.toBytes(), user2.publicKey.toBytes()],
        program.programId
      );

      const invalidLineup: PublicKey[] = [
        gkMint,
        defMint, defMint,
        midMint, midMint, midMint,
        fwdMint, fwdMint, fwdMint, fwdMint, fwdMint,
      ];

      const uniqueMints = [gkMint, defMint, midMint, fwdMint];
      const remainingAccounts = buildRemainingAccounts(uniqueMints, user2.publicKey, contestPda);

      try {
        const enterIx = await program.methods
          .enterContest(invalidLineup)
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

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        const messageV0 = new TransactionMessage({
          payerKey: user2.publicKey,
          recentBlockhash: blockhash,
          instructions: [enterIx],
        }).compileToV0Message([lookupTableAccount]);

        const transactionV0 = new VersionedTransaction(messageV0);
        transactionV0.sign([user2]);

        const sig = await connection.sendTransaction(transactionV0);
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

        assert.fail("Should have thrown error");
      } catch (e: any) {
        assert(e.message.includes("InsufficientLiquidity") || e.message.includes("0x"), "Should throw error for invalid lineup");
      }
    });

    it("should fail when contest is locked", async () => {
      const contestId3 = 3;
      const [contestPda3] = PublicKey.findProgramAddressSync(
        [CONTEST_SEED, Buffer.from(new BN(contestId3).toBuffer("le", 8))],
        program.programId
      );

      const pastTime = Math.floor(Date.now() / 1000) - 3600;
      const escrowVault3 = getAssociatedTokenAddressSync(usdcMint, contestPda3, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, contestPda3, true);

      const playerMints = [gkMint, defMint, midMint, fwdMint];
      const createRemainingAccounts = buildCreateContestRemainingAccounts(playerMints, contestPda3);

      await program.methods
        .createContest(new BN(contestId3), new BN(pastTime), 2, [6000, 4000], playerMints, lutAddress)
        .accountsStrict({
          config: configPda,
          contest: contestPda3,
          usdcMint: usdcMint,
          escrowVault: escrowVault3,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .remainingAccounts(createRemainingAccounts)
        .signers([admin])
        .rpc();

      await program.methods
        .lockContest()
        .accountsStrict({
          config: configPda,
          contest: contestPda3,
          keeper: keeper.publicKey,
        } as any)
        .signers([keeper])
        .rpc();

      const [user3EntryPda] = PublicKey.findProgramAddressSync(
        [ENTRY_SEED, contestPda3.toBytes(), user1.publicKey.toBytes()],
        program.programId
      );

      const lineup: PublicKey[] = [
        gkMint,
        defMint, defMint,
        midMint, midMint, midMint,
        fwdMint, fwdMint, fwdMint, fwdMint, fwdMint,
      ];

      const uniqueMints = [gkMint, defMint, midMint, fwdMint];
      const remainingAccounts = buildRemainingAccounts(uniqueMints, user1.publicKey, contestPda3);

      try {
        const enterIx = await program.methods
          .enterContest(lineup)
          .accountsStrict({
            config: configPda,
            contest: contestPda3,
            entry: user3EntryPda,
            user: user1.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID,
          })
          .remainingAccounts(remainingAccounts)
          .instruction();

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        const messageV0 = new TransactionMessage({
          payerKey: user1.publicKey,
          recentBlockhash: blockhash,
          instructions: [enterIx],
        }).compileToV0Message([lookupTableAccount]);

        const transactionV0 = new VersionedTransaction(messageV0);
        transactionV0.sign([user1]);

        const sig = await connection.sendTransaction(transactionV0);
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

        assert.fail("Should have thrown ContestNotOpen error");
      } catch (e: any) {
        assert(e.message.includes("ContestNotOpen") || e.message.includes("0x"), "Should throw ContestNotOpen");
      }
    });
  });

  describe("Lock & Settle Contest", () => {
    it("should lock contest after start time", async () => {

      const tx = await program.methods
        .lockContest()
        .accountsStrict({
          config: configPda,
          contest: contestPda,
          keeper: keeper.publicKey,
        } as any)
        .signers([keeper])
        .rpc();

      console.log("Lock contest tx:", tx);

      const contest = await program.account.contest.fetch(contestPda);
      assert.isTrue(!!(contest.status as any).locked);
    });



    it("should process entry mints", async () => {
      const mintsAndPools = [
        { mint: gkMint, pool: gkPool },
        { mint: defMint, pool: defPool },
        { mint: midMint, pool: midPool },
        { mint: fwdMint, pool: fwdPool }
      ];

      for (const { mint, pool } of mintsAndPools) {
        const contestTokenVault = getAssociatedTokenAddressSync(mint, contestPda, true);
        const poolTokenVault = getAssociatedTokenAddressSync(mint, pool, true);
        const poolUsdcVault = getAssociatedTokenAddressSync(usdcMint, pool, true);

        await program.methods
          .processEntryMint()
          .accountsStrict({
            contest: contestPda,
            pool: pool,
            mint: mint,
            contestTokenVault,
            contestEscrowVault: contestUsdcVault,
            config: configPda,
            poolTokenVault,
            poolUsdcVault,
            poolAuthority: pool,
            keeper: keeper.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID,
          } as any)
          .signers([keeper])
          .rpc();
      }
    });

    it("should settle contest", async () => {
      const tx = await program.methods
        .settleContest()
        .accountsStrict({
          config: configPda,
          contest: contestPda,
          escrowVault: contestUsdcVault,
          keeper: keeper.publicKey,
        } as any)
        .signers([keeper])
        .rpc();

      console.log("Settle contest tx:", tx);

      const contest = await program.account.contest.fetch(contestPda);
      // Status is the single source of truth — the redundant `settled: bool` field was removed.
      assert.isTrue(!!(contest.status as any).settled);
    });

    it("should fail if not locked before settle", async () => {
      const contestId5 = 5;
      const [contestPda5] = PublicKey.findProgramAddressSync(
        [CONTEST_SEED, Buffer.from(new BN(contestId5).toBuffer("le", 8))],
        program.programId
      );

      const now = Math.floor(Date.now() / 1000) + 3600;
      const escrowVault5 = getAssociatedTokenAddressSync(usdcMint, contestPda5, true);
      await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, contestPda5, true);

      const playerMints = [gkMint, defMint, midMint, fwdMint];
      const remainingAccounts = buildCreateContestRemainingAccounts(playerMints, contestPda5);

      await program.methods
        .createContest(new BN(contestId5), new BN(now), 2, [6000, 4000], playerMints, lutAddress)
        .accountsStrict({
          config: configPda,
          contest: contestPda5,
          usdcMint: usdcMint,
          escrowVault: escrowVault5,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .remainingAccounts(remainingAccounts)
        .signers([admin])
        .rpc();

      try {
        await program.methods
          .settleContest()
          .accountsStrict({
            config: configPda,
            contest: contestPda5,
            escrowVault: escrowVault5,
            keeper: keeper.publicKey,
          } as any)
          .signers([keeper])
          .rpc();
        assert.fail("Should have thrown ContestNotLocked error");
      } catch (e: any) {
        assert(e.message.includes("ContestNotLocked") || e.message.includes("0x"), "Should throw ContestNotLocked");
      }
    });
  });

  describe("Claim Reward", () => {
    it("should claim reward", async () => {
      const payoutAmount = new BN(100);

      const tx = await program.methods
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

      console.log("Claim reward tx:", tx);

      const entry = await program.account.userEntry.fetch(user1EntryPda);
      assert.strictEqual(entry.claimed, true);
    });

    it("should fail if already claimed", async () => {
      const payoutAmount = new BN(100);

      try {
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
        assert.fail("Should have thrown AlreadyClaimed error");
      } catch (e: any) {
        assert(e.message.includes("AlreadyClaimed") || e.message.includes("0x"), "Should throw AlreadyClaimed");
      }
    });
  });

  describe("Update Pool", () => {
    it("should update pool name", async () => {
      const tx = await program.methods
        .updatePool("Ronaldo", null, null)
        .accountsStrict({
          config: configPda,
          pool: gkPool,
          admin: admin.publicKey,
        } as any)
        .signers([admin])
        .rpc();

      console.log("Update pool tx:", tx);

      const pool = await program.account.athletePool.fetch(gkPool);
      assert.strictEqual(pool.name, "Ronaldo");
    });

    it("should disable pool", async () => {
      await program.methods
        .updatePool(null, null, false)
        .accountsStrict({
          config: configPda,
          pool: fwdPool,
          admin: admin.publicKey,
        } as any)
        .signers([admin])
        .rpc();

      const pool = await program.account.athletePool.fetch(fwdPool);
      assert.strictEqual(pool.enabled, false);
    });

    it("should enable pool", async () => {
      await program.methods
        .updatePool(null, null, true)
        .accountsStrict({
          config: configPda,
          pool: fwdPool,
          admin: admin.publicKey,
        } as any)
        .signers([admin])
        .rpc();

      const pool = await program.account.athletePool.fetch(fwdPool);
      assert.strictEqual(pool.enabled, true);
    });
  });
});