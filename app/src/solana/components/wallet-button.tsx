'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';

const WalletMultiButtonDynamic = dynamic(
  async () => {
    const { WalletMultiButton } = await import('@solana/wallet-adapter-react-ui');
    return ({ className, children }: { className?: string; children?: ReactNode }) => (
      <WalletMultiButton className={className}>{children}</WalletMultiButton>
    );
  },
  { ssr: false }
);

class WalletErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function WalletButton() {
  return (
    <WalletErrorBoundary>
      <WalletMultiButtonDynamic className="!bg-[#4ade80] !text-black !font-mono !text-[14px] !leading-[20px] !font-[700] !px-6 !py-2 !rounded-sm !uppercase !tracking-wider !border-0 hover:!opacity-90 !transition-opacity" />
    </WalletErrorBoundary>
  );
}
