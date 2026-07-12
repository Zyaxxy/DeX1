'use client';

import { usePathname } from 'next/navigation';
import { WalletButton } from '@/solana/components/wallet-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { getAdminKeypair } from '@/solana/client';

const adminLinks = [
  { name: 'Dashboard', href: '/admin' },
  { name: 'Launch Token', href: '/admin/launch' },
  { name: 'Markets', href: '/admin/markets' },
  { name: 'Create Contest', href: '/admin/create-contest' },
  { name: 'Contests', href: '/admin/contests' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  let envKeypairConfigured = false;
  try {
    getAdminKeypair();
    envKeypairConfigured = true;
  } catch {}

  if (!envKeypairConfigured) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xl font-bold text-primary-foreground">D</span>
              </div>
              <span className="text-2xl font-bold tracking-tight">Dexi</span>
            </Link>
            <WalletButton />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Card className="max-w-md w-full">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl">Admin Key Not Configured</CardTitle>
                <CardDescription>
                  Set NEXT_PUBLIC_ADMIN_PRIVATE_KEY in your .env file
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xl font-bold text-primary-foreground">D</span>
            </div>
            <span className="text-2xl font-bold tracking-tight">Dexi</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/markets" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Markets</Link>
            <Link href="/portfolio" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Portfolio</Link>
            <Link href="/admin" className="text-sm font-medium text-foreground">Admin</Link>
          </nav>
          <WalletButton />
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-heading">Admin Panel</h1>
            <p className="text-muted-foreground text-sm">Manage pools, contests, tokens, and protocol settings</p>
          </div>
          <nav className="flex gap-2 flex-wrap">
            {adminLinks.map(link => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </nav>
        </div>
        {children}
      </div>
    </div>
  );
}
