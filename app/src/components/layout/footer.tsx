'use client';

import Image from 'next/image';
import Link from 'next/link';

const footerLinks = [
  { name: 'Faucet', href: '/faucet' },
  { name: 'Terms', href: '#' },
  { name: 'Privacy', href: '#' },
  { name: 'Docs', href: '#' },
  { name: 'Support', href: '#' },
];

export default function Footer() {
  return (
    <footer className="w-full bg-[#0a0e18] py-4 px-6 border-t border-[#454932]">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 max-w-[1440px] mx-auto w-full">
        <div className="flex items-center gap-3">
          <Image src="/DEXI.svg" alt="DEXI" width={20} height={20} className="shrink-0" />
          <span className="text-[18px] leading-[22px] font-[600] font-heading text-white tracking-tighter">DEXI</span>
          <span className="font-mono text-[11px] leading-[16px] font-[500] tracking-[0.02em] text-[#c6c9ab] hidden md:block">
            &copy; {new Date().getFullYear()} DEXI Protocol. Kinetic Precision Trading.
          </span>
        </div>
        <div className="flex items-center gap-5 flex-wrap justify-center">
          {footerLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="font-mono text-[11px] leading-[16px] font-[500] tracking-[0.02em] text-[#c6c9ab] hover:text-white transition-opacity duration-200"
            >
              {link.name}
            </Link>
          ))}
        </div>
        <span className="font-mono text-[11px] leading-[16px] font-[500] tracking-[0.02em] text-[#c6c9ab] md:hidden block text-center">
          &copy; {new Date().getFullYear()} DEXI Protocol. Kinetic Precision Trading.
        </span>
      </div>
    </footer>
  );
}
