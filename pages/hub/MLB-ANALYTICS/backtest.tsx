import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ArrowRight, Loader2, Target, BarChart3, TrendingUp, DollarSign } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function BacktestPage() {
    const { data, error, isLoading } = useSWR('/api/mlb/backtest', fetcher, {
        refreshInterval: 60000,
    });

    if (error || data?.error) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Backtest - Error" description="Data fetch failed" />
                <UniversalHeader pageDepth={2} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF00FF]/50 shadow-[0_0_20px_rgba(255,0,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        <Target className="w-12 h-12 text-[#FF00FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF00FF] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load data. Please try again later.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    const formatPct = (val: any) => val === null || val === undefined || isNaN(val) ? '—' : `${Number(val) > 0 ? '+' : ''}${Number(val).toFixed(1)}%`;
    const formatNum = (val: any) => val === null || val === undefined || isNaN(val) ? '—' : val.toLocaleString();

    const dailyTrend = data?.dailyTrend || [];
    const marketBreakdown = data?.marketBreakdown || [];
    const stats = data?.stats || {
        totalPredictions: 0, wonBets: 0, lostBets: 0, winRate: 0, avgBrier: 0,
        brierVsBaseline: 0, cumulativeRoi: 0, unitsWon: 0, avgClv: 0
    };

    // Lock-in Gate evaluation
    const sampleSizePassed = Number(stats.totalPredictions) >= 500;
    const brierPassed = Number(stats.avgBrier) < 0.23 && Number(stats.avgBrier) > 0;
    const roiPassed = Number(stats.cumulativeRoi) > -3.0;
    const clvPassed = Number(stats.avgClv) > 0;
    const gatesPassed = [sampleSizePassed, brierPassed, roiPassed, clvPassed].filter(Boolean).length;
    
    const GateCard = ({ label, target, value, passed, isPct = false, isBrier = false }: any) => (
        <div className={`relative bg-[#0d1117] border-[2px] ${passed ? 'border-[#00D4FF]' : 'border-[#FF00FF]/50'} rounded-lg p-3 shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)] transition-all`}>
            {passed && <div className="absolute top-0 right-0 w-8 h-8 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[15px] opacity-20"></div>}
            <div className="text-[9px] font-bold text-slate-400 tracking-widest uppercase mb-1">{label} ({target})</div>
            <div className={`text-xl font-extrabold ${passed ? 'text-[#00D4FF]' : 'text-slate-300'}`} style={passed ? { textShadow: '0 0 5px rgba(0,212,255,0.4)', fontFamily: '"Rajdhani", sans-serif' } : { fontFamily: '"Rajdhani", sans-serif' }}>
                {isPct ? formatPct(value) : (isBrier ? (value != null ? Number(value).toFixed(4) : '0.0000') : formatNum(value))}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title="Backtest Results | MLB Analytics" 
               description="Live market evaluation and backtest results for MLB models."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} />
           <MlbSubNav />

           <div className="p-4 w-full max-w-4xl mx-auto box-border relative">
               {/* Background Glows */}
               <div className="absolute top-20 right-0 w-96 h-96 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.03] pointer-events-none"></div>
               <div className="absolute bottom-40 left-0 w-96 h-96 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.02] pointer-events-none"></div>

               {/* Header Section */}
               <div className="mb-6">
                   <Link href="/hub/MLB-ANALYTICS/accuracy" className="inline-flex items-center gap-1 text-[#00D4FF] text-[10px] font-extrabold tracking-widest uppercase hover:text-white transition-colors mb-2">
                       <ArrowLeft size={14} /> Accuracy
                   </Link>
                   <div className="flex justify-between items-center bg-[#0d1117] border border-[#3d4f5f] p-5 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                       <div>
                           <h1 className="m-0 text-2xl md:text-3xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>Backtest Results</h1>
                           <div className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Live Market Evaluation</div>
                       </div>
                       <Link href="/hub/MLB-ANALYTICS/accuracy" className="bg-[#1a2332] text-[#00D4FF] border border-[#00D4FF]/30 hover:border-[#00D4FF] px-4 py-2 rounded-sm text-[11px] font-extrabold uppercase tracking-widest flex items-center gap-2 transition-all hover:shadow-[0_0_10px_rgba(0,212,255,0.3)]">
                           Live Accuracy <ArrowRight size={14} />
                       </Link>
                   </div>
               </div>

                {isLoading && !data ? (
                    <div className="text-center py-20 bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                        <Loader2 className="w-12 h-12 animate-spin text-[#00D4FF] mx-auto mb-4" />
                        <div className="text-[14px] font-extrabold text-[#00D4FF] tracking-widest uppercase animate-pulse">CALCULATING MATRICES...</div>
                    </div>
                ) : (error || data?.error) ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-[#131420] border-[3px] border-[#ef4444]/50 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)] mb-8">
                        <div className="text-[13px] font-extrabold text-[#ef4444] tracking-[1px] mb-2 uppercase">System Error Detected</div>
                        <div className="text-sm text-slate-400 max-w-[300px] text-center">
                            Failed to load backtest evaluation data. The database connection might be unavailable.
                        </div>
                    </div>
                ) : (
                   <>
                       {/* Top Metric Cards */}
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                           <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                               <div className="absolute top-0 right-0 p-2 opacity-10 text-white"><Target size={40} /></div>
                               <div className="text-[10px] font-extrabold text-slate-400 tracking-widest mb-2 uppercase">TOTAL PREDICTIONS</div>
                               <div className="text-2xl font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{formatNum(stats.totalPredictions)}</div>
                               <div className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">resolved bets</div>
                           </div>
                           <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                               <div className="absolute top-0 right-0 p-2 opacity-10 text-white"><TrendingUp size={40} /></div>
                               <div className="text-[10px] font-extrabold text-slate-400 tracking-widest mb-2 uppercase">OVERALL WIN RATE</div>
                               <div className="text-2xl font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{stats.winRate != null ? Number(stats.winRate).toFixed(1) : '0.0'}%</div>
                               <div className="text-[10px] font-bold text-[#00D4FF] mt-1 uppercase tracking-widest">{stats.wonBets || 0} W / {stats.lostBets || 0} L</div>
                           </div>
                           <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                               <div className="absolute top-0 right-0 p-2 opacity-10 text-[#FF00FF]"><BarChart3 size={40} /></div>
                               <div className="text-[10px] font-extrabold text-slate-400 tracking-widest mb-2 uppercase">AVG BRIER (0.25)</div>
                               <div className="text-2xl font-extrabold text-[#FF00FF]" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 5px rgba(255,0,255,0.3)' }}>{stats.avgBrier != null ? Number(stats.avgBrier).toFixed(4) : '0.0000'}</div>
                               <div className={`text-[10px] font-bold mt-1 uppercase tracking-widest ${Number(stats.brierVsBaseline) < 0 ? 'text-[#00D4FF]' : 'text-slate-500'}`}>
                                   {Number(stats.brierVsBaseline) >= 0 ? '+' : ''}{stats.brierVsBaseline != null ? Number(stats.brierVsBaseline).toFixed(4) : '0.0000'} vs base
                               </div>
                           </div>
                           <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                               <div className="absolute top-0 right-0 p-2 opacity-10 text-emerald-400"><DollarSign size={40} /></div>
                               <div className="text-[10px] font-extrabold text-slate-400 tracking-widest mb-2 uppercase">CUMULATIVE ML ROI</div>
                               <div className={`text-2xl font-extrabold ${Number(stats.cumulativeRoi) >= 0 ? 'text-[#00D4FF]' : 'text-slate-300'}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>{formatPct(stats.cumulativeRoi)}</div>
                               <div className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">{Number(stats.unitsWon) > 0 ? '+' : ''}{stats.unitsWon != null ? Number(stats.unitsWon).toFixed(2) : '0.00'}u profit</div>
                           </div>
                       </div>

                       {/* Lock-In Gate */}
                       <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-5 mb-8 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                           <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#3d4f5f]">
                               <div className="flex items-center gap-3">
                                   <h2 className="m-0 text-base md:text-lg font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Lock-In Gate</h2>
                                   <span className="bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30 text-[9px] font-extrabold px-2 py-0.5 rounded-sm tracking-widest uppercase shadow-[0_0_5px_rgba(255,215,0,0.2)]">EVALUATING</span>
                               </div>
                               <div className="text-[9px] font-bold text-slate-500 tracking-widest uppercase hidden md:block">
                                   REQUIRED BEFORE REAL-MONEY PLAY
                               </div>
                           </div>
                           
                           <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                               <GateCard label="Sample Size" target="n≥500" value={stats.totalPredictions} passed={sampleSizePassed} />
                               <GateCard label="Brier Score" target="<0.23" value={stats.avgBrier} passed={brierPassed} isBrier={true} />
                               <GateCard label="ML ROI" target=">-3%" value={stats.cumulativeRoi} passed={roiPassed} isPct={true} />
                               <GateCard label="Avg CLV" target=">0 pts" value={stats.avgClv} passed={clvPassed} />
                               
                               <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] flex flex-col justify-center items-center text-center">
                                   <div className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase mb-1">All Gates</div>
                                   <div className={`text-xl font-extrabold ${gatesPassed === 4 ? 'text-[#00D4FF]' : 'text-[#FFD700]'}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                       {gatesPassed === 4 ? 'PASSED' : 'PENDING'}
                                   </div>
                                   <div className="text-[10px] font-bold text-slate-500 mt-1 tracking-widest uppercase">{gatesPassed}/4 passed</div>
                               </div>
                           </div>
                       </div>

                       {/* Market Breakdown */}
                       <div className="mb-8">
                           <h2 className="text-base font-extrabold text-white mb-4 uppercase tracking-widest pl-2 border-l-[3px] border-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Market Breakdown</h2>
                           <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-xl overflow-x-auto shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
                               <table className="w-full min-w-[600px] text-left border-collapse">
                                   <thead>
                                       <tr className="bg-[#1a2332] border-b border-[#3d4f5f]">
                                           <th className="p-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Market</th>
                                           <th className="p-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-center">n</th>
                                           <th className="p-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-center">Win Rate</th>
                                           <th className="p-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-center">Avg Brier</th>
                                           <th className="p-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-right">ROI%</th>
                                       </tr>
                                   </thead>
                                   <tbody>
                                       {marketBreakdown.map((row: any, idx: number) => (
                                           <tr key={idx} className="border-b border-[#3d4f5f] hover:bg-[#1a2332]/50 transition-colors">
                                               <td className="p-4">
                                                    <span className="bg-[#1a2332] border border-[#3d4f5f] px-2 py-1 rounded-sm text-[11px] font-extrabold text-slate-300 uppercase tracking-widest shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">{row.market}</span>
                                               </td>
                                               <td className="p-4 text-center font-bold text-slate-400 text-sm">{row.n}</td>
                                               <td className="p-4 text-center font-bold text-white text-sm">{row.winRate != null ? Number(row.winRate).toFixed(1) : '0.0'}%</td>
                                               <td className="p-4 text-center font-extrabold text-[#FF00FF] text-sm" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{row.avgBrier ? Number(row.avgBrier).toFixed(4) : '—'}</td>
                                               <td className={`p-4 text-right font-extrabold text-sm ${Number(row.roi) >= 0 ? 'text-[#00D4FF]' : 'text-slate-400'}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>{formatPct(row.roi)}</td>
                                           </tr>
                                       ))}
                                       {marketBreakdown.length === 0 && (
                                           <tr>
                                               <td colSpan={5} className="p-8 text-center text-slate-500 font-bold text-xs uppercase tracking-widest">No market data available</td>
                                           </tr>
                                       )}
                                   </tbody>
                               </table>
                           </div>
                       </div>

                       {/* Daily Trend */}
                       <div className="mb-4">
                           <h2 className="text-base font-extrabold text-white mb-4 uppercase tracking-widest pl-2 border-l-[3px] border-[#FF00FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Daily Trend — Last 14 Days</h2>
                           <div className="bg-[#0d1117] border border-[#3d4f5f] rounded-xl overflow-x-auto shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
                               <table className="w-full min-w-[600px] text-left border-collapse">
                                   <thead>
                                       <tr className="bg-[#1a2332] border-b border-[#3d4f5f]">
                                           <th className="p-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Date</th>
                                           <th className="p-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-center">Games</th>
                                           <th className="p-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-center">Brier (ML)</th>
                                           <th className="p-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-center">ML ROI%</th>
                                           <th className="p-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-right">Props ROI%</th>
                                       </tr>
                                   </thead>
                                   <tbody>
                                       {dailyTrend.map((row: any, idx: number) => (
                                           <tr key={idx} className="border-b border-[#3d4f5f] hover:bg-[#1a2332]/50 transition-colors">
                                               <td className="p-4 font-bold text-slate-300 text-sm tracking-widest">{row.backtest_date}</td>
                                               <td className="p-4 text-center font-bold text-slate-400 text-sm">{row.games_evaluated}</td>
                                               <td className="p-4 text-center font-extrabold text-[#FF00FF] text-sm" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{row.brier_score_ml ? Number(row.brier_score_ml).toFixed(4) : '—'}</td>
                                               <td className={`p-4 text-center font-extrabold text-sm ${Number(row.roi_ml) >= 0 ? 'text-[#00D4FF]' : (Number(row.roi_ml) < 0 ? 'text-slate-500' : 'text-slate-400')}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>{formatPct(row.roi_ml)}</td>
                                               <td className={`p-4 text-right font-extrabold text-sm ${Number(row.roi_props) >= 0 ? 'text-[#00D4FF]' : (Number(row.roi_props) < 0 ? 'text-slate-500' : 'text-slate-400')}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>{formatPct(row.roi_props)}</td>
                                           </tr>
                                       ))}
                                       {dailyTrend.length === 0 && (
                                           <tr>
                                               <td colSpan={5} className="p-8 text-center text-slate-500 font-bold text-xs uppercase tracking-widest">No daily trend data available</td>
                                           </tr>
                                       )}
                                   </tbody>
                               </table>
                           </div>
                       </div>
                   </>
               )}
           </div>
           
           <BottomNavBar />
        </div>
    );
}
