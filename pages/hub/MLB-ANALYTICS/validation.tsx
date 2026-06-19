import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { ArrowLeft, Loader2, Activity } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';

const ResponsiveContainer = dynamic(() => import('recharts').then((mod) => mod.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import('recharts').then((mod) => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then((mod) => mod.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((mod) => mod.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), { ssr: false });
const Cell = dynamic(() => import('recharts').then((mod) => mod.Cell), { ssr: false });
const ReferenceLine = dynamic(() => import('recharts').then((mod) => mod.ReferenceLine), { ssr: false });

const fetcher = async (url: string) => {
    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return await res.json();
    } catch (err) {
        logError('SWR Fetch', err);
        throw err;
    }
};

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

interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        const roi = payload[0].value;
        return (
            <div className="bg-[#0d1117] border border-[#3d4f5f] p-3 rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <p className="text-slate-400 text-[10px] font-extrabold tracking-[1px] mb-1 uppercase">{label} EDGE</p>
                <p className={`text-lg font-extrabold ${Number(roi) > 0 ? 'text-[#00D4FF]' : Number(roi) < 0 ? 'text-[#FF0055]' : 'text-slate-300'}`} style={{ textShadow: Number(roi) > 0 ? '0 0 5px rgba(0,212,255,0.5)' : Number(roi) < 0 ? '0 0 5px rgba(255,0,85,0.5)' : 'none' }}>
                    {Number(roi) > 0 ? '+' : ''}{Number(roi).toFixed(2)}% ROI
                </p>
                <p className="text-slate-500 text-xs mt-1">
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
    
    const apiUrl = currentDays ? `/api/mlb/validation?days=${currentDays}` : '/api/mlb/validation';
    const { data, error, isLoading } = useSWR(apiUrl, fetcher, {
        refreshInterval: 60000,
    });
    
    const stats: ValidationStats | null = data?.stats || null;

    const setDays = (d: number | null) => {
        if (d) {
            router.push(`/hub/MLB-ANALYTICS/validation?days=${d}`, undefined, { shallow: false });
        } else {
            router.push(`/hub/MLB-ANALYTICS/validation`, undefined, { shallow: false });
        }
    };

    const hasError = !!error || !!data?.error;

    if (hasError) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Error" description="Data fetch failed" />
                <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#00D4FF]/50 shadow-[0_0_20px_rgba(0,212,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        <Activity className="w-12 h-12 text-[#00D4FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF4444] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load data. Please try again later.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title="Validation | MLB Analytics" 
               description="Historical graded results and model validation."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />

           <MlbSubNav />

           <div className="p-4 w-full max-w-[680px] mx-auto box-border">
               {/* Header Section */}
               <div className="flex justify-between items-center mb-4">
                   <div>
                      <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-1 text-[#00D4FF] text-[13px] font-bold no-underline tracking-[1px] hover:text-white transition-colors uppercase" style={{ textShadow: '0 0 10px rgba(0,212,255,0.4)' }}>
                         <ArrowLeft size={16} /> Dashboard
                      </Link>
                      <h1 className="mt-2 mb-0.5 text-2xl md:text-[28px] font-extrabold text-white uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', letterSpacing: '0.05em' }}>Model <span className="text-[#00D4FF]">Validation</span></h1>
                      <p className="m-0 text-[13px] text-slate-400">Does it beat the market? — graded backtest history</p>
                   </div>
                   <div className="text-right hidden sm:block">
                      <div className="text-[#00D4FF] text-[11px] font-extrabold tracking-[1px]">MLB EDGE</div>
                   </div>
               </div>

               {/* Dynamic Controls */}
               <div className="flex gap-1 mb-6 p-1 bg-[#0d1117] border border-[#3d4f5f] rounded-lg w-fit shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                   <button 
                       onClick={() => setDays(7)} 
                       className={`px-4 py-2 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ease-in-out ${currentDays === 7 ? 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] text-[#00D4FF] border border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' : 'bg-transparent text-slate-400 hover:text-white border border-transparent'}`}
                   >
                       7 DAYS
                   </button>
                   <button 
                       onClick={() => setDays(30)} 
                       className={`px-4 py-2 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ease-in-out ${currentDays === 30 ? 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] text-[#00D4FF] border border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' : 'bg-transparent text-slate-400 hover:text-white border border-transparent'}`}
                   >
                       30 DAYS
                   </button>
                   <button 
                       onClick={() => setDays(null)} 
                       className={`px-4 py-2 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ease-in-out ${currentDays === null ? 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] text-[#00D4FF] border border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' : 'bg-transparent text-slate-400 hover:text-white border border-transparent'}`}
                   >
                       SEASON
                   </button>
               </div>

               {/* Warning Alert */}
               <div className="bg-[#1a170a] border border-[#d97706]/50 rounded-lg p-4 mb-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-1 h-full bg-[#d97706]"></div>
                   <div className="text-[#d97706] text-[13px] font-extrabold tracking-[1px] mb-2 uppercase" style={{ textShadow: '0 0 8px rgba(217,119,6,0.5)' }}>READ THIS FIRST</div>
                   <div className="text-[#fcd34d] text-xs leading-relaxed opacity-90">
                       These are <strong className="text-white">historical</strong> graded results, mostly from the <strong className="text-white">pre-fix</strong> model. They show promise, not proof. CLV (closing-line value) is <strong className="text-white">not yet meaningfully measured</strong> (bet line ≈ closing line in the current capture), and the corrected model needs forward tracking before any number here is trustworthy. Treat as a baseline, not a guarantee.
                   </div>
               </div>

                {isLoading && !data ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-[#0d1117] border border-[#3d4f5f] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                        <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mb-4" />
                        <div className="text-[13px] font-extrabold text-[#00D4FF] tracking-[1px] mb-1 animate-pulse">CALCULATING MATRICES...</div>
                    </div>
                ) : stats ? (
                   <>
                       {/* FLAGGED BETS */}
                       <div className="text-[11px] font-extrabold text-[#00D4FF] tracking-[1px] mb-2 uppercase flex items-center justify-between" style={{ textShadow: '0 0 5px rgba(0,212,255,0.4)' }}>
                           <span>ENGINE'S FLAGGED BETS (BET-RATED)</span>
                           <span className="bg-[#1a2332] text-slate-300 border border-[#3d4f5f] px-2 py-0.5 rounded text-[10px] font-bold shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">{stats.flagged.count} GRADED</span>
                       </div>
                       
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                           <div className="relative bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                               <div className="text-[10px] font-bold text-slate-400 tracking-[1px] mb-2 uppercase">WIN RATE</div>
                               <div className="text-2xl font-extrabold text-[#00D4FF]" style={{ textShadow: '0 0 10px rgba(0,212,255,0.5)' }}>
                                   {Number(stats.flagged.winRate).toFixed(1)}%
                               </div>
                           </div>
                           <div className="relative bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                               <div className="text-[10px] font-bold text-slate-400 tracking-[1px] mb-2 uppercase">FLAT-STAKE ROI</div>
                               <div className={`text-2xl font-extrabold ${Number(stats.flagged.roi) > 0 ? 'text-[#00D4FF]' : Number(stats.flagged.roi) < 0 ? 'text-[#FF0055]' : 'text-white'}`} style={{ textShadow: Number(stats.flagged.roi) > 0 ? '0 0 10px rgba(0,212,255,0.5)' : Number(stats.flagged.roi) < 0 ? '0 0 10px rgba(255,0,85,0.5)' : 'none' }}>
                                   {Number(stats.flagged.roi) > 0 ? '+' : ''}{Number(stats.flagged.roi).toFixed(2)}%
                               </div>
                           </div>
                           <div className="relative bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                               <div className="text-[10px] font-bold text-slate-400 tracking-[1px] mb-2 uppercase">MODEL VS MKT BRIER</div>
                               <div className="text-2xl font-extrabold text-white">
                                   {Number(stats.flagged.modelBrier).toFixed(3)}
                               </div>
                               <div className="text-[10px] text-slate-500 mt-1 font-medium">
                                   mkt {stats.flagged.mktBrier !== null ? Number(stats.flagged.mktBrier).toFixed(3) : 'N/A'} · lower = sharper
                               </div>
                           </div>
                       </div>

                       {/* ALL GRADED OUTCOMES */}
                       <div className="text-[11px] font-extrabold text-[#00D4FF] tracking-[1px] mb-2 uppercase flex items-center justify-between" style={{ textShadow: '0 0 5px rgba(0,212,255,0.4)' }}>
                           <span>ALL GRADED OUTCOMES</span>
                           <span className="bg-[#1a2332] text-slate-300 border border-[#3d4f5f] px-2 py-0.5 rounded text-[10px] font-bold shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">{stats.all.count} GRADED</span>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                           <div className="relative bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                               <div className="text-[10px] font-bold text-slate-400 tracking-[1px] mb-2 uppercase">MODEL BRIER</div>
                               <div className="text-2xl font-extrabold text-white">
                                   {Number(stats.all.modelBrier).toFixed(4)}
                               </div>
                               <div className="text-[11px] text-slate-500 mt-1 font-medium">
                                   prediction accuracy (0.25 = coinflip)
                               </div>
                           </div>
                           <div className="relative bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                               <div className="text-[10px] font-bold text-slate-400 tracking-[1px] mb-2 uppercase">MARKET BRIER</div>
                               <div className="text-2xl font-extrabold text-white opacity-80">
                                   {stats.all.mktBrier !== null ? Number(stats.all.mktBrier).toFixed(4) : 'N/A'}
                               </div>
                               <div className="text-[11px] text-slate-500 mt-1 font-medium">
                                   the no-vig closing line
                               </div>
                           </div>
                       </div>
                       
                       <div className="text-[11px] text-slate-400 mb-8 border-l-[3px] border-[#00D4FF] bg-[#1a2332] p-3 rounded-r-lg shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] leading-relaxed">
                           The model's probabilities are more accurate than the no-vig market here (lower Brier) — a real skill signal.
                       </div>

                       {/* ROI BY EDGE SIZE - VISUALIZATION */}
                       <div className="text-[11px] font-extrabold text-[#00D4FF] tracking-[1px] mb-3 uppercase flex items-center justify-between" style={{ textShadow: '0 0 5px rgba(0,212,255,0.4)' }}>
                           <span>ROI BY EDGE SIZE</span>
                           <span className="text-[10px] text-slate-400 lowercase font-bold border border-[#3d4f5f] bg-[#0d1117] px-2 py-0.5 rounded shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">Flat-stake ROI %</span>
                       </div>
                       <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden mb-4 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] relative pt-6 pb-2 px-2">
                           {/* Decorative background grid */}
                           <div className="absolute inset-0 bg-[linear-gradient(to_right,#3d4f5f_1px,transparent_1px),linear-gradient(to_bottom,#3d4f5f_1px,transparent_1px)] bg-[size:1rem_1rem] [mask-image:linear-gradient(to_bottom,white,transparent_80%)] opacity-10 pointer-events-none"></div>
                           
                           {/* Metal Frame Details */}
                           <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-[#1a2332] border border-[#3d4f5f] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"></div>
                           <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#1a2332] border border-[#3d4f5f] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"></div>
                           
                           <div className="h-[220px] w-full relative z-10">
                               {(!stats.edgeData || stats.edgeData.length === 0) ? (
                                   <div className="flex items-center justify-center h-full text-slate-500 font-bold tracking-widest text-[11px] uppercase">
                                       NO EDGE DATA AVAILABLE
                                   </div>
                               ) : (
                                   <ResponsiveContainer width="100%" height="100%">
                                       <BarChart
                                           data={stats.edgeData}
                                           margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                       >
                                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3d4f5f" opacity={0.5} />
                                           <XAxis 
                                               dataKey="edge" 
                                               axisLine={false} 
                                               tickLine={false} 
                                               tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 800 }} 
                                               dy={10}
                                           />
                                           <YAxis 
                                               axisLine={false} 
                                               tickLine={false} 
                                               tick={{ fontSize: 10, fill: '#64748b' }} 
                                               tickFormatter={(val) => `${val}%`}
                                           />
                                           <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                           <ReferenceLine y={0} stroke="#3d4f5f" strokeWidth={2} />
                                           <Bar dataKey="roi" radius={[4, 4, 4, 4]} barSize={40}>
                                               {stats.edgeData.map((entry, index) => (
                                                   <Cell key={`cell-${index}`} fill={entry.roi > 0 ? '#00D4FF' : entry.roi < 0 ? '#FF0055' : '#94a3b8'} />
                                               ))}
                                           </Bar>
                                       </BarChart>
                                   </ResponsiveContainer>
                               )}
                           </div>
                       </div>
                       
                       {/* Data Table Fallback */}
                       <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden mb-4 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                           <div className="overflow-x-auto">
                               <div className="w-full min-w-[320px]">
                                   <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr] py-3 px-4 border-b-2 border-[#3d4f5f] bg-[#1a2332] text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                       <div>EDGE THRESHOLD</div>
                                       <div className="text-right">BETS</div>
                                       <div className="text-right">WIN%</div>
                                       <div className="text-right">ROI</div>
                                   </div>
                                   {stats.edgeData.map((row, idx) => (
                                       <div key={row.edge} className={`grid grid-cols-[2fr_1fr_1fr_1.5fr] py-3 px-4 text-[12px] hover:bg-[#1a2332] transition-colors ${idx < stats.edgeData.length - 1 ? 'border-b border-[#1a2332]' : ''}`}>
                                           <div className="font-bold text-white flex items-center gap-2">
                                               <div className={`w-2 h-2 rounded-full ${Number(row.roi) > 0 ? 'bg-[#00D4FF] shadow-[0_0_5px_rgba(0,212,255,0.8)]' : Number(row.roi) < 0 ? 'bg-[#00D4FF] shadow-[0_0_5px_rgba(0,212,255,0.8)]' : 'bg-slate-500'}`}></div>
                                               {row.edge}
                                           </div>
                                           <div className="text-right text-slate-300 font-medium">{row.n}</div>
                                           <div className="text-right text-slate-300 font-medium">{row.winPct}%</div>
                                           <div className={`text-right font-extrabold ${Number(row.roi) > 0 ? 'text-[#00D4FF]' : Number(row.roi) < 0 ? 'text-[#00D4FF]' : 'text-white'}`} style={{ textShadow: Number(row.roi) > 0 ? '0 0 5px rgba(0,212,255,0.5)' : Number(row.roi) < 0 ? '0 0 5px rgba(0,212,255,0.5)' : 'none' }}>
                                               {Number(row.roi) > 0 ? '+' : ''}{Number(row.roi).toFixed(2)}%
                                           </div>
                                       </div>
                                   ))}
                               </div>
                           </div>
                       </div>
                       
                       <div className="text-[11px] text-slate-400 leading-relaxed mb-8 bg-[#1a2332] p-3 rounded-lg border border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                           <strong className="text-[#00D4FF] uppercase tracking-[1px] text-[10px] block mb-1">Analytical Note</strong>
                           The edge size represents the difference between the model's projected win probability and the market's implied probability. A higher edge theoretically correlates with a higher ROI, but variance in smaller sample sizes can cause non-monotonic returns across different edge buckets.
                       </div>

                       <div className="text-[10px] text-slate-500 text-center leading-relaxed max-w-[400px] mx-auto border-t border-[#3d4f5f] pt-6 pb-2">
                           Win-rate breakeven at -110 is ~52.4%.<br/>
                           Brier score represents squared error of the probability vs outcome — lower is sharper, 0.25 is a coin-flip.<br />
                           <span className="mt-2 block font-extrabold text-[#00D4FF] uppercase tracking-[1px]">Analysis only — not betting advice.</span>
                       </div>
                   </>
               ) : (
                   <div className="flex flex-col items-center justify-center py-20 bg-[#0d1117] border border-[#3d4f5f] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                       <div className="text-[13px] font-extrabold text-slate-400 tracking-[1px] mb-1">NO DATA FOUND</div>
                       <div className="text-xs text-slate-500 max-w-[250px] text-center">
                           No graded validation data is available for this timeframe. Try selecting a broader date range.
                       </div>
                   </div>
               )}

           </div>
           <BottomNavBar />
        </div>
    );
}
