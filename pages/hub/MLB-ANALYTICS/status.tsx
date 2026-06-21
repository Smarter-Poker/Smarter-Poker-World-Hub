import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { RefreshCw, Activity, Database, Clock, ServerCrash, CheckCircle2, AlertTriangle, Gauge, Layers, Bell } from 'lucide-react';
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

// Human-readable labels for pipeline source keys (matches engine SOURCE_ROWS constant).
const SOURCE_LABEL_MAP: Record<string, string> = {
    daily_predict: 'Predictions',
    odds_api: 'Sportsbook Odds',
    mlb_api: 'MLB API (schedule/lineups)',
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

export default function StatusPage() {
    const router = useRouter();
    const { data, error, mutate, isValidating } = useSWR('/api/mlb/status', fetcher, {
        refreshInterval: 30000,           // match API s-maxage=30 so we don't show stale data
        revalidateOnFocus: true,
        onError: (err) => logError('SWR MLB Status', err),
    });

    // Local ticker so relative timestamps ("3M AGO") stay live between fetches.
    const [nowMs, setNowMs] = useState<number>(() => Date.now());
    // Track manual refreshes so background revalidation doesn't grey the button.
    const [manualRefreshing, setManualRefreshing] = useState(false);

    useEffect(() => {
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
        : (data && data.ok === false ? (data.error || 'Failed to load status data.') : null);

    const timeAgo = (dateString: string | null | undefined): string => {
        if (!dateString) return '';
        const past = new Date(dateString);
        if (isNaN(past.getTime())) return '';
        const diffMs = Math.max(0, nowMs - past.getTime());
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
        const d = new Date(dateString);
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

    // Return '—' for null/undefined so health cards don't misleadingly show 0.
    const fmt = (n: any): string => (n == null) ? '\u2014' : Number(n).toLocaleString();

    const brierColor = (b: any): string => {
        if (typeof b !== 'number' || isNaN(b)) return 'text-slate-400';
        if (b < 0.20) return 'text-[#00D4FF]';
        if (b <= 0.25) return 'text-[#FFB020]';
        return 'text-[#FF4444]';
    };
    const fmtBrier = (b: any): string => (typeof b === 'number' && !isNaN(b)) ? b.toFixed(3) : '-';

    const alertLevelColor = (level: any): string => {
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
                        <ServerCrash className="w-12 h-12 text-[#FF4444] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(255,68,68,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF4444] font-bold uppercase tracking-widest text-[11px] relative z-10 mb-1">Failed to load status data</p>
                        <p className="text-slate-400 text-[12px] relative z-10 mb-6 break-words">{apiError}</p>
                        <button
                            onClick={handleRefresh}
                            aria-label="Retry loading status data"
                            className="inline-flex items-center gap-2 bg-transparent border border-[#00D4FF] text-[#00D4FF] px-4 py-2 rounded cursor-pointer text-xs font-bold tracking-widest uppercase transition-colors hover:bg-[#00D4FF]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] relative z-10"
                        >
                            <RefreshCw size={14} className={isValidating ? 'animate-spin' : ''} />
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
    const sources: any[] = Array.isArray(data?.sources) ? data.sources : [];
    const alerts: any[] = Array.isArray(data?.alerts) ? data.alerts : [];
    const tableCounts = data?.tableCounts || {};
    const stages: string[] = Array.isArray(data?.stages) ? data.stages : [];
    const latestRuns = data?.latestRuns || {};
    const pipeline = data?.pipeline || {};

    const sectionHeader = (Icon: any, label: string) => (
        <div className="flex items-center gap-2 mb-3">
            <Icon size={16} className="text-[#00D4FF]" />
            <h2 className="text-[13px] font-bold text-[#00D4FF] tracking-[0.15em] m-0" style={{ textShadow: '0 0 8px rgba(0,212,255,0.3)' }}>{label}</h2>
        </div>
    );

    const panelClass = "relative bg-gradient-to-b from-[#3d4f5f] via-[#1a2332] to-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden";

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
            {seo}

            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />

            {/* Sub-header */}
            <div className="bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-[2px] border-[#3d4f5f] p-4 flex justify-between items-center gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <div className="min-w-0">
                    <h1 className="m-0 text-2xl font-bold uppercase tracking-widest">
                        Data <span className="text-[#00D4FF]" style={{ textShadow: '0 0 10px rgba(0, 212, 255, 0.6)' }}>Status</span>
                    </h1>
                    {/* Show when last model refresh occurred (not serverNow which is always 'JUST NOW') */}
                    {(data?.health?.last_refresh || data?.serverNow) && (
                        <div className="text-[10px] text-slate-500 tracking-widest uppercase mt-0.5 flex items-center gap-2">
                            <span>Data refreshed {timeAgo(data.health?.last_refresh || data.serverNow)}</span>
                            {isValidating && !isLoading && (
                                <span className="text-[#00D4FF] animate-pulse">· updating…</span>
                            )}
                        </div>
                    )}
                </div>
                <div className="text-right flex flex-col items-end shrink-0">
                    <div className="text-[#00D4FF] text-[11px] font-bold tracking-widest uppercase">SYSTEM</div>
                    <div className="inline-flex items-center gap-1.5 mt-1" role="status" aria-live="polite" aria-label={`System status: ${isSystemFresh ? 'fresh' : 'stale'}`}>
                        <div className={`w-2 h-2 rounded-full ${isSystemFresh ? 'bg-[#00D4FF] shadow-[0_0_10px_#00D4FF]' : 'bg-[#FF4444] shadow-[0_0_10px_#FF4444]'}`}></div>
                        <div className={`text-xs font-bold tracking-widest ${isSystemFresh ? 'text-[#00D4FF]' : 'text-[#FF4444]'}`} style={{ textShadow: isSystemFresh ? '0 0 5px rgba(0,212,255,0.5)' : '0 0 5px rgba(255,68,68,0.5)' }}>
                            {isSystemFresh ? 'FRESH' : 'STALE'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-4 py-6 max-w-4xl mx-auto w-full">

                <div className="flex justify-end mb-4">
                    <button
                        onClick={handleRefresh}
                        disabled={manualRefreshing && isValidating}
                        aria-label="Refresh status data"
                        className={`bg-transparent border border-[#3d4f5f] text-[#00D4FF] px-3 py-1.5 rounded flex items-center gap-2 cursor-pointer text-xs font-bold tracking-widest uppercase transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] ${manualRefreshing && isValidating ? 'opacity-50' : ''}`}
                    >
                        <RefreshCw size={14} className={isValidating ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6" aria-busy="true" aria-label="Loading status data">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 animate-pulse shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                                <div className="h-3 w-1/2 bg-[#3d4f5f] rounded mb-3"></div>
                                <div className="h-8 w-3/4 bg-[#3d4f5f] rounded"></div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        {/* PIPELINE HEALTH SUMMARY */}
                        <div className="mb-8">
                            <div className={`${panelClass} px-5 py-4 flex items-center justify-between gap-3`}>
                                <div className="flex items-center gap-3 min-w-0">
                                    {pipeline.hasError
                                        ? <AlertTriangle size={22} className="text-[#FF4444] shrink-0" style={{ filter: 'drop-shadow(0 0 6px rgba(255,68,68,0.7))' }} />
                                        : <CheckCircle2 size={22} className="text-[#00D4FF] shrink-0" style={{ filter: 'drop-shadow(0 0 6px rgba(0,212,255,0.7))' }} />}
                                    <div className="min-w-0">
                                        <div className={`text-[15px] font-extrabold uppercase tracking-wider ${pipeline.hasError ? 'text-[#FF4444]' : 'text-[#00D4FF]'}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                            {pipeline.hasError ? 'Pipeline Errors Detected' : 'All Pipeline Stages OK'}
                                        </div>
                                        <div className="text-[11px] text-slate-400 tracking-wider mt-0.5">
                                            {fmt(pipeline.okCount)} OK
                                            {Number(pipeline.errorCount) > 0 ? ` • ${fmt(pipeline.errorCount)} ERROR` : ''}
                                            {` • ${fmt(pipeline.total)} STAGES`}
                                        </div>
                                    </div>
                                </div>
                                {typeof health.minutes_since_refresh === 'number' && (
                                    <div className="text-right shrink-0">
                                        <div className="text-[10px] text-slate-500 tracking-widest uppercase">Last Refresh</div>
                                        <div className="text-[13px] font-bold text-[#00D4FF] tabular-nums">{health.minutes_since_refresh < 1 ? '<1' : Math.round(health.minutes_since_refresh)}M</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* SYSTEM HEALTH */}
                        <div className="mb-8">
                            {sectionHeader(Clock, 'SYSTEM HEALTH')}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {[
                                    { label: 'LAST REFRESH', val: timeAgo(health.last_refresh) || '-', warn: false },
                                    { label: 'SLATE AS OF', val: formatDate(health.slate_as_of) || '-', warn: false },
                                    { label: 'GAMES IN RUN', val: fmt(health.games_in_run), warn: false },
                                    { label: 'GAMES IN SLATE', val: fmt(health.games_in_slate), warn: false },
                                    { label: 'LIVE RECS', val: fmt(health.total_live_recs), warn: false },
                                    { label: 'UNMODELED GAMES', val: fmt(health.unmodeled_games), warn: Number(health.unmodeled_games) > 0 },
                                    { label: 'RUNLINE CONFLICTS', val: fmt(health.incoherent_runlines_with_bet), warn: Number(health.incoherent_runlines_with_bet) > 0 }
                                ].map((item) => (
                                    <div key={item.label} className={`${panelClass} p-4`}>
                                        <div className="text-[10px] font-bold text-slate-400 tracking-[0.15em] mb-2">{item.label}</div>
                                        <div className={`text-lg font-bold tabular-nums break-words ${item.warn ? 'text-[#FF4444]' : 'text-[#00D4FF]'}`} style={{ textShadow: item.warn ? '0 0 10px rgba(255,68,68,0.4)' : '0 0 10px rgba(0,212,255,0.4)' }}>
                                            {item.val}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* TODAY'S SLATE */}
                        <div className="mb-8">
                            {sectionHeader(Activity, "TODAY'S SLATE")}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[
                                    { label: 'MARKET BETS', val: slate.mkt },
                                    { label: 'PROPS', val: slate.props },
                                    { label: 'BEST BETS', val: slate.best }
                                ].map((item) => (
                                    <div key={item.label} className={`${panelClass} p-5 text-center`}>
                                        <div className="text-[11px] font-bold text-slate-400 tracking-[0.15em] mb-2">{item.label}</div>
                                        <div className="text-3xl font-bold text-[#00D4FF] tabular-nums" style={{ textShadow: '0 0 15px rgba(0,212,255,0.6)' }}>
                                            {fmt(item.val)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* MODEL ACCURACY */}
                        <div className="mb-8">
                            {sectionHeader(Gauge, 'MODEL ACCURACY')}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className={`${panelClass} p-4 text-center`}>
                                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.12em] mb-2">BRIER (ML)</div>
                                    <div className={`text-2xl font-bold tabular-nums ${brierColor(accuracy.wtd_avg_brier_ml)}`}>{fmtBrier(accuracy.wtd_avg_brier_ml)}</div>
                                </div>
                                <div className={`${panelClass} p-4 text-center`}>
                                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.12em] mb-2">BRIER (PROPS)</div>
                                    <div className={`text-2xl font-bold tabular-nums ${brierColor(accuracy.wtd_avg_brier_props)}`}>{fmtBrier(accuracy.wtd_avg_brier_props)}</div>
                                </div>
                                <div className={`${panelClass} p-4 text-center`}>
                                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.12em] mb-2">GAMES EVAL</div>
                                    <div className="text-2xl font-bold text-[#00D4FF] tabular-nums">{fmt(accuracy.total_games_evaluated)}</div>
                                </div>
                                <div className={`${panelClass} p-4 text-center`}>
                                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.12em] mb-2">DAILY SAMPLES</div>
                                    <div className="text-2xl font-bold text-[#00D4FF] tabular-nums">{fmt(accuracy.daily_samples)}</div>
                                </div>
                            </div>
                            <div className="text-[10px] text-slate-500 tracking-wider mt-2 px-1">Brier score: lower is better (0.25 = coin flip). Weighted average over recent graded slates.</div>
                        </div>

                        {/* BET TIER DISTRIBUTION */}
                        {Object.keys(tierDist).length > 0 && (
                            <div className="mb-8">
                                {sectionHeader(Layers, 'BET TIER DISTRIBUTION')}
                                <div className={`${panelClass} p-4`}>
                                    <div className="flex flex-wrap gap-3">
                                        {TIER_META.filter(t => t.key in tierDist).map((t) => (
                                            <div key={t.key} className="flex-1 min-w-[80px] text-center rounded-lg border bg-black/30 py-3 px-2" style={{ borderColor: t.color }}>
                                                <div className="text-[10px] font-bold tracking-[0.12em] mb-1" style={{ color: t.color }}>{t.key}</div>
                                                <div className="text-xl font-bold tabular-nums" style={{ color: t.color }}>{fmt((tierDist as any)[t.key])}</div>
                                            </div>
                                        ))}
                                        {Number((tierDist as any).unscored) > 0 && (
                                            <div className="flex-1 min-w-[80px] text-center rounded-lg border border-[#475569] bg-black/30 py-3 px-2">
                                                <div className="text-[10px] font-bold tracking-[0.12em] mb-1 text-slate-500">UNSCORED</div>
                                                <div className="text-xl font-bold tabular-nums text-slate-500">{fmt((tierDist as any).unscored)}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* DATA SOURCE FRESHNESS */}
                        <div className="mb-8">
                            {sectionHeader(Database, 'DATA SOURCE FRESHNESS')}
                            <div className={panelClass}>
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
                            <div className={panelClass}>
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
                            <div className="flex flex-col gap-3">
                                {stages.length > 0 ? stages.map((stage) => {
                                    const run = latestRuns?.[stage];
                                    const status = String(run?.status || 'unknown');
                                    const isError = status === 'error';
                                    const glowColor = isError ? 'text-[#FF4444]' : 'text-[#00D4FF]';
                                    const borderGlowColor = isError ? 'border-[#FF4444]' : 'border-[#00D4FF]';
                                    const bgShadow = isError ? 'shadow-[0_0_10px_rgba(255,68,68,0.3)]' : 'shadow-[0_0_10px_rgba(0,212,255,0.3)]';
                                    return (
                                        <div key={stage} className={`${panelClass} px-5 py-4 flex justify-between items-center gap-3`}>
                                            <div className="min-w-0">
                                                <div className="text-[15px] font-bold text-white uppercase tracking-wider">{stage}</div>
                                                <div className="text-[11px] text-slate-400 mt-1 tracking-wider break-words">
                                                    {run?.run_ts ? formatDate(run.run_ts) : 'NO DATA FOUND'}
                                                    {run && typeof run.rows_written === 'number' ? ` • ${fmt(run.rows_written)} rows` : ''}
                                                    {run && typeof run.duration_sec === 'number' ? ` • ${run.duration_sec.toFixed(1)}s` : ''}
                                                </div>
                                            </div>
                                            {run && (
                                                <div className="flex gap-2 items-center shrink-0">
                                                    <div className="text-slate-400 text-[11px] font-bold tracking-wider hidden sm:block">{timeAgo(run.run_ts)}</div>
                                                    <div className={`bg-black/50 ${glowColor} border ${borderGlowColor} px-2.5 py-1 rounded text-[10px] font-bold tracking-[0.2em] ${bgShadow}`}>
                                                        {status.toUpperCase()}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }) : (
                                    <div className={`${panelClass} p-6 text-center text-slate-500 font-bold tracking-wider text-[11px] uppercase`}>No pipeline runs found</div>
                                )}
                            </div>
                        </div>

                        {/* DB TABLE COUNTS */}
                        <div className="mb-8">
                            {sectionHeader(Database, 'DB TABLE COUNTS')}
                            <div className={panelClass}>
                                {tableCounts && Object.keys(tableCounts).length > 0 ? (
                                    <div className="flex flex-col">
                                        {Object.entries(tableCounts).map(([table, count]: any, idx, arr) => (
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
