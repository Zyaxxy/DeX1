'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletButton } from '@/solana/components/wallet-button';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import Image from 'next/image';
import { Menu, X, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

const navLinks = [
  { name: 'Markets', href: '/markets' },
  { name: 'Portfolio', href: '/portfolio' },
  { name: 'Contests', href: '/contests' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full bg-surface border-b border-border">
      <div className="flex items-center justify-between h-16 px-6 max-w-[1440px] mx-auto w-full">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/DEXI.svg" alt="DEXI" width={28} height={28} className="shrink-0" />
          <span className="text-[24px] font-[600] font-heading text-white tracking-tighter">DEXI</span>
        </Link>

        <div className="hidden md:flex gap-8 h-full items-center absolute left-1/2 -translate-x-1/2">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`font-mono text-[14px] leading-[20px] font-[500] tracking-[0.02em] transition-colors flex items-center h-full border-b-2 ${
                  isActive
                    ? 'text-white border-primary'
                    : 'text-[#c6c9ab] border-transparent hover:text-white'
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          <button className="hidden md:flex items-center justify-center text-[#c6c9ab] hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
          </button>

          <div className="hidden md:block">
            <WalletButton />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-[#1c1f2a] border-t border-[#454932] overflow-hidden"
          >
            <div className="px-4 py-4 flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-sm text-sm font-mono tracking-[0.02em] text-[#c6c9ab] hover:bg-[#262a34] hover:text-white transition-colors"
                >
                  {link.name}
                </Link>
              ))}
              <div className="pt-2 flex justify-center">
                <WalletButton />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
