// @ts-nocheck
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CalendarX, SearchX, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';

const fetcher = async (url: string) => {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return await res.json();
    } catch (err) {
        logError('SWR Fetch', err);
        throw err;
    }
};

const FILTERS = ['ALL', 'STRIKEOUTS', 'HOME RUNS', 'HITS', 'TOTAL BASES', 'EARNED RUNS'];

function matchesFilter(p: any, filter: string): boolean {
    if (filter === 'ALL') return true;
    const market = (p.prop_type || p.prop || '').toLowerCase();
    if (filter === 'STRIKEOUTS') return market.includes('strikeout') || market.includes('_so') || market === 'k' || market.includes('pitcher_strikeout');
    if (filter === 'HOME RUNS') return market.includes('home_run') || market.includes('home run') || market.includes('hr');
    if (filter === 'HITS') return market === 'hits' || market.includes('_hits') || market.startsWith('hitter_hits');
    if (filter === 'TOTAL BASES') return market.includes('total_base') || market.includes('total base') || market.includes('tb');
    if (filter === 'EARNED RUNS') return market.includes('earned_run') || market.includes('earned run') || market.includes('er');
    return false;
}

function formatProp(raw: string): string {
    if (!raw) return '';
    return raw.replace(/_/g, ' ').toUpperCase();
}

function formatOdds(n: number | null | undefined): string {
    if (n == null || isNaN(Number(n))) return '—';
    const num = Number(n);
    return num > 0 ? `+${num}` : `${num}`;
}

function formatProb(v: number | null | undefined): string {
    if (v == null) return '—';
    const n = Number(v);
    if (n > 0 && n <= 1) return `${(n * 100).toFixed(1)}%`;
    return `${n.toFixed(1)}%`;
}

const TIER = (pts: number) => {
    if (pts >= 10) return { color: '#FFD700', glow: 'rgba(255,215,0,0.5)', label: 'ELITE' };
    if (pts >= 5)  return { color: '#00D4FF', glow: 'rgba(0,212,255,0.4)', label: 'STRONG' };
    return           { color: '#5a8a9f', glow: 'rgba(90,138,159,0.3)', label: 'VALUE' };
};

