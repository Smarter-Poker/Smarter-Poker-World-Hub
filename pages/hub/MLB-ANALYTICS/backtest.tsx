import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ArrowRight, RefreshCw, ShieldAlert, CheckCircle, Database } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function BacktestPage() {
    const { data, error, isLoading, mutate } = useSWR('/api/mlb/backtest', fetcher, {
        refreshInterval: 15000,
        revalidateOnFocus: true,
    });

    const formatPct = (val: any) => val === null || val === undefined || isNaN(val) ? '—' : `${val > 0 ? '+' : ''}${val.toFixed(1)}%`;
    const formatNum = (val: any) => val === null || val === undefined || isNaN(val) ? '—' : val.toLocaleString();

    const dailyTrend = data?.dailyTrend || [];
    const marketBreakdown = data?.marketBreakdown || [];
    const stats = data?.stats || {
        totalPredictions: 0, wonBets: 0, lostBets: 0, winRate: 0, avgBrier: 0,
        brierVsBaseline: 0, cumulativeRoi: 0, unitsWon: 0, avgClv: 0
    };

    // Lock-in Gate evaluation
    const sampleSizePassed = stats.totalPredictions >= 500;
    const brierPassed = stats.avgBrier > 0 && stats.avgBrier < 0.23;
    const roiPassed = stats.cumulativeRoi > -3.0 && stats.totalPredictions > 0;
    const clvPassed = stats.avgClv > 0 && stats.totalPredictions > 0;
    const gatesPassed = [sampleSizePassed, brierPassed, roiPassed, clvPassed].filter(Boolean).length;
    
    const GateCard = ({ label, target, value, passed, isPct = false, isBrier = false }: any) => (
        <div style={{ 
            background: 'rgba(15, 23, 42, 0.6)', 
            border: `1px solid ${passed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`, 
            boxShadow: passed ? 'inset 0 0 10px rgba(16, 185, 129, 0.1)' : 'inset 0 0 10px rgba(239, 68, 68, 0.1)',
            borderRadius: 8, 
            padding: 12,
            position: 'relative',
            overflow: 'hidden',
            flex: '1 1 120px'
        }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: passed ? '#10B981' : '#EF4444' }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 4, paddingLeft: 8, letterSpacing: 1, textTransform: 'uppercase' }}>{label} ({target})</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: passed ? '#10B981' : '#EF4444', paddingLeft: 8, textShadow: passed ? '0 0 8px rgba(16,185,129,0.4)' : '0 0 8px rgba(239,68,68,0.4)' }}>
                {isPct ? formatPct(value) : (isBrier ? (value ? value.toFixed(3) : '—') : formatNum(value))}
            </div>
            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.2 }}>
                {passed ? <CheckCircle size={24} color="#10B981" /> : <ShieldAlert size={24} color="#EF4444" />}
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
        <div style={{ minHeight: '100vh', background: '#020617', color: '#F8FAFC', paddingBottom: 80, fontFamily: "var(--font-inter), sans-serif", backgroundImage: 'radial-gradient(circle at 50% 0%, #1e1b4b 0%, #020617 70%)' }}>
           <Head>
               <title>Backtest Results | MLB Analytics</title>
           </Head>

           {/* Secondary Nav Menu */}
           <div style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(51, 65, 85, 0.5)', padding: '0 16px', overflowX: 'auto', whiteSpace: 'nowrap', display: 'flex', gap: 24, msOverflowStyle: 'none', scrollbarWidth: 'none', backdropFilter: 'blur(10px)' }}>
               {navLinks.map(link => (
                   <Link key={link.name} href={link.href} style={{ padding: '16px 0', fontSize: 13, fontWeight: link.active ? 800 : 700, color: link.active ? '#38BDF8' : '#64748B', borderBottom: link.active ? '2px solid #38BDF8' : '2px solid transparent', textDecoration: 'none', textShadow: link.active ? '0 0 10px rgba(56, 189, 248, 0.5)' : 'none' }}>
                       {link.name}
                   </Link>
               ))}
           </div>

           <div style={{ padding: '24px 16px', maxWidth: 800, margin: '0 auto' }}>
               {/* Header Section */}
               <div style={{ marginBottom: 24 }}>
                   <Link href="/hub/MLB-ANALYTICS/accuracy" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#38BDF8', fontSize: 13, fontWeight: 700, textDecoration: 'none', marginBottom: 12, textShadow: '0 0 8px rgba(56,189,248,0.4)' }}>
                       <ArrowLeft size={16} /> Live Accuracy
                   </Link>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <div>
                           <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, color: '#F8FAFC', letterSpacing: '-0.5px', textShadow: '0 0 20px rgba(248,250,252,0.2)' }}>
                               BACKTEST<span style={{ color: '#38BDF8' }}>_</span>RESULTS
                           </h1>
                           <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 4, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                               <Database size={14} color="#38BDF8" /> HISTORICAL MARKET EVALUATION
                           </div>
                       </div>
                       <button 
                           onClick={() => mutate()} 
                           style={{ background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(37, 99, 235, 0.2) 100%)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38BDF8', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 0 15px rgba(56, 189, 248, 0.1)', textTransform: 'uppercase', letterSpacing: 1 }}
                       >
                           <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> Sync
                       </button>
                   </div>
               </div>

               {error && (
                   <div style={{ background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: 8, padding: 16, marginBottom: 24, color: '#FCA5A5', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                       <ShieldAlert size={16} /> Error loading backtest data.
                   </div>
               )}

               {/* Top Metric Cards */}
               <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                   <div style={{ background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                       <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                           <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#38BDF8', boxShadow: '0 0 5px #38BDF8' }} />
                           TOTAL PREDICTIONS
                       </div>
                       <div style={{ fontSize: 28, fontWeight: 900, color: '#F8FAFC', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>{isLoading && !data ? '—' : formatNum(stats.totalPredictions)}</div>
                       <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontWeight: 600 }}>RESOLVED BETS</div>
                   </div>
                   <div style={{ background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                       <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                           <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#818CF8', boxShadow: '0 0 5px #818CF8' }} />
                           OVERALL WIN RATE
                       </div>
                       <div style={{ fontSize: 28, fontWeight: 900, color: '#F8FAFC', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>{isLoading && !data ? '—' : `${stats.winRate.toFixed(1)}%`}</div>
                       <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontWeight: 600 }}>{stats.wonBets} W / {stats.lostBets} L</div>
                   </div>
                   <div style={{ background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                       <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                           <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 5px #10B981' }} />
                           AVG BRIER VS 0.25
                       </div>
                       <div style={{ fontSize: 28, fontWeight: 900, color: '#10B981', textShadow: '0 0 15px rgba(16,185,129,0.3)' }}>{isLoading && !data ? '—' : (stats.avgBrier ? stats.avgBrier.toFixed(4) : '0.0000')}</div>
                       <div style={{ fontSize: 11, color: '#10B981', marginTop: 4, fontWeight: 600, opacity: 0.8 }}>{stats.brierVsBaseline >= 0 ? '+' : ''}{stats.brierVsBaseline.toFixed(4)} vs baseline</div>
                   </div>
                   <div style={{ background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                       <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                           <div style={{ width: 6, height: 6, borderRadius: '50%', background: stats.cumulativeRoi >= 0 ? '#10B981' : '#EF4444', boxShadow: `0 0 5px ${stats.cumulativeRoi >= 0 ? '#10B981' : '#EF4444'}` }} />
                           CUMULATIVE ML ROI%
                       </div>
                       <div style={{ fontSize: 28, fontWeight: 900, color: stats.cumulativeRoi >= 0 ? '#10B981' : '#EF4444', textShadow: `0 0 15px ${stats.cumulativeRoi >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>{isLoading && !data ? '—' : formatPct(stats.cumulativeRoi)}</div>
                       <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontWeight: 600 }}>{stats.totalPredictions} bets · {stats.unitsWon > 0 ? '+' : ''}{stats.unitsWon.toFixed(2)}u</div>
                   </div>
               </div>

               {/* Lock-In Gate */}
               <div style={{ background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.7) 0%, rgba(2, 6, 23, 0.9) 100%)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: 20, marginBottom: 32, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', position: 'relative', overflow: 'hidden' }}>
                   <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.5), transparent)' }} />
                   
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                           <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#F8FAFC', letterSpacing: 1 }}>LOCK-IN GATE</h2>
                           <span style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#FCD34D', fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 4, letterSpacing: 2, boxShadow: '0 0 10px rgba(245,158,11,0.1)' }}>EVALUATING</span>
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
                       
                       <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(51, 65, 85, 0.8)', borderRadius: 8, padding: 12, flex: '1 1 120px', minWidth: 120 }}>
                           <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>All Gates</div>
                           <div style={{ fontSize: 18, fontWeight: 800, color: gatesPassed === 4 ? '#10B981' : '#F59E0B', textShadow: gatesPassed === 4 ? '0 0 10px rgba(16,185,129,0.4)' : '0 0 10px rgba(245,158,11,0.4)' }}>
                               {gatesPassed === 4 ? 'PASSED' : 'PENDING'}
                           </div>
                           <div style={{ fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: 600 }}>{gatesPassed}/4 passed</div>
                       </div>
                   </div>
               </div>

               {/* Market Breakdown */}
               <div style={{ marginBottom: 32 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                       <div style={{ width: 4, height: 16, background: '#38BDF8', borderRadius: 2 }} />
                       <h2 style={{ fontSize: 16, fontWeight: 800, color: '#F8FAFC', margin: 0, letterSpacing: 1 }}>MARKET BREAKDOWN</h2>
                   </div>
                   <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, overflowX: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                       <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', textAlign: 'left' }}>
                           <thead>
                               <tr style={{ background: 'rgba(30, 41, 59, 0.8)', color: '#94A3B8', fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
                                   <th style={{ padding: '16px', fontWeight: 800, borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>Market</th>
                                   <th style={{ padding: '16px', fontWeight: 800, textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>n</th>
                                   <th style={{ padding: '16px', fontWeight: 800, textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>Win Rate</th>
                                   <th style={{ padding: '16px', fontWeight: 800, textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>Avg Brier</th>
                                   <th style={{ padding: '16px', fontWeight: 800, textAlign: 'right', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>ROI%</th>
                               </tr>
                           </thead>
                           <tbody>
                               {isLoading && marketBreakdown.length === 0 ? (
                                   <tr>
                                       <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B', fontWeight: 600, fontSize: 13, letterSpacing: 1 }}>
                                           <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', marginBottom: 12, color: '#38BDF8' }} />
                                           ANALYZING MARKETS...
                                       </td>
                                   </tr>
                               ) : marketBreakdown.map((row: any, idx: number) => (
                                   <tr key={idx} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.3)', fontSize: 13, transition: 'background 0.2s' } as any}>
                                       <td style={{ padding: '16px', fontWeight: 700 }}>
                                            <span style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '4px 8px', borderRadius: 4, color: '#38BDF8', letterSpacing: 0.5 }}>{row.market}</span>
                                       </td>
                                       <td style={{ padding: '16px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>{row.n}</td>
                                       <td style={{ padding: '16px', textAlign: 'center', color: '#E2E8F0', fontWeight: 700 }}>{row.winRate.toFixed(1)}%</td>
                                       <td style={{ padding: '16px', textAlign: 'center', color: '#10B981', fontWeight: 800 }}>{row.avgBrier ? row.avgBrier.toFixed(4) : '—'}</td>
                                       <td style={{ padding: '16px', textAlign: 'right', color: row.roi >= 0 ? '#10B981' : '#EF4444', fontWeight: 800, textShadow: row.roi >= 0 ? '0 0 10px rgba(16,185,129,0.2)' : '0 0 10px rgba(239,68,68,0.2)' }}>{formatPct(row.roi)}</td>
                                   </tr>
                               ))}
                               {!isLoading && marketBreakdown.length === 0 && (
                                   <tr>
                                       <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B', fontWeight: 600, fontSize: 13 }}>NO MARKET DATA AVAILABLE</td>
                                   </tr>
                               )}
                           </tbody>
                       </table>
                   </div>
               </div>

               {/* Daily Trend */}
               <div>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                       <div style={{ width: 4, height: 16, background: '#818CF8', borderRadius: 2 }} />
                       <h2 style={{ fontSize: 16, fontWeight: 800, color: '#F8FAFC', margin: 0, letterSpacing: 1 }}>DAILY TREND (14D)</h2>
                   </div>
                   <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, overflowX: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                       <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', textAlign: 'left' }}>
                           <thead>
                               <tr style={{ background: 'rgba(30, 41, 59, 0.8)', color: '#94A3B8', fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
                                   <th style={{ padding: '16px', fontWeight: 800, borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>Date</th>
                                   <th style={{ padding: '16px', fontWeight: 800, textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>Games</th>
                                   <th style={{ padding: '16px', fontWeight: 800, textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>Brier (ML)</th>
                                   <th style={{ padding: '16px', fontWeight: 800, textAlign: 'center', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>ML ROI%</th>
                                   <th style={{ padding: '16px', fontWeight: 800, textAlign: 'right', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>Props ROI%</th>
                               </tr>
                           </thead>
                           <tbody>
                               {isLoading && dailyTrend.length === 0 ? (
                                   <tr>
                                       <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B', fontWeight: 600, fontSize: 13, letterSpacing: 1 }}>
                                           <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', marginBottom: 12, color: '#818CF8' }} />
                                           FETCHING TRENDS...
                                       </td>
                                   </tr>
                               ) : dailyTrend.map((row: any, idx: number) => (
                                   <tr key={idx} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.3)', fontSize: 13, transition: 'background 0.2s' } as any}>
                                       <td style={{ padding: '16px', color: '#94A3B8', fontWeight: 700, letterSpacing: 0.5 }}>{row.backtest_date}</td>
                                       <td style={{ padding: '16px', textAlign: 'center', color: '#E2E8F0', fontWeight: 600 }}>{row.games_evaluated}</td>
                                       <td style={{ padding: '16px', textAlign: 'center', color: '#10B981', fontWeight: 800 }}>{row.brier_score_ml ? row.brier_score_ml.toFixed(4) : '—'}</td>
                                       <td style={{ padding: '16px', textAlign: 'center', color: row.roi_ml >= 0 ? '#10B981' : (row.roi_ml < 0 ? '#EF4444' : '#64748B'), fontWeight: 800, textShadow: row.roi_ml >= 0 ? '0 0 10px rgba(16,185,129,0.2)' : 'none' }}>{formatPct(row.roi_ml)}</td>
                                       <td style={{ padding: '16px', textAlign: 'right', color: row.roi_props >= 0 ? '#10B981' : (row.roi_props < 0 ? '#EF4444' : '#64748B'), fontWeight: 800, textShadow: row.roi_props >= 0 ? '0 0 10px rgba(16,185,129,0.2)' : 'none' }}>{formatPct(row.roi_props)}</td>
                                   </tr>
                               ))}
                               {!isLoading && dailyTrend.length === 0 && (
                                   <tr>
                                       <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B', fontWeight: 600, fontSize: 13 }}>NO TREND DATA AVAILABLE</td>
                                   </tr>
                               )}
                           </tbody>
                       </table>
                   </div>
               </div>

           </div>
           
           <BottomNavBar />
        </div>
    );
}

