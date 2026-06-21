import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { RefreshCw, Activity, Database, Clock, ServerCrash, CheckCircle2, AlertTriangle, Gauge, Layers, Bell } from 'lucide-react';
import { logError } from '@/utils/logger';

interface MLBStatusPayload {
    ok: boolean;
    error?: string;
    serverNow: string | null;
    today: string | null;
    aggAsOf: string | null;
    isSystemFresh: boolean;
    pipeline: {
        okCount: number;
        errorCount: number;
        total: number;
        hasError: boolean;
    };
    health: {
        minutes_since_refresh?: number | null;
        last_refresh?: string | null;
        is_stale?: boolean;
        slate_as_of?: string | null;
        games_in_run?: number | null;
        games_in_slate?: number | null;
        total_live_recs?: number | null;
        unmodeled_games?: number | null;
        incoherent_runlines_with_bet?: number | null;
    };
    slate: {
        mkt?: number | null;
        props?: number | null;
        best?: number | null;
    };
    accuracy: {
        wtd_avg_brier_ml?: number | null;
        wtd_avg_brier_props?: number | null;
        total_games_evaluated?: number | null;
        daily_samples?: number | null;
    };
    tierDist: Record<string, number>;
    sources: Array<{
        source: string;
        status: string;
        pulled_at?: string | null;
        row_count?: number | null;
    }>;
    alerts: Array<{
        id?: number;
        created_at?: string | null;
        alert_type?: string;
        level?: string;
        message?: string;
        source?: string;
        fired_at?: string | null;
    }>;
    tableCounts: Record<string, number>;
    stages: string[];
    latestRuns: Record<string, {
        step: string;
        stage: string;
        run_ts: string | null;
        status: string;
        duration_sec: number | null;
        rows_written: number | null;
        notes: string | null;
    }>;
}

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

// Human-readable labels for pipeline source keys (matches engine SOURCE_ROWS constant).
const SOURCE_LABEL_MAP: Record<string, string> = {
    daily_predict: 'Predictions',
    odds_api: 'Sportsbook Odds',
    mlb_api: 'MLB API (Schedule/Lineups)',
    fangraphs: 'FanGraphs',
    fangraphs_splits: 'FanGraphs Splits',
    statcast: 'Statcast',
    injuries: 'Injuries',
    weather: 'Weather',
    umpire_scorecards: 'Umpire Scorecards',
};

// Tier rendering order + accent colors (inline styles so Tailwind JIT keeps them).
const TIER_META: { key: string; color: string }[] = [
    { key: 'ELITE', color: '#FFD24A' },
    { key: 'STRONG', color: '#00D4FF' },
    { key: 'LEAN', color: '#5BE0B0' },
    { key: 'THIN', color: '#94a3b8' },
    { key: 'PASS', color: '#64748b' }
];

const TimeAgo = ({ dateString, fallback = '' }: { dateString: string | null | undefined, fallback?: string }) => {
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNowMs(Date.now()), 15000);
        return () => clearInterval(id);
    }, []);

    if (!dateString) return <>{fallback}</>;
    const safeDate = dateString.endsWith('Z') || dateString.includes('+') ? dateString : dateString + 'Z';
    const past = new Date(safeDate);
    if (isNaN(past.getTime())) return <>{fallback}</>;
    const diffMs = Math.max(0, nowMs - past.getTime());
    const s = Math.round(diffMs / 1000);
    if (s < 45) return <>{'Just Now'}</>;
    const m = Math.round(s / 60);
    if (m < 60) return <>{`${m}m Ago`}</>;
    const h = Math.round(m / 60);
    if (h < 24) return <>{`${h}h Ago`}</>;
    const dd = Math.round(h / 24);
    return <>{`${dd}d Ago`}</>;
};

