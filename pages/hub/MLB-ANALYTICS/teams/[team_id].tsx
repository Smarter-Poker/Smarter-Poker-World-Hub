import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { ChevronLeft, Activity, Shield, TrendingUp, Swords, Target, MapPin, Home, Plane, Zap } from 'lucide-react';
import { logError } from '@/utils/logger';
import { BetScoreBadge } from '../../../../src/components/mlb/BetScoreBadge';

// ── Stat Tooltip Definitions ─────────────────────────────────────────────────
const STAT_META: Record<string, { full: string; desc: string }> = {
  'Run Diff':  { full: 'Run Differential', desc: 'Runs Scored minus Runs Allowed. #1 predictor of true team quality.' },
  'W-L':       { full: 'Win-Loss Record', desc: 'Season record — the bottom line that everything else drives toward.' },
  'ERA':       { full: 'Earned Run Average', desc: 'Earned runs allowed per 9 innings. Core pitching quality indicator.' },
  'OPS':       { full: 'On-Base + Slugging %', desc: 'Combined OBP + SLG. Captures total offensive efficiency in one number.' },
  'wRC+':      { full: 'Weighted Runs Created Plus', desc: 'Park & league-adjusted offense. 100 = average. Higher is better.' },
  'FIP':       { full: 'Fielding Independent Pitching', desc: 'ERA-like stat using only K, BB, HBP, HR — removes defense from the equation.' },
  'xFIP':      { full: 'Expected FIP', desc: 'Like FIP but normalizes home run rate. Best for true pitcher skill assessment.' },
  'SIERA':     { full: 'Skill-Interactive ERA', desc: 'Most predictive ERA estimator. Accounts for batted ball type and swing-miss rates.' },
  'OPS+':      { full: 'OPS Plus (Adjusted)', desc: 'OPS adjusted for park and league. 100 = average. Above 100 = above average.' },
  'WHIP':      { full: 'Walks + Hits Per Inning Pitched', desc: 'Baserunner prevention. Lower is better. Measures pitcher command.' },
  'BB%':       { full: 'Walk Rate (Offense)', desc: 'Team walk rate — plate discipline. Strongly correlates with run scoring.' },
  'K%':        { full: 'Strikeout Rate (Pitching)', desc: 'Team K rate allowed. Most defense-independent pitching metric.' },
  'RS':        { full: 'Runs Scored', desc: 'Total runs scored this season. Raw offensive output.' },
  'RA':        { full: 'Runs Allowed', desc: 'Total runs allowed. Combines pitching + defense quality.' },
  'OBP':       { full: 'On-Base Percentage', desc: 'Rate batters reach base. Getting on base is the engine of scoring runs.' },
  'SLG':       { full: 'Slugging Percentage', desc: 'Total bases per at-bat. Measures power and extra-base hit production.' },
  'HR':        { full: 'Home Runs', desc: 'Total team home runs. The most reliable run-scoring vehicle in modern MLB.' },
  'LOB%':      { full: 'Left on Base % (Pitching)', desc: 'Rate pitchers strand baserunners. High % is good; partially luck-driven. League avg ~72%.' },
  'BABIP':     { full: 'Batting Avg on Balls In Play', desc: 'Reveals luck vs. skill. League avg ≈ .300. Outliers regress to the mean.' },
  'DRS':       { full: 'Defensive Runs Saved', desc: 'Defensive value in runs above average. Positive = above-average defense.' },
  'Bullpen ERA': { full: 'Bullpen ERA', desc: 'Relief pitcher ERA. Modern MLB games are routinely won or lost in the bullpen.' },
  'SB%':       { full: 'Stolen Base Success Rate', desc: 'Stolen base efficiency. Raw steal totals matter less than success rate.' },
  'wOBA':      { full: 'Weighted On-Base Average', desc: 'Combines all offensive events into one number. Better than OPS for run prediction.' },
  'AVG':       { full: 'Batting Average', desc: 'Hits per at-bat. Traditional hitting metric. Less predictive than OBP or wRC+.' },
  'SB':        { full: 'Stolen Bases', desc: 'Total stolen bases this season. Context-dependent without success rate.' },
  'Home Rec':  { full: 'Home Record', desc: 'Win-loss record at home. Teams typically win ~54% at home due to crowd advantage.' },
  'Away Rec':  { full: 'Away Record', desc: 'Win-loss record on the road. A strong road record signals genuine team quality.' },
  'Last 10':   { full: 'Last 10 Games', desc: 'Recent form over the last 10 games. Best indicator of current momentum.' },
  'vs .500+':  { full: 'Record vs .500+ Teams', desc: 'Win-loss vs teams with winning records. Separates legit contenders from pretenders.' },
  'Pyth W%':   { full: 'Pythagorean Win %', desc: 'Expected win% based on run differential. Strips out luck better than actual W%.' },
  'oWAR':      { full: 'Offensive WAR', desc: 'Total offensive Wins Above Replacement for all hitters combined.' },
  'pWAR':      { full: 'Pitching WAR', desc: 'Total pitching Wins Above Replacement for all pitchers combined.' },
  'DRS/OAA':   { full: 'Defensive Runs Saved / Outs Above Average', desc: 'Combined defensive metric. Positive = above-average defense across the roster.' },
};

