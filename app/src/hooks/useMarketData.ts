'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { rpc, PROGRAM_ID, connection } from '@/solana/client';
import { decodeAthletePool, ATHLETE_POOL_DISCRIMINATOR, findConfigPda, decodeAdminConfig } from '@dexi/sdk';
import { getBase58Decoder } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, AccountLayout } from '@solana/spl-token';

const POLL_INTERVAL = 15000;
const MAX_PRICE_HISTORY = 60;

interface PoolRaw {
  mint: string;
  name: string;
  role: number;
  enabled: boolean;
  price: number;
  poolUsdc: bigint;
  poolTokens: bigint;
  poolUsdcVault: string;
  poolTokenVault: string;
}

export interface PoolMarket extends PoolRaw {
  priceChange: number;
  volume24h: number;
  priceHistory: { time: number; price: number }[];
}

export interface TradeActivity {
  id: string;
  athleteName: string;
  athleteMint: string;
  timestamp: number;
  type: 'buy' | 'sell';
  usdcAmount: number;
  tokenAmount: number;
  price: number;
  wallet: string;
}

export function useMarketData() {
  const [pools, setPools] = useState<PoolMarket[]>([]);
  const [activities, setActivities] = useState<TradeActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const priceHistoriesRef = useRef<Map<string, { time: number; price: number }[]>>(new Map());
  const firstPricesRef = useRef<Map<string, number>>(new Map());
  const poolMetasRef = useRef<PoolRaw[]>([]);
  const poolVaultsRef = useRef<{ usdcVault: PublicKey; tokenVault: PublicKey; mint: string; name: string }[]>([]);
  const lastSigsRef = useRef<Map<string, string>>(new Map());
  const activityCacheRef = useRef<TradeActivity[]>([]);
  const activityIdxRef = useRef(0);
  const [initialized, setInitialized] = useState(false);

  const fetchPools = useCallback(async () => {
    try {
      const response = await rpc.getProgramAccounts(PROGRAM_ID.toBase58() as any, {
        encoding: 'base64',
        filters: [
          { memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(ATHLETE_POOL_DISCRIMINATOR) as any } }
        ]
      }).send();

      const decodedPools = response.map((account: any) =>
        decodeAthletePool({
          address: account.pubkey,
          data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
          exists: true,
        } as any).data
      );

      if (decodedPools.length === 0) {
        setPools([]);
        setLoading(false);
        return;
      }

      const [configPda] = await findConfigPda();
      const configInfo = await connection.getAccountInfo(new PublicKey(configPda));
      if (!configInfo) throw new Error("Config not found");
      const configData = decodeAdminConfig({
        address: configPda,
        data: new Uint8Array(configInfo.data),
        exists: true,
      } as any).data;
      const usdcMint = new PublicKey(configData.usdcMint);

      const vaultAddresses: PublicKey[] = [];
      for (const pool of decodedPools) {
        const poolMint = new PublicKey(pool.mint);
        const [poolAuth] = PublicKey.findProgramAddressSync(
          [Buffer.from('pool'), poolMint.toBuffer()],
          PROGRAM_ID
        );
        vaultAddresses.push(
          getAssociatedTokenAddressSync(poolMint, poolAuth, true),
          getAssociatedTokenAddressSync(usdcMint, poolAuth, true)
        );
      }

      const accountInfos = await connection.getMultipleAccountsInfo(vaultAddresses);

      const formatted: PoolRaw[] = decodedPools.map((pool: any, i: number) => {
        const tokenVault = accountInfos[i * 2];
        const usdcVault = accountInfos[i * 2 + 1];
        let price = 0, poolUsdc = BigInt(0), poolTokens = BigInt(0);
        if (tokenVault && usdcVault) {
          const ta = AccountLayout.decode(tokenVault.data);
          const ua = AccountLayout.decode(usdcVault.data);
          poolTokens = ta.amount;
          poolUsdc = ua.amount;
          if (poolTokens > BigInt(0)) price = Number(poolUsdc) / Number(poolTokens);
        }
        return {
          mint: pool.mint.toString(),
          name: pool.name,
          role: pool.role,
          enabled: pool.enabled,
          price: price || 1.0,
          poolUsdc,
          poolTokens,
          poolUsdcVault: vaultAddresses[i * 2 + 1].toBase58(),
          poolTokenVault: vaultAddresses[i * 2].toBase58(),
        };
      });

      const histories = priceHistoriesRef.current;
      const firstPrices = firstPricesRef.current;
      const now = Date.now();

      for (const p of formatted) {
        if (!firstPrices.has(p.mint)) firstPrices.set(p.mint, p.price);
        const h = histories.get(p.mint) || [];
        h.push({ time: now, price: p.price });
        if (h.length > MAX_PRICE_HISTORY) h.shift();
        histories.set(p.mint, h);
      }

      const enabled = formatted.filter(p => p.enabled);
      const finalPools: PoolMarket[] = enabled.map(p => {
        const h = histories.get(p.mint) || [];
        const fp = firstPrices.get(p.mint) || p.price;
        const pc = fp > 0 ? ((p.price - fp) / fp) * 100 : 0;
        return { ...p, priceChange: pc, volume24h: Number(p.poolUsdc) / 1e6, priceHistory: h };
      });

      poolMetasRef.current = formatted;
      poolVaultsRef.current = formatted.map(p => ({
        usdcVault: new PublicKey(p.poolUsdcVault),
        tokenVault: new PublicKey(p.poolTokenVault),
        mint: p.mint,
        name: p.name,
      }));

      setPools(finalPools);
      setLoading(false);
      setInitialized(true);
    } catch (err) {
      console.error("Failed to fetch pools:", err);
      setLoading(false);
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    const vaults = poolVaultsRef.current;
    if (vaults.length === 0) return;

    const idx = activityIdxRef.current % vaults.length;
    activityIdxRef.current++;
    const v = vaults[idx];

    try {
      const sigs = await connection.getSignaturesForAddress(v.usdcVault, { limit: 5 });
      if (sigs.length === 0) return;

      const lastSig = lastSigsRef.current.get(v.mint);
      const newSigs: any[] = [];
      for (const s of sigs) {
        if (s.signature === lastSig) break;
        newSigs.push(s);
      }
      if (newSigs.length === 0) return;

      newSigs.reverse();
      for (const sigInfo of newSigs) {
        const tx = await connection.getParsedTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx || !tx.meta || !tx.blockTime) continue;

        const keys = tx.transaction.message.accountKeys;
        const uvIdx = keys.findIndex(k => k.pubkey.equals(v.usdcVault));
        const tvIdx = keys.findIndex(k => k.pubkey.equals(v.tokenVault));
        if (uvIdx === -1 || tvIdx === -1) continue;

        const pre = tx.meta.preTokenBalances || [];
        const post = tx.meta.postTokenBalances || [];
        const pu = pre.find((b: any) => b.accountIndex === uvIdx);
        const pou = post.find((b: any) => b.accountIndex === uvIdx);
        const pt = pre.find((b: any) => b.accountIndex === tvIdx);
        const pot = post.find((b: any) => b.accountIndex === tvIdx);
        if (!pu || !pou || !pt || !pot) continue;

        const ud = Number(pou.uiTokenAmount.amount) - Number(pu.uiTokenAmount.amount);
        const td = Number(pot.uiTokenAmount.amount) - Number(pt.uiTokenAmount.amount);
        if (ud === 0 && td === 0) continue;

        const isBuy = ud > 0 && td < 0;
        const isSell = ud < 0 && td > 0;
        if (!isBuy && !isSell) continue;

        const postUsdcUi = Number(pou.uiTokenAmount.amount) / 1e6;
        const postTokenUi = Number(pot.uiTokenAmount.amount) / 1e6;
        const cp = postTokenUi > 0 ? postUsdcUi / postTokenUi : 0;
        const walletAddr = keys[0]?.pubkey.toBase58() || '';
        const shortWallet = `${walletAddr.slice(0, 4)}...${walletAddr.slice(-4)}`;

        const act: TradeActivity = {
          id: sigInfo.signature,
          athleteName: v.name,
          athleteMint: v.mint,
          timestamp: tx.blockTime,
          type: isBuy ? 'buy' : 'sell',
          usdcAmount: Math.abs(ud) / 1e6,
          tokenAmount: Math.abs(td) / 1e6,
          price: cp,
          wallet: shortWallet,
        };

        const cache = activityCacheRef.current;
        if (!cache.find(a => a.id === act.id)) {
          cache.unshift(act);
          if (cache.length > 50) cache.pop();
        }
      }
      lastSigsRef.current.set(v.mint, sigs[0].signature);
      setActivities([...activityCacheRef.current]);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPools();
    const interval = setInterval(fetchPools, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPools]);

  useEffect(() => {
    if (!initialized) return;
    fetchActivity();
    const interval = setInterval(fetchActivity, 8000);
    return () => clearInterval(interval);
  }, [initialized, fetchActivity]);

  return { pools, activities, loading, refresh: fetchPools };
}