const MetalFrame = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
    <div className={`relative bg-gradient-to-b from-[#3d4f5f] via-[#1a2332] to-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden ${className}`}>
        {/* Frame Bolts */}
        <div className="absolute w-3 h-3 rounded-full border border-[#2a3a4a] bg-[radial-gradient(circle,#5a6a7a_30%,#3a4a5a_70%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center text-[8px] text-[#1a2a3a] top-2 left-2 pointer-events-none z-0">+</div>
        <div className="absolute w-3 h-3 rounded-full border border-[#2a3a4a] bg-[radial-gradient(circle,#5a6a7a_30%,#3a4a5a_70%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center text-[8px] text-[#1a2a3a] top-2 right-2 pointer-events-none z-0">+</div>
        <div className="absolute w-3 h-3 rounded-full border border-[#2a3a4a] bg-[radial-gradient(circle,#5a6a7a_30%,#3a4a5a_70%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center text-[8px] text-[#1a2a3a] bottom-2 left-2 pointer-events-none z-0">+</div>
        <div className="absolute w-3 h-3 rounded-full border border-[#2a3a4a] bg-[radial-gradient(circle,#5a6a7a_30%,#3a4a5a_70%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center text-[8px] text-[#1a2a3a] bottom-2 right-2 pointer-events-none z-0">+</div>
        <div className="relative z-10 w-full h-full">{children}</div>
    </div>
);

const SectionHeader = ({ icon: Icon, label }: { icon: React.ElementType, label: string }) => (
    <div className="flex items-center gap-2 mb-3 px-4 md:px-0">
        <Icon size={16} className="text-[#00D4FF]" aria-hidden="true" />
        <h2 className="text-[15px] font-extrabold text-[#00D4FF] tracking-[0.15em] m-0 drop-shadow-[0_0_8px_rgba(0,212,255,0.3)] font-['Rajdhani'] uppercase">{label}</h2>
    </div>
);

