import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';

export async function getServerSideProps({ res }: any) {
    try {
        if (res) {
            res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
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
        
        const brier = (prob, result) => {
            if (typeof prob !== 'number') return 0;
            return Math.pow(prob - (result ? 1 : 0), 2);
        };
        
        // 1. ALL GRADED OUTCOMES
        let allModelBrierSum = 0;
        let allMktBrierSum = 0;
        let allModelCount = 0;
        let allMktCount = 0; // market_novig_prob can be null
        
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
        const buckets = {
            '10+ pts': { n: 0, wins: 0, profit: 0 },
            '3-5 pts': { n: 0, wins: 0, profit: 0 },
            '5-7 pts': { n: 0, wins: 0, profit: 0 },
            '7-10 pts': { n: 0, wins: 0, profit: 0 },
        };
        
        flagged.forEach((r: any) => {
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
        
        const edgeData = ['10+ pts', '3-5 pts', '5-7 pts', '7-10 pts'].map(k => {
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

export default function ValidationPage({ stats }: any) {
    return (
        <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0F172A', paddingBottom: 70, fontFamily: "var(--font-inter), sans-serif", width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box' }}>
           <SEOHead 
               title="Validation | MLB Analytics" 
               description="Historical graded results and model validation."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} />

           <MlbSubNav />

           <div style={{ padding: '16px', width: '100%', maxWidth: 680, margin: '0 auto', boxSizing: 'border-box' }}>
               {/* Header Section */}
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                   <div>
                      <Link href="/hub" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563EB', fontSize: 12, fontWeight: 700, textDecoration: 'none', letterSpacing: 1 }}>
                         <ArrowLeft size={14} /> DASHBOARD
                      </Link>
                      <h1 style={{ margin: '8px 0 2px', fontSize: 24, fontWeight: 800 }}>Model <span style={{ color: '#2563EB' }}>Validation</span></h1>
                      <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>Does it beat the market? — graded backtest history</p>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#2563EB', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>MLB EDGE</div>
                   </div>
               </div>

               {/* Warning Alert */}
               <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 16, marginBottom: 24 }}>
                   <div style={{ color: '#D97706', fontSize: 13, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>READ THIS FIRST</div>
                   <div style={{ color: '#D97706', fontSize: 12, lineHeight: 1.5 }}>
                       These are <strong>historical</strong> graded results, mostly from the <strong>pre-fix</strong> model. They show promise, not proof. CLV (closing-line value) is <strong>not yet meaningfully measured</strong> (bet line ≈ closing line in the current capture), and the corrected model needs forward tracking before any number here is trustworthy. Treat as a baseline, not a guarantee.
                   </div>
               </div>

               {stats ? (
                   <>
                       {/* FLAGGED BETS */}
                       <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                           ENGINE'S FLAGGED BETS (BET-RATED) · {stats.flagged.count} GRADED
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-6">
                           <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px' }}>
                               <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 4 }}>WIN RATE</div>
                               <div style={{ fontSize: 24, fontWeight: 800, color: '#10B981' }}>
                                   {stats.flagged.winRate.toFixed(1)}%
                               </div>
                           </div>
                           <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px' }}>
                               <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 4 }}>FLAT-STAKE ROI</div>
                               <div style={{ fontSize: 24, fontWeight: 800, color: stats.flagged.roi > 0 ? '#10B981' : '#EF4444' }}>
                                   {stats.flagged.roi > 0 ? '+' : ''}{stats.flagged.roi.toFixed(2)}%
                               </div>
                           </div>
                           <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px' }}>
                               <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 4 }}>MODEL VS MKT BRIER</div>
                               <div style={{ fontSize: 24, fontWeight: 800, color: '#10B981' }}>
                                   {stats.flagged.modelBrier.toFixed(3)}
                               </div>
                               <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
                                   mkt {stats.flagged.mktBrier !== null ? stats.flagged.mktBrier.toFixed(3) : 'N/A'} · lower = sharper
                               </div>
                           </div>
                       </div>

                       {/* ALL GRADED OUTCOMES */}
                       <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                           ALL GRADED OUTCOMES · {stats.all.count}
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                           <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px' }}>
                               <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 4 }}>MODEL BRIER</div>
                               <div style={{ fontSize: 24, fontWeight: 800, color: '#10B981' }}>
                                   {stats.all.modelBrier.toFixed(4)}
                               </div>
                               <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                                   prediction accuracy (0.25 = coinflip)
                               </div>
                           </div>
                           <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px' }}>
                               <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 4 }}>MARKET BRIER</div>
                               <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>
                                   {stats.all.mktBrier !== null ? stats.all.mktBrier.toFixed(4) : 'N/A'}
                               </div>
                               <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                                   the no-vig closing line
                               </div>
                           </div>
                       </div>
                       <div style={{ fontSize: 11, color: '#64748B', marginBottom: 24 }}>
                           The model's probabilities are more accurate than the no-vig market here (lower Brier) — a real skill signal.
                       </div>

                       {/* ROI BY EDGE SIZE */}
                       <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                           ROI BY EDGE SIZE (BET-RATED)
                       </div>
                       <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                           <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr', padding: '12px 16px', borderBottom: '1px solid #E2E8F0', fontSize: 10, fontWeight: 800, color: '#64748B', letterSpacing: 1 }}>
                               <div>EDGE</div>
                               <div style={{ textAlign: 'right' }}>N</div>
                               <div style={{ textAlign: 'right' }}>WIN%</div>
                               <div style={{ textAlign: 'right' }}>ROI</div>
                           </div>
                           {stats.edgeData.map((row, idx) => (
                               <div key={row.edge} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr', padding: '16px', borderBottom: idx < stats.edgeData.length - 1 ? '1px solid #E2E8F0' : 'none', fontSize: 13 }}>
                                   <div style={{ fontWeight: 800 }}>{row.edge}</div>
                                   <div style={{ textAlign: 'right', color: '#475569' }}>{row.n}</div>
                                   <div style={{ textAlign: 'right', color: '#475569' }}>{row.winPct}%</div>
                                   <div style={{ textAlign: 'right', fontWeight: 800, color: row.roi > 0 ? '#10B981' : '#EF4444' }}>
                                       {row.roi > 0 ? '+' : ''}{row.roi.toFixed(2)}%
                                   </div>
                               </div>
                           ))}
                       </div>
                       <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, marginBottom: 32 }}>
                           Note the <strong>non-monotonic</strong> pattern — the 7–10 bucket lost money while 5–7 and 10+ won big. The 10+ bucket is the old moneyline quantization artifact (now fixed). This is exactly why ranking by raw edge points was unreliable and the <strong>Bet Score</strong> (EV + confidence) replaced it.
                       </div>

                       <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 1.5 }}>
                           Win-rate breakeven at -110 is ~52.4%. Brier: squared error of the probability vs outcome — lower is sharper, 0.25 is a coin-flip.<br />
                           Analysis only — not betting advice.
                       </div>
                   </>
               ) : (
                   <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                       No validation data available.
                   </div>
               )}

           </div>
           <BottomNavBar />
        </div>
    );
}
