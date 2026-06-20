// @ts-nocheck
import { useRouter } from 'next/router';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import useSWR from 'swr';
import { CalendarX, SearchX, TrendingUp, TrendingDown, Info, Minus, X, Zap, Activity, ChevronRight } from 'lucide-react';
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

// ── Market filters — matched against the exact pred_props.prop vocabulary ───────
const FILTERS: { label: string; match: (prop: string) => boolean }[] = [
    { label: 'ALL',          match: () => true },
    { label: 'STRIKEOUTS',   match: p => p === 'pitcher_strikeouts' },
    { label: 'HITS',         match: p => p === 'hits' },
    { label: 'HOME RUNS',    match: p => p === 'home_run' },
    { label: 'TOTAL BASES',  match: p => p === 'total_bases' },
    { label: 'RBI',          match: p => p === 'rbi' },
    { label: 'RUNS',         match: p => p === 'runs' },
    { label: 'WALKS',        match: p => p === 'walks' || p === 'pitcher_walks' },
    { label: 'STOLEN BASES', match: p => p === 'stolen_bases' },
    { label: 'H+R+RBI',      match: p => p === 'hrr' },
    { label: 'EARNED RUNS',  match: p => p === 'earned_runs' },
];

// Canonical tier palette — same five tiers / thresholds as src/lib/betScore.ts.
const TIER_COLOR: Record<string, { color: string; glow: string; bg: string; border: string }> = {
    ELITE:  { color: '#00D4FF', glow: 'rgba(0,212,255,0.5)',   bg: 'rgba(0,212,255,0.08)',  border: 'rgba(0,212,255,0.5)' },
    STRONG: { color: '#34D399', glow: 'rgba(52,211,153,0.4)',  bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.5)' },
    LEAN:   { color: '#38BDF8', glow: 'rgba(56,189,248,0.3)',  bg: 'rgba(56,189,248,0.06)', border: 'rgba(56,189,248,0.4)' },
    THIN:   { color: '#F59E0B', glow: 'rgba(245,158,11,0.3)',  bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.4)' },
    PASS:   { color: '#64748B', glow: 'rgba(100,116,139,0.25)', bg: 'rgba(100,116,139,0.06)', border: 'rgba(100,116,139,0.4)' },
};
const tierStyle = (t: string | null | undefined) => TIER_COLOR[t || 'PASS'] || TIER_COLOR.PASS;

const PITCHER_PROPS = new Set(['pitcher_strikeouts', 'pitcher_walks', 'earned_runs', 'outs_recorded', 'runs_allowed']);

function formatProp(raw: string): string {
    if (!raw) return '';
    if (raw === 'hrr') return 'H+R+RBI';
    return raw.replace(/_/g, ' ').toUpperCase();
}

function formatOdds(n: any): string {
    if (n == null || n === '' || isNaN(Number(n))) return '—';
    const num = Number(n);
    return num > 0 ? `+${num}` : `${num}`;
}

function formatPct(v: any): string {
    if (v == null || isNaN(Number(v))) return '—';
    const n = Number(v);
    if (n > 0 && n <= 1) return `${(n * 100).toFixed(0)}%`;
    return `${n.toFixed(0)}%`;
}

function fmtStat(v: any, decimals = 1): string {
    if (v == null || isNaN(Number(v))) return '—';
    return Number(v).toFixed(decimals);
}

function fmtAvg(v: any): string {
    if (v == null || isNaN(Number(v))) return '—';
    return Number(v).toFixed(3).replace(/^0/, '');
}

function isPitcherProp(prop: any): boolean {
    if (prop.player_kind === 'pitcher') return true;
    const market = (prop.prop_type || prop.prop || '').toLowerCase();
    return PITCHER_PROPS.has(market) || market.includes('pitcher') || market.includes('strikeout') || market.includes('earned_run');
}

