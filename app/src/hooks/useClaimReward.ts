'use client';

import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { toast } from 'sonner';

export type ClaimState = 'idle' | 'preparing' | 'signing' | 'submitting' | 'success' | 'error';

export interface UseClaimRewardResult {
  state: ClaimState;
  error: string | null;
  txSignature: string | null;
  claim: (contestAddress: string, entryAddress: string) => Promise<boolean>;
  reset: () => void;
}

export function useClaimReward(): UseClaimRewardResult {
  const { connected, publicKey, signTransaction } = useWallet();
  const [state, setState] = useState<ClaimState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
    setTxSignature(null);
  }, []);

  const claim = useCallback(async (contestAddress: string, entryAddress: string): Promise<boolean> => {
    if (!connected || !publicKey) {
      setError('Wallet not connected');
      setState('error');
      toast.error('Please connect your wallet first');
      return false;
    }

    if (!signTransaction) {
      setError('Wallet does not support signing');
      setState('error');
      toast.error('Wallet does not support signing transactions');
      return false;
    }

    setState('preparing');
    setError(null);

    try {
      const prepareResponse = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contestAddress,
          userAddress: publicKey.toBase58(),
        }),
      });

      const prepareData = await prepareResponse.json();

      if (!prepareResponse.ok) {
        if (prepareData.code === 'ALREADY_CLAIMED') {
          setError('You have already claimed your reward');
          setState('error');
          toast.error('You have already claimed your reward');
          return false;
        }
        throw new Error(prepareData.error || 'Failed to prepare claim');
      }

      const { transaction: serializedTx, amount } = prepareData;
      console.log('📝 Prepared claim for amount:', amount);

      setState('signing');

      const tx = VersionedTransaction.deserialize(Buffer.from(serializedTx, 'base64'));

      const signedTx = await signTransaction(tx);
      console.log('✍️ Transaction signed by wallet');

      setState('submitting');

      const signedTxBase64 = Buffer.from(signedTx.serialize()).toString('base64');
      const submitResponse = await fetch('/api/claim/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contestAddress,
          transaction: signedTxBase64,
        }),
      });

      const submitData = await submitResponse.json();
      if (!submitResponse.ok) {
        throw new Error(submitData.error || 'Failed to submit transaction');
      }

      const signature = submitData.signature;
      console.log('📤 Transaction submitted:', signature);

      setTxSignature(signature);
      setState('success');
      toast.success(`Claimed ${amount.toFixed(2)} USDC!`, {
        action: {
          label: 'View',
          onClick: () => window.open(`https://explorer.solana.com/tx/${signature}?cluster=devnet`, '_blank'),
        },
      });

      return true;
    } catch (err: any) {
      console.error('❌ Claim error:', err);
      const errorMsg = err.message || 'Failed to claim reward';
      setError(errorMsg);
      setState('error');
      toast.error(errorMsg);
      return false;
    }
  }, [connected, publicKey, signTransaction]);

  return {
    state,
    error,
    txSignature,
    claim,
    reset,
  };
}