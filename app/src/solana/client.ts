import { Connection, PublicKey } from '@solana/web3.js';
import { createSolanaRpc } from '@solana/kit';
import { PROGRAM_ID, RPC_URL } from './dexi';
export * from './dexi';

export const connection = new Connection(RPC_URL, 'confirmed');
export const rpc = createSolanaRpc(RPC_URL);

export const ADMIN_WALLET_ADDRESS = 'FsHawHBmgvn5uGZHDWt2NQMbpFGFnCqiC4Knmw31NCrr';


export const LINEUP_SIZE = 11;


