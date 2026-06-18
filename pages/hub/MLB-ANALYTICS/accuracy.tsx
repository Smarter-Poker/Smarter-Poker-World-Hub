import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, Loader2, Activity } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function AccuracyPage() {
    const { data, error, isLoading } = useSWR('/api/mlb/accuracy', fetcher, {
        refreshInterval: 15000,
    });

    const tableData = data?.tableData || [];
    const kpi = data?.kpi || { n: 0, clv: '0.00', roi: '0.0', brier: '0.000' };
    const [filter, setFilter] = useState('All');

    // Filter table
    const filteredTable = tableData.filter((row: any) => {
        if (filter === 'All') return true;
        const type = row.market?.toLowerCase() || '';
        if (filter === 'Moneyline' && (type === 'h2h' || type === 'f5_moneyline')) return true;
        if (filter === 'Totals' && (type === 'total' || type === 'team_total')) return true;
        if (filter === 'Run Line' && type === 'run_line') return true;
        if (filter === 'Props' && !['h2h', 'f5_moneyline', 'total', 'team_total', 'run_line'].includes(type)) return true;
        return false;
    });

    const isGatePassed = kpi.n >= 300 && Number(kpi.roi) > -3.0 && Number(kpi.brier) < 0.23;

    if (error || data?.error) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Error" description="Data fetch failed" />
                <UniversalHeader pageDepth={2} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF00FF]/50 shadow-[0_0_20px_rgba(255,0,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        {/* Use an appropriate icon below, e.g., Target, Activity, Shield */}
                        <Activity className="w-12 h-12 text-[#FF00FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF00FF] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load data. Please try again later.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title="Model Performance | MLB Analytics" 
               description="MLB Analytics Model Performance and backtest results. Track CLV, Brier Scores, and ROI for predictive models." 
               noIndex={true}
           />
           <UniversalHeader pageDepth={2} />
           <MlbSubNav />

           <div className="p-4 max-w-4xl mx-auto w-full box-border">
                <div className="mb-6">
                    <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-1 text-[#00D4FF] text-[13px] font-bold tracking-wide mb-3 hover:text-white transition-colors uppercase" style={{ textShadow: '0 0 10px rgba(0,212,255,0.4)' }}>
                        <ArrowLeft size={16} /> Dashboard
                    </Link>
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                        <div>
                            <h1 className="m-0 mb-1 text-2xl md:text-[28px] font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif', letterSpacing: '0.05em' }}>MODEL PERFORMANCE</h1>
                            <p className="m-0 text-[13px] text-slate-400">CLV-first scoring. Populated nightly once games settle.</p>
                        </div>
                        <div className="flex flex-wrap gap-1 bg-[#0d1117] p-1 rounded-lg border border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                            {['All', 'Moneyline', 'Totals', 'Run Line', 'Props'].map(f => (
                                <button 
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    aria-label={`Filter by ${f}`}
                                    className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-all uppercase tracking-wider ${
                                        filter === f 
                                            ? 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] text-[#00D4FF] border border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' 
                                            : 'bg-transparent text-slate-400 hover:text-white border border-transparent'
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 md:p-5 mb-6 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                    {/* Metal Frame Details */}
                    <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center"><span className="text-[6px] text-[#1a2a3a]">+</span></div>
                    <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center"><span className="text-[6px] text-[#1a2a3a]">+</span></div>
                    <div className="absolute bottom-2 left-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center"><span className="text-[6px] text-[#1a2a3a]">+</span></div>
                    <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center"><span className="text-[6px] text-[#1a2a3a]">+</span></div>

                    <div className="relative z-10">
                        <div className="flex justify-between items-center mb-5 border-b border-[#3d4f5f] pb-3">
                            <div className="flex items-center gap-3">
                                <h2 className="m-0 text-base font-bold text-white uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Lock-In Gate</h2>
                                {isLoading && !data ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider bg-[#1a2332] text-slate-400 border border-[#3d4f5f] flex items-center gap-1">
                                        <Loader2 size={10} className="animate-spin" /> LOADING
                                    </span>
                                ) : (
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider border ${
                                        isGatePassed ? 'bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' : 'bg-[#FFD700]/20 text-[#FFD700] border-[#FFD700]'
                                    }`}>
                                        {isGatePassed ? 'PASSED' : 'EVALUATING'}
                                    </span>
                                )}
                            </div>
                            <div className="text-[10px] font-bold text-[#00D4FF] tracking-widest hidden sm:block">
                                REQUIRED FOR REAL-MONEY PLAY
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {/* Sample Size */}
                            <div className={`bg-[#1a2332] rounded-lg p-3 md:p-4 border shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] ${kpi.n >= 300 ? 'border-[#00D4FF]' : 'border-[#3d4f5f]'}`}>
                                <div className="text-[10px] text-slate-400 mb-2 font-bold uppercase tracking-wider">Sample Size (n≥300)</div>
                                <div className={`text-2xl font-extrabold ${kpi.n >= 300 ? 'text-[#00D4FF]' : 'text-white'}`} style={{ textShadow: kpi.n >= 300 ? '0 0 10px rgba(0,212,255,0.5)' : 'none' }}>
                                    {isLoading && !data ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#00D4FF]" /> : kpi.n}
                                </div>
                            </div>
                            {/* Avg CLV */}
                            <div className={`bg-[#1a2332] rounded-lg p-3 md:p-4 border shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] ${Number(kpi.clv) > 0 ? 'border-[#00D4FF]' : 'border-[#3d4f5f]'}`}>
                                <div className="text-[10px] text-slate-400 mb-2 font-bold uppercase tracking-wider">Avg CLV (&gt;0 pts)</div>
                                <div className={`text-2xl font-extrabold ${Number(kpi.clv) > 0 ? 'text-[#00D4FF]' : 'text-white'}`} style={{ textShadow: Number(kpi.clv) > 0 ? '0 0 10px rgba(0,212,255,0.5)' : 'none' }}>
                                    {isLoading && !data ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#00D4FF]" /> : kpi.clv}
                                </div>
                            </div>
                            {/* Expected ROI */}
                            <div className={`bg-[#1a2332] rounded-lg p-3 md:p-4 border shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] ${Number(kpi.roi) > -3 ? 'border-[#00D4FF]' : 'border-[#3d4f5f]'}`}>
                                <div className="text-[10px] text-slate-400 mb-2 font-bold uppercase tracking-wider">Expected ROI (&gt;-3%)</div>
                                <div className={`text-2xl font-extrabold ${Number(kpi.roi) > -3 ? 'text-[#00D4FF]' : 'text-[#FF00FF]'}`} style={{ textShadow: Number(kpi.roi) > -3 ? '0 0 10px rgba(0,212,255,0.5)' : '0 0 10px rgba(255,0,255,0.5)' }}>
                                    {isLoading && !data ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#00D4FF]" /> : `${Number(kpi.roi) > 0 ? '+' : ''}${kpi.roi}%`}
                                </div>
                            </div>
                            {/* Brier Score */}
                            <div className={`bg-[#1a2332] rounded-lg p-3 md:p-4 border shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] ${Number(kpi.brier) < 0.23 ? 'border-[#00D4FF]' : 'border-[#3d4f5f]'}`}>
                                <div className="text-[10px] text-slate-400 mb-2 font-bold uppercase tracking-wider">Brier Score (&lt;0.23)</div>
                                <div className={`text-2xl font-extrabold ${Number(kpi.brier) < 0.23 ? 'text-[#00D4FF]' : 'text-[#FF00FF]'}`} style={{ textShadow: Number(kpi.brier) < 0.23 ? '0 0 10px rgba(0,212,255,0.5)' : '0 0 10px rgba(255,0,255,0.5)' }}>
                                    {isLoading && !data ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#00D4FF]" /> : kpi.brier}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px] whitespace-nowrap">
                            <thead>
                                <tr className="bg-[#1a2332] border-b-2 border-[#3d4f5f] text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                                    <th className="px-4 py-4">Date</th>
                                    <th className="px-4 py-4">Market</th>
                                    <th className="px-4 py-4 text-right">n</th>
                                    <th className="px-4 py-4 text-right">Brier</th>
                                    <th className="px-4 py-4 text-right">Avg CLV</th>
                                    <th className="px-4 py-4 text-right">ROI</th>
                                </tr>
                            </thead>
                            <tbody className="bg-[#0a0a15]">
                                {isLoading && !data ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mx-auto mb-2" />
                                                <span className="text-[13px] font-extrabold text-[#00D4FF] tracking-widest uppercase animate-pulse">SCANNING DATABASE...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredTable.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500 font-medium border-t border-[#1a2332]">
                                            No data available for the selected filter.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTable.map((row: any, i: number) => (
                                        <tr key={`${row.date}-${row.market}-${i}`} className="border-b border-[#1a2332] last:border-b-0 hover:bg-[#1a2332] transition-colors">
                                            <td className="px-4 py-3.5 font-bold text-slate-300">{row.date}</td>
                                            <td className="px-4 py-3.5">
                                                <span className="bg-[#0d1117] border border-[#3d4f5f] px-2 py-1 rounded-sm text-[10px] text-slate-300 font-bold uppercase tracking-widest shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                                                    {row.market}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-slate-400 text-right font-medium">{row.n}</td>
                                            <td className="px-4 py-3.5 text-slate-300 text-right font-bold">
                                                {row.brier !== null ? Number(row.brier).toFixed(3) : '—'}
                                            </td>
                                            <td className="px-4 py-3.5 text-slate-300 text-right font-bold">
                                                {row.avg_clv !== null ? Number(row.avg_clv).toFixed(2) : '—'}
                                            </td>
                                            <td className={`px-4 py-3.5 text-right font-extrabold ${Number(row.roi) > 0 ? 'text-[#00D4FF]' : (Number(row.roi) < 0 ? 'text-[#FF00FF]' : 'text-white')}`} style={{ textShadow: Number(row.roi) > 0 ? '0 0 5px rgba(0,212,255,0.5)' : (Number(row.roi) < 0 ? '0 0 5px rgba(255,0,255,0.5)' : 'none') }}>
                                                {row.roi !== null ? `${Number(row.roi) > 0 ? '+' : ''}${Number(row.roi).toFixed(1)}%` : '—'}
                                            </td>
                                        </tr>
                                    ))
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
