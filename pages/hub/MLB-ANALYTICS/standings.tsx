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

type PlayoffStatus = 'div' | 'wc' | null;

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
  gp: number;
  pyth: number;
  x_w: number;
  x_l: number;
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
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtPct(p: number | null | undefined): string {
  if (p == null || Number.isNaN(Number(p))) return '.000';
  const s = Number(p).toFixed(3);
  return s.charAt(0) === '0' ? s.slice(1) : s; // .605 / 1.000
}

function fmtThrough(d?: string | null): string {
  if (!d) return '';
  const parts = String(d).split('-');
  if (parts.length !== 3) return '';
  const mi = parseInt(parts[1], 10) - 1;
  if (mi < 0 || mi > 11) return '';
  return `${MONTHS[mi]} ${parseInt(parts[2], 10)}`;
}

function teamHref(teamId: number): string {
  return `/hub/MLB-ANALYTICS/team/${teamId}`;
}

// Keyboard activation for clickable table rows (accessibility): Enter / Space.
function handleRowKey(e: React.KeyboardEvent, onActivate: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onActivate();
  }
}

function accentClass(playoff: PlayoffStatus): string {
  if (playoff === 'div') return 'border-[#00D4FF]';
  if (playoff === 'wc') return 'border-emerald-400';
  return 'border-transparent';
}

function gamesBetween(a: TeamStanding, b: TeamStanding): number {
  return ((a.w - b.w) + (b.l - a.l)) / 2;
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
        <th className="py-2 px-2 text-center w-16 hidden xl:table-cell" title="Pythagorean expected record">
          EXP
        </th>
        <th className="py-2 px-2 text-center w-16 hidden lg:table-cell">HOME</th>
        <th className="py-2 px-2 text-center w-16 hidden lg:table-cell">AWAY</th>
        <th className="py-2 px-2 pr-3 text-right">Grade</th>
      </tr>
    </thead>
  );
}

function TeamRow({
  team,
  rank,
  leader,
  showDivision,
  playoff = null,
}: {
  team: TeamStanding;
  rank: number;
  leader?: boolean;
  showDivision?: boolean;
  playoff?: PlayoffStatus;
}) {
  const router = useRouter();
  const go = () => router.push(teamHref(team.team_id));
  const luck = (team.w ?? 0) - (team.x_w ?? 0);
  const expTitle = `Pythagorean expected record ${team.x_w}-${team.x_l} (${luck >= 0 ? '+' : ''}${luck} vs actual)`;
  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={`${team.name}, ${team.w} and ${team.l}. View team profile.`}
      onClick={go}
      onKeyDown={(e) => handleRowKey(e, go)}
      className={`text-sm cursor-pointer hover:bg-slate-800/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] focus-visible:ring-inset ${leader ? 'bg-[#00D4FF]/[0.04]' : ''}`}
    >
      <td
        className={`py-2.5 pl-3 pr-1 text-left w-8 font-bold border-l-[3px] ${accentClass(playoff)} ${leader ? 'text-[#00D4FF]' : 'text-slate-500'}`}
      >
        {rank}
      </td>
      <td className="py-2.5 px-2">
        <div className="flex items-center gap-2 min-w-0">
          <TeamLogo teamId={team.team_id} abbr={team.abbr} />
          <span className="font-black text-slate-200">{team.abbr}</span>
          <span className="font-medium text-slate-400 truncate hidden sm:inline">{team.name}</span>
        </div>
      </td>
      {showDivision && (
        <td className="py-2.5 px-2 text-left text-[11px] text-slate-500 hidden sm:table-cell">
          {team.division}
        </td>
      )}
      <td className="py-2.5 px-2 text-center font-bold text-[#00D4FF]">{team.w}</td>
      <td className="py-2.5 px-2 text-center text-slate-300">{team.l}</td>
      <td className="py-2.5 px-2 text-center text-slate-200 tabular-nums">{fmtPct(team.pct)}</td>
      <td className="py-2.5 px-2 text-center text-slate-400 tabular-nums">
        {Number(team.gb) === 0 ? '-' : Number(team.gb).toFixed(1)}
      </td>
      <td className="py-2.5 px-2 text-center text-slate-400 tabular-nums hidden sm:table-cell">
        {team.l10_w}-{team.l10_l}
      </td>
      <td className="py-2.5 px-2 text-center hidden sm:table-cell">
        <StreakCell streak={team.streak} />
      </td>
      <td className="py-2.5 px-2 text-center tabular-nums hidden md:table-cell">
        <DiffCell diff={team.run_diff} />
      </td>
      <td
        className="py-2.5 px-2 text-center text-slate-400 tabular-nums hidden xl:table-cell"
        title={expTitle}
      >
        {team.x_w}-{team.x_l}
      </td>
      <td className="py-2.5 px-2 text-center text-slate-400 tabular-nums hidden lg:table-cell">
        {team.home_w}-{team.home_l}
      </td>
      <td className="py-2.5 px-2 text-center text-slate-400 tabular-nums hidden lg:table-cell">
        {team.away_w}-{team.away_l}
      </td>
      <td className="py-2.5 px-2 pr-3 text-right whitespace-nowrap">
        <TeamGradeBadge score={team.power_score} compact />
      </td>
    </tr>
  );
}