// ── Tooltip Component ────────────────────────────────────────────────────────
const StatTooltipLabel = ({ label }: { label: string }) => {
  const meta = STAT_META[label];
  if (!meta) return <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#94A3B8' }}>{label}</span>;
  return (
    <span className="detail-tooltip-wrap">
      <span className="detail-stat-label">
        {label}
        <span className="detail-tooltip-dot">?</span>
      </span>
      <span className="detail-tooltip-box">
        <span className="detail-tooltip-title">{meta.full}</span>
        <span className="detail-tooltip-desc">{meta.desc}</span>
      </span>
    </span>
  );
};

const fetcher = async (url: string) => {
  try {
    const res = await fetch(url);
    if (res.status === 404) {
      return await res.json().catch(() => ({ notFound: true }));
    }
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    logError('SWR Fetch', err);
    throw err;
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtOps(v: number | null | undefined): string {
  if (v == null) return '-';
  return Number(v).toFixed(3).replace(/^0/, '');
}
function fmtEra(v: number | null | undefined): string {
  if (v == null) return '-';
  return Number(v).toFixed(2);
}
function fmtInt(v: number | null | undefined): string {
  if (v == null) return '-';
  return String(Math.round(Number(v)));
}
function fmtRunDiff(v: number | null | undefined): string {
  if (v == null) return '-';
  const n = Math.round(Number(v));
  return n >= 0 ? `+${n}` : String(n);
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return '-';
  return `${(Number(v) * 100).toFixed(1)}%`;
}

// ── Team Logo Component ──────────────────────────────────────────────────────
const TeamLogo = ({ teamId, teamName, size = 96 }: { teamId: string; teamName: string; size?: number }) => {
  const [imgError, setImgError] = useState(false);
  const imgSize = Math.round(size * 0.7);
  if (imgError) {
    return (
      <div
        style={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#0d1117',
          border: '3px solid #3d4f5f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94A3B8',
          fontSize: size * 0.33,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {teamName.substring(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#0d1117',
        border: '3px solid #3d4f5f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxShadow: '0 0 30px rgba(0,0,0,0.6), 0 0 15px rgba(0,212,255,0.1)',
        flexShrink: 0,
      }}
    >
      <Image
        unoptimized
        width={imgSize}
        height={imgSize}
        src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`}
        alt={teamName}
        className="shrink-0"
        style={{ objectFit: 'contain' }}
        onError={() => setImgError(true)}
      />
    </div>
  );
};

// ── Stat Box ─────────────────────────────────────────────────────────────────
const StatBox = ({
  label,
  value,
  color = 'white',
  highlight = false,
}: {
  label: string;
  value: string;
  color?: string;
  highlight?: boolean;
}) => (
  <div
    className="stat-box"
    style={
      highlight
        ? { background: 'rgba(0, 212, 255, 0.08)', borderColor: 'rgba(0,212,255,0.4)' }
        : {}
    }
  >
    <div className="stat-box-label">
      <StatTooltipLabel label={label} />
    </div>
    <div className="stat-box-value" style={{ color }}>
      {value}
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
export default function TeamDetailPage() {
  const router = useRouter();
  const { team_id } = router.query;

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'GAMES' | 'PROPS'>('OVERVIEW');

  const { data, error } = useSWR(team_id ? `/api/mlb/teams/${team_id}` : null, fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
  });

  // ── Error State ──
  if (error || data?.error) {
    return (
      <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
        <SEOHead title="MLB Team Detail - Error" description="Data fetch failed" />
        <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS/teams')} />
        <MlbSubNav />
        <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
          <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#00D4FF]/50 shadow-[0_0_20px_rgba(0,212,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
            <Shield className="w-12 h-12 text-[#00D4FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.8))' }} />
            <h2 className="text-[31px] font-extrabold text-white capitalize tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
              System Error
            </h2>
            <p className="text-[#FF4444] font-bold capitalize tracking-widest text-[14px] relative z-10">
              Failed to load Team Details. Please try again later.
            </p>
            <Link href="/hub/MLB-ANALYTICS/teams" className="mt-6 inline-block bg-[#1a2332] text-white px-6 py-2 rounded-sm border border-[#3d4f5f] text-[13px] font-extrabold tracking-widest capitalize hover:bg-[#2a3a4a] relative z-10">
              Back To Teams
            </Link>
          </div>
        </main>
        <BottomNavBar />
      </div>
    );
  }

  // ── Loading State ──
  if (!data && !error) {
    return (
      <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200 flex flex-col">
        <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS/teams')} />
        <MlbSubNav />
        <div className="flex-1 flex items-center justify-center min-h-[50vh]">
          <Activity className="w-12 h-12 text-[#00D4FF] animate-pulse" />
        </div>
        <BottomNavBar />
      </div>
    );
  }

  // ── Not Found ──
  if (!data?.team && data) {
    return (
      <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200 flex flex-col">
        <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS/teams')} />
        <MlbSubNav />
        <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[50vh]">
          <h2 className="text-[26px] font-extrabold font-['Rajdhani'] text-white mb-4">Team Not Found</h2>
          <Link href="/hub/MLB-ANALYTICS/teams" className="text-[#00D4FF] underline">Return to Teams</Link>
        </div>
        <BottomNavBar />
      </div>
    );
  }

  const team = data?.team;
  const adv = data?.stats || {};
  const games = data?.games || [];
  const props = data?.props || [];
  const hasEdge = props.length > 0;

  const record = team?.streaks?.record || '0-0';
  const last10 = team?.streaks?.last10_record || '0-0';
  const homeRec = team?.splits?.home || '-';
  const awayRec = team?.splits?.road || team?.splits?.away || '-';
  const vs500 = team?.splits?.vs_500_plus || team?.streaks?.vs_500_record || '-';
  const oneRunRec = team?.streaks?.one_run_record || '-';

  const runDiff =
    team?.run_diff != null
      ? team.run_diff
      : team?.runs_scored != null && team?.runs_allowed != null
        ? team.runs_scored - team.runs_allowed
        : null;

  // Next / current matchup
  const nextGame = games.find((g: any) => !g.final);
  const matchupDate = nextGame?.official_date
    ? new Date(`${nextGame.official_date}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    : '';
  const matchupTime = nextGame?.first_pitch_utc
    ? new Date(nextGame.first_pitch_utc).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
      }) + ' ET'
    : nextGame?.status || 'Scheduled';

  // Recent game results (last 5 finals)
  const recentResults = games.filter((g: any) => g.final).slice(-5);

  return (
    <div className="min-h-screen bg-[#0a0a15] pb-24 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
      <SEOHead
        title={`Smarter.Poker | MLB Team | ${team?.name || 'Loading...'}`}
        description={`Advanced MLB analytics for ${team?.name}`}
        ogImage="/images/mlb/og.png"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'SportsTeam',
          name: team?.name || 'MLB Team',
          sport: 'Baseball',
        }}
      />
      <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS/teams')} />
      <MlbSubNav />

      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --metal-dark: #0a0a15;
          --metal-medium: #151a25;
          --metal-light: #232d3d;
          --metal-highlight: #3d4f5f;
          --neon-cyan: #00D4FF;
          --neon-cyan-dim: rgba(0,212,255,0.15);
          --neon-cyan-glow: rgba(0,212,255,0.6);
        }
        .metal-panel {
          background: linear-gradient(180deg, var(--metal-medium) 0%, var(--metal-dark) 100%);
          border: 1.5px solid var(--metal-highlight);
          border-radius: 12px;
          padding: 20px;
          position: relative;
          overflow: visible;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.5);
        }
        .edge-glow {
          box-shadow: 0 0 20px rgba(34,197,94,0.25), inset 0 0 20px rgba(34,197,94,0.07);
          border-color: rgba(34,197,94,0.5) !important;
        }
        .panel-title {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.18em;
          color: #475569;
          margin-bottom: 16px;
          border-bottom: 1px solid rgba(61,79,95,0.5);
          padding-bottom: 8px;
          text-transform: capitalize;
          font-family: 'Rajdhani', sans-serif;
        }
        /* ── Stat Boxes ── */
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 12px;
        }
        .stat-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .stat-grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .stat-grid-4 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .stat-box {
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(61,79,95,0.6);
          border-radius: 8px;
          padding: 12px 10px;
          text-align: center;
          transition: border-color 0.2s ease;
          overflow: visible;
          position: relative;
        }
        .stat-box:hover { border-color: rgba(0,212,255,0.3); }
        .stat-box-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #64748B;
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .stat-box-value {
          font-size: 22px;
          font-weight: 800;
          color: white;
          font-family: 'Rajdhani', sans-serif;
          line-height: 1.1;
        }
        /* ── Tooltip System ── */
        .detail-tooltip-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .detail-stat-label {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #64748B;
          cursor: help;
          text-transform: capitalize;
        }
        .detail-tooltip-dot {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: rgba(0,212,255,0.15);
          border: 1px solid rgba(0,212,255,0.35);
          color: #00D4FF;
          font-size: 8px;
          font-weight: 800;
          cursor: help;
          flex-shrink: 0;
        }
        .detail-tooltip-box {
          display: flex;
          flex-direction: column;
          gap: 4px;
          position: absolute;
          bottom: calc(100% + 10px);
          left: 50%;
          transform: translateX(-50%);
          background: #08101A;
          border: 1px solid rgba(0,212,255,0.5);
          border-radius: 8px;
          padding: 10px 14px;
          min-width: 210px;
          max-width: 280px;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          z-index: 9999;
          box-shadow: 0 8px 30px rgba(0,0,0,0.7), 0 0 15px rgba(0,212,255,0.12);
          transition: opacity 0.15s ease, visibility 0.15s ease;
          white-space: normal;
          text-align: left;
        }
        .detail-tooltip-box::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: rgba(0,212,255,0.5);
        }
        .detail-tooltip-title {
          display: block;
          font-size: 11px;
          font-weight: 800;
          color: #00D4FF;
          letter-spacing: 0.06em;
          font-family: 'Rajdhani', sans-serif;
        }
        .detail-tooltip-desc {
          display: block;
          font-size: 10px;
          color: #94A3B8;
          line-height: 1.45;
        }
        .detail-tooltip-wrap:hover .detail-tooltip-box,
        .detail-tooltip-wrap:focus-within .detail-tooltip-box {
          opacity: 1;
          visibility: visible;
        }
        /* ── Tabs ── */
        .tab-bar {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 12px;
          margin-bottom: 16px;
          scrollbar-width: none;
        }
        .tab-bar::-webkit-scrollbar { display: none; }
        .tab-btn {
          padding: 10px 20px;
          min-height: 44px;
          border-radius: 6px;
          border: 2px solid;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: capitalize;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
          font-family: 'Rajdhani', sans-serif;
        }
        .tab-btn.active {
          background: #1a2332;
          color: #00D4FF;
          border-color: #00D4FF;
          box-shadow: 0 0 12px rgba(0,212,255,0.25);
        }
        .tab-btn.inactive {
          background: #0d1117;
          color: #64748B;
          border-color: #3d4f5f;
        }
        .tab-btn.inactive:hover {
          border-color: #5a6a7a;
          color: #94A3B8;
        }
        /* ── Matchup Panel ── */
        .matchup-panel {
          background: linear-gradient(135deg, #0a1520 0%, #0d1117 60%, #151a25 100%);
          border: 2px solid var(--metal-highlight);
          border-radius: 16px;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .matchup-panel::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, var(--neon-cyan), transparent);
        }
        .result-chip {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0;
        }
        /* ── Section divider ── */
        .section-divider {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 20px 0 12px;
        }
        .section-divider-label {
          font-size: 9px;
          font-weight: 800;
          color: #475569;
          letter-spacing: 0.18em;
          text-transform: capitalize;
          white-space: nowrap;
          font-family: 'Rajdhani', sans-serif;
        }
        .section-divider-line {
          flex: 1;
          height: 1px;
          background: #1a2332;
        }
      ` }} />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Back Button */}
        <Link
          href="/hub/MLB-ANALYTICS/teams"
          className="inline-flex items-center text-[18px] font-bold tracking-wider text-[#94A3B8] hover:text-[#00D4FF] transition-colors mb-6 capitalize gap-1"
        >
          <ChevronLeft size={16} /> Back to Teams
        </Link>

        {team && (
          <>
            {/* ── Hero Profile Card ── */}
            <div className={`metal-panel mb-6 ${hasEdge ? 'edge-glow' : ''}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Top: Logo + Identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <TeamLogo teamId={team.team_id} teamName={team.name} size={96} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{ fontSize: 32, fontWeight: 900, color: 'white', margin: '0 0 4px', letterSpacing: '-0.02em', fontFamily: "'Rajdhani', sans-serif" }}>
                      {team.name}
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      <span style={{ color: '#00D4FF', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={12} />
                        {[team.league, team.division].filter(Boolean).join(' • ') || 'MLB'}
                      </span>
                      {team.grade && (
                        <>
                          <span style={{ color: '#475569', fontSize: 10 }}>·</span>
                          <BetScoreBadge pWin={team.grade.pWin} price={team.grade.price} pMarket={team.grade.pMarket} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.08em' }}>
                            {team.grade.edgeCount} EDGE{team.grade.edgeCount !== 1 ? 'S' : ''}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Recent W/L strip */}
                    {recentResults.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: '#475569', fontWeight: 700, letterSpacing: '0.1em', marginRight: 4 }}>Last 5</span>
                        {recentResults.map((g: any, i: number) => (
                          <span
                            key={i}
                            className="result-chip"
                            style={{
                              background: g.result === 'W' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                              color: g.result === 'W' ? '#22C55E' : '#EF4444',
                              border: `1px solid ${g.result === 'W' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                            }}
                          >
                            {g.result}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Record Strip — 6 key context stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { label: 'Record', value: record, color: 'white' },
                    { label: 'Last 10', value: last10, color: parseInt(last10.split('-')[0]) >= 7 ? '#22C55E' : parseInt(last10.split('-')[1]) >= 7 ? '#EF4444' : 'white' },
                    { label: 'Home Rec', value: homeRec, color: '#FCD34D' },
                    { label: 'Away Rec', value: awayRec, color: '#FCD34D' },
                    { label: 'vs .500+', value: vs500, color: '#94A3B8' },
                    { label: 'Run Diff', value: fmtRunDiff(runDiff), color: runDiff == null ? 'white' : Number(runDiff) >= 0 ? '#22C55E' : '#EF4444' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: '#000', padding: '10px 12px', borderRadius: 8, border: '1px solid #1a2332' }}>
                      <div style={{ fontSize: 9, color: '#64748B', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 4, textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <StatTooltipLabel label={label} />
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 900, color, fontFamily: "'Rajdhani', sans-serif" }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="tab-bar" role="tablist" aria-label="Team detail sections">
              {(['OVERVIEW', 'GAMES', 'PROPS'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`tab-btn ${activeTab === tab ? 'active' : 'inactive'}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW Tab ── */}
            {activeTab === 'OVERVIEW' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Current / Next Matchup */}
                {nextGame && (
                  <div className="matchup-panel">
                    <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Swords size={13} style={{ color: '#00D4FF' }} />
                      Next Matchup
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'capitalize', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {nextGame.is_home
                            ? <><Home size={11} style={{ color: '#00D4FF' }} /> Home vs</>
                            : <><Plane size={11} style={{ color: '#F59E0B' }} /> Away @</>
                          }
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: 'white', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                          {nextGame.opponent || (nextGame.is_home ? nextGame.away_team : nextGame.home_team) || 'TBD'}
                        </div>
                        {nextGame.opponent_abbr && (
                          <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, letterSpacing: '0.1em', marginTop: 4 }}>
                            {nextGame.opponent_abbr}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#94A3B8', marginBottom: 4 }}>
                          {matchupDate}
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#00D4FF', fontFamily: "'Rajdhani', sans-serif" }}>
                          {matchupTime}
                        </div>
                        {nextGame.status && nextGame.status !== 'Scheduled' && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', letterSpacing: '0.1em', marginTop: 4, textTransform: 'capitalize' }}>
                            {nextGame.status}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* WIN PREDICTORS */}
                <div className="metal-panel">
                  <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TrendingUp size={13} style={{ color: '#00D4FF' }} /> 🏆 WIN PREDICTORS
                  </div>
                  <div className="stat-grid-3">
                    <StatBox label="wRC+" value={adv.wrc_plus != null ? fmtInt(adv.wrc_plus) : '-'} color="#F472B6" highlight />
                    <StatBox label="Ops" value={fmtOps(adv.ops)} color="#34D399" />
                    <StatBox label="wOBA" value={fmtOps(adv.woba)} color="#34D399" />
                    <StatBox label="Era" value={fmtEra(adv.era)} color="white" />
                    <StatBox label="Fip" value={fmtEra(adv.fip)} color="#A78BFA" />
                    <StatBox label="Pyth W%" value={adv.pyth_wpct != null ? Number(adv.pyth_wpct).toFixed(3) : '-'} color="#94A3B8" />
                  </div>
                </div>

                {/* PITCHING METRICS */}
                <div className="metal-panel">
                  <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Activity size={13} style={{ color: '#60A5FA' }} /> Pitching Metrics
                  </div>
                  <div className="stat-grid-4">
                    <StatBox label="Era" value={fmtEra(adv.era)} color="white" />
                    <StatBox label="Fip" value={fmtEra(adv.fip)} color="#A78BFA" />
                    <StatBox label="xFIP" value={fmtEra(adv.xfip)} color="#A78BFA" />
                    <StatBox label="Siera" value={fmtEra(adv.siera)} color="#FCD34D" />
                    <StatBox label="Whip" value={adv.whip != null ? Number(adv.whip).toFixed(2) : '-'} color="white" />
                    <StatBox label="K%" value={adv.k_pct != null ? `${Number(adv.k_pct).toFixed(1)}%` : '-'} color="#60A5FA" />
                    <StatBox label="Bb%" value={adv.bb_pct != null ? `${Number(adv.bb_pct).toFixed(1)}%` : '-'} color="#F59E0B" />
                    <StatBox label="Bullpen ERA" value={adv.bullpen_era != null ? fmtEra(adv.bullpen_era) : '-'} color="#60A5FA" />
                  </div>
                </div>

                {/* HITTING METRICS */}
                <div className="metal-panel">
                  <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Activity size={13} style={{ color: '#F472B6' }} /> Hitting Metrics
                  </div>
                  <div className="stat-grid-4">
                    <StatBox label="wRC+" value={adv.wrc_plus != null ? fmtInt(adv.wrc_plus) : '-'} color="#F472B6" highlight />
                    <StatBox label="Ops" value={fmtOps(adv.ops)} color="#34D399" />
                    <StatBox label="Obp" value={fmtOps(adv.obp)} color="#34D399" />
                    <StatBox label="Slg" value={fmtOps(adv.slg)} color="#34D399" />
                    <StatBox label="Avg" value={fmtOps(adv.avg)} color="white" />
                    <StatBox label="Hr" value={fmtInt(adv.hr)} color="#F59E0B" />
                    <StatBox label="Sb" value={fmtInt(adv.sb)} color="#94A3B8" />
                    <StatBox label="Babip" value={adv.babip != null ? fmtOps(adv.babip) : '-'} color="#94A3B8" />
                  </div>
                </div>

                {/* SITUATIONAL & DEFENSE */}
                <div className="metal-panel">
                  <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={13} style={{ color: '#F59E0B' }} /> 🛡️ SITUATIONAL & DEFENSE
                  </div>
                  <div className="stat-grid-4">
                    <StatBox label="Home Rec" value={homeRec} color="#FCD34D" />
                    <StatBox label="Away Rec" value={awayRec} color="#FCD34D" />
                    <StatBox label="vs .500+" value={vs500} color="#94A3B8" />
                    <StatBox label="Last 10" value={last10} color={parseInt((last10 || '0-0').split('-')[0]) >= 7 ? '#22C55E' : 'white'} />
                    <StatBox label="Drs" value={adv.drs != null ? (Number(adv.drs) >= 0 ? `+${fmtInt(adv.drs)}` : fmtInt(adv.drs)) : '-'} color={adv.drs != null ? (Number(adv.drs) >= 0 ? '#22C55E' : '#EF4444') : 'white'} />
                    <StatBox label="Lob%" value={adv.lob_pct != null ? `${Number(adv.lob_pct).toFixed(1)}%` : '-'} color="#94A3B8" />
                    <StatBox label="oWAR" value={adv.hitting_war != null ? Number(adv.hitting_war).toFixed(1) : '-'} color="#34D399" />
                    <StatBox label="pWAR" value={adv.pitching_war != null ? Number(adv.pitching_war).toFixed(1) : '-'} color="#60A5FA" />
                  </div>
                </div>
              </div>
            )}

            {/* ── GAMES Tab ── */}
            {activeTab === 'GAMES' && (
              <div className="metal-panel">
                <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Swords size={13} style={{ color: '#00D4FF' }} /> RECENT & UPCOMING GAMES
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {games.length > 0 ? (
                    games.map((game: any) => {
                      const dateLabel = game.official_date
                        ? new Date(`${game.official_date}T12:00:00`).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'TBD';
                      const timeLabel = game.first_pitch_utc
                        ? new Date(game.first_pitch_utc).toLocaleTimeString('en-US', {
                            timeZone: 'America/New_York',
                            hour: 'numeric',
                            minute: '2-digit',
                          }) + ' ET'
                        : 'TBD';
                      return (
                        <div
                          key={game.game_pk}
                          style={{
                            padding: '14px 16px',
                            border: '1px solid #3d4f5f',
                            borderRadius: 8,
                            background: 'rgba(0,0,0,0.3)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'white', letterSpacing: '0.02em' }}>
                              <span style={{ color: '#64748B', fontSize: 12 }}>{game.is_home ? 'vs ' : '@ '}</span>
                              {game.opponent || (game.is_home ? game.away_team : game.home_team)}
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.08em', textTransform: 'capitalize' }}>
                              {dateLabel}
                              {game.final ? ` · ${game.status}` : ` · ${timeLabel}`}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            {game.final && game.team_score != null && game.opp_score != null ? (
                              <>
                                {game.result && (
                                  <span
                                    className="result-chip"
                                    style={{
                                      background: game.result === 'W' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                      color: game.result === 'W' ? '#22C55E' : '#EF4444',
                                      border: `1px solid ${game.result === 'W' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                    }}
                                  >
                                    {game.result}
                                  </span>
                                )}
                                <span style={{ fontSize: 18, fontWeight: 900, color: 'white', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '-0.01em' }}>
                                  {game.team_score}–{game.opp_score}
                                </span>
                              </>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#00D4FF', letterSpacing: '0.08em', textTransform: 'capitalize' }}>
                                {game.status || 'Scheduled'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'capitalize' }}>
                      No games found
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── PROPS Tab ── */}
            {activeTab === 'PROPS' && (
              <div className="metal-panel">
                <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Target size={13} style={{ color: '#00D4FF' }} /> Active Prop Edges
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {props.length > 0 ? (
                    props.map((prop: any, idx: number) => {
                      const label = String(prop.prop_type || prop.prop || '')
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (c: string) => c.toUpperCase());
                      const lineLabel =
                        prop.line != null
                          ? `${prop.side ? prop.side + ' ' : ''}${prop.line}`
                          : prop.side || '';
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: '14px 16px',
                            border: '1px solid #3d4f5f',
                            borderRadius: 8,
                            background: 'rgba(0,0,0,0.3)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'white', letterSpacing: '0.02em' }}>
                              {prop.player_name}
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#00D4FF', letterSpacing: '0.08em', textTransform: 'capitalize' }}>
                              {label}{lineLabel ? ` · ${lineLabel}` : ''}
                            </div>
                            {prop.ev_pct != null && (
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.06em' }}>
                                EV {prop.ev_pct > 0 ? '+' : ''}{Number(prop.ev_pct).toFixed(1)}%
                                {prop.edge_pts != null ? ` · ${Number(prop.edge_pts).toFixed(1)} edge` : ''}
                              </div>
                            )}
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            {prop.p_win != null && prop.price != null ? (
                              <BetScoreBadge pWin={prop.p_win} price={prop.price} pMarket={prop.p_market} />
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.08em', textTransform: 'capitalize' }}>
                                Awaiting price
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'capitalize' }}>
                      No active props found for this team
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <BottomNavBar />
    </div>
  );
}
