import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import useSWR from 'swr';
import {
    ChevronUp, ChevronDown, ChevronsUpDown, Search, X,
    Zap, TrendingUp, Clock, Activity, AlertTriangle
} from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';

interface HRPlayer {
    player_id: number;
    full_name: string;
    team_id: number;
    team_name: string;
    hr: number;
    games_played: number;
    games_per_hr: number;
    last_hr_date: string | null;
    days_since_hr: number | null;
    games_since_hr: number | null;
    due_score: number;
    status: 'OVERDUE' | 'DUE' | 'RECENT' | 'NO_HR';
    opp_pitcher_id?: number | null;
    opp_pitcher_name?: string | null;
    opp_pitcher_hr9?: number | null;
    park_factor?: number | null;
    matchup_due_score?: number | null;
}

const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
};

type SortKey = 'due_score' | 'matchup_due_score' | 'hr' | 'games_since_hr' | 'games_per_hr' | 'full_name';
type SortDir = 'asc' | 'desc';

const STATUS_CONFIG = {
    OVERDUE: {
        label: 'OVERDUE',
        color: 'text-[#FF4444]',
        bg: 'bg-[#FF4444]/10',
        border: 'border-[#FF4444]/60',
        glow: 'shadow-[0_0_12px_rgba(255,68,68,0.4)]',
        dot: 'bg-[#FF4444]',
        icon: '🔴',
    },
    DUE: {
        label: 'DUE',
        color: 'text-[#FFB800]',
        bg: 'bg-[#FFB800]/10',
        border: 'border-[#FFB800]/60',
        glow: 'shadow-[0_0_12px_rgba(255,184,0,0.3)]',
        dot: 'bg-[#FFB800]',
        icon: '⚡',
    },
    RECENT: {
        label: 'RECENT',
        color: 'text-[#00D4FF]',
        bg: 'bg-[#00D4FF]/10',
        border: 'border-[#00D4FF]/40',
        glow: '',
        dot: 'bg-[#00D4FF]',
        icon: '✅',
    },
    NO_HR: {
        label: 'NO HR',
        color: 'text-slate-500',
        bg: 'bg-slate-800/30',
        border: 'border-slate-700',
        glow: '',
        dot: 'bg-slate-600',
        icon: '—',
    },
};

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function DueGauge({ score }: { score: number }) {
    const pct = Math.min(score / 2, 1); // cap at 200% for display
    const color = score >= 1.25 ? '#FF4444' : score >= 0.75 ? '#FFB800' : '#00D4FF';
    return (
        <div className="w-full h-1.5 bg-[#1a2332] rounded-full overflow-hidden">
            <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.round(pct * 100)}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
            />
        </div>
    );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
    if (sortKey !== col) return <ChevronsUpDown size={12} className="text-slate-600 ml-1 shrink-0" />;
    return sortDir === 'desc'
        ? <ChevronDown size={12} className="text-[#00D4FF] ml-1 shrink-0" />
        : <ChevronUp size={12} className="text-[#00D4FF] ml-1 shrink-0" />;
}

