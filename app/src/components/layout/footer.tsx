'use client';

import Link from 'next/link';
import { GitFork, Globe, MessageSquare } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full bg-black/40 border-t border-white/[0.06] relative overflow-hidden">
      {/* Subtle top gradient line */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
      
      <div className="container mx-auto px-4 pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-[0_0_15px_rgba(0,255,136,0.3)]">
                <span className="text-primary-foreground font-black italic text-lg leading-none">D</span>
              </div>
              <span className="font-black italic text-xl tracking-tight text-white">DEXI</span>
            </Link>
            <p className="text-sm text-muted-foreground mb-6">
              Fantasy Sports Trading on Solana. Build your dream lineup, trade athlete tokens, and win big.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground hover:bg-white/10 hover:text-white transition-colors border border-white/10">
                <Globe className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground hover:bg-white/10 hover:text-white transition-colors border border-white/10">
                <MessageSquare className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground hover:bg-white/10 hover:text-white transition-colors border border-white/10">
                <GitFork className="w-4 h-4" />
              </a>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold text-white mb-4">Platform</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/markets" className="hover:text-primary transition-colors">Markets</Link></li>
              <li><Link href="/" className="hover:text-primary transition-colors">Contests</Link></li>
              <li><Link href="/launch" className="hover:text-primary transition-colors">Launch Token</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold text-white mb-4">Resources</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">GitHub</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">API Reference</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold text-white mb-4">Legal</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Risk Disclaimer</a></li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} DEXI. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Built on</span>
            <div className="flex items-center gap-1 font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#14F195] to-[#9945FF]">
              Solana
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
