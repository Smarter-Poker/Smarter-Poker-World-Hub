import React from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { RefreshCw, Activity, Database, Clock, ServerCrash, CheckCircle2, Loader2 } from 'lucide-react';
import { logError } from '@/utils/logger';

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

export default function StatusPage() {
    const router = useRouter();
    const { data, error, mutate, isValidating } = useSWR('/api/mlb/status', fetcher, {
        refreshInterval: 60000,
        revalidateOnFocus: true,
    });

    const isLoading = !data && !error;

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

    const isSystemFresh = data && !data.error ? !!data.isSystemFresh : false;
    const stages = data?.stages || ['ingest', 'heal', 'evaluate', 'export', 'alert', 'track', 'grade_props', 'grade', 'push', 'predict'];

    if (error || data?.error) {
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
                title="Data Status | MLB Analytics" 
                description="Check the current status and freshness of the MLB Analytics system."
                noIndex={true}
            />

            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />

            {/* Sub-header for Data Status Page */}
            <div className="bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-[2px] border-[#3d4f5f] p-4 flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <div>
                    <h1 className="m-0 text-2xl font-bold uppercase tracking-widest">
                        Data <span className="text-[#00D4FF]" style={{ textShadow: '0 0 10px rgba(0, 212, 255, 0.6)' }}>Status</span>
                    </h1>
                </div>
                <div className="text-right flex flex-col items-end">
                    <div className="text-[#00D4FF] text-[11px] font-bold tracking-widest uppercase">SYSTEM</div>
                    <div className="inline-flex items-center gap-1.5 mt-1">
                        <div className={`w-2 h-2 rounded-full ${isSystemFresh ? 'bg-[#00D4FF] shadow-[0_0_10px_#00D4FF]' : 'bg-[#00D4FF] shadow-[0_0_10px_#00D4FF]'}`}></div>
                        <div className={`text-xs font-bold tracking-widest ${isSystemFresh ? 'text-[#00D4FF]' : 'text-[#00D4FF]'}`} style={{ textShadow: isSystemFresh ? '0 0 5px rgba(0,212,255,0.5)' : '0 0 5px rgba(0,212,255,0.5)' }}>
                            {isSystemFresh ? 'FRESH' : 'STALE'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-4 py-6 max-w-4xl mx-auto w-full">
                
                <div className="flex justify-end mb-4">
                    <button 
                        onClick={() => mutate()}
                        disabled={isValidating}
                        className={`bg-transparent border border-[#3d4f5f] text-[#00D4FF] px-3 py-1.5 rounded flex items-center gap-2 cursor-pointer text-xs font-bold tracking-widest uppercase transition-colors hover:bg-white/5 ${isValidating ? 'opacity-50' : ''}`}
                    >
                        <RefreshCw size={14} className={isValidating ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 animate-pulse shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                                <div className="h-3 w-1/2 bg-[#3d4f5f] rounded mb-3"></div>
                                <div className="h-8 w-3/4 bg-[#3d4f5f] rounded"></div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        {/* DATA FRESHNESS */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-3">
                                <Clock size={16} className="text-[#00D4FF]" />
                                <h2 className="text-[13px] font-bold text-[#00D4FF] tracking-[0.15em] m-0" style={{ textShadow: '0 0 8px rgba(0,212,255,0.3)' }}>DATA FRESHNESS</h2>
                            </div>
                            <div className="relative bg-gradient-to-b from-[#3d4f5f] via-[#1a2332] to-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden">
                                <div className="flex justify-between px-6 py-4 border-b border-[#2a3a4a] bg-black/20">
                                    <span className="text-[13px] font-semibold text-slate-400 tracking-wider">AGG MARKET AS_OF</span>
                                    <span className={`text-[14px] font-bold ${isSystemFresh ? 'text-[#00D4FF]' : 'text-[#00D4FF]'}`} style={{ textShadow: isSystemFresh ? '0 0 8px rgba(0,212,255,0.5)' : '0 0 8px rgba(0,212,255,0.5)' }}>{data?.aggMarketAsOf || '-'}</span>
                                </div>
                                <div className="flex justify-between px-6 py-4 bg-black/20">
                                    <span className="text-[13px] font-semibold text-slate-400 tracking-wider">TODAY</span>
                                    <span className="text-[14px] font-bold text-[#00D4FF]" style={{ textShadow: '0 0 8px rgba(0,212,255,0.5)' }}>{data?.todayStr || '-'}</span>
                                </div>
                            </div>
                        </div>

                        {/* TODAY'S PREDICTIONS */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-3">
                                <Activity size={16} className="text-[#00D4FF]" />
                                <h2 className="text-[13px] font-bold text-[#00D4FF] tracking-[0.15em] m-0" style={{ textShadow: '0 0 8px rgba(0,212,255,0.3)' }}>TODAY'S PREDICTIONS (LAST 24H)</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[
                                    { label: 'MARKET BETS', val: data?.marketBetsCount },
                                    { label: 'PROPS', val: data?.propsCount },
                                    { label: 'BEST BETS', val: data?.bestBetsCount }
                                ].map((item, idx) => (
                                    <div key={idx} className="relative bg-gradient-to-b from-[#3d4f5f] via-[#1a2332] to-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_20px_rgba(0,0,0,0.5)] p-5 text-center">
                                        <div className="text-[11px] font-bold text-slate-400 tracking-[0.15em] mb-2">{item.label}</div>
                                        <div className="text-3xl font-bold text-[#00D4FF]" style={{ textShadow: '0 0 15px rgba(0,212,255,0.6)' }}>
                                            {item.val?.toLocaleString() || 0}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* RECENT PIPELINE RUNS */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-3">
                                <CheckCircle2 size={16} className="text-[#00D4FF]" />
                                <h2 className="text-[13px] font-bold text-[#00D4FF] tracking-[0.15em] m-0" style={{ textShadow: '0 0 8px rgba(0,212,255,0.3)' }}>RECENT PIPELINE RUNS</h2>
                            </div>
                            <div className="flex flex-col gap-3">
                                {stages.map((stage: string) => {
                                    const run = data?.latestRuns?.[stage];
                                    const isError = run?.status === 'error';
                                    const glowColor = isError ? 'text-[#00D4FF]' : 'text-[#00D4FF]';
                                    const borderGlowColor = isError ? 'border-[#00D4FF]' : 'border-[#00D4FF]';
                                    const bgShadow = isError ? 'shadow-[0_0_10px_rgba(0,212,255,0.3)]' : 'shadow-[0_0_10px_rgba(0,212,255,0.3)]';
                                    
                                    return (
                                        <div key={stage} className="relative bg-gradient-to-b from-[#3d4f5f] via-[#1a2332] to-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_20px_rgba(0,0,0,0.5)] px-5 py-4 flex justify-between items-center bg-black/30">
                                            <div>
                                                <div className="text-[15px] font-bold text-white uppercase tracking-wider">{stage}</div>
                                                <div className="text-[11px] text-slate-400 mt-1 tracking-wider font-mono">{run ? formatDate(run.run_at) : 'NO DATA FOUND'}</div>
                                            </div>
                                            {run && (
                                                <div className="flex gap-2 items-center">
                                                    <div className="text-slate-400 text-[11px] font-bold tracking-wider font-mono">
                                                        {timeAgo(run.run_at)}
                                                    </div>
                                                    <div className={`bg-black/50 ${glowColor} border ${borderGlowColor} px-2.5 py-1 rounded text-[10px] font-bold tracking-[0.2em] ${bgShadow}`}>
                                                        {run.status.toUpperCase()}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>



                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-3">
                                <Database size={16} className="text-[#00D4FF]" />
                                <h2 className="text-[13px] font-bold text-[#00D4FF] tracking-[0.15em] m-0" style={{ textShadow: '0 0 8px rgba(0,212,255,0.3)' }}>DB TABLE SIZES</h2>
                            </div>
                            <div className="relative bg-gradient-to-b from-[#3d4f5f] via-[#1a2332] to-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden">
                                {data?.tables && Object.keys(data.tables).length > 0 ? (
                                    <div className="flex flex-col">
                                        {Object.entries(data.tables).map(([table, count]: any, idx, arr) => (
                                            <div key={table} className={`flex justify-between px-6 py-4 bg-black/20 ${idx !== arr.length - 1 ? 'border-b border-[#2a3a4a]' : ''}`}>
                                                <span className="text-[13px] font-semibold text-slate-400 tracking-wider font-mono">{table}</span>
                                                <span className="text-[14px] font-bold text-[#00D4FF]">{count.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-6 text-center text-slate-500 font-bold tracking-wider text-[11px] uppercase">
                                        NO TABLE DATA AVAILABLE
                                    </div>
                                )}
                            </div>
                        </div>

                    </>
                )}
            </div>
            <BottomNavBar />
        </div>
    );
}
