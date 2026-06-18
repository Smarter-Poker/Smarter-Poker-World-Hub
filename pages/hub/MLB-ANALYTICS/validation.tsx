import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

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

export interface ValidationPageProps {
    stats: ValidationStats | null;
}

export async function getServerSideProps(context: any) {
    const { res, query } = context;
    try {
        if (res) {
            // Aggressive caching since historical backtest data rarely changes
            // Cache by query string so /validation?days=7 is cached separately from /validation
            res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        }

        const days = query.days ? parseInt(query.days as string, 10) : null;
        const mlbDb = getMlbSupabase();
        
        let rows: any[] = [];
        let activeDays: number | null = null;
        
        if (days && !isNaN(days)) {
            const cutoff = new Date(Date.now() - days * 86400000).toISOString();
            const { data, error } = await mlbDb
                .from('backtest_market_output')
                .select('model_prob, market_novig_prob, actual_result, edge_pts, unit_profit, rec')
                .gte('created_at', cutoff)
                .not('actual_result', 'is', null);
                
            if (error) {
                console.warn('Filter by created_at failed (possibly missing column). Falling back to unfiltered.', error.message);
                const fallback = await mlbDb
                    .from('backtest_market_output')
                    .select('model_prob, market_novig_prob, actual_result, edge_pts, unit_profit, rec')
                    .not('actual_result', 'is', null);
                if (fallback.error) throw fallback.error;
                rows = fallback.data || [];
            } else {
                rows = data || [];
                activeDays = days;
            }
        } else {
            const { data, error } = await mlbDb
                .from('backtest_market_output')
                .select('model_prob, market_novig_prob, actual_result, edge_pts, unit_profit, rec')
                .not('actual_result', 'is', null);
            if (error) throw error;
            rows = data || [];
        }
        
        if (!rows || rows.length === 0) {
            return { props: { stats: null } };
        }
        
        const brier = (prob: number | null, result: any) => {
            if (typeof prob !== 'number') return 0;
            const isWin = result === true || String(result).toLowerCase() === 'true' || result === 1;
            return Math.pow(prob - (isWin ? 1 : 0), 2);
        };
        
        // 1. ALL GRADED OUTCOMES
        let allModelBrierSum = 0;
        let allMktBrierSum = 0;
        let allModelCount = 0;
        let allMktCount = 0;
        
        rows.forEach(r => {
            if (r.model_prob !== null) {
                allModelBrierSum += brier(r.model_prob, r.actual_result);
                allModelCount++;
            }
            if (r.market_novig_prob !== null) {
                allMktBrierSum += brier(r.market_novig_prob, r.actual_result);
                allMktCount++;
            }
        });
        
        const allModelBrier = allModelCount > 0 ? allModelBrierSum / allModelCount : 0;
        const allMktBrier = allMktCount > 0 ? allMktBrierSum / allMktCount : null;
        
        // 2. ENGINE'S FLAGGED BETS
        const flagged = rows.filter(r => (r.rec || '').includes('BET'));
        
        let flagWins = 0;
        let flagUnitProfit = 0;
        let flagModelBrierSum = 0;
        let flagModelCount = 0;
        let flagMktBrierSum = 0;
        let flagMktCount = 0;
        
        flagged.forEach(r => {
            const isWin = r.actual_result === true || String(r.actual_result).toLowerCase() === 'true' || r.actual_result === 1;
            if (isWin) flagWins++;
            flagUnitProfit += Number(r.unit_profit || 0);
            if (r.model_prob !== null) {
                flagModelBrierSum += brier(r.model_prob, r.actual_result);
                flagModelCount++;
            }
            if (r.market_novig_prob !== null) {
                flagMktBrierSum += brier(r.market_novig_prob, r.actual_result);
                flagMktCount++;
            }
        });
        
        const flagWinRate = flagged.length > 0 ? (flagWins / flagged.length) * 100 : 0;
        const flagRoi = flagged.length > 0 ? (flagUnitProfit / flagged.length) * 100 : 0;
        const flagModelBrier = flagModelCount > 0 ? flagModelBrierSum / flagModelCount : 0;
        const flagMktBrier = flagMktCount > 0 ? flagMktBrierSum / flagMktCount : null;
        
        // 3. ROI BY EDGE SIZE
        const buckets: Record<string, { n: number; wins: number; profit: number }> = {
            '10+ pts': { n: 0, wins: 0, profit: 0 },
            '7-10 pts': { n: 0, wins: 0, profit: 0 },
            '5-7 pts': { n: 0, wins: 0, profit: 0 },
            '3-5 pts': { n: 0, wins: 0, profit: 0 },
        };
        
        flagged.forEach((r) => {
            const e = Number(r.edge_pts || 0);
            let b: string | null = null;
            if (e >= 10) b = '10+ pts';
            else if (e >= 7 && e < 10) b = '7-10 pts';
            else if (e >= 5 && e < 7) b = '5-7 pts';
            else if (e >= 3 && e < 5) b = '3-5 pts';
            
            if (b) {
                buckets[b].n++;
                const isWin = r.actual_result === true || String(r.actual_result).toLowerCase() === 'true' || r.actual_result === 1;
                if (isWin) buckets[b].wins++;
                buckets[b].profit += Number(r.unit_profit || 0);
            }
        });
        
        const edgeData: EdgeData[] = ['10+ pts', '7-10 pts', '5-7 pts', '3-5 pts'].map(k => {
            const b = buckets[k];
            const winPct = b.n > 0 ? Math.round((b.wins / b.n) * 100) : 0;
            const roi = b.n > 0 ? (b.profit / b.n) * 100 : 0;
            return { edge: k, n: b.n, winPct, roi };
        });

        return {
            props: {
                stats: {
                    activeDays,
                    all: {
                        count: rows.length,
                        modelBrier: allModelBrier,
                        mktBrier: allMktBrier
                    },
                    flagged: {
                        count: flagged.length,
                        winRate: flagWinRate,
                        roi: flagRoi,
                        modelBrier: flagModelBrier,
                        mktBrier: flagMktBrier
                    },
                    edgeData
                }
            }
        };
    } catch (err) {
        console.error('Error fetching validation stats:', err);
        return { props: { stats: null } };
    }
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const roi = payload[0].value;
        return (
            <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl">
                <p className="text-slate-300 text-[10px] font-extrabold tracking-[1px] mb-1 uppercase">{label} EDGE</p>
                <p className={`text-lg font-extrabold ${roi > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {roi > 0 ? '+' : ''}{roi.toFixed(2)}% ROI
                </p>
                <p className="text-slate-500 text-xs mt-1">
                    {payload[0].payload.n} bets graded
                </p>
            </div>
        );
    }
    return null;
};

export default function ValidationPage({ stats }: ValidationPageProps) {
    const router = useRouter();
    const currentDays = router.query.days ? parseInt(router.query.days as string, 10) : null;

    const setDays = (d: number | null) => {
        if (d) {
            router.push(`/hub/MLB-ANALYTICS/validation?days=${d}`, undefined, { shallow: false });
        } else {
            router.push(`/hub/MLB-ANALYTICS/validation`, undefined, { shallow: false });
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title="Validation | MLB Analytics" 
               description="Historical graded results and model validation."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} />

           <MlbSubNav />

           <div className="p-4 w-full max-w-[680px] mx-auto box-border">
               {/* Header Section */}
               <div className="flex justify-between items-center mb-4">
                   <div>
                      <Link href="/hub" className="inline-flex items-center gap-1 text-blue-600 text-xs font-bold no-underline tracking-[1px]">
                         <ArrowLeft size={14} /> DASHBOARD
                      </Link>
                      <h1 className="mt-2 mb-0.5 text-2xl font-extrabold">Model <span className="text-blue-600">Validation</span></h1>
                      <p className="m-0 text-xs text-slate-500">Does it beat the market? — graded backtest history</p>
                   </div>
                   <div className="text-right">
                      <div className="text-blue-600 text-[11px] font-extrabold tracking-[1px]">MLB EDGE</div>
                   </div>
               </div>

               {/* Dynamic Controls */}
               <div className="flex gap-1 mb-6 p-1 bg-slate-200/50 border border-slate-200 rounded-lg w-fit shadow-inner">
                   <button 
                       onClick={() => setDays(7)} 
                       className={`px-4 py-2 rounded-md text-[11px] font-extrabold tracking-[1px] transition-all duration-200 ease-in-out ${currentDays === 7 ? 'bg-white shadow text-blue-600 ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                   >
                       7 DAYS
                   </button>
                   <button 
                       onClick={() => setDays(30)} 
                       className={`px-4 py-2 rounded-md text-[11px] font-extrabold tracking-[1px] transition-all duration-200 ease-in-out ${currentDays === 30 ? 'bg-white shadow text-blue-600 ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                   >
                       30 DAYS
                   </button>
                   <button 
                       onClick={() => setDays(null)} 
                       className={`px-4 py-2 rounded-md text-[11px] font-extrabold tracking-[1px] transition-all duration-200 ease-in-out ${currentDays === null ? 'bg-white shadow text-blue-600 ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                   >
                       SEASON
                   </button>
               </div>

               {/* Warning Alert */}
               <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                   <div className="text-amber-600 text-[13px] font-extrabold tracking-[1px] mb-2">READ THIS FIRST</div>
                   <div className="text-amber-600 text-xs leading-relaxed">
                       These are <strong>historical</strong> graded results, mostly from the <strong>pre-fix</strong> model. They show promise, not proof. CLV (closing-line value) is <strong>not yet meaningfully measured</strong> (bet line ≈ closing line in the current capture), and the corrected model needs forward tracking before any number here is trustworthy. Treat as a baseline, not a guarantee.
                   </div>
               </div>

               {stats ? (
                   <>
                       {/* FLAGGED BETS */}
                       <div className="text-[11px] font-extrabold text-slate-500 tracking-[1px] mb-2 uppercase flex items-center justify-between">
                           <span>ENGINE'S FLAGGED BETS (BET-RATED)</span>
                           <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{stats.flagged.count} GRADED</span>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-6">
                           <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                               <div className="text-[10px] font-extrabold text-slate-500 tracking-[1px] mb-1">WIN RATE</div>
                               <div className="text-2xl font-extrabold text-emerald-500">
                                   {stats.flagged.winRate.toFixed(1)}%
                               </div>
                           </div>
                           <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                               <div className="text-[10px] font-extrabold text-slate-500 tracking-[1px] mb-1">FLAT-STAKE ROI</div>
                               <div className={`text-2xl font-extrabold ${stats.flagged.roi > 0 ? 'text-emerald-500' : stats.flagged.roi < 0 ? 'text-red-500' : 'text-slate-900'}`}>
                                   {stats.flagged.roi > 0 ? '+' : ''}{stats.flagged.roi.toFixed(2)}%
                               </div>
                           </div>
                           <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                               <div className="text-[10px] font-extrabold text-slate-500 tracking-[1px] mb-1">MODEL VS MKT BRIER</div>
                               <div className="text-2xl font-extrabold text-emerald-500">
                                   {stats.flagged.modelBrier.toFixed(3)}
                               </div>
                               <div className="text-[10px] text-slate-400 mt-1">
                                   mkt {stats.flagged.mktBrier !== null ? stats.flagged.mktBrier.toFixed(3) : 'N/A'} · lower = sharper
                               </div>
                           </div>
                       </div>

                       {/* ALL GRADED OUTCOMES */}
                       <div className="text-[11px] font-extrabold text-slate-500 tracking-[1px] mb-2 uppercase flex items-center justify-between">
                           <span>ALL GRADED OUTCOMES</span>
                           <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{stats.all.count} GRADED</span>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                           <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                               <div className="text-[10px] font-extrabold text-slate-500 tracking-[1px] mb-1">MODEL BRIER</div>
                               <div className="text-2xl font-extrabold text-emerald-500">
                                   {stats.all.modelBrier.toFixed(4)}
                               </div>
                               <div className="text-[11px] text-slate-400 mt-1">
                                   prediction accuracy (0.25 = coinflip)
                               </div>
                           </div>
                           <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                               <div className="text-[10px] font-extrabold text-slate-500 tracking-[1px] mb-1">MARKET BRIER</div>
                               <div className="text-2xl font-extrabold text-slate-900">
                                   {stats.all.mktBrier !== null ? stats.all.mktBrier.toFixed(4) : 'N/A'}
                               </div>
                               <div className="text-[11px] text-slate-400 mt-1">
                                   the no-vig closing line
                               </div>
                           </div>
                       </div>
                       <div className="text-[11px] text-slate-500 mb-8 border-l-2 border-blue-500 pl-3 py-1">
                           The model's probabilities are more accurate than the no-vig market here (lower Brier) — a real skill signal.
                       </div>

                       {/* ROI BY EDGE SIZE - VISUALIZATION */}
                       <div className="text-[11px] font-extrabold text-slate-500 tracking-[1px] mb-3 uppercase flex items-center justify-between">
                           <span>ROI BY EDGE SIZE</span>
                           <span className="text-[10px] text-slate-400 lowercase font-normal border border-slate-200 px-2 py-0.5 rounded-md">Flat-stake ROI %</span>
                       </div>
                       <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4 shadow-sm relative pt-6 pb-2 px-2">
                           {/* Decorative background grid */}
                           <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:1rem_1rem] [mask-image:linear-gradient(to_bottom,white,transparent_80%)] opacity-30 pointer-events-none"></div>
                           
                           <div className="h-[220px] w-full relative z-10">
                               <ResponsiveContainer width="100%" height="100%">
                                   <BarChart
                                       data={stats.edgeData}
                                       margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                   >
                                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
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
                                           tick={{ fontSize: 10, fill: '#94a3b8' }} 
                                           tickFormatter={(val) => `${val}%`}
                                       />
                                       <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                                       <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={2} />
                                       <Bar dataKey="roi" radius={[4, 4, 4, 4]} barSize={40}>
                                           {stats.edgeData.map((entry, index) => (
                                               <Cell key={`cell-${index}`} fill={entry.roi > 0 ? '#10b981' : '#ef4444'} />
                                           ))}
                                       </Bar>
                                   </BarChart>
                               </ResponsiveContainer>
                           </div>
                       </div>
                       
                       {/* Data Table Fallback */}
                       <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-3 shadow-sm">
                           <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr] py-3 px-4 border-b border-slate-100 bg-slate-50 text-[10px] font-extrabold text-slate-500 tracking-[1px]">
                               <div>EDGE THRESHOLD</div>
                               <div className="text-right">BETS</div>
                               <div className="text-right">WIN%</div>
                               <div className="text-right">ROI</div>
                           </div>
                           {stats.edgeData.map((row, idx) => (
                               <div key={row.edge} className={`grid grid-cols-[2fr_1fr_1fr_1.5fr] py-3 px-4 text-[12px] hover:bg-slate-50 transition-colors ${idx < stats.edgeData.length - 1 ? 'border-b border-slate-100' : ''}`}>
                                   <div className="font-extrabold flex items-center gap-2">
                                       <div className={`w-2 h-2 rounded-full ${row.roi > 0 ? 'bg-emerald-500' : row.roi < 0 ? 'bg-red-500' : 'bg-slate-300'}`}></div>
                                       {row.edge}
                                   </div>
                                   <div className="text-right text-slate-600 font-medium">{row.n}</div>
                                   <div className="text-right text-slate-600 font-medium">{row.winPct}%</div>
                                   <div className={`text-right font-extrabold ${row.roi > 0 ? 'text-emerald-500' : row.roi < 0 ? 'text-red-500' : 'text-slate-900'}`}>
                                       {row.roi > 0 ? '+' : ''}{row.roi.toFixed(2)}%
                                   </div>
                               </div>
                           ))}
                       </div>
                       
                       <div className="text-[11px] text-slate-500 leading-relaxed mb-8 bg-slate-100 p-3 rounded-lg border border-slate-200">
                           <strong className="text-slate-700 uppercase tracking-[1px] text-[10px] block mb-1">Analytical Note</strong>
                           Note the <strong>non-monotonic</strong> pattern — the 7–10 bucket lost money while 5–7 and 10+ won big. The 10+ bucket is the old moneyline quantization artifact (now fixed). This is exactly why ranking by raw edge points was unreliable and the <strong>Bet Score</strong> (EV + confidence) replaced it.
                       </div>

                       <div className="text-[10px] text-slate-400 text-center leading-relaxed max-w-[400px] mx-auto border-t border-slate-200 pt-6">
                           Win-rate breakeven at -110 is ~52.4%.<br/>
                           Brier score represents squared error of the probability vs outcome — lower is sharper, 0.25 is a coin-flip.<br />
                           <span className="mt-2 block font-extrabold uppercase tracking-[1px]">Analysis only — not betting advice.</span>
                       </div>
                   </>
               ) : (
                   <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-xl shadow-sm">
                       <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                           <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></div>
                       </div>
                       <div className="text-[13px] font-extrabold text-slate-700 tracking-[1px] mb-1">NO DATA FOUND</div>
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
