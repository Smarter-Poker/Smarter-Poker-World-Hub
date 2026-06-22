import { useRouter } from 'next/router';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, User, Activity, Target, Shield, Info, Loader2 } from 'lucide-react';
import MetalFrame from '../../../../src/components/ui/MetalFrame';
import SectionHeader from '../../../../src/components/ui/SectionHeader';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { useState, useEffect } from 'react';
import { logError } from '@/utils/logger';

// Static team identity — keeps the profile self-contained (team name + structured data)
// without an extra round-trip to the standings feed.
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

// Formatters — explicit per-metric so we never guess scale from the column name.
const dec3 = (v: any) => (v == null || isNaN(Number(v)) ? '—' : Number(v).toFixed(3));
const dec2 = (v: any) => (v == null || isNaN(Number(v)) ? '—' : Number(v).toFixed(2));
const dec0 = (v: any) => (v == null || isNaN(Number(v)) ? '—' : Number(v).toFixed(0));
const pct1 = (v: any) => (v == null || isNaN(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(1)}%`);
const mph1 = (v: any) => (v == null || isNaN(Number(v)) ? '—' : `${Number(v).toFixed(1)} mph`);

const calcAge = (birth: any): number | null => {
  if (!birth) return null;
  const d = new Date(birth);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
};

// A labelled metric tile with a hover/long-press explanation (native title + Info marker).
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
    className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
    title={tip}
  >
    <div className="flex items-center gap-1 mb-1">
      <span className="text-[13px] font-extrabold text-slate-400 tracking-widest capitalize">
        {label}
      </span>
      {tip ? <Info size={10} className="text-slate-600 shrink-0" aria-hidden="true" /> : null}
    </div>
    <div
      className={`text-[23px] font-extrabold ${accent ? 'text-[#00D4FF]' : 'text-white'}`}
      style={{ fontFamily: '"Rajdhani", sans-serif' }}
    >
      {value}
    </div>
  </div>
);

export default function PlayerProfilePage() {
  const router = useRouter();
  const { id } = router.query;

  const { data, error, isLoading } = useSWR(id ? `/api/mlb/players/${id}` : null, fetcher, {
    refreshInterval: 300000, // 5 min — player stats update on the nightly pipeline
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

  // Error / not-found states (a 404 from the API throws, so it lands here).
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
            className="text-slate-300 font-extrabold text-[31px] capitalize tracking-widest"
            style={{ fontFamily: '"Rajdhani", sans-serif' }}
          >
            {isNotFound ? 'Player Not Found' : 'Error Loading Player'}
          </div>
          <p className="text-slate-500 text-[18px] font-bold tracking-wide mt-2">
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

  const profile = data?.profile;
  const type = data?.type; // 'hitter' or 'pitcher'

  const teamName = profile?.team_id ? MLB_TEAMS[profile.team_id] : null;
  const age = profile ? calcAge(profile.birth_date) : null;
  const sim =
    profile?.sim_rates && typeof profile.sim_rates === 'object' ? profile.sim_rates : null;
  const streaks = profile?.streaks && typeof profile.streaks === 'object' ? profile.streaks : null;
  const hasStreaks = !!streaks && Number(streaks.games || 0) > 0;
  const last5: any[] = Array.isArray(streaks?.last5) ? streaks.last5 : [];
  const hotCold: string | null = streaks?.hot_cold || null;

  return (
    <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
      <SEOHead
        title={
          profile
            ? `${profile.full_name} — MLB ${type === 'pitcher' ? 'Pitcher' : 'Hitter'} Analytics & Stats | Smarter.Poker`
            : 'MLB Player Profile | Smarter.Poker'
        }
        description={
          profile
            ? `Advanced analytics for ${profile.full_name}. ${type === 'pitcher' ? 'FIP, xFIP, SIERA, Stuff+, model projection rates, and recent form' : 'wRC+, wOBA, xwOBA, ISO, model projection rates, and recent form'} for the 2026 MLB season.`
            : 'In-depth MLB player analytics, advanced statistics, model projections, and recent form.'
        }
        ogImage="/images/mlb/og.png"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: profile?.full_name || 'MLB Player',
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
        {/* Background Glows */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[150px] opacity-[0.05] pointer-events-none"></div>

        <div className="mb-6">
          <Link
            href="/hub/MLB-ANALYTICS/players"
            className="inline-flex items-center gap-1 text-[#00D4FF] text-[13px] font-extrabold tracking-widest capitalize hover:text-white transition-colors mb-4"
          >
            <ArrowLeft size={14} /> Back to Database
          </Link>
        </div>

        {isLoading || !profile ? (
          <div className="flex-1 flex items-center justify-center min-h-[50vh]">
            <Loader2 className="w-12 h-12 text-[#00D4FF] animate-spin" />
          </div>
        ) : (
          <>
            {/* Hero Header */}
            <MetalFrame className="p-6 mb-6 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-[#00D4FF] shadow-[0_0_15px_rgba(0,212,255,0.8)]" />

              <div className="relative w-32 h-32 shrink-0 z-10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgSrc}
                  onError={() => setImgSrc('/default-avatar.png')}
                  alt={profile.full_name}
                  loading="lazy"
                  width={128}
                  height={128}
                  className="w-32 h-32 rounded-full object-cover bg-[#1a2332] border-[3px] border-[#00D4FF] shadow-[0_0_20px_rgba(0,212,255,0.4),inset_0_4px_8px_rgba(0,0,0,0.8)]"
                />
                {profile.team_id && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://www.mlbstatic.com/team-logos/${profile.team_id}.svg`}
                    alt={teamName || 'Team Logo'}
                    loading="lazy"
                    width={40}
                    height={40}
                    className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#0d1117] rounded-full p-1 border-[2px] border-[#3d4f5f] shadow-[0_4px_10px_rgba(0,0,0,0.8)]"
                  />
                )}
              </div>

              <div className="flex-1 text-center md:text-left z-10">
                <div className="inline-block bg-[#1a2332] border border-[#3d4f5f] px-3 py-1 rounded-sm text-[13px] font-extrabold text-[#00D4FF] tracking-widest capitalize mb-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                  {type === 'pitcher' ? 'Pitcher Profile' : 'Hitter Profile'}
                </div>
                <h1
                  className="m-0 text-[39px] md:text-5xl font-extrabold text-white tracking-widest capitalize"
                  style={{
                    fontFamily: '"Rajdhani", sans-serif',
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                  }}
                >
                  {profile.full_name}
                </h1>
                <div className="flex items-center justify-center md:justify-start gap-2 mt-3 flex-wrap">
                  {teamName && (
                    <span className="text-slate-300 font-bold text-[16px] tracking-widest capitalize">
                      {teamName}
                    </span>
                  )}
                  {(type === 'pitcher' ? profile.role : profile.position) && (
                    <span className="bg-[#1a2332] border border-[#3d4f5f] px-2 py-0.5 rounded text-[13px] font-extrabold text-slate-300 tracking-widest capitalize">
                      {type === 'pitcher' ? profile.role : profile.position}
                    </span>
                  )}
                  {(profile.bats || profile.throws) && (
                    <span className="bg-[#1a2332] border border-[#3d4f5f] px-2 py-0.5 rounded text-[13px] font-extrabold text-slate-400 tracking-widest capitalize">
                      B/T {profile.bats || '—'}/{profile.throws || '—'}
                    </span>
                  )}
                  {age != null && (
                    <span className="bg-[#1a2332] border border-[#3d4f5f] px-2 py-0.5 rounded text-[13px] font-extrabold text-slate-400 tracking-widest capitalize">
                      Age {age}
                    </span>
                  )}
                </div>
              </div>
            </MetalFrame>

            {/* Primary Ratings */}
            <SectionHeader icon={Target} label="Primary Ratings" />
            <MetalFrame className="p-4 sm:p-6 mb-8">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {type === 'hitter' ? (
                <>
                  <div
                    className="bg-black/20 border border-[#3d4f5f]/50 rounded-lg p-4 relative overflow-hidden"
                    title="Weighted Runs Created Plus — total offense vs league average (100 = average, higher is better)."
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-10 text-[#00D4FF]">
                      <Target size={40} />
                    </div>
                    <div className="text-[13px] font-extrabold text-slate-400 tracking-widest mb-1 capitalize">
                      wRC+
                    </div>
                    <div
                      className="text-[39px] font-extrabold text-[#00D4FF]"
                      style={{
                        fontFamily: '"Rajdhani", sans-serif',
                        textShadow: '0 0 10px rgba(0,212,255,0.3)',
                      }}
                    >
                      {dec0(profile.wrc_plus)}
                    </div>
                  </div>
                  <div
                    className="bg-black/20 border border-[#3d4f5f]/50 rounded-lg p-4 relative overflow-hidden"
                    title="Weighted On-Base Average — overall offensive value per plate appearance."
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-10 text-[#00D4FF]">
                      <Activity size={40} />
                    </div>
                    <div className="text-[13px] font-extrabold text-slate-400 tracking-widest mb-1 capitalize">
                      wOBA
                    </div>
                    <div
                      className="text-[39px] font-extrabold text-[#00D4FF]"
                      style={{
                        fontFamily: '"Rajdhani", sans-serif',
                        textShadow: '0 0 10px rgba(0,212,255,0.3)',
                      }}
                    >
                      {dec3(profile.woba)}
                    </div>
                  </div>
                  <div
                    className="bg-black/20 border border-[#3d4f5f]/50 rounded-lg p-4 relative overflow-hidden"
                    title="Plate appearances — sample size for the season."
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-10 text-slate-400">
                      <User size={40} />
                    </div>
                    <div className="text-[13px] font-extrabold text-slate-400 tracking-widest mb-1 capitalize">
                      Plate Appearances
                    </div>
                    <div
                      className="text-[39px] font-extrabold text-white"
                      style={{ fontFamily: '"Rajdhani", sans-serif' }}
                    >
                      {profile.pa != null ? dec0(profile.pa) : '—'}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="bg-black/20 border border-[#3d4f5f]/50 rounded-lg p-4 relative overflow-hidden"
                    title="Fielding Independent Pitching — ERA estimate from K, BB, HBP and HR only (lower is better)."
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-10 text-[#00D4FF]">
                      <Shield size={40} />
                    </div>
                    <div className="text-[13px] font-extrabold text-slate-400 tracking-widest mb-1 capitalize">
                      Fip
                    </div>
                    <div
                      className="text-[39px] font-extrabold text-[#00D4FF]"
                      style={{
                        fontFamily: '"Rajdhani", sans-serif',
                        textShadow: '0 0 10px rgba(0,212,255,0.3)',
                      }}
                    >
                      {dec2(profile.fip)}
                    </div>
                  </div>
                  <div
                    className="bg-black/20 border border-[#3d4f5f]/50 rounded-lg p-4 relative overflow-hidden"
                    title="Skill-Interactive ERA — ERA estimate accounting for batted-ball type (lower is better)."
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-10 text-[#00D4FF]">
                      <Activity size={40} />
                    </div>
                    <div className="text-[13px] font-extrabold text-slate-400 tracking-widest mb-1 capitalize">
                      Siera
                    </div>
                    <div
                      className="text-[39px] font-extrabold text-[#00D4FF]"
                      style={{
                        fontFamily: '"Rajdhani", sans-serif',
                        textShadow: '0 0 10px rgba(0,212,255,0.3)',
                      }}
                    >
                      {dec2(profile.siera)}
                    </div>
                  </div>
                  <div
                    className="bg-black/20 border border-[#3d4f5f]/50 rounded-lg p-4 relative overflow-hidden"
                    title="Batters faced — sample size for the season."
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-10 text-slate-400">
                      <User size={40} />
                    </div>
                    <div className="text-[13px] font-extrabold text-slate-400 tracking-widest mb-1 capitalize">
                      Batters Faced
                    </div>
                    <div
                      className="text-[39px] font-extrabold text-white"
                      style={{ fontFamily: '"Rajdhani", sans-serif' }}
                    >
                      {profile.bf != null ? dec0(profile.bf) : '—'}
                    </div>
                  </div>
                </>
              )}
              </div>
            </MetalFrame>

            {/* Advanced Metrics — curated, labelled, with explanations */}
            <SectionHeader icon={Activity} label="Advanced Metrics" />
            <MetalFrame className="p-4 sm:p-6 mb-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 md:px-0">
                {type === 'hitter' ? (
                  <>
                    <MetricTile
                      label="xwOBA"
                      value={dec3(profile.xwoba)}
                      tip="Expected wOBA from quality of contact (exit velocity & launch angle)."
                      accent
                    />
                    <MetricTile
                      label="Iso"
                      value={dec3(profile.iso)}
                      tip="Isolated Power — extra bases per at-bat (SLG minus AVG)."
                    />
                    <MetricTile
                      label="Barrel%"
                      value={pct1(profile.barrel_pct)}
                      tip="Share of batted balls hit at the optimal exit velocity and launch angle."
                    />
                    <MetricTile
                      label="Exit Velo"
                      value={mph1(profile.ev)}
                      tip="Average exit velocity off the bat."
                    />
                  </>
                ) : (
                  <>
                    <MetricTile
                      label="xFIP"
                      value={dec2(profile.xfip)}
                      tip="Expected FIP, normalizing home-run rate to league average (lower is better)."
                      accent
                    />
                    <MetricTile
                      label="Stuff+"
                      value={dec0(profile.stuff_plus)}
                      tip="Pitch-quality model (100 = average, higher is better)."
                    />
                    <MetricTile
                      label="Siera"
                      value={dec2(profile.siera)}
                      tip="Skill-Interactive ERA (lower is better)."
                    />
                    <MetricTile
                      label="Fip"
                      value={dec2(profile.fip)}
                      tip="Fielding Independent Pitching (lower is better)."
                    />
                  </>
                )}
              </div>
            </MetalFrame>

            {/* Model Projection Rates (sim_rates) */}
            {sim && (
              <>
                <SectionHeader icon={Target} label="Model Projection" />
                <p className="text-slate-400 text-[13px] font-bold tracking-widest capitalize mb-4 px-4 md:px-0">
                  {type === 'pitcher' ? '(per batter faced)' : '(per plate appearance)'}
                </p>
                <MetalFrame className="p-4 sm:p-6 mb-8">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 px-4 md:px-0">
                    <MetricTile
                      label="K Rate"
                      value={pct1(sim.k)}
                      tip="Projected strikeout rate from the simulation model."
                      accent
                    />
                    <MetricTile
                      label="BB Rate"
                      value={pct1(sim.bb)}
                      tip="Projected walk rate from the simulation model."
                    />
                    <MetricTile
                      label="HR Rate"
                      value={pct1(sim.hr)}
                      tip="Projected home-run rate from the simulation model."
                    />
                    <MetricTile
                      label="HBP Rate"
                      value={pct1(sim.hbp)}
                      tip="Projected hit-by-pitch rate."
                    />
                    <MetricTile
                      label="Babip"
                      value={dec3(sim.babip)}
                      tip="Projected batting average on balls in play."
                    />
                  </div>
                  <p className="text-slate-600 text-[13px] font-bold tracking-wide mt-3">
                    Projected outcome rates from the Smarter.Poker simulation engine, regressed for
                    sample size.
                  </p>
                </MetalFrame>
              </>
            )}

            {/* Recent Form (streaks) */}
            {hasStreaks && (
              <>
                <SectionHeader icon={Activity} label="Recent Form" />
                <MetalFrame className="p-4 sm:p-6 mb-8">
                  {hotCold && (
                    <div className="mb-4">
                      <span
                        className="inline-block text-[14px] font-extrabold px-3 py-1 rounded-full tracking-widest capitalize"
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

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 md:px-0">
                    {type === 'hitter' ? (
                      <>
                        <MetricTile
                          label="Hit Streak"
                          value={dec0(streaks.current_hitting_streak)}
                          tip="Current consecutive games with a hit."
                        />
                        <MetricTile
                          label="On-Base Streak"
                          value={dec0(streaks.on_base_streak)}
                          tip="Current consecutive games reaching base."
                        />
                        <MetricTile
                          label="Multi-Hit Gms"
                          value={dec0(streaks.multi_hit_games)}
                          tip="Games this season with 2+ hits."
                        />
                        <MetricTile
                          label="Games Since HR"
                          value={dec0(streaks.games_since_hr)}
                          tip="Games since the last home run."
                        />
                      </>
                    ) : (
                      <>
                        <MetricTile
                          label="QS Streak"
                          value={dec0(streaks.quality_start_streak)}
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
                          value={dec0(streaks.high_k_games)}
                          tip="Games this season with a high strikeout total."
                        />
                        <MetricTile
                          label="Gms Since HR"
                          value={dec0(streaks.games_since_hr_allowed)}
                          tip="Games since allowing a home run."
                        />
                      </>
                    )}
                  </div>

                  {/* Hitter: last 5 games table */}
                  {type === 'hitter' && last5.length > 0 && (
                    <div className="mt-5">
                      <div className="text-[13px] font-extrabold text-slate-500 tracking-widest capitalize mb-2">
                        Last 5 Games
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="text-slate-500 text-[13px] font-extrabold tracking-widest capitalize">
                              <th className="py-1 pr-3 font-extrabold">Date</th>
                              <th className="py-1 px-2 text-center">Ab</th>
                              <th className="py-1 px-2 text-center">H</th>
                              <th className="py-1 px-2 text-center">Hr</th>
                              <th className="py-1 px-2 text-center">Rbi</th>
                              <th className="py-1 px-2 text-center">Bb</th>
                              <th className="py-1 px-2 text-center">K</th>
                            </tr>
                          </thead>
                          <tbody>
                            {last5.map((g: any, i: number) => (
                              <tr
                                key={g.date || i}
                                className="border-t border-[#1e2d3d] text-slate-300 text-[16px] font-bold"
                              >
                                <td className="py-1.5 pr-3 text-slate-400">{g.date || '—'}</td>
                                <td className="py-1.5 px-2 text-center">{g.AB ?? '—'}</td>
                                <td className="py-1.5 px-2 text-center text-white">{g.H ?? '—'}</td>
                                <td className="py-1.5 px-2 text-center text-[#00D4FF]">
                                  {g.HR ?? '—'}
                                </td>
                                <td className="py-1.5 px-2 text-center">{g.RBI ?? '—'}</td>
                                <td className="py-1.5 px-2 text-center">{g.BB ?? '—'}</td>
                                <td className="py-1.5 px-2 text-center">{g.K ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Pitcher: last start line */}
                  {type === 'pitcher' &&
                    streaks.last_start_line &&
                    typeof streaks.last_start_line === 'object' && (
                      <div className="mt-5">
                        <div className="text-[13px] font-extrabold text-slate-500 tracking-widest capitalize mb-2">
                          Last Start{streaks.last_start_date ? ` — ${streaks.last_start_date}` : ''}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <MetricTile
                            label="Ip"
                            value={
                              streaks.last_start_line.IP != null
                                ? String(streaks.last_start_line.IP)
                                : '—'
                            }
                          />
                          <MetricTile label="K" value={dec0(streaks.last_start_line.K)} />
                          <MetricTile label="Bb" value={dec0(streaks.last_start_line.BB)} />
                          <MetricTile label="Er" value={dec0(streaks.last_start_line.ER)} />
                        </div>
                      </div>
                    )}
                </MetalFrame>
              </>
            )}
          </>
        )}
      </div>
      <BottomNavBar />
    </div>
  );
}
