import { useRouter } from 'next/router';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Info,
  Swords,
  Activity,
  Target,
  Shield,
  Zap,
  TrendingUp,
  BarChart3,
  DollarSign,
  CloudSun,
  ClipboardList,
} from 'lucide-react';
import MetalFrame from '../../../../src/components/ui/MetalFrame';
import SectionHeader from '../../../../src/components/ui/SectionHeader';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { useState, useEffect } from 'react';
import { logError } from '@/utils/logger';
import { glossaryFor } from '../../../../src/lib/mlbStatGlossary';
import HrBetTracker from '../../../../src/components/mlb/HrBetTracker';

const MLB_TEAMS: Record<number, string> = {
  108: 'Los Angeles Angels',
  109: 'Arizona Diamondbacks',
  110: 'Baltimore Orioles',
  111: 'Boston Red Sox',
  112: 'Chicago Cubs',
  113: 'Cincinnati Reds',
  114: 'Cleveland Guardians',
  115: 'Colorado Rockies',
  116: 'Detroit Tigers',
  117: 'Houston Astros',
  118: 'Kansas City Royals',
  119: 'Los Angeles Dodgers',
  120: 'Washington Nationals',
  121: 'New York Mets',
  133: 'Athletics',
  134: 'Pittsburgh Pirates',
  135: 'San Diego Padres',
  136: 'Seattle Mariners',
  137: 'San Francisco Giants',
  138: 'St. Louis Cardinals',
  139: 'Tampa Bay Rays',
  140: 'Texas Rangers',
  141: 'Toronto Blue Jays',
  142: 'Minnesota Twins',
  143: 'Philadelphia Phillies',
  144: 'Atlanta Braves',
  145: 'Chicago White Sox',
  146: 'Miami Marlins',
  147: 'New York Yankees',
  158: 'Milwaukee Brewers',
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err: any = new Error(`HTTP error! status: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

type Fmt = 'rate' | 'pct' | 'n2' | 'n1' | 'int' | 'ip';
const fmt = (kind: Fmt, v: any): string => {
  if (v == null || v === '' || isNaN(Number(v))) return '—';
  const n = Number(v);
  switch (kind) {
    case 'rate':
      return n.toFixed(3).replace(/^(-?)0\./, '$1.');
    case 'pct':
      return `${(n * 100).toFixed(1)}%`;
    case 'n2':
      return n.toFixed(2);
    case 'n1':
      return n.toFixed(1);
    case 'int':
      return String(Math.round(n));
    case 'ip':
      return String(v);
  }
};
const calcAge = (birth: any): number | null => {
  if (!birth) return null;
  const d = new Date(birth);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
};

// R/L/S batting or throwing hand -> full word.
const handed = (c?: string) =>
  c === 'R' ? 'Right' : c === 'L' ? 'Left' : c === 'S' ? 'Switch' : c || '—';

// 1 -> "1st", 2 -> "2nd", etc. (batting-order display).
const ordinal = (n: any): string => {
  const x = Number(n);
  if (!x || isNaN(x)) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = x % 100;
  return x + (s[(v - 20) % 10] || s[v] || s[0]);
};

type Stat = [string, string, Fmt];
const HITTER_GROUPS: { title: string; icon: any; stats: Stat[] }[] = [
  {
    title: 'Standard',
    icon: BarChart3,
    stats: [
      ['G', 'G', 'int'],
      ['PA', 'PA', 'int'],
      ['AB', 'AB', 'int'],
      ['H', 'H', 'int'],
      ['2B', '2B', 'int'],
      ['3B', '3B', 'int'],
      ['HR', 'HR', 'int'],
      ['R', 'R', 'int'],
      ['RBI', 'RBI', 'int'],
      ['SB', 'SB', 'int'],
      ['BB', 'BB', 'int'],
      ['SO', 'SO', 'int'],
      ['AVG', 'AVG', 'rate'],
      ['OBP', 'OBP', 'rate'],
      ['SLG', 'SLG', 'rate'],
      ['OPS', 'OPS', 'rate'],
    ],
  },
  {
    title: 'Advanced',
    icon: Activity,
    stats: [
      ['wRC+', 'wRC+', 'int'],
      ['wOBA', 'wOBA', 'rate'],
      ['xwOBA', 'xwOBA', 'rate'],
      ['ISO', 'ISO', 'rate'],
      ['BABIP', 'BABIP', 'rate'],
      ['BB%', 'BB%', 'pct'],
      ['K%', 'K%', 'pct'],
      ['WAR', 'WAR', 'n1'],
      ['Clutch', 'Clutch', 'n2'],
      ['BsR', 'wBsR', 'n1'],
      ['Spd', 'Spd', 'n1'],
    ],
  },
  {
    title: 'Statcast & Batted Ball',
    icon: Zap,
    stats: [
      ['EV', 'EV', 'n1'],
      ['maxEV', 'maxEV', 'n1'],
      ['Barrel%', 'Barrel%', 'pct'],
      ['HardHit%', 'HardHit%', 'pct'],
      ['LA', 'LA', 'n1'],
      ['GB%', 'GB%', 'pct'],
      ['FB%', 'FB%', 'pct'],
      ['LD%', 'LD%', 'pct'],
      ['Pull%', 'Pull%', 'pct'],
      ['Cent%', 'Cent%', 'pct'],
      ['Oppo%', 'Oppo%', 'pct'],
      ['HR/FB', 'HR/FB', 'pct'],
    ],
  },
  {
    title: 'Plate Discipline',
    icon: Target,
    stats: [
      ['O-Swing%', 'O-Swing%', 'pct'],
      ['Z-Swing%', 'Z-Swing%', 'pct'],
      ['Swing%', 'Swing%', 'pct'],
      ['Contact%', 'Contact%', 'pct'],
      ['SwStr%', 'SwStr%', 'pct'],
      ['Zone%', 'Zone%', 'pct'],
      ['F-Strike%', 'F-Strike%', 'pct'],
    ],
  },
];
const PITCHER_GROUPS: { title: string; icon: any; stats: Stat[] }[] = [
  {
    title: 'Standard',
    icon: BarChart3,
    stats: [
      ['W', 'W', 'int'],
      ['L', 'L', 'int'],
      ['SV', 'SV', 'int'],
      ['HLD', 'HLD', 'int'],
      ['G', 'G', 'int'],
      ['GS', 'GS', 'int'],
      ['IP', 'IP', 'ip'],
      ['QS', 'QS', 'int'],
      ['H', 'H', 'int'],
      ['ER', 'ER', 'int'],
      ['HR', 'HR', 'int'],
      ['BB', 'BB', 'int'],
      ['SO', 'SO', 'int'],
      ['ERA', 'ERA', 'n2'],
      ['WHIP', 'WHIP', 'n2'],
    ],
  },
  {
    title: 'Run Prevention',
    icon: Shield,
    stats: [
      ['FIP', 'FIP', 'n2'],
      ['xFIP', 'xFIP', 'n2'],
      ['SIERA', 'SIERA', 'n2'],
      ['xERA', 'xERA', 'n2'],
      ['K/9', 'K/9', 'n2'],
      ['BB/9', 'BB/9', 'n2'],
      ['HR/9', 'HR/9', 'n2'],
      ['K%', 'K%', 'pct'],
      ['BB%', 'BB%', 'pct'],
      ['K-BB%', 'K-BB%', 'pct'],
      ['LOB%', 'LOB%', 'pct'],
      ['BABIP', 'BABIP', 'rate'],
      ['WAR', 'WAR', 'n1'],
    ],
  },
  {
    title: 'Stuff & Batted Ball',
    icon: Zap,
    stats: [
      ['Stuff+', 'sp_stuff', 'int'],
      ['Location+', 'sp_location', 'int'],
      ['Pitching+', 'sp_pitching', 'int'],
      ['EV', 'EV', 'n1'],
      ['Barrel%', 'Barrel%', 'pct'],
      ['HardHit%', 'HardHit%', 'pct'],
      ['GB%', 'GB%', 'pct'],
      ['FB%', 'FB%', 'pct'],
      ['SwStr%', 'SwStr%', 'pct'],
      ['Contact%', 'Contact%', 'pct'],
    ],
  },
];

const MetricTile = ({
  label,
  value,
  tip,
  accent,
}: {
  label: string;
  value: string;
  tip?: string;
  accent?: boolean;
}) => (
  <div
    className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] text-center"
    title={tip}
  >
    <div className="flex items-center justify-center gap-1 mb-1">
      <span className="text-[13px] font-extrabold text-slate-400 tracking-widest">{label}</span>
      {tip ? <Info size={10} className="text-slate-600 shrink-0" aria-hidden="true" /> : null}
    </div>
    <div
      className={`text-xl font-extrabold ${accent ? 'text-[#00D4FF]' : 'text-white'}`}
      style={{ fontFamily: '"Rajdhani", sans-serif' }}
    >
      {value}
    </div>
  </div>
);

const StatGroup = ({
  title,
  icon,
  stats,
  season,
}: {
  title: string;
  icon: any;
  stats: Stat[];
  season: any;
}) => (
  <div className="mb-8">
    <SectionHeader icon={icon} label={title} />
    <MetalFrame className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)]">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {stats.map(([label, key, kind]) => (
          <MetricTile
            key={label}
            label={label}
            value={fmt(kind, season ? season[key] : null)}
            tip={glossaryFor(label)}
          />
        ))}
      </div>
    </MetalFrame>
  </div>
);

export default function PlayerProfilePage() {
  const router = useRouter();
  const { id } = router.query;

  const { data, error, isLoading } = useSWR(id ? `/api/mlb/players/${id}` : null, fetcher, {
    refreshInterval: 300000,
    revalidateOnFocus: false,
  });

  const headshotUrl = id
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
    : '/default-avatar.png';
  const [imgSrc, setImgSrc] = useState(headshotUrl);
  useEffect(() => {
    setImgSrc(headshotUrl);
  }, [headshotUrl]);

  const status = (error as any)?.status;
  const isNotFound = !!error && status === 404;

  if (error || data?.error) {
    if (!isNotFound)
      logError('UI Error', error || (typeof data !== 'undefined' ? data?.error : null));
    return (
      <div className="min-h-screen bg-[#0a0a15] pb-[70px] w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
        <UniversalHeader
          pageDepth={2}
          onBackClick={() => router.push('/hub/MLB-ANALYTICS/players')}
        />
        <MlbSubNav />
        <div className="p-8 text-center mt-10">
          <div
            className="text-slate-300 font-extrabold text-2xl tracking-widest"
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
          >
            {isNotFound ? 'Player Not Found' : 'Error Loading Player'}
          </div>
          <p className="text-slate-500 text-sm font-bold tracking-wide mt-2">
            {isNotFound
              ? 'No profile exists for this player ID.'
              : 'Something went wrong loading this profile. Please try again.'}
          </p>
          <Link
            href="/hub/MLB-ANALYTICS/players"
            className="text-[#00D4FF] underline mt-4 inline-block font-bold"
          >
            Return to Database
          </Link>
        </div>
        <BottomNavBar />
      </div>
    );
  }

  const player = data?.player;
  const type: 'hitter' | 'pitcher' = data?.type === 'pitcher' ? 'pitcher' : 'hitter';
  const season = data?.season || null;
  const sim =
    data?.profile?.sim_rates && typeof data.profile.sim_rates === 'object'
      ? data.profile.sim_rates
      : null;
  const streaks =
    data?.profile?.streaks && typeof data.profile.streaks === 'object'
      ? data.profile.streaks
      : null;
  const matchup = data?.matchup || null;

  const teamName = player?.team_id ? MLB_TEAMS[player.team_id] : null;
  const age = player ? calcAge(player.birth_date) : null;
  const hasStreaks = !!streaks && Number(streaks.games || 0) > 0;
  const last5: any[] = Array.isArray(streaks?.last5) ? streaks.last5 : [];
  const hotCold: string | null = streaks?.hot_cold || null;
  const groups = type === 'pitcher' ? PITCHER_GROUPS : HITTER_GROUPS;

  // Lineup/pitching role badge. Hitters: regular -> Starter, bench -> Backup (PA fallback).
  // Pitchers: mostly-starts -> Starting Pitcher; else 10+ saves -> Closer; else Reliever.
  const roleLabel: string | null = (() => {
    if (!player) return null;
    if (type === 'pitcher') {
      if (!season) return null;
      const gs = Number(season.GS) || 0;
      const g = Number(season.G) || 0;
      const sv = Number(season.SV) || 0;
      if (g > 0 && gs / g >= 0.5) return 'Starting Pitcher';
      if (sv >= 10) return 'Closer';
      return 'Reliever';
    }
    if (player.player_class === 'regular') return 'Starter';
    if (player.player_class === 'bench') return 'Backup';
    return (Number(season?.PA) || 0) >= 300 ? 'Starter' : 'Backup';
  })();

  const firstPitchET = matchup?.first_pitch_utc
    ? new Date(matchup.first_pitch_utc).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
      }) + ' ET'
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
      <SEOHead
        title={
          player
            ? `${player.full_name} — MLB ${type === 'pitcher' ? 'Pitcher' : 'Hitter'} Analytics & Stats | Smarter.Poker`
            : 'MLB Player Profile | Smarter.Poker'
        }
        description={
          player
            ? `Complete ${type === 'pitcher' ? 'pitching' : 'hitting'} stats, advanced metrics, model projections, recent form, and today's matchup for ${player.full_name} — 2026 MLB season.`
            : "In-depth MLB player analytics, full stat lines, model projections, and today's matchup."
        }
        ogImage="/images/mlb/og.png"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: player?.full_name || 'MLB Player',
          jobTitle: type === 'pitcher' ? 'Baseball Pitcher' : 'Baseball Hitter',
          ...(teamName ? { memberOf: { '@type': 'SportsTeam', name: teamName } } : {}),
        }}
      />

      <UniversalHeader
        pageDepth={2}
        onBackClick={() => router.push('/hub/MLB-ANALYTICS/players')}
      />
      <MlbSubNav />

      <div className="p-4 w-full max-w-4xl mx-auto box-border relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[150px] opacity-[0.05] pointer-events-none"></div>

        {isLoading || !player ? (
          <div className="animate-pulse">
            <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-6 mb-6 flex flex-col md:flex-row items-center gap-6">
              <div className="w-32 h-32 rounded-full bg-[#1a2332] border-[3px] border-[#3d4f5f] shrink-0" />
              <div className="flex-1 text-center md:text-left space-y-3 w-full">
                <div className="w-24 h-5 bg-[#1a2332] rounded mx-auto md:mx-0" />
                <div className="w-64 h-10 bg-[#1a2332] rounded mx-auto md:mx-0" />
                <div className="w-40 h-4 bg-[#1a2332] rounded mx-auto md:mx-0" />
              </div>
            </div>
            <div className="w-40 h-5 bg-[#3d4f5f] rounded mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3 h-16" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <MetalFrame className="p-6 mb-6">
              <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                <div className="relative w-32 h-32 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgSrc}
                    onError={() => setImgSrc('/default-avatar.png')}
                    alt={player.full_name}
                    loading="lazy"
                    width={128}
                    height={128}
                    className="w-32 h-32 rounded-full object-cover bg-[#1a2332] border-[3px] border-[#00D4FF] shadow-[0_0_20px_rgba(0,212,255,0.4),inset_0_4px_8px_rgba(0,0,0,0.8)]"
                  />
                  {player.team_id && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://www.mlbstatic.com/team-logos/${player.team_id}.svg`}
                      alt={teamName || 'Team'}
                      loading="lazy"
                      width={40}
                      height={40}
                      className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#0d1117] rounded-full p-1 border-[2px] border-[#3d4f5f]"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="inline-block bg-[#1a2332] border border-[#3d4f5f] px-3 py-1 rounded-sm text-[13px] font-extrabold text-[#00D4FF] tracking-widest mb-2">
                    {type === 'pitcher' ? 'Pitcher Profile' : 'Hitter Profile'}
                  </div>
                  <h1
                    className="m-0 text-3xl md:text-5xl font-extrabold text-white tracking-wide"
                    style={{
                      fontFamily: '"Rajdhani", sans-serif',
                      textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                    }}
                  >
                    {player.full_name}
                  </h1>
                  <div className="flex items-center justify-center md:justify-start gap-2 mt-3 flex-wrap">
                    {teamName && (
                      <span className="text-slate-300 font-bold text-[14px] tracking-widest">
                        {teamName}
                      </span>
                    )}
                    {player.position && (
                      <span
                        className="bg-[#1a2332] border border-[#3d4f5f] px-2 py-0.5 rounded text-[13px] font-extrabold text-slate-300 tracking-widest"
                        title="Field position"
                      >
                        {player.position}
                      </span>
                    )}
                    {roleLabel && (
                      <span
                        className="bg-[#00D4FF]/10 border border-[#00D4FF]/40 px-2 py-0.5 rounded text-[13px] font-extrabold text-[#00D4FF] tracking-widest"
                        title={type === 'pitcher' ? 'Pitching role' : 'Lineup role'}
                      >
                        {roleLabel}
                      </span>
                    )}
                    {(player.bats || player.throws) && (
                      <span
                        className="bg-[#1a2332] border border-[#3d4f5f] px-2 py-0.5 rounded text-[13px] font-extrabold text-slate-400 tracking-widest"
                        title="Which side the batter hits from / which hand the player throws with"
                      >
                        Bats {handed(player.bats)} · Throws {handed(player.throws)}
                      </span>
                    )}
                    {age != null && (
                      <span className="bg-[#1a2332] border border-[#3d4f5f] px-2 py-0.5 rounded text-[13px] font-extrabold text-slate-400 tracking-widest">
                        Age {age}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </MetalFrame>

            <div className="mb-8">
              <SectionHeader icon={Swords} label="Today's Matchup" />
              <MetalFrame className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)]">
                {!matchup ? (
                  <div className="text-slate-500 font-bold text-sm tracking-wide py-2">
                    No upcoming game scheduled.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://www.mlbstatic.com/team-logos/${matchup.opp_team_id}.svg`}
                        alt={matchup.opp_team_name}
                        loading="lazy"
                        width={40}
                        height={40}
                        className="w-10 h-10 object-contain"
                      />
                      <div>
                        <div
                          className="text-white font-extrabold text-lg tracking-wide"
                          style={{ fontFamily: '"Rajdhani", sans-serif' }}
                        >
                          {matchup.is_home ? 'vs' : '@'} {matchup.opp_team_name}
                        </div>
                        <div className="text-slate-500 text-[13px] font-bold tracking-wide">
                          {matchup.date}
                          {firstPitchET ? ` • First Pitch ${firstPitchET}` : ''}
                        </div>
                      </div>
                    </div>

                    {(matchup.weather || (type === 'hitter' && matchup.lineup !== undefined)) && (
                      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {matchup.weather && (
                          <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <CloudSun size={15} className="text-[#FFB800]" />
                              <span className="text-[13px] font-extrabold text-slate-400 tracking-widest">Conditions</span>
                            </div>
                            <div className="text-white font-bold text-[14px] leading-snug mb-1">{matchup.weather.summary}</div>
                            <div className="text-slate-500 text-[13px] font-bold">
                              {matchup.weather.temp_f != null ? `${Math.round(matchup.weather.temp_f)}°F` : '—'}
                              {matchup.weather.wind_mph != null ? ` · Wind ${Math.round(matchup.weather.wind_mph)} mph` : ''}
                              {matchup.weather.humidity != null ? ` · ${Math.round(matchup.weather.humidity)}% RH` : ''}
                              {matchup.weather.roof_state ? ` · Roof ${matchup.weather.roof_state}` : ''}
                            </div>
                          </div>
                        )}
                        {type === 'hitter' && (
                          <div className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <ClipboardList size={15} className="text-[#00D4FF]" />
                              <span className="text-[13px] font-extrabold text-slate-400 tracking-widest">Today&apos;s Status</span>
                            </div>
                            {matchup.lineup ? (
                              <div className="text-white font-bold text-[14px] leading-snug">
                                {matchup.lineup.confirmed ? 'Confirmed Starter' : 'Projected Starter'} — Batting {ordinal(matchup.lineup.batting_order)}
                              </div>
                            ) : (
                              <div className="text-slate-400 font-bold text-[14px] leading-snug">Not In The Posted Lineup Yet</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {type === 'hitter' ? (
                      <>
                        {matchup.opp_pitcher_name && (
                          <div className="mb-3">
                            <div className="text-slate-400 text-[13px] font-extrabold tracking-widest mb-2">
                              Probable Pitcher:{' '}
                              <span className="text-white">{matchup.opp_pitcher_name}</span>
                              {matchup.opp_pitcher_throws
                                ? ` (${matchup.opp_pitcher_throws}HP)`
                                : ''}
                            </div>
                            {matchup.opp_pitcher_season && (
                              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
                                <MetricTile
                                  label="W-L"
                                  value={`${fmt('int', matchup.opp_pitcher_season.w)}-${fmt('int', matchup.opp_pitcher_season.l)}`}
                                />
                                <MetricTile
                                  label="ERA"
                                  value={fmt('n2', matchup.opp_pitcher_season.era)}
                                  tip={glossaryFor('ERA')}
                                />
                                <MetricTile
                                  label="WHIP"
                                  value={fmt('n2', matchup.opp_pitcher_season.whip)}
                                  tip={glossaryFor('WHIP')}
                                />
                                <MetricTile
                                  label="FIP"
                                  value={fmt('n2', matchup.opp_pitcher_season.fip)}
                                  tip={glossaryFor('FIP')}
                                />
                                <MetricTile
                                  label="K/9"
                                  value={fmt('n2', matchup.opp_pitcher_season.k9)}
                                  tip={glossaryFor('K/9')}
                                />
                              </div>
                            )}
                          </div>
                        )}
                        <div className="text-slate-400 text-[13px] font-extrabold tracking-widest mb-2">
                          {player.full_name} vs {matchup.opp_pitcher_name || 'This Pitcher'}{' '}
                          (Career)
                        </div>
                        {matchup.bvp ? (
                          <div className="grid grid-cols-4 gap-3">
                            <MetricTile
                              label="PA"
                              value={fmt('int', matchup.bvp.pa)}
                              tip={glossaryFor('PA')}
                              accent
                            />
                            <MetricTile
                              label="HR"
                              value={fmt('int', matchup.bvp.hr)}
                              tip={glossaryFor('HR')}
                            />
                            <MetricTile
                              label="wOBA"
                              value={fmt('rate', matchup.bvp.woba)}
                              tip={glossaryFor('wOBA')}
                            />
                            <MetricTile
                              label="K%"
                              value={fmt('pct', matchup.bvp.k_pct)}
                              tip={glossaryFor('K%')}
                            />
                          </div>
                        ) : (
                          <div className="text-slate-500 font-bold text-sm tracking-wide">
                            No prior plate appearances against this pitcher.
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-slate-400 text-[13px] font-extrabold tracking-widest mb-2">
                          {player.full_name} vs {matchup.opp_team_name} Lineup (Career)
                        </div>
                        {matchup.pvt ? (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            <MetricTile
                              label="PA"
                              value={fmt('int', matchup.pvt.pa)}
                              tip={glossaryFor('PA')}
                              accent
                            />
                            <MetricTile
                              label="ERA"
                              value={fmt('n2', matchup.pvt.era)}
                              tip={glossaryFor('ERA')}
                            />
                            <MetricTile
                              label="K/9"
                              value={fmt('n2', matchup.pvt.k9)}
                              tip={glossaryFor('K/9')}
                            />
                            <MetricTile
                              label="Lineup wOBA"
                              value={fmt('rate', matchup.pvt.lineup_woba)}
                              tip="The opposing lineup's collective wOBA — how dangerous they are as a group."
                            />
                          </div>
                        ) : (
                          <div className="text-slate-500 font-bold text-sm tracking-wide mb-4">
                            No prior data against this opponent.
                          </div>
                        )}
                        {matchup.opp_team_hitting && (
                          <>
                            <div className="text-slate-400 text-[13px] font-extrabold tracking-widest mb-2">
                              {matchup.opp_team_name} Offense (Season)
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <MetricTile
                                label="AVG"
                                value={fmt('rate', matchup.opp_team_hitting.avg)}
                                tip={glossaryFor('AVG')}
                              />
                              <MetricTile
                                label="OPS"
                                value={fmt('rate', matchup.opp_team_hitting.ops)}
                                tip={glossaryFor('OPS')}
                              />
                              <MetricTile
                                label="wRC+"
                                value={fmt('int', matchup.opp_team_hitting.wrc)}
                                tip={glossaryFor('wRC+')}
                              />
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {type === 'hitter' && matchup.opp_team_pitching && (
                      <div className="mt-4">
                        <div className="text-slate-400 text-[13px] font-extrabold tracking-widest mb-2">
                          {matchup.opp_team_name} Pitching Staff (Season)
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <MetricTile
                            label="ERA"
                            value={fmt('n2', matchup.opp_team_pitching.era)}
                            tip={glossaryFor('ERA')}
                          />
                          <MetricTile
                            label="WHIP"
                            value={fmt('n2', matchup.opp_team_pitching.whip)}
                            tip={glossaryFor('WHIP')}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </MetalFrame>
            </div>

            {type === 'hitter' && id && (
              <div className="mb-8">
                <SectionHeader icon={DollarSign} label="Your HR Bet Tracker" />
                <HrBetTracker
                  playerId={Number(id)}
                  playerName={player.full_name}
                  teamId={player.team_id}
                />
              </div>
            )}

            {groups.map((g) => (
              <StatGroup
                key={g.title}
                title={g.title}
                icon={g.icon}
                stats={g.stats}
                season={season}
              />
            ))}

            {sim && (
              <div className="mb-8">
                <SectionHeader
                  icon={Zap}
                  label={`Model Projection ${type === 'pitcher' ? '(Per Batter Faced)' : '(Per Plate Appearance)'}`}
                />
                <MetalFrame className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)]">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <MetricTile
                      label="K Rate"
                      value={fmt('pct', sim.k)}
                      tip="Projected strikeout rate from the simulation model."
                      accent
                    />
                    <MetricTile
                      label="BB Rate"
                      value={fmt('pct', sim.bb)}
                      tip="Projected walk rate from the simulation model."
                    />
                    <MetricTile
                      label="HR Rate"
                      value={fmt('pct', sim.hr)}
                      tip="Projected home-run rate from the simulation model."
                    />
                    <MetricTile
                      label="HBP Rate"
                      value={fmt('pct', sim.hbp)}
                      tip="Projected hit-by-pitch rate."
                    />
                    <MetricTile
                      label="BABIP"
                      value={fmt('rate', sim.babip)}
                      tip={glossaryFor('BABIP')}
                    />
                  </div>
                  <p className="text-slate-600 text-[13px] font-bold tracking-wide mt-3">
                    Projected outcome rates from the Smarter.Poker simulation engine, regressed for
                    sample size.
                  </p>
                </MetalFrame>
              </div>
            )}

            {hasStreaks && (
              <div className="mb-8">
                <SectionHeader icon={TrendingUp} label="Recent Form" />
                <MetalFrame className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)]">
                  {hotCold && (
                    <div className="mb-4">
                      <span
                        className="inline-block text-[13px] font-extrabold px-3 py-1 rounded-full tracking-widest"
                        style={{
                          fontFamily: '"Rajdhani", sans-serif',
                          background:
                            hotCold === 'hot'
                              ? 'rgba(255,120,40,0.15)'
                              : hotCold === 'cold'
                                ? 'rgba(60,120,255,0.15)'
                                : 'rgba(148,163,184,0.12)',
                          color:
                            hotCold === 'hot'
                              ? '#FF8C42'
                              : hotCold === 'cold'
                                ? '#5B9BFF'
                                : '#94A3B8',
                          border: `1px solid ${hotCold === 'hot' ? 'rgba(255,120,40,0.4)' : hotCold === 'cold' ? 'rgba(60,120,255,0.4)' : 'rgba(148,163,184,0.3)'}`,
                        }}
                      >
                        {hotCold} streak
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {type === 'hitter' ? (
                      <>
                        <MetricTile
                          label="Hit Streak"
                          value={fmt('int', streaks.current_hitting_streak)}
                          tip="Current consecutive games with a hit."
                        />
                        <MetricTile
                          label="On-Base Streak"
                          value={fmt('int', streaks.on_base_streak)}
                          tip="Current consecutive games reaching base."
                        />
                        <MetricTile
                          label="Multi-Hit Gms"
                          value={fmt('int', streaks.multi_hit_games)}
                          tip="Games this season with 2+ hits."
                        />
                        <MetricTile
                          label="Games Since HR"
                          value={fmt('int', streaks.games_since_hr)}
                          tip="Games since the last home run."
                        />
                      </>
                    ) : (
                      <>
                        <MetricTile
                          label="QS Streak"
                          value={fmt('int', streaks.quality_start_streak)}
                          tip="Current consecutive quality starts."
                        />
                        <MetricTile
                          label="Scoreless IP"
                          value={
                            streaks.scoreless_innings_streak != null
                              ? Number(streaks.scoreless_innings_streak).toFixed(1)
                              : '—'
                          }
                          tip="Current scoreless innings streak."
                        />
                        <MetricTile
                          label="High-K Gms"
                          value={fmt('int', streaks.high_k_games)}
                          tip="Games this season with a high strikeout total."
                        />
                        <MetricTile
                          label="Gms Since HR"
                          value={fmt('int', streaks.games_since_hr_allowed)}
                          tip="Games since allowing a home run."
                        />
                      </>
                    )}
                  </div>

                  {type === 'hitter' && last5.length > 0 && (
                    <div className="mt-5">
                      <div className="text-[13px] font-extrabold text-slate-500 tracking-widest mb-2">
                        Last 5 Games
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="text-slate-500 text-[13px] font-extrabold tracking-widest">
                              <th className="py-1 pr-3">Date</th>
                              <th className="py-1 px-2 text-center">AB</th>
                              <th className="py-1 px-2 text-center">H</th>
                              <th className="py-1 px-2 text-center">HR</th>
                              <th className="py-1 px-2 text-center">RBI</th>
                              <th className="py-1 px-2 text-center">BB</th>
                              <th className="py-1 px-2 text-center">K</th>
                            </tr>
                          </thead>
                          <tbody>
                            {last5.map((gm: any, i: number) => (
                              <tr
                                key={gm.date || i}
                                className="border-t border-[#1e2d3d] text-slate-300 text-[14px] font-bold"
                              >
                                <td className="py-1.5 pr-3 text-slate-400">{gm.date || '—'}</td>
                                <td className="py-1.5 px-2 text-center">{gm.AB ?? '—'}</td>
                                <td className="py-1.5 px-2 text-center text-white">
                                  {gm.H ?? '—'}
                                </td>
                                <td className="py-1.5 px-2 text-center text-[#00D4FF]">
                                  {gm.HR ?? '—'}
                                </td>
                                <td className="py-1.5 px-2 text-center">{gm.RBI ?? '—'}</td>
                                <td className="py-1.5 px-2 text-center">{gm.BB ?? '—'}</td>
                                <td className="py-1.5 px-2 text-center">{gm.K ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {type === 'pitcher' &&
                    streaks.last_start_line &&
                    typeof streaks.last_start_line === 'object' && (
                      <div className="mt-5">
                        <div className="text-[13px] font-extrabold text-slate-500 tracking-widest mb-2">
                          Last Start{streaks.last_start_date ? ` — ${streaks.last_start_date}` : ''}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <MetricTile
                            label="IP"
                            value={
                              streaks.last_start_line.IP != null
                                ? String(streaks.last_start_line.IP)
                                : '—'
                            }
                            tip={glossaryFor('IP')}
                          />
                          <MetricTile
                            label="K"
                            value={fmt('int', streaks.last_start_line.K)}
                            tip={glossaryFor('K')}
                          />
                          <MetricTile
                            label="BB"
                            value={fmt('int', streaks.last_start_line.BB)}
                            tip={glossaryFor('BB')}
                          />
                          <MetricTile
                            label="ER"
                            value={fmt('int', streaks.last_start_line.ER)}
                            tip={glossaryFor('ER')}
                          />
                        </div>
                      </div>
                    )}
                </MetalFrame>
              </div>
            )}
          </>
        )}
      </div>
      <BottomNavBar />
    </div>
  );
}
