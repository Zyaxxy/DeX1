import * as anchor from "@anchor-lang/core";
import { Program, web3, BN } from "@anchor-lang/core";
import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";
import { createMint, createAssociatedTokenAccount, mintTo, transfer, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import type { Dexi } from "../target/types/dexi";

describe("Dexi Contest Flow", () => {
  const SYSTEM_PROGRAM_ID = SystemProgram.programId;
  const CONTEST_SEED = Buffer.from("contest");
  const ENTRY_SEED = Buffer.from("entry");
  const POOL_SEED = Buffer.from("pool");
  const ADMIN_SEED = Buffer.from("admin");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Dexi as Program<Dexi>;

  const confirmTx = async (tx: string) => {
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: tx,
      ...latestBlockHash,
    }, "confirmed");
  };

  let admin: Keypair;
  let keeper: Keypair;
  let user: Keypair;
  let usdcMint: PublicKey;
  let configPda: PublicKey;

  before(async () => {
    admin = (provider.wallet as NodeWallet).payer;
    keeper = Keypair.generate();
    user = Keypair.generate();

    await provider.connection.requestAirdrop(admin.publicKey, 20 * web3.LAMPORTS_PER_SOL).then(confirmTx);
    await provider.connection.requestAirdrop(user.publicKey, 10 * web3.LAMPORTS_PER_SOL).then(confirmTx);

    usdcMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6,
    );

    [configPda] = PublicKey.findProgramAddressSync([ADMIN_SEED], program.programId);
  });

  describe("Initialize", () => {
    it("should initialize with keeper", async () => {
      await program.methods
        .initialize(30, admin.publicKey, keeper.publicKey)
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

      const config = await program.account.adminConfig.fetch(configPda);
      assert.ok(config.admin.equals(admin.publicKey));
      assert.ok(config.keeper.equals(keeper.publicKey));
      assert.ok(config.usdcMint.equals(usdcMint));
      assert.strictEqual(config.swapFeeBps, 30);
    });
  });

  describe("Create Pool", () => {
    let athleteMint: PublicKey;

    it("should create athlete pool", async () => {
      [athleteMint] = PublicKey.findProgramAddressSync([POOL_SEED, Buffer.from("Messi")], program.programId);

      await program.methods
        .createPool("Messi", { mid: {} } as any)
        .accountsStrict({
          config: configPda,
          pool: athleteMint,
          mint: athleteMint,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([admin])
        .rpc();

      const pool = await program.account.athletePool.fetch(athleteMint);
      assert.strictEqual(pool.name, "Messi");
    });
  });

  describe("Contest Flow", () => {
    let contestPda: PublicKey;
    let contestId = 1;
    let userEntryPda: PublicKey;
    let userUsdcAta: PublicKey;
    let contestUsdcVault: PublicKey;
    let contestTokenVault: PublicKey;
    let athleteMint: PublicKey;

    before(async () => {
      [contestPda] = PublicKey.findProgramAddressSync(
        [CONTEST_SEED, Buffer.from(contestId.toString())],
        program.programId
      );

      [userEntryPda] = PublicKey.findProgramAddressSync(
        [ENTRY_SEED, contestPda.toBytes(), user.publicKey.toBytes()],
        program.programId
      );

      userUsdcAta = await createAssociatedTokenAccount(
        provider.connection,
        user,
        usdcMint,
        user.publicKey,
      );

      await mintTo(
        provider.connection,
        admin,
        usdcMint,
        userUsdcAta,
        admin,
        1000 * 1e6,
      );

      [contestUsdcVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("contest"), Buffer.from(contestId.toString()), usdcMint.toBytes()],
        PublicKey.findProgramAddressSync([usdcMint.toBytes()], program.programId)[0]
      );
    });

    it("should create contest", async () => {
      const now = Math.floor(Date.now() / 1000);
      const startTime = now + 3600;

      await program.methods
        .createContest(
          contestId,
          startTime,
          3,
          [5000, 3000, 2000],
        )
        .accountsStrict({
          config: configPda,
          contest: contestPda,
          usdcMint: usdcMint,
          escrowVault: contestUsdcVault,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([admin])
        .rpc();

      const contest = await program.account.contest.fetch(contestPda);
      assert.strictEqual(contest.id.toNumber(), contestId);
      assert.strictEqual(contest.winnerCount, 3);
      assert.strictEqual(contest.status.open, true);
    });

    it("should not enter contest after deadline", async () => {
      const contestId2 = 2;
      const [contestPda2] = PublicKey.findProgramAddressSync(
        [CONTEST_SEED, Buffer.from(contestId2.toString())],
        program.programId
      );

      const pastTime = Math.floor(Date.now() / 1000) - 3600;

      await program.methods
        .createContest(contestId2, pastTime, 3, [5000, 3000, 2000])
        .accountsStrict({
          config: configPda,
          contest: contestPda2,
          usdcMint: usdcMint,
          escrowVault: contestUsdcVault,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        } as any)
        .signers([admin])
        .rpc();

      try {
        await program.methods
          .enterContest(new Array(11).fill(PublicKey.default))
          .accountsStrict({
            config: configPda,
            contest: contestPda2,
            entry: userEntryPda,
            user: user.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID,
          } as any)
          .signers([user])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert(e.message.includes("EntryDeadlinePassed") || e.message.includes("0x"));
      }
    });

    it("should not lock contest before start time", async () => {
      try {
        await program.methods
          .lockContest()
          .accountsStrict({
            config: configPda,
            contest: contestPda,
            keeper: keeper.publicKey,
          } as any)
          .signers([keeper])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert(e.message.includes("ContestNotStarted") || e.message.includes("0x"));
      }
    });
  });
});