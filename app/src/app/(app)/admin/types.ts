export interface PoolData {
  mint: string;
  name: string;
  role: number;
  enabled: boolean;
}

export interface ContestData {
  id: number;
  startTime: number;
  status: string;
  statusCode: number;
  entryCount: number;
  prizePool: bigint;
  winnerCount: number;
  prizeSplit: number[];
  name: string;
  fixtureId: string;
}

export const STATS = [
  { label: 'Total Pools', getValue: (p: PoolData[]) => p.length, accent: 'text-primary' },
  { label: 'Active Contests', getValue: (_p: PoolData[], c: ContestData[]) => c.filter(x => x.status === 'Open').length, accent: 'text-positive' },
  { label: 'Total Prize Pool', getValue: (_p: PoolData[], c: ContestData[]) => `$${formatUSDC(c.reduce((a, b) => a + b.prizePool, BigInt(0)))}`, accent: 'text-[#00ff88]' },
  { label: 'Total Entries', getValue: (_p: PoolData[], c: ContestData[]) => c.reduce((a, b) => a + b.entryCount, 0), accent: 'text-primary' },
];

export const STATUS_PILL: Record<string, { bg: string; text: string; dot: string }> = {
  Open: { bg: 'bg-[rgba(0,255,136,0.15)]', text: 'text-[#00ff88]', dot: 'bg-[#00ff88]' },
  Locked: { bg: 'bg-[rgba(255,191,0,0.15)]', text: 'text-[#ffbf00]', dot: 'bg-[#ffbf00]' },
  Settled: { bg: 'bg-[rgba(59,130,246,0.15)]', text: 'text-[#3b82f6]', dot: 'bg-[#3b82f6]' },
};

export const ROLE_FILTERS = ['all', 'GK', 'DEF', 'MID', 'FWD'] as const;

export const ROLE_LABELS: Record<number, string> = { 0: 'GK', 1: 'DEF', 2: 'MID', 3: 'FWD' };
export const ROLE_COLORS: Record<string, string> = { GK: 'bg-[#00ff88]', DEF: 'bg-[#3b82f6]', MID: 'bg-[#a855f7]', FWD: 'bg-[#ff4757]' };

export const POOL_DISCRIMINATOR_BYTES = [103, 246, 83, 235, 212, 232, 37, 50];
export const CONTEST_DISCRIMINATOR_BYTES = [216, 26, 88, 18, 251, 80, 201, 96];

function formatUSDC(amount: bigint): string {
  const whole = amount / BigInt(1_000_000);
  const fraction = amount % BigInt(1_000_000);
  return `${whole.toLocaleString()}.${fraction.toString().padStart(6, '0').slice(0, 2)}`;
}

export { formatUSDC };
