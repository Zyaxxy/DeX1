'use client';

import dynamic from 'next/dynamic';

const WalletMultiButtonDynamic = dynamic(
  async () => {
    const { WalletMultiButton } = await import('@solana/wallet-adapter-react-ui');
    return ({ className, children }: { className?: string; children?: React.ReactNode }) => (
      <WalletMultiButton className={className}>{children}</WalletMultiButton>
    );
  },
  { ssr: false }
);

const WalletDisconnectButtonDynamic = dynamic(
  async () => {
    const { WalletDisconnectButton } = await import('@solana/wallet-adapter-react-ui');
    return ({ className, children }: { className?: string; children?: React.ReactNode }) => (
      <WalletDisconnectButton className={className}>{children}</WalletDisconnectButton>
    );
  },
  { ssr: false }
);

export function WalletButton() {
  return (
    <div className="flex items-center gap-2">
      <WalletMultiButtonDynamic className="!bg-primary !text-primary-foreground hover:!bg-primary/90 !rounded-full !px-6">
        Connect Wallet
      </WalletMultiButtonDynamic>
    </div>
  );
}