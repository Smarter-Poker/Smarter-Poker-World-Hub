import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';

export interface EdgeData {
    edge: string;
    n: number;
    winPct: number;
    roi: number;
}

export interface ValidationStats {
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

export async function getServerSideProps({ res }: any) {
    try {
        if (res) {
            // Aggressive caching since historical backtest data rarely changes
            res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        }

        const mlbDb = getMlbSupabase();
        
        // Fetch all graded outcomes
        const { data: rows, error } = await mlbDb
            .from('backtest_market_output')
            .select('model_prob, market_novig_prob, actual_result, edge_pts, unit_profit, rec')
            .not('actual_result', 'is', null);
            
        if (error) throw error;
        
        if (!rows || rows.length === 0) {
            return { props: { stats: null } };
        }
        
        const brier = (prob: number | null, result: boolean) => {
            if (typeof prob !== 'number') return 0;
            return Math.pow(prob - (result ? 1 : 0), 2);
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
            if (r.actual_result) flagWins++;
            flagUnitProfit += (r.unit_profit || 0);
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
            '3-5 pts': { n: 0, wins: 0, profit: 0 },
            '5-7 pts': { n: 0, wins: 0, profit: 0 },
            '7-10 pts': { n: 0, wins: 0, profit: 0 },
        };
        
        flagged.forEach((r) => {
            const e = r.edge_pts || 0;
            let b: string | null = null;
            if (e >= 10) b = '10+ pts';
            else if (e >= 7 && e < 10) b = '7-10 pts';
            else if (e >= 5 && e < 7) b = '5-7 pts';
            else if (e >= 3 && e < 5) b = '3-5 pts';
            
            if (b) {
                buckets[b].n++;
                if (r.actual_result) buckets[b].wins++;
                buckets[b].profit += (r.unit_profit || 0);
            }
        });
        
        const edgeData: EdgeData[] = ['10+ pts', '3-5 pts', '5-7 pts', '7-10 pts'].map(k => {
            const b = buckets[k];
            const winPct = b.n > 0 ? Math.round((b.wins / b.n) * 100) : 0;
            const roi = b.n > 0 ? (b.profit / b.n) * 100 : 0;
            return { edge: k, n: b.n, winPct, roi };
        });

        return {
            props: {
                stats: {
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

export default function ValidationPage({ stats }: ValidationPageProps) {
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
                       <div className="text-[11px] font-extrabold text-slate-500 tracking-[1px] mb-2 uppercase">
                           ENGINE'S FLAGGED BETS (BET-RATED) · {stats.flagged.count} GRADED
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-6">
                           <div className="bg-white border border-slate-200 rounded-lg p-4">
                               <div className="text-[10px] font-extrabold text-slate-500 tracking-[1px] mb-1">WIN RATE</div>
                               <div className="text-2xl font-extrabold text-emerald-500">
                                   {stats.flagged.winRate.toFixed(1)}%
                               </div>
                           </div>
                           <div className="bg-white border border-slate-200 rounded-lg p-4">
                               <div className="text-[10px] font-extrabold text-slate-500 tracking-[1px] mb-1">FLAT-STAKE ROI</div>
                               <div className={`text-2xl font-extrabold ${stats.flagged.roi > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                   {stats.flagged.roi > 0 ? '+' : ''}{stats.flagged.roi.toFixed(2)}%
                               </div>
                           </div>
                           <div className="bg-white border border-slate-200 rounded-lg p-4">
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
                       <div className="text-[11px] font-extrabold text-slate-500 tracking-[1px] mb-2 uppercase">
                           ALL GRADED OUTCOMES · {stats.all.count}
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                           <div className="bg-white border border-slate-200 rounded-lg p-4">
                               <div className="text-[10px] font-extrabold text-slate-500 tracking-[1px] mb-1">MODEL BRIER</div>
                               <div className="text-2xl font-extrabold text-emerald-500">
                                   {stats.all.modelBrier.toFixed(4)}
                               </div>
                               <div className="text-[11px] text-slate-400 mt-1">
                                   prediction accuracy (0.25 = coinflip)
                               </div>
                           </div>
                           <div className="bg-white border border-slate-200 rounded-lg p-4">
                               <div className="text-[10px] font-extrabold text-slate-500 tracking-[1px] mb-1">MARKET BRIER</div>
                               <div className="text-2xl font-extrabold text-slate-900">
                                   {stats.all.mktBrier !== null ? stats.all.mktBrier.toFixed(4) : 'N/A'}
                               </div>
                               <div className="text-[11px] text-slate-400 mt-1">
                                   the no-vig closing line
                               </div>
                           </div>
                       </div>
                       <div className="text-[11px] text-slate-500 mb-6">
                           The model's probabilities are more accurate than the no-vig market here (lower Brier) — a real skill signal.
                       </div>

                       {/* ROI BY EDGE SIZE */}
                       <div className="text-[11px] font-extrabold text-slate-500 tracking-[1px] mb-2 uppercase">
                           ROI BY EDGE SIZE (BET-RATED)
                       </div>
                       <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-3">
                           <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr] py-3 px-4 border-b border-slate-200 text-[10px] font-extrabold text-slate-500 tracking-[1px]">
                               <div>EDGE</div>
                               <div className="text-right">N</div>
                               <div className="text-right">WIN%</div>
                               <div className="text-right">ROI</div>
                           </div>
                           {stats.edgeData.map((row, idx) => (
                               <div key={row.edge} className={`grid grid-cols-[2fr_1fr_1fr_1.5fr] p-4 text-[13px] ${idx < stats.edgeData.length - 1 ? 'border-b border-slate-200' : ''}`}>
                                   <div className="font-extrabold">{row.edge}</div>
                                   <div className="text-right text-slate-600">{row.n}</div>
                                   <div className="text-right text-slate-600">{row.winPct}%</div>
                                   <div className={`text-right font-extrabold ${row.roi > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                       {row.roi > 0 ? '+' : ''}{row.roi.toFixed(2)}%
                                   </div>
                               </div>
                           ))}
                       </div>
                       <div className="text-[11px] text-slate-500 leading-relaxed mb-8">
                           Note the <strong>non-monotonic</strong> pattern — the 7–10 bucket lost money while 5–7 and 10+ won big. The 10+ bucket is the old moneyline quantization artifact (now fixed). This is exactly why ranking by raw edge points was unreliable and the <strong>Bet Score</strong> (EV + confidence) replaced it.
                       </div>

                       <div className="text-[11px] text-slate-400 text-center leading-relaxed">
                           Win-rate breakeven at -110 is ~52.4%. Brier: squared error of the probability vs outcome — lower is sharper, 0.25 is a coin-flip.<br />
                           Analysis only — not betting advice.
                       </div>
                   </>
               ) : (
                   <div className="text-center p-10 text-slate-500">
                       No validation data available.
                   </div>
               )}

           </div>
           <BottomNavBar />
        </div>
    );
}
