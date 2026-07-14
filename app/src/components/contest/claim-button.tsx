'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Loader2, Check, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClaimReward, ClaimState } from '@/hooks/useClaimReward';
import { toast } from 'sonner';

interface ClaimButtonProps {
  contestAddress: string;
  entryAddress: string;
  amount?: number;
  onClaimed?: () => void;
  onClaimError?: (error: string) => void;
  variant?: 'default' | 'compact';
  disabled?: boolean;
}

export function ClaimButton({
  contestAddress,
  entryAddress,
  amount,
  onClaimed,
  onClaimError,
  variant = 'default',
  disabled = false,
}: ClaimButtonProps) {
  const { connected } = useWallet();
  const { state, error, claim } = useClaimReward();
  const [isAlreadyClaimed, setIsAlreadyClaimed] = useState(false);

  const handleClick = async () => {
    if (!connected) {
      toast.error('Please connect your wallet first');
      return;
    }

    const success = await claim(contestAddress, entryAddress);
    if (success) {
      onClaimed?.();
    } else if (error) {
      onClaimError?.(error);
    }
  };

  useEffect(() => {
    if (state === 'error' && error) {
      if (error.includes('already claimed') || error.includes('ALREADY_CLAIMED')) {
        setIsAlreadyClaimed(true);
      }
    }
  }, [state, error]);

  if (isAlreadyClaimed) {
    return (
      <Button
        variant="outline"
        disabled
        className={`${variant === 'compact' ? 'h-8 px-3 text-xs' : 'h-11 px-6'} border-positive/30 bg-positive/10 text-positive cursor-not-allowed font-mono font-[700]`}
      >
        <Check className={`${variant === 'compact' ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
        Claimed ✓
      </Button>
    );
  }

  if (disabled) {
    return (
      <Button
        variant="outline"
        disabled
        className={`${variant === 'compact' ? 'h-8 px-3 text-xs' : 'h-11 px-6'} border-[#454932] bg-[#181b25] text-[#c6c9ab] cursor-not-allowed font-mono font-[700]`}
      >
        <DollarSign className={`${variant === 'compact' ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
        No Prize
      </Button>
    );
  }

  const isLoading = state === 'preparing' || state === 'signing' || state === 'submitting';
  const showSuccess = state === 'success';

  if (showSuccess) {
    return (
      <Button
        variant="outline"
        disabled
        className={`${variant === 'compact' ? 'h-8 px-3 text-xs' : 'h-11 px-6'} border-positive/30 bg-positive/10 text-positive cursor-not-allowed font-mono font-[700]`}
      >
        <Check className={`${variant === 'compact' ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
        Claimed ✓
      </Button>
    );
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isLoading || !connected}
      className={`${variant === 'compact' ? 'h-8 px-3 text-xs' : 'h-11 px-6'} bg-positive text-[#0a0e18] hover:bg-positive/90 font-mono font-[700] uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
    >
      {isLoading ? (
        <Loader2 className={`${variant === 'compact' ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'} animate-spin`} />
      ) : (
        <DollarSign className={`${variant === 'compact' ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
      )}
      {isLoading ? 'Processing...' : 'Claim Reward'}
      {amount !== undefined && amount > 0 && <span className="ml-1 opacity-80">(${amount.toFixed(2)})</span>}
    </Button>
  );
}

export function ClaimButtonSkeleton({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  return (
    <div className={`${variant === 'compact' ? 'h-8 w-20' : 'h-11 w-40'} bg-[#181b25] border border-[#454932] animate-pulse rounded-md`} />
  );
}