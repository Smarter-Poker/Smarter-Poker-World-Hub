import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export async function getServerSideProps({ res }: any) {
    try {
        // Cache the page for 5 minutes, allowing stale serving up to 10 mins while revalidating
        res.setHeader(
            'Cache-Control',
            'public, s-maxage=300, stale-while-revalidate=600'
        );

        const mlbDb = getMlbSupabase();

        // 1. Fetch Daily Accuracy (Last 14 days)
        const { data: accuracyData, error: accErr } = await mlbDb
            .from('backtest_accuracy')
            .select('*')
            .order('backtest_date', { ascending: false })
            .limit(14);
            
        if (accErr) throw accErr;

        // 2. Fetch all Market Output (parallel pagination for performance)
        const { count, error: countErr } = await mlbDb
            .from('backtest_market_output')
            .select('*', { count: 'exact', head: true });
            
        if (countErr) throw countErr;

        let allMarketRows: any[] = [];
        const limit = 1000;
        const numPages = Math.ceil((count || 0) / limit);
        
        if (numPages > 0) {
            const promises = [];
            for (let i = 0; i < numPages; i++) {
                const offset = i * limit;
                promises.push(
                    mlbDb
                        .from('backtest_market_output')
                        .select('market, brier_score, unit_profit, clv_pts, rec, actual_result, selection')
                        .range(offset, offset + limit - 1)
                );
            }
            const results = await Promise.all(promises);
            for (const res of results) {
                if (res.error) throw res.error;
                if (res.data) allMarketRows = allMarketRows.concat(res.data);
            }
        }

        // 3. Process Market Data
        const allBets = allMarketRows.filter(r => r.rec && r.rec.includes('BET') && !r.rec.includes('NO BET'));
        const totalPredictions = allBets.length;
        
        const wonBets = allBets.filter(r => r.unit_profit > 0);
        const lostBets = allBets.filter(r => r.unit_profit <= 0 && r.actual_result !== null);
        const winRate = totalPredictions > 0 ? (wonBets.length / totalPredictions) * 100 : 0;
        
        const brierScores = allMarketRows.filter(r => r.brier_score !== null).map(r => r.brier_score);
        const avgBrier = brierScores.length > 0 ? brierScores.reduce((a, b) => a + b, 0) / brierScores.length : 0;
        const brierVsBaseline = brierScores.length > 0 ? avgBrier - 0.2500 : 0;
        
        const unitsWon = allBets.reduce((sum, r) => sum + (r.unit_profit || 0), 0);
        const cumulativeRoi = totalPredictions > 0 ? (unitsWon / totalPredictions) * 100 : 0;

        const avgClv = totalPredictions > 0 ? allBets.reduce((sum, r) => sum + (r.clv_pts || 0), 0) / totalPredictions : 0;

        // Group by Market
        const marketGroups = {};
        for (const row of allMarketRows) {
            const m = row.market || 'Unknown';
            if (!marketGroups[m]) marketGroups[m] = { n: 0, wins: 0, brierSum: 0, brierCount: 0, profitSum: 0 };
            
            if (row.brier_score !== null) {
                marketGroups[m].brierSum += row.brier_score;
                marketGroups[m].brierCount += 1;
            }
            
            if (row.rec && row.rec.includes('BET') && !row.rec.includes('NO BET')) {
                marketGroups[m].n += 1;
                if (row.unit_profit > 0) marketGroups[m].wins += 1;
                marketGroups[m].profitSum += (row.unit_profit || 0);
            }
        }
        
        const marketBreakdown = Object.keys(marketGroups).map(m => {
            const mg = marketGroups[m];
            
            // Format market name
            let displayMarket = m;
            if (m === 'h2h') displayMarket = 'Moneyline (h2h)';
            else if (m === 'total') displayMarket = 'Totals';
            else if (m === 'run_line') displayMarket = 'Run Line';
            else displayMarket = m.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

            return {
                market: displayMarket,
                n: mg.n,
                winRate: mg.n > 0 ? (mg.wins / mg.n) * 100 : 0,
                avgBrier: mg.brierCount > 0 ? mg.brierSum / mg.brierCount : null,
                roi: mg.n > 0 ? (mg.profitSum / mg.n) * 100 : null
            };
        });

        return {
            props: {
                dailyTrend: accuracyData || [],
                marketBreakdown,
                stats: {
                    totalPredictions,
                    wonBets: wonBets.length,
                    lostBets: lostBets.length,
                    winRate,
                    avgBrier,
                    brierVsBaseline,
                    cumulativeRoi,
                    unitsWon,
                    avgClv
                }
            }
        };
    } catch (err) {
        console.error('Error fetching backtest stats:', err);
        return { 
            props: { 
                dailyTrend: [],
                marketBreakdown: [],
                stats: {
                    totalPredictions: 0, wonBets: 0, lostBets: 0, winRate: 0, avgBrier: 0,
                    brierVsBaseline: 0, cumulativeRoi: 0, unitsWon: 0, avgClv: 0
                }
            } 
        };
    }
}

