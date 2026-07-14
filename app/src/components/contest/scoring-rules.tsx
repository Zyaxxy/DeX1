'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

const SCORING_DATA = [
  { event: 'Goal', gk: 40, def: 30, mid: 20, fwd: 10 },
  { event: 'Assist', gk: 5, def: 5, mid: 5, fwd: 5 },
  { event: 'Save', gk: 5, def: '-', mid: '-', fwd: '-' },
  { event: 'Clean Sheet', gk: 10, def: 10, mid: '-', fwd: '-' },
];

export function ScoringRules({ compact = false }: { compact?: boolean }) {
  const [isOpen, setIsOpen] = useState(!compact);

  return (
    <div className="border border-[#454932] bg-[#1c1f2a] overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-[#181b25]/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-primary" />
          <span className="font-heading text-[14px] font-[600] text-white">How Scoring Works</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-[#c6c9ab]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#c6c9ab]" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px]">
                  <thead>
                    <tr className="border-b border-[#454932]">
                      <th className="px-3 py-2 text-left font-mono text-[10px] tracking-[0.02em] text-[#c6c9ab] uppercase">Event</th>
                      <th className="px-3 py-2 text-center font-mono text-[10px] tracking-[0.02em] text-amber-400 uppercase">GK</th>
                      <th className="px-3 py-2 text-center font-mono text-[10px] tracking-[0.02em] text-blue-400 uppercase">DEF</th>
                      <th className="px-3 py-2 text-center font-mono text-[10px] tracking-[0.02em] text-emerald-400 uppercase">MID</th>
                      <th className="px-3 py-2 text-center font-mono text-[10px] tracking-[0.02em] text-rose-400 uppercase">FWD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCORING_DATA.map((row, i) => (
                      <tr key={row.event} className="border-b border-[#454932]/50">
                        <td className="px-3 py-2.5 font-mono text-[12px] text-white">{row.event}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-[12px] font-[700] text-amber-400">{row.gk}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-[12px] font-[700] text-blue-400">{row.def}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-[12px] font-[700] text-emerald-400">{row.mid}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-[12px] font-[700] text-rose-400">{row.fwd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 font-mono text-[10px] text-[#c6c9ab]">
                Points are awarded based on real-world match events. Clean sheet bonus is awarded when the opponent scores 0.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}