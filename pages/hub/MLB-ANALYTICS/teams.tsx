import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  Search,
  SearchX,
  Shield,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import useSWR from 'swr';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import { BetScoreBadge } from '../../../src/components/mlb/BetScoreBadge';
import { logError } from '@/utils/logger';

// ── Stat Tooltip Definitions ────────────────────────────────────────────────
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
  'WHIP':      { full: 'Walks + Hits Per Inning Pitched', desc: 'Baserunner prevention. Lower is better. Measures pitcher command and efficiency.' },
  'BB%':       { full: 'Walk Rate (Offense)', desc: 'Team walk rate — plate discipline. Strongly correlates with run scoring.' },
  'K%':        { full: 'Strikeout Rate (Pitching)', desc: 'Team K rate allowed. Most defense-independent pitching metric available.' },
  'RS':        { full: 'Runs Scored', desc: 'Total runs scored this season. Raw offensive output.' },
  'RA':        { full: 'Runs Allowed', desc: 'Total runs allowed. Combines pitching + defense quality.' },
  'OBP':       { full: 'On-Base Percentage', desc: 'Rate batters reach base. Getting on base is the engine of scoring runs.' },
  'SLG':       { full: 'Slugging Percentage', desc: 'Total bases per at-bat. Measures power and extra-base hit production.' },
  'HR':        { full: 'Home Runs', desc: 'Total team home runs. The most reliable run-scoring vehicle in modern MLB.' },
  'LOB%':      { full: 'Left on Base % (Pitching)', desc: 'Rate pitchers strand baserunners. High % = good; partially luck-driven. League avg ~72%.' },
  'BABIP':     { full: 'Batting Avg on Balls In Play', desc: 'Reveals luck vs. skill. League avg ≈ .300. Major outliers tend to regress to the mean.' },
  'DRS':       { full: 'Defensive Runs Saved', desc: 'Defensive value in runs above average. Positive = above-average defense.' },
  'Bullpen':   { full: 'Bullpen ERA', desc: 'Relief pitcher ERA. Modern MLB games are routinely won or lost in the bullpen.' },
  'SB%':       { full: 'Stolen Base Success Rate', desc: 'Stolen base efficiency. Raw SB totals are less meaningful than success rate.' },
  'wOBA':      { full: 'Weighted On-Base Average', desc: 'Combines all offensive events into one number. Better than OPS for run prediction.' },
  'AVG':       { full: 'Batting Average', desc: 'Hits per at-bat. Traditional hitting metric. Less predictive than OBP or wRC+.' },
  'SB':        { full: 'Stolen Bases', desc: 'Total stolen bases this season. Context-dependent without success rate.' },
  'Home':      { full: 'Home Record', desc: 'Win-loss record at home. Teams typically win ~54% at home due to crowd advantage.' },
  'Away':      { full: 'Away Record', desc: 'Win-loss record on the road. A strong road record signals genuine team quality.' },
  'Last 10':   { full: 'Last 10 Games', desc: 'Recent form over the last 10 games. Best indicator of current momentum.' },
  'Pyth W%':   { full: 'Pythagorean Win %', desc: 'Expected win% based on run differential. Strips out clutch variance — predicts future wins better than actual W%.' },
  'vs .500+':  { full: 'Record vs .500+ Teams', desc: 'Win-loss vs teams with winning records. Separates legit contenders from teams beating up on weak opponents.' },
  '1-Run W%':  { full: 'One-Run Game Win %', desc: 'Win rate in games decided by 1 run. Tests bullpen and clutch performance under pressure.' },
  'OAA':       { full: 'Outs Above Average', desc: 'MLB\'s primary fielding metric. Measures how many outs a fielder saves vs. a league-average fielder at the same position.' },
  'UZR':       { full: 'Ultimate Zone Rating', desc: 'Defensive runs saved based on batted ball location and fielder positioning. Positive = above-average defense.' },
  'DEF':       { full: 'Defensive Runs (Composite)', desc: 'Combined defensive value metric. Aggregates multiple fielding components into a single run-value number.' },
  'oWAR':      { full: 'Offensive WAR', desc: 'Total Wins Above Replacement contributed by all hitters. Measures combined offensive value vs. a replacement-level player.' },
  'pWAR':      { full: 'Pitching WAR', desc: 'Total Wins Above Replacement contributed by all pitchers. Measures combined pitching value vs. a replacement-level pitcher.' },
};


