import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import { TeamGradeBadge } from '../../../src/components/mlb/TeamGradeBadge';
import { TIER_STYLE, Tier } from '../../../src/lib/betScore';
import { logError } from '@/utils/logger';

interface TeamStanding {
    team_id: number;
    name: string;
    abbr: string;
    league: string;
    division: string;
    w: number;
    l: number;
    pct: number;
    gb: number;
    rs: number;
    ra: number;
    run_diff: number;
    home_w: number;
    home_l: number;
    away_w: number;
    away_l: number;
    l10_w: number;
    l10_l: number;
    streak: string | null;
    power_score: number;
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

const LEAGUE_DIVISIONS: Record<string, string[]> = {
    AL: ['AL East', 'AL Central', 'AL West'],
    NL: ['NL East', 'NL Central', 'NL West'],
};
const TIER_FLOORS: Tier[] = ['ELITE', 'STRONG', 'LEAN', 'THIN', 'PASS'];

function fmtPct(p: number | null | undefined): string {
    if (p == null || Number.isNaN(Number(p))) return '.000';
    const s = Number(p).toFixed(3);
    return s.charAt(0) === '0' ? s.slice(1) : s; // .605 / 1.000
}

function TeamLogo({ teamId, abbr }: { teamId: number; abbr: string }) {
    const [imgError, setImgError] = useState(false);
    if (imgError || !teamId) {
        return (
            <div className="w-7 h-7 rounded-full bg-[#1a2332] border border-[#3d4f5f] flex items-center justify-center text-[10px] font-black text-[#00D4FF] shrink-0">
                {(abbr || '?').slice(0, 3)}
            </div>
        );
    }
    return (
        <div className="relative w-7 h-7 rounded-full bg-[#0d1117] border border-[#3d4f5f] flex items-center justify-center overflow-hidden shrink-0">
            <Image
                unoptimized
                width={20}
                height={20}
                src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`}
                alt={abbr}
                style={{ objectFit: 'contain' }}
                onError={() => setImgError(true)}
            />
        </div>
    );
}

function StreakCell({ streak }: { streak: string | null }) {
    if (!streak) return <span className="text-slate-600">-</span>;
    const win = streak.charAt(0) === 'W';
    return <span className={win ? 'text-emerald-400' : 'text-red-400'}>{streak}</span>;
}

function DiffCell({ diff }: { diff: number }) {
    const color = diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-400';
    return <span className={color}>{diff > 0 ? `+${diff}` : diff}</span>;
}

function HeaderRow({ showDivision }: { showDivision?: boolean }) {
    return (
        <thead>
            <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800/60">
                <th className="py-2 pl-3 pr-1 text-left w-8">#</th>
                <th className="py-2 px-2 text-left">Team</th>
                {showDivision && <th className="py-2 px-2 text-left hidden sm:table-cell">Div</th>}
                <th className="py-2 px-2 text-center w-9">W</th>
                <th className="py-2 px-2 text-center w-9">L</th>
                <th className="py-2 px-2 text-center w-12">PCT</th>
                <th className="py-2 px-2 text-center w-12">GB</th>
                <th className="py-2 px-2 text-center w-14 hidden sm:table-cell">L10</th>
                <th className="py-2 px-2 text-center w-12 hidden sm:table-cell">STRK</th>
                <th className="py-2 px-2 text-center w-14 hidden md:table-cell">DIFF</th>
                <th className="py-2 px-2 text-center w-16 hidden lg:table-cell">HOME</th>
                <th className="py-2 px-2 text-center w-16 hidden lg:table-cell">AWAY</th>
                <th className="py-2 px-2 pr-3 text-right">Grade</th>
            </tr>
        </thead>
    );
}

function TeamRow({ team, rank, leader, showDivision }: { team: TeamStanding; rank: number; leader?: boolean; showDivision?: boolean }) {
    return (
        <tr className={`text-sm hover:bg-slate-800/20 transition-colors ${leader ? 'bg-[#00D4FF]/[0.04]' : ''}`}>
            <td className={`py-2.5 pl-3 pr-1 text-left w-8 font-bold ${leader ? 'text-[#00D4FF]' : 'text-slate-500'}`}>{rank}</td>
            <td className="py-2.5 px-2">
                <div className="flex items-center gap-2 min-w-0">
                    <TeamLogo teamId={team.team_id} abbr={team.abbr} />
                    <span className="font-black text-slate-200">{team.abbr}</span>
                    <span className="font-medium text-slate-400 truncate hidden sm:inline">{team.name}</span>
                </div>
            </td>
            {showDivision && <td className="py-2.5 px-2 text-left text-[11px] text-slate-500 hidden sm:table-cell">{team.division}</td>}
            <td className="py-2.5 px-2 text-center font-bold text-[#00D4FF]">{team.w}</td>
            <td className="py-2.5 px-2 text-center text-slate-300">{team.l}</td>
            <td className="py-2.5 px-2 text-center text-slate-200 tabular-nums">{fmtPct(team.pct)}</td>
            <td className="py-2.5 px-2 text-center text-slate-400 tabular-nums">{Number(team.gb) === 0 ? '-' : Number(team.gb).toFixed(1)}</td>
            <td className="py-2.5 px-2 text-center text-slate-400 tabular-nums hidden sm:table-cell">{team.l10_w}-{team.l10_l}</td>
            <td className="py-2.5 px-2 text-center hidden sm:table-cell"><StreakCell streak={team.streak} /></td>
            <td className="py-2.5 px-2 text-center tabular-nums hidden md:table-cell"><DiffCell diff={team.run_diff} /></td>
            <td className="py-2.5 px-2 text-center text-slate-400 tabular-nums hidden lg:table-cell">{team.home_w}-{team.home_l}</td>
            <td className="py-2.5 px-2 text-center text-slate-400 tabular-nums hidden lg:table-cell">{team.away_w}-{team.away_l}</td>
            <td className="py-2.5 px-2 pr-3 text-right whitespace-nowrap"><TeamGradeBadge score={team.power_score} compact /></td>
        </tr>
    );
}

function DivisionCard({ division, teams }: { division: string; teams: TeamStanding[] }) {
    return (
        <div className="bg-[#0d1117] rounded-xl border border-slate-800/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/40 flex items-center gap-2">
                <span className="text-[#00D4FF] font-bold">|</span>
                <h3 className="text-sm font-black text-white uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{division}</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <HeaderRow />
                    <tbody className="divide-y divide-slate-800/40">
                        {teams.map((team, i) => (
                            <TeamRow key={team.team_id} team={team} rank={i + 1} leader={i === 0} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function GradeLegend() {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] font-bold uppercase tracking-wider">
            <span className="text-slate-500">Grade = league-relative power rating:</span>
            {TIER_FLOORS.map((t) => (
                <span key={t} className={`inline-flex items-center gap-1 ${TIER_STYLE[t].text}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />{t}
                </span>
            ))}
        </div>
    );
}

