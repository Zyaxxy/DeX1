import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { getConnection, getAdminKeypair } from '@/solana/client';
import { findConfigPda, decodeAdminConfig } from '@dexi/sdk';

export const maxDuration = 60; // Allow enough time for Solana tx confirmation

export async function POST(request: NextRequest) {
  try {
    const { walletAddress, amount = 10000 } = await request.json();

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required.' },
        { status: 400 }
      );
    }

    // Validate the wallet address format
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(walletAddress);
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid Solana wallet address format.' },
        { status: 400 }
      );
    }

    // Cap the mint amount to prevent excessive drainage (e.g., max 50,000 USDC per request)
    const mintAmount = Math.min(Math.max(1, amount), 50000);

    const adminKeypair = getAdminKeypair();
    const connection = getConnection();

    // Resolve USDC mint address dynamically from config PDA, falling back to the default devnet mint if config is not set up yet.
    let usdcMint = new PublicKey('9Y27Cm2eWZ1H6KzMss5Py4BhRPBMYKCssEoWBp2MunEP');
    try {
      const [configPda] = await findConfigPda();
      const configInfo = await connection.getAccountInfo(new PublicKey(configPda));
      if (configInfo) {
        const configData = decodeAdminConfig({
          address: configPda as any,
          data: new Uint8Array(Buffer.from(configInfo.data)),
          exists: true
        } as any).data;
        usdcMint = new PublicKey(configData.usdcMint);
      }
    } catch (err) {
      console.warn('Could not retrieve USDC mint from Config PDA, using fallback:', err);
    }

    console.log(`Faucet: Creating/Retrieving ATA for recipient ${recipientPubkey.toBase58()} and mint ${usdcMint.toBase58()}...`);
    
    // Create or retrieve recipient's Associated Token Account
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      adminKeypair,
      usdcMint,
      recipientPubkey,
      true // allowOwnerOffCurve (allows multi-sig or PDA wallets to receive USDC)
    );

    const rawAmount = BigInt(mintAmount * 10 ** 6); // USDC has 6 decimals
    console.log(`Faucet: Minting ${mintAmount} USDC (${rawAmount.toString()} units) to ${ata.address.toBase58()}...`);

    // Mint USDC to recipient ATA
    const sig = await mintTo(
      connection,
      adminKeypair,
      usdcMint,
      ata.address,
      adminKeypair.publicKey,
      rawAmount
    );

    console.log(`Faucet: Minting success! Signature: ${sig}`);

    return NextResponse.json({
      success: true,
      signature: sig,
      amount: mintAmount,
      recipient: recipientPubkey.toBase58(),
      ataAddress: ata.address.toBase58(),
    });
  } catch (error: any) {
    console.error('Faucet API Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred while minting USDC.' },
      { status: 500 }
    );
  }
}
