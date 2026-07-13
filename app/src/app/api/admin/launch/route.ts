import { NextRequest, NextResponse } from 'next/server';
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, TransactionInstruction, Keypair } from '@solana/web3.js';
import { createInitializeMintInstruction, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, createMintToInstruction, MINT_SIZE, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createCreateMetadataAccountV3Instruction } from '@metaplex-foundation/mpl-token-metadata';
import { getCreatePoolInstruction, findConfigPda, decodeAdminConfig } from '@dexi/sdk';
import { getConnection, getAdminKeypair, PROGRAM_ID } from '@/solana/client';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const adminKeypair = getAdminKeypair();
    const publicKey = adminKeypair.publicKey;
    const connection = getConnection();

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const ticker = formData.get('ticker') as string;
    const role = formData.get('role') as string;
    const desc = formData.get('desc') as string;
    const liquidity = Number(formData.get('liquidity') || '100');
    const imageFile = formData.get('image') as File | null;

    if (!name || !ticker) {
      return NextResponse.json({ error: 'Missing name or ticker' }, { status: 400 });
    }

    let metadataUrl = '';
    if (imageFile) {
      const { WebUploader } = await import("@irys/web-upload");
      const { WebSolana } = await import("@irys/web-upload-solana");
      const irysWallet = {
        publicKey: adminKeypair.publicKey,
        signTransaction: (tx: any) => { tx.sign([adminKeypair]); return Promise.resolve(tx); },
        signAllTransactions: (txs: any[]) => { txs.forEach(tx => tx.sign([adminKeypair])); return Promise.resolve(txs); },
        signMessage: async (msg: Uint8Array) => {
          const nacl = await import('tweetnacl');
          return nacl.default.sign.detached(msg, adminKeypair.secretKey);
        },
      };

      const irys = await WebUploader(WebSolana).withProvider(irysWallet).withRpc(connection.rpcEndpoint).devnet().build();
      const irysGateway = "https://gateway.irys.xyz";

      const fileBuffer = Buffer.from(await imageFile.arrayBuffer());
      const estimatedMetadata = JSON.stringify({ name, symbol: ticker, description: desc, image: `${irysGateway}/placeholder` });
      const totalSize = fileBuffer.length + new Blob([estimatedMetadata]).size + 1024;

      const price = await irys.getPrice(totalSize);
      const balance = await irys.getLoadedBalance();
      if (price.isGreaterThan(balance)) {
        await irys.fund(price.minus(balance));
      }

      const imageReceipt = await irys.upload(fileBuffer, { tags: [{ name: "Content-Type", value: imageFile.type }] });
      const imageUrl = `${irysGateway}/${imageReceipt.id}`;

      const metadataObj = { name, symbol: ticker, description: desc, image: imageUrl };
      const metadataReceipt = await irys.upload(Buffer.from(JSON.stringify(metadataObj)), { tags: [{ name: "Content-Type", value: "application/json" }] });
      metadataUrl = `${irysGateway}/${metadataReceipt.id}`;
    }

    const mintKeypair = Keypair.generate();
    const decimals = 6;
    const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    });

    const initializeMintIx = createInitializeMintInstruction(
      mintKeypair.publicKey, decimals, publicKey, publicKey, TOKEN_PROGRAM_ID
    );

    const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), MPL_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
      MPL_PROGRAM_ID
    );

    const initializeMetadataIx = createCreateMetadataAccountV3Instruction(
      { metadata: metadataPda, mint: mintKeypair.publicKey, mintAuthority: publicKey, payer: publicKey, updateAuthority: publicKey },
      { createMetadataAccountArgsV3: { data: { name, symbol: ticker, uri: metadataUrl, sellerFeeBasisPoints: 0, creators: null, collection: null, uses: null }, isMutable: true, collectionDetails: null } }
    );

    const [configPda] = await findConfigPda();
    const configInfo = await connection.getAccountInfo(new PublicKey(configPda));
    if (!configInfo) throw new Error("Config not found");
    const configData = decodeAdminConfig({ address: configPda as any, data: new Uint8Array(Buffer.from(configInfo.data)), exists: true } as any).data;
    const usdcMint = new PublicKey(configData.usdcMint);
    const usdcMintInfo = await connection.getAccountInfo(usdcMint);
    const usdcTokenProgramId = usdcMintInfo?.owner || TOKEN_PROGRAM_ID;

    const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('pool'), mintKeypair.publicKey.toBuffer()], PROGRAM_ID);
    const poolTokenVault = getAssociatedTokenAddressSync(mintKeypair.publicKey, poolPda, true, TOKEN_PROGRAM_ID);
    const poolUsdcVault = getAssociatedTokenAddressSync(usdcMint, poolPda, true, usdcTokenProgramId);

    const createTokenAtaIx = createAssociatedTokenAccountInstruction(publicKey, poolTokenVault, poolPda, mintKeypair.publicKey, TOKEN_PROGRAM_ID);
    const createUsdcAtaIx = createAssociatedTokenAccountInstruction(publicKey, poolUsdcVault, poolPda, usdcMint, usdcTokenProgramId);

    const roleNum = parseInt(role);
    const createPoolIxInfo = getCreatePoolInstruction({
      name, role: roleNum,
      config: configPda as any, pool: poolPda.toBase58() as any,
      mint: mintKeypair.publicKey.toBase58() as any,
      tokenVault: poolTokenVault.toBase58() as any,
      usdcVault: poolUsdcVault.toBase58() as any,
      poolAuthority: poolPda.toBase58() as any,
      admin: publicKey.toBase58() as any,
      tokenProgram: TOKEN_PROGRAM_ID.toBase58() as any,
      associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as any,
      systemProgram: SystemProgram.programId.toBase58() as any,
    });

    const createPoolIx = new TransactionInstruction({
      programId: new PublicKey(createPoolIxInfo.programAddress),
      keys: createPoolIxInfo.accounts.map(a => ({ pubkey: new PublicKey(a.address), isSigner: a.role >= 2, isWritable: a.role === 1 || a.role === 3 })),
      data: Buffer.from(createPoolIxInfo.data)
    });

    const mintTokensToPoolIx = createMintToInstruction(mintKeypair.publicKey, poolTokenVault, publicKey, BigInt(1000000 * (10 ** decimals)), [], TOKEN_PROGRAM_ID);
    const mintUsdcToPoolIx = createMintToInstruction(usdcMint, poolUsdcVault, publicKey, BigInt(liquidity * (10 ** 6)));

    const instructions = [
      createAccountIx, initializeMintIx, initializeMetadataIx,
      createTokenAtaIx, createUsdcAtaIx,
      createPoolIx, mintTokensToPoolIx, mintUsdcToPoolIx,
    ];

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const msg = new TransactionMessage({ payerKey: publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([mintKeypair, adminKeypair]);

    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    return NextResponse.json({ success: true, signature: sig });
  } catch (error: any) {
    console.error('Launch token endpoint error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
