'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, Zap, Rocket, BarChart3, Shield, Users, Wallet, ArrowRight } from 'lucide-react';
import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

// Mock data for ticker
const TICKER_MOCK = [
  { name: "L. Messi", role: "FWD", roleColor: "bg-rose-500", price: 5.42, change: 12.4 },
  { name: "J. Bellingham", role: "MID", roleColor: "bg-emerald-500", price: 4.89, change: 8.2 },
  { name: "V. van Dijk", role: "DEF", roleColor: "bg-sky-500", price: 2.15, change: -1.5 },
  { name: "K. Mbappé", role: "FWD", roleColor: "bg-rose-500", price: 6.10, change: 4.3 },
  { name: "T. Courtois", role: "GK", roleColor: "bg-amber-500", price: 1.85, change: 0.8 },
  { name: "B. Saka", role: "MID", roleColor: "bg-emerald-500", price: 3.20, change: -2.1 },
  { name: "C. Ronaldo", role: "FWD", roleColor: "bg-rose-500", price: 4.12, change: 5.6 },
  { name: "Pedri", role: "MID", roleColor: "bg-emerald-500", price: 2.95, change: 1.2 },
];

function SparklineMock({ isPositive }: { isPositive: boolean }) {
  const color = isPositive ? '#00ff88' : '#ff4757';
  return (
    <svg width="40" height="20" viewBox="0 0 40 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path 
        d={isPositive ? "M0,15 Q5,15 10,10 T20,12 T30,5 T40,2" : "M0,5 Q5,5 10,8 T20,5 T30,12 T40,15"} 
        stroke={color} 
        strokeWidth="1.5" 
        fill="none" 
      />
    </svg>
  );
}