export default function StandingsPage() {
    const router = useRouter();
    const { data, error, isLoading } = useSWR('/api/mlb/standings', fetcher, { refreshInterval: 60000 });
    const [view, setView] = useState<'division' | 'power'>('division');

    const teams: TeamStanding[] = data?.teams || [];
    const loading = isLoading && !data;
    const season: number | null = data?.season ?? null;

    const byDivision = useMemo(() => {
        const map = new Map<string, TeamStanding[]>();
        for (const t of teams) {
            if (!t.division) continue;
            if (!map.has(t.division)) map.set(t.division, []);
            map.get(t.division)!.push(t);
        }
        for (const arr of map.values()) {
            arr.sort((a, b) => (b.pct - a.pct) || (b.w - a.w) || (b.run_diff - a.run_diff));
        }
        return map;
    }, [teams]);

    const powerRanked = useMemo(
        () => [...teams].sort((a, b) => (b.power_score - a.power_score) || (b.pct - a.pct)),
        [teams]
    );

    return (
        <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
            <SEOHead
                title="MLB Standings 2025 — Division Races & Power Rankings | Smarter.Poker"
                description="Live 2025 MLB standings with divisional breakdowns, run differential, win streaks, power rankings, and AI-graded team ratings on the ELITE/STRONG/LEAN/THIN/PASS scale."
            />
            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />

            <main className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-wider flex items-center gap-3" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                            <span className="text-[#00D4FF] font-bold">|</span> LEAGUE STANDINGS
                        </h1>
                        <p className="text-slate-400 mt-2 tracking-wide text-xs uppercase">
                            {season ? `${season} SEASON · ` : ''}LIVE W/L, RUN DIFFERENTIAL, AND POWER RANKINGS
                        </p>
                    </div>

                    {/* View toggle */}
                    <div className="inline-flex rounded-lg border border-slate-700/70 bg-[#0d1117] p-1 self-start">
                        {([['division', 'By Division'], ['power', 'Power Rankings']] as const).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setView(key)}
                                className={`px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider rounded-md transition-all ${
                                    view === key ? 'bg-[#00D4FF] text-black shadow-[0_0_12px_rgba(0,212,255,0.4)]' : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mb-6"><GradeLegend /></div>

                {loading ? (
                    <div className="bg-[#0d1117] rounded-xl border border-slate-800/60 p-12 text-center text-slate-500 text-xs uppercase tracking-widest animate-pulse">
                        Initiating standings sync...
                    </div>
                ) : error ? (
                    <div className="bg-[#0d1117] rounded-xl border border-red-900/40 p-12 text-center text-red-400 text-xs uppercase tracking-widest">
                        Standings temporarily unavailable. Retrying automatically...
                    </div>
                ) : teams.length === 0 ? (
                    <div className="bg-[#0d1117] rounded-xl border border-slate-800/60 p-12 text-center text-slate-500 text-xs uppercase tracking-widest">
                        Standings unavailable
                    </div>
                ) : view === 'division' ? (
                    <div className="space-y-8">
                        {(['AL', 'NL'] as const).map((lg) => (
                            <div key={lg}>
                                <h2 className="text-lg font-black text-slate-300 uppercase tracking-[0.2em] mb-3 pl-1" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    {lg === 'AL' ? 'American League' : 'National League'}
                                </h2>
                                <div className="grid grid-cols-1 gap-5">
                                    {LEAGUE_DIVISIONS[lg]
                                        .filter((d) => byDivision.has(d))
                                        .map((d) => (
                                            <DivisionCard key={d} division={d} teams={byDivision.get(d) || []} />
                                        ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-[#0d1117] rounded-xl border border-slate-800/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/40 flex items-center gap-2">
                            <span className="text-[#00D4FF] font-bold">|</span>
                            <h3 className="text-sm font-black text-white uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Power Rankings — All 30</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <HeaderRow showDivision />
                                <tbody className="divide-y divide-slate-800/40">
                                    {powerRanked.map((team, i) => (
                                        <TeamRow key={team.team_id} team={team} rank={i + 1} leader={i === 0} showDivision />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <p className="text-slate-600 text-[10px] mt-6 uppercase tracking-wider">
                    Computed from final game results. GB = games behind division leader. Grade is a league-relative power rating on the same ELITE/STRONG/LEAN/THIN/PASS scale used across Smarter Poker MLB.
                </p>
            </main>
            <BottomNavBar />
        </div>
    );
}
