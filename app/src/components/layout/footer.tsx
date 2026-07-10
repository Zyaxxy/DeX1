'use client';

import Image from 'next/image';
import Link from 'next/link';

const footerLinks = [
  { name: 'Terms', href: '#' },
  { name: 'Privacy', href: '#' },
  { name: 'API Docs', href: '#' },
  { name: 'Support', href: '#' },
];

export default function Footer() {
  return (
    <footer className="w-full bg-[#0a0e18] py-8 px-6 flex justify-between items-center border-t border-[#454932]">
      <div className="flex items-center gap-4 max-w-[1440px] mx-auto w-full">
        <Image src="/DEXI.svg" alt="DEXI" width={28} height={28} className="shrink-0" />
        <span className="text-[24px] leading-[28px] font-[600] font-heading text-white tracking-tighter">DEXI</span>
        <span className="font-mono text-[14px] leading-[20px] font-[500] tracking-[0.02em] text-[#c6c9ab] hidden sm:block">
          &copy; {new Date().getFullYear()} DEXI Protocol. Kinetic Precision Trading.
        </span>
      </div>
      <div className="flex gap-6">
        {footerLinks.map((link) => (
          <Link
            key={link.name}
            href={link.href}
            className="font-mono text-[14px] leading-[20px] font-[500] tracking-[0.02em] text-[#c6c9ab] hover:text-white transition-opacity duration-200"
          >
            {link.name}
          </Link>
        ))}
      </div>
    </footer>
  );
}
