import * as anchor from "@anchor-lang/core";
import { Program, web3, BN } from "@anchor-lang/core";
import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";
import { createMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import type { Dexi } from "../target/types/dexi";



describe("dexi", () => {
  
  const SYSTEM_PROGRAM_ID = SystemProgram.programId;

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

  before(async () => {
    await provider.connection.requestAirdrop(
      provider.wallet.publicKey,
      10 * web3.LAMPORTS_PER_SOL,
    ).then(confirmTx);
  });

  it("Initialize", async () => {
    const usdcMint = await createMint(
      provider.connection,
      (provider.wallet as NodeWallet).payer,
      provider.wallet.publicKey,
      null,
      6,
    );

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin")],
      program.programId,
    );

    await program.methods
      .initialize(30, provider.wallet.publicKey)
      .accountsStrict({
        config: configPda,
        usdcMint: usdcMint,
        admin: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SYSTEM_PROGRAM_ID,
      })
      .rpc();

    const config = await program.account.adminConfig.fetch(configPda);
    assert.ok(config.admin.equals(provider.wallet.publicKey));
    assert.ok(config.usdcMint.equals(usdcMint));
    assert.strictEqual(config.swapFeeBps, 30);
    assert.ok(config.treasury.equals(provider.wallet.publicKey));
  });
});
