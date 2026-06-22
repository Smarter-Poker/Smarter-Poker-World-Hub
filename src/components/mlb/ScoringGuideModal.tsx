import React, { useEffect } from 'react';
import { X, Info, TrendingUp, AlertTriangle, ShieldCheck, Scale, Target } from 'lucide-react';

export function ScoringGuideModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tiers = [
    { name: 'ELITE', range: '82 - 100', color: 'text-[var(--neon-cyan)]', border: 'border-[var(--neon-cyan)]', desc: 'Elite value backed by clean inputs. Hammer it.' },
    { name: 'STRONG', range: '68 - 81', color: 'text-emerald-400', border: 'border-emerald-500', desc: 'Strong edge with solid confidence. Primary targets.' },
    { name: 'LEAN', range: '52 - 67', color: 'text-sky-400', border: 'border-sky-600', desc: 'Real but modest value. Size down or use in SGPs.' },
    { name: 'THIN', range: '38 - 51', color: 'text-amber-500', border: 'border-amber-600', desc: 'Barely beats the juice. Only play if you have conviction.' },
    { name: 'PASS', range: '0 - 37', color: 'text-slate-400', border: 'border-[#3d4f5f]', desc: 'Negative or nonexistent value. Do not bet.' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#000000] opacity-80 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-gradient-to-b from-[#131e2e] to-[#0d1117] border-[3px] border-[#3d4f5f] rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_15px_40px_rgba(0,0,0,0.8)] p-5">
        
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#2a3a4a]">
          <div className="flex items-center gap-2">
            <Info className="text-[#00D4FF]" size={20} />
            <h2 className="text-[26px] font-black text-white capitalize tracking-widest" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
              Scoring System
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-[#7a8a9a] hover:text-white hover:bg-[#2a3a4a] transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-[17px] text-slate-300 mb-3 leading-relaxed">
              Our MLB model generates a <span className="font-bold text-white">0-100 Bet Score</span> that perfectly balances the <span className="text-[#00D4FF] font-semibold">Expected Value (EV)</span> against <span className="text-emerald-400 font-semibold">Confidence Factors</span>. The higher the score, the stronger the bet.
            </p>
            
            <div className="bg-[#0a0a15] border border-[#2a3a4a] rounded-md p-3 mb-4 space-y-3 shadow-inner">
              <div className="flex items-start gap-3">
                <TrendingUp size={16} className="text-[#00D4FF] mt-0.5 shrink-0" />
                <div>
                  <div className="text-[14px] font-black capitalize text-white tracking-wider">Expected Value (EV)</div>
                  <div className="text-[14px] text-slate-400">The true mathematical advantage based on the odds offered.</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[14px] font-black capitalize text-white tracking-wider">Confidence Factors</div>
                  <div className="text-[14px] text-slate-400">We haircut edges if lineups aren't confirmed, if it's a high-variance spot, or if it strays too far from sharp market consensus.</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[18px] font-black text-[#7a8a9a] capitalize tracking-widest mb-3 flex items-center gap-2">
              <Scale size={16} /> Tier Scale
            </h3>
            <div className="space-y-2">
              {tiers.map((t) => (
                <div key={t.name} className={`flex items-center justify-between bg-[#0a0a15] border border-[#1a2530] rounded-sm p-2.5 ${t.border}`}>
                  <div className="flex items-center gap-3">
                    <div className={`text-[26px] font-black leading-none ${t.color}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                      {t.name}
                    </div>
                  </div>
                  <div className="text-[18px] font-black text-slate-300" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                    {t.range}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-[#1a2332] hover:bg-[#2a3a4a] border border-[#3d4f5f] rounded-sm py-2 text-[18px] font-black text-white capitalize tracking-widest transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