function DivisionCard({ division, teams, playoffOf }: { division: string; teams: TeamStanding[]; playoffOf: (id: number) => PlayoffStatus }) {
  return (
    <div className="bg-[#0d1117] rounded-xl border border-slate-800/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/40 flex items-center gap-2">
        <span className="text-[#00D4FF] font-bold">|</span>
        <h3
          className="text-sm font-black text-white uppercase tracking-wider"
          style={{ fontFamily: '"Rajdhani", sans-serif' }}
        >
          {division}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <HeaderRow />
          <tbody className="divide-y divide-slate-800/40">
            {teams.map((team, i) => (
              <TeamRow key={team.team_id} team={team} rank={i + 1} leader={i === 0} playoff={playoffOf(team.team_id)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WildCardRow({
  team,
  label,
  labelClass,
  gbText,
  inLine,
}: {
  team: TeamStanding;
  label: string;
  labelClass: string;
  gbText: string;
  inLine?: boolean;
}) {
  const router = useRouter();
  const go = () => router.push(teamHref(team.team_id));
  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={`${team.name}, ${team.w} and ${team.l}, ${label}. View team profile.`}
      onClick={go}
      onKeyDown={(e) => handleRowKey(e, go)}
      className={`text-sm cursor-pointer hover:bg-slate-800/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] focus-visible:ring-inset ${inLine ? 'bg-emerald-500/[0.05]' : ''}`}
    >
      <td className="py-2.5 pl-3 pr-1 w-12">
        <span className={`text-[9px] font-black uppercase tracking-wider ${labelClass}`}>{label}</span>
      </td>
      <td className="py-2.5 px-2">
        <div className="flex items-center gap-2 min-w-0">
          <TeamLogo teamId={team.team_id} abbr={team.abbr} />
          <span className="font-black text-slate-200">{team.abbr}</span>
          <span className="font-medium text-slate-400 truncate hidden sm:inline">{team.name}</span>
        </div>
      </td>
      <td className="py-2.5 px-2 text-center font-bold text-[#00D4FF]">{team.w}</td>
      <td className="py-2.5 px-2 text-center text-slate-300">{team.l}</td>
      <td className="py-2.5 px-2 text-center text-slate-200 tabular-nums">{fmtPct(team.pct)}</td>
      <td className="py-2.5 px-2 text-center text-slate-400 tabular-nums w-14">{gbText}</td>
      <td className="py-2.5 px-2 text-center hidden sm:table-cell">
        <StreakCell streak={team.streak} />
      </td>
      <td className="py-2.5 px-2 text-center tabular-nums hidden md:table-cell">
        <DiffCell diff={team.run_diff} />
      </td>
      <td className="py-2.5 px-2 pr-3 text-right whitespace-nowrap">
        <TeamGradeBadge score={team.power_score} compact />
      </td>
    </tr>
  );
}

function WildCardLeagueCard({
  league,
  leaders,
  race,
}: {
  league: 'AL' | 'NL';
  leaders: TeamStanding[];
  race: { team: TeamStanding; gbText: string; inWC: boolean }[];
}) {
  return (
    <div className="bg-[#0d1117] rounded-xl border border-slate-800/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/40 flex items-center gap-2">
        <span className="text-[#00D4FF] font-bold">|</span>
        <h3
          className="text-sm font-black text-white uppercase tracking-wider"
          style={{ fontFamily: '"Rajdhani", sans-serif' }}
        >
          {league === 'AL' ? 'American League' : 'National League'} — Playoff Picture
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800/60">
              <th className="py-2 pl-3 pr-1 text-left w-12">Seed</th>
              <th className="py-2 px-2 text-left">Team</th>
              <th className="py-2 px-2 text-center w-9">W</th>
              <th className="py-2 px-2 text-center w-9">L</th>
              <th className="py-2 px-2 text-center w-12">PCT</th>
              <th className="py-2 px-2 text-center w-14">GB/+</th>
              <th className="py-2 px-2 text-center w-12 hidden sm:table-cell">STRK</th>
              <th className="py-2 px-2 text-center w-14 hidden md:table-cell">DIFF</th>
              <th className="py-2 px-2 pr-3 text-right">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {leaders.map((t, i) => (
              <WildCardRow
                key={t.team_id}
                team={t}
                label={`DIV ${i + 1}`}
                labelClass="text-[#00D4FF]"
                gbText="-"
                inLine
              />
            ))}
            {race.map((r, i) => (
              <React.Fragment key={r.team.team_id}>
                <WildCardRow
                  team={r.team}
                  label={r.inWC ? `WC${i + 1}` : 'OUT'}
                  labelClass={r.inWC ? 'text-emerald-400' : 'text-slate-500'}
                  gbText={r.gbText}
                  inLine={r.inWC}
                />
                {i === 2 && (
                  <tr aria-hidden="true">
                    <td colSpan={9} className="p-0">
                      <div className="h-[2px] bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />
                      <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-500/80 bg-emerald-500/[0.03]">
                        Wild Card cut line
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
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
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {t}
        </span>
      ))}
      <span className="text-slate-700">|</span>
      <span className="inline-flex items-center gap-1 text-[#00D4FF]">
        <span className="w-2 h-2 rounded-[1px] bg-current" />Division leader
      </span>
      <span className="inline-flex items-center gap-1 text-emerald-400">
        <span className="w-2 h-2 rounded-[1px] bg-current" />Wild card
      </span>
    </div>
  );
}

function StandingsSkeleton() {
  return (
    <div className="bg-[#0d1117] rounded-xl border border-slate-800/60 overflow-hidden" aria-busy="true" aria-label="Loading standings">
      <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/40">
        <div className="h-4 w-32 rounded bg-slate-800 animate-pulse" />
      </div>
      <div className="divide-y divide-slate-800/40">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="w-4 h-3 rounded bg-slate-800 animate-pulse shrink-0" />
            <div className="w-7 h-7 rounded-full bg-slate-800 animate-pulse shrink-0" />
            <div className="h-3 flex-1 max-w-[160px] rounded bg-slate-800 animate-pulse" />
            <div className="ml-auto flex items-center gap-4">
              <div className="h-3 w-8 rounded bg-slate-800 animate-pulse hidden sm:block" />
              <div className="h-3 w-8 rounded bg-slate-800 animate-pulse hidden sm:block" />
              <div className="h-5 w-20 rounded bg-slate-800 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StandingsPage() {
  const router = useRouter();
  const { data, error, isLoading } = useSWR('/api/mlb/standings', fetcher, {
    refreshInterval: 60000,
  });
  const [view, setView] = useState<'division' | 'wildcard' | 'power'>('division');

  const teams: TeamStanding[] = data?.teams || [];
  const loading = isLoading && !data;
  const season: number | null = data?.season ?? null;
  const through: string = fmtThrough(data?.last_game_date);

  const byDivision = useMemo(() => {
    const map = new Map<string, TeamStanding[]>();
    for (const t of teams) {
      if (!t.division) continue;
      if (!map.has(t.division)) map.set(t.division, []);
      map.get(t.division)!.push(t);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => b.pct - a.pct || b.w - a.w || b.run_diff - a.run_diff);
    }
    return map;
  }, [teams]);

  const powerRanked = useMemo(
    () => [...teams].sort((a, b) => b.power_score - a.power_score || b.pct - a.pct),
    [teams]
  );

  const wildcard = useMemo(() => {
    const out: Record<
      'AL' | 'NL',
      { leaders: TeamStanding[]; race: { team: TeamStanding; gbText: string; inWC: boolean }[] }
    > = {
      AL: { leaders: [], race: [] },
      NL: { leaders: [], race: [] },
    };
    (['AL', 'NL'] as const).forEach((lg) => {
      const lgTeams = teams.filter((t) => t.league === lg);
      const leaders: TeamStanding[] = [];
      for (const d of LEAGUE_DIVISIONS[lg]) {
        const dt = lgTeams
          .filter((t) => t.division === d)
          .sort((a, b) => b.pct - a.pct || b.w - a.w);
        if (dt[0]) leaders.push(dt[0]);
      }
      leaders.sort((a, b) => b.pct - a.pct || b.w - a.w);
      const leaderIds = new Set(leaders.map((t) => t.team_id));
      const contenders = lgTeams
        .filter((t) => !leaderIds.has(t.team_id))
        .sort((a, b) => b.pct - a.pct || b.w - a.w || b.run_diff - a.run_diff);
      const wc3 = contenders[2];
      const firstOut = contenders[3];
      const race = contenders.map((t, i) => {
        let gbText = '-';
        if (i < 3) {
          gbText = firstOut ? `+${gamesBetween(t, firstOut).toFixed(1)}` : '-';
        } else if (wc3) {
          gbText = gamesBetween(wc3, t).toFixed(1);
        }
        return { team: t, gbText, inWC: i < 3 };
      });
      out[lg] = { leaders, race };
    });
    return out;
  }, [teams]);

  // team_id -> playoff position, shared across all views for consistent accent bars.
  const playoffMap = useMemo(() => {
    const m = new Map<number, PlayoffStatus>();
    (['AL', 'NL'] as const).forEach((lg) => {
      wildcard[lg].leaders.forEach((t) => m.set(t.team_id, 'div'));
      wildcard[lg].race.forEach((r) => {
        if (r.inWC) m.set(r.team.team_id, 'wc');
      });
    });
    return m;
  }, [wildcard]);
  const playoffOf = (id: number): PlayoffStatus => playoffMap.get(id) ?? null;

  const VIEWS: [typeof view, string][] = [
    ['division', 'By Division'],
    ['wildcard', 'Wild Card'],
    ['power', 'Power Rankings'],
  ];

  return (
    <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
      <SEOHead
        title="MLB Standings 2026 — Division Races, Wild Card & Power Rankings | Smarter.Poker"
        description="Live 2026 MLB standings: divisional breakdowns, wild-card playoff race, run differential, Pythagorean expected records, win streaks, and AI-graded team ratings on the ELITE/STRONG/LEAN/THIN/PASS scale."
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: 'MLB Standings — Power Ratings & Advanced Stats',
          description:
            'MLB standings augmented with AI power ratings, advanced metrics (wRC+, FIP, WAR), team momentum scores, and betting edge indicators.',
          url: 'https://smarter.poker/hub/MLB-ANALYTICS/standings',
          provider: { '@type': 'Organization', name: 'Smarter.Poker', url: 'https://smarter.poker' },
        }}
      />
      <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
      <MlbSubNav />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1
              className="text-3xl md:text-4xl font-black text-white uppercase tracking-wider flex items-center gap-3"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              <span className="text-[#00D4FF] font-bold">|</span> LEAGUE STANDINGS
            </h1>
            <p className="text-slate-400 mt-2 tracking-wide text-xs uppercase">
              {season ? `${season} SEASON · ` : ''}
              {through ? `THROUGH ${through.toUpperCase()} · ` : ''}LIVE W/L, RUN DIFFERENTIAL, POWER RANKINGS
            </p>
          </div>

          <div
            className="inline-flex rounded-lg border border-slate-700/70 bg-[#0d1117] p-1 self-start"
            role="tablist"
            aria-label="Standings view"
          >
            {VIEWS.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={`px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] ${
                  view === key
                    ? 'bg-[#00D4FF] text-black shadow-[0_0_12px_rgba(0,212,255,0.4)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <GradeLegend />
        </div>

        {loading ? (
          <StandingsSkeleton />
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
                <h2
                  className="text-lg font-black text-slate-300 uppercase tracking-[0.2em] mb-3 pl-1"
                  style={{ fontFamily: '"Rajdhani", sans-serif' }}
                >
                  {lg === 'AL' ? 'American League' : 'National League'}
                </h2>
                <div className="grid grid-cols-1 gap-5">
                  {LEAGUE_DIVISIONS[lg]
                    .filter((d) => byDivision.has(d))
                    .map((d) => (
                      <DivisionCard key={d} division={d} teams={byDivision.get(d) || []} playoffOf={playoffOf} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : view === 'wildcard' ? (
          <div className="space-y-6">
            <WildCardLeagueCard league="AL" leaders={wildcard.AL.leaders} race={wildcard.AL.race} />
            <WildCardLeagueCard league="NL" leaders={wildcard.NL.leaders} race={wildcard.NL.race} />
            <p className="text-slate-600 text-[10px] uppercase tracking-wider">
              DIV = division leader (auto-berth). WC1-3 = wild-card spots. GB/+ shows games ahead of the cut (+) for in-teams, games behind for the rest.
            </p>
          </div>
        ) : (
          <div className="bg-[#0d1117] rounded-xl border border-slate-800/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/40 flex items-center gap-2">
              <span className="text-[#00D4FF] font-bold">|</span>
              <h3
                className="text-sm font-black text-white uppercase tracking-wider"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
              >
                Power Rankings — All 30
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <HeaderRow showDivision />
                <tbody className="divide-y divide-slate-800/40">
                  {powerRanked.map((team, i) => (
                    <TeamRow
                      key={team.team_id}
                      team={team}
                      rank={i + 1}
                      leader={i === 0}
                      showDivision
                      playoff={playoffOf(team.team_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-slate-600 text-[10px] mt-6 uppercase tracking-wider">
          Computed from final game results. GB = games behind division leader. EXP = Pythagorean expected record from run differential. Cyan bar = division leader, green bar = wild-card position. Grade is a league-relative power rating on the same ELITE/STRONG/LEAN/THIN/PASS scale used across Smarter Poker MLB. Tap any team for its full profile.
        </p>
      </main>
      <BottomNavBar />
    </div>
  );
}
