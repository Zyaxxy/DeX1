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

export function WalletButton() {
  return (
    <WalletMultiButtonDynamic className="!bg-[#4ade80] !text-black !font-mono !text-[14px] !leading-[20px] !font-[700] !px-6 !py-2 !rounded-sm !uppercase !tracking-wider !border-0 hover:!opacity-90 !transition-opacity" />
  );
}