export default function BacktestPage({ dailyTrend, marketBreakdown, stats }: any) {
    const formatPct = (val: any) => val === null || val === undefined || isNaN(val) ? '—' : `${val > 0 ? '+' : ''}${val.toFixed(1)}%`;
    const formatNum = (val: any) => val === null || val === undefined || isNaN(val) ? '—' : val.toLocaleString();

    // Lock-in Gate evaluation
    const sampleSizePassed = stats.totalPredictions >= 500;
    const brierPassed = stats.avgBrier < 0.23;
    const roiPassed = stats.cumulativeRoi > -3.0;
    const clvPassed = stats.avgClv > 0;
    const gatesPassed = [sampleSizePassed, brierPassed, roiPassed, clvPassed].filter(Boolean).length;
    
    const GateCard = ({ label, target, value, passed, isPct = false, isBrier = false }) => (
        <div style={{ background: '#1E293B', border: `1px solid ${passed ? '#065F46' : '#7F1D1D'}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 4 }}>{label} ({target})</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: passed ? '#10B981' : '#EF4444' }}>
                {isPct ? formatPct(value) : (isBrier ? value.toFixed(3) : formatNum(value))}
            </div>
        </div>
    );

    const navLinks = [
        { name: 'Slate', href: '/hub/MLB-ANALYTICS/slate' },
        { name: 'Best Bets', href: '/hub/MLB-ANALYTICS/best-bets' },
        { name: 'Model Intel', href: '/hub/MLB-ANALYTICS/intel' },
        { name: 'Props', href: '/hub/MLB-ANALYTICS/props' },
        { name: 'Tracker', href: '/hub/MLB-ANALYTICS/tracker' },
        { name: 'Players', href: '/hub/MLB-ANALYTICS/players' },
        { name: 'Teams', href: '/hub/MLB-ANALYTICS/teams' },
        { name: 'Accuracy', href: '/hub/MLB-ANALYTICS/accuracy' },
        { name: 'Backtest', href: '/hub/MLB-ANALYTICS/backtest', active: true },
        { name: 'Status', href: '/hub/MLB-ANALYTICS/status' },
        { name: 'Portfolio', href: '/hub/MLB-ANALYTICS/portfolio' },
        { name: 'Validation', href: '/hub/MLB-ANALYTICS/validation' }
    ];

    return (
        <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0F172A', paddingBottom: 80, fontFamily: "var(--font-inter), sans-serif" }}>
           <Head>
               <title>Backtest Results | MLB Analytics</title>
           </Head>

           {/* Secondary Nav Menu */}
           <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 16px', overflowX: 'auto', whiteSpace: 'nowrap', display: 'flex', gap: 24, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
               {navLinks.map(link => (
                   <Link key={link.name} href={link.href} style={{ padding: '16px 0', fontSize: 13, fontWeight: link.active ? 800 : 700, color: link.active ? '#2563EB' : '#64748B', borderBottom: link.active ? '2px solid #2563EB' : '2px solid transparent', textDecoration: 'none' }}>
                       {link.name}
                   </Link>
               ))}
           </div>

           <div style={{ padding: '24px 16px', maxWidth: 800, margin: '0 auto' }}>
               {/* Header Section */}
               <div style={{ marginBottom: 24 }}>
                   <Link href="/hub/MLB-ANALYTICS/accuracy" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563EB', fontSize: 13, fontWeight: 700, textDecoration: 'none', marginBottom: 12 }}>
                       <ArrowLeft size={16} /> Accuracy
                   </Link>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <div>
                           <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: '#0F172A' }}>Backtest Results</h1>
                           <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>Live Market Evaluation</div>
                       </div>
                       <Link href="/hub/MLB-ANALYTICS/accuracy" style={{ background: '#1E293B', color: '#38BDF8', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                           Live Accuracy <ArrowRight size={16} />
                       </Link>
                   </div>
               </div>

               {/* Top Metric Cards */}
               <div className="metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                   <div style={{ background: '#1E293B', borderRadius: 8, padding: 16 }}>
                       <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 8 }}>TOTAL PREDICTIONS</div>
                       <div style={{ fontSize: 24, fontWeight: 800, color: '#F8FAFC' }}>{formatNum(stats.totalPredictions)}</div>
                       <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>resolved bets</div>
                   </div>
                   <div style={{ background: '#1E293B', borderRadius: 8, padding: 16 }}>
                       <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 8 }}>OVERALL WIN RATE</div>
                       <div style={{ fontSize: 24, fontWeight: 800, color: '#F8FAFC' }}>{stats.winRate.toFixed(1)}%</div>
                       <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{stats.wonBets} W / {stats.lostBets} L</div>
                   </div>
                   <div style={{ background: '#1E293B', borderRadius: 8, padding: 16 }}>
                       <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 8 }}>AVG BRIER VS 0.2500</div>
                       <div style={{ fontSize: 24, fontWeight: 800, color: '#10B981' }}>{stats.avgBrier.toFixed(4)}</div>
                       <div style={{ fontSize: 11, color: '#10B981', marginTop: 4 }}>{stats.brierVsBaseline >= 0 ? '+' : ''}{stats.brierVsBaseline.toFixed(4)} vs baseline</div>
                   </div>
                   <div style={{ background: '#1E293B', borderRadius: 8, padding: 16 }}>
                       <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', letterSpacing: 1, marginBottom: 8 }}>CUMULATIVE ML ROI%</div>
                       <div style={{ fontSize: 24, fontWeight: 800, color: stats.cumulativeRoi >= 0 ? '#10B981' : '#EF4444' }}>{formatPct(stats.cumulativeRoi)}</div>
                       <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{stats.totalPredictions} bets · {stats.unitsWon > 0 ? '+' : ''}{stats.unitsWon.toFixed(2)}u</div>
                   </div>
               </div>

               {/* Lock-In Gate */}
               <div style={{ background: '#1E293B', borderRadius: 12, padding: 20, marginBottom: 32 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                           <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#F8FAFC' }}>Lock-In Gate</h2>
                           <span style={{ background: '#78350F', color: '#F59E0B', fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 4, letterSpacing: 1 }}>EVALUATING</span>
                       </div>
                       <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', letterSpacing: 1 }}>
                           REQUIRED BEFORE REAL-MONEY PLAY
                       </div>
                   </div>
                   
                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                       <GateCard label="Sample Size" target="n≥500" value={stats.totalPredictions} passed={sampleSizePassed} />
                       <GateCard label="Brier Score" target="<0.23" value={stats.avgBrier} passed={brierPassed} isBrier={true} />
                       <GateCard label="ML ROI" target=">-3%" value={stats.cumulativeRoi} passed={roiPassed} isPct={true} />
                       <GateCard label="Avg CLV" target=">0 pts" value={stats.avgClv} passed={clvPassed} />
                       
                       <div style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
                           <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 4 }}>All Gates</div>
                           <div style={{ fontSize: 18, fontWeight: 800, color: gatesPassed === 4 ? '#10B981' : '#F59E0B' }}>
                               {gatesPassed === 4 ? 'Passed' : 'Pending'}
                           </div>
                           <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{gatesPassed}/4 passed</div>
                       </div>
                   </div>
               </div>

               {/* Market Breakdown */}
               <div style={{ marginBottom: 32 }}>
                   <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1E293B', marginBottom: 12 }}>Market Breakdown</h2>
                   <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflowX: 'auto' }}>
                       <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', textAlign: 'left' }}>
                           <thead>
                               <tr style={{ background: '#1E293B', color: '#94A3B8', fontSize: 12, fontWeight: 700 }}>
                                   <th style={{ padding: '12px 16px', fontWeight: 700 }}>Market</th>
                                   <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>n</th>
                                   <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Win Rate</th>
                                   <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Avg Brier</th>
                                   <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>ROI%</th>
                               </tr>
                           </thead>
                           <tbody>
                               {marketBreakdown.map((row, idx) => (
                                   <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0', fontSize: 13 }}>
                                       <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                                            <span style={{ background: '#F1F5F9', padding: '4px 8px', borderRadius: 4, color: '#475569' }}>{row.market}</span>
                                       </td>
                                       <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748B' }}>{row.n}</td>
                                       <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748B' }}>{row.winRate.toFixed(1)}%</td>
                                       <td style={{ padding: '12px 16px', textAlign: 'center', color: '#10B981', fontWeight: 700 }}>{row.avgBrier ? row.avgBrier.toFixed(4) : '—'}</td>
                                       <td style={{ padding: '12px 16px', textAlign: 'right', color: row.roi >= 0 ? '#10B981' : '#EF4444', fontWeight: 700 }}>{formatPct(row.roi)}</td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
               </div>

               {/* Daily Trend */}
               <div>
                   <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1E293B', marginBottom: 12 }}>Daily Trend — Last 14 Days</h2>
                   <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflowX: 'auto' }}>
                       <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', textAlign: 'left' }}>
                           <thead>
                               <tr style={{ background: '#1E293B', color: '#94A3B8', fontSize: 12, fontWeight: 700 }}>
                                   <th style={{ padding: '12px 16px', fontWeight: 700 }}>Date</th>
                                   <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Games</th>
                                   <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Brier (ML)</th>
                                   <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>ML ROI%</th>
                                   <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Props ROI%</th>
                               </tr>
                           </thead>
                           <tbody>
                               {dailyTrend.map((row, idx) => (
                                   <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0', fontSize: 13 }}>
                                       <td style={{ padding: '12px 16px', color: '#64748B', fontWeight: 700 }}>{row.backtest_date}</td>
                                       <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748B' }}>{row.games_evaluated}</td>
                                       <td style={{ padding: '12px 16px', textAlign: 'center', color: '#10B981', fontWeight: 700 }}>{row.brier_score_ml ? row.brier_score_ml.toFixed(4) : '—'}</td>
                                       <td style={{ padding: '12px 16px', textAlign: 'center', color: row.roi_ml >= 0 ? '#10B981' : (row.roi_ml < 0 ? '#EF4444' : '#64748B'), fontWeight: 700 }}>{formatPct(row.roi_ml)}</td>
                                       <td style={{ padding: '12px 16px', textAlign: 'right', color: row.roi_props >= 0 ? '#10B981' : (row.roi_props < 0 ? '#EF4444' : '#64748B'), fontWeight: 700 }}>{formatPct(row.roi_props)}</td>
                                   </tr>
                               ))}
                               {dailyTrend.length === 0 && (
                                   <tr>
                                       <td colSpan={5} style={{ padding: '24px 16px', textAlign: 'center', color: '#94A3B8' }}>No daily trend data available</td>
                                   </tr>
                               )}
                           </tbody>
                       </table>
                   </div>
               </div>

           </div>
           
           <style>{`
             .title-placeholder {
                 /* Deprecated, logic handled inline */
             }
             
             @media (max-width: 768px) {
                .metric-grid {
                    grid-template-columns: repeat(2, 1fr) !important;
                }
             }
           `}</style>
           
           <BottomNavBar />
        </div>
    );
}
