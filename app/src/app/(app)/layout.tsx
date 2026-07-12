'use client';

import { Providers } from '@/solana/providers/providers';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
