import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { ArrowLeft, Loader2 } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export interface EdgeData {
    edge: string;
    n: number;
    winPct: number;
    roi: number;
}

export interface ValidationStats {
    activeDays: number | null;
    all: {
        count: number;
        modelBrier: number;
        mktBrier: number | null;
    };
    flagged: {
        count: number;
        winRate: number;
        roi: number;
        modelBrier: number;
        mktBrier: number | null;
    };
    edgeData: EdgeData[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const roi = payload[0].value;
        return (
            <div className="bg-[#0d1117] border border-[#3d4f5f] p-3 rounded-lg shadow-xl">
                <p className="text-[#00D4FF] text-[10px] font-bold tracking-widest mb-1 uppercase" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{label} EDGE</p>
                <p className={`text-lg font-extrabold ${roi > 0 ? 'text-[#00D4FF]' : 'text-[#FF00FF]'}`} style={{ textShadow: roi > 0 ? '0 0 10px rgba(0,212,255,0.5)' : '0 0 10px rgba(255,0,255,0.5)' }}>
                    {roi > 0 ? '+' : ''}{roi.toFixed(2)}% ROI
                </p>
                <p className="text-slate-400 text-xs mt-1 font-medium">
                    {payload[0].payload.n} bets graded
                </p>
            </div>
        );
    }
    return null;
};

