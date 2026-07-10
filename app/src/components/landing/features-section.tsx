'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Trophy, TrendingUp, Zap, Rocket, BarChart3, Shield } from 'lucide-react';

const FEATURES = [
  { icon: Trophy, title: 'Fantasy Contests', desc: 'Draft 11 athletes into your dream lineup and compete in daily contests. Climb leaderboards and win based on real-world performance.', accent: 'primary' },
  { icon: TrendingUp, title: 'Bonding Curve Trading', desc: 'Every athlete token trades on an automated market maker. Prices rise and fall with real demand - no order books, no slippage.', accent: 'secondary' },
  { icon: Zap, title: 'Instant USDC Prizes', desc: 'Winnings settle on-chain in seconds. No withdrawal limits, no processing delays. What you earn is yours immediately.', accent: 'primary' },
  { icon: Rocket, title: 'Token Launchpad', desc: 'Create and launch new athlete token markets in minutes. Set your bonding curve parameters and let the community trade.', accent: 'secondary' },
  { icon: BarChart3, title: 'Live Pro Charts', desc: 'Professional candlestick charts with volume profiles. Track every price movement with the same tools pros use.', accent: 'primary' },
  { icon: Shield, title: 'Fully On-Chain', desc: 'Every trade, contest entry, and prize payout is verified on Solana. Transparent, trustless, and auditable by anyone.', accent: 'secondary' },
];

function FeatureRow({
  feature,
  index,
  isInView,
  reduce,
}: {
  feature: typeof FEATURES[number];
  index: number;
  isInView: boolean;
  reduce: boolean | null;
}) {
  const isPrimary = feature.accent === 'primary';
  const accentColor = isPrimary ? 'bg-primary/10' : 'bg-secondary/10';
  const iconColor = isPrimary ? 'text-primary' : 'text-secondary';

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.25, ease: 'easeOut', delay: 0.04 + index * 0.04 }}
      className={index % 2 === 0 ? 'md:pr-3' : 'md:pl-3'}
    >
      <div className="flex gap-5 p-5 rounded-xl border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all h-full">
        <div className={`shrink-0 w-11 h-11 rounded-lg ${accentColor} flex items-center justify-center mt-0.5`}>
          <feature.icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-white mb-1.5">{feature.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function FeaturesSection() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const reduce = useReducedMotion();

  return (
    <section ref={ref} className="py-28 lg:py-36 relative" id="features-section">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mb-16">
          <motion.h2
            className="font-heading font-black text-[clamp(2rem,5vw,3.5rem)] text-white leading-tight"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            Everything you need to trade fantasy sports on-chain
          </motion.h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
          {FEATURES.map((feature, i) => (
            <FeatureRow key={feature.title} feature={feature} index={i} isInView={isInView} reduce={reduce} />
          ))}
        </div>
      </div>
    </section>
  );
}
