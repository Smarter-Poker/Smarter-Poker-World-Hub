import { useRouter } from 'next/router';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ChevronRight, Search, X, AlertTriangle, Activity } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';
import { glossaryFor } from '../../../src/lib/mlbStatGlossary';
import HrTodayLeaders from '../../../src/components/mlb/HrTodayLeaders';

const fuzzyMatch = (str: string, query: string) => {
  if (!query) return true;
  if (!str) return false;
  let i = 0,
    j = 0;
  const s = str.toLowerCase();
  const q = query.toLowerCase();
  while (i < s.length && j < q.length) {
    if (s[i] === q[j]) j++;
    i++;
  }
  return j === q.length;
};

export interface PlayerProfile {
  player_id: number;
  full_name: string;
  team_id?: number;
  player_class?: string;
  position?: string;
  // hitter
  avg?: number;
  hr?: number;
  rbi?: number;
  r?: number;
  sb?: number;
  bb?: number;
  so?: number;
  h?: number;
  obp?: number;
  slg?: number;
  ops?: number;
  iso?: number;
  pa?: number;
  wrc_plus?: number;
  woba?: number;
  k_pct?: number;
  bb_pct?: number;
  // pitcher
  w?: number;
  l?: number;
  sv?: number;
  hld?: number;
  era?: number;
  whip?: number;
  k?: number;
  ip?: number;
  gs?: number;
  g?: number;
  fip?: number;
  siera?: number;
  k9?: number;
  bb9?: number;
  bf?: number;
}

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
  win_streak: number;
  runs_per_game: number | null;
  runs_allowed_per_game: number | null;
  era: number | null;
  team_avg: number | null;
}

// Canonical MLB league/division structure with team IDs
// Used for grouping even before standings data loads
const MLB_STRUCTURE: Record<string, Record<string, number[]>> = {
  'American League': {
    'AL East': [111, 139, 147, 141, 110], // BOS, TB, NYY, TOR, BAL
    'AL Central': [114, 145, 116, 142, 118], // CLE, CWS, DET, MIN, KC
    'AL West': [117, 108, 133, 140, 136], // HOU, LAA, OAK, TEX, SEA
  },
  'National League': {
    'NL East': [121, 144, 120, 143, 146], // NYM, ATL, WSH, PHI, MIA
    'NL Central': [112, 113, 158, 134, 138], // CHC, CIN, MIL, PIT, STL
    'NL West': [119, 137, 109, 135, 115], // LAD, SF, ARI, SD, COL
  },
};

// Static team identity (id -> name/abbr). Used as a graceful fallback so the team
// selector never shows a raw "Team 111" when the standings feed is briefly unavailable.
const MLB_TEAMS: Record<number, { name: string; abbr: string }> = {
  108: { name: 'Los Angeles Angels', abbr: 'LAA' },
  109: { name: 'Arizona Diamondbacks', abbr: 'ARI' },
  110: { name: 'Baltimore Orioles', abbr: 'BAL' },
  111: { name: 'Boston Red Sox', abbr: 'BOS' },
  112: { name: 'Chicago Cubs', abbr: 'CHC' },
  113: { name: 'Cincinnati Reds', abbr: 'CIN' },
  114: { name: 'Cleveland Guardians', abbr: 'CLE' },
  115: { name: 'Colorado Rockies', abbr: 'COL' },
  116: { name: 'Detroit Tigers', abbr: 'DET' },
  117: { name: 'Houston Astros', abbr: 'HOU' },
  118: { name: 'Kansas City Royals', abbr: 'KC' },
  119: { name: 'Los Angeles Dodgers', abbr: 'LAD' },
  120: { name: 'Washington Nationals', abbr: 'WSH' },
  121: { name: 'New York Mets', abbr: 'NYM' },
  133: { name: 'Athletics', abbr: 'ATH' },
  134: { name: 'Pittsburgh Pirates', abbr: 'PIT' },
  135: { name: 'San Diego Padres', abbr: 'SD' },
  136: { name: 'Seattle Mariners', abbr: 'SEA' },
  137: { name: 'San Francisco Giants', abbr: 'SF' },
  138: { name: 'St. Louis Cardinals', abbr: 'STL' },
  139: { name: 'Tampa Bay Rays', abbr: 'TB' },
  140: { name: 'Texas Rangers', abbr: 'TEX' },
  141: { name: 'Toronto Blue Jays', abbr: 'TOR' },
  142: { name: 'Minnesota Twins', abbr: 'MIN' },
  143: { name: 'Philadelphia Phillies', abbr: 'PHI' },
  144: { name: 'Atlanta Braves', abbr: 'ATL' },
  145: { name: 'Chicago White Sox', abbr: 'CWS' },
  146: { name: 'Miami Marlins', abbr: 'MIA' },
  147: { name: 'New York Yankees', abbr: 'NYY' },
  158: { name: 'Milwaukee Brewers', abbr: 'MIL' },
};

