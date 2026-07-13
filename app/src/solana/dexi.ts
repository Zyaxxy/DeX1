import { PublicKey } from '@solana/web3.js';
import idl from '@dexi/sdk/src/idl/dexi.json';

export const PROGRAM_ID = new PublicKey(idl.address as string);
export const USDC_DECIMALS = 6;


export const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER || 'devnet';
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 
  (CLUSTER === 'devnet' ? 'https://api.devnet.solana.com' : 'http://localhost:3000');

export const ROLE_REQUIREMENTS = {
  GK: 1,
  DEF: 2,
  MID: 2,
  FWD: 2,
  FLEX: 4,
};

export function formatUSDC(amount: bigint | number): string {
  const num = typeof amount === 'bigint' ? Number(amount) : amount;
  return (num / Math.pow(10, USDC_DECIMALS)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatTimestamp(timestamp: number | bigint): string {
  const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatEstimatedPrizePool(entryCount: bigint | number): string {
  const ENTRY_FEE = 10;
  const count = typeof entryCount === 'bigint' ? Number(entryCount) : entryCount;
  const estimated = count * ENTRY_FEE;
  return `~$${estimated.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatTokenAmount(amount: bigint | number, decimals: number = 9): string {
  const num = typeof amount === 'bigint' ? Number(amount) : amount;
  return (num / Math.pow(10, decimals)).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export const ROLE_COLORS: Record<string, string> = {
  GK: 'bg-yellow-500',
  DEF: 'bg-blue-500',
  MID: 'bg-green-500',
  FWD: 'bg-red-500',
};

export const CONTEST_STATUS_LABELS: Record<number, string> = {
  0: 'Open',
  1: 'Locked',
  2: 'Settled',
};

export const ROLE_LABELS: Record<number, string> = {
  0: 'GK',
  1: 'DEF',
  2: 'MID',
  3: 'FWD',
};