export default function HRTrackerPage() {
    const router = useRouter();
    const [sortKey, setSortKey] = useState<SortKey>('due_score');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    const { data, error, isLoading, mutate } = useSWR('/api/mlb/hr-tracker', fetcher, {
        refreshInterval: 1000 * 60 * 60, // refresh every hour
        revalidateOnFocus: false,
    });

    const players: HRPlayer[] = data?.players || [];
    const updatedAt: string = data?.updatedAt || '';

    const handleSort = useCallback((col: SortKey) => {
        if (sortKey === col) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        } else {
            setSortKey(col);
            setSortDir('desc');
        }
    }, [sortKey]);

    const filtered = useMemo(() => {
        let list = [...players];

        if (statusFilter !== 'ALL') {
            list = list.filter(p => p.status === statusFilter);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(p => p.full_name.toLowerCase().includes(q) || p.team_name.toLowerCase().includes(q));
        }

        list.sort((a, b) => {
            let va: number | string = 0;
            let vb: number | string = 0;
            switch (sortKey) {
                case 'due_score':    va = a.due_score; vb = b.due_score; break;
                case 'matchup_due_score': va = a.matchup_due_score ?? a.due_score; vb = b.matchup_due_score ?? b.due_score; break;
                case 'hr':          va = a.hr; vb = b.hr; break;
                case 'games_since_hr': va = a.games_since_hr ?? -1; vb = b.games_since_hr ?? -1; break;
                case 'games_per_hr': va = a.games_per_hr; vb = b.games_per_hr; break;
                case 'full_name':   va = a.full_name; vb = b.full_name; break;
            }
            if (typeof va === 'string') {
                return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
            }
            return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
        });

        return list;
    }, [players, statusFilter, searchQuery, sortKey, sortDir]);

    // Top 5 most overdue for the spotlight section
    const spotlight = useMemo(() =>
        [...players]
            .filter(p => p.hr >= 3 && p.due_score > 0)
            .sort((a, b) => b.due_score - a.due_score)
            .slice(0, 5),
        [players]
    );

    const statusCounts = useMemo(() => ({
        ALL: players.length,
        OVERDUE: players.filter(p => p.status === 'OVERDUE').length,
        DUE: players.filter(p => p.status === 'DUE').length,
        RECENT: players.filter(p => p.status === 'RECENT').length,
    }), [players]);

    const colHeader = (col: SortKey, label: string, align: string = 'text-left') => (
        <th
            className={`${align} py-3 px-3 text-[10px] font-extrabold tracking-widest uppercase text-slate-400 cursor-pointer hover:text-[#00D4FF] transition-colors select-none whitespace-nowrap`}
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
            onClick={() => handleSort(col)}
        >
            <span className="inline-flex items-center">
                {label}
                <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
            </span>
        </th>
    );

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
            <SEOHead
                title="HR Tracker | MLB Analytics"
                description="Track which MLB hitters are due for a home run. Daily-updated due scores, last HR dates, and sortable betting data."
                noIndex={true}
            />

            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />

            <div className="p-4 w-full max-w-5xl mx-auto box-border relative">

                {/* Background Glows */}
                <div className="absolute top-10 right-0 w-[500px] h-[500px] bg-[#FF4444] rounded-full mix-blend-screen filter blur-[160px] opacity-[0.025] pointer-events-none" />
                <div className="absolute top-40 left-0 w-[300px] h-[300px] bg-[#FFB800] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.02] pointer-events-none" />

                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-[#FF4444]/20 to-[#0d1117] border-[2px] border-[#FF4444]/60 flex items-center justify-center shadow-[0_0_15px_rgba(255,68,68,0.3)]">
                            <Zap size={20} className="text-[#FF4444]" style={{ filter: 'drop-shadow(0 0 4px rgba(255,68,68,0.8))' }} />
                        </div>
                        <div>
                            <h1 className="m-0 text-2xl md:text-3xl font-extrabold text-white tracking-widest uppercase"
                                style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(255,68,68,0.2)' }}>
                                HR Tracker
                            </h1>
                            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">
                                {updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : 'Loading...'}
                            </p>
                        </div>
                        <button
                            onClick={() => mutate()}
                            className="ml-auto text-[10px] font-extrabold text-slate-500 border border-[#3d4f5f] px-3 py-1.5 rounded-md tracking-widest uppercase hover:text-[#00D4FF] hover:border-[#00D4FF] transition-colors"
                            style={{ fontFamily: '"Rajdhani", sans-serif' }}
                        >
                            Refresh
                        </button>
                    </div>
                    <p className="text-sm text-slate-400 font-bold tracking-wide">
                        Track which hitters are statistically overdue for a home run. Due Score = Games Since Last HR ÷ Career HR Rate.
                    </p>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="space-y-4">
                        {/* Spotlight skeleton */}
                        <div className="animate-pulse bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-5 mb-6">
                            <div className="w-40 h-4 bg-[#3d4f5f] rounded mb-4" />
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                {[1,2,3,4,5].map(i => (
                                    <div key={i} className="bg-[#1a2332] rounded-xl p-4 h-28" />
                                ))}
                            </div>
                        </div>
                        {/* Table skeleton */}
                        <div className="space-y-2">
                            {[1,2,3,4,5,6,7,8].map(i => (
                                <div key={i} className="animate-pulse bg-[#0d1117] border border-[#3d4f5f] rounded-xl h-14 flex items-center px-4 gap-4">
                                    <div className="w-10 h-10 rounded-full bg-[#3d4f5f]" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-36 bg-[#3d4f5f] rounded" />
                                        <div className="h-2 w-24 bg-[#3d4f5f] rounded" />
                                    </div>
                                    <div className="w-16 h-4 bg-[#3d4f5f] rounded" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Error State */}
                {!isLoading && error && (
                    <div className="bg-gradient-to-b from-[#00D4FF]/10 to-[#0d1117] border-[2px] border-[#00D4FF]/50 rounded-xl p-6 flex items-center gap-4">
                        <AlertTriangle className="text-[#00D4FF] w-8 h-8 shrink-0" />
                        <div>
                            <div className="text-[#00D4FF] font-extrabold uppercase tracking-widest text-sm" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Failed To Load HR Data</div>
                            <div className="text-[#00D4FF]/70 text-xs font-bold mt-1">MLB Stats API may be unavailable. Try refreshing.</div>
                        </div>
                    </div>
                )}

                {!isLoading && !error && players.length > 0 && (
                    <>
                        {/* ── Spotlight: Most Due ─────────────────────────────── */}
                        <div className="mb-8">
                            <h2 className="text-sm font-extrabold text-white mb-4 uppercase tracking-widest pl-2 border-l-[3px] border-[#FF4444]"
                                style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                Most Due for a Home Run
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                {spotlight.map((p, idx) => {
                                    const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.RECENT;
                                    return (
                                        <Link
                                            key={p.player_id}
                                            href={`/hub/MLB-ANALYTICS/players/${p.player_id}`}
                                            className={`block bg-[#0d1117] border-[2px] ${cfg.border} rounded-xl p-4 ${cfg.glow} hover:scale-[1.02] transition-all relative overflow-hidden group`}
                                            style={{ textDecoration: 'none' }}
                                        >
                                            {idx === 0 && (
                                                <div className="absolute top-2 right-2 text-[9px] font-extrabold text-[#FF4444] tracking-widest uppercase bg-[#FF4444]/10 px-1.5 py-0.5 rounded border border-[#FF4444]/30"
                                                    style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                    #1 DUE
                                                </div>
                                            )}
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.player_id}/headshot/67/current`}
                                                alt={p.full_name}
                                                loading="lazy"
                                                className="w-14 h-14 rounded-full object-cover border-[2px] border-[#3d4f5f] group-hover:border-current mb-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
                                                onError={(e) => { (e.target as HTMLImageElement).src = '/default-avatar.png'; }}
                                            />
                                            <div className={`text-[10px] font-extrabold tracking-widest uppercase ${cfg.color} mb-1`}
                                                style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                {cfg.icon} {cfg.label}
                                            </div>
                                            <div className="text-white font-extrabold text-sm uppercase tracking-wide leading-tight truncate"
                                                style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                {p.full_name}
                                            </div>
                                            <div className="mt-2 space-y-1">
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-slate-500 font-bold uppercase">Due Score</span>
                                                    <span className={`font-extrabold ${cfg.color}`}>{p.due_score.toFixed(2)}x</span>
                                                </div>
                                                <DueGauge score={p.due_score} />
                                                <div className="flex justify-between text-[10px] mt-1">
                                                    <span className="text-slate-500 font-bold uppercase">Last HR</span>
                                                    <span className="text-slate-300 font-bold">{formatDate(p.last_hr_date)}</span>
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── Filters ──────────────────────────────────────────── */}
                        <div className="flex flex-col md:flex-row gap-3 mb-5">
                            {/* Search */}
                            <div className="relative flex-1">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00D4FF] pointer-events-none">
                                    <Search size={16} style={{ filter: 'drop-shadow(0 0 2px rgba(0,212,255,0.5))' }} />
                                </div>
                                <input
                                    type="text"
                                    placeholder="SEARCH PLAYER OR TEAM..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-2.5 pl-10 pr-10 text-white font-extrabold text-sm tracking-widest uppercase focus:outline-none focus:border-[#00D4FF] focus:shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all placeholder:text-slate-600"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Status filter pills */}
                            <div className="flex gap-2 flex-wrap">
                                {(['ALL', 'OVERDUE', 'DUE', 'RECENT'] as const).map(s => {
                                    const cfg = s === 'ALL' ? null : STATUS_CONFIG[s];
                                    const count = statusCounts[s as keyof typeof statusCounts];
                                    return (
                                        <button
                                            key={s}
                                            onClick={() => setStatusFilter(s)}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-extrabold text-[11px] tracking-widest uppercase transition-all border-[2px] whitespace-nowrap ${
                                                statusFilter === s
                                                    ? cfg
                                                        ? `${cfg.bg} ${cfg.border} ${cfg.color} ${cfg.glow}`
                                                        : 'bg-[#00D4FF]/10 border-[#00D4FF] text-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                                                    : 'bg-[#0d1117] border-[#3d4f5f] text-slate-500 hover:border-[#4b637a]'
                                            }`}
                                            style={{ fontFamily: '"Rajdhani", sans-serif' }}
                                        >
                                            {cfg && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
                                            {s} <span className="opacity-60">({count})</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── Results count ────────────────────────────────────── */}
                        <div className="text-[10px] text-slate-600 font-extrabold tracking-widest uppercase mb-3"
                            style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                            {filtered.length} Players · Sorted By {sortKey.replace(/_/g, ' ')} {sortDir === 'desc' ? '↓' : '↑'}
                        </div>

                        {/* ── Table ────────────────────────────────────────────── */}
                        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                            {/* Table header — scrollable on mobile */}
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[700px]">
                                    <thead className="bg-[#1a2332] border-b border-[#3d4f5f]">
                                        <tr>
                                            {colHeader('full_name', 'Player')}
                                            <th className="text-center py-3 px-3 text-[10px] font-extrabold tracking-widest uppercase text-slate-400"
                                                style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                Status
                                            </th>
                                            {colHeader('hr', 'HR', 'text-right')}
                                            {colHeader('games_per_hr', 'Games/HR', 'text-right')}
                                            {colHeader('games_since_hr', 'Since HR', 'text-right')}
                                            <th className="text-right py-3 px-3 text-[10px] font-extrabold tracking-widest uppercase text-slate-400"
                                                style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                Matchup
                                            </th>
                                            {colHeader('matchup_due_score', 'Matchup Due', 'text-right')}
                                            {colHeader('due_score', 'Raw Due', 'text-right')}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#3d4f5f]/50">
                                        {filtered.map((p) => {
                                            const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.RECENT;
                                            return (
                                                <tr
                                                    key={p.player_id}
                                                    className="hover:bg-[#1a2332]/60 transition-colors cursor-pointer group"
                                                    onClick={() => router.push(`/hub/MLB-ANALYTICS/players/${p.player_id}`)}
                                                >
                                                    {/* Player */}
                                                    <td className="py-3 px-3">
                                                        <div className="flex items-center gap-3">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <div className="relative shrink-0">
                                                                <img
                                                                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.player_id}/headshot/67/current`}
                                                                    alt={p.full_name}
                                                                    loading="lazy"
                                                                    className="w-9 h-9 rounded-full object-cover border border-[#3d4f5f] group-hover:border-[#00D4FF] transition-all"
                                                                    onError={(e) => { (e.target as HTMLImageElement).src = '/default-avatar.png'; }}
                                                                />
                                                                {p.team_id ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img
                                                                        src={`https://www.mlbstatic.com/team-logos/${p.team_id}.svg`}
                                                                        alt=""
                                                                        className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#0d1117] rounded-full p-0.5"
                                                                    />
                                                                ) : null}
                                                            </div>
                                                            <div>
                                                                <div className="text-white font-extrabold text-sm tracking-wider uppercase group-hover:text-[#00D4FF] transition-colors"
                                                                    style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                                    {p.full_name}
                                                                </div>
                                                                <div className="text-slate-500 text-[10px] font-bold">{p.team_name}</div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Status Badge */}
                                                    <td className="py-3 px-3 text-center">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-widest uppercase ${cfg.bg} ${cfg.color} border ${cfg.border}`}
                                                            style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
                                                            {cfg.label}
                                                        </span>
                                                    </td>

                                                    {/* HR Count */}
                                                    <td className="py-3 px-3 text-right">
                                                        <span className="text-white font-extrabold text-base" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                            {p.hr}
                                                        </span>
                                                    </td>

                                                    {/* Games Per HR Rate */}
                                                    <td className="py-3 px-3 text-right">
                                                        <span className="text-[#00D4FF] font-extrabold text-sm" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                            {p.games_per_hr > 0 && p.games_per_hr < 999 ? `1 per ${p.games_per_hr}g` : '—'}
                                                        </span>
                                                    </td>

                                                    {/* Games Since HR */}
                                                    <td className="py-3 px-3 text-right">
                                                        <span className={`font-extrabold text-sm ${p.games_since_hr != null ? (p.games_since_hr > (p.games_per_hr * 1.25) ? 'text-[#FF4444]' : p.games_since_hr > p.games_per_hr * 0.75 ? 'text-[#FFB800]' : 'text-slate-400') : 'text-slate-600'}`}
                                                            style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                            {p.games_since_hr != null ? `~${p.games_since_hr}g` : '—'}
                                                        </span>
                                                    </td>

                                                    {/* Matchup */}
                                                    <td className="py-3 px-3 text-right">
                                                        {p.opp_pitcher_name ? (
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-white font-bold text-sm truncate max-w-[120px]">
                                                                    vs {p.opp_pitcher_name.split(' ').pop()}
                                                                </span>
                                                                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mt-0.5">
                                                                    {(p.opp_pitcher_hr9 ?? 1.15).toFixed(2)} HR/9
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-600 text-sm">—</span>
                                                        )}
                                                    </td>

                                                    {/* Matchup Due Score */}
                                                    <td className="py-3 px-3 text-right">
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className={`font-extrabold text-base ${(p.matchup_due_score ?? p.due_score) > p.due_score ? 'text-[#FF4444]' : (p.matchup_due_score ?? p.due_score) < p.due_score ? 'text-[#00D4FF]' : cfg.color}`}
                                                                style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: ((p.matchup_due_score ?? p.due_score) >= 1.25) ? '0 0 8px rgba(255,68,68,0.5)' : '' }}>
                                                                {(p.matchup_due_score ?? p.due_score) > 0 ? `${(p.matchup_due_score ?? p.due_score).toFixed(2)}x` : '—'}
                                                            </span>
                                                            {(p.matchup_due_score ?? p.due_score) > 0 && (
                                                                <div className="w-16">
                                                                    <DueGauge score={p.matchup_due_score ?? p.due_score} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Raw Due Score */}
                                                    <td className="py-3 px-3 text-right">
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className={`font-extrabold text-sm text-slate-400`}
                                                                style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                                {p.due_score > 0 ? `${p.due_score.toFixed(2)}x` : '—'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {filtered.length === 0 && (
                                <div className="py-16 text-center">
                                    <Search size={32} className="text-[#3d4f5f] mx-auto mb-3" />
                                    <div className="text-slate-500 font-extrabold uppercase tracking-widest text-sm"
                                        style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                        No Players Found
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Legend ───────────────────────────────────────────── */}
                        <div className="mt-6 bg-[#0d1117] border border-[#3d4f5f] rounded-xl p-4 flex flex-wrap gap-6">
                            <div>
                                <div className="text-[10px] text-slate-500 font-extrabold tracking-widest uppercase mb-2"
                                    style={{ fontFamily: '"Rajdhani", sans-serif' }}>How To Read This</div>
                                <div className="space-y-1.5 text-[11px] text-slate-400 font-bold">
                                    <div><span className="text-[#FF4444] font-extrabold">OVERDUE</span> — Due Score &gt; 1.25x their average rate</div>
                                    <div><span className="text-[#FFB800] font-extrabold">DUE</span> — Due Score between 0.75x – 1.25x</div>
                                    <div><span className="text-[#00D4FF] font-extrabold">RECENT</span> — Hit a HR recently, below their average rate</div>
                                    <div><span className="text-slate-300 font-extrabold">Due Score</span> = Games Since Last HR ÷ (Games Played ÷ Total HR)</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-500 font-extrabold tracking-widest uppercase mb-2"
                                    style={{ fontFamily: '"Rajdhani", sans-serif' }}>Data Source</div>
                                <div className="text-[11px] text-slate-400 font-bold">
                                    MLB Stats API — Live 2025 season stats.<br />
                                    Game log scanned for last HR date. <br />
                                    Refreshes automatically every hour.
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <BottomNavBar />
        </div>
    );
}
