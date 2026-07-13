'use client';

const STEPS = [
  {
    title: 'Trade',
    desc: 'Analyze high-frequency data feeds. Buy and sell fractionalized athlete tokens dynamically priced by live performance metrics and market liquidity.',
    visual: 'trade',
  },
  {
    title: 'Build',
    desc: 'Construct optimal lineups within strict salary cap parameters. Leverage quantitative research tools to identify mispriced assets in the arena.',
    visual: 'build',
  },
  {
    title: 'Win',
    desc: "Enter high-stakes contests. Your portfolio's yield is determined by real-world athletic output settled instantly via smart contracts. Payouts in USDC.",
    visual: 'win',
  },
];

function TradeChart() {
  return (
    <svg viewBox="0 0 200 80" className="w-full h-full" fill="none">
      {[0, 1, 2, 3].map((i) => (
        <line key={`h${i}`} x1="0" y1={20 + i * 16} x2="200" y2={20 + i * 16} stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
      ))}
      <path
        d="M10 68 Q25 65 40 70 Q55 40 70 45 Q85 25 100 30 Q115 35 130 20 Q145 15 160 22 Q175 18 190 10"
        stroke="#d2f000"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M10 68 Q25 65 40 70 Q55 40 70 45 Q85 25 100 30 Q115 35 130 20 Q145 15 160 22 Q175 18 190 10 L190 80 L10 80 Z"
        fill="url(#tradeGrad)"
        opacity="0.15"
      />
      {[
        { x: 25, h: 24, l: 16, o: 20, c: 18 },
        { x: 55, h: 14, l: 6, o: 10, c: 8 },
        { x: 95, h: 18, l: 10, o: 14, c: 12 },
        { x: 135, h: 10, l: 4, o: 6, c: 8 },
        { x: 170, h: 12, l: 4, o: 6, c: 8 },
      ].map((c, i) => (
        <g key={i}>
          <line x1={c.x} y1={80 - c.h} x2={c.x} y2={80 - c.l} stroke="#d2f000" strokeWidth="1.5" strokeOpacity="0.5" />
          <rect x={c.x - 3} y={80 - Math.max(c.o, c.c)} width="6" height={Math.abs(c.c - c.o) || 1} fill={c.c >= c.o ? '#00eefc' : '#ffb4ab'} rx="1" />
        </g>
      ))}
      <defs>
        <linearGradient id="tradeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d2f000" />
          <stop offset="100%" stopColor="#d2f000" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function LineupVisual() {
  return (
    <svg viewBox="0 0 200 80" className="w-full h-full" fill="none">
      {[
        { x: 30, y: 35, label: 'FW' },
        { x: 80, y: 25, label: 'MF' },
        { x: 80, y: 45, label: 'MF' },
        { x: 130, y: 20, label: 'DF' },
        { x: 130, y: 40, label: 'DF' },
        { x: 130, y: 55, label: 'DF' },
        { x: 170, y: 35, label: 'GK' },
      ].map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="7" stroke="#d3fbff" strokeWidth="1" strokeOpacity="0.3" fill="#d3fbff" fillOpacity="0.08" />
          <text x={p.x} y={p.y + 1.5} textAnchor="middle" fill="#d3fbff" fillOpacity="0.6" fontSize="6" fontWeight="700" fontFamily="monospace">
            {p.label}
          </text>
        </g>
      ))}
      <line x1="100" y1="10" x2="100" y2="65" stroke="#d3fbff" strokeOpacity="0.04" strokeWidth="1" strokeDasharray="3 3" />
      <line x1="30" y1="35" x2="80" y2="25" stroke="#d3fbff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="30" y1="35" x2="80" y2="45" stroke="#d3fbff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="80" y1="25" x2="130" y2="20" stroke="#d3fbff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="80" y1="25" x2="130" y2="40" stroke="#d3fbff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="80" y1="45" x2="130" y2="40" stroke="#d3fbff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="80" y1="45" x2="130" y2="55" stroke="#d3fbff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="130" y1="20" x2="170" y2="35" stroke="#d3fbff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="130" y1="40" x2="170" y2="35" stroke="#d3fbff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="130" y1="55" x2="170" y2="35" stroke="#d3fbff" strokeOpacity="0.08" strokeWidth="1" />
      <rect x="180" y="20" width="18" height="30" rx="2" stroke="#d3fbff" strokeOpacity="0.08" strokeWidth="1" fill="none" />
      <rect x="12" y="8" width="176" height="58" rx="8" stroke="#d3fbff" strokeOpacity="0.03" strokeWidth="1" fill="none" />
    </svg>
  );
}

