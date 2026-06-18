import React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, Loader2 } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function StatusPage() {
    const { data, error, isLoading } = useSWR('/api/mlb/status', fetcher, {
        refreshInterval: 15000,
    });

    const todayStr = data?.todayStr;
    const aggMarketAsOf = data?.aggMarketAsOf;
    const isSystemFresh = data?.isSystemFresh ?? true;
    const marketBetsCount = data?.marketBetsCount || 0;
    const propsCount = data?.propsCount || 0;
    const bestBetsCount = data?.bestBetsCount || 0;
    const latestRuns = data?.latestRuns || {};
    const sizes = data?.sizes || {};

    const timeAgo = (dateString: string) => {
        if (!dateString) return '';
        const now = new Date();
        const past = new Date(dateString);
        if (isNaN(past.getTime())) return '';
        const diffMs = now.getTime() - past.getTime();
        const diffMins = Math.max(0, Math.round(diffMs / 60000));
        if (diffMins < 60) return `${diffMins}M AGO`;
        const diffHrs = Math.round(diffMins / 60);
        if (diffHrs < 24) return `${diffHrs}H AGO`;
        const diffDays = Math.round(diffHrs / 24);
        return `${diffDays}D AGO`;
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return d.toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    };

    const stages = ['ingest', 'heal', 'evaluate', 'export', 'alert', 'track', 'grade_props', 'grade', 'push', 'predict'];

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
            <SEOHead 
                title="Data Status | MLB Analytics" 
                description="Check the current status and freshness of the MLB Analytics system."
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
                            <h1 className="m-0 mb-1 text-2xl md:text-[28px] font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif', letterSpacing: '0.05em' }}>DATA <span className="text-[#00D4FF]">STATUS</span></h1>
                            <p className="m-0 text-[13px] text-slate-400">System health, freshness, and database sizes.</p>
                        </div>
                        
                        <div className="flex flex-col items-end mt-2 md:mt-0">
                            <div className="text-[11px] font-bold tracking-[1px] text-[#00D4FF] mb-1">SYSTEM</div>
                            {isLoading ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider bg-[#1a2332] text-slate-400 border border-[#3d4f5f] flex items-center gap-1">
                                    <Loader2 size={10} className="animate-spin" /> EVALUATING
                                </span>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)] ${isSystemFresh ? 'bg-[#10B981] shadow-[0_0_8px_#10B981]' : 'bg-[#FF00FF] shadow-[0_0_8px_#FF00FF]'}`}></div>
                                    <div className={`text-[12px] font-extrabold tracking-widest ${isSystemFresh ? 'text-[#10B981]' : 'text-[#FF00FF]'}`} style={{ textShadow: isSystemFresh ? '0 0 10px rgba(16,185,129,0.5)' : '0 0 10px rgba(255,0,255,0.5)' }}>
                                        {isSystemFresh ? 'FRESH' : 'STALE'}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* DATA FRESHNESS */}
                <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 md:p-5 mb-6 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                    {/* Metal Frame Details */}
                    <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center"><span className="text-[6px] text-[#1a2a3a]">+</span></div>
                    <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center"><span className="text-[6px] text-[#1a2a3a]">+</span></div>
                    <div className="absolute bottom-2 left-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center"><span className="text-[6px] text-[#1a2a3a]">+</span></div>
                    <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center"><span className="text-[6px] text-[#1a2a3a]">+</span></div>

                    <div className="relative z-10">
                        <h2 className="text-[11px] font-extrabold text-slate-400 tracking-widest mb-3 uppercase">Data Freshness</h2>
                        <div className="bg-[#1a2332] rounded-lg border border-[#3d4f5f] overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                            <div className="flex justify-between items-center p-3 md:p-4 border-b border-[#3d4f5f]">
                                <span className="text-[12px] md:text-[13px] font-bold text-slate-400 uppercase tracking-wider">AGG Market as_of</span>
                                <span className={`text-[13px] md:text-[14px] font-extrabold ${isSystemFresh ? 'text-[#10B981]' : 'text-[#FF00FF]'}`} style={{ textShadow: isSystemFresh ? '0 0 10px rgba(16,185,129,0.3)' : '0 0 10px rgba(255,0,255,0.3)' }}>{isLoading ? '--' : (aggMarketAsOf || '-')}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 md:p-4">
                                <span className="text-[12px] md:text-[13px] font-bold text-slate-400 uppercase tracking-wider">Today</span>
                                <span className="text-[13px] md:text-[14px] font-extrabold text-[#00D4FF]" style={{ textShadow: '0 0 10px rgba(0,212,255,0.3)' }}>{isLoading ? '--' : (todayStr || '-')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* TODAY'S PREDICTIONS */}
                <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 md:p-5 mb-6 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                    <div className="relative z-10">
                        <h2 className="text-[11px] font-extrabold text-slate-400 tracking-widest mb-3 uppercase">Today's Predictions (Last 24H)</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div className="bg-[#1a2332] rounded-lg p-3 md:p-4 border border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] hover:border-[#00D4FF] transition-colors group">
                                <div className="text-[10px] text-slate-400 mb-2 font-bold uppercase tracking-wider">MARKET BETS</div>
                                <div className="text-2xl font-extrabold text-[#00D4FF] group-hover:text-white transition-colors" style={{ textShadow: '0 0 10px rgba(0,212,255,0.5)' }}>
                                    {isLoading ? '--' : marketBetsCount.toLocaleString()}
                                </div>
                            </div>
                            <div className="bg-[#1a2332] rounded-lg p-3 md:p-4 border border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] hover:border-[#00D4FF] transition-colors group">
                                <div className="text-[10px] text-slate-400 mb-2 font-bold uppercase tracking-wider">PROPS</div>
                                <div className="text-2xl font-extrabold text-[#00D4FF] group-hover:text-white transition-colors" style={{ textShadow: '0 0 10px rgba(0,212,255,0.5)' }}>
                                    {isLoading ? '--' : propsCount.toLocaleString()}
                                </div>
                            </div>
                            <div className="bg-[#1a2332] rounded-lg p-3 md:p-4 border border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] hover:border-[#00D4FF] transition-colors group col-span-2 md:col-span-1">
                                <div className="text-[10px] text-slate-400 mb-2 font-bold uppercase tracking-wider">BEST BETS</div>
                                <div className="text-2xl font-extrabold text-[#00D4FF] group-hover:text-white transition-colors" style={{ textShadow: '0 0 10px rgba(0,212,255,0.5)' }}>
                                    {isLoading ? '--' : bestBetsCount.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RECENT PIPELINE RUNS */}
                <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 md:p-5 mb-6 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                    <div className="relative z-10">
                        <h2 className="text-[11px] font-extrabold text-slate-400 tracking-widest mb-3 uppercase">Recent Pipeline Runs</h2>
                        <div className="flex flex-col gap-2">
                            {stages.map((stage) => {
                                const run = latestRuns?.[stage];
                                const isError = run?.status === 'error';
                                
                                return (
                                    <div key={stage} className={`bg-[#1a2332] border ${isError ? 'border-[#FF00FF]' : 'border-[#3d4f5f]'} rounded-lg p-3 flex flex-col md:flex-row md:justify-between md:items-center gap-2 hover:bg-[#1f2a3a] transition-colors`}>
                                        <div>
                                            <div className="text-[14px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{stage}</div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">{run ? formatDate(run.run_at) : 'No data'}</div>
                                        </div>
                                        {run && (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="bg-[#0d1117] border border-[#3d4f5f] text-[#00D4FF] px-2 py-1 rounded text-[10px] font-extrabold tracking-widest shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                                                    {timeAgo(run.run_at)}
                                                </div>
                                                <div className={`px-2 py-1 rounded text-[10px] font-extrabold tracking-widest border ${
                                                    isError 
                                                        ? 'bg-[#FF00FF]/20 text-[#FF00FF] border-[#FF00FF] shadow-[0_0_8px_rgba(255,0,255,0.3)]' 
                                                        : 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]'
                                                }`}>
                                                    {run.status.toUpperCase()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* DB TABLE SIZES */}
                <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-4 md:p-5 mb-6 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                    <div className="relative z-10">
                        <h2 className="text-[11px] font-extrabold text-slate-400 tracking-widest mb-3 uppercase">DB Table Sizes</h2>
                        <div className="bg-[#1a2332] rounded-lg border border-[#3d4f5f] overflow-x-auto shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                            <table className="w-full text-left text-[13px] whitespace-nowrap">
                                <thead>
                                    <tr className="border-b border-[#3d4f5f]">
                                        <th className="px-4 py-3 text-slate-400 font-bold uppercase tracking-wider text-[11px]">Table</th>
                                        <th className="px-4 py-3 text-slate-400 font-bold uppercase tracking-wider text-[11px] text-right">Rows</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-[#3d4f5f] hover:bg-[#1f2a3a] transition-colors">
                                        <td className="px-4 py-3 text-[13px] font-bold text-slate-300">Market Output</td>
                                        <td className="px-4 py-3 text-[13px] font-extrabold text-[#00D4FF] text-right" style={{ textShadow: '0 0 5px rgba(0,212,255,0.3)' }}>{isLoading ? '--' : (sizes?.market?.toLocaleString() || '-')}</td>
                                    </tr>
                                    <tr className="border-b border-[#3d4f5f] hover:bg-[#1f2a3a] transition-colors">
                                        <td className="px-4 py-3 text-[13px] font-bold text-slate-300">Props Output</td>
                                        <td className="px-4 py-3 text-[13px] font-extrabold text-[#00D4FF] text-right" style={{ textShadow: '0 0 5px rgba(0,212,255,0.3)' }}>{isLoading ? '--' : (sizes?.props?.toLocaleString() || '-')}</td>
                                    </tr>
                                    <tr className="border-b border-[#3d4f5f] hover:bg-[#1f2a3a] transition-colors">
                                        <td className="px-4 py-3 text-[13px] font-bold text-slate-300">Fact Games</td>
                                        <td className="px-4 py-3 text-[13px] font-extrabold text-[#00D4FF] text-right" style={{ textShadow: '0 0 5px rgba(0,212,255,0.3)' }}>{isLoading ? '--' : (sizes?.games?.toLocaleString() || '-')}</td>
                                    </tr>
                                    <tr className="hover:bg-[#1f2a3a] transition-colors">
                                        <td className="px-4 py-3 text-[13px] font-bold text-slate-300">Raw Odds</td>
                                        <td className="px-4 py-3 text-[13px] font-extrabold text-[#00D4FF] text-right" style={{ textShadow: '0 0 5px rgba(0,212,255,0.3)' }}>{isLoading ? '--' : (sizes?.odds?.toLocaleString() || '-')}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>
            <BottomNavBar />
        </div>
    );
}