// ── Tooltip Component ────────────────────────────────────────────────────────
const StatLabel = ({
  label,
  color = 'rgba(255,255,255,0.55)',
}: {
  label: string;
  color?: string;
}) => {
  const meta = STAT_META[label];
  if (!meta) {
    return (
      <span className="stat-label" style={{ color }}>
        {label}
      </span>
    );
  }
  return (
    <span className="stat-tooltip-wrap">
      <span className="stat-label" style={{ color }}>
        {label}
        <span className="tooltip-dot">?</span>
      </span>
      <span className="stat-tooltip-box">
        <span className="stat-tooltip-title">{meta.full}</span>
        <span className="stat-tooltip-desc">{meta.desc}</span>
      </span>
    </span>
  );
};

// ── Team Logo Component ──────────────────────────────────────────────────────
const TeamLogo = ({ teamId, teamName }: { teamId: number; teamName: string }) => {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: '#1a2332',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          fontWeight: 700,
          color: '#00D4FF',
          border: '2px solid #3d4f5f',
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
        width: 60,
        height: 60,
        borderRadius: '50%',
        background: '#0d1117',
        border: '2px solid #3d4f5f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: '0 0 12px rgba(0,0,0,0.5)',
      }}
    >
      <Image
        unoptimized
        width={42}
        height={42}
        src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`}
        alt={teamName}
        className="shrink-0"
        style={{ objectFit: 'contain' }}
        onError={() => setImgError(true)}
      />
    </div>
  );
};

// ── Data Fetcher ─────────────────────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function winPct(record: string): number {
  const [w, l] = (record || '0-0').split('-').map(Number);
  const total = (w || 0) + (l || 0);
  return total > 0 ? (w || 0) / total : 0;
}

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

// ── Division Config ───────────────────────────────────────────────────────────
const DIVISION_ORDER = ['AL East', 'AL Central', 'AL West', 'NL East', 'NL Central', 'NL West'];
const DIVISION_ABBR: Record<string, string> = {
  'AL East': 'AL EAST',
  'AL Central': 'AL CENTRAL',
  'AL West': 'AL WEST',
  'NL East': 'NL EAST',
  'NL Central': 'NL CENTRAL',
  'NL West': 'NL WEST',
};

// ── Team Card ─────────────────────────────────────────────────────────────────
const TeamCardComponent = ({ team }: { team: any }) => {
  const [expanded, setExpanded] = useState(false);

  const record = team.streaks?.record || '0-0';
  const last10 = team.streaks?.last10_record || '0-0';
  const homeRec = team.splits?.home || '-';
  const awayRec = team.splits?.road || team.splits?.away || '-';
  let isHot = false;
  if (last10) {
    const [w] = last10.split('-').map(Number);
    if (w >= 7) isHot = true;
  }
  const divStr = team.division || '??';

  // Run differential from profile fields (v_team_profile select *)
  const runDiff =
    team.run_diff != null
      ? team.run_diff
      : team.runs_scored != null && team.runs_allowed != null
        ? team.runs_scored - team.runs_allowed
        : null;

  const adv = team.adv_stats || {};

  return (
    <div
      className="metal-frame"
      style={{ display: 'block', textDecoration: 'none', marginBottom: 16 }}
    >
      {/* Corner Bolts */}
      <div className="frame-bolt" style={{ top: 8, left: 8 }} />
      <div className="frame-bolt" style={{ top: 8, right: 8 }} />
      <div className="frame-bolt" style={{ bottom: 8, left: 8 }} />
      <div className="frame-bolt" style={{ bottom: 8, right: 8 }} />

      <div style={{ display: 'block', padding: '20px', textDecoration: 'none', color: 'inherit' }}>
        <Link
          href={`/hub/MLB-ANALYTICS/teams/${team.team_id}`}
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        >
          {/* Header Row: Logo + Name + Badge */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 16,
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <TeamLogo teamId={team.team_id} teamName={team.name} />
              <div>
                <h3
                  style={{
                    margin: '0 0 5px',
                    fontSize: 18,
                    fontWeight: 800,
                    color: 'white',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {team.name}
                </h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--neon-cyan)',
                      background: 'var(--neon-cyan-dim)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      letterSpacing: '0.05em',
                    }}
                  >
                    {divStr}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#94A3B8',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {record} · L10 {last10}
                  </span>
                  {isHot && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: '#F59E0B',
                        border: '1px solid #F59E0B',
                        padding: '1px 4px',
                        borderRadius: 2,
                        letterSpacing: '0.05em',
                        background: 'rgba(245,158,11,0.1)',
                      }}
                    >
                      HOT
                    </span>
                  )}
                </div>
              </div>
            </div>
            {team.grade ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 4,
                  flexShrink: 0,
                }}
              >
                <BetScoreBadge
                  pWin={team.grade.pWin}
                  price={team.grade.price}
                  pMarket={team.grade.pMarket}
                />
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#64748B',
                    letterSpacing: '0.08em',
                  }}
                >
                  {team.grade.edgeCount} EDGE{team.grade.edgeCount === 1 ? '' : 'S'}
                </span>
              </div>
            ) : (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#475569',
                  letterSpacing: '0.08em',
                  textTransform: 'capitalize',
                  flexShrink: 0,
                  paddingTop: 4,
                }}
              >
                No edge
              </span>
            )}
          </div>

          {/* ── 5 Basic Stats Always Visible ── */}
          <div className="stats-panel" style={{ marginTop: 8 }}>
              <div className="stat-segment">
                <StatLabel label="ERA" color="#60A5FA" />
                <div className="stat-value">
                  {fmtEra(adv.era)}
                </div>
              </div>
              <div className="stat-segment">
                <StatLabel label="OPS" color="#34D399" />
                <div className="stat-value">
                  {fmtOps(adv.ops)}
                </div>
              </div>
              <div className="stat-segment">
                <StatLabel label="wRC+" color="#F472B6" />
                <div className="stat-value">
                  {fmtInt(adv.wrc_plus)}
                </div>
              </div>
              <div className="stat-segment">
                <StatLabel label="FIP" color="#A78BFA" />
                <div className="stat-value">
                  {fmtEra(adv.fip)}
                </div>
              </div>
              <div className="stat-segment">
                <StatLabel label="Run Diff" color="#00D4FF" />
                <div className="stat-value" style={{ color: runDiff == null ? undefined : runDiff >= 0 ? '#34D399' : '#EF4444' }}>
                  {fmtRunDiff(runDiff)}
                </div>
              </div>
            </div>
        </Link>

        {/* ── Expandable Drawer — All 20 Stats ── */}
        {team.adv_stats && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              {expanded ? 'COLLAPSE TELEMETRY' : 'EXPAND TELEMETRY'}
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {expanded && (
              <div
                style={{
                  marginTop: 12,
                  padding: '16px',
                  background: '#05050A',
                  borderRadius: 8,
                  border: '1px solid var(--metal-highlight)',
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                {/* TIER 1 - Win Predictors */}
                <div className="drawer-section-header">🏆 WIN PREDICTORS</div>
                <div className="drawer-grid">
                  <div className="drawer-row">
                    <span className="drawer-label">
                      <StatLabel label="W-L" color="#94A3B8" />
                    </span>
                    <span className="drawer-value">{record}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label">
                      <StatLabel label="Run Diff" color="#94A3B8" />
                    </span>
                    <span
                      className="drawer-value"
                      style={{ color: runDiff == null ? 'white' : runDiff >= 0 ? '#34D399' : '#EF4444' }}
                    >
                      {fmtRunDiff(runDiff)}
                    </span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label">
                      <StatLabel label="Pyth W%" color="#94A3B8" />
                    </span>
                    <span className="drawer-value">
                      {team.pyth_wpct != null ? Number(team.pyth_wpct).toFixed(3) : '-'}
                    </span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label">
                      <StatLabel label="wRC+" color="#94A3B8" />
                    </span>
                    <span className="drawer-value">{fmtInt(adv.wrc_plus)}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label">
                      <StatLabel label="wOBA" color="#94A3B8" />
                    </span>
                    <span className="drawer-value">{fmtOps(adv.woba)}</span>
                  </div>
                </div>

                {/* TIER 2 - Pitching */}
                <div className="drawer-section-header" style={{ marginTop: 16 }}>🔥 PITCHING</div>
                <div className="drawer-grid">
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="ERA" color="#94A3B8" /></span>
                    <span className="drawer-value">{fmtEra(adv.era)}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="FIP" color="#94A3B8" /></span>
                    <span className="drawer-value">{fmtEra(adv.fip)}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="xFIP" color="#94A3B8" /></span>
                    <span className="drawer-value">{fmtEra(adv.xfip)}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="SIERA" color="#94A3B8" /></span>
                    <span className="drawer-value">{fmtEra(adv.siera)}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="pWAR" color="#94A3B8" /></span>
                    <span className="drawer-value">{adv.pitching_war != null ? Number(adv.pitching_war).toFixed(1) : '-'}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="OAA" color="#94A3B8" /></span>
                    <span className="drawer-value">{adv.oaa != null ? (Number(adv.oaa) >= 0 ? `+${fmtInt(adv.oaa)}` : fmtInt(adv.oaa)) : '-'}</span>
                  </div>
                </div>

                {/* TIER 3 - Offense */}
                <div className="drawer-section-header" style={{ marginTop: 16 }}>⚙️ OFFENSE</div>
                <div className="drawer-grid">
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="OPS" color="#94A3B8" /></span>
                    <span className="drawer-value">{fmtOps(adv.ops)}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="OBP" color="#94A3B8" /></span>
                    <span className="drawer-value">{fmtOps(adv.obp)}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="SLG" color="#94A3B8" /></span>
                    <span className="drawer-value">{fmtOps(adv.slg)}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="AVG" color="#94A3B8" /></span>
                    <span className="drawer-value">{fmtOps(adv.avg)}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="HR" color="#94A3B8" /></span>
                    <span className="drawer-value">{fmtInt(adv.hr)}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="SB" color="#94A3B8" /></span>
                    <span className="drawer-value">{fmtInt(adv.sb)}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="oWAR" color="#94A3B8" /></span>
                    <span className="drawer-value">{adv.hitting_war != null ? Number(adv.hitting_war).toFixed(1) : '-'}</span>
                  </div>
                </div>

                {/* TIER 4 - Situational */}
                <div className="drawer-section-header" style={{ marginTop: 16 }}>🛡️ SITUATIONAL</div>
                <div className="drawer-grid">
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="Home" color="#94A3B8" /></span>
                    <span className="drawer-value">{homeRec}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="Away" color="#94A3B8" /></span>
                    <span className="drawer-value">{awayRec}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="Last 10" color="#94A3B8" /></span>
                    <span className="drawer-value">{last10}</span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="vs .500+" color="#94A3B8" /></span>
                    <span className="drawer-value">
                      {team.splits?.vs_500_plus || team.streaks?.vs_500_record || '-'}
                    </span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="1-Run W%" color="#94A3B8" /></span>
                    <span className="drawer-value">
                      {team.streaks?.one_run_record || '-'}
                    </span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="DRS" color="#94A3B8" /></span>
                    <span className="drawer-value">
                      {adv.drs != null ? (Number(adv.drs) >= 0 ? `+${fmtInt(adv.drs)}` : fmtInt(adv.drs)) : '-'}
                    </span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="OAA" color="#94A3B8" /></span>
                    <span className="drawer-value">
                      {adv.oaa != null ? (Number(adv.oaa) >= 0 ? `+${fmtInt(adv.oaa)}` : fmtInt(adv.oaa)) : '-'}
                    </span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="UZR" color="#94A3B8" /></span>
                    <span className="drawer-value">
                      {adv.uzr != null ? (Number(adv.uzr) >= 0 ? `+${Number(adv.uzr).toFixed(1)}` : Number(adv.uzr).toFixed(1)) : '-'}
                    </span>
                  </div>
                  <div className="drawer-row">
                    <span className="drawer-label"><StatLabel label="DEF" color="#94A3B8" /></span>
                    <span className="drawer-value">
                      {adv.def != null ? (Number(adv.def) >= 0 ? `+${Number(adv.def).toFixed(1)}` : Number(adv.def).toFixed(1)) : '-'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeamsPage({
  teams: fallbackTeams,
  todayStr: fallbackToday,
  globalEdgeActive: fallbackGlobalEdgeActive,
}: any = {}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLeague, setFilterLeague] = useState<'ALL' | 'AL' | 'NL'>('ALL');
  const [filterDivision, setFilterDivision] = useState<'ALL' | 'East' | 'Central' | 'West'>('ALL');
  const [todayStr, setTodayStr] = useState<string>(fallbackToday || '');

  React.useEffect(() => {
    if (!todayStr) {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      setTodayStr(formatter.format(new Date()));
    }
  }, [todayStr]);

  const { data, error, isValidating } = useSWR('/api/mlb/teams', fetcher, {
    fallbackData: fallbackTeams
      ? { teams: fallbackTeams, globalEdgeActive: fallbackGlobalEdgeActive }
      : undefined,
    refreshInterval: 300000,
    revalidateOnFocus: true,
    dedupingInterval: 10000,
  });

  if (error || data?.error) {
    logError('UI Error', error || (typeof data !== 'undefined' ? data?.error : null));
    return (
      <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
        <SEOHead title="MLB Teams - Error" description="Data fetch failed" />
        <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
        <MlbSubNav />
        <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
          <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#00D4FF]/50 shadow-[0_0_20px_rgba(0,212,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
            <Shield
              className="w-12 h-12 text-[#00D4FF] mx-auto mb-4 relative z-10"
              style={{ filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.8))' }}
            />
            <h2
              className="text-[40px] font-extrabold text-white capitalize tracking-wider mb-2 relative z-10"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              System Error
            </h2>
            <p className="text-[#FF4444] font-bold capitalize tracking-widest text-[14px] relative z-10">
              Failed To Load Teams Database. Please Try Again Later.
            </p>
          </div>
        </main>
        <BottomNavBar />
      </div>
    );
  }

  const activeTeams = data?.teams || fallbackTeams || [];
  const globalEdgeActive = data?.globalEdgeActive || fallbackGlobalEdgeActive || false;
  const summary = data?.summary || { gradedCount: 0, eliteCount: 0, strongCount: 0 };
  const isInitialLoading = !data && !error;

  // Filter teams by search/league/division
  const filteredTeams = useMemo(() => {
    return activeTeams.filter((team: any) => {
      const teamName = team.name || '';
      const teamLeague = team.league || '';
      const teamDivision = team.division || '';

      if (teamName.includes('All-Stars')) return false;

      const matchSearch = teamName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchLeague =
        filterLeague === 'ALL' ||
        teamLeague === filterLeague ||
        (filterLeague === 'AL' && teamLeague.includes('American')) ||
        (filterLeague === 'NL' && teamLeague.includes('National'));
      const matchDivision = filterDivision === 'ALL' || teamDivision.includes(filterDivision);

      return matchSearch && matchLeague && matchDivision;
    });
  }, [activeTeams, searchQuery, filterLeague, filterDivision]);

  // Group by division, sorted by win% within each division
  const divisionGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    DIVISION_ORDER.forEach((div) => {
      groups[div] = [];
    });
    filteredTeams.forEach((team: any) => {
      const div = team.division || '';
      // Normalize division name
      const divKey = DIVISION_ORDER.find((d) => div.includes(d) || d.includes(div)) || div;
      if (!groups[divKey]) groups[divKey] = [];
      groups[divKey].push(team);
    });
    // Sort each division by win pct (best first)
    Object.keys(groups).forEach((div) => {
      groups[div].sort((a: any, b: any) => {
        return winPct(b.streaks?.record) - winPct(a.streaks?.record);
      });
    });
    return DIVISION_ORDER.map((div) => ({
      div,
      label: DIVISION_ABBR[div] || div,
      teams: groups[div] || [],
    })).filter((g) => g.teams.length > 0);
  }, [filteredTeams]);

  // When searching, use flat list for simplicity
  const isGrouped = searchQuery.trim() === '';

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            :root {
                --metal-dark: #0a0a15;
                --metal-base: #0d1117;
                --metal-mid: #1a2332;
                --metal-light: #2a3a4a;
                --metal-highlight: #3d4f5f;
                --neon-cyan: #00D4FF;
                --neon-cyan-glow: rgba(0, 212, 255, 0.6);
                --neon-cyan-dim: rgba(0, 212, 255, 0.15);
                --glow-cyan: 0 0 10px var(--neon-cyan), 0 0 20px var(--neon-cyan-glow);
            }
            .futuristic-bg {
                background: #05050A;
                background-image: radial-gradient(circle at 50% 0%, #1a2332 0%, #05050A 70%);
            }
            .metal-frame {
                position: relative;
                background: linear-gradient(180deg, #1a2332 0%, #0d1117 100%);
                border: 2px solid var(--metal-highlight);
                border-radius: 12px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.5);
                transition: all 0.2s ease;
            }
            .metal-frame:hover {
                border-color: var(--neon-cyan-dim);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.5), 0 0 15px var(--neon-cyan-dim);
            }
            .frame-bolt {
                position: absolute;
                width: 10px;
                height: 10px;
                background: radial-gradient(circle, #5a6a7a 30%, #3a4a5a 70%);
                border-radius: 50%;
                border: 1px solid #2a3a4a;
                box-shadow: inset 0 1px 2px rgba(255,255,255,0.2);
            }
            /* ── Stats Panel (always-visible 5 stats) ── */
            .stats-panel {
                display: flex;
                background: #050A10;
                border: 2px solid var(--metal-highlight);
                border-radius: 6px;
                overflow: visible;
            }
            .stat-segment {
                flex: 1;
                padding: 8px 10px;
                text-align: center;
                border-right: 1px solid var(--metal-highlight);
                position: relative;
            }
            .stat-segment:last-child {
                border-right: none;
            }
            .stat-label {
                display: block;
                font-size: 0.7rem;
                color: rgba(255,255,255,0.5);
                text-transform: capitalize;
                letter-spacing: 0.08em;
                margin-bottom: 3px;
                font-family: 'Rajdhani', sans-serif;
                line-height: 1.2;
            }
            .stat-value {
                display: block;
                font-size: 1.35rem;
                font-weight: 700;
                color: var(--neon-cyan);
                text-shadow: 0 0 8px var(--neon-cyan-glow);
                font-family: 'Rajdhani', sans-serif;
                line-height: 1.1;
            }
            /* ── Tooltip System ── */
            .stat-tooltip-wrap {
                position: relative;
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                width: 100%;
            }
            .tooltip-dot {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: rgba(0, 212, 255, 0.2);
                border: 1px solid rgba(0, 212, 255, 0.4);
                color: #00D4FF;
                font-size: 8px;
                font-weight: 800;
                margin-left: 4px;
                cursor: help;
                vertical-align: middle;
                font-family: 'Rajdhani', sans-serif;
            }
            .stat-tooltip-box {
                display: flex;
                flex-direction: column;
                gap: 3px;
                position: absolute;
                bottom: calc(100% + 10px);
                left: 50%;
                transform: translateX(-50%);
                background: #08101A;
                border: 1px solid rgba(0, 212, 255, 0.5);
                border-radius: 8px;
                padding: 10px 12px;
                min-width: 200px;
                max-width: 270px;
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
                z-index: 9999;
                box-shadow: 0 8px 24px rgba(0,0,0,0.6), 0 0 12px rgba(0,212,255,0.15);
                transition: opacity 0.15s ease, visibility 0.15s ease;
                white-space: normal;
                text-align: left;
            }
            .stat-tooltip-box::after {
                content: '';
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                border: 6px solid transparent;
                border-top-color: rgba(0, 212, 255, 0.5);
            }
            .stat-tooltip-title {
                display: block;
                font-size: 11px;
                font-weight: 800;
                color: #00D4FF;
                letter-spacing: 0.05em;
                font-family: 'Rajdhani', sans-serif;
            }
            .stat-tooltip-desc {
                display: block;
                font-size: 10px;
                color: #94A3B8;
                line-height: 1.4;
                font-family: inherit;
            }
            .stat-tooltip-wrap:hover .stat-tooltip-box,
            .stat-tooltip-wrap:focus-within .stat-tooltip-box {
                opacity: 1;
                visibility: visible;
            }
            /* ── Expanded Drawer ── */
            .drawer-section-header {
                font-size: 9px;
                font-weight: 800;
                letter-spacing: 0.15em;
                color: #64748B;
                text-transform: capitalize;
                border-bottom: 1px solid #1a2332;
                padding-bottom: 6px;
                margin-bottom: 10px;
            }
            .drawer-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px 16px;
            }
            .drawer-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 3px 0;
            }
            .drawer-label {
                font-size: 11px;
                color: #94A3B8;
            }
            .drawer-value {
                font-size: 12px;
                font-weight: 700;
                color: white;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-6px); }
                to { opacity: 1; transform: translateY(0); }
            }
            /* ── Search Bar ── */
            .search-container {
                position: relative;
                margin-bottom: 16px;
            }
            .search-icon-wrap {
                position: absolute;
                left: 16px;
                top: 50%;
                transform: translateY(-50%);
                color: var(--neon-cyan);
                pointer-events: none;
                z-index: 2;
            }
            .metal-search {
                width: 100%;
                background: linear-gradient(180deg, #03030A 0%, #0d1117 100%);
                border: 1.5px solid var(--metal-highlight);
                border-radius: 10px;
                color: white;
                font-family: 'Rajdhani', sans-serif;
                font-size: 15px;
                font-weight: 600;
                letter-spacing: 0.06em;
                padding: 14px 14px 14px 48px;
                box-shadow: inset 0 2px 8px rgba(0,0,0,0.6), 0 0 0 0 transparent;
                transition: border-color 0.25s ease, box-shadow 0.25s ease;
                box-sizing: border-box;
                outline: none;
            }
            .metal-search::placeholder {
                color: #3d4f5f;
                font-size: 13px;
            }
            .metal-search:focus {
                border-color: var(--neon-cyan);
                box-shadow: inset 0 2px 8px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.2), 0 0 20px rgba(0,212,255,0.1);
            }
            /* ── Filter Pills ── */
            .filter-row {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 10px;
            }
            .filter-row-label {
                font-size: 9px;
                font-weight: 800;
                color: #475569;
                letter-spacing: 0.15em;
                text-transform: capitalize;
                align-self: center;
                margin-right: 2px;
            }
            .filter-pill {
                padding: 7px 16px;
                border-radius: 20px;
                font-size: 0.72rem;
                font-weight: 700;
                letter-spacing: 0.1em;
                text-transform: capitalize;
                cursor: pointer;
                border: 1.5px solid var(--metal-highlight);
                background: #0d1117;
                color: #94A3B8;
                transition: all 0.2s ease;
                white-space: nowrap;
                font-family: 'Rajdhani', sans-serif;
            }
            .filter-pill.active {
                background: var(--neon-cyan-dim);
                border-color: var(--neon-cyan);
                color: var(--neon-cyan);
                box-shadow: 0 0 10px var(--neon-cyan-dim);
            }
            .filter-pill:hover:not(.active) {
                border-color: #5a6a7a;
                color: #CBD5E1;
            }
            /* ── Division Header ── */
            .division-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin: 24px 0 12px;
                padding: 0 4px;
            }
            .division-header-line {
                flex: 1;
                height: 1px;
                background: linear-gradient(90deg, transparent, var(--metal-highlight));
            }
            .division-header-line.left {
                background: linear-gradient(90deg, var(--metal-highlight), transparent);
            }
            .division-header-label {
                font-size: 10px;
                font-weight: 800;
                color: #475569;
                letter-spacing: 0.18em;
                text-transform: capitalize;
                font-family: 'Rajdhani', sans-serif;
                white-space: nowrap;
            }
            /* ── Pipe Connectors ── */
            .pipe-connector {
                height: 12px;
                background: linear-gradient(90deg, var(--metal-highlight) 0%, var(--metal-light) 50%, var(--metal-highlight) 100%);
                border-radius: 6px;
                box-shadow: inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -1px 2px rgba(0,0,0,0.3);
                position: relative;
                margin: 0 24px;
                z-index: 10;
            }
            .pipe-joint {
                position: absolute;
                width: 20px;
                height: 20px;
                background: var(--metal-light);
                border: 2px solid var(--metal-highlight);
                border-radius: 50%;
                top: 50%;
                transform: translateY(-50%);
                box-shadow: 0 2px 4px rgba(0,0,0,0.5);
            }
            /* ── Skeleton ── */
            @keyframes shimmer {
                0% { opacity: 0.3; }
                50% { opacity: 0.6; }
                100% { opacity: 0.3; }
            }
            .skeleton-card {
                animation: shimmer 1.5s ease-in-out infinite;
            }
          `,
        }}
      />

      <div
        className="page-container futuristic-bg"
        style={{
          minHeight: '100vh',
          color: '#FFFFFF',
          paddingBottom: 90,
          fontFamily:
            "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
          width: '100%',
          maxWidth: '100vw',
          overflowX: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <SEOHead
          title="Teams | MLB Analytics"
          description="MLB Team profiles and tactical terminal."
          noIndex={true}
        />

        <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
        <MlbSubNav />

        <main
          style={{
            display: 'flex',
            gap: 0,
            justifyContent: 'center',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{ width: '100%', maxWidth: 680, margin: '0 auto', boxSizing: 'border-box' }}
          >
            {/* HUD Terminal Header */}
            <div
              style={{
                background: 'var(--metal-base)',
                borderBottom: '2px solid var(--metal-highlight)',
                padding: '24px 16px 20px',
                position: 'relative',
                zIndex: 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <Link
                    href="/hub/MLB-ANALYTICS"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: 'var(--neon-cyan)',
                      fontSize: 11,
                      fontWeight: 800,
                      textDecoration: 'none',
                      letterSpacing: '0.15em',
                      textTransform: 'capitalize',
                      marginBottom: 12,
                    }}
                  >
                    <ArrowLeft size={14} /> SYS_RETURN
                  </Link>
                  <h1
                    style={{
                      margin: '0 0 4px',
                      fontSize: 28,
                      fontWeight: 900,
                      fontFamily: "'Rajdhani', sans-serif",
                      letterSpacing: '0.05em',
                      textTransform: 'capitalize',
                    }}
                  >
                    CLUB{' '}
                    <span
                      style={{
                        color: 'var(--neon-cyan)',
                        textShadow: '0 0 15px var(--neon-cyan-glow)',
                      }}
                    >
                      Terminal
                    </span>
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.5)',
                        fontFamily: "'Rajdhani', sans-serif",
                        letterSpacing: '0.1em',
                      }}
                    >
                      T_SYNC: {todayStr}
                    </p>
                    {isValidating && (
                      <RefreshCw
                        size={12}
                        color="var(--neon-cyan)"
                        className="animate-spin"
                        style={{ opacity: 0.8 }}
                      />
                    )}
                    {isValidating && (
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--neon-cyan)',
                          fontWeight: 800,
                          letterSpacing: '0.1em',
                          opacity: 0.8,
                        }}
                      >
                        Syncing
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      color: globalEdgeActive ? 'var(--neon-cyan)' : '#475569',
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.1em',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 8,
                      padding: '4px 8px',
                      background: globalEdgeActive ? 'var(--neon-cyan-dim)' : '#1a2332',
                      borderRadius: 4,
                      border: `1px solid ${globalEdgeActive ? 'var(--neon-cyan)' : '#3d4f5f'}`,
                    }}
                  >
                    Mlb Edge
                    <div
                      role="img"
                      aria-label={globalEdgeActive ? 'MLB edge active' : 'No active MLB edge'}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {globalEdgeActive && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: '#22C55E',
                            position: 'absolute',
                            animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
                          }}
                          className="animate-ping"
                        />
                      )}
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: globalEdgeActive ? '#22C55E' : '#475569',
                          position: 'relative',
                          boxShadow: globalEdgeActive ? '0 0 8px #22C55E' : 'none',
                        }}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#94A3B8',
                      marginTop: 8,
                      letterSpacing: '0.05em',
                    }}
                  >
                    {activeTeams.length} CLUBS
                  </div>
                  {summary.gradedCount > 0 && (
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        marginTop: 2,
                        letterSpacing: '0.05em',
                      }}
                    >
                      <span style={{ color: 'var(--neon-cyan)' }}>{summary.eliteCount} ELITE</span>
                      <span style={{ color: '#475569' }}> · </span>
                      <span style={{ color: '#34D399' }}>{summary.strongCount} STRONG</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pipe Connectors */}
            <div style={{ position: 'relative', height: 24, marginTop: -6 }}>
              <div className="pipe-connector">
                <div className="pipe-joint" style={{ left: '-2px' }}></div>
                <div className="pipe-joint" style={{ right: '-2px' }}></div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  width: 4,
                  height: 24,
                  background: 'var(--metal-highlight)',
                  left: 40,
                  top: 0,
                  zIndex: 0,
                }}
              ></div>
              <div
                style={{
                  position: 'absolute',
                  width: 4,
                  height: 24,
                  background: 'var(--metal-highlight)',
                  right: 40,
                  top: 0,
                  zIndex: 0,
                }}
              ></div>
            </div>

            <div style={{ padding: '8px 16px 24px' }}>
              {/* Tactical Search Console */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #0d1117 0%, #080d14 100%)',
                  padding: '16px',
                  borderRadius: 12,
                  border: '1.5px solid var(--metal-highlight)',
                  marginBottom: 24,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}
              >
                {/* Search Input */}
                <div className="search-container">
                  <div className="search-icon-wrap">
                    <Search size={20} />
                  </div>
                  <input
                    type="text"
                    id="team-search"
                    aria-label="Search teams by name"
                    placeholder="SEARCH TEAMS..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="metal-search"
                  />
                </div>

                {/* League Filter */}
                <div className="filter-row">
                  <span className="filter-row-label">LEAGUE:</span>
                  {(['ALL', 'AL', 'NL'] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setFilterLeague(l)}
                      className={`filter-pill ${filterLeague === l ? 'active' : ''}`}
                    >
                      {l}
                    </button>
                  ))}
                  <div style={{ marginLeft: 8, borderLeft: '1px solid var(--metal-highlight)', paddingLeft: 12 }}>
                    <span className="filter-row-label">DIV:</span>
                  </div>
                  {(['ALL', 'East', 'Central', 'West'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setFilterDivision(d)}
                      className={`filter-pill ${filterDivision === d ? 'active' : ''}`}
                    >
                      {d === 'ALL' ? 'ALL' : d === 'Central' ? 'CEN' : d.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results */}
              {isInitialLoading ? (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                  aria-busy="true"
                  aria-label="Loading teams"
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="metal-frame skeleton-card"
                      style={{ height: 140, borderRadius: 12, opacity: 0.4 }}
                    />
                  ))}
                </div>
              ) : filteredTeams.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    background: 'var(--metal-base)',
                    border: '2px dashed var(--metal-highlight)',
                    borderRadius: 12,
                  }}
                >
                  <div
                    style={{
                      marginBottom: 16,
                      color: '#94A3B8',
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                  >
                    <SearchX size={40} />
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'white',
                      marginBottom: 8,
                      fontFamily: "'Rajdhani', sans-serif",
                      letterSpacing: '0.05em',
                    }}
                  >
                    No Targets Acquired
                  </div>
                  <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
                    Adjust Filter Parameters To Locate Squadrons.
                  </div>
                </div>
              ) : isGrouped ? (
                // Division-grouped layout
                <div>
                  {divisionGroups.map(({ div, label, teams }) => (
                    <div key={div}>
                      {/* Division Header */}
                      <div className="division-header">
                        <div className="division-header-line left" />
                        <span className="division-header-label">{label}</span>
                        <div className="division-header-line" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {teams.map((team: any) => (
                          <TeamCardComponent key={team.team_id} team={team} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Flat list when searching
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {filteredTeams.map((team: any) => (
                    <TeamCardComponent key={team.team_id} team={team} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        <BottomNavBar />
      </div>
    </>
  );
}