function PrizeVisual() {
  return (
    <svg viewBox="0 0 200 80" className="w-full h-full" fill="none">
      <path
        d="M100 20 L100 45 M85 30 L100 35 L115 30 M88 45 Q88 55 100 58 Q112 55 112 45"
        stroke="#d2f000"
        strokeWidth="1.5"
        strokeOpacity="0.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M80 25 Q80 18 90 18 L110 18 Q120 18 120 25 Q120 32 110 32 Q105 32 100 30 Q95 32 90 32 Q80 32 80 25Z"
        stroke="#d2f000"
        strokeWidth="1"
        strokeOpacity="0.3"
        fill="#d2f000"
        fillOpacity="0.06"
      />
      <path d="M80 25 Q72 25 72 30 Q72 35 80 32" stroke="#d2f000" strokeWidth="1" strokeOpacity="0.2" fill="none" />
      <path d="M120 25 Q128 25 128 30 Q128 35 120 32" stroke="#d2f000" strokeWidth="1" strokeOpacity="0.2" fill="none" />
      {[
        { x: 95, y: 14, s: 2 },
        { x: 105, y: 14, s: 2 },
        { x: 100, y: 12, s: 2 },
      ].map((star, i) => (
        <text key={i} x={star.x} y={star.y} textAnchor="middle" fill="#d2f000" fillOpacity="0.15" fontSize="8" fontFamily="monospace">✦</text>
      ))}
      {[
        { x: 40, y: 55 },
        { x: 55, y: 52 },
        { x: 48, y: 62 },
        { x: 145, y: 55 },
        { x: 160, y: 52 },
        { x: 152, y: 62 },
      ].map((coin, i) => (
        <circle key={i} cx={coin.x} cy={coin.y} r="5" stroke="#d2f000" strokeWidth="0.5" strokeOpacity={0.15 + i * 0.03} fill="#d2f000" fillOpacity={0.03 + i * 0.01} />
      ))}
      {[
        { x: 40, y: 56 },
        { x: 55, y: 53 },
        { x: 48, y: 63 },
        { x: 145, y: 56 },
        { x: 160, y: 53 },
        { x: 152, y: 63 },
      ].map((d, i) => (
        <text key={i} x={d.x} y={d.y} textAnchor="middle" fill="#d2f000" fillOpacity={0.2 + i * 0.03} fontSize="4" fontWeight="700" fontFamily="monospace">$</text>
      ))}
      <circle cx="100" cy="65" r="1" fill="#d2f000" fillOpacity="0.2" />
      <circle cx="96" cy="67" r="0.7" fill="#d2f000" fillOpacity="0.1" />
      <circle cx="104" cy="67" r="0.7" fill="#d2f000" fillOpacity="0.1" />
    </svg>
  );
}

export default function HowItWorks() {
  return (
    <section className="w-full py-20 lg:py-24 px-6 flex justify-center">
      <div className="w-full max-w-[1320px]">
        <div className="mb-12">
          <p className="font-mono text-[12px] tracking-[0.02em] font-[500] text-muted-foreground mb-2 uppercase">Execution Protocol</p>
          <h2
            className="font-heading font-[700] text-white"
            style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', lineHeight: '1.1', letterSpacing: '-0.02em' }}
          >
            How It Works
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((step, idx) => (
            <div
              key={idx}
              className="bg-card p-7 flex flex-col border border-border hover:border-primary/30 transition-colors group"
            >
              <h3 className="font-heading text-[22px] leading-[28px] font-[600] text-white mb-3 group-hover:text-primary transition-colors">
                {step.title}
              </h3>
              <p className="font-sans text-[15px] leading-[24px] font-[400] text-muted-foreground flex-grow">
                {step.desc}
              </p>

              <div className="h-[88px] w-full bg-card border border-border relative overflow-hidden mt-5">
                <div className="absolute inset-0 flex items-center justify-center p-3">
                  {step.visual === 'trade' && <TradeChart />}
                  {step.visual === 'build' && <LineupVisual />}
                  {step.visual === 'win' && <PrizeVisual />}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