const PropRow = ({ prop, idx }: { prop: any; idx: number }) => {
    const edge = Number(prop.edge_pts) || 0;
    const tier = TIER(edge);
    const isOver = prop.rec === 'over' || (prop.model_proj != null && prop.line != null && Number(prop.model_proj) > Number(prop.line));
    const ev = prop.ev_pct != null ? Number(prop.ev_pct) : null;

    return (
        <div
            className="relative bg-gradient-to-r from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-sm overflow-hidden transition-all hover:border-[#00D4FF] group"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.5)' }}
        >
            {/* Left accent bar */}
            <div
                className="absolute top-0 left-0 w-[3px] h-full rounded-r-sm opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ background: tier.color, boxShadow: `0 0 8px ${tier.glow}` }}
            />

            {/* Corner screws */}
            <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] opacity-50" />

            <div className="pl-4 pr-3 py-2.5 flex items-center gap-3">
                {/* Rank */}
                <div className="text-[11px] font-black text-[#3d4f5f] w-6 text-right flex-shrink-0 font-mono">
                    {idx + 1}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        {prop.team_abbr && (
                            <span className="text-[10px] font-black text-[#5a6a7a] tracking-widest uppercase bg-[#0a0a15] border border-[#2a3a4a] px-1.5 py-0 rounded-sm leading-5">
                                {prop.team_abbr}
                            </span>
                        )}
                        <span
                            className="text-[15px] font-black text-white tracking-wide uppercase truncate"
                            style={{ fontFamily: "'Rajdhani', sans-serif" }}
                        >
                            {prop.player_name}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] font-black text-[#00D4FF] tracking-wider uppercase" style={{ textShadow: '0 0 6px rgba(0,212,255,0.4)' }}>
                            {formatProp(prop.prop_type || prop.prop)}
                        </span>
                        {prop.line != null && (
                            <span className="text-[11px] font-black text-[#8a9ba8] font-mono">
                                {isOver ? 'O' : 'U'} {prop.line}
                            </span>
                        )}
                    </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Odds */}
                    <div className="flex flex-col items-center bg-[#0a0a15] border border-[#2a3a4a] rounded-sm px-2 py-1 min-w-[46px]">
                        <span className="text-[9px] font-black text-[#4a5a6a] tracking-widest uppercase">ODDS</span>
                        <span className="text-[13px] font-black text-white font-mono leading-tight">
                            {formatOdds(prop.odds ?? prop.best_price)}
                        </span>
                    </div>

                    {/* Projection */}
                    {prop.model_proj != null && (
                        <div className="flex flex-col items-center bg-[#0a0a15] border border-[#2a3a4a] rounded-sm px-2 py-1 min-w-[46px]">
                            <span className="text-[9px] font-black text-[#4a5a6a] tracking-widest uppercase">PROJ</span>
                            <span className="text-[13px] font-black text-[#00D4FF] font-mono leading-tight" style={{ textShadow: '0 0 4px rgba(0,212,255,0.3)' }}>
                                {Number(prop.model_proj).toFixed(1)}
                            </span>
                        </div>
                    )}

                    {/* EV% */}
                    {ev != null && (
                        <div className="flex flex-col items-center bg-[#0a0a15] border border-[#2a3a4a] rounded-sm px-2 py-1 min-w-[46px]">
                            <span className="text-[9px] font-black text-[#4a5a6a] tracking-widest uppercase">EV%</span>
                            <span className={`text-[13px] font-black font-mono leading-tight ${ev > 0 ? 'text-[#22C55E]' : 'text-[#8a9ba8]'}`}>
                                {ev > 0 ? '+' : ''}{ev.toFixed(1)}
                            </span>
                        </div>
                    )}

                    {/* Win Prob */}
                    <div className="flex flex-col items-center bg-[#0a0a15] border border-[#2a3a4a] rounded-sm px-2 py-1 min-w-[46px]">
                        <span className="text-[9px] font-black text-[#4a5a6a] tracking-widest uppercase">WIN%</span>
                        <span className="text-[13px] font-black text-[#e2e8f0] font-mono leading-tight">
                            {formatProb(prop.implied_prob)}
                        </span>
                    </div>

                    {/* Edge Pts */}
                    <div
                        className="flex flex-col items-center rounded-sm px-2.5 py-1 min-w-[50px] border"
                        style={{
                            background: `${tier.color}12`,
                            borderColor: `${tier.color}60`,
                            boxShadow: `0 0 8px ${tier.glow}`,
                        }}
                    >
                        <span
                            className="text-[18px] font-black leading-tight font-mono"
                            style={{ color: tier.color, textShadow: `0 0 6px ${tier.glow}`, fontFamily: "'Orbitron', sans-serif" }}
                        >
                            {edge.toFixed(1)}
                        </span>
                        <span className="text-[8px] font-black tracking-widest uppercase" style={{ color: tier.color }}>
                            EDGE
                        </span>
                    </div>
                </div>
            </div>

            {/* Book badge */}
            {prop.best_book && (
                <div className="absolute bottom-1.5 right-3">
                    <span className="text-[9px] font-black text-[#3d4f5f] tracking-widest uppercase font-mono">
                        {prop.best_book.toUpperCase()}
                    </span>
                </div>
            )}
        </div>
    );
};

