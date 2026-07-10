'use client';

import { useRef, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CtaSection() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const reduce = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section ref={ref} className="py-28 lg:py-36" id="cta-section">
      <div className="container mx-auto px-4">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="font-heading font-black text-[clamp(2rem,5vw,4rem)] text-white leading-tight text-balance mb-6">
            Ready to play?
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-10 max-w-md mx-auto">
            Trade, compete, and win on Solana.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {mounted && connected ? (
              <Link href="/markets">
                <Button size="lg" className="h-12 px-8 text-base font-bold bg-primary text-primary-foreground hover:bg-primary/85 transition-all">
                  Launch App <ArrowRight className="ml-1.5 w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <Button size="lg" className="h-12 px-8 text-base font-bold bg-primary text-primary-foreground hover:bg-primary/85 transition-all" onClick={() => setVisible(true)}>
                Start Trading
              </Button>
            )}
            <Link href="/markets">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base font-bold border-[#454932] text-white hover:bg-[#1c1f2a] transition-all">
                Explore Markets
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
