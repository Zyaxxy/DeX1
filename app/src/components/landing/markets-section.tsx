'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

const ATHLETES = [
  { name: 'Lionel Messi', role: 'FWD', price: '$5.42', change: '+12.4%', positive: true, gradient: 'from-rose-600 to-orange-500', initials: 'LM' },
  { name: 'Jude Bellingham', role: 'MID', price: '$4.89', change: '+8.2%', positive: true, gradient: 'from-emerald-600 to-cyan-500', initials: 'JB' },
  { name: 'Virgil van Dijk', role: 'DEF', price: '$2.15', change: '-1.5%', positive: false, gradient: 'from-sky-600 to-blue-500', initials: 'VD' },
  { name: 'Kylian Mbapp', role: 'FWD', price: '$6.10', change: '+4.3%', positive: true, gradient: 'from-purple-600 to-pink-500', initials: 'KM' },
  { name: 'Thibaut Courtois', role: 'GK', price: '$1.85', change: '+0.8%', positive: true, gradient: 'from-amber-600 to-yellow-500', initials: 'TC' },
  { name: 'Bukayo Saka', role: 'MID', price: '$3.20', change: '-2.1%', positive: false, gradient: 'from-red-600 to-rose-500', initials: 'BS' },
];

export default function MarketsSection() {
  const titleRef = useRef<HTMLDivElement>(null);
  const titleInView = useInView(titleRef, { once: true, margin: '-80px' });
  const sliderRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  return (
    <section className="py-28 lg:py-36 relative overflow-hidden" id="markets-section">
      <div className="container mx-auto px-4">
        <div ref={titleRef} className="max-w-2xl mb-16">
          <motion.h2
            className="font-heading font-black text-[clamp(2rem,5vw,3.5rem)] text-white leading-tight"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={titleInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            Markets
          </motion.h2>
          <motion.p
            className="text-base text-muted-foreground leading-relaxed mt-4 max-w-xl"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={titleInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.2, ease: 'easeOut', delay: 0.08 }}
          >
            Trade the world&apos;s top athletes on automated bonding curves. Prices move with real performance.
          </motion.p>
        </div>
      </div>

      <div className="overflow-hidden px-4">
        <motion.div
          ref={sliderRef}
          className="flex gap-5 cursor-grab active:cursor-grabbing"
          drag="x"
          dragConstraints={{ left: -800, right: 0 }}
          dragElastic={0.05}
        >
          {ATHLETES.map((athlete, i) => {
            const animationProps = reduce ? {} : {
              initial: { opacity: 0, y: 30 },
              whileInView: { opacity: 1, y: 0 },
              viewport: { once: true },
              transition: { duration: 0.25, ease: 'easeOut' as const, delay: i * 0.05 },
            };

            return (
              <motion.div
                key={athlete.name}
                className="shrink-0 w-[clamp(16rem,26vw,22rem)] h-[clamp(22rem,32vw,28rem)] rounded-2xl overflow-hidden relative group"
                {...animationProps}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${athlete.gradient} transition-transform duration-500 group-hover:scale-105`} />

                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[8rem] font-black text-white/[0.06] select-none leading-none">
                    {athlete.initials}
                  </span>
                </div>

                <div className="absolute top-0 inset-x-0 p-5 flex justify-between items-start z-10">
                  <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-white/30 text-white bg-white/10">
                    {athlete.role}
                  </span>
                  <span className="text-sm font-semibold text-white/80">
                    {athlete.name.split(' ')[0]}
                  </span>
                </div>

                <div className="absolute bottom-0 inset-x-0 p-5 z-10">
                  <div className="bg-black/50 backdrop-blur-sm rounded-xl p-4 border border-white/[0.06]">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-xs text-white/60 uppercase tracking-wider font-medium mb-1">{athlete.name}</p>
                        <p className="text-2xl font-black text-white font-mono">{athlete.price}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${athlete.positive ? 'text-positive' : 'text-negative'}`}>
                          {athlete.change}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
