import { Connection, PublicKey } from '@solana/web3.js';
import { createSolanaRpc } from '@solana/kit';
import { PROGRAM_ID, RPC_URL } from './dexi';
export * from './dexi';

let _connection: Connection | null = null;
let _rpc: ReturnType<typeof createSolanaRpc> | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(RPC_URL, 'confirmed');
  }
  return _connection;
}

export function getRpc(): ReturnType<typeof createSolanaRpc> {
  if (!_rpc) {
    _rpc = createSolanaRpc(RPC_URL);
  }
  return _rpc;
}

export const ADMIN_WALLET_ADDRESS = 'FsHawHBmgvn5uGZHDWt2NQMbpFGFnCqiC4Knmw31NCrr';


export const LINEUP_SIZE = 11;