// Module-scope stable empty array (avoids re-allocating a fresh [] on every render,
// which would needlessly invalidate the useMemo below while data is loading).
const EMPTY_ARRAY: PlayerProfile[] = [];

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

// Compact stat formatters for the directory cards.
const fmtAvg = (v?: number | null) => (v == null ? '—' : Number(v).toFixed(3).replace(/^0\./, '.'));
const fmt2 = (v?: number | null) => (v == null ? '—' : Number(v).toFixed(2));
const fmtInt = (v?: number | null) => (v == null ? '—' : String(Math.round(Number(v))));
const fmtIp = (v?: number | null) => (v == null ? '—' : String(v));

// One stat on a directory card: label + value, with a hover tooltip from the glossary.
const CardStat = ({ label, value, lead }: { label: string; value: string; lead?: boolean }) => (
  <span
    className="inline-flex items-baseline gap-1"
    title={glossaryFor(label) || undefined}
    style={{ fontFamily: '"Rajdhani", sans-serif' }}
  >
    <span
      className={`${lead ? 'text-[#00D4FF]' : 'text-slate-500'} text-[13px] font-bold tracking-wide`}
    >
      {label}
    </span>
    <span
      className={`${lead ? 'text-white text-[18px]' : 'text-slate-300 text-[14px]'} font-extrabold tracking-wide`}
    >
      {value}
    </span>
  </span>
);

