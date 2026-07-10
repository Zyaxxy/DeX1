'use client';

import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';

const WalletMultiButtonDynamic = dynamic(
  async () => {
    const { WalletMultiButton } = await import('@solana/wallet-adapter-react-ui');
    return ({ className, children }: { className?: string; children?: React.ReactNode }) => (
      <WalletMultiButton className={className}>{children}</WalletMultiButton>
    );
  },
  { ssr: false }
);

export function WalletButton() {
  const { connected, publicKey, disconnect } = useWallet();

  const formatAddress = (pubkey: { toString: () => string } | null) => {
    if (!pubkey) return '';
    const addr = pubkey.toString();
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  return (
    <div className="flex items-center gap-2">
      {connected ? (
        <button
          onClick={() => disconnect()}
          className="!bg-primary !text-primary-foreground !font-mono !text-[14px] !leading-[20px] !font-[700] !px-6 !py-2 !rounded-sm !uppercase !tracking-wider !border-0 hover:!opacity-90 !transition-opacity"
        >
          {formatAddress(publicKey)}
        </button>
      ) : (
        <WalletMultiButtonDynamic className="!bg-primary !text-primary-foreground !font-mono !text-[14px] !leading-[20px] !font-[700] !px-6 !py-2 !rounded-sm !uppercase !tracking-wider !border-0 hover:!opacity-90 !transition-opacity" />
      )}
    </div>
  );
}