// ── Headshot with team-logo fallback ────────────────────────────────────────
function PlayerAvatar({ playerId, teamId, size = 64, tierColor = '#3d4f5f' }: { playerId: number; teamId: number | null; size?: number; tierColor?: string }) {
    const [headshotFailed, setHeadshotFailed] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);

    const headshotUrl = playerHeadshot(playerId);
    const logoUrl = teamLogo(teamId);
    const sz = size;

    if (!headshotFailed && headshotUrl) {
        return (
            <div
                className="flex-shrink-0 rounded-full overflow-hidden border-2 bg-[#0a0a15]"
                style={{ width: sz, height: sz, borderColor: tierColor, boxShadow: `inset 0 2px 6px rgba(0,0,0,0.8), 0 0 8px ${tierColor}33` }}
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

// ── Detail Modal — rationale + full stats (parity with Best Bets) ──────────────
function PropDetailModal({ prop, onClose }: { prop: any; onClose: () => void }) {
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const ts = tierStyle(prop.bet_tier);
    const isPitcher = isPitcherProp(prop);
    const stats = prop.stats || {};
    const factors: any[] = Array.isArray(prop.score_factors) ? prop.score_factors : [];
    const isOver = prop.side ? prop.side === 'over' : (prop.isOver ?? true);

    return (
        <div
            className="fixed inset-0 z-[9999] flex flex-col"
            style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="relative flex flex-col w-full max-w-lg mx-auto h-full overflow-y-auto"
                style={{ background: 'linear-gradient(180deg, #0d1117 0%, #131e2e 100%)' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${ts.color}, transparent)`, boxShadow: `0 0 20px ${ts.glow}` }} />

                {/* Header bar */}
                <div className="sticky top-0 z-10 flex justify-between items-center px-4 py-3 border-b border-[#2a3a4a]" style={{ background: 'rgba(13,17,23,0.97)', backdropFilter: 'blur(10px)' }}>
                    <div className="text-[10px] font-black text-[#5a6a7a] uppercase tracking-widest">Prop Details</div>
                    <button onClick={onClose} className="p-2 rounded-sm border border-[#3d4f5f] text-slate-400 hover:text-white hover:border-[#00D4FF] transition-all active:scale-95">
                        <X size={16} />
                    </button>
                </div>

                {/* Hero */}
                <div className="flex flex-col items-center pt-5 pb-4 px-4 border-b border-[#2a3a4a] relative overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 0%, ${ts.bg} 0%, transparent 70%)` }} />
                    <div className="relative mb-3">
                        <PlayerAvatar playerId={prop.player_id} teamId={prop.team_id} size={108} tierColor={ts.color} />
                        <div className="absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-sm text-[9px] font-black tracking-widest uppercase" style={{ background: ts.color, color: '#000' }}>
                            {prop.bet_tier || 'PASS'}
                        </div>
                    </div>
                    <div className="text-center mt-1">
                        <div className="text-[22px] font-black text-white uppercase tracking-wider mb-0.5" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                            {prop.player_name}
                        </div>
                        <div className="inline-flex items-center gap-1.5 bg-[#0d1117] border border-[#3d4f5f] px-3 py-1 rounded-sm mt-1">
                            <div className="w-2 h-2 rounded-full" style={{ background: ts.color }} />
                            <span className="text-[12px] font-black tracking-wider uppercase" style={{ color: '#00D4FF' }}>{formatProp(prop.prop_type || prop.prop)}</span>
                            {prop.line != null && (
                                <span className="text-[12px] font-black text-slate-300">{isOver ? 'OVER' : 'UNDER'} {prop.line}</span>
                            )}
                        </div>
                        {prop.team_abbr && (
                            <div className="text-[11px] font-black text-[#5a6a7a] mt-2 tracking-widest uppercase">{prop.team_abbr}</div>
                        )}
                    </div>
                </div>

                {/* Key metrics */}
                <div className="px-4 py-3 border-b border-[#2a3a4a]">
                    <div className="text-[9px] font-black text-[#00D4FF] mb-2 uppercase tracking-widest">Key Metrics</div>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                        <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                            <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5">Bet Score</div>
                            <div className="text-[24px] font-black" style={{ fontFamily: "'Rajdhani', sans-serif", color: ts.color }}>{prop.bet_score ?? '—'}</div>
                            <div className="text-[8px] text-[#3d4f5f] uppercase tracking-widest">/100</div>
                        </div>
                        <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                            <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5">Win%</div>
                            <div className="text-[20px] font-black text-white" style={{ fontFamily: "'Rajdhani', sans-serif" }}>{prop.win_confidence != null ? `${Math.round(Number(prop.win_confidence))}%` : '—'}</div>
                        </div>
                        {prop.ev_pct != null && (
                            <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                                <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5">EV%</div>
                                <div className="text-[20px] font-black" style={{ fontFamily: "'Rajdhani', sans-serif", color: Number(prop.ev_pct) > 0 ? '#00D4FF' : '#FF6B6B' }}>
                                    {Number(prop.ev_pct) > 0 ? '+' : ''}{Number(prop.ev_pct).toFixed(1)}%
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                            <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5">Best Odds</div>
                            <div className="text-[16px] font-black text-white" style={{ fontFamily: "'Rajdhani', sans-serif" }}>{formatOdds(prop.odds ?? prop.price)}</div>
                            {prop.best_book && <div className="text-[8px] text-[#00D4FF] uppercase tracking-widest mt-0.5">{prop.best_book}</div>}
                        </div>
                        {prop.p_market != null && (
                            <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                                <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5">Mkt No-Vig</div>
                                <div className="text-[16px] font-black text-slate-300" style={{ fontFamily: "'Rajdhani', sans-serif" }}>{formatPct(prop.p_market)}</div>
                            </div>
                        )}
                        {prop.kelly_pct != null && prop.kelly_pct > 0 && (
                            <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                                <div className="text-[9px] font-black text-[#5a6a7a] uppercase tracking-widest mb-0.5">Kelly</div>
                                <div className="text-[16px] font-black text-[#FFD700]" style={{ fontFamily: "'Rajdhani', sans-serif" }}>{Number(prop.kelly_pct).toFixed(2)}%</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Rationale */}
                {factors.length > 0 && (
                    <div className="px-4 py-3 border-b border-[#2a3a4a]">
                        <div className="text-[9px] font-black text-[#00D4FF] mb-2 uppercase tracking-widest">{prop.score_verdict || 'Analysis'}</div>
                        <div className="flex flex-col gap-1.5">
                            {factors.map((factor: any, i: number) => (
                                <div key={i} className="flex gap-2.5 items-start bg-[#0a0f1a] p-2.5 rounded-sm border border-[#2a3a4a]">
                                    <div className="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-sm border border-[#3d4f5f] bg-[#0d1117]">
                                        {factor?.dir === 'up' && <TrendingUp size={10} className="text-[#00D4FF]" />}
                                        {factor?.dir === 'down' && <TrendingDown size={10} className="text-[#FF6B6B]" />}
                                        {factor?.dir === 'info' && <Info size={10} className="text-slate-400" />}
                                        {factor?.dir === 'flat' && <Minus size={10} className="text-slate-400" />}
                                    </div>
                                    <div className="text-[12px] text-slate-300 leading-relaxed font-bold tracking-wide flex-1">{factor?.text}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Player profile */}
                <div className="px-4 py-3 border-b border-[#2a3a4a]">
                    <div className="text-[9px] font-black text-[#FFD700] mb-2 uppercase tracking-widest flex items-center gap-1.5">
                        {isPitcher ? <><Zap size={10} /> Pitcher Profile</> : <><Activity size={10} /> Hitter Profile</>}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                        {isPitcher ? (
                            <>
                                {stats.era  != null && <StatPill label="ERA"   value={fmtStat(stats.era, 2)} color="#00D4FF" />}
                                {stats.whip != null && <StatPill label="WHIP"  value={fmtStat(stats.whip, 2)} color="#e2e8f0" />}
                                {stats.fip  != null && <StatPill label="FIP"   value={fmtStat(stats.fip, 2)} color="#8a9ba8" />}
                                {stats.siera!= null && <StatPill label="SIERA" value={fmtStat(stats.siera, 2)} color="#8a9ba8" />}
                                {stats.so   != null && <StatPill label="SO"    value={String(Math.round(stats.so))} color="#22C55E" />}
                                {stats.w != null && stats.l != null && <StatPill label="W-L" value={`${Math.round(stats.w)}-${Math.round(stats.l)}`} color="#e2e8f0" />}
                            </>
                        ) : (
                            <>
                                {stats.avg     != null && <StatPill label="AVG"  value={fmtAvg(stats.avg)} color="#00D4FF" />}
                                {stats.hr      != null && <StatPill label="HR"   value={String(Math.round(stats.hr))} color="#FFD700" />}
                                {stats.rbi     != null && <StatPill label="RBI"  value={String(Math.round(stats.rbi))} color="#22C55E" />}
                                {stats.obp     != null && <StatPill label="OBP"  value={fmtAvg(stats.obp)} color="#8a9ba8" />}
                                {stats.slg     != null && <StatPill label="SLG"  value={fmtAvg(stats.slg)} color="#8a9ba8" />}
                                {stats.wrc_plus!= null && <StatPill label="wRC+" value={String(Math.round(stats.wrc_plus))} color="#e2e8f0" />}
                                {stats.woba    != null && <StatPill label="wOBA" value={fmtAvg(stats.woba)} color="#8a9ba8" />}
                            </>
                        )}
                    </div>
                </div>

                <div className="px-4 py-4 mt-auto">
                    <div className="text-[9px] text-[#5a6a7a] text-center leading-relaxed font-black tracking-wide uppercase">
                        Analysis Only — Not Betting Advice.<br />
                        <span className="text-[#8a9ba8]">Bet Score (0–100) ranks value (EV + confidence). Bet responsibly.</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Prop Card ────────────────────────────────────────────────────────────────
const PropCard = ({ prop, idx, onOpen }: { prop: any; idx: number; onOpen: (p: any) => void }) => {
    const ts = tierStyle(prop.bet_tier);
    const isOver = prop.side ? prop.side === 'over' : (prop.isOver ?? (prop.model_proj != null && prop.line != null && Number(prop.model_proj) > Number(prop.line)));
    const ev = prop.ev_pct != null ? Number(prop.ev_pct) : null;
    const isPitcher = isPitcherProp(prop);
    const stats = prop.stats || {};

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(prop)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(prop); } }}
            className="relative bg-gradient-to-b from-[#1a2332] to-[#0d1117] border border-[#3d4f5f] rounded-lg overflow-hidden transition-all hover:border-[#00D4FF] focus:border-[#00D4FF] focus:outline-none cursor-pointer group"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 12px rgba(0,0,0,0.6)' }}
        >
            {/* Left tier accent bar */}
            <div className="absolute top-0 left-0 w-[3px] h-full rounded-r-sm opacity-60 group-hover:opacity-100 transition-opacity" style={{ background: ts.color, boxShadow: `0 0 10px ${ts.glow}` }} />
            {/* Corner screws */}
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] opacity-40" />
            <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#2a3a4a] border border-[#0a0a15] opacity-40" />

            <div className="pl-4 pr-3 pt-3 pb-3">
                {/* ── Top Row: Avatar + Name/Prop + Bet Score Badge ── */}
                <div className="flex items-start gap-3 mb-3">
                    <PlayerAvatar playerId={prop.player_id} teamId={prop.team_id} size={60} tierColor={ts.color} />

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            {prop.team_abbr && (
                                <span className="text-[10px] font-black text-[#5a6a7a] tracking-widest uppercase bg-[#0a0a15] border border-[#2a3a4a] px-1.5 py-0 rounded-sm leading-5">
                                    {prop.team_abbr}
                                </span>
                            )}
                            <span className="text-[20px] font-black text-white tracking-wide uppercase leading-tight" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                                {prop.player_name}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[13px] font-black tracking-wider uppercase" style={{ color: '#00D4FF', textShadow: '0 0 6px rgba(0,212,255,0.4)' }}>
                                {formatProp(prop.prop_type || prop.prop)}
                            </span>
                            {prop.line != null && (
                                <span className="text-[13px] font-black text-[#8a9ba8]">
                                    {isOver ? 'O' : 'U'} {prop.line}
                                </span>
                            )}
                            {prop.kelly_pct != null && prop.kelly_pct > 0 && (
                                <span className="rounded-sm bg-[#FFD700]/10 border border-[#FFD700]/40 px-1.5 py-[1px] text-[10px] font-black text-[#FFD700]">
                                    {Number(prop.kelly_pct).toFixed(2)}% K
                                </span>
                            )}
                            <span className="text-[10px] font-black text-[#3d4f5f] ml-auto">#{idx + 1}</span>
                        </div>

                        {/* Pitcher record inline */}
                        {isPitcher && (stats.w != null || stats.l != null || stats.era != null) && (
                            <div className="mt-1 text-[11px] font-black text-[#8a9ba8] tracking-wider">
                                {stats.w != null && stats.l != null ? `${Math.round(stats.w)}-${Math.round(stats.l)}` : ''}
                                {stats.era != null ? ` • ERA ${fmtStat(stats.era, 2)}` : ''}
                                {stats.whip != null ? ` • WHIP ${fmtStat(stats.whip, 2)}` : ''}
                            </div>
                        )}
                    </div>

                    {/* Canonical Bet Score badge */}
                    <div className="flex-shrink-0 ml-auto">
                        <BetScoreBadge pWin={prop.p_win} price={prop.price} pMarket={prop.p_market} />
                    </div>
                </div>

                {/* ── Model Stats Row ── */}
                <div className="flex gap-1.5 flex-wrap mb-2.5">
                    <StatPill label="ODDS" value={formatOdds(prop.odds ?? prop.price)} color="#ffffff" />
                    {prop.model_proj != null && (
                        <StatPill label="PROJ" value={fmtStat(prop.model_proj, 1)} color="#00D4FF" />
                    )}
                    {ev != null && (
                        <StatPill label="EV%" value={`${ev > 0 ? '+' : ''}${ev.toFixed(1)}`} color={ev > 0 ? '#22C55E' : '#8a9ba8'} />
                    )}
                    <StatPill label="WIN%" value={prop.win_confidence != null ? `${Math.round(Number(prop.win_confidence))}%` : '—'} color="#e2e8f0" />
                </div>

                {/* ── Odds Market Row ── */}
                <div className="flex items-center gap-2 mb-3 bg-[#0a0a15] border border-[#2a3a4a] rounded px-3 py-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    <span className="text-[10px] font-black text-[#5a6a7a] tracking-widest uppercase whitespace-nowrap shrink-0">MKT LINE</span>
                    <span className="text-[13px] font-black text-[#FFD700] shrink-0 mr-2">
                        {probToAmericanOdds(prop.p_market != null ? prop.p_market : prop.market_novig_over)}
                    </span>

                    {Array.isArray(prop.best_lines) && prop.best_lines.length > 0 && (
                        <>
                            <div className="w-px h-4 bg-[#2a3a4a] mx-1 shrink-0" />
                            <span className="text-[10px] font-black text-[#5a6a7a] tracking-widest uppercase whitespace-nowrap shrink-0">BEST:</span>
                            <div className="flex items-center gap-2 shrink-0">
                                {prop.best_lines.slice(0, 3).map((bk: any, i: number) => (
                                    <div key={i} className="flex items-center gap-1">
                                        <span className="text-[11px] font-bold text-[#8a9ba8]">{bk.sportsbook || bk.book}</span>
                                        <span className="text-[11px] font-black text-white">{formatOdds(bk.price)}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    <ChevronRight size={13} className="text-[#3d4f5f] group-hover:text-[#00D4FF] transition-colors ml-auto shrink-0" />
                </div>

                {/* ── Player Stats Row ── */}
                <div className="border-t border-[#2a3a4a] pt-2.5">
                    {isPitcher ? (
                        <div className="flex gap-1.5 flex-wrap">
                            {stats.era  != null && <StatPill label="ERA"   value={fmtStat(stats.era, 2)} color="#00D4FF" />}
                            {stats.whip != null && <StatPill label="WHIP"  value={fmtStat(stats.whip, 2)} color="#e2e8f0" />}
                            {stats.fip  != null && <StatPill label="FIP"   value={fmtStat(stats.fip, 2)} color="#8a9ba8" />}
                            {stats.siera!= null && <StatPill label="SIERA" value={fmtStat(stats.siera, 2)} color="#8a9ba8" />}
                            {stats.so   != null && <StatPill label="SO"    value={String(Math.round(stats.so))} color="#22C55E" />}
                            {stats.w != null && stats.l != null && <StatPill label="W-L" value={`${Math.round(stats.w)}-${Math.round(stats.l)}`} color="#e2e8f0" />}
                            {stats.era == null && stats.fip == null && stats.whip == null && (
                                <span className="text-[10px] font-black text-[#3d4f5f] tracking-widest uppercase self-center">STATS PENDING</span>
                            )}
                        </div>
                    ) : (
                        <div className="flex gap-1.5 flex-wrap">
                            {stats.avg     != null && <StatPill label="AVG"  value={fmtAvg(stats.avg)} color="#00D4FF" />}
                            {stats.hr      != null && <StatPill label="HR"   value={String(Math.round(stats.hr))} color="#FFD700" />}
                            {stats.rbi     != null && <StatPill label="RBI"  value={String(Math.round(stats.rbi))} color="#22C55E" />}
                            {stats.obp     != null && <StatPill label="OBP"  value={fmtAvg(stats.obp)} color="#8a9ba8" />}
                            {stats.slg     != null && <StatPill label="SLG"  value={fmtAvg(stats.slg)} color="#8a9ba8" />}
                            {stats.wrc_plus!= null && <StatPill label="wRC+" value={String(Math.round(stats.wrc_plus))} color="#e2e8f0" />}
                            {stats.woba    != null && <StatPill label="wOBA" value={fmtAvg(stats.woba)} color="#8a9ba8" />}
                            {stats.avg == null && stats.hr == null && stats.rbi == null && stats.wrc_plus == null && stats.woba == null && (
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
const PAGE_SIZE = 60;

export default function PropsPage() {
    const router = useRouter();
    const [filter, setFilter] = useState('ALL');
    const [minScore, setMinScore] = useState(0);
    const [todayStr, setTodayStr] = useState<string>('');
    const [selected, setSelected] = useState<any | null>(null);
    const [visible, setVisible] = useState(PAGE_SIZE);

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
    const slateStats = data?.stats || { total: 0, elite: 0, strong: 0, topScore: 0 };
    const isStale = !!(data?.official_date && todayStr && data.official_date < todayStr);

    const activeFilter = useMemo(() => FILTERS.find(f => f.label === filter) || FILTERS[0], [filter]);

    const filtered = useMemo(() => props.filter((p: any) => {
        if (!activeFilter.match((p.prop_type || p.prop || '').toLowerCase())) return false;
        if (minScore > 0 && (p.bet_score == null || p.bet_score < minScore)) return false;
        return true;
    }), [props, activeFilter, minScore]);

    // Reset pagination when the filter/threshold changes.
    useEffect(() => { setVisible(PAGE_SIZE); }, [filter, minScore]);

    const openModal = useCallback((p: any) => setSelected(p), []);
    const closeModal = useCallback(() => setSelected(null), []);

    const shown = filtered.slice(0, visible);

    return (
        <div
            className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] w-full max-w-[100vw] overflow-x-hidden box-border"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
        >
            <SEOHead
                title="MLB Player Props Today — AI Prediction Model & Edge Picks | Smarter.Poker"
                description="Daily MLB player prop predictions powered by AI models. Strikeouts, hits, home runs, total bases, RBIs, and more — with win probability, market edge percentage, and ELITE/STRONG tier ratings."
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
                            Ranked By Bet Score • {data?.official_date || todayStr || '...'}
                        </p>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-col gap-1.5 items-end flex-shrink-0 mt-1">
                        <div className="flex items-center gap-2 bg-[#0a0a15] border border-[#3d4f5f] px-3 py-1.5 rounded-sm">
                            <span className="text-[11px] font-black text-[#5a6a7a] tracking-widest uppercase">TOTAL</span>
                            <span className="text-[20px] font-black text-white leading-none" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                                {isLoading && !data ? '—' : slateStats.total}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 bg-[#001a2a] border border-[#00D4FF]/50 px-3 py-1.5 rounded-sm" style={{ boxShadow: '0 0 8px rgba(0,212,255,0.15)' }}>
                            <TrendingUp size={13} className="text-[#00D4FF]" />
                            <span className="text-[11px] font-black text-[#00D4FF] tracking-widest uppercase">ELITE</span>
                            <span className="text-[20px] font-black text-[#00D4FF] leading-none" style={{ fontFamily: "'Rajdhani', sans-serif", textShadow: '0 0 6px rgba(0,212,255,0.5)' }}>
                                {isLoading && !data ? '—' : slateStats.elite}
                            </span>
                        </div>
                        {slateStats.topScore > 0 && (
                            <div className="flex items-center gap-2 bg-[#1a1000] border border-[#FFD700]/50 px-3 py-1.5 rounded-sm" style={{ boxShadow: '0 0 8px rgba(255,215,0,0.15)' }}>
                                <span className="text-[11px] font-black text-[#FFD700] tracking-widest uppercase">TOP</span>
                                <span className="text-[20px] font-black text-[#FFD700] leading-none" style={{ fontFamily: "'Rajdhani', sans-serif", textShadow: '0 0 6px rgba(255,215,0,0.5)' }}>
                                    {slateStats.topScore}
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
                            key={f.label}
                            onClick={() => setFilter(f.label)}
                            className={`px-3 py-1.5 border-2 text-[11px] font-black tracking-widest whitespace-nowrap cursor-pointer transition-all uppercase rounded-sm ${
                                filter === f.label
                                    ? 'bg-[#001a2a] text-[#00D4FF] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.25)]'
                                    : 'bg-[#0d1117] text-[#5a6a7a] border-[#2a3a4a] hover:border-[#3d4f5f] hover:text-slate-300'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5 ml-auto bg-[#0d1117] border-2 border-[#2a3a4a] rounded-sm px-2.5 py-1.5 hover:border-[#3d4f5f] transition-colors flex-shrink-0">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#5a6a7a]">MIN GRADE:</span>
                    <select
                        value={minScore}
                        onChange={(e) => setMinScore(parseInt(e.target.value, 10))}
                        className="bg-transparent border-none text-[13px] font-black text-[#00D4FF] outline-none cursor-pointer uppercase tracking-wider"
                    >
                        <option value="0" className="bg-[#0d1117]">ANY</option>
                        <option value="52" className="bg-[#0d1117]">LEAN+</option>
                        <option value="68" className="bg-[#0d1117]">STRONG+</option>
                        <option value="82" className="bg-[#0d1117]">ELITE</option>
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
                            <p className="text-[10px] text-amber-600/70 font-bold uppercase tracking-wider m-0 mt-0.5">Props from {data?.official_date || 'a previous date'}. Today's lines not yet posted.</p>
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
                        <span className="text-[#5a6a7a] font-black tracking-widest text-[12px] uppercase">
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
                        {filter === 'ALL' && minScore === 0
                            ? <CalendarX size={40} className="text-[#3d4f5f] mb-4" />
                            : <SearchX size={40} className="text-[#3d4f5f] mb-4" />
                        }
                        <p className="text-[15px] font-black tracking-widest uppercase text-[#5a6a7a] text-center">
                            {filter === 'ALL' && minScore === 0 ? 'No Props Available — Awaiting Model Output' : 'No Props Match This Filter'}
                        </p>
                        <p className="text-[11px] text-[#3d4f5f] font-bold tracking-widest uppercase text-center mt-1.5">
                            {filter === 'ALL' && minScore === 0 ? 'Props release 3–4 hours before first pitch' : 'Try a broader grade or market'}
                        </p>
                    </div>
                )}

                {/* Props list */}
                {!isLoading && shown.length > 0 && (
                    <div className="flex flex-col gap-3">
                        {shown.map((prop: any, idx: number) => (
                            <PropCard key={`prop-${prop.player_id}-${prop.prop}-${prop.line}-${idx}`} prop={prop} idx={idx} onOpen={openModal} />
                        ))}
                    </div>
                )}

                {/* Load more */}
                {!isLoading && filtered.length > visible && (
                    <div className="mt-4 flex justify-center">
                        <button
                            onClick={() => setVisible(v => v + PAGE_SIZE)}
                            className="px-5 py-2.5 bg-[#0d1117] border-2 border-[#2a3a4a] text-[11px] font-black text-[#5a6a7a] tracking-widest uppercase hover:text-[#00D4FF] hover:border-[#00D4FF] transition-all rounded-sm"
                        >
                            Load More ({filtered.length - visible} remaining)
                        </button>
                    </div>
                )}

                {/* Result count */}
                {!isLoading && filtered.length > 0 && (
                    <div className="mt-5 text-center">
                        <span className="text-[11px] font-black text-[#3d4f5f] tracking-widest uppercase">
                            SHOWING {shown.length} OF {filtered.length} PROPS · RANKED BY BET SCORE
                        </span>
                    </div>
                )}

                {/* Footer */}
                <div className="mt-6 px-4 py-3 bg-[#0d1117] border border-[#2a3a4a] rounded-sm text-[11px] font-black tracking-wide text-[#4a5a6a] text-center leading-relaxed">
                    <span className="text-[#00D4FF]">ANALYSIS ONLY</span> — NOT BETTING ADVICE.{' '}
                    BET SCORE (0–100) RANKS VALUE = EV + CONFIDENCE.
                </div>
            </main>

            <BottomNavBar />

            {selected && <PropDetailModal prop={selected} onClose={closeModal} />}
        </div>
    );
}