export default function StatusPage() {
    const router = useRouter();
    const { data, error, mutate, isValidating } = useSWR<MLBStatusPayload>('/api/mlb/status', fetcher, {
        refreshInterval: 30000,           // match API s-maxage=30 so we don't show stale data
        revalidateOnFocus: true,
        onError: (err) => logError('SWR MLB Status', err),
    });

    // Local ticker so relative timestamps ("3M AGO") stay live between fetches.
    const [nowMs, setNowMs] = useState<number | null>(null);
    // Track manual refreshes so background revalidation doesn't grey the button.
    const [manualRefreshing, setManualRefreshing] = useState(false);

    useEffect(() => {
        setNowMs(Date.now());
        const id = setInterval(() => setNowMs(Date.now()), 15000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (!isValidating) setManualRefreshing(false);
    }, [isValidating]);

    const handleRefresh = () => {
        setManualRefreshing(true);
        setNowMs(Date.now());
        mutate();
    };

    const isLoading = !data && !error;
    const apiError: string | null = error
        ? 'Failed to reach the status service.'
        : (data && data.ok !== true ? (data.error || 'Failed to load status data.') : null);

    const timeAgo = (dateString: string | null | undefined): string => {
        if (!dateString || !nowMs) return '';
        const serverClientDiff = data?.serverNow ? new Date(data.serverNow).getTime() - Date.now() : 0;
        const past = new Date(dateString);
        if (isNaN(past.getTime())) return '';
        const effectiveNow = nowMs + serverClientDiff;
        const diffMs = Math.max(0, effectiveNow - past.getTime());
        const s = Math.round(diffMs / 1000);
        if (s < 45) return 'JUST NOW';
        const m = Math.round(s / 60);
        if (m < 60) return `${m}M AGO`;
        const h = Math.round(m / 60);
        if (h < 24) return `${h}H AGO`;
        const dd = Math.round(h / 24);
        return `${dd}D AGO`;
    };

    const formatDate = (dateString: string | null | undefined): string => {
        if (!dateString) return '';
        const safeDate = dateString.endsWith('Z') || dateString.includes('+') ? dateString : dateString + 'Z';
        const d = new Date(safeDate);
        if (isNaN(d.getTime())) return String(dateString);
        return d.toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    // Return '—' for null/undefined/NaN/Infinity/EmptyString so health cards never show junk values.
    // Note: fmt(0) correctly returns '0' (zero is a valid and meaningful count).
    const fmt = (n: number | string | null | undefined): string => {
        if (n == null || n === '') return '\u2014';
        const num = Number(n);
        if (isNaN(num) || !isFinite(num)) return '\u2014';
        return num.toLocaleString();
    };

    const brierColor = (val: number | string | null | undefined): string => {
        const b = Number(val);
        if (isNaN(b) || val == null || val === '') return 'text-slate-400';
        if (b < 0.20) return 'text-[#00D4FF]';
        if (b <= 0.25) return 'text-[#FFB020]';
        return 'text-[#FF4444]';
    };
    const fmtBrier = (val: number | string | null | undefined): string => {
        const b = Number(val);
        return (!isNaN(b) && val != null && val !== '') ? b.toFixed(3) : '-';
    };

    const alertLevelColor = (level: string | null | undefined): string => {
        const l = String(level || '').toLowerCase();
        if (l === 'critical' || l === 'error') return 'text-[#FF4444] border-[#FF4444]';
        if (l === 'warning' || l === 'warn') return 'text-[#FFB020] border-[#FFB020]';
        return 'text-[#00D4FF] border-[#00D4FF]';
    };

    const seo = (
        <SEOHead
            title="MLB Analytics Data Status — Pipeline Freshness & System Health | Smarter.Poker"
            description="Real-time status dashboard for the Smarter.Poker MLB Analytics pipeline. Monitor data freshness, model accuracy, prediction counts, data-source health, pipeline stage runs, and database sizes for the 2026 MLB season."
            canonical="/hub/MLB-ANALYTICS/status"
            ogImage="/images/mlb/og.png"
            jsonLd={{
                "@context": "https://schema.org",
                "@type": "WebApplication",
                "name": "MLB Analytics — System Status",
                "description": "Real-time status dashboard for the Smarter.Poker MLB prediction engine: data pipeline health, model freshness, data-source latency, and database sync indicators.",
                "url": "https://smarter.poker/hub/MLB-ANALYTICS/status",
                "applicationCategory": "SportsApplication",
                "operatingSystem": "Any",
                "provider": { "@type": "Organization", "name": "Smarter.Poker", "url": "https://smarter.poker" }
            }}
        />
    );

    // ---- ERROR STATE -------------------------------------------------------
    if (apiError) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                {seo}
                <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF4444]/50 shadow-[0_0_20px_rgba(255,68,68,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden max-w-md w-full" role="alert">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF4444] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        <ServerCrash aria-hidden="true" className="w-12 h-12 text-[#FF4444] mx-auto mb-4 relative z-10 drop-shadow-[0_0_8px_rgba(255,68,68,0.8)]" />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10 font-['Rajdhani']">System Error</h2>
                        <p className="text-[#FF4444] font-bold uppercase tracking-widest text-[11px] relative z-10 mb-1">Failed to load status data</p>
                        <p className="text-slate-400 text-[12px] relative z-10 mb-6 break-words">{apiError}</p>
                        <button
                            onClick={handleRefresh}
                            aria-label="Retry loading status data"
                            className="inline-flex items-center gap-2 bg-transparent border border-[#00D4FF] text-[#00D4FF] px-4 py-2 rounded cursor-pointer text-xs font-bold tracking-widest uppercase transition-colors hover:bg-[#00D4FF]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] relative z-10"
                        >
                            <RefreshCw aria-hidden="true" size={14} className={isValidating ? 'animate-spin' : ''} />
                            Retry
                        </button>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    const isSystemFresh = !!data?.isSystemFresh;
    const health = data?.health || {};
    const slate = data?.slate || {};
    const accuracy = data?.accuracy || {};
    const tierDist = data?.tierDist || {};
    const sources = Array.isArray(data?.sources) ? data.sources : [];
    const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
    const tableCounts = data?.tableCounts || {};
    const stages = Array.isArray(data?.stages) ? data.stages : [];
    const latestRuns = data?.latestRuns || {};
    const pipeline = data?.pipeline || { hasError: false, okCount: 0, errorCount: 0, total: 0 };

    const sectionHeader = (Icon: React.ElementType, label: string) => (
        <div className="flex items-center gap-2 mb-3 px-4 md:px-0">
            <Icon size={16} className="text-[#00D4FF]" aria-hidden="true" />
            <h2 className="text-[14px] font-extrabold text-[#00D4FF] tracking-[0.15em] m-0 drop-shadow-[0_0_8px_rgba(0,212,255,0.3)] font-['Rajdhani'] uppercase">{label}</h2>
        </div>
    );

    const listPanelClass = "relative bg-gradient-to-b from-[#3d4f5f] via-[#1a2332] to-[#0d1117] md:border-[2px] border-y border-[#3d4f5f] md:rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden";
    const cardClass = "relative bg-gradient-to-b from-[#3d4f5f] via-[#1a2332] to-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden";

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
            {seo}

            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />

            {/* Sub-header */}
            <div className="bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-[2px] border-[#3d4f5f] p-4 flex justify-between items-center gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <div className="min-w-0">
                    <h1 className="m-0 text-2xl font-bold uppercase tracking-widest">
                        Data <span className="text-[#00D4FF] drop-shadow-[0_0_10px_rgba(0,212,255,0.6)]">Status</span>
                    </h1>
                    {/* Show when last model refresh occurred — only show if we actually have a refresh time, not serverNow which always reads 'JUST NOW' */}
                    {data?.health?.last_refresh && (
                        <div className="text-[10px] text-slate-500 tracking-widest uppercase mt-0.5 flex items-center gap-2">
                            <span>Data refreshed {timeAgo(data.health.last_refresh)}</span>
                            {isValidating && !isLoading && (
                                <span className="text-[#00D4FF] animate-pulse">&middot; updating&hellip;</span>
                            )}
                        </div>
                    )}
                </div>
                <div className="text-right flex flex-col items-end shrink-0">
                    <div className="text-[#00D4FF] text-[11px] font-bold tracking-widest uppercase">SYSTEM</div>
                    <div className="inline-flex items-center gap-1.5 mt-1" role="status" aria-live="polite" aria-label={`System status: ${isLoading ? 'loading' : (isSystemFresh ? 'fresh' : 'stale')}`}>
                        <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-slate-400 shadow-none' : (isSystemFresh ? 'bg-[#00D4FF] shadow-[0_0_10px_#00D4FF]' : 'bg-[#FF4444] shadow-[0_0_10px_#FF4444]')}`}></div>
                        <div className={`text-xs font-bold tracking-widest ${isLoading ? 'text-slate-400 drop-shadow-none' : (isSystemFresh ? 'text-[#00D4FF] drop-shadow-[0_0_5px_rgba(0,212,255,0.5)]' : 'text-[#FF4444] drop-shadow-[0_0_5px_rgba(255,68,68,0.5)]')}`}>
                            {isLoading ? 'LOADING' : (isSystemFresh ? 'FRESH' : 'STALE')}
                        </div>
                    </div>
                </div>
            </div>

            <div className={`px-0 md:px-4 py-6 max-w-4xl mx-auto w-full transition-opacity duration-300 ${isValidating && !isLoading ? 'opacity-70' : ''}`}>

                <div className="flex justify-end mb-4 px-4 md:px-0">
                    <button
                        onClick={handleRefresh}
                        disabled={manualRefreshing && isValidating}
                        aria-label="Refresh status data"
                        className={`bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-[2px] border-[#3d4f5f] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_10px_rgba(0,0,0,0.4)] text-[#00D4FF] px-3 py-1.5 rounded flex items-center gap-2 cursor-pointer text-[10px] font-extrabold tracking-widest uppercase transition-all hover:bg-[#1a2332] hover:shadow-[0_0_10px_rgba(0,212,255,0.2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] ${manualRefreshing && isValidating ? 'opacity-50' : ''}`}
                    >
                        <RefreshCw aria-hidden="true" size={14} className={isValidating ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex flex-col gap-8 mt-6 px-4 md:px-0" aria-busy="true" aria-label="Loading status data">
                        {/* Summary skeleton */}
                        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 h-24 animate-pulse shadow-[0_4px_10px_rgba(0,0,0,0.5)]"></div>
                        {/* Cards skeleton */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-4 md:px-0">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 h-24 animate-pulse shadow-[0_4px_10px_rgba(0,0,0,0.5)]"></div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        {/* PIPELINE HEALTH SUMMARY */}
                        <div className="mb-8">
                            <div className={`${listPanelClass} px-5 py-4 flex items-center justify-between gap-3`}>
                                <div className="flex items-center gap-3 min-w-0">
                                    {pipeline.hasError
                                        ? <AlertTriangle size={22} className="text-[#FF4444] shrink-0 drop-shadow-[0_0_6px_rgba(255,68,68,0.7)]" aria-hidden="true" />
                                        : <CheckCircle2 size={22} className="text-[#00D4FF] shrink-0 drop-shadow-[0_0_6px_rgba(0,212,255,0.7)]" aria-hidden="true" />}
                                    <div className="min-w-0">
                                        <div className={`text-[15px] font-extrabold uppercase tracking-wider font-['Rajdhani'] ${pipeline.hasError ? 'text-[#FF4444]' : 'text-[#00D4FF]'}`}>
                                            {pipeline.hasError ? 'Pipeline Errors Detected' : 'All Pipeline Stages OK'}
                                        </div>
                                        <div className="text-[11px] text-slate-400 tracking-wider mt-0.5">
                                            {fmt(pipeline.okCount)} OK
                                            {Number(pipeline.errorCount) > 0 ? ` • ${fmt(pipeline.errorCount)} ERROR` : ''}
                                            {` • ${fmt(pipeline.total)} STAGES`}
                                        </div>
                                    </div>
                                </div>
                                {/* null-safe: minutes_since_refresh comes as numeric from RPC but may be string from direct PostgREST */}
                                {health.minutes_since_refresh != null && (
                                    <div className="text-right shrink-0">
                                        <div className="text-[10px] text-slate-500 tracking-widest uppercase">Last Refresh</div>
                                        <div className="text-[13px] font-bold text-[#00D4FF] tabular-nums">{Number(health.minutes_since_refresh) < 1 ? '<1' : Math.round(Number(health.minutes_since_refresh))}M</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* SYSTEM HEALTH */}
                        <div className="mb-8">
                            {sectionHeader(Clock, 'SYSTEM HEALTH')}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 md:px-0">
                            {[
                                { label: 'LAST REFRESH', val: timeAgo(health.last_refresh) || '-', warn: !!health.is_stale },
                                { label: 'SLATE AS OF', val: formatDate(health.slate_as_of) || '-', warn: false },
                                { label: 'AGG MARKET', val: timeAgo(data?.aggAsOf) || '-', warn: false },
                                { label: 'GAMES IN RUN', val: fmt(health.games_in_run), warn: false },
                                { label: 'GAMES IN SLATE', val: fmt(health.games_in_slate), warn: false },
                                { label: 'LIVE RECS', val: fmt(health.total_live_recs), warn: false },
                                { label: 'UNMODELED GAMES', val: fmt(health.unmodeled_games), warn: typeof health.unmodeled_games === 'number' && health.unmodeled_games > 0 },
                                { label: 'RUNLINE CONFLICTS', val: fmt(health.incoherent_runlines_with_bet), warn: typeof health.incoherent_runlines_with_bet === 'number' && health.incoherent_runlines_with_bet > 0 }
                            ].map((item) => (
                                <div key={item.label} className={`${cardClass} p-4`}>
                                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.15em] mb-2">{item.label}</div>
                                    <div className={`text-xl font-extrabold font-['Rajdhani'] tabular-nums break-words ${item.warn ? 'text-[#FF4444] drop-shadow-[0_0_10px_rgba(255,68,68,0.4)]' : 'text-[#00D4FF] drop-shadow-[0_0_10px_rgba(0,212,255,0.4)]'}`}>
                                        {item.val}
                                    </div>
                                </div>
                            ))}
                            </div>
                        </div>

                        {/* TODAY'S SLATE */}
                        <div className="mb-8">
                            {sectionHeader(Activity, "TODAY'S SLATE")}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 md:px-0">
                                {[
                                    { label: 'MARKET BETS', val: slate.mkt },
                                    { label: 'PROPS', val: slate.props },
                                    { label: 'BEST BETS', val: slate.best }
                                ].map((item) => (
                                    <div key={item.label} className={`${cardClass} p-5 text-center`}>
                                        <div className="text-[11px] font-bold text-slate-400 tracking-[0.15em] mb-2">{item.label}</div>
                                        <div className="text-3xl font-extrabold font-['Rajdhani'] text-[#00D4FF] tabular-nums drop-shadow-[0_0_15px_rgba(0,212,255,0.6)]">
                                            {fmt(item.val)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* MODEL ACCURACY */}
                        <div className="mb-8">
                            {sectionHeader(Gauge, 'MODEL ACCURACY')}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 md:px-0">
                                <div className={`${cardClass} p-4 text-center`}>
                                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.12em] mb-2">BRIER (ML)</div>
                                    <div className={`text-2xl font-extrabold font-['Rajdhani'] tabular-nums ${brierColor(accuracy.wtd_avg_brier_ml)}`}>{fmtBrier(accuracy.wtd_avg_brier_ml)}</div>
                                </div>
                                <div className={`${cardClass} p-4 text-center`}>
                                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.12em] mb-2">BRIER (PROPS)</div>
                                    <div className={`text-2xl font-extrabold font-['Rajdhani'] tabular-nums ${brierColor(accuracy.wtd_avg_brier_props)}`}>{fmtBrier(accuracy.wtd_avg_brier_props)}</div>
                                </div>
                                <div className={`${cardClass} p-4 text-center`}>
                                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.12em] mb-2">GAMES EVAL</div>
                                    <div className="text-2xl font-extrabold font-['Rajdhani'] text-[#00D4FF] tabular-nums">{fmt(accuracy.total_games_evaluated)}</div>
                                </div>
                                <div className={`${cardClass} p-4 text-center`}>
                                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.12em] mb-2">DAILY SAMPLES</div>
                                    <div className="text-2xl font-extrabold font-['Rajdhani'] text-[#00D4FF] tabular-nums">{fmt(accuracy.daily_samples)}</div>
                                </div>
                            </div>
                            <div className="text-[10px] text-slate-500 tracking-wider mt-2 px-4 md:px-0">Brier score: lower is better (0.25 = coin flip). Weighted average over recent graded slates.</div>
                        </div>

                        {/* BET TIER DISTRIBUTION */}
                        {Object.keys(tierDist).length > 0 && (
                            <div className="mb-8">
                                {sectionHeader(Layers, 'BET TIER DISTRIBUTION')}
                                <div className={`${cardClass} p-4 mx-4 md:mx-0`}>
                                    <div className="flex flex-wrap gap-3">
                                        {TIER_META.filter(t => t.key in tierDist).map((t) => (
                                            <div key={t.key} className="flex-1 min-w-[80px] text-center rounded-lg border bg-black/30 py-3 px-2" style={{ borderColor: t.color }}>
                                                <div className="text-[10px] font-bold tracking-[0.12em] mb-1" style={{ color: t.color }}>{t.key}</div>
                                                <div className="text-xl font-bold tabular-nums" style={{ color: t.color }}>{fmt(tierDist[t.key])}</div>
                                            </div>
                                        ))}
                                        {Number(tierDist.unscored) > 0 && (
                                            <div className="flex-1 min-w-[80px] text-center rounded-lg border border-[#475569] bg-black/30 py-3 px-2">
                                                <div className="text-[10px] font-bold tracking-[0.12em] mb-1 text-slate-500">UNSCORED</div>
                                                <div className="text-xl font-bold tabular-nums text-slate-500">{fmt(tierDist.unscored)}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* DATA SOURCE FRESHNESS */}
                        <div className="mb-8">
                            {sectionHeader(Database, 'DATA SOURCE FRESHNESS')}
                            <div className={listPanelClass}>
                                {sources.length > 0 ? (
                                    <div className="flex flex-col">
                                        {sources.map((src, idx) => {
                                            const ok = ['ok', 'success', 'done', 'partial'].includes(String(src?.status || '').toLowerCase());
                                            return (
                                                <div key={src?.source || idx} className={`flex justify-between items-center px-5 py-3 bg-black/20 gap-3 ${idx !== sources.length - 1 ? 'border-b border-[#2a3a4a]' : ''}`}>
                                                    <div className="min-w-0">
                                                        <div className="text-[13px] font-semibold text-slate-200 tracking-wider truncate">{SOURCE_LABEL_MAP[src?.source] || src?.source || '-'}</div>
                                                        <div className="text-[10px] text-slate-500 tracking-wider mt-0.5">{timeAgo(src?.pulled_at) || 'NO PULL DATA'}</div>
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <div className="text-[11px] text-slate-400 tabular-nums">{src?.row_count != null ? fmt(src.row_count) : '-'}</div>
                                                        <div className={`bg-black/50 border px-2.5 py-1 rounded text-[10px] font-bold tracking-[0.15em] ${ok ? 'text-[#00D4FF] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' : 'text-[#FF4444] border-[#FF4444] shadow-[0_0_10px_rgba(255,68,68,0.3)]'}`}>
                                                            {String(src?.status || 'UNKNOWN').toUpperCase()}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-6 text-center text-slate-500 font-bold tracking-wider text-[11px] uppercase">No data source info available</div>
                                )}
                            </div>
                        </div>

                        {/* RECENT ALERTS */}
                        <div className="mb-8">
                            {sectionHeader(Bell, 'RECENT ALERTS')}
                            <div className={listPanelClass}>
                                {alerts.length > 0 ? (
                                    <div className="flex flex-col">
                                        {alerts.map((al, idx) => (
                                            <div key={al?.id ?? idx} className={`flex justify-between items-start px-5 py-3 bg-black/20 gap-3 ${idx !== alerts.length - 1 ? 'border-b border-[#2a3a4a]' : ''}`}>
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-semibold text-slate-200 break-words">{al?.message || '-'}</div>
                                                    <div className="text-[10px] text-slate-500 tracking-wider mt-0.5 uppercase">{al?.source || 'system'}{al?.alert_type ? ` • ${al.alert_type}` : ''}</div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                    <div className={`bg-black/50 border px-2 py-0.5 rounded text-[9px] font-bold tracking-[0.15em] ${alertLevelColor(al?.level)}`}>
                                                        {String(al?.level || 'INFO').toUpperCase()}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 tracking-wider">{timeAgo(al?.fired_at)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-6 text-center text-slate-500 font-bold tracking-wider text-[11px] uppercase">No recent alerts</div>
                                )}
                            </div>
                        </div>

                        {/* RECENT PIPELINE RUNS */}
                        <div className="mb-8">
                            {sectionHeader(CheckCircle2, 'RECENT PIPELINE RUNS')}
                            <div className={listPanelClass}>
                                {stages.length > 0 ? (
                                    <div className="flex flex-col">
                                        {stages.map((stage, idx) => {
                                            const run = latestRuns?.[stage];
                                            const status = String(run?.status || 'unknown').toLowerCase();
                                            const isError = ['error', 'failed', 'timeout', 'critical'].includes(status);
                                            const isSuccess = ['ok', 'success', 'done', 'partial'].includes(status);
                                            const glowColor = isError ? 'text-[#FF4444]' : (isSuccess ? 'text-[#00D4FF]' : 'text-slate-400');
                                            const borderGlowColor = isError ? 'border-[#FF4444]' : (isSuccess ? 'border-[#00D4FF]' : 'border-slate-500');
                                            const bgShadow = isError ? 'shadow-[0_0_10px_rgba(255,68,68,0.3)]' : (isSuccess ? 'shadow-[0_0_10px_rgba(0,212,255,0.3)]' : '');
                                            return (
                                                <div key={stage} className={`px-4 sm:px-5 py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-black/20 ${idx !== stages.length - 1 ? 'border-b border-[#2a3a4a]' : ''}`}>
                                                    <div className="min-w-0">
                                                        <div className="text-[15px] font-bold text-white uppercase tracking-wider">{stage}</div>
                                                        <div className="text-[11px] text-slate-400 mt-1 tracking-wider break-words">
                                                            {run?.run_ts ? formatDate(run.run_ts) : '—'}
                                                            {run && typeof run.rows_written === 'number' ? ` • ${fmt(run.rows_written)} rows` : ''}
                                                            {run && typeof run.duration_sec === 'number' ? ` • ${run.duration_sec.toFixed(1)}s` : ''}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2 items-center sm:shrink-0 self-end sm:self-auto mt-2 sm:mt-0">
                                                        {run?.run_ts && (
                                                            <div className="text-slate-400 text-[11px] font-bold tracking-wider hidden sm:block">{timeAgo(run.run_ts)}</div>
                                                        )}
                                                        <div className={`bg-black/50 ${glowColor} border ${borderGlowColor} px-2.5 py-1 rounded text-[10px] font-bold tracking-[0.2em] ${bgShadow}`}>
                                                            {status.toUpperCase()}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-6 text-center text-slate-500 font-bold tracking-wider text-[11px] uppercase">No pipeline runs found</div>
                                )}
                            </div>
                        </div>

                        {/* DB TABLE COUNTS */}
                        <div className="mb-8">
                            {sectionHeader(Database, 'DB TABLE COUNTS')}
                            <div className={listPanelClass}>
                                {tableCounts && Object.keys(tableCounts).length > 0 ? (
                                    <div className="flex flex-col">
                                        {Object.entries(tableCounts).map(([table, count], idx, arr) => (
                                            <div key={table} className={`flex justify-between px-6 py-4 bg-black/20 gap-3 ${idx !== arr.length - 1 ? 'border-b border-[#2a3a4a]' : ''}`}>
                                                <span className="text-[13px] font-semibold text-slate-400 tracking-wider truncate">{table}</span>
                                                <span className="text-[14px] font-bold text-[#00D4FF] tabular-nums shrink-0">{fmt(count)}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-6 text-center text-slate-500 font-bold tracking-wider text-[11px] uppercase">No table data available</div>
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