export default function PropsPage() {
    const router = useRouter();
    const [filter, setFilter] = useState('ALL');
    const [minEdge, setMinEdge] = useState(0);
    const [todayStr, setTodayStr] = useState<string>('');

    useEffect(() => {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        setTodayStr(formatter.format(new Date()));
    }, []);

    const { data, error, isLoading, mutate } = useSWR('/api/mlb/props', fetcher, {
        refreshInterval: 60000,
    });

    const props: any[] = data?.props || [];
    const isStale = !!(data?.official_date && todayStr && data.official_date < todayStr);

    const filtered = props.filter((p: any) => {
        if (!matchesFilter(p, filter)) return false;
        if (minEdge > 0 && (Number(p.edge_pts) || 0) < minEdge) return false;
        return true;
    });

    const totalProps = props.length;
    const eliteProps = props.filter((p: any) => (p.edge_pts || 0) >= 5).length;
    const goldProps = props.filter((p: any) => (p.edge_pts || 0) >= 10).length;

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] w-full max-w-[100vw] overflow-x-hidden box-border" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            <SEOHead
                title="Player Props | MLB Analytics"
                description="Daily MLB Player Prop Edges Surfaced By AI Models."
                noIndex={true}
            />
            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />

            {/* ── Page Header ──────────────────────────────────────────────── */}
            <header className="relative px-4 pt-5 pb-4 bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-[3px] border-[#3d4f5f] shadow-[0_8px_30px_rgba(0,0,0,0.8)] z-10">
                {/* Corner bolts */}
                <div className="absolute top-3 left-3 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
                <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />

                <div className="flex items-start justify-between gap-3">
                    <div>
                        <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-1 text-[#5a6a7a] text-[10px] font-black no-underline tracking-widest uppercase hover:text-[#00D4FF] transition-colors mb-1.5">
                            ← DASHBOARD
                        </Link>
                        <h1
                            className="text-[26px] font-black tracking-[0.15em] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] m-0"
                            style={{ fontFamily: "'Orbitron', sans-serif" }}
                        >
                            PLAYER <span className="text-[#00D4FF]" style={{ textShadow: '0 0 10px rgba(0,212,255,0.6)' }}>PROPS</span>
                        </h1>
                        <p className="m-0 text-[11px] font-black text-[#5a6a7a] tracking-widest uppercase mt-0.5">
                            Ranked By Edge Points • {todayStr || 'Loading...'}
                        </p>
                    </div>

                    {/* Stats pills */}
                    <div className="flex flex-col gap-1.5 items-end flex-shrink-0 mt-1">
                        <div className="flex items-center gap-1.5 bg-[#0a0a15] border border-[#3d4f5f] px-2.5 py-1 rounded-sm">
                            <span className="text-[10px] font-black text-[#5a6a7a] tracking-widest uppercase">TOTAL</span>
                            <span className="text-[16px] font-black text-white font-mono" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                                {isLoading ? '—' : totalProps}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-[#001a2a] border border-[#00D4FF]/50 px-2.5 py-1 rounded-sm" style={{ boxShadow: '0 0 8px rgba(0,212,255,0.15)' }}>
                            <TrendingUp size={12} className="text-[#00D4FF]" />
                            <span className="text-[10px] font-black text-[#00D4FF] tracking-widest uppercase">5+ EDGE</span>
                            <span className="text-[16px] font-black text-[#00D4FF] font-mono" style={{ fontFamily: "'Orbitron', sans-serif", textShadow: '0 0 6px rgba(0,212,255,0.5)' }}>
                                {isLoading ? '—' : eliteProps}
                            </span>
                        </div>
                        {goldProps > 0 && (
                            <div className="flex items-center gap-1.5 bg-[#1a1000] border border-[#FFD700]/50 px-2.5 py-1 rounded-sm" style={{ boxShadow: '0 0 8px rgba(255,215,0,0.15)' }}>
                                <span className="text-[10px] font-black text-[#FFD700] tracking-widest uppercase">10+ ELITE</span>
                                <span className="text-[16px] font-black text-[#FFD700] font-mono" style={{ fontFamily: "'Orbitron', sans-serif", textShadow: '0 0 6px rgba(255,215,0,0.5)' }}>
                                    {goldProps}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom neon strip */}
                <div className="absolute bottom-0 left-[10%] right-[10%] h-[2px] bg-[#00D4FF] shadow-[0_0_10px_#00D4FF,0_0_20px_rgba(0,212,255,0.4)] rounded-t-full" />
            </header>

            {/* ── Filter Bar ─────────────────────────────────────────────── */}
            <div className="relative flex flex-wrap items-center gap-2 px-3 py-2.5 bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-2 border-[#3d4f5f] shadow-[inset_0_2px_8px_rgba(0,0,0,0.8),0_4px_10px_rgba(0,0,0,0.5)]">
                {/* Prop type tabs */}
                <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                    {FILTERS.map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1 border-2 text-[10px] font-black tracking-widest whitespace-nowrap cursor-pointer transition-all uppercase rounded-sm ${
                                filter === f
                                    ? 'bg-[#001a2a] text-[#00D4FF] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.25)]'
                                    : 'bg-[#0d1117] text-[#5a6a7a] border-[#2a3a4a] hover:border-[#3d4f5f] hover:text-slate-300'
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {/* Min Edge */}
                <div className="flex items-center gap-1.5 ml-auto bg-[#0d1117] border-2 border-[#2a3a4a] rounded-sm px-2 py-1 hover:border-[#3d4f5f] transition-colors flex-shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#5a6a7a]">MIN EDGE:</span>
                    <select
                        value={minEdge}
                        onChange={(e) => setMinEdge(parseFloat(e.target.value))}
                        className="bg-transparent border-none text-[12px] font-black text-[#00D4FF] outline-none cursor-pointer uppercase tracking-wider"
                    >
                        <option value="0" className="bg-[#0d1117]">ANY</option>
                        <option value="3" className="bg-[#0d1117]">&gt; 3</option>
                        <option value="5" className="bg-[#0d1117]">&gt; 5</option>
                        <option value="8" className="bg-[#0d1117]">&gt; 8</option>
                        <option value="10" className="bg-[#0d1117]">&gt; 10</option>
                    </select>
                </div>
            </div>

            {/* ── Stale Banner ───────────────────────────────────────────── */}
            {isStale && !isLoading && (
                <div className="mx-3 mt-3 rounded-sm border-2 border-amber-500/50 bg-[#1a1500] px-4 py-2.5 shadow-[0_0_15px_rgba(245,158,11,0.1)] relative overflow-hidden">
                    <div className="absolute left-0 top-0 w-1 h-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" />
                    <div className="flex items-center gap-2">
                        <CalendarX size={14} className="text-amber-500 flex-shrink-0" />
                        <div>
                            <p className="text-[11px] font-black tracking-widest uppercase text-amber-500 m-0">STALE SLATE — NOT ACTIONABLE</p>
                            <p className="text-[10px] text-amber-600/70 font-bold uppercase tracking-wider m-0 mt-0.5">Props from a previous date. Lines will appear when today's slate opens.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main Content ────────────────────────────────────────────── */}
            <main className="mx-auto max-w-2xl px-3 pt-3 pb-6 relative">

                {/* Loading */}
                {isLoading && !data && (
                    <div className="flex flex-col items-center justify-center mt-16 gap-4">
                        <div className="w-8 h-8 rounded-full border-2 border-[#5a6a7a] border-t-[#00D4FF] animate-spin" />
                        <span className="text-[#5a6a7a] font-black tracking-widest text-[10px] uppercase font-mono">
                            Scanning Props Vault...
                        </span>
                    </div>
                )}

                {/* Error */}
                {error && !isLoading && (
                    <div className="mx-0 mt-4 rounded-sm border-2 border-red-500/50 bg-[#1a0a0a] px-4 py-3 relative">
                        <div className="absolute left-0 top-0 w-1 h-full bg-red-500 shadow-[0_0_10px_#ef4444]" />
                        <p className="text-[12px] font-black tracking-widest uppercase text-red-500">System Error</p>
                        <p className="text-[11px] text-red-400 mt-1 font-bold tracking-wider">Failed to load props data. Retrying...</p>
                    </div>
                )}

                {/* Empty */}
                {!isLoading && !error && filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-[#3d4f5f] rounded-sm bg-[#0d1117] mt-4 opacity-60">
                        {filter === 'ALL' ? <CalendarX size={36} className="text-[#3d4f5f] mb-3" /> : <SearchX size={36} className="text-[#3d4f5f] mb-3" />}
                        <p className="text-[13px] font-black tracking-widest uppercase text-[#5a6a7a] text-center">
                            {filter === 'ALL' ? 'No Props Available — Awaiting Model Output' : `No ${filter} Props Found`}
                        </p>
                        <p className="text-[10px] text-[#3d4f5f] font-bold tracking-widest uppercase text-center mt-1">
                            Props release 3–4 hours before first pitch
                        </p>
                    </div>
                )}

                {/* Column headers */}
                {!isLoading && filtered.length > 0 && (
                    <div className="flex items-center gap-3 px-3 mb-1.5 pl-[2.75rem]">
                        <div className="flex-1 min-w-0">
                            <span className="text-[9px] font-black text-[#3d4f5f] tracking-widest uppercase">
                                PLAYER · PROP · LINE
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 pr-1">
                            <span className="text-[9px] font-black text-[#3d4f5f] tracking-widest uppercase w-[46px] text-center">ODDS</span>
                            <span className="text-[9px] font-black text-[#3d4f5f] tracking-widest uppercase w-[46px] text-center">PROJ</span>
                            <span className="text-[9px] font-black text-[#3d4f5f] tracking-widest uppercase w-[46px] text-center">EV%</span>
                            <span className="text-[9px] font-black text-[#3d4f5f] tracking-widest uppercase w-[46px] text-center">WIN%</span>
                            <span className="text-[9px] font-black text-[#3d4f5f] tracking-widest uppercase w-[50px] text-center">EDGE</span>
                        </div>
                    </div>
                )}

                {/* Props list */}
                {!isLoading && filtered.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        {filtered.map((prop: any, idx: number) => (
                            <PropRow key={`prop-${idx}`} prop={prop} idx={idx} />
                        ))}
                    </div>
                )}

                {/* Result count */}
                {!isLoading && filtered.length > 0 && (
                    <div className="mt-4 text-center">
                        <span className="text-[10px] font-black text-[#3d4f5f] tracking-widest uppercase font-mono">
                            {filtered.length} PROPS · RANKED BY EDGE
                        </span>
                    </div>
                )}

                {/* Footer disclaimer */}
                <div className="mt-6 px-4 py-3 bg-[#0d1117] border border-[#2a3a4a] rounded-sm text-[10px] font-black tracking-wide text-[#4a5a6a] text-center leading-relaxed shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                    <span className="text-[#00D4FF]">ANALYSIS ONLY</span> — NOT BETTING ADVICE.{' '}
                    EDGE PTS = VARIANCE BETWEEN PROJECTION & MARKET LINE.{' '}
                    EV% = EXPECTED RETURN PER $1. WIN% = ALGORITHMIC LIKELIHOOD.
                </div>
            </main>

            <BottomNavBar />
        </div>
    );
}