// Sort options per tab. asc=true for "lower is better" stats (ERA/WHIP).
const SORT_FIELDS: Record<string, { field: string; asc: boolean; label: string }> = {
  wrc_plus: { field: 'wrc_plus', asc: false, label: 'wRC+' },
  avg: { field: 'avg', asc: false, label: 'AVG' },
  hr: { field: 'hr', asc: false, label: 'HR' },
  rbi: { field: 'rbi', asc: false, label: 'RBI' },
  ops: { field: 'ops', asc: false, label: 'OPS' },
  sb: { field: 'sb', asc: false, label: 'SB' },
  k: { field: 'k', asc: false, label: 'Strikeouts' },
  era: { field: 'era', asc: true, label: 'ERA' },
  w: { field: 'w', asc: false, label: 'Wins' },
  sv: { field: 'sv', asc: false, label: 'Saves' },
  whip: { field: 'whip', asc: true, label: 'WHIP' },
  ip: { field: 'ip', asc: false, label: 'Innings' },
};
const HITTER_SORTS = ['wrc_plus', 'avg', 'hr', 'rbi', 'ops', 'sb'];
const PITCHER_SORTS = ['k', 'era', 'w', 'sv', 'whip', 'ip'];
const POSITIONS = ['All', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'];

// Compact role chip shown on each card.
const cardRole = (player: PlayerProfile, type: 'hitters' | 'pitchers'): string | null => {
  if (type === 'pitchers') {
    const gs = Number(player.gs) || 0;
    const g = Number(player.g) || 0;
    const sv = Number(player.sv) || 0;
    if (g > 0 && gs / g >= 0.5) return 'SP';
    if (sv >= 10) return 'CL';
    return 'RP';
  }
  if (player.player_class === 'regular') return 'Starter';
  if (player.player_class === 'bench') return 'Backup';
  return null;
};

const PlayerCard = ({ player, type }: { player: PlayerProfile; type: 'hitters' | 'pitchers' }) => {
  const headshotUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.player_id}/headshot/67/current`;
  const [imgSrc, setImgSrc] = useState(headshotUrl);

  useEffect(() => {
    setImgSrc(headshotUrl);
  }, [headshotUrl]);

  return (
    <Link
      href={`/hub/MLB-ANALYTICS/players/${player.player_id}`}
      className="block mb-3 group"
      style={{ textDecoration: 'none' }}
    >
      <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 flex items-center justify-between transition-all group-hover:border-[#00D4FF] group-hover:shadow-[0_0_15px_rgba(0,212,255,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] relative overflow-hidden">
        {/* Neon strip effect */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#3d4f5f] transition-all group-hover:bg-[#00D4FF] group-hover:shadow-[0_0_10px_rgba(0,212,255,0.8)]" />

        <div className="flex items-center gap-4 z-10 pl-2">
          <div className="relative w-14 h-14">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              onError={() => setImgSrc('/default-avatar.png')}
              alt={player.full_name}
              loading="lazy"
              width={56}
              height={56}
              className="w-14 h-14 rounded-full object-cover bg-[#0d1117] border-[2px] border-[#3d4f5f] group-hover:border-[#00D4FF] transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_10px_rgba(0,212,255,0.2)]"
            />
            {player.team_id && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://www.mlbstatic.com/team-logos/${player.team_id}.svg`}
                alt="Team Logo"
                loading="lazy"
                width={24}
                height={24}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#0d1117] rounded-full p-0.5 border border-[#3d4f5f] shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
              />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className="font-extrabold text-white text-[23px] tracking-wide truncate"
              style={{
                fontFamily: '"Rajdhani", sans-serif',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              }}
            >
              {player.full_name}
            </span>
            {cardRole(player, type) && (
              <span
                className="inline-block w-fit mt-0.5 bg-[#00D4FF]/10 border border-[#00D4FF]/40 text-[#00D4FF] text-[11px] font-extrabold tracking-widest px-1.5 py-0.5 rounded"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
                title={type === 'pitchers' ? 'Pitching role' : 'Lineup role'}
              >
                {cardRole(player, type)}
                {type !== 'pitchers' && player.position ? ` · ${player.position}` : ''}
              </span>
            )}
            {type === 'pitchers' ? (
              <>
                <div className="flex items-center gap-x-3 gap-y-0.5 mt-1 flex-wrap">
                  <CardStat label="Era" value={fmt2(player.era)} lead />
                  <CardStat label="W-L" value={`${fmtInt(player.w)}-${fmtInt(player.l)}`} lead />
                  <CardStat label="K" value={fmtInt(player.k)} lead />
                </div>
                <div className="flex items-center gap-x-3 gap-y-0.5 mt-0.5 flex-wrap">
                  <CardStat label="Whip" value={fmt2(player.whip)} />
                  <CardStat label="Ip" value={fmtIp(player.ip)} />
                  <CardStat label="Sv" value={fmtInt(player.sv)} />
                  <CardStat label="Fip" value={fmt2(player.fip)} />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-x-3 gap-y-0.5 mt-1 flex-wrap">
                  <CardStat label="Avg" value={fmtAvg(player.avg)} lead />
                  <CardStat label="Hr" value={fmtInt(player.hr)} lead />
                  <CardStat label="Rbi" value={fmtInt(player.rbi)} lead />
                </div>
                <div className="flex items-center gap-x-3 gap-y-0.5 mt-0.5 flex-wrap">
                  <CardStat label="Obp" value={fmtAvg(player.obp)} />
                  <CardStat label="Slg" value={fmtAvg(player.slg)} />
                  <CardStat label="Ops" value={fmtAvg(player.ops)} />
                  <CardStat label="wRC+" value={fmtInt(player.wrc_plus)} />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="w-8 h-8 rounded-full bg-[#1a2332] border border-[#3d4f5f] flex items-center justify-center shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] z-10 group-hover:border-[#00D4FF] group-hover:bg-[#0d1117] transition-all">
          <ChevronRight
            size={16}
            className="text-[#00D4FF]"
            style={{ filter: 'drop-shadow(0 0 2px rgba(0,212,255,0.5))' }}
          />
        </div>
      </div>
    </Link>
  );
};

// Helper: format streak as "W3" or "L2"
function formatStreak(streak: number): { label: string; isWin: boolean } {
  if (!streak || streak === 0) return { label: '--', isWin: true };
  if (streak > 0) return { label: `W${streak}`, isWin: true };
  return { label: `L${Math.abs(streak)}`, isWin: false };
}

