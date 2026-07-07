import { Connection, PublicKey } from '@solana/web3.js';
import { createSolanaRpc } from '@solana/kit';
import { PROGRAM_ID, RPC_URL } from './dexi';
export * from './dexi';

export const connection = new Connection(RPC_URL, 'confirmed');
export const rpc = createSolanaRpc(RPC_URL);

export const LINEUP_SIZE = 11;

export async function getTokenBalance(
  connection: Connection,
  walletAddress: PublicKey,
  tokenMint: PublicKey
): Promise<number> {
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(walletAddress, { mint: tokenMint });
    if (accounts.value.length === 0) return 0;
    return accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
  } catch (e) {
    console.error("Error fetching token balance", e);
    return 0;
  }
}