export default function ValidationPage() {
    const router = useRouter();
    const currentDays = router.query.days ? parseInt(router.query.days as string, 10) : null;
    
    const { data: stats, error, isLoading } = useSWR<ValidationStats | null>(
        `/api/mlb/validation${currentDays ? `?days=${currentDays}` : ''}`,
        fetcher,
        { refreshInterval: 60000 }
    );

    const setDays = (d: number | null) => {
        if (d) {
            router.push(`/hub/MLB-ANALYTICS/validation?days=${d}`, undefined, { shallow: false });
        } else {
            router.push(`/hub/MLB-ANALYTICS/validation`, undefined, { shallow: false });
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title="Validation | MLB Analytics" 
               description="Historical graded results and model validation."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} />

           <MlbSubNav />

           <div className="p-4 w-full max-w-[680px] mx-auto box-border">
               {/* Header Section */}
               <div className="flex justify-between items-center mb-6 border-b border-[#3d4f5f] pb-4">
                   <div>
                      <Link href="/hub" className="inline-flex items-center gap-1 text-[#00D4FF] text-[13px] font-bold tracking-wide mb-3 hover:text-white transition-colors uppercase" style={{ textShadow: '0 0 10px rgba(0,212,255,0.4)' }}>
                         <ArrowLeft size={16} /> DASHBOARD
                      </Link>
                      <h1 className="m-0 mb-1 text-2xl md:text-[28px] font-extrabold text-white uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif', letterSpacing: '0.05em' }}>Model <span className="text-[#00D4FF]">Validation</span></h1>
                      <p className="m-0 text-[13px] text-slate-400">Does it beat the market? — graded backtest history</p>
                   </div>
                   <div className="text-right">
                      <div className="text-[#00D4FF] text-[11px] font-extrabold tracking-widest uppercase border border-[#00D4FF]/30 px-2 py-1 rounded bg-[#00D4FF]/10">MLB EDGE</div>
                   </div>
               </div>

               {/* Dynamic Controls */}
               <div className="flex gap-1 mb-6 p-1 bg-[#0d1117] border border-[#3d4f5f] rounded-lg w-fit shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                   <button 
                       onClick={() => setDays(7)} 
                       className={`px-4 py-2 rounded-md text-[11px] font-bold tracking-widest transition-all uppercase ${currentDays === 7 ? 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] text-[#00D4FF] border border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' : 'bg-transparent text-slate-400 hover:text-white border border-transparent'}`}
                   >
                       7 DAYS
                   </button>
                   <button 
                       onClick={() => setDays(30)} 
                       className={`px-4 py-2 rounded-md text-[11px] font-bold tracking-widest transition-all uppercase ${currentDays === 30 ? 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] text-[#00D4FF] border border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' : 'bg-transparent text-slate-400 hover:text-white border border-transparent'}`}
                   >
                       30 DAYS
                   </button>
                   <button 
                       onClick={() => setDays(null)} 
                       className={`px-4 py-2 rounded-md text-[11px] font-bold tracking-widest transition-all uppercase ${currentDays === null ? 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] text-[#00D4FF] border border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' : 'bg-transparent text-slate-400 hover:text-white border border-transparent'}`}
                   >
                       SEASON
                   </button>
               </div>

               {/* Warning Alert */}
               <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-lg p-4 mb-6 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]">
                   <div className="text-[#FFD700] text-[13px] font-extrabold tracking-widest mb-2 uppercase" style={{ textShadow: '0 0 10px rgba(255,215,0,0.4)' }}>READ THIS FIRST</div>
                   <div className="text-slate-300 text-[13px] leading-relaxed">
                       These are <strong className="text-white font-bold">historical</strong> graded results, mostly from the <strong className="text-white font-bold">pre-fix</strong> model. They show promise, not proof. CLV (closing-line value) is <strong className="text-white font-bold">not yet meaningfully measured</strong> (bet line ≈ closing line in the current capture), and the corrected model needs forward tracking before any number here is trustworthy. Treat as a baseline, not a guarantee.
                   </div>
               </div>

               {isLoading ? (
                   <div className="flex flex-col items-center justify-center py-20 bg-[#0d1117] border border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                       <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mb-4" />
                       <div className="text-[13px] font-extrabold text-slate-300 tracking-widest uppercase">LOADING STATS</div>
                   </div>
               ) : stats ? (
                   <>
                       {/* FLAGGED BETS */}
                       <div className="text-[11px] font-bold text-[#00D4FF] tracking-widest mb-3 uppercase flex items-center justify-between" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                           <span>ENGINE'S FLAGGED BETS (BET-RATED)</span>
                           <span className="bg-[#1a2332] text-slate-300 px-2 py-0.5 rounded border border-[#3d4f5f] text-[10px]">{stats.flagged.count} GRADED</span>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
                           <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-4 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                               <div className="text-[10px] font-bold text-slate-400 tracking-wider mb-2 uppercase">WIN RATE</div>
                               <div className="text-2xl font-extrabold text-[#00D4FF]" style={{ textShadow: '0 0 10px rgba(0,212,255,0.5)' }}>
                                   {stats.flagged.winRate.toFixed(1)}%
                               </div>
                           </div>
                           <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-4 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                               <div className="text-[10px] font-bold text-slate-400 tracking-wider mb-2 uppercase">FLAT-STAKE ROI</div>
                               <div className={`text-2xl font-extrabold ${stats.flagged.roi > 0 ? 'text-[#00D4FF]' : stats.flagged.roi < 0 ? 'text-[#FF00FF]' : 'text-white'}`} style={{ textShadow: stats.flagged.roi > 0 ? '0 0 10px rgba(0,212,255,0.5)' : stats.flagged.roi < 0 ? '0 0 10px rgba(255,0,255,0.5)' : 'none' }}>
                                   {stats.flagged.roi > 0 ? '+' : ''}{stats.flagged.roi.toFixed(2)}%
                               </div>
                           </div>
                           <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-4 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                               <div className="text-[10px] font-bold text-slate-400 tracking-wider mb-2 uppercase">MODEL VS MKT BRIER</div>
                               <div className="text-2xl font-extrabold text-[#00D4FF]" style={{ textShadow: '0 0 10px rgba(0,212,255,0.5)' }}>
                                   {stats.flagged.modelBrier.toFixed(3)}
                               </div>
                               <div className="text-[10px] text-slate-500 mt-1 font-medium">
                                   mkt {stats.flagged.mktBrier !== null ? stats.flagged.mktBrier.toFixed(3) : 'N/A'} · lower = sharper
                               </div>
                           </div>
                       </div>

                       {/* ALL GRADED OUTCOMES */}
                       <div className="text-[11px] font-bold text-[#00D4FF] tracking-widest mb-3 uppercase flex items-center justify-between" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                           <span>ALL GRADED OUTCOMES</span>
                           <span className="bg-[#1a2332] text-slate-300 px-2 py-0.5 rounded border border-[#3d4f5f] text-[10px]">{stats.all.count} GRADED</span>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                           <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-4 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                               <div className="text-[10px] font-bold text-slate-400 tracking-wider mb-2 uppercase">MODEL BRIER</div>
                               <div className="text-2xl font-extrabold text-[#00D4FF]" style={{ textShadow: '0 0 10px rgba(0,212,255,0.5)' }}>
                                   {stats.all.modelBrier.toFixed(4)}
                               </div>
                               <div className="text-[11px] text-slate-500 mt-1 font-medium">
                                   prediction accuracy (0.25 = coinflip)
                               </div>
                           </div>
                           <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-4 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                               <div className="text-[10px] font-bold text-slate-400 tracking-wider mb-2 uppercase">MARKET BRIER</div>
                               <div className="text-2xl font-extrabold text-white">
                                   {stats.all.mktBrier !== null ? stats.all.mktBrier.toFixed(4) : 'N/A'}
                               </div>
                               <div className="text-[11px] text-slate-500 mt-1 font-medium">
                                   the no-vig closing line
                               </div>
                           </div>
                       </div>
                       <div className="text-[12px] text-slate-400 mb-8 border-l-2 border-[#00D4FF] pl-3 py-1 font-medium bg-[#00D4FF]/5 rounded-r">
                           The model's probabilities are more accurate than the no-vig market here (lower Brier) — a real skill signal.
                       </div>

                       {/* ROI BY EDGE SIZE - VISUALIZATION */}
                       <div className="text-[11px] font-bold text-[#00D4FF] tracking-widest mb-3 uppercase flex items-center justify-between" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                           <span>ROI BY EDGE SIZE</span>
                           <span className="text-[10px] text-slate-400 uppercase font-medium border border-[#3d4f5f] px-2 py-0.5 rounded bg-[#1a2332]">Flat-stake ROI %</span>
                       </div>
                       
                       <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl mb-4 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] pt-6 pb-2 px-2 overflow-hidden">
                           {/* Metal Frame Details */}
                           <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]"></div>
                           <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]"></div>
                           
                           {/* Grid Background */}
                           <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a2332_1px,transparent_1px),linear-gradient(to_bottom,#1a2332_1px,transparent_1px)] bg-[size:1rem_1rem] [mask-image:linear-gradient(to_bottom,white,transparent_80%)] opacity-50 pointer-events-none"></div>
                           
                           <div className="h-[220px] w-full relative z-10">
                               <ResponsiveContainer width="100%" height="100%">
                                   <BarChart
                                       data={stats.edgeData}
                                       margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                   >
                                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a2332" />
                                       <XAxis 
                                           dataKey="edge" 
                                           axisLine={false} 
                                           tickLine={false} 
                                           tick={{ fontSize: 10, fill: '#64748b', fontWeight: 800 }} 
                                           dy={10}
                                       />
                                       <YAxis 
                                           axisLine={false} 
                                           tickLine={false} 
                                           tick={{ fontSize: 10, fill: '#64748b' }} 
                                           tickFormatter={(val) => `${val}%`}
                                       />
                                       <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1a2332', opacity: 0.5 }} />
                                       <ReferenceLine y={0} stroke="#3d4f5f" strokeWidth={2} />
                                       <Bar dataKey="roi" radius={[4, 4, 4, 4]} barSize={40}>
                                           {stats.edgeData.map((entry, index) => (
                                               <Cell key={`cell-${index}`} fill={entry.roi > 0 ? '#00D4FF' : '#FF00FF'} />
                                           ))}
                                       </Bar>
                                   </BarChart>
                               </ResponsiveContainer>
                           </div>
                       </div>
                       
                       {/* Data Table */}
                       <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden mb-6 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                           <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr] py-3 px-4 border-b-2 border-[#3d4f5f] bg-[#1a2332] text-[11px] font-bold text-slate-400 tracking-widest uppercase">
                               <div>EDGE THRESHOLD</div>
                               <div className="text-right">BETS</div>
                               <div className="text-right">WIN%</div>
                               <div className="text-right">ROI</div>
                           </div>
                           {stats.edgeData.map((row, idx) => (
                               <div key={row.edge} className={`grid grid-cols-[2fr_1fr_1fr_1.5fr] py-3 px-4 text-[13px] hover:bg-[#1a2332] transition-colors ${idx < stats.edgeData.length - 1 ? 'border-b border-[#1a2332]' : ''}`}>
                                   <div className="font-bold flex items-center gap-2 text-white">
                                       <div className={`w-2 h-2 rounded-full ${row.roi > 0 ? 'bg-[#00D4FF] shadow-[0_0_5px_rgba(0,212,255,0.8)]' : row.roi < 0 ? 'bg-[#FF00FF] shadow-[0_0_5px_rgba(255,0,255,0.8)]' : 'bg-slate-500'}`}></div>
                                       {row.edge}
                                   </div>
                                   <div className="text-right text-slate-300 font-medium">{row.n}</div>
                                   <div className="text-right text-slate-300 font-medium">{row.winPct}%</div>
                                   <div className={`text-right font-extrabold ${row.roi > 0 ? 'text-[#00D4FF]' : row.roi < 0 ? 'text-[#FF00FF]' : 'text-white'}`} style={{ textShadow: row.roi > 0 ? '0 0 5px rgba(0,212,255,0.5)' : row.roi < 0 ? '0 0 5px rgba(255,0,255,0.5)' : 'none' }}>
                                       {row.roi > 0 ? '+' : ''}{row.roi.toFixed(2)}%
                                   </div>
                               </div>
                           ))}
                       </div>
                       
                       <div className="text-[12px] text-slate-300 leading-relaxed mb-8 bg-[#1a2332] p-4 rounded-lg border border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                           <strong className="text-[#00D4FF] uppercase tracking-widest text-[11px] block mb-2" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Analytical Note</strong>
                           Note the <strong className="text-white">non-monotonic</strong> pattern — the 7–10 bucket lost money while 5–7 and 10+ won big. The 10+ bucket is the old moneyline quantization artifact (now fixed). This is exactly why ranking by raw edge points was unreliable and the <strong className="text-white">Bet Score</strong> (EV + confidence) replaced it.
                       </div>

                       <div className="text-[11px] text-slate-500 text-center leading-relaxed max-w-[400px] mx-auto border-t border-[#3d4f5f] pt-6 font-medium">
                           Win-rate breakeven at -110 is ~52.4%.<br/>
                           Brier score represents squared error of the probability vs outcome — lower is sharper, 0.25 is a coin-flip.<br />
                           <span className="mt-3 block font-bold uppercase tracking-widest text-slate-400">Analysis only — not betting advice.</span>
                       </div>
                   </>
               ) : (
                   <div className="flex flex-col items-center justify-center py-20 bg-[#0d1117] border border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                       <div className="w-12 h-12 rounded-full bg-[#1a2332] flex items-center justify-center mb-4 border border-[#3d4f5f]">
                           <div className="w-6 h-6 border-2 border-[#3d4f5f] border-t-[#00D4FF] rounded-full animate-spin"></div>
                       </div>
                       <div className="text-[13px] font-extrabold text-slate-300 tracking-widest uppercase mb-1">NO DATA FOUND</div>
                       <div className="text-xs text-slate-500 max-w-[250px] text-center font-medium">
                           No graded validation data is available for this timeframe. Try selecting a broader date range.
                       </div>
                   </div>
               )}

           </div>
           <BottomNavBar />
        </div>
    );
}