// Team row card inside the division list
const TeamSelectorRow = ({
  teamId,
  standing,
  onClick,
}: {
  teamId: number;
  standing: TeamStanding | undefined;
  onClick: () => void;
}) => {
  const streak = standing ? formatStreak(standing.win_streak ?? 0) : null;
  const record = standing ? `${standing.w}-${standing.l}` : null;
  const era = standing?.era != null ? Number(standing.era).toFixed(2) : null;
  const avg = standing?.team_avg != null ? Number(standing.team_avg).toFixed(3) : null;
  const rpg = standing?.runs_per_game != null ? Number(standing.runs_per_game).toFixed(1) : null;
  const rapg =
    standing?.runs_allowed_per_game != null
      ? Number(standing.runs_allowed_per_game).toFixed(1)
      : null;
  const teamName = standing?.name ?? MLB_TEAMS[teamId]?.name ?? `Team ${teamId}`;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-white/5 transition-all group text-left"
    >
      {/* Logo — large, no background, no border */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`}
        alt={teamName}
        loading="lazy"
        width={72}
        height={72}
        className="w-[72px] h-[72px] object-contain flex-shrink-0 transition-transform duration-200 group-hover:scale-110 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
      />

      {/* Team info */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Name + record + streak */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-extrabold text-white text-[20px] tracking-widest truncate"
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
          >
            {teamName}
          </span>
          {record && (
            <span
              className="text-[#00D4FF] font-extrabold text-[17px] tracking-wider"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              {record}
            </span>
          )}
          {streak && streak.label !== '--' && (
            <span
              className="text-[14px] font-extrabold px-2 py-0.5 rounded-full tracking-widest"
              style={{
                fontFamily: '"Rajdhani", sans-serif',
                background: streak.isWin ? 'rgba(0,255,136,0.15)' : 'rgba(255,60,60,0.15)',
                color: streak.isWin ? '#00FF88' : '#FF3C3C',
                border: `1px solid ${streak.isWin ? 'rgba(0,255,136,0.4)' : 'rgba(255,60,60,0.4)'}`,
              }}
            >
              {streak.label}
            </span>
          )}
        </div>

        {/* Stat pills row */}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <StatPill label="Era" value={era} />
          <StatPill label="Avg" value={avg} />
          <StatPill label="R/G" value={rpg} />
          <StatPill label="Ra/G" value={rapg} />
        </div>
      </div>

      <ChevronRight
        size={18}
        className="text-slate-600 group-hover:text-[#00D4FF] transition-colors flex-shrink-0"
      />
    </button>
  );
};

const StatPill = ({ label, value }: { label: string; value: string | null }) => (
  <div className="flex items-center gap-1" title={glossaryFor(label) || undefined}>
    <span
      className="text-slate-500 text-[13px] font-bold tracking-widest"
      style={{ fontFamily: '"Rajdhani", sans-serif' }}
    >
      {label}
    </span>
    <span
      className="text-slate-300 text-[14px] font-extrabold tracking-wider"
      style={{ fontFamily: '"Rajdhani", sans-serif' }}
    >
      {value ?? '--'}
    </span>
  </div>
);

export default function PlayersPage() {
  const router = useRouter();
  const { data, error, isLoading } = useSWR('/api/mlb/players', fetcher, {
    refreshInterval: 60000,
  });

  const { data: standingsData } = useSWR('/api/mlb/standings', fetcher, {
    refreshInterval: 3600000, // 1 hour (matches CDN cache)
  });

  const hitters = data?.hitters || EMPTY_ARRAY;
  const pitchers = data?.pitchers || EMPTY_ARRAY;
  const fetchError = error || data?.fetchError || data?.error;

  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState('Regular Hitters');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState('default');
  const [posFilter, setPosFilter] = useState('All');
  const [visibleCount, setVisibleCount] = useState(50);

  // Reset paging + sort when the view changes.
  useEffect(() => {
    setVisibleCount(50);
  }, [activeTab, selectedTeam, searchQuery, sortKey, posFilter]);
  useEffect(() => {
    setSortKey('default');
    setPosFilter('All');
  }, [activeTab]);

  // Build a map of teamId -> TeamStanding for quick lookup
  const standingsMap = useMemo<Map<number, TeamStanding>>(() => {
    const map = new Map<number, TeamStanding>();
    (standingsData?.teams || []).forEach((t: TeamStanding) => {
      map.set(Number(t.team_id), t);
    });
    return map;
  }, [standingsData]);

  const filteredPlayers = useMemo(() => {
    let list: PlayerProfile[] = [];
    if (activeTab === 'Regular Hitters') {
      // API returns hitters ordered by wRC+ desc (nulls excluded) — keep that ranking.
      list = hitters.filter((h: PlayerProfile) => (h.pa || 0) >= 150);
    } else if (activeTab === 'Bench / Fringe') {
      // Bench is small-sample territory: rank by volume (PA) so a 4-PA hot streak with
      // an inflated wRC+ doesn't top the list ahead of established part-timers.
      list = hitters
        .filter((h: PlayerProfile) => (h.pa || 0) > 0 && (h.pa || 0) < 150)
        .slice()
        .sort((a, b) => (b.pa || 0) - (a.pa || 0));
    } else if (activeTab === 'Pitchers') {
      list = pitchers;
    }

    if (selectedTeam) {
      list = list.filter((p: PlayerProfile) => p.team_id === selectedTeam);
    }

    // Position filter (hitter tabs only; OF groups LF/CF/RF/OF).
    if (activeTab !== 'Pitchers' && posFilter !== 'All') {
      list = list.filter((p: PlayerProfile) => {
        const pos = (p.position || '').toUpperCase();
        return posFilter === 'OF' ? ['LF', 'CF', 'RF', 'OF'].includes(pos) : pos === posFilter;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim();
      const lowerQuery = query.toLowerCase();
      list = list.filter((p: PlayerProfile) => fuzzyMatch(p.full_name || '', query));
      // Rank by match quality: earliest substring position first (prefix/word-start
      // beats a mid-string match), then alphabetical for a stable, predictable order.
      list = list.slice().sort((a, b) => {
        const an = (a.full_name || '').toLowerCase();
        const bn = (b.full_name || '').toLowerCase();
        const ai = an.indexOf(lowerQuery);
        const bi = bn.indexOf(lowerQuery);
        const ar = ai === -1 ? Infinity : ai;
        const br = bi === -1 ? Infinity : bi;
        if (ar !== br) return ar - br;
        return an.localeCompare(bn);
      });
    }

    // Explicit sort overrides the tab's default ranking.
    if (sortKey !== 'default' && SORT_FIELDS[sortKey]) {
      const { field, asc } = SORT_FIELDS[sortKey];
      list = list.slice().sort((a, b) => {
        const av = (a as any)[field];
        const bv = (b as any)[field];
        const an = av == null || isNaN(Number(av)) ? (asc ? Infinity : -Infinity) : Number(av);
        const bn = bv == null || isNaN(Number(bv)) ? (asc ? Infinity : -Infinity) : Number(bv);
        return asc ? an - bn : bn - an;
      });
    }

    return list;
  }, [hitters, pitchers, activeTab, searchQuery, selectedTeam, posFilter, sortKey]);

  const visiblePlayers = filteredPlayers.slice(0, visibleCount);
  const canLoadMore = filteredPlayers.length > visibleCount;
  const suggestions = searchQuery.length >= 3 ? filteredPlayers.slice(0, 5) : [];
  // Distinct "feed returned nothing" state: data loaded successfully but both directories
  // are empty. Without this the user is silently dropped into the team selector and then
  // into per-team dead-ends.
  const noData = !fetchError && !!data && hitters.length === 0 && pitchers.length === 0;

  const tabs = ['Regular Hitters', 'Bench / Fringe', 'Pitchers'];

  // fetchError is a soft API-level error (DB failures). SWR's `error` is a network error.
  // Only show full-screen error on network failure — DB partial errors show the inline banner.
  const hasError = !!error;

  if (hasError) {
    return (
      <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
        <SEOHead
          title="MLB Player Analytics — Stats, Rankings &amp; Predictive Grades | Smarter.Poker"
          description="Complete MLB player database with advanced statistics and AI-powered predictive grades."
          noindex={true}
        />
        <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
        <MlbSubNav />
        <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
          <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF4444]/50 shadow-[0_0_20px_rgba(255,68,68,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
            <Activity
              className="w-12 h-12 text-[#FF4444] mx-auto mb-4 relative z-10"
              style={{ filter: 'drop-shadow(0 0 8px rgba(255,68,68,0.8))' }}
            />
            <h2
              className="text-[31px] font-extrabold text-white tracking-wider mb-2 relative z-10"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              System Error
            </h2>
            <p className="text-[#FF4444] font-bold tracking-widest text-[11px] relative z-10">
              Failed To Load Data. Please Try Again Later.
            </p>
          </div>
        </main>
        <BottomNavBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
      <SEOHead
        title="MLB Player Analytics — Stats, Rankings & Predictive Grades | Smarter.Poker"
        description="Complete MLB player database with advanced statistics — wRC+, wOBA, FIP, SIERA — plus recent form and model projections for every hitter and pitcher in the 2026 season."
        canonical="/hub/MLB-ANALYTICS/players"
        ogImage="/images/mlb/og.png"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: 'MLB Player Analytics — Advanced Stats & AI Grades',
          description:
            'In-depth MLB player analytics featuring wRC+, wOBA, FIP, SIERA, recent form, and model projection rates for every active player.',
          url: 'https://smarter.poker/hub/MLB-ANALYTICS/players',
          provider: {
            '@type': 'Organization',
            name: 'Smarter.Poker',
            url: 'https://smarter.poker',
          },
        }}
      />

      <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
      <MlbSubNav />

      <div className="p-4 w-full max-w-4xl mx-auto box-border relative">
        {/* Background Glows */}
        <div className="absolute top-20 right-0 w-96 h-96 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.03] pointer-events-none"></div>

        <div className="mb-6">
          <h1
            className="m-0 text-[31px] md:text-[39px] font-extrabold text-white tracking-widest"
            style={{
              fontFamily: '"Rajdhani", sans-serif',
              textShadow: '0 0 10px rgba(255,255,255,0.2)',
            }}
          >
            Player Database
          </h1>
          <p className="mt-2 text-[18px] text-slate-400 font-bold tracking-wide">
            Complete profiles for every MLB hitter and pitcher. Explore recent form, model
            projections, and advanced metrics.
          </p>
          <Link
            href="/hub/MLB-ANALYTICS/players/compare"
            className="inline-flex items-center gap-1 mt-3 text-[#00D4FF] text-[13px] font-extrabold tracking-widest hover:text-white transition-colors"
          >
            Compare Players <ChevronRight size={14} />
          </Link>
        </div>

        <HrTodayLeaders />

        <div className="relative mb-6">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00D4FF] flex pointer-events-none">
            <Search size={18} style={{ filter: 'drop-shadow(0 0 2px rgba(0,212,255,0.5))' }} />
          </div>
          <input
            type="text"
            inputMode="search"
            aria-label="Search players by name"
            placeholder="Search Players by Name..."
            value={searchQuery}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value && selectedTeam) setSelectedTeam(null);
              setShowSuggestions(true);
            }}
            className="w-full bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-3 pl-12 pr-12 text-white font-extrabold text-[18px] tracking-widest focus:outline-none focus:border-[#00D4FF] focus:shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all placeholder:text-slate-600 relative z-20"
          />
          {(searchQuery || selectedTeam) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedTeam(null);
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#00D4FF] transition-colors flex items-center gap-1 text-[13px] font-extrabold tracking-widest z-30"
            >
              Clear <X size={14} />
            </button>
          )}

          {/* Suggestions Dropdown */}
          {showSuggestions && searchQuery.length >= 3 && suggestions.length > 0 && (
            <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[100] overflow-hidden divide-y divide-[#3d4f5f]">
              <div
                className="px-4 py-2 bg-[#1a2332] text-slate-400 text-[13px] font-extrabold tracking-widest"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
              >
                Top Suggestions
              </div>
              {suggestions.map((p) => (
                <Link
                  key={p.player_id}
                  href={`/hub/MLB-ANALYTICS/players/${p.player_id}`}
                  className="flex items-center gap-3 p-3 hover:bg-[#1a2332] transition-colors group"
                  style={{ textDecoration: 'none' }}
                >
                  {p.team_id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://www.mlbstatic.com/team-logos/${p.team_id}.svg`}
                      className="w-8 h-8 object-contain drop-shadow-md"
                      alt="Team"
                      loading="lazy"
                      width={32}
                      height={32}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#3d4f5f]" />
                  )}
                  <div className="flex flex-col">
                    <span
                      className="text-white font-extrabold tracking-widest text-[18px] group-hover:text-[#00D4FF] transition-colors"
                      style={{ fontFamily: '"Rajdhani", sans-serif' }}
                    >
                      {p.full_name}
                    </span>
                  </div>
                  <ChevronRight
                    size={16}
                    className="ml-auto text-slate-500 group-hover:text-[#00D4FF] transition-colors"
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div
          className="flex flex-col md:flex-row gap-2 mb-6 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
              }}
              aria-pressed={activeTab === tab}
              className={`w-full md:w-auto px-4 py-3 md:py-2 rounded-md font-extrabold text-[17px] md:text-[14px] tracking-widest whitespace-nowrap transition-all ${
                activeTab === tab
                  ? 'bg-gradient-to-b from-[#00D4FF]/20 to-[#1a2332] border-[2px] border-[#00D4FF] text-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3),inset_0_2px_4px_rgba(255,255,255,0.1)]'
                  : 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-[2px] border-[#3d4f5f] text-slate-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.05)] hover:border-[#4b637a]'
              }`}
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              {tab}
            </button>
          ))}
        </div>

        {fetchError && (
          <div className="bg-gradient-to-b from-[#FF4444]/10 to-[#0d1117] border-[2px] border-[#FF4444]/50 rounded-xl p-4 mb-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#0d1117] border-[2px] border-[#FF4444] flex items-center justify-center shadow-[0_0_10px_rgba(255,68,68,0.5)]">
              <AlertTriangle className="text-[#FF4444] w-5 h-5" />
            </div>
            <div>
              <div
                className="text-[#FF4444] font-extrabold text-[18px] tracking-widest"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
              >
                System Error
              </div>
              <div className="text-[#FF4444]/70 text-[16px] font-bold tracking-wide mt-1">
                Data transmission failed. Attempting to reconnect...
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 flex items-center justify-between animate-pulse shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
                >
                  <div className="flex items-center gap-4 pl-2">
                    <div className="w-14 h-14 rounded-full bg-[#3d4f5f]"></div>
                    <div className="flex flex-col gap-2">
                      <div className="h-5 w-32 bg-[#3d4f5f] rounded"></div>
                      <div className="h-3 w-48 bg-[#3d4f5f] rounded"></div>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#3d4f5f]"></div>
                </div>
              ))}
            </div>
          ) : noData ? (
            /* ── NO DATA: feed returned zero players (distinct from loading) ── */
            <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-10 text-center flex flex-col items-center mt-4">
              <div className="w-16 h-16 rounded-full bg-[#0d1117] border-[2px] border-[#3d4f5f] flex items-center justify-center mb-4 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
                <Activity size={28} className="text-[#3d4f5f]" />
              </div>
              <div
                className="text-slate-400 font-extrabold text-[18px] tracking-widest"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
              >
                No Player Data Available
              </div>
              <div className="text-slate-600 font-bold text-[14px] tracking-wide mt-2">
                The analytics feed returned no players. Please check back shortly.
              </div>
            </div>
          ) : !searchQuery && !selectedTeam ? (
            /* ── TEAM SELECTOR: League / Division Grouped ── */
            <div className="space-y-8">
              <p
                className="text-center text-[14px] font-extrabold text-slate-500 tracking-widest"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
              >
                Select a Team
              </p>
              {Object.entries(MLB_STRUCTURE).map(([league, divisions]) => (
                <div key={league}>
                  {/* League header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#3d4f5f]" />
                    <span
                      className="text-[#00D4FF] font-extrabold text-[17px] tracking-[0.2em] px-3 py-1 rounded-full border border-[#00D4FF]/30 bg-[#00D4FF]/5"
                      style={{
                        fontFamily: '"Rajdhani", sans-serif',
                        textShadow: '0 0 8px rgba(0,212,255,0.5)',
                      }}
                    >
                      {league}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#3d4f5f]" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-4 md:px-0">
                    {Object.entries(divisions).map(([division, teamIds]) => {
                      // Sort teams in this division by win pct (best first)
                      const sortedIds = [...teamIds].sort((a, b) => {
                        const sa = standingsMap.get(a);
                        const sb = standingsMap.get(b);
                        const pctA = sa?.pct ?? 0;
                        const pctB = sb?.pct ?? 0;
                        return pctB - pctA;
                      });

                      return (
                        <div
                          key={division}
                          className="bg-[#0d1117]/60 rounded-2xl border border-[#2a3a4a] p-3 backdrop-blur-sm"
                        >
                          {/* Division header */}
                          <div
                            className="text-[13px] font-extrabold text-slate-500 tracking-[0.2em] mb-3 pl-2 border-b border-[#2a3a4a] pb-2"
                            style={{ fontFamily: '"Rajdhani", sans-serif' }}
                          >
                            {division}
                          </div>
                          {/* Team rows */}
                          <div className="divide-y divide-[#1e2d3d]">
                            {sortedIds.map((teamId) => (
                              <TeamSelectorRow
                                key={teamId}
                                teamId={teamId}
                                standing={standingsMap.get(teamId)}
                                onClick={() => setSelectedTeam(teamId)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Sort + position controls */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <label
                  className="text-slate-500 text-[12px] font-extrabold tracking-widest"
                  style={{ fontFamily: '"Rajdhani", sans-serif' }}
                >
                  Sort
                </label>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  aria-label="Sort players"
                  className="bg-[#0d1117] border border-[#3d4f5f] text-slate-200 text-[13px] font-bold rounded px-2 py-1 focus:outline-none focus:border-[#00D4FF]"
                >
                  <option value="default">Default</option>
                  {(activeTab === 'Pitchers' ? PITCHER_SORTS : HITTER_SORTS).map((k) => (
                    <option key={k} value={k}>
                      {SORT_FIELDS[k].label}
                    </option>
                  ))}
                </select>
                {activeTab !== 'Pitchers' && (
                  <>
                    <label
                      className="text-slate-500 text-[12px] font-extrabold tracking-widest ml-2"
                      style={{ fontFamily: '"Rajdhani", sans-serif' }}
                    >
                      Pos
                    </label>
                    <select
                      value={posFilter}
                      onChange={(e) => setPosFilter(e.target.value)}
                      aria-label="Filter by position"
                      className="bg-[#0d1117] border border-[#3d4f5f] text-slate-200 text-[13px] font-bold rounded px-2 py-1 focus:outline-none focus:border-[#00D4FF]"
                    >
                      {POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <span className="ml-auto text-slate-600 text-[12px] font-bold">
                  {filteredPlayers.length} players
                </span>
              </div>
              {/* Selected team header always shows when a team is selected */}
              {selectedTeam && (
                <div className="flex items-center gap-3 mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://www.mlbstatic.com/team-logos/${selectedTeam}.svg`}
                    alt="Selected Team"
                    className="w-10 h-10 object-contain"
                    loading="lazy"
                    width={40}
                    height={40}
                  />
                  <span
                    className="text-white font-extrabold text-[23px] tracking-widest"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {standingsMap.get(selectedTeam)?.name ??
                      MLB_TEAMS[selectedTeam]?.name ??
                      `Team ${selectedTeam}`}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedTeam(null);
                      setSearchQuery('');
                    }}
                    className="ml-auto text-slate-500 hover:text-[#00D4FF] text-[13px] font-extrabold tracking-widest flex items-center gap-1 transition-colors"
                  >
                    Change Team <X size={12} />
                  </button>
                </div>
              )}

              {visiblePlayers.length > 0 ? (
                <>
                  {visiblePlayers.map((player: PlayerProfile) => (
                    <PlayerCard
                      key={player.player_id}
                      player={player}
                      type={activeTab === 'Pitchers' ? 'pitchers' : 'hitters'}
                    />
                  ))}

                  {canLoadMore && (
                    <div className="text-center py-6 pb-8">
                      <button
                        onClick={() => setVisibleCount((c) => c + 50)}
                        className="bg-[#1a2332] text-[#00D4FF] border border-[#00D4FF]/50 px-6 py-2 rounded text-[14px] font-extrabold tracking-widest hover:bg-[#00D4FF]/10 transition-colors"
                        style={{ fontFamily: '"Rajdhani", sans-serif' }}
                      >
                        Load More ({filteredPlayers.length - visibleCount} more)
                      </button>
                    </div>
                  )}
                </>
              ) : (
                !fetchError && (
                  <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-10 text-center flex flex-col items-center mt-4">
                    <div className="w-16 h-16 rounded-full bg-[#0d1117] border-[2px] border-[#3d4f5f] flex items-center justify-center mb-4 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
                      <Search size={28} className="text-[#3d4f5f]" />
                    </div>
                    <div
                      className="text-slate-400 font-extrabold text-[18px] tracking-widest mb-4"
                      style={{ fontFamily: '"Rajdhani", sans-serif' }}
                    >
                      {searchQuery
                        ? `No Players Found Matching "${searchQuery}"`
                        : 'No Players Found for This Team'}
                    </div>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedTeam(null);
                      }}
                      className="bg-[#1a2332] text-[#00D4FF] border border-[#00D4FF] px-6 py-2 rounded-sm text-[16px] font-extrabold tracking-widest hover:bg-[#00D4FF]/10 transition-colors shadow-[0_0_10px_rgba(0,212,255,0.2)]"
                    >
                      Clear Filters
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <BottomNavBar />
    </div>
  );
}
