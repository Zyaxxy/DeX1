import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Keypair,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { contestAddress, transaction: signedTxBase64 } = await request.json();

    if (!contestAddress || !signedTxBase64) {
      return NextResponse.json({ error: 'Missing contestAddress or transaction' }, { status: 400 });
    }

    const keeperPrivateKey = process.env.KEEPER_PRIVATE_KEY;
    if (!keeperPrivateKey) {
      return NextResponse.json({ error: 'KEEPER_PRIVATE_KEY is not configured' }, { status: 500 });
    }

    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const keeperKeypair = Keypair.fromSecretKey(bs58.decode(keeperPrivateKey.trim()));

    const tx = VersionedTransaction.deserialize(Buffer.from(signedTxBase64, 'base64'));

    // Find the index of the keeper in the static account keys
    const keeperPubkey = keeperKeypair.publicKey.toBase58();
    const accountKeys = tx.message.staticAccountKeys;
    const numSigners = tx.message.header.numRequiredSignatures;

    // Find keeper's index within the signers (first numSigners keys)
    let keeperIndex = -1;
    for (let i = 0; i < numSigners && i < accountKeys.length; i++) {
      if (accountKeys[i].toBase58() === keeperPubkey) {
        keeperIndex = i;
        break;
      }
    }

    if (keeperIndex < 0) {
      return NextResponse.json({
        error: 'Keeper public key not found in transaction signers',
        details: `keeper=${keeperPubkey} signers=[${accountKeys.slice(0, numSigners).map(k => k.toBase58()).join(',')}] numSigners=${numSigners}`,
      }, { status: 500 });
    }

    if (keeperIndex >= tx.signatures.length) {
      return NextResponse.json({
        error: 'Keeper signer index out of bounds',
        details: `index=${keeperIndex} signatures.length=${tx.signatures.length}`,
      }, { status: 500 });
    }

    // Check if user already signed
    const userHasSigned = tx.signatures.some(sig => sig.length > 0);
    if (!userHasSigned) {
      return NextResponse.json({ error: 'User signature not found on transaction' }, { status: 400 });
    }

    // Sign the message with the keeper's key
    const messageBytes = tx.message.serialize();
    const keeperSignature = nacl.sign.detached(messageBytes, keeperKeypair.secretKey);
    tx.signatures[keeperIndex] = Buffer.from(keeperSignature);

    const signature = await connection.sendRawTransaction(Buffer.from(tx.serialize()), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`📤 Claim submitted for contest ${contestAddress}: ${signature}`);

    return NextResponse.json({ signature });
  } catch (error: any) {
    console.error('🚨 Claim submit error:', error);
    return NextResponse.json({ error: error.message || 'Failed to submit claim' }, { status: 500 });
  }
}
