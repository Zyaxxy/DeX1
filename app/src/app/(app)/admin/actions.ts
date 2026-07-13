'use server';

import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, TransactionInstruction, AddressLookupTableProgram, ComputeBudgetProgram } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, createMintToInstruction } from '@solana/spl-token';
import { getCreatePoolInstruction, getUpdatePoolInstruction, findConfigPda, decodeAdminConfig, getCreateContestInstruction, findContestPda } from '@dexi/sdk';
import { getConnection, getAdminKeypair, PROGRAM_ID } from '@/solana/client';

export async function createPoolAction(
  mint: string,
  name: string,
  role: number,
  initialTokenLiquidity: string,
  initialUsdcLiquidity: string
) {
  try {
    const adminKeypair = getAdminKeypair();
    const publicKey = adminKeypair.publicKey;
    const connection = getConnection();

    const mintKey = new PublicKey(mint);
    const [configPda] = await findConfigPda();
    const configInfo = await connection.getAccountInfo(new PublicKey(configPda));
    if (!configInfo) throw new Error("Config not found");
    const configData = decodeAdminConfig({ address: configPda as any, data: new Uint8Array(Buffer.from(configInfo.data)), exists: true } as any).data;
    const usdcMint = new PublicKey(configData.usdcMint);
    const mintInfo = await connection.getAccountInfo(mintKey);
    if (!mintInfo) throw new Error("Mint not found");
    const tokenProgramId = mintInfo.owner;

    const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('pool'), mintKey.toBuffer()], PROGRAM_ID);
    const poolTokenVault = getAssociatedTokenAddressSync(mintKey, poolPda, true, tokenProgramId);
    const poolUsdcVault = getAssociatedTokenAddressSync(usdcMint, poolPda, true);

    const createPoolIxInfo = getCreatePoolInstruction({
      name, role, config: configPda as any, pool: poolPda.toBase58() as any,
      mint: mintKey.toBase58() as any, tokenVault: poolTokenVault.toBase58() as any,
      usdcVault: poolUsdcVault.toBase58() as any, poolAuthority: poolPda.toBase58() as any,
      admin: publicKey.toBase58() as any, tokenProgram: tokenProgramId.toBase58() as any,
      associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as any,
      systemProgram: SystemProgram.programId.toBase58() as any,
    });

    const createPoolIx = new TransactionInstruction({
      programId: new PublicKey(createPoolIxInfo.programAddress),
      keys: createPoolIxInfo.accounts.map(a => ({ pubkey: new PublicKey(a.address), isSigner: a.role >= 2, isWritable: a.role === 1 || a.role === 3 })),
      data: Buffer.from(createPoolIxInfo.data)
    });

    const instructions = [];
    const tokenVaultInfo = await connection.getAccountInfo(poolTokenVault);
    const usdcVaultInfo = await connection.getAccountInfo(poolUsdcVault);
    if (!tokenVaultInfo) instructions.push(createAssociatedTokenAccountInstruction(publicKey, poolTokenVault, poolPda, mintKey));
    if (!usdcVaultInfo) instructions.push(createAssociatedTokenAccountInstruction(publicKey, poolUsdcVault, poolPda, usdcMint));
    instructions.push(createPoolIx);
    instructions.push(createMintToInstruction(mintKey, poolTokenVault, publicKey, BigInt(parseInt(initialTokenLiquidity) * (10 ** 6)), [], tokenProgramId));
    instructions.push(createMintToInstruction(usdcMint, poolUsdcVault, publicKey, BigInt(parseInt(initialUsdcLiquidity) * (10 ** 6))));

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const msg = new TransactionMessage({ payerKey: publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([adminKeypair]);

    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    return { success: true, signature: sig };
  } catch (error: any) {
    console.error('createPool error:', error);
    return { success: false, error: error.message };
  }
}

