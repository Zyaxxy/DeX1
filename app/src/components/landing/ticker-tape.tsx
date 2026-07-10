'use client';

const TICKER_ITEMS = [
  { sport: 'BASKETBALL', name: 'STEPH', change: '+4.2%', positive: true },
  { sport: 'BASEBALL', name: 'OHTANI', change: '-1.5%', positive: false },
  { sport: 'FOOTBALL', name: 'MAHOMES', change: '+2.1%', positive: true },
  { sport: 'SOCCER', name: 'MESSI', change: '-0.8%', positive: false },
  { sport: 'TENNIS', name: 'ALCARAZ', change: '+5.5%', positive: true },
  { sport: 'GOLF', name: 'SCHEFFLER', change: '0.0%', positive: true },
];

export default function TickerTape() {
  return (
    <div className="w-full bg-[#31353f] border-y border-[#454932] h-12 flex items-center overflow-hidden">
      <div className="w-full overflow-hidden whitespace-nowrap box-border">
        <div className="inline-block animate-marquee font-mono text-[14px] leading-[20px] font-[700] text-[#dfe2f0]">
          {[...Array(2)].map((_, setIdx) =>
            TICKER_ITEMS.map((item, i) => (
              <span key={`${setIdx}-${i}`} className="inline-block px-8">
                <span className="text-[#c6c9ab] mr-2 font-[500]">{item.sport}</span>
                {item.name}
                <span className={`ml-1 ${item.positive ? 'text-[#00eefc]' : 'text-[#ffb4ab]'}`}>
                  {item.change}
                </span>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
