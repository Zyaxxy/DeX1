import Link from 'next/link';
import ShaderBackground from './shader-background';

export default function HeroSection() {
  return (
    <section className="relative w-full min-h-[70vh] flex items-center justify-center overflow-hidden">
      <ShaderBackground />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0f131d] via-transparent to-transparent z-10 pointer-events-none" />
      <div className="relative z-20 w-full max-w-[1200px] mx-auto px-6 flex flex-col items-start justify-center">
        <h1
          className="font-heading font-[700] text-white max-w-3xl mb-5 tracking-tighter uppercase"
          style={{ fontSize: 'clamp(2rem, 4.5vw, 3.75rem)', lineHeight: '1', letterSpacing: '-0.04em' }}
        >
          The Arena for On-Chain Athletes.
        </h1>
        <p className="text-[16px] leading-[26px] font-[400] text-muted-foreground max-w-xl mb-8">
          Trade athlete tokens on Solana. Compete in fantasy contests. Win USDC.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/markets"
            className="bg-primary text-primary-foreground font-mono text-[13px] leading-[18px] font-[700] px-7 py-3.5 hover:opacity-90 transition-opacity uppercase tracking-wider"
          >
            Launch App
          </Link>
          <Link
            href="/markets"
            className="border border-border text-white font-mono text-[13px] leading-[18px] font-[500] px-7 py-3.5 hover:bg-[#1c1f2a] transition-colors uppercase tracking-wider"
          >
            View Markets
          </Link>
        </div>
      </div>
    </section>
  );
}
