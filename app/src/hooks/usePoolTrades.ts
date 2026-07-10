'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { connection } from '@/solana/client';

export interface Trade {
  id: string;
  signature: string;
  timestamp: number;
  type: 'buy' | 'sell';
  usdcAmount: number;
  tokenAmount: number;
  price: number;
}

export interface PricePoint {
  time: string;
  price: number;
  timestamp: number;
}

interface UsePoolTradesParams {
  poolUsdcVault: string;
  poolTokenVault: string;
  initialPrice?: number;
  enabled: boolean;
}

export function usePoolTrades({
  poolUsdcVault,
  poolTokenVault,
  initialPrice,
  enabled,
}: UsePoolTradesParams) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState(initialPrice || 0);
  const [initialFetchDone, setInitialFetchDone] = useState(false);

  const loading = enabled && !initialFetchDone;

  const lastSigRef = useRef<string | null>(null);
  const tradesRef = useRef<Trade[]>([]);
  const seededRef = useRef(false);
  const fetchingRef = useRef(false);

  // Seed initial price when pool data becomes available (once)
  useEffect(() => {
    if (initialPrice && initialPrice > 0 && !seededRef.current) {
      seededRef.current = true;
      setCurrentPrice(initialPrice);
      setPriceHistory([{
        time: new Date().toISOString(),
        price: initialPrice,
        timestamp: Math.floor(Date.now() / 1000),
      }]);
    }
  }, [initialPrice]);

  const parseTradeFromTx = useCallback(async (signature: string): Promise<Trade | null> => {
    const { PublicKey } = await import('@solana/web3.js');

    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx || !tx.meta || !tx.blockTime) return null;

    const accountKeys = tx.transaction.message.accountKeys;
    const usdcVaultPk = new PublicKey(poolUsdcVault);
    const tokenVaultPk = new PublicKey(poolTokenVault);

    const usdcVaultIndex = accountKeys.findIndex(k => k.pubkey.equals(usdcVaultPk));
    const tokenVaultIndex = accountKeys.findIndex(k => k.pubkey.equals(tokenVaultPk));

    if (usdcVaultIndex === -1 || tokenVaultIndex === -1) return null;

    const preTokenBalances = tx.meta.preTokenBalances || [];
    const postTokenBalances = tx.meta.postTokenBalances || [];

    const preUsdc = preTokenBalances.find(b => b.accountIndex === usdcVaultIndex);
    const postUsdc = postTokenBalances.find(b => b.accountIndex === usdcVaultIndex);
    const preToken = preTokenBalances.find(b => b.accountIndex === tokenVaultIndex);
    const postToken = postTokenBalances.find(b => b.accountIndex === tokenVaultIndex);

    if (!preUsdc || !postUsdc || !preToken || !postToken) return null;

    const preUsdcAmount = Number(preUsdc.uiTokenAmount.amount);
    const postUsdcAmount = Number(postUsdc.uiTokenAmount.amount);
    const preTokenAmount = Number(preToken.uiTokenAmount.amount);
    const postTokenAmount = Number(postToken.uiTokenAmount.amount);

    const usdcDelta = postUsdcAmount - preUsdcAmount;
    const tokenDelta = postTokenAmount - preTokenAmount;

    const postUsdcUi = postUsdcAmount / 1e6;
    const postTokenUi = postTokenAmount / 1e6;
    const currentPoolPrice = postTokenUi > 0 ? postUsdcUi / postTokenUi : 0;

    // Filter out non-trade transactions
    if (usdcDelta === 0 && tokenDelta === 0) return null;

    if (usdcDelta > 0 && tokenDelta < 0) {
      const usdcAmount = usdcDelta / 1e6;
      const tokenAmount = Math.abs(tokenDelta) / 1e6;

      return {
        id: signature,
        signature,
        timestamp: tx.blockTime,
        type: 'buy',
        usdcAmount,
        tokenAmount,
        price: currentPoolPrice || (tokenAmount > 0 ? usdcAmount / tokenAmount : 0),
      };
    }

    if (usdcDelta < 0 && tokenDelta > 0) {
      const usdcAmount = Math.abs(usdcDelta) / 1e6;
      const tokenAmount = tokenDelta / 1e6;

      return {
        id: signature,
        signature,
        timestamp: tx.blockTime,
        type: 'sell',
        usdcAmount,
        tokenAmount,
        price: currentPoolPrice || (tokenAmount > 0 ? usdcAmount / tokenAmount : 0),
      };
    }

    return null;
  }, [poolUsdcVault, poolTokenVault]);

  const fetchTrades = useCallback(async () => {
    if (!enabled || fetchingRef.current) return;

    fetchingRef.current = true;
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const usdcVaultPk = new PublicKey(poolUsdcVault);

      const sigs = await connection.getSignaturesForAddress(usdcVaultPk, {
        limit: 20,
      });

      if (sigs.length === 0) return;

      const newestSig = sigs[0].signature;

      // Skip if we've already seen the newest sig and have trades
      if (lastSigRef.current === newestSig && tradesRef.current.length > 0) return;

      // Collect new signatures (ones we haven't seen)
      const newSigs = [];
      for (const sig of sigs) {
        if (sig.signature === lastSigRef.current) break;
        newSigs.push(sig);
      }

      if (newSigs.length === 0 && tradesRef.current.length > 0) return;

      // Chronological order
      newSigs.reverse();

      const newTrades: Trade[] = [];
      for (const sig of newSigs) {
        const trade = await parseTradeFromTx(sig.signature);
        if (trade) newTrades.push(trade);
      }

      if (newTrades.length > 0) {
        const existingIds = new Set(tradesRef.current.map(t => t.id));
        const unique = newTrades.filter(t => !existingIds.has(t.id));

        if (unique.length > 0) {
          const updated = [...unique, ...tradesRef.current].slice(0, 50);
          tradesRef.current = updated;
          setTrades(updated);

          const newPoints: PricePoint[] = unique.map(t => ({
            time: new Date(t.timestamp * 1000).toISOString(),
            price: t.price,
            timestamp: t.timestamp,
          }));

          setPriceHistory(prev => {
            const combined = [...prev, ...newPoints];
            const seen = new Set<number>();
            return combined.filter(p => {
              if (seen.has(p.timestamp)) return false;
              seen.add(p.timestamp);
              return true;
            }).sort((a, b) => a.timestamp - b.timestamp);
          });

          setCurrentPrice(unique[unique.length - 1].price);
        }
      }

      lastSigRef.current = newestSig;
    } catch (err) {
      console.error('Failed to fetch trades:', err);
    } finally {
      fetchingRef.current = false;
    }
  }, [enabled, poolUsdcVault, parseTradeFromTx]);

  useEffect(() => {
    if (!enabled) return;

    fetchTrades().then(() => setInitialFetchDone(true));

    const interval = setInterval(fetchTrades, 10000);

    return () => clearInterval(interval);
  }, [enabled, fetchTrades]);

  const refresh = useCallback(async () => {
    await fetchTrades();
  }, [fetchTrades]);

  return { trades, priceHistory, currentPrice, loading, refresh };
}