export default function LandingPage() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0f] overflow-x-hidden">
      <Navbar />

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full mix-blend-screen filter blur-[100px] animate-pulse-glow" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-secondary/20 rounded-full mix-blend-screen filter blur-[100px] animate-float" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-primary/10 rounded-full mix-blend-screen filter blur-[150px]" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge className="mb-6 bg-white/5 hover:bg-white/10 text-primary border-primary/20 px-4 py-1.5 rounded-full backdrop-blur-md">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Live on Solana Mainnet
                </span>
              </Badge>
            </motion.div>

            <motion.h1 
              className="text-6xl md:text-8xl font-black tracking-tight mb-8 leading-[1.1]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <span className="text-white block">Trade Athletes.</span>
              <span className="text-white block">Win Big.</span>
              <span className="gradient-text block">On-Chain.</span>
            </motion.h1>

            <motion.p 
              className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              The world's first fantasy sports platform powered by Solana. Draft teams, trade athlete tokens on automated bonding curves, and compete for instant crypto prizes.
            </motion.p>

            <motion.div 
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {mounted && connected ? (
                <Link href="/markets">
                  <Button size="lg" className="h-14 px-8 text-lg font-bold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 glow-green transition-all hover:scale-105">
                    Go to Dashboard <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
              ) : (
                <Button 
                  size="lg" 
                  className="h-14 px-8 text-lg font-bold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 glow-green transition-all hover:scale-105"
                  onClick={() => setVisible(true)}
                >
                  Start Trading
                </Button>
              )}
              <Link href="/markets">
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-bold rounded-full border-primary/30 text-white hover:bg-white/5 transition-all">
                  Explore Markets
                </Button>
              </Link>
            </motion.div>
          </div>

          {/* Stats Bar */}
          <motion.div 
            className="mt-20 max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 p-4 glass rounded-3xl"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
          >
            <div className="text-center p-4 border-r border-white/5 last:border-0 md:border-r">
              <p className="text-3xl font-black text-white mb-1">$2.4M+</p>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Volume Traded</p>
            </div>
            <div className="text-center p-4 border-r-0 md:border-r border-white/5">
              <p className="text-3xl font-black text-white mb-1">12,500+</p>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Players</p>
            </div>
            <div className="text-center p-4 border-r border-white/5 last:border-0 md:border-r">
              <p className="text-3xl font-black text-white mb-1">847</p>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Markets</p>
            </div>
            <div className="text-center p-4">
              <p className="text-3xl font-black text-primary mb-1">{'< 1s'}</p>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Settlement</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* MARKETS TICKER */}
      <section className="py-6 border-y border-white/[0.06] bg-black/40 overflow-hidden relative">
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#0a0a0f] to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#0a0a0f] to-transparent z-10" />
        
        <div className="flex gap-4 animate-[marquee_30s_linear_infinite] whitespace-nowrap w-max">
          {[...TICKER_MOCK, ...TICKER_MOCK].map((item, i) => (
            <div key={i} className="flex items-center gap-4 glass px-6 py-3 rounded-2xl min-w-[300px]">
              <div className="flex items-center gap-3">
                <Badge className={`${item.roleColor} text-white hover:${item.roleColor} border-none`}>{item.role}</Badge>
                <span className="font-bold text-white">{item.name}</span>
              </div>
              <div className="flex items-center gap-3 ml-auto">
                <SparklineMock isPositive={item.change >= 0} />
                <div className="text-right">
                  <p className="font-mono font-bold">${item.price.toFixed(2)}</p>
                  <p className={`text-xs font-semibold ${item.change >= 0 ? 'text-[#00ff88]' : 'text-[#ff4757]'}`}>
                    {item.change >= 0 ? '+' : ''}{item.change}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <style jsx global>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      {/* FEATURES SECTION */}
      <section className="py-24 relative">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <motion.h2 
              className="text-4xl md:text-5xl font-black mb-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Why <span className="gradient-text">DEXI?</span>
            </motion.h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              We've combined the best of Web3 trading with fantasy sports to create a completely new way to play.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              { icon: Trophy, title: "Fantasy Contests", desc: "Compete in daily and weekly fantasy contests. Draft your dream lineup and climb the leaderboards." },
              { icon: TrendingUp, title: "Token Trading", desc: "Trade athlete tokens on our bonding curve DEX. Prices move with real-world performance." },
              { icon: Zap, title: "Instant Prizes", desc: "Win USDC prizes settled instantly on Solana. No delays, no intermediaries." },
              { icon: Rocket, title: "Launch Tokens", desc: "Create and launch new athlete tokens. Set up bonding curves and build markets." },
              { icon: BarChart3, title: "Live Charts", desc: "Professional-grade candlestick charts powered by TradingView. Track every price movement." },
              { icon: Shield, title: "Fully On-Chain", desc: "Fully on-chain on Solana. Transparent, verifiable, and trustless." }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="glass border-white/[0.06] hover:border-primary/30 transition-all duration-300 hover:glow-green hover:-translate-y-1 h-full group bg-white/[0.02]">
                  <CardContent className="p-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <feature.icon className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 bg-black/40 border-y border-white/[0.06] relative">
        <div className="container mx-auto px-4">
          <div className="text-center mb-20">
            <motion.h2 
              className="text-4xl md:text-5xl font-black mb-6 text-white"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Get Started in Minutes
            </motion.h2>
          </div>

          <div className="max-w-5xl mx-auto relative">
            {/* Desktop connecting line */}
            <div className="hidden md:block absolute top-[60px] left-1/6 right-1/6 h-0.5 bg-gradient-to-r from-primary/10 via-primary/50 to-primary/10" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              {[
                { step: "01", icon: Wallet, title: "Connect Wallet", desc: "Connect your Solana wallet like Phantom to get started in seconds." },
                { step: "02", icon: Users, title: "Draft & Trade", desc: "Browse markets, buy athlete tokens at bonding curve prices, enter fantasy contests." },
                { step: "03", icon: Trophy, title: "Win Prizes", desc: "Score points from real performances. Top the leaderboard and earn USDC." }
              ].map((step, i) => (
                <motion.div
                  key={i}
                  className="relative flex flex-col items-center text-center"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                >
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground font-black flex items-center justify-center text-xl mb-6 relative z-10 shadow-[0_0_20px_rgba(0,255,136,0.5)]">
                    {step.step}
                  </div>
                  <div className="w-20 h-20 rounded-3xl glass flex items-center justify-center mb-6">
                    <step.icon className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">{step.title}</h3>
                  <p className="text-muted-foreground">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-32 relative">
        <div className="container mx-auto px-4">
          <motion.div 
            className="max-w-5xl mx-auto glass rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/20" />
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay" />
            
            <div className="relative z-10">
              <h2 className="text-5xl md:text-7xl font-black text-white mb-6 tracking-tight">Ready to Play?</h2>
              <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
                Join thousands of players trading on the future of fantasy sports.
              </p>
              
              {mounted && connected ? (
                <Link href="/markets">
                  <Button size="lg" className="h-16 px-10 text-xl font-bold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 glow-green transition-all hover:scale-105">
                    Launch App
                  </Button>
                </Link>
              ) : (
                <Button 
                  size="lg" 
                  className="h-16 px-10 text-xl font-bold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 glow-green transition-all hover:scale-105"
                  onClick={() => setVisible(true)}
                >
                  Connect Wallet
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}