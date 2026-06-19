// @ts-nocheck
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import useSWR from 'swr';
import { CalendarX, SearchX, TrendingUp } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';
import { playerHeadshot, teamLogo } from '../../../src/lib/mlb_data';
import { BetScoreBadge } from '../../../src/components/mlb/BetScoreBadge';

function probToAmericanOdds(prob: number | null | undefined): string {
    if (!prob || prob <= 0 || prob >= 1) return '—';
    if (prob > 0.5) {
        return Math.round(-100 * (prob / (1 - prob))).toString();
    } else {
        return '+' + Math.round(100 * ((1 - prob) / prob)).toString();
    }
}
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

const FILTERS = ['ALL', 'STRIKEOUTS', 'HOME RUNS', 'HITS', 'TOTAL BASES', 'EARNED RUNS', 'RUNS'];

function matchesFilter(p: any, filter: string): boolean {
    if (filter === 'ALL') return true;
    const market = (p.prop_type || p.prop || '').toLowerCase();
    if (filter === 'STRIKEOUTS') return market.includes('strikeout') || market.includes('pitcher_strikeout') || market.includes('so') || market.includes('k_');  
    if (filter === 'HOME RUNS') return market.includes('home_run') || market.includes('home run') || market === 'hr' || market.startsWith('hrr');
    if (filter === 'HITS') return market === 'hits' || market.includes('_hits') || market.startsWith('hitter_hits');
    if (filter === 'TOTAL BASES') return market.includes('total_base') || market.includes('tb') || market.startsWith('tb_');
    if (filter === 'EARNED RUNS') return market.includes('earned_run') || market.includes('er') && market.includes('run');
    if (filter === 'RUNS') return market === 'runs' || market === 'runs_scored' || (market.includes('run') && !market.includes('earned'));
    return false;
}

function formatProp(raw: string): string {
    if (!raw) return '';
    return raw.replace(/_/g, ' ').toUpperCase();
}

function formatOdds(n: any): string {
    if (n == null || n === '' || isNaN(Number(n))) return '—';
    const num = Number(n);
    return num > 0 ? `+${num}` : `${num}`;
}

function formatProb(v: any): string {
    if (v == null) return '—';
    const n = Number(v);
    if (n > 0 && n <= 1) return `${(n * 100).toFixed(1)}%`;
    return `${n.toFixed(1)}%`;
}

function fmtStat(v: any, decimals = 1): string {
    if (v == null || isNaN(Number(v))) return '—';
    return Number(v).toFixed(decimals);
}

function fmtAvg(v: any): string {
    if (v == null || isNaN(Number(v))) return '—';
    return Number(v).toFixed(3).replace(/^0/, '');
}

const TIER = (pts: number) => {
    if (pts >= 10) return { color: '#FFD700', glow: 'rgba(255,215,0,0.5)', bg: 'rgba(255,215,0,0.08)', border: 'rgba(255,215,0,0.5)' };
    if (pts >= 5)  return { color: '#00D4FF', glow: 'rgba(0,212,255,0.4)', bg: 'rgba(0,212,255,0.08)', border: 'rgba(0,212,255,0.5)' };
    return           { color: '#64b5c8', glow: 'rgba(100,181,200,0.3)', bg: 'rgba(100,181,200,0.06)', border: 'rgba(100,181,200,0.3)' };
};

// ── Headshot with team-logo fallback ────────────────────────────────────────
function PlayerAvatar({ playerId, teamId, size = 64 }: { playerId: number; teamId: number | null; size?: number }) {
    const [headshotFailed, setHeadshotFailed] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);

    const headshotUrl = playerHeadshot(playerId);
    const logoUrl = teamLogo(teamId);

    const sz = size;

    if (!headshotFailed && headshotUrl) {
        return (
            <div
                className="flex-shrink-0 rounded-full overflow-hidden border-2 border-[#3d4f5f] bg-[#0a0a15]"
                style={{ width: sz, height: sz, boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.8), 0 0 8px rgba(0,212,255,0.1)' }}
            >
                <Image
                    unoptimized
                    src={headshotUrl}
                    alt=""
                    width={sz}
                    height={sz}
                    className="w-full h-full object-cover brightness-110"
                    onError={() => setHeadshotFailed(true)}
                />
            </div>
        );
    }

    if (!logoFailed && logoUrl) {
        return (
            <div
                className="flex-shrink-0 rounded-full overflow-hidden border-2 border-[#3d4f5f] bg-[#0a0a15] flex items-center justify-center p-2"
                style={{ width: sz, height: sz, boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.8), 0 0 8px rgba(0,212,255,0.1)' }}
            >
                <Image
                    unoptimized
                    src={logoUrl}
                    alt=""
                    width={sz - 12}
                    height={sz - 12}
                    className="w-full h-full object-contain brightness-125"
                    onError={() => setLogoFailed(true)}
                />
            </div>
        );
    }

    // Generic silhouette fallback
    return (
        <div
            className="flex-shrink-0 rounded-full border-2 border-[#3d4f5f] bg-[#1a2332] flex items-center justify-center"
            style={{ width: sz, height: sz }}
        >
            <svg width={sz * 0.5} height={sz * 0.5} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" fill="#3d4f5f" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="#3d4f5f" />
            </svg>
        </div>
    );
}

// ── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ label, value, color = '#8a9ba8' }: { label: string; value: string; color?: string }) {
    return (
        <div className="flex flex-col items-center bg-[#0a0a15] border border-[#2a3a4a] rounded-sm px-2 py-1 min-w-[44px]">
            <span className="text-[10px] font-black text-[#4a5a6a] tracking-widest uppercase leading-none mb-0.5">{label}</span>
            <span className="text-[17px] font-black leading-none" style={{ color }}>{value}</span>
        </div>
    );
}

// ── Prop Card ────────────────────────────────────────────────────────────────
const PropCard = ({ prop, idx }: { prop: any; idx: number }) => {
    const edge = Number(prop.edge_pts) || 0;
    const tier = TIER(edge);
    const isOver = prop.rec === 'over' || (prop.model_proj != null && prop.line != null && Number(prop.model_proj) > Number(prop.line));
    const ev = prop.ev_pct != null ? Number(prop.ev_pct) : null;
    const market = (prop.prop_type || prop.prop || '').toLowerCase();
    const isPitcher = prop.player_kind === 'pitcher' ||
        market.includes('pitcher') ||
        market.includes('earned_run') ||
        market.includes('strikeout') ||
        market === 'runs_allowed' ||
        market === 'outs_recorded';
    const stats = prop.stats || {};

    return (
        <div
            className="relative bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-lg overflow-hidden transition-all hover:border-[#00D4FF] group"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 12px rgba(0,0,0,0.6)' }}
        >
            {/* Left tier accent bar */}
            <div
                className="absolute top-0 left-0 w-[3px] h-full rounded-r-sm opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ background: tier.color, boxShadow: `0 0 10px ${tier.glow}` }}
            />
            {/* Corner screws */}
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] opacity-40" />
            <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] opacity-40" />

            <div className="pl-4 pr-3 pt-3 pb-3">
                {/* ── Top Row: Avatar + Name/Prop + Edge Badge ── */}
                <div className="flex items-start gap-3 mb-3">
                    {/* Avatar */}
                    <PlayerAvatar playerId={prop.player_id} teamId={prop.team_id} size={60} />

                    {/* Name + prop info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            {prop.team_abbr && (
                                <span className="text-[10px] font-black text-[#5a6a7a] tracking-widest uppercase bg-[#0a0a15] border border-[#2a3a4a] px-1.5 py-0 rounded-sm leading-5">
                                    {prop.team_abbr}
                                </span>
                            )}
                            <span
                                className="text-[20px] font-black text-white tracking-wide uppercase leading-tight"
                                style={{ fontFamily: "'Rajdhani', sans-serif" }}
                            >
                                {prop.player_name}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span
                                className="text-[13px] font-black tracking-wider uppercase"
                                style={{ color: '#00D4FF', textShadow: '0 0 6px rgba(0,212,255,0.4)' }}
                            >
                                {formatProp(prop.prop_type || prop.prop)}
                            </span>
                            {prop.line != null && (
                                <span className="text-[13px] font-black text-[#8a9ba8] ">
                                    {isOver ? 'O' : 'U'} {prop.line}
                                </span>
                            )}
                            {/* Rank badge */}
                            <span className="text-[10px] font-black text-[#3d4f5f]  ml-auto">
                                #{idx + 1}
                            </span>
                        </div>

                        {/* Pitcher record inline */}
                        {isPitcher && (stats.w != null || stats.l != null || stats.era != null) && (
                            <div className="mt-1 text-[11px] font-black text-[#8a9ba8] tracking-wider ">
                                {stats.w != null && stats.l != null ? `${stats.w}-${stats.l}` : ''}
                                {stats.era != null ? ` • ERA ${fmtStat(stats.era, 2)}` : ''}
                                {stats.whip != null ? ` • WHIP ${fmtStat(stats.whip, 2)}` : ''}
                            </div>
                        )}
                    </div>

                    {/* Edge badge */}
                    <div className="flex-shrink-0 ml-auto">
                        <BetScoreBadge score={Number((ev || 0).toFixed(1)) + 50} isOver={isOver} />
                    </div>
                </div>

                {/* ── Model Stats Row ── */}
                <div className="flex gap-1.5 flex-wrap mb-2.5">
                    <StatPill label="ODDS" value={formatOdds(prop.odds ?? prop.best_price)} color="#ffffff" />
                    {prop.model_proj != null && (
                        <StatPill label="PROJ" value={fmtStat(prop.model_proj, 1)} color="#00D4FF" />
                    )}
                    {ev != null && (
                        <StatPill label="EV%" value={`${ev > 0 ? '+' : ''}${ev.toFixed(1)}`} color={ev > 0 ? '#22C55E' : '#8a9ba8'} />
                    )}
                    <StatPill label="WIN%" value={formatProb(prop.implied_prob)} color="#e2e8f0" />
                </div>

                {/* ── Odds Market Row ── */}
                <div className="flex items-center gap-2 mb-3 bg-[#0a0a15] border border-[#2a3a4a] rounded px-3 py-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    <span className="text-[10px] font-black text-[#5a6a7a] tracking-widest uppercase whitespace-nowrap shrink-0">AVG LINE</span>
                    <span className="text-[13px] font-black text-[#FFD700] shrink-0 mr-2">
                        {probToAmericanOdds(prop.market_novig_over)}
                    </span>
                    
                    {Array.isArray(prop.best_lines) && prop.best_lines.length > 0 && (
                        <>
                            <div className="w-px h-4 bg-[#2a3a4a] mx-1 shrink-0" />
                            <span className="text-[10px] font-black text-[#5a6a7a] tracking-widest uppercase whitespace-nowrap shrink-0">BEST:</span>
                            <div className="flex items-center gap-2 shrink-0">
                                {prop.best_lines.slice(0, 3).map((bk: any, i: number) => (
                                    <div key={i} className="flex items-center gap-1">
                                        <span className="text-[11px] font-bold text-[#8a9ba8]">{bk.sportsbook}</span>
                                        <span className="text-[11px] font-black text-white">{formatOdds(bk.price)}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* ── Player Stats Row ── */}
                <div className="border-t border-[#2a3a4a] pt-2.5">
                    {isPitcher ? (
                        // Pitcher stats (ERA/WHIP/W/L/SO from agg_pitcher; FIP/SIERA from v_pitcher_profile)
                        <div className="flex gap-1.5 flex-wrap">
                            {stats.era  != null && <StatPill label="ERA"   value={fmtStat(stats.era,  2)} color="#00D4FF" />}
                            {stats.whip != null && <StatPill label="WHIP"  value={fmtStat(stats.whip, 2)} color="#e2e8f0" />}
                            {stats.fip  != null && <StatPill label="FIP"   value={fmtStat(stats.fip,  2)} color="#8a9ba8" />}
                            {stats.siera!= null && <StatPill label="SIERA" value={fmtStat(stats.siera,2)} color="#8a9ba8" />}
                            {stats.so   != null && <StatPill label="SO"    value={String(Math.round(stats.so))} color="#22C55E" />}
                            {stats.w != null && stats.l != null && <StatPill label="W-L" value={`${Math.round(stats.w)}-${Math.round(stats.l)}`} color="#e2e8f0" />}
                            {stats.era == null && stats.fip == null && stats.whip == null && (
                                <span className="text-[10px] font-black text-[#3d4f5f] tracking-widest uppercase self-center">STATS PENDING</span>
                            )}
                        </div>
                    ) : (
                        // Hitter stats (counting stats from splits JSON in v_hitter_profile)
                        <div className="flex gap-1.5 flex-wrap">
                            {stats.avg     != null && <StatPill label="AVG"  value={fmtAvg(stats.avg)}                   color="#00D4FF" />}
                            {stats.hr      != null && <StatPill label="HR"   value={String(Math.round(stats.hr))}         color="#FFD700" />}
                            {stats.rbi     != null && <StatPill label="RBI"  value={String(Math.round(stats.rbi))}        color="#22C55E" />}
                            {stats.obp     != null && <StatPill label="OBP"  value={fmtAvg(stats.obp)}                   color="#8a9ba8" />}
                            {stats.slg     != null && <StatPill label="SLG"  value={fmtAvg(stats.slg)}                   color="#8a9ba8" />}
                            {stats.wrc_plus!= null && <StatPill label="wRC+" value={String(Math.round(stats.wrc_plus))}  color="#e2e8f0" />}
                            {stats.woba    != null && <StatPill label="wOBA" value={fmtAvg(stats.woba)}                  color="#8a9ba8" />}
                            {/* Fallback: show wRC+/wOBA even when splits unavailable */}
                            {stats.avg == null && stats.hr == null && stats.rbi == null &&
                             stats.wrc_plus == null && stats.woba == null && (
                                <span className="text-[10px] font-black text-[#3d4f5f] tracking-widest uppercase self-center">STATS PENDING</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PropsPage() {
    const router = useRouter();
    const [filter, setFilter] = useState('ALL');
    const [minEdge, setMinEdge] = useState(0);
    const [todayStr, setTodayStr] = useState<string>('');

    useEffect(() => {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        setTodayStr(formatter.format(new Date()));
    }, []);

    const { data, error, isLoading } = useSWR('/api/mlb/props', fetcher, {
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
        <div
            className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] w-full max-w-[100vw] overflow-x-hidden box-border"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
        >
            <SEOHead
                title="Player Props | MLB Analytics"
                description="Daily MLB Player Prop Edges Surfaced By AI Models."
                noIndex={true}
            />
            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />

            {/* ── Page Header ──────────────────────────────────────────── */}
            <header className="relative px-4 pt-5 pb-4 bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-[3px] border-[#3d4f5f] shadow-[0_8px_30px_rgba(0,0,0,0.8)] z-10">
                <div className="absolute top-3 left-3 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />
                <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" />

                <div className="flex items-start justify-between gap-3">
                    <div>
                        <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-1 text-[#5a6a7a] text-[11px] font-black no-underline tracking-widest uppercase hover:text-[#00D4FF] transition-colors mb-1.5">
                            ← DASHBOARD
                        </Link>
                        <h1
                            className="text-[30px] font-black tracking-[0.15em] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] m-0 leading-none"
                            style={{ fontFamily: "'Rajdhani', sans-serif" }}
                        >
                            PLAYER <span className="text-[#00D4FF]" style={{ textShadow: '0 0 12px rgba(0,212,255,0.7)' }}>PROPS</span>
                        </h1>
                        <p className="m-0 text-[12px] font-black text-[#5a6a7a] tracking-widest uppercase mt-1">
                            Ranked By Edge Points • {todayStr || '...'}
                        </p>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-col gap-1.5 items-end flex-shrink-0 mt-1">
                        <div className="flex items-center gap-2 bg-[#0a0a15] border border-[#3d4f5f] px-3 py-1.5 rounded-sm">
                            <span className="text-[11px] font-black text-[#5a6a7a] tracking-widest uppercase">TOTAL</span>
                            <span className="text-[20px] font-black text-white  leading-none" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                                {isLoading ? '—' : totalProps}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 bg-[#001a2a] border border-[#00D4FF]/50 px-3 py-1.5 rounded-sm" style={{ boxShadow: '0 0 8px rgba(0,212,255,0.15)' }}>
                            <TrendingUp size={13} className="text-[#00D4FF]" />
                            <span className="text-[11px] font-black text-[#00D4FF] tracking-widest uppercase">5+ EDGE</span>
                            <span className="text-[20px] font-black text-[#00D4FF]  leading-none" style={{ fontFamily: "'Rajdhani', sans-serif", textShadow: '0 0 6px rgba(0,212,255,0.5)' }}>
                                {isLoading ? '—' : eliteProps}
                            </span>
                        </div>
                        {goldProps > 0 && (
                            <div className="flex items-center gap-2 bg-[#1a1000] border border-[#FFD700]/50 px-3 py-1.5 rounded-sm" style={{ boxShadow: '0 0 8px rgba(255,215,0,0.15)' }}>
                                <span className="text-[11px] font-black text-[#FFD700] tracking-widest uppercase">10+ ELITE</span>
                                <span className="text-[20px] font-black text-[#FFD700]  leading-none" style={{ fontFamily: "'Rajdhani', sans-serif", textShadow: '0 0 6px rgba(255,215,0,0.5)' }}>
                                    {goldProps}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="absolute bottom-0 left-[10%] right-[10%] h-[2px] bg-[#00D4FF] shadow-[0_0_10px_#00D4FF,0_0_20px_rgba(0,212,255,0.4)] rounded-t-full" />
            </header>

            {/* ── Filter Bar ───────────────────────────────────────────── */}
            <div className="relative flex flex-wrap items-center gap-2 px-3 py-2.5 bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-2 border-[#3d4f5f] shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]">
                <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                    {FILTERS.map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 border-2 text-[11px] font-black tracking-widest whitespace-nowrap cursor-pointer transition-all uppercase rounded-sm ${
                                filter === f
                                    ? 'bg-[#001a2a] text-[#00D4FF] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.25)]'
                                    : 'bg-[#0d1117] text-[#5a6a7a] border-[#2a3a4a] hover:border-[#3d4f5f] hover:text-slate-300'
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5 ml-auto bg-[#0d1117] border-2 border-[#2a3a4a] rounded-sm px-2.5 py-1.5 hover:border-[#3d4f5f] transition-colors flex-shrink-0">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#5a6a7a]">MIN EDGE:</span>
                    <select
                        value={minEdge}
                        onChange={(e) => setMinEdge(parseFloat(e.target.value))}
                        className="bg-transparent border-none text-[13px] font-black text-[#00D4FF] outline-none cursor-pointer uppercase tracking-wider"
                    >
                        <option value="0" className="bg-[#0d1117]">ANY</option>
                        <option value="3" className="bg-[#0d1117]">&gt; 3</option>
                        <option value="5" className="bg-[#0d1117]">&gt; 5</option>
                        <option value="8" className="bg-[#0d1117]">&gt; 8</option>
                        <option value="10" className="bg-[#0d1117]">&gt; 10</option>
                    </select>
                </div>
            </div>

            {/* ── Stale Banner ─────────────────────────────────────────── */}
            {isStale && !isLoading && (
                <div className="mx-3 mt-3 rounded-sm border-2 border-amber-500/50 bg-[#1a1500] px-4 py-2.5 relative overflow-hidden">
                    <div className="absolute left-0 top-0 w-1 h-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" />
                    <div className="flex items-center gap-2">
                        <CalendarX size={15} className="text-amber-500 flex-shrink-0" />
                        <div>
                            <p className="text-[12px] font-black tracking-widest uppercase text-amber-500 m-0">STALE SLATE — NOT ACTIONABLE</p>
                            <p className="text-[10px] text-amber-600/70 font-bold uppercase tracking-wider m-0 mt-0.5">Props from a previous date. Today's lines not yet posted.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main Content ──────────────────────────────────────────── */}
            <main className="mx-auto max-w-2xl px-3 pt-4 pb-6 relative">
                {/* Loading */}
                {isLoading && !data && (
                    <div className="flex flex-col items-center justify-center mt-20 gap-4">
                        <div className="w-10 h-10 rounded-full border-2 border-[#5a6a7a] border-t-[#00D4FF] animate-spin" />
                        <span className="text-[#5a6a7a] font-black tracking-widest text-[12px] uppercase ">
                            Scanning Props Vault...
                        </span>
                    </div>
                )}

                {/* Error */}
                {error && !isLoading && (
                    <div className="mt-4 rounded-sm border-2 border-red-500/50 bg-[#1a0a0a] px-4 py-3 relative">
                        <div className="absolute left-0 top-0 w-1 h-full bg-red-500 shadow-[0_0_10px_#ef4444]" />
                        <p className="text-[13px] font-black tracking-widest uppercase text-red-500">System Error</p>
                        <p className="text-[11px] text-red-400 mt-1 font-bold tracking-wider">Failed to load props data. Retrying...</p>
                    </div>
                )}

                {/* Empty */}
                {!isLoading && !error && filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-[#3d4f5f] rounded-lg bg-[#0d1117] mt-4 opacity-60">
                        {filter === 'ALL'
                            ? <CalendarX size={40} className="text-[#3d4f5f] mb-4" />
                            : <SearchX size={40} className="text-[#3d4f5f] mb-4" />
                        }
                        <p className="text-[15px] font-black tracking-widest uppercase text-[#5a6a7a] text-center">
                            {filter === 'ALL' ? 'No Props Available — Awaiting Model Output' : `No ${filter} Props Found`}
                        </p>
                        <p className="text-[11px] text-[#3d4f5f] font-bold tracking-widest uppercase text-center mt-1.5">
                            Props release 3–4 hours before first pitch
                        </p>
                    </div>
                )}

                {/* Props list */}
                {!isLoading && filtered.length > 0 && (
                    <div className="flex flex-col gap-3">
                        {filtered.map((prop: any, idx: number) => (
                            <PropCard key={`prop-${prop.player_id}-${prop.prop}-${idx}`} prop={prop} idx={idx} />
                        ))}
                    </div>
                )}

                {/* Result count */}
                {!isLoading && filtered.length > 0 && (
                    <div className="mt-5 text-center">
                        <span className="text-[11px] font-black text-[#3d4f5f] tracking-widest uppercase ">
                            {filtered.length} PROPS · RANKED BY EDGE POINTS
                        </span>
                    </div>
                )}

                {/* Footer */}
                <div className="mt-6 px-4 py-3 bg-[#0d1117] border border-[#2a3a4a] rounded-sm text-[11px] font-black tracking-wide text-[#4a5a6a] text-center leading-relaxed">
                    <span className="text-[#00D4FF]">ANALYSIS ONLY</span> — NOT BETTING ADVICE.{' '}
                    EDGE PTS = VARIANCE BETWEEN PROJECTION & MARKET LINE.
                </div>
            </main>

            <BottomNavBar />
        </div>
    );
}