export async function togglePoolAction(mint: string, enabled: boolean) {
  try {
    const adminKeypair = getAdminKeypair();
    const publicKey = adminKeypair.publicKey;
    const connection = getConnection();

    const mintKey = new PublicKey(mint);
    const [configPda] = await findConfigPda();
    const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('pool'), mintKey.toBuffer()], PROGRAM_ID);

    const poolInfo = await connection.getAccountInfo(poolPda);
    if (!poolInfo) throw new Error("Pool not found");
    const { decodeAthletePool } = await import('@dexi/sdk');
    const decoded = decodeAthletePool({ address: poolPda.toBase58(), data: new Uint8Array(poolInfo.data), exists: true } as any).data;

    const updatePoolIxInfo = getUpdatePoolInstruction({
      name: decoded.name, role: decoded.role, enabled,
      config: configPda as any, pool: poolPda.toBase58() as any, admin: publicKey.toBase58() as any,
    });

    const updatePoolIx = new TransactionInstruction({
      programId: new PublicKey(updatePoolIxInfo.programAddress),
      keys: updatePoolIxInfo.accounts.map(a => ({ pubkey: new PublicKey(a.address), isSigner: a.role >= 2, isWritable: a.role === 1 || a.role === 3 })),
      data: Buffer.from(updatePoolIxInfo.data)
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const msg = new TransactionMessage({ payerKey: publicKey, recentBlockhash: blockhash, instructions: [updatePoolIx] }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([adminKeypair]);

    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    return { success: true, signature: sig };
  } catch (error: any) {
    console.error('togglePool error:', error);
    return { success: false, error: error.message };
  }
}

export async function createContestAction(
  name: string,
  fixtureId: string,
  startTime: string,
  winnerCount: string,
  prizeSplit: string,
  selectedPlayerMints: string[],
  contestsCount: number
) {
  try {
    const adminKeypair = getAdminKeypair();
    const adminKey = adminKeypair.publicKey;
    const connection = getConnection();

    const newId = contestsCount + 1;
    const startTimeNum = Math.floor(new Date(startTime).getTime() / 1000);
    const winnerCountNum = parseInt(winnerCount);
    const prizeSplitArr = prizeSplit.split(',').map(s => parseInt(s.trim()) * 100);

    const [configPda] = await findConfigPda();
    const configInfo = await connection.getAccountInfo(new PublicKey(configPda));
    const { decodeAdminConfig } = await import('@dexi/sdk');
    const configData = decodeAdminConfig({ address: configPda, data: new Uint8Array(Buffer.from(configInfo!.data)), exists: true } as any).data;
    const usdcMint = new PublicKey(configData.usdcMint);
    const usdcMintInfo = await connection.getAccountInfo(usdcMint);
    const usdcTokenProgramId = usdcMintInfo?.owner || new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    const [contestPda] = await findContestPda({ id: newId });
    const contestKey = new PublicKey(contestPda);
    const escrowVault = getAssociatedTokenAddressSync(usdcMint, contestKey, true, usdcTokenProgramId);

    const escrowInfo = await connection.getAccountInfo(escrowVault);
    if (!escrowInfo) {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const msg = new TransactionMessage({ payerKey: adminKey, recentBlockhash: blockhash, instructions: [createAssociatedTokenAccountInstruction(adminKey, escrowVault, contestKey, usdcMint, usdcTokenProgramId)] }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([adminKeypair]);
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    }

    const txs: VersionedTransaction[] = [];
    const txMeta: { type: 'lut' | 'ext' | 'ata' | 'contest', blockhash: string, lastValidBlockHeight: number }[] = [];

    const slot = await connection.getSlot('confirmed');
    const [createIx, lutAddress] = AddressLookupTableProgram.createLookupTable({ authority: adminKey, payer: adminKey, recentSlot: Math.max(slot - 10, 0) });
    const { blockhash: lutBlockhash, lastValidBlockHeight: lutBlockHeight } = await connection.getLatestBlockhash('confirmed');
    txs.push(new VersionedTransaction(new TransactionMessage({ payerKey: adminKey, recentBlockhash: lutBlockhash, instructions: [createIx] }).compileToV0Message()));
    txMeta.push({ type: 'lut', blockhash: lutBlockhash, lastValidBlockHeight: lutBlockHeight });

    const staticAddresses: PublicKey[] = [
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
      SystemProgram.programId, usdcMint, new PublicKey(configPda), contestKey, escrowVault,
    ];

    const playerMints: string[] = [];
    const remainingAccounts: any[] = [];
    const vaultsToCheck: PublicKey[] = [];
    const vaultMints: PublicKey[] = [];
    const vaultPrograms: PublicKey[] = [];

    for (const mintStr of selectedPlayerMints) {
      const mintKey = new PublicKey(mintStr);
      playerMints.push(mintKey.toBase58());
      const poolKey = new PublicKey(PublicKey.findProgramAddressSync([Buffer.from('pool'), mintKey.toBuffer()], PROGRAM_ID)[0]);
      const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const vault = getAssociatedTokenAddressSync(mintKey, contestKey, true, TOKEN_PROGRAM_ID);
      staticAddresses.push(mintKey, vault, poolKey);
      remainingAccounts.push({ pubkey: vault, isWritable: true, isSigner: false }, { pubkey: mintKey, isWritable: false, isSigner: false });
      vaultsToCheck.push(vault);
      vaultMints.push(mintKey);
      vaultPrograms.push(TOKEN_PROGRAM_ID);
    }

    const batchSize = 20;
    for (let i = 0; i < staticAddresses.length; i += batchSize) {
      const chunk = staticAddresses.slice(i, i + batchSize);
      const extendIx = AddressLookupTableProgram.extendLookupTable({ payer: adminKey, authority: adminKey, lookupTable: lutAddress, addresses: chunk });
      const { blockhash: extBlockhash, lastValidBlockHeight: extBlockHeight } = await connection.getLatestBlockhash('confirmed');
      txs.push(new VersionedTransaction(new TransactionMessage({ payerKey: adminKey, recentBlockhash: extBlockhash, instructions: [extendIx] }).compileToV0Message()));
      txMeta.push({ type: 'ext', blockhash: extBlockhash, lastValidBlockHeight: extBlockHeight });
    }

    const ataIxs: TransactionInstruction[] = [];
    const vaultsToCheckSliced = vaultsToCheck.slice(0, 100);
    const vaultInfos = vaultsToCheckSliced.length > 0
      ? await connection.getMultipleAccountsInfo(vaultsToCheckSliced)
      : [];

    for (let i = 0; i < vaultInfos.length; i++) {
      if (!vaultInfos[i]) {
        ataIxs.push(createAssociatedTokenAccountInstruction(adminKey, vaultsToCheck[i], contestKey, vaultMints[i], vaultPrograms[i]));
      }
    }

    const ataBatchSize = 10;
    for (let i = 0; i < ataIxs.length; i += ataBatchSize) {
      const chunk = ataIxs.slice(i, i + ataBatchSize);
      const { blockhash: ataBlockhash, lastValidBlockHeight: ataBlockHeight } = await connection.getLatestBlockhash('confirmed');
      txs.push(new VersionedTransaction(new TransactionMessage({ payerKey: adminKey, recentBlockhash: ataBlockhash, instructions: chunk }).compileToV0Message()));
      txMeta.push({ type: 'ata', blockhash: ataBlockhash, lastValidBlockHeight: ataBlockHeight });
    }

    const createIxFixed = getCreateContestInstruction({
      id: newId, startTime: startTimeNum as any, winnerCount: winnerCountNum, prizeSplit: prizeSplitArr,
      playerMints: playerMints as any[], addressLookupTable: lutAddress.toBase58() as any,
      name, fixtureId: fixtureId || '',
      config: configPda.toString() as any, contest: contestKey.toBase58() as any,
      usdcMint: usdcMint.toBase58() as any, escrowVault: escrowVault.toBase58() as any,
      admin: adminKey.toBase58() as any,
    });

    const instruction = new TransactionInstruction({
      programId: new PublicKey(createIxFixed.programAddress),
      keys: [...createIxFixed.accounts.map(a => ({ pubkey: new PublicKey(a.address), isSigner: a.role >= 2, isWritable: a.role === 1 || a.role === 3 })), ...remainingAccounts],
      data: Buffer.from(createIxFixed.data)
    });

    const signedSetupTxs = txs.map(tx => { tx.sign([adminKeypair]); return tx; });
    const lutTxs = signedSetupTxs.filter((_, i) => txMeta[i].type === 'lut');
    const ataTxs = signedSetupTxs.filter((_, i) => txMeta[i].type === 'ata');
    const extTxs = signedSetupTxs.filter((_, i) => txMeta[i].type === 'ext');

    await Promise.all([...lutTxs, ...ataTxs].map(async (tx) => {
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
      const idx = signedSetupTxs.indexOf(tx);
      await connection.confirmTransaction({ signature: sig, blockhash: txMeta[idx].blockhash, lastValidBlockHeight: txMeta[idx].lastValidBlockHeight }, 'confirmed');
    }));

    let lookupTableAccount = null;
    if (extTxs.length > 0) {
      await Promise.all(extTxs.map(async (tx) => {
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        const idx = signedSetupTxs.indexOf(tx);
        await connection.confirmTransaction({ signature: sig, blockhash: txMeta[idx].blockhash, lastValidBlockHeight: txMeta[idx].lastValidBlockHeight }, 'confirmed');
      }));
      const { AddressLookupTableAccount: LUTAcc } = await import('@solana/web3.js');
      let lutInfo = null;
      for (let retry = 0; retry < 10; retry++) {
        lutInfo = await connection.getAccountInfo(lutAddress);
        if (lutInfo) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      if (lutInfo) {
        lookupTableAccount = new LUTAcc({ key: lutAddress, state: LUTAcc.deserialize(lutInfo.data) });
      }
    }

    let contestSig = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { blockhash: bh, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const cuLimitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 });
      const contestMsg = new TransactionMessage({ payerKey: adminKey, recentBlockhash: bh, instructions: [cuLimitIx, instruction] }).compileToV0Message(lookupTableAccount ? [lookupTableAccount] : []);
      const contestTx = new VersionedTransaction(contestMsg);
      contestTx.sign([adminKeypair]);

      contestSig = await connection.sendRawTransaction(contestTx.serialize(), { skipPreflight: true });
      try {
        await connection.confirmTransaction({ signature: contestSig, blockhash: bh, lastValidBlockHeight }, 'confirmed');
        break;
      } catch (e: any) {
        if (e.message && e.message.includes('block height exceeded') && attempt < 2) continue;
        throw e;
      }
    }

    return { success: true, signature: contestSig };
  } catch (error: any) {
    console.error('createContest error:', error);
    return { success: false, error: error.message };
  }
}
