import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { createSolanaRpc } from '@solana/kit';
import { PROGRAM_ID, RPC_URL, CLUSTER } from './dexi';
export * from './dexi';

let _connection: Connection | null = null;
let _rpc: ReturnType<typeof createSolanaRpc> | null = null;
let _adminKeypair: Keypair | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    const wsUrl = CLUSTER === 'devnet' ? 'wss://api.devnet.solana.com' : 'wss://api.mainnet-beta.solana.com';
    _connection = new Connection(RPC_URL, {
      commitment: 'confirmed',
      wsEndpoint: typeof window !== 'undefined' ? wsUrl : undefined,
    });
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

export function getAdminKeypair(): Keypair {
  if (typeof window !== 'undefined') {
    throw new Error('getAdminKeypair can only be executed in a secure server-side environment.');
  }
  if (!_adminKeypair) {
    const privateKeyStr = process.env.ADMIN_PRIVATE_KEY;
    if (!privateKeyStr) {
      throw new Error('Admin private key not configured. Add ADMIN_PRIVATE_KEY to .env');
    }
    let secretKey: Uint8Array;
    try {
      const trimmed = privateKeyStr.trim();
      
      if (trimmed.startsWith('[')) {
        secretKey = new Uint8Array(JSON.parse(trimmed));
      } else if (trimmed.startsWith('{"')) {
        const parsed = JSON.parse(trimmed);
        if (parsed.buffer && parsed.buffer.data) {
          secretKey = new Uint8Array(parsed.buffer.data);
        } else if (parsed.secretKey) {
          secretKey = new Uint8Array(parsed.secretKey);
        } else {
          throw new Error('Unknown JSON key format');
        }
      } else {
        secretKey = new Uint8Array(Buffer.from(trimmed, 'base64'));
      }
      
      _adminKeypair = Keypair.fromSecretKey(secretKey);
    } catch (err: any) {
      console.error('Key parse error:', err.message);
      throw new Error('Invalid admin private key format. Use base64 or JSON array.');
    }
  }
  return _adminKeypair;
}

export const LINEUP_SIZE = 11;


