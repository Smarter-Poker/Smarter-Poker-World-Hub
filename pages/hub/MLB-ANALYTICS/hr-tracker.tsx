import { useState, useMemo, useCallback, useDeferredValue, useEffect, memo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import useSWR from 'swr';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  X,
  Zap,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';
import { teamLogo, playerHeadshot } from '../../../src/lib/mlb_data';

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

type SortKey =
  | 'due_score'
  | 'matchup_due_score'
  | 'hr'
  | 'games_since_hr'
  | 'games_per_hr'
  | 'full_name';
type SortDir = 'asc' | 'desc';

const SORT_LABELS: Record<SortKey, string> = {
  due_score: 'Raw Due',
  matchup_due_score: 'Matchup Due',
  hr: 'HR',
  games_since_hr: 'Since HR',
  games_per_hr: 'Games/HR',
  full_name: 'Player',
};

const STATUS_CONFIG = {
  OVERDUE: {
    label: 'Overdue',
    color: 'text-[#FF4444]',
    bg: 'bg-[#FF4444]/10',
    border: 'border-[#FF4444]/60',
    glow: 'shadow-[0_0_12px_rgba(255,68,68,0.4)]',
    dot: 'bg-[#FF4444]',
    icon: '●',
  },
  DUE: {
    label: 'Due',
    color: 'text-[#FFB800]',
    bg: 'bg-[#FFB800]/10',
    border: 'border-[#FFB800]/60',
    glow: 'shadow-[0_0_12px_rgba(255,184,0,0.3)]',
    dot: 'bg-[#FFB800]',
    icon: '◆',
  },
  RECENT: {
    label: 'Recent',
    color: 'text-[#00D4FF]',
    bg: 'bg-[#00D4FF]/10',
    border: 'border-[#00D4FF]/40',
    glow: '',
    dot: 'bg-[#00D4FF]',
    icon: '●',
  },
  NO_HR: {
    label: 'No HR',
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
  const pct = score / 2; // pure ratio
  const color = score >= 1.0 ? '#FF4444' : score >= 0.5 ? '#FFB800' : '#00D4FF';
  return (
    <div className="w-full h-1.5 bg-[#1a2332] rounded-full overflow-hidden" aria-hidden="true">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${Math.round(pct * 100)}%`,
          backgroundColor: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
    </div>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown size={12} className="text-slate-600 ml-1 shrink-0" />;
  return sortDir === 'desc' ? (
    <ChevronDown size={12} className="text-[#00D4FF] ml-1 shrink-0" />
  ) : (
    <ChevronUp size={12} className="text-[#00D4FF] ml-1 shrink-0" />
  );
}

const EMPTY_ARRAY: HRPlayer[] = [];

const PlayerRow = memo(function PlayerRow({ p }: { p: HRPlayer }) {
  const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.RECENT;
  const hasRate = p.games_per_hr != null && p.games_per_hr > 0;
  return (
    <tr
      className="hover:bg-[#1a2332]/60 transition-colors cursor-pointer group focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#00D4FF]/60 relative"
    >
      {/* Player */}
      <td className="py-3 px-3 sticky left-0 z-10 bg-[#0d1117] group-hover:bg-[#131924] transition-colors">
        <div className="flex items-center gap-3">
          {/* absolute link overlay for a11y */}
          <Link
            href={`/hub/MLB-ANALYTICS/players/${p.player_id}`}
            className="absolute inset-0 z-20"
            aria-label={`${p.full_name}, ${p.team_name}. View player details`}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="relative shrink-0">
            <img
              src={playerHeadshot(p.player_id) || '/default-avatar.png'}
              alt={p.full_name}
              loading="lazy"
              width={36}
              height={36}
              className="w-9 h-9 rounded-full object-cover border border-[#3d4f5f] group-hover:border-[#00D4FF] transition-all"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/default-avatar.png';
              }}
            />
            {p.team_id ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={teamLogo(p.team_id) || ''}
                alt=""
                width={16}
                height={16}
                className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#0d1117] rounded-full p-0.5"
                loading="lazy"
              />
            ) : null}
          </div>
          <div>
            <div className="text-white font-extrabold text-[23px] tracking-wider capitalize group-hover:text-[#00D4FF] transition-colors font-rajdhani">
              {p.full_name}
            </div>
            <div className="text-slate-500 text-[17px] font-bold">
              {p.team_name}
            </div>
          </div>
        </div>
      </td>

      {/* Status Badge */}
      <td className="py-3 px-3 text-center">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[17px] font-extrabold tracking-widest capitalize ${cfg.bg} ${cfg.color} border ${cfg.border} font-rajdhani`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
          {cfg.label}
        </span>
      </td>

      {/* HR Count */}
      <td className="py-3 px-3 text-right">
        <span className="text-white font-extrabold text-[27px] font-rajdhani">
          {p.hr}
        </span>
      </td>

      {/* Games Per HR Rate */}
      <td className="py-3 px-3 text-right">
        <span className="text-[#00D4FF] font-extrabold text-[23px] font-rajdhani">
          {hasRate ? `1 Per ${p.games_per_hr}g` : '—'}
        </span>
      </td>

      {/* Games Since HR */}
      <td className="py-3 px-3 text-right">
        <span
          className={`font-extrabold text-[23px] ${
            p.games_since_hr != null && hasRate
              ? p.games_since_hr > p.games_per_hr
                ? 'text-[#FF4444] font-black'
                : p.games_since_hr > p.games_per_hr * 0.9
                  ? 'text-[#FFB800] font-bold'
                  : 'text-slate-300'
              : 'text-slate-600'
          } font-rajdhani`}
        >
          {p.games_since_hr != null ? `${p.games_since_hr}g` : '—'}
        </span>
      </td>

      {/* Matchup */}
      <td className="py-3 px-3 text-right">
        {p.opp_pitcher_name ? (
          <div className="flex flex-col items-end">
            <span className="text-white font-bold text-[23px]  max-w-[120px]">
              Vs{' '}
              {p.opp_pitcher_name.split(' ').filter(Boolean).pop() ||
                p.opp_pitcher_name}
            </span>
            {p.opp_pitcher_hr9 != null && (
              <span className="text-slate-500 text-[17px] capitalize font-bold tracking-widest mt-0.5">
                {p.opp_pitcher_hr9.toFixed(2)} HR/9
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-600 text-[23px]">—</span>
        )}
      </td>

      {/* Matchup Due Score */}
      <td className="py-3 px-3 text-right">
        <div className="flex flex-col items-end gap-1">
          <span
            className={`px-3 py-2 text-center text-[15px] font-black tracking-wider ${
              (p.matchup_due_score ?? p.due_score) >= 1.0
                ? 'text-[#FF4444]'
                : (p.matchup_due_score ?? p.due_score) < p.due_score
                  ? 'text-[#00D4FF]'
                  : cfg.color
            } font-rajdhani`}
            style={{
              textShadow:
                (p.matchup_due_score ?? p.due_score) >= 1.0
                  ? '0 0 8px rgba(255,68,68,0.5)'
                  : '',
            }}
          >
            {(p.matchup_due_score ?? p.due_score) > 0
              ? `${(p.matchup_due_score ?? p.due_score).toFixed(2)}x`
              : '—'}
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
          <span className="font-extrabold text-[23px] text-slate-400 font-rajdhani">
            {p.due_score > 0 ? `${p.due_score.toFixed(2)}x` : '—'}
          </span>
        </div>
      </td>
    </tr>
  );
});

export default function HRTrackerPage() {
  const router = useRouter();
  const season = new Date().getFullYear();
  const [sortKey, setSortKey] = useState<SortKey>('due_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [mounted, setMounted] = useState(false);
  const deferredSearch = useDeferredValue(searchQuery);
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setVisibleCount(50);
  }, [sortKey, sortDir, deferredSearch, statusFilter]);

  const { data, error, isLoading, isValidating, mutate } = useSWR('/api/mlb/hr-tracker', fetcher, {
    refreshInterval: 300000, // revalidate hourly (cache itself refreshes daily)
    revalidateOnFocus: false,
    onError: (err) => logError('[hr-tracker] SWR fetch failed', err),
  });

  const players: HRPlayer[] = data?.players || EMPTY_ARRAY;
  const updatedAt: string = data?.updatedAt || '';
  const isStale: boolean = data?.stale === true;

  const handleSort = useCallback(
    (col: SortKey) => {
      if (sortKey === col) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortKey(col);
        setSortDir(col === 'full_name' ? 'asc' : 'desc');
      }
    },
    [sortKey]
  );

  const goToPlayer = useCallback(
    (playerId: number) => router.push(`/hub/MLB-ANALYTICS/players/${playerId}`),
    [router]
  );

  const filtered = useMemo(() => {
    let list = [...players];

    if (statusFilter !== 'ALL') {
      list = list.filter((p) => p.status === statusFilter);
    }

    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
      list = list.filter(
        (p) => p.full_name.toLowerCase().includes(q) || p.team_name.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortKey) {
        case 'due_score':
          va = a.due_score;
          vb = b.due_score;
          break;
        case 'matchup_due_score':
          va = a.matchup_due_score ?? a.due_score;
          vb = b.matchup_due_score ?? b.due_score;
          break;
        case 'hr':
          va = a.hr;
          vb = b.hr;
          break;
        case 'games_since_hr':
          va = a.games_since_hr ?? -1;
          vb = b.games_since_hr ?? -1;
          break;
        case 'games_per_hr':
          va = a.games_per_hr;
          vb = b.games_per_hr;
          break;
        case 'full_name':
          va = a.full_name;
          vb = b.full_name;
          break;
      }
      if (typeof va === 'string') {
        return sortDir === 'asc'
          ? va.localeCompare(vb as string)
          : (vb as string).localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return list;
  }, [players, statusFilter, deferredSearch, sortKey, sortDir]);

  // Top 5 most overdue for the spotlight section
  const spotlight = useMemo(
    () =>
      [...players]
        .filter((p) => p.due_score > 0)
        .sort((a, b) => b.due_score - a.due_score || b.hr - a.hr)
        .slice(0, 5),
    [players]
  );

  const statusCounts = useMemo(
    () => ({
      ALL: players.length,
      OVERDUE: players.filter((p) => p.status === 'OVERDUE').length,
      DUE: players.filter((p) => p.status === 'DUE').length,
      RECENT: players.filter((p) => p.status === 'RECENT').length,
      NO_HR: players.filter((p) => p.status === 'NO_HR').length,
    }),
    [players]
  );

  const colHeader = (col: SortKey, label: string, align: string = 'text-left', tooltip?: string) => {
    const active = sortKey === col;
    return (
      <th
        className={`${align} py-3 px-3 whitespace-nowrap`}
        aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
        style={{ fontFamily: '"Rajdhani", sans-serif' }}
        title={tooltip}
      >
        <button
          type="button"
          onClick={() => { try { navigator.vibrate(15); } catch(err) {} return handleSort(col); }}
          className="inline-flex items-center bg-transparent border-0 p-0 m-0 text-[17px] font-extrabold tracking-widest capitalize text-slate-400 cursor-pointer hover:text-[#00D4FF] transition-colors select-none focus:outline-none focus:text-[#00D4FF] min-h-[44px]"
          aria-label={`Sort by ${label}`}
        >
          {label}
          <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
        </button>
      </th>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
      <SEOHead
        title="MLB Home Run Tracker — Due Scores & Matchup Analysis | Smarter.Poker"
        description={`Track which MLB sluggers are statistically due for a home run. Daily-updated due scores, last HR dates, games since last HR, opponent pitcher HR/9, and park factor adjustments for the ${season} MLB season.`}
        canonical="/hub/MLB-ANALYTICS/hr-tracker"
        jsonLd={{
          '@type': 'Dataset',
          name: 'MLB Home Run Due Score Tracker',
          description:
            'Statistical tracker of MLB hitters most due for a home run based on games since last HR, HR/G rate, matchup, and park factors.',
          url: 'https://smarter.poker/hub/MLB-ANALYTICS/hr-tracker',
          creator: { '@type': 'Organization', name: 'Smarter.Poker', url: 'https://smarter.poker' },
          temporalCoverage: String(season),
          keywords: 'MLB home run tracker, HR due score, baseball home run prediction',
        }}
        ogImage="/images/mlb/og.png"
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
              <Zap
                size={20}
                className="text-[#FF4444]"
                style={{ filter: 'drop-shadow(0 0 4px rgba(255,68,68,0.8))' }}
              />
            </div>
            <div>
              <h1
                className="m-0 text-[40px] md:text-[51px] font-extrabold text-white tracking-widest capitalize"
                style={{
                  fontFamily: '"Rajdhani", sans-serif',
                  textShadow: '0 0 10px rgba(255,68,68,0.2)',
                }}
              >
                HR Tracker
              </h1>
              <p className="text-[17px] text-slate-500 font-bold tracking-widest capitalize flex items-center gap-2 flex-wrap">
                <span>
                  {isLoading || !mounted
                    ? 'Loading...'
                    : updatedAt
                      ? `Updated ${new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${new Date(updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                      : '—'}
                </span>
                {isStale && !isLoading && mounted && (
                  <span className="inline-flex items-center gap-1 text-[#FFB800] border border-[#FFB800]/50 bg-[#FFB800]/10 px-1.5 py-0.5 rounded">
                    <AlertTriangle size={10} /> Stale
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => { try { navigator.vibrate(15); } catch(err) {} return mutate(); }}
              disabled={isValidating}
              className="ml-auto text-[17px] font-extrabold text-slate-500 border border-[#3d4f5f] px-3 py-1.5 rounded-md tracking-widest capitalize hover:text-[#00D4FF] hover:border-[#00D4FF] transition-colors min-h-[44px] disabled:opacity-50 inline-flex items-center gap-2"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              <RefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} />
              {isValidating ? 'Syncing' : 'Refresh'}
            </button>
          </div>
          <p className="text-[23px] text-slate-400 font-bold tracking-wide">
            Track Which Hitters Are Statistically Overdue For A Home Run. Due Score = Games Since
            Last HR ÷ Career HR Rate.
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {/* Spotlight skeleton */}
            <div className="animate-pulse bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-5 mb-6">
              <div className="w-40 h-4 bg-[#3d4f5f] rounded mb-4" />
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-4 md:px-0">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="bg-[#1a2332] rounded-xl p-4 h-28" />
                ))}
              </div>
            </div>
            {/* Table skeleton */}
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="animate-pulse bg-[#0d1117] border border-[#3d4f5f] rounded-xl h-14 flex items-center px-4 gap-4"
                >
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
          <div className="bg-gradient-to-b from-[#FF4444]/10 to-[#0d1117] border-[2px] border-[#FF4444]/50 rounded-xl p-6 flex items-center gap-4">
            <AlertTriangle className="text-[#FF4444] w-8 h-8 shrink-0" />
            <div>
              <div
                className="text-[#FF4444] font-extrabold capitalize tracking-widest text-[23px]"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
              >
                Failed To Load HR Data
              </div>
              <div className="text-[#FF4444]/70 text-[21px] font-bold mt-1">
                The HR cache is temporarily unavailable. Try refreshing in a moment.
              </div>
              <button
                onClick={() => { try { navigator.vibrate(15); } catch(err) {} return mutate(); }}
                className="mt-3 text-[17px] font-extrabold text-[#FF4444] border border-[#FF4444]/60 px-4 py-2 rounded-md tracking-widest capitalize hover:bg-[#FF4444]/10 transition-colors min-h-[44px]"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Empty State — request succeeded but cache holds no rows (off-season or pending first refresh) */}
        {!isLoading && !error && players.length === 0 && (
          <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-10 text-center">
            <Zap size={32} className="text-[#3d4f5f] mx-auto mb-3" />
            <div
              className="text-slate-300 font-extrabold capitalize tracking-widest text-[23px]"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              No HR Data Yet
            </div>
            <div className="text-slate-500 text-[21px] font-bold mt-2 max-w-md mx-auto">
              The Home-Run Cache Is Refreshed Daily During The MLB Season. If The Season Is
              Underway, Check Back Shortly Or Tap Refresh.
            </div>
            <button
              onClick={() => { try { navigator.vibrate(15); } catch(err) {} return mutate(); }}
              className="mt-4 text-[17px] font-extrabold text-[#00D4FF] border border-[#00D4FF]/60 px-4 py-2 rounded-md tracking-widest capitalize hover:bg-[#00D4FF]/10 transition-colors min-h-[44px]"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              Refresh
            </button>
          </div>
        )}

        {!isLoading && !error && players.length > 0 && (
          <>
            {/* ── Spotlight: Most Due ─────────────────────────────── */}
            <div className="mb-8">
              <h2
                className="text-[23px] font-extrabold text-white mb-4 capitalize tracking-widest pl-2 border-l-[3px] border-[#FF4444] font-rajdhani"
              >
                Most Due For A Home Run
              </h2>
              <div className="flex flex-nowrap overflow-x-auto snap-x md:grid md:grid-cols-5 gap-3 px-4 md:px-0 pb-4 md:pb-0">
                {spotlight.map((p, idx) => {
                  const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.RECENT;
                  return (
                    <Link
                      key={p.player_id}
                      href={`/hub/MLB-ANALYTICS/players/${p.player_id}`}
                      className={`block shrink-0 w-[200px] md:w-auto snap-start bg-[#0d1117] border-[2px] ${cfg.border} rounded-xl p-4 ${cfg.glow} hover:scale-[1.02] transition-all relative overflow-hidden group`}
                      style={{ textDecoration: 'none' }}
                    >
                      {idx === 0 && (
                        <div
                          className="absolute top-2 right-2 text-[16px] font-extrabold text-[#FF4444] tracking-widest capitalize bg-[#FF4444]/10 px-1.5 py-0.5 rounded border border-[#FF4444]/30 font-rajdhani"
                        >
                          #1 Due
                        </div>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={playerHeadshot(p.player_id) || '/default-avatar.png'}
                        alt={p.full_name}
                        loading="lazy"
                        width={56}
                        height={56}
                        className="w-14 h-14 rounded-full object-cover border-[2px] border-[#3d4f5f] group-hover:border-current mb-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = '/default-avatar.png';
                        }}
                      />
                      <div
                        className={`text-[17px] font-extrabold tracking-widest capitalize ${cfg.color} mb-1 font-rajdhani`}
                      >
                        {cfg.icon} {cfg.label}
                      </div>
                      <div
                        className="text-white font-extrabold text-[23px] capitalize tracking-wide leading-tight  font-rajdhani"
                      >
                        {p.full_name}
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-[17px]">
                          <span className="text-slate-500 font-bold capitalize">Due Score</span>
                          <span className={`font-extrabold ${cfg.color}`}>
                            {p.due_score.toFixed(2)}x
                          </span>
                        </div>
                        <DueGauge score={p.due_score} />
                        <div className="flex justify-between text-[17px] mt-1">
                          <span className="text-slate-500 font-bold capitalize">Last HR</span>
                          <span className="text-slate-300 font-bold">
                            {formatDate(p.last_hr_date)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[17px]">
                          <span className="text-slate-500 font-bold capitalize">Games Since</span>
                          <span className="text-slate-300 font-bold">
                            {p.games_since_hr != null ? `${p.games_since_hr} Games` : '—'}
                          </span>
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
                  <Search
                    size={16}
                    style={{ filter: 'drop-shadow(0 0 2px rgba(0,212,255,0.5))' }}
                  />
                </div>
                <input
                  type="text"
                  aria-label="Search player or team"
                  placeholder="Search player or team..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-2.5 pl-10 pr-10 text-white font-extrabold text-[23px] tracking-widest capitalize focus:outline-none focus:border-[#00D4FF] focus:shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all placeholder:text-slate-600"
                />
                {searchQuery && (
                  <button
                    onClick={() => { try { navigator.vibrate(15); } catch(err) {} return setSearchQuery(''); }}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors min-h-[44px]"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Status filter pills */}
              <div className="flex gap-2 flex-wrap">
                {(['ALL', 'OVERDUE', 'DUE', 'RECENT', 'NO_HR'] as const).map((s) => {
                  const cfg = s === 'ALL' ? null : STATUS_CONFIG[s];
                  const count = statusCounts[s as keyof typeof statusCounts];
                  return (
                    <button
                      key={s}
                      onClick={() => { try { navigator.vibrate(15); } catch(err) {} return setStatusFilter(s); }}
                      aria-pressed={statusFilter === s}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-extrabold text-[18px] tracking-widest capitalize transition-all border-[2px] whitespace-nowrap font-rajdhani ${
                        statusFilter === s
                          ? cfg
                            ? `${cfg.bg} ${cfg.border} ${cfg.color} ${cfg.glow}`
                            : 'bg-[#00D4FF]/10 border-[#00D4FF] text-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                          : 'bg-[#0d1117] border-[#3d4f5f] text-slate-500 hover:border-[#4b637a]'
                      }`}
                    >
                      {cfg && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
                      {s === 'ALL' ? 'All' : (cfg?.label ?? s)}{' '}
                      <span className="opacity-60">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Results count ────────────────────────────────────── */}
            <div
              className="text-[17px] text-slate-600 font-extrabold tracking-widest capitalize mb-3 font-rajdhani"
            >
              {filtered.length} Players · Sorted By {SORT_LABELS[sortKey]}{' '}
              {sortDir === 'desc' ? '↓' : '↑'}
            </div>

            {/* ── Table ────────────────────────────────────────────── */}
            <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
              {/* Table header — scrollable on mobile */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead className="bg-[#1a2332] border-b border-[#3d4f5f]">
                    <tr>
                      <th
                        className="text-left py-3 px-3 whitespace-nowrap sticky left-0 z-20 bg-[#1a2332]"
                        aria-sort={sortKey === 'full_name' ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                      >
                        <button
                          type="button"
                          onClick={() => { try { navigator.vibrate(15); } catch(err) {} return handleSort('full_name'); }}
                          className="inline-flex items-center bg-transparent border-0 p-0 m-0 text-[17px] font-extrabold tracking-widest capitalize text-slate-400 cursor-pointer hover:text-[#00D4FF] transition-colors select-none focus:outline-none focus:text-[#00D4FF] font-rajdhani min-h-[44px]"
                          aria-label="Sort by Player"
                        >
                          Player
                          <SortIcon col="full_name" sortKey={sortKey} sortDir={sortDir} />
                        </button>
                      </th>
                      <th
                        className="text-center py-3 px-3 text-[17px] font-extrabold tracking-widest capitalize text-slate-400 font-rajdhani"
                        title="Player's HR Due Status"
                      >
                        Status
                      </th>
                      {colHeader('hr', 'HR', 'text-right', 'Total Home Runs')}
                      {colHeader('games_per_hr', 'Games/HR', 'text-right', 'Average Games Per Home Run')}
                      {colHeader('games_since_hr', 'Since HR', 'text-right', 'Games Played Since Last Home Run')}
                      <th
                        className="text-right py-3 px-3 text-[17px] font-extrabold tracking-widest capitalize text-slate-400 font-rajdhani"
                        title="Opponent Pitcher Context"
                      >
                        Matchup
                      </th>
                      {colHeader('matchup_due_score', 'Matchup Due', 'text-right', 'Due Score Adjusted for Pitcher & Park')}
                      {colHeader('due_score', 'Raw Due', 'text-right', 'Raw Due Score (Games Since HR ÷ Games/HR)')}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#3d4f5f]/50">
                    {filtered.slice(0, visibleCount).map((p) => (
                      <PlayerRow key={p.player_id} p={p} />
                    ))}
                  </tbody>
                </table>
              </div>

              {visibleCount < filtered.length && (
                <div className="p-4 border-t border-[#3d4f5f]/50 flex justify-center">
                  <button
                    onClick={() => { try { navigator.vibrate(15); } catch(err) {} return setVisibleCount((prev) => prev + 50); }}
                    className="text-[17px] font-extrabold tracking-widest capitalize text-[#00D4FF] border border-[#00D4FF]/40 rounded-md px-6 py-2.5 hover:bg-[#00D4FF]/10 transition-colors min-h-[44px]"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    Load More
                  </button>
                </div>
              )}

              {filtered.length === 0 && (
                <div className="py-16 text-center">
                  <Search size={32} className="text-[#3d4f5f] mx-auto mb-3" />
                  <div
                    className="text-slate-500 font-extrabold capitalize tracking-widest text-[23px] font-rajdhani"
                  >
                    No Players Found
                  </div>
                  <div className="text-slate-600 text-[21px] font-bold mt-1">
                    Try a different search or status filter.
                  </div>
                </div>
              )}
            </div>

            {/* ── Legend ───────────────────────────────────────────── */}
            <div className="mt-6 bg-[#0d1117] border border-[#3d4f5f] rounded-xl p-4 flex flex-wrap gap-6">
              <div>
                <div
                  className="text-[17px] text-slate-500 font-extrabold tracking-widest capitalize mb-2 font-rajdhani"
                >
                  How To Read This
                </div>
                <div className="space-y-1.5 text-[18px] text-slate-400 font-bold">
                  <div>
                    <span className="text-[#FF4444] font-extrabold">Overdue</span> — Due Score &gt;
                    1.25x their average rate
                  </div>
                  <div>
                    <span className="text-[#FFB800] font-extrabold">Due</span> — Due Score between
                    0.75x – 1.25x
                  </div>
                  <div>
                    <span className="text-[#00D4FF] font-extrabold">Recent</span> — Hit a HR
                    recently, below their average rate
                  </div>
                  <div>
                    <span className="text-slate-300 font-extrabold">Due Score</span> = Games Since
                    Last HR ÷ (Games Played ÷ Total HR)
                  </div>
                  <div>
                    <span className="text-slate-300 font-extrabold">Matchup Due</span> = Raw Due
                    adjusted for opponent pitcher HR/9 and ballpark
                  </div>
                </div>
              </div>
              <div>
                <div
                  className="text-[17px] text-slate-500 font-extrabold tracking-widest capitalize mb-2"
                  style={{ fontFamily: '"Rajdhani", sans-serif' }}
                >
                  Data Source
                </div>
                <div className="text-[18px] text-slate-400 font-bold">
                  MLB Stats API — Live {season} season stats.
                  <br />
                  Game log scanned for last HR date. <br />
                  Cache refreshes daily; page checks hourly.
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
