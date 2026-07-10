'use client';

import { Trophy } from 'lucide-react';

const STEPS = [
  {
    title: 'Trade',
    desc: 'Analyze high-frequency data feeds. Buy and sell fractionalized athlete tokens dynamically priced by live performance metrics and market liquidity.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBSqgP8rrM55clDLAGKj6r1Eyitdua4zGr97zQrq6cpXgtOCw5NPaIA3F7LPWwLTK7_nxg6mHxGyhgzNpKPBI8pR37On7wyCckQ1s2mAB0KmbDyti4Fhr5uOOQlQvZVHmRvHKFs0dovLtHMECuQfuhzqsEWkufEXHDcTFsyInsGHxDXGeAbZg7V7oIdaGPX9nziUGb9YSiDg2vK-jzsIBh79eZrBHXjpBFoOdfOVqd2jMbHHfceEiOcR12YvhFwXQXLgB0Ic94n5DDy',
    alt: 'A stylized, high-contrast black and white macro shot of a stock chart candlestick pattern with a single bright yellow line piercing upwards, evoking a sense of aggressive, precise financial trading in a dark digital space.',
    visual: 'image',
  },
  {
    title: 'Build',
    desc: 'Construct optimal lineups within strict salary cap parameters. Leverage quantitative research tools to identify mispriced assets in the arena.',
    visual: 'bars',
  },
  {
    title: 'Win',
    desc: "Enter high-stakes contests. Your portfolio's yield is determined by real-world athletic output settled instantly via smart contracts. Payouts in USDC.",
    visual: 'trophy',
  },
];

export default function HowItWorks() {
  return (
    <section className="w-full py-24 px-6 flex justify-center">
      <div className="w-full max-w-[1440px]">
        <div className="mb-16">
          <p className="font-mono text-[11px] tracking-[0.02em] font-[500] text-[#c6c9ab] mb-2 uppercase">Execution Protocol</p>
          <h2
            className="font-heading font-[700] text-white"
            style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', lineHeight: '1.1', letterSpacing: '-0.02em' }}
          >
            How It Works
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((step, idx) => (
            <div
              key={idx}
              className="bg-[#1c1f2a] p-8 flex flex-col border border-[#454932] hover:border-primary/30 transition-colors group"
            >
              <h3 className="font-heading text-[24px] leading-[28px] font-[600] text-white mb-4 group-hover:text-primary transition-colors">
                {step.title}
              </h3>
              <p className="font-sans text-[16px] leading-[24px] font-[400] text-[#c6c9ab] flex-grow">
                {step.desc}
              </p>

              {step.visual === 'image' && step.image && (
                <div className="h-24 w-full bg-[#181b25] border border-[#454932] relative overflow-hidden flex items-end mt-6">
                  <div
                    className="bg-cover bg-center w-full h-full opacity-40"
                    style={{ backgroundImage: `url('${step.image}')` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#181b25] to-transparent" />
                </div>
              )}

              {step.visual === 'bars' && (
                <div className="h-24 w-full bg-[#181b25] border border-[#454932] relative overflow-hidden flex items-end p-4 mt-6">
                  <div className="w-full flex gap-2">
                    <div className="flex-1 bg-[#262a34] h-16" />
                    <div className="flex-1 bg-[#262a34] h-24" />
                    <div className="flex-1 bg-primary/20 h-20" />
                  </div>
                </div>
              )}

              {step.visual === 'trophy' && (
                <div className="h-24 w-full bg-[#181b25] border border-[#454932] relative overflow-hidden flex items-center justify-center mt-6">
                  <Trophy className="text-primary/30 group-hover:text-primary/60 transition-colors" size={48} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
