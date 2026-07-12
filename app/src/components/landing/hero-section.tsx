import Link from 'next/link';
import ShaderBackground from './shader-background';

export default function HeroSection() {
  return (
    <section className="relative w-full h-[80vh] min-h-[600px] flex items-center justify-center overflow-hidden">
      <ShaderBackground />

      <div className="absolute inset-0 bg-gradient-to-t from-[#0f131d] via-transparent to-transparent z-10 pointer-events-none" />

      <div className="relative z-20 w-full max-w-[1440px] px-6 flex flex-col items-start justify-center">
        <h1
          className="font-heading font-[700] text-white max-w-4xl mb-6 tracking-tighter uppercase"
          style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.5rem)', lineHeight: '1', letterSpacing: '-0.04em' }}
        >
          The Arena for On-Chain Athletes.
        </h1>

        <p className="text-[18px] leading-[28px] font-[400] text-[#c6c9ab] max-w-2xl mb-10">
          Trade athlete tokens on Solana. Compete in fantasy contests. Win USDC.
        </p>

        <div className="flex flex-wrap gap-4">
          <Link
            href="/markets"
            className="bg-primary text-primary-foreground font-mono text-[14px] leading-[20px] font-[700] px-8 py-4 hover:opacity-90 transition-opacity uppercase tracking-wider"
          >
            Launch App
          </Link>
          <Link
            href="/markets"
            className="border border-border text-white font-mono text-[14px] leading-[20px] font-[500] px-8 py-4 hover:bg-[#1c1f2a] transition-colors uppercase tracking-wider"
          >
            View Markets
          </Link>
        </div>
      </div>
    </section>
  );
}
