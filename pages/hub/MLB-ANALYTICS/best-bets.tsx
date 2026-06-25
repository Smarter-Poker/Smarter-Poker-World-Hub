import { useRouter } from 'next/router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowLeft,
  X,
  TrendingUp,
  TrendingDown,
  Info,
  SearchX,
  CalendarX,
  Loader2,
  Activity,
  ChevronRight,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  Shield,
} from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';

import { ScoringGuideModal } from '../../../src/components/mlb/ScoringGuideModal';
import MlbPremiumGate from '../../../src/components/mlb/MlbPremiumGate';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import SectionHeader from '../../../src/components/ui/SectionHeader';

const fetcher = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    logError('MLB Best Bets fetch', err);
    throw err;
  }
};

// MLB team abbreviation → team_id mapping for logos
const MLB_TEAM_IDS: Record<string, number> = {
  NYY: 147,
  BOS: 111,
  TOR: 141,
  BAL: 110,
  TBR: 139,
  TB: 139,
  HOU: 117,
  TEX: 140,
  OAK: 133,
  LAA: 108,
  SEA: 136,
  CLE: 114,
  MIN: 142,
  CWS: 145,
  CHW: 145,
  DET: 116,
  KCR: 118,
  KC: 118,
  ATL: 144,
  NYM: 121,
  PHI: 143,
  MIA: 146,
  WSN: 120,
  WAS: 120,
  MIL: 158,
  CHC: 112,
  STL: 138,
  CIN: 113,
  PIT: 134,
  LAD: 119,
  SF: 137,
  SFG: 137,
  ARI: 109,
  AZ: 109,
  COL: 115,
  SDP: 135,
  SD: 135,
  ATH: 133,
  ATHLETICS: 133,
  "A'S": 133,
  OAKLAND: 133,
  OAKLAND_ATHLETICS: 133,
  WSH: 120,
  // Add full names to prevent MLB default logo fallback
  YANKEES: 147,
  RED_SOX: 111,
  "RED SOX": 111,
  BLUE_JAYS: 141,
  "BLUE JAYS": 141,
  ORIOLES: 110,
  RAYS: 139,
  ASTROS: 117,
  RANGERS: 140,
  ANGELS: 108,
  MARINERS: 136,
  GUARDIANS: 114,
  TWINS: 142,
  WHITE_SOX: 145,
  "WHITE SOX": 145,
  TIGERS: 116,
  ROYALS: 118,
  BRAVES: 144,
  METS: 121,
  PHILLIES: 143,
  MARLINS: 146,
  NATIONALS: 120,
  BREWERS: 158,
  CUBS: 112,
  CARDINALS: 138,
  REDS: 113,
  PIRATES: 134,
  DODGERS: 119,
  GIANTS: 137,
  DIAMONDBACKS: 109,
  ROCKIES: 115,
  PADRES: 135,
};

const detectBetCategory = (bet: any) => {
  const typeStr = ((bet.bet_type || '') + ' ' + (bet.market || '')).toLowerCase();
  const isPitcherProp =
    typeStr.includes('pitcher') ||
    typeStr.includes('strikeout') ||
    typeStr.includes('outs_recorded') ||
    typeStr.includes('ip_') ||
    typeStr.includes('walks') ||
    typeStr.includes('earned_runs') ||
    typeStr.includes('pitching_outs');
  const isPlayerProp =
    bet.bet_type === 'prop' ||
    isPitcherProp ||
    typeStr.includes('prop') ||
    typeStr.includes('hits') ||
    typeStr.includes('bases') ||
    typeStr.includes('runs_batted_in') ||
    typeStr.includes('rbis') ||
    typeStr.includes('home_run') ||
    typeStr.includes('hrr') ||
    typeStr.includes('player');
  const isTeamBet =
    !isPlayerProp &&
    (bet.bet_type === 'line' ||
      bet.bet_type === 'game' ||
      typeStr.includes('moneyline') ||
      typeStr.includes('h2h') ||
      typeStr.includes('ml') ||
      typeStr.includes('total') ||
      typeStr.includes('run_line') ||
      typeStr.includes('runline') ||
      typeStr.includes('spread'));
  return { isTeamBet, isPlayerProp, isPitcherProp };
};

const getPlayerImageUrl = (playerId: number | null | undefined) => {
  if (!playerId) return null;
  return playerHeadshot(playerId) || '/default-avatar.png';
};

const getTeamLogoUrl = (teamId: number | null | undefined) => {
  if (!teamId) return null;
  return teamLogo(teamId) || '';
};

const formatOdds = (o: any) => {
  if (!o) return '—';
  const num = Number(o);
  if (isNaN(num)) return String(o);
  return num > 0 ? `+${num}` : `${num}`;
};


const TEAM_NICKNAMES = [
  'Red Sox', 'Blue Jays', 'White Sox', 'Angels', 'Astros', 'Athletics', 
  'Braves', 'Brewers', 'Cardinals', 'Cubs', 'Diamondbacks', 'Dodgers', 
  'Giants', 'Guardians', 'Mariners', 'Marlins', 'Mets', 'Nationals', 
  'Orioles', 'Padres', 'Phillies', 'Pirates', 'Rangers', 'Rays', 'Reds', 
  'Rockies', 'Royals', 'Tigers', 'Twins', 'Yankees'
];

const stripCity = (fullName) => {
  if (!fullName) return '';
  const lower = fullName.toLowerCase();
  for (const nick of TEAM_NICKNAMES) {
    if (lower.includes(nick.toLowerCase())) {
      return nick;
    }
  }
  return fullName;
};

const formatMatchup = (matchup) => {
  if (!matchup) return '';
  if (matchup.includes(' @ ')) {
    return matchup.split(' @ ').map(p => stripCity(p.trim())).join(' @ ');
  }
  return stripCity(matchup);
};

const formatWinPct = (wc: any) => {
  if (wc == null) return 'N/A';
  const n = Number(wc);
  if (n > 0 && n <= 1) return (n * 100).toFixed(1) + '%';
  return n.toFixed(1) + '%';
};

const toTitleCase = (str: string | null | undefined): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const selectionLabel = (selection: string | null, matchup?: string): string => {
  if (!selection) return '—';
  let s = selection.toLowerCase();

  let teamName = '';
  if (s === 'home' || s.startsWith('home_')) {
    teamName = 'Home';
    if (matchup) {
      const parts = matchup.split(' @ ');
      if (parts.length === 2) teamName = parts[1];
    }
    teamName = stripCity(teamName);
    const suffix = s.replace(/^home_?/, '');
    return toTitleCase(teamName) + (suffix ? ' ' + suffix : '');
  }
  if (s === 'away' || s.startsWith('away_')) {
    teamName = 'Away';
    if (matchup) {
      const parts = matchup.split(' @ ');
      if (parts.length === 2) teamName = parts[0];
    }
    teamName = stripCity(teamName);
    const suffix = s.replace(/^away_?/, '');
    return toTitleCase(teamName) + (suffix ? ' ' + suffix : '');
  }

  // Totals formatting
  const matchupScope = matchup ? ` (${formatMatchup(matchup)})` : '';
  if (s.startsWith('over')) return toTitleCase(`Over ${s.replace(/^over_?/, '')}`) + matchupScope;
  if (s.startsWith('under'))
    return toTitleCase(`Under ${s.replace(/^under_?/, '')}`) + matchupScope;

  return toTitleCase(stripCity(selection.replace(/_/g, ' ')));
};

// Canonical tier palette — identical five tiers/colors to src/lib/betScore.ts (TIER_STYLE)
// and the props page: ELITE cyan, STRONG emerald, LEAN sky, THIN amber, PASS slate. No gold.
const getTierColors = (tier: string) => {
  switch (tier) {
    case 'ELITE':
      return {
        color: '#00D4FF',
        glow: 'rgba(0,212,255,0.35)',
        bg: 'rgba(0,212,255,0.12)',
        border: 'rgba(0,212,255,0.4)',
      };
    case 'STRONG':
      return {
        color: '#34D399',
        glow: 'rgba(52,211,153,0.35)',
        bg: 'rgba(52,211,153,0.12)',
        border: 'rgba(52,211,153,0.4)',
      };
    case 'LEAN':
      return {
        color: '#38BDF8',
        glow: 'rgba(56,189,248,0.30)',
        bg: 'rgba(56,189,248,0.10)',
        border: 'rgba(56,189,248,0.4)',
      };
    case 'THIN':
      return {
        color: '#F59E0B',
        glow: 'rgba(245,158,11,0.30)',
        bg: 'rgba(245,158,11,0.10)',
        border: 'rgba(245,158,11,0.4)',
      };
    default:
      return {
        color: '#64748B',
        glow: 'rgba(100,116,139,0.20)',
        bg: 'rgba(100,116,139,0.08)',
        border: 'rgba(100,116,139,0.3)',
      };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// Fullscreen Modal Component
// ──────────────────────────────────────────────────────────────────────────────
const BetDetailView = ({ bet, onClose }: { bet: any; onClose: () => void }) => {
  const [showLogs, setShowLogs] = useState(false);
  const { isTeamBet, isPlayerProp, isPitcherProp } = detectBetCategory(bet);
  const [imgError, setImgError] = useState(false);
  const { color: tierColor, glow: tierGlow, bg: tierBg } = getTierColors(bet.bet_tier || '');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  let lineStr = '';
  if (bet.line !== null && bet.line !== undefined) {
    const numLine = Number(bet.line);
    const typeStr = ((bet.bet_type || '') + ' ' + (bet.market || '')).toLowerCase();
    const isSpread =
      typeStr.includes('run_line') || typeStr.includes('runline') || typeStr.includes('spread');
    lineStr = isSpread && numLine > 0 ? `+${numLine}` : `${numLine}`;
  }

  const playerImageUrl = !imgError ? getPlayerImageUrl(bet.player_id) : null;
  const teamId = bet.team_id || (bet.team ? MLB_TEAM_IDS[bet.team.toUpperCase()] : null);
  const teamLogoUrl = getTeamLogoUrl(teamId);

  const wins = bet.pitcher_wins != null ? bet.pitcher_wins : null;
  const losses = bet.pitcher_losses != null ? bet.pitcher_losses : null;
  const era = bet.pitcher_era != null ? Number(bet.pitcher_era).toFixed(2) : null;

  return (
    <div className="min-h-screen bg-[#0a0a15] text-slate-200 font-sans w-full max-w-[100vw] overflow-x-hidden box-border flex flex-col capitalize">
      <UniversalHeader pageDepth={3} onBackClick={onClose} />
      <div
        className="relative flex flex-col w-full max-w-lg mx-auto flex-1 pb-[70px]"
        style={{ background: 'linear-gradient(180deg, #0d1117 0%, #131e2e 100%)' }}
      >
        {/* Top border glow */}
        <div
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${tierColor}, transparent)`,
            boxShadow: `0 0 20px ${tierGlow}`,
          }}
        />

        

        {/* Hero Section */}
        <div className="flex flex-col items-center pt-5 pb-4 px-4 border-b border-[#2a3a4a] relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at 50% 0%, ${tierGlow.replace('0.35', '0.06')} 0%, transparent 70%)`,
            }}
          />

          <div className="relative mb-3">
            {isTeamBet ? (
              teamLogoUrl ? (
                <div className="w-32 h-32 flex items-center justify-center bg-[#0d1117] rounded-full border-4 border-[#3d4f5f] p-3 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                  <img
                    src={teamLogoUrl}
                    alt={bet?.team || 'MLB'}
                    className="w-full h-full object-contain"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="w-32 h-32 flex items-center justify-center bg-[#0d1117] rounded-full border-4 border-[#3d4f5f]">
                  <span
                    className="text-[51px] font-black text-[#00D4FF]"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    MLB
                  </span>
                </div>
              )
            ) : playerImageUrl ? (
              <div
                className="relative w-32 h-32 rounded-full overflow-hidden border-4 shadow-[0_0_30px_rgba(0,0,0,0.6)]"
                style={{ borderColor: tierColor }}
              >
                <img
                  src={playerImageUrl}
                  alt={bet?.player_name || bet?.selection}
                  className="w-full h-full object-cover object-top"
                  loading="lazy"
                  onError={() => setImgError(true)}
                />
              </div>
            ) : (
              <div
                className="w-32 h-32 flex items-center justify-center bg-[#0d1117] rounded-full border-4"
                style={{ borderColor: tierColor }}
              >
                <Target size={48} style={{ color: tierColor }} />
              </div>
            )}
            <div
              className="absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-sm text-[16px] font-black tracking-widest capitalize"
              style={{ background: tierColor, color: '#000' }}
            >
              {bet.bet_tier || 'BET'}
            </div>
          </div>

          <div className="text-center mt-2">
            <div
              className="text-[44px] font-black text-white capitalize tracking-wider mb-0.5"
              style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '22px' }}
            >
              {bet?.player_name ||
                (isTeamBet
                  ? stripCity(selectionLabel(bet?.selection, bet?.matchup))
                  : bet?.selection?.split(' ').slice(0, -1).join(' ') || bet?.selection) ||
                bet?.team ||
                'Unknown'}
            </div>
            {!isTeamBet && bet?.team_name && (
              <div className="flex items-center gap-2 mt-1">
                {teamLogoUrl && (
                  <img
                    src={teamLogoUrl}
                    alt={`${bet.team_name} logo`}
                    className="w-5 h-5 object-contain"
                  />
                )}
                <span className="text-[21px] font-black text-slate-300 tracking-wider capitalize">
                  {stripCity(bet.team_name)}
                </span>
              </div>
            )}
            {bet?.matchup && (
              <div className="text-[21px] font-black text-[#5a6a7a] mt-2 tracking-widest capitalize">
                {formatMatchup(bet.matchup)}
              </div>
            )}
          </div>
        </div>

        {/* Bet Info */}
        <div className="px-4 py-3 border-b border-[#2a3a4a]">
          <div className="text-[16px] font-black text-[#00D4FF] mb-2 capitalize tracking-widest ">
            Bet Details
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2 px-4 md:px-0">
            <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5">
              <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                Selection
              </div>
              <div
                className="text-[34px] font-black text-white capitalize leading-tight"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
              >
                {stripCity(selectionLabel(bet?.selection, bet?.matchup))} {lineStr}
              </div>
            </div>
            <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5">
              <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                Market
              </div>
              <div
                className="text-[22px] font-black text-slate-300 capitalize leading-tight"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
              >
                {bet.market?.replace(/_/g, ' ') || bet.bet_type?.replace(/_/g, ' ') || '—'}
              </div>
            </div>
          </div>
          {(bet.best_price || bet.best_book) && (
            <div className="bg-[#0d1420] border-2 border-[#3d4f5f] rounded-sm p-3 flex justify-between items-center">
              <div>
                <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                  Best Odds
                </div>
                <div
                  className="text-[44px] font-black text-white"
                  style={{ fontFamily: '"Rajdhani", sans-serif' }}
                >
                  {formatOdds(bet.best_price)}
                </div>
              </div>
              {bet.best_book && (
                <div className="text-right">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Book
                  </div>
                  <div
                    className="text-[23px] font-black text-[#00D4FF] capitalize tracking-wider"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {bet.best_book}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Key Metrics */}
        <div className="px-4 py-3 border-b border-[#2a3a4a]">
          <div className="text-[16px] font-black text-[#00D4FF] mb-2 capitalize tracking-widest ">
            Key Metrics
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2 px-4 md:px-0">
            <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
              <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                Score
              </div>
              <div
                className="text-[40px] font-black"
                style={{ fontFamily: '"Rajdhani", sans-serif', color: tierColor }}
              >
                {bet.bet_score ?? '—'}
              </div>
              <div className="text-[14px] text-[#3d4f5f] capitalize tracking-widest ">/100</div>
            </div>
            <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
              <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                Win%
              </div>
              <div
                className="text-[34px] font-black text-white"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
              >
                {formatWinPct(bet.win_confidence)}
              </div>
            </div>
            {bet.ev_pct !== null && bet.ev_pct !== undefined && (
              <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                  Ev%
                </div>
                <div
                  className="text-[34px] font-black"
                  style={{
                    fontFamily: '"Rajdhani", sans-serif',
                    color: Number(bet.ev_pct) > 0 ? '#00D4FF' : '#FF6B6B',
                  }}
                >
                  {Number(bet.ev_pct) > 0 ? '+' : ''}
                  {Number(bet.ev_pct).toFixed(1)}%
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 px-4 md:px-0">
            {bet.edge_pts !== null && bet.edge_pts !== undefined && (
              <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                  Edge
                </div>
                <div
                  className="text-[27px] font-black text-[#00D4FF]"
                  style={{ fontFamily: '"Rajdhani", sans-serif' }}
                >
                  {Number(bet.edge_pts) > 0 ? '+' : ''}
                  {Number(bet.edge_pts).toFixed(1)}pts
                </div>
              </div>
            )}
            {bet.kelly_pct !== null && bet.kelly_pct !== undefined && (
              <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                  Stake
                </div>
                <div
                  className="text-[27px] font-black text-slate-300"
                  style={{ fontFamily: '"Rajdhani", sans-serif' }}
                >
                  {Number(bet.kelly_pct).toFixed(1)}u
                </div>
              </div>
            )}
            {bet.rank !== null && bet.rank !== undefined && (
              <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                  Rank
                </div>
                <div
                  className="text-[27px] font-black text-slate-300"
                  style={{ fontFamily: '"Rajdhani", sans-serif' }}
                >
                  #{bet.rank}
                </div>
              </div>
            )}
          </div>
          {bet.market_prob !== null && bet.market_prob !== undefined && (
            <div className="mt-2 bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Market No-Vig
                  </div>
                  <div
                    className="text-[23px] font-black text-slate-300"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {(Number(bet.market_prob) * 100).toFixed(1)}%
                  </div>
                </div>
                {bet.model_prob !== null && bet.model_prob !== undefined && (
                  <div className="text-right">
                    <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                      Model Prob
                    </div>
                    <div
                      className="text-[23px] font-black text-[#00D4FF]"
                      style={{ fontFamily: '"Rajdhani", sans-serif' }}
                    >
                      {(Number(bet.model_prob) * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Analysis */}
        {(() => {
          let factors: any[] = [];
          if (typeof bet.score_factors === 'string') {
            try {
              factors = JSON.parse(bet.score_factors);
            } catch {}
          } else if (Array.isArray(bet.score_factors)) {
            factors = bet.score_factors;
          }
          if (!factors || factors.length === 0) return null;
          return (
            <div className="px-4 py-3 border-b border-[#2a3a4a]">
              <div className="text-[16px] font-black text-[#00D4FF] mb-2 capitalize tracking-widest ">
                {bet.score_verdict || 'Analysis'}
              </div>
              <div className="flex flex-col gap-1.5">
                {factors.map((factor: any, i: number) => (
                  <div
                    key={i}
                    className="flex gap-2.5 items-start bg-[#0a0f1a] p-2.5 rounded-sm border border-[#2a3a4a]"
                  >
                    <div className="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-sm border border-[#3d4f5f] bg-[#0d1117]">
                      {factor?.dir === 'up' && <TrendingUp size={10} className="text-[#00D4FF]" />}
                      {factor?.dir === 'down' && (
                        <TrendingDown size={10} className="text-[#FF6B6B]" />
                      )}
                      {factor?.dir === 'info' && <Info size={10} className="text-slate-400" />}
                    </div>
                    <div className="text-[21px] text-slate-300 leading-relaxed font-bold tracking-wide flex-1 capitalize">
                      {factor?.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Team Profile */}
        {isTeamBet && bet.team_w != null && (
          <div className="px-4 py-3 border-b border-[#2a3a4a]">
            <div className="text-[16px] font-black text-[#FFD700] mb-2 capitalize tracking-widest flex items-center gap-1.5 ">
              <Shield size={10} /> Team Profile
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 md:px-0">
              <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                  Record (Streak)
                </div>
                <div
                  className="text-[30px] font-black text-[#00D4FF]"
                  style={{ fontFamily: '"Rajdhani", sans-serif' }}
                >
                  {bet.team_w}-{bet.team_l}
                  {Number.isFinite(bet.team_streak) && bet.team_streak !== 0 && (
                    <span
                      className={`text-[21px] ml-1 ${bet.team_streak > 0 ? 'text-[#00D4FF]' : 'text-[#FF6B6B]'}`}
                    >
                      (
                      {bet.team_streak > 0
                        ? `W${bet.team_streak}`
                        : `L${Math.abs(bet.team_streak)}`}
                      )
                    </span>
                  )}
                </div>
              </div>

              {Number.isFinite(bet.team_run_diff) && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Run Differential
                  </div>
                  <div
                    className={`text-[30px] font-black ${bet.team_run_diff > 0 ? 'text-white' : 'text-slate-300'}`}
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {bet.team_run_diff > 0 ? '+' : ''}
                    {bet.team_run_diff}
                  </div>
                </div>
              )}

              {bet.team_era != null && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Team ERA
                  </div>
                  <div
                    className="text-[30px] font-black text-slate-300"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {Number(bet.team_era).toFixed(2)}
                  </div>
                </div>
              )}

              {bet.team_avg != null && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Team AVG
                  </div>
                  <div
                    className="text-[30px] font-black text-slate-300"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    .{String(Number(bet.team_avg).toFixed(3)).split('.')[1] || '000'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pitcher Profile */}
        {(isPitcherProp || (isTeamBet && era !== null)) && (
          <div className="px-4 py-3 border-b border-[#2a3a4a]">
            <div className="text-[16px] font-black text-[#FFD700] mb-2 capitalize tracking-widest flex items-center gap-1.5 ">
              <Zap size={10} /> {isTeamBet ? 'Starting Pitcher' : 'Pitcher Profile'}
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 md:px-0">
              {era !== null && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Era
                  </div>
                  <div
                    className="text-[30px] font-black text-[#00D4FF]"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {era}
                  </div>
                </div>
              )}
              {wins !== null && losses !== null && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    W–L
                  </div>
                  <div
                    className="text-[40px] font-black text-white"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {wins}–{losses}
                  </div>
                </div>
              )}
              {bet.pitcher_fip !== null && bet.pitcher_fip !== undefined && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Fip
                  </div>
                  <div
                    className="text-[30px] font-black text-slate-300"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {Number(bet.pitcher_fip).toFixed(2)}
                  </div>
                </div>
              )}
              {bet.pitcher_so !== null && bet.pitcher_so !== undefined && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Season K
                  </div>
                  <div
                    className="text-[30px] font-black text-slate-300"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {bet.pitcher_so}
                  </div>
                </div>
              )}
              {bet.pitcher_k_per_ip !== null && bet.pitcher_k_per_ip !== undefined && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    K/IP
                  </div>
                  <div
                    className="text-[30px] font-black text-slate-300"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {Number(bet.pitcher_k_per_ip).toFixed(2)}
                  </div>
                </div>
              )}
              {bet.pitcher_k_per_g !== null && bet.pitcher_k_per_g !== undefined && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    K/G
                  </div>
                  <div
                    className="text-[30px] font-black text-slate-300"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {Number(bet.pitcher_k_per_g).toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            {/* Last 10 Games Log */}
            {bet.pitcher_last10 && bet.pitcher_last10.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowLogs(!showLogs)}
                  className="w-full flex items-center justify-between bg-[#0a0f1a] border border-[#2a3a4a] px-3 py-2 rounded-sm text-left hover:bg-[#111827] transition-colors"
                >
                  <span className="text-[14px] font-black text-white capitalize tracking-widest flex items-center gap-2">
                    <Activity size={12} className="text-[#00D4FF]" />
                    {showLogs ? 'Hide Last 10 Games' : 'Show Last 10 Games'}
                  </span>
                  {showLogs ? (
                    <ChevronUp size={16} className="text-[#5a6a7a]" />
                  ) : (
                    <ChevronDown size={16} className="text-[#5a6a7a]" />
                  )}
                </button>

                {showLogs && (
                  <div className="mt-2 border border-[#2a3a4a] rounded-sm overflow-hidden">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-[#111827] border-b border-[#2a3a4a]">
                        <tr>
                          <th className="px-3 py-2 font-black tracking-wider text-[#5a6a7a] capitalize">Date</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#5a6a7a] capitalize">IP</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#5a6a7a] capitalize">H</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#5a6a7a] capitalize">ER</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#5a6a7a] capitalize">BB</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#00D4FF] capitalize">K</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#5a6a7a] capitalize">Pit</th>
                        </tr>
                      </thead>
                      <tbody className="bg-[#0a0f1a]">
                        {bet.pitcher_last10.map((log: any, idx: number) => (
                          <tr
                            key={idx}
                            className="border-b border-[#1a2530] last:border-b-0 hover:bg-[#111827] transition-colors"
                          >
                            <td className="px-3 py-2 font-bold text-slate-300">
                              {log.date ? log.date.substring(5, 10).replace('-', '/') : '-'}
                            </td>
                            <td className="px-3 py-2 text-white font-medium">{log.IP ?? '-'}</td>
                            <td className="px-3 py-2 text-white font-medium">{log.H ?? '-'}</td>
                            <td className="px-3 py-2 text-white font-medium">{log.ER ?? '-'}</td>
                            <td className="px-3 py-2 text-white font-medium">{log.BB ?? '-'}</td>
                            <td className="px-3 py-2 text-[#00D4FF] font-black">{log.K ?? '-'}</td>
                            <td className="px-3 py-2 text-slate-400 font-medium">{log.Pitches ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Hitter Profile */}
        {isPlayerProp && !isPitcherProp && (
          <div className="px-4 py-3 border-b border-[#2a3a4a]">
            <div className="text-[16px] font-black text-[#FFD700] mb-2 capitalize tracking-widest flex items-center gap-1.5 ">
              <Activity size={10} /> Hitter Profile
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 md:px-0">
              {bet.hitter_avg != null && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Avg
                  </div>
                  <div
                    className="text-[30px] font-black text-white"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {Number(bet.hitter_avg).toFixed(3).replace(/^0/, '')}
                  </div>
                </div>
              )}
              {bet.hitter_hr != null && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Hr
                  </div>
                  <div
                    className="text-[30px] font-black text-[#FFD700]"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {bet.hitter_hr}
                  </div>
                </div>
              )}
              {bet.hitter_rbi != null && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Rbi
                  </div>
                  <div
                    className="text-[30px] font-black text-white"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {bet.hitter_rbi}
                  </div>
                </div>
              )}
              {bet.hitter_obp != null && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Obp
                  </div>
                  <div
                    className="text-[30px] font-black text-slate-300"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {Number(bet.hitter_obp).toFixed(3).replace(/^0/, '')}
                  </div>
                </div>
              )}
              {bet.hitter_slg != null && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    Slg
                  </div>
                  <div
                    className="text-[30px] font-black text-slate-300"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {Number(bet.hitter_slg).toFixed(3).replace(/^0/, '')}
                  </div>
                </div>
              )}
              {bet.hitter_woba != null && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    wOBA
                  </div>
                  <div
                    className="text-[30px] font-black text-[#00D4FF]"
                    style={{ fontFamily: '"Rajdhani", sans-serif' }}
                  >
                    {Number(bet.hitter_woba).toFixed(3).replace(/^0/, '')}
                  </div>
                </div>
              )}
              {bet.hitter_wrc_plus != null && (
                <div className="bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2.5 text-center">
                  <div className="text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5 ">
                    wRC+
                  </div>
                  <div
                    className="text-[30px] font-black"
                    style={{
                      fontFamily: '"Rajdhani", sans-serif',
                      color: Number(bet.hitter_wrc_plus) >= 115 ? '#00D4FF' : '#8a9ba8',
                    }}
                  >
                    {Math.round(Number(bet.hitter_wrc_plus))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-4 py-4 grid grid-cols-2 gap-3 mt-4">
          <Link
            href={`/hub/MLB-ANALYTICS/game/${bet.game_pk || bet.game_id}`}
            className="flex items-center justify-center gap-2 bg-[#0d1117] border border-[#3d4f5f] p-3 rounded-sm hover:border-[#00D4FF] hover:bg-[#00D4FF]/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Activity size={16} className="text-[#00D4FF]" />
            <span className="font-['Rajdhani'] text-[21px] font-black text-white capitalize tracking-widest leading-none">
              Matchup
            </span>
          </Link>
          {bet.player_id ? (
            <Link
              href={`/hub/MLB-ANALYTICS/players/${bet.player_id}`}
              className="flex items-center justify-center gap-2 bg-[#0d1117] border border-[#3d4f5f] p-3 rounded-sm hover:border-[#FFD700] hover:bg-[#FFD700]/10 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Zap size={16} className="text-[#FFD700]" />
              <span className="font-['Rajdhani'] text-[21px] font-black text-white capitalize tracking-widest leading-none">
                Profile
              </span>
            </Link>
          ) : (
            <div className="flex items-center justify-center gap-2 bg-[#0a0f1a] border border-[#2a3a4a] p-3 rounded-sm opacity-50 cursor-not-allowed">
              <Shield size={16} className="text-slate-500" />
              <span className="font-['Rajdhani'] text-[21px] font-black text-slate-500 capitalize tracking-widest leading-none">
                Team
              </span>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="px-4 py-4 mt-auto">
          <div className="text-[16px] text-[#5a6a7a] text-center leading-relaxed font-black tracking-wide  capitalize">
            Analysis Only — Not Betting Advice.
            <br />
            <span className="text-[#8a9ba8]">
              Bet Score ranks value (EV + confidence). Bet responsibly.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Bet Card — Fully Visible Stats
// ──────────────────────────────────────────────────────────────────────────────
const BetCard = ({
  bet,
  rank,
  onClick,
  rankLabel = 'RANK',
}: {
  bet: any;
  rank?: number;
  onClick: () => void;
  rankLabel?: string;
}) => {
  const { color: tierColor, bg: tierBg, border: tierBorder } = getTierColors(bet.bet_tier || '');
  const { isTeamBet, isPitcherProp, isPlayerProp } = detectBetCategory(bet);
  const [imgError, setImgError] = useState(false);

  let lineStr = '';
  if (bet.line !== null && bet.line !== undefined) {
    const numLine = Number(bet.line);
    const spreadCheck = ((bet.bet_type || '') + ' ' + (bet.market || '')).toLowerCase();
    const isSpread =
      spreadCheck.includes('run_line') ||
      spreadCheck.includes('runline') ||
      spreadCheck.includes('spread');
    lineStr = isSpread && numLine > 0 ? `+${numLine}` : `${numLine}`;
  }

  // Detect market label
  const typeStr = ((bet.bet_type || '') + ' ' + (bet.market || '')).toLowerCase();
  let marketLabel = 'ML';
  if (typeStr.includes('total')) marketLabel = 'TOT';
  else if (
    typeStr.includes('run_line') ||
    typeStr.includes('runline') ||
    typeStr.includes('spread')
  )
    marketLabel = 'RL';
  else if (
    typeStr.includes('prop') ||
    typeStr.includes('strikeout') ||
    typeStr.includes('pitcher') ||
    typeStr.includes('hits') ||
    typeStr.includes('home_run')
  )
    marketLabel = 'PROP';

  // Image logic
  const playerImageUrl = getPlayerImageUrl(bet.player_id);
  const teamId = bet.team_id || (bet.team ? MLB_TEAM_IDS[bet.team?.toUpperCase()] : null);
  const teamLogoUrl = getTeamLogoUrl(teamId);
  const showPlayerImg = !isTeamBet && playerImageUrl && !imgError;
  const isTotalBet = bet.market === 'total';

  // For totals bets with no team logo, derive the away team logo from the matchup string
  let totalsLogoId: number | null = null;
  if (isTotalBet && bet.matchup && !teamLogoUrl) {
    const awayStr = (bet.matchup.split(' @ ')[0] || '').trim();
    const lower = awayStr.toLowerCase();
    // Try abbreviation lookup first
    totalsLogoId = MLB_TEAM_IDS[awayStr.toUpperCase()] ?? null;
    if (!totalsLogoId) {
      // Nickname/city keyword fallback
      const nicknameMap: Record<string, number> = {
        brewers: 158, cubs: 112, yankees: 147, 'red sox': 111, 'blue jays': 141,
        orioles: 110, astros: 117, rangers: 140, athletics: 133, angels: 108,
        mariners: 136, guardians: 114, twins: 142, 'white sox': 145, tigers: 116,
        royals: 118, braves: 144, mets: 121, phillies: 143, marlins: 146,
        nationals: 120, cardinals: 138, reds: 113, pirates: 134, dodgers: 119,
        giants: 137, diamondbacks: 109, rockies: 115, padres: 135, rays: 139,
      };
      for (const [kw, id] of Object.entries(nicknameMap)) {
        if (lower.includes(kw)) { totalsLogoId = id; break; }
      }
    }
  }
  const effectiveTeamLogoUrl = teamLogoUrl || (isTotalBet && totalsLogoId ? getTeamLogoUrl(totalsLogoId) : null);
  const showTeamLogo = !showPlayerImg && !!effectiveTeamLogoUrl;

  // Stats arrays
  const pitcherStats: { label: string; value: string; color?: string }[] = [];
  if (isPitcherProp || (isTeamBet && bet.pitcher_era != null)) {
    if (bet.pitcher_wins != null && bet.pitcher_losses != null)
      pitcherStats.push({
        label: 'W-L',
        value: `${bet.pitcher_wins}-${bet.pitcher_losses}`,
        color: '#fff',
      });
    if (bet.pitcher_era != null)
      pitcherStats.push({
        label: 'ERA',
        value: Number(bet.pitcher_era).toFixed(2),
        color: '#00D4FF',
      });
    if (bet.pitcher_so != null)
      pitcherStats.push({ label: 'K', value: String(bet.pitcher_so), color: '#fff' });
    if (bet.pitcher_k_per_ip != null)
      pitcherStats.push({ label: 'K/IP', value: Number(bet.pitcher_k_per_ip).toFixed(2), color: '#fff' });
    if (bet.pitcher_k_per_g != null)
      pitcherStats.push({ label: 'K/G', value: Number(bet.pitcher_k_per_g).toFixed(2), color: '#fff' });
    if (bet.pitcher_whip != null)
      pitcherStats.push({
        label: 'WHIP',
        value: Number(bet.pitcher_whip).toFixed(2),
        color: '#fff',
      });
    if (bet.pitcher_fip != null)
      pitcherStats.push({ label: 'FIP', value: Number(bet.pitcher_fip).toFixed(2), color: '#fff' });
  }

  const hitterStats: { label: string; value: string; color?: string }[] = [];
  if (!isTeamBet && !isPitcherProp) {
    if (bet.hitter_avg != null)
      hitterStats.push({
        label: 'AVG',
        value: Number(bet.hitter_avg).toFixed(3).replace(/^0/, ''),
        color: '#fff',
      });
    if (bet.hitter_hr != null)
      hitterStats.push({ label: 'HR', value: String(bet.hitter_hr), color: '#FFD700' });
    if (bet.hitter_rbi != null)
      hitterStats.push({ label: 'RBI', value: String(bet.hitter_rbi), color: '#fff' });
    if (bet.hitter_obp != null)
      hitterStats.push({
        label: 'OBP',
        value: Number(bet.hitter_obp).toFixed(3).replace(/^0/, ''),
        color: '#fff',
      });
    if (bet.hitter_slg != null)
      hitterStats.push({
        label: 'SLG',
        value: Number(bet.hitter_slg).toFixed(3).replace(/^0/, ''),
        color: '#fff',
      });
    if (bet.hitter_woba != null)
      hitterStats.push({
        label: 'wOBA',
        value: Number(bet.hitter_woba).toFixed(3).replace(/^0/, ''),
        color: '#00D4FF',
      });
    if (bet.hitter_wrc_plus != null)
      hitterStats.push({
        label: 'wRC+',
        value: String(Math.round(Number(bet.hitter_wrc_plus))),
        color: Number(bet.hitter_wrc_plus) >= 115 ? '#00D4FF' : '#fff',
      });
  }

  const allStats =
    isPitcherProp || (isTeamBet && bet.pitcher_era != null) ? pitcherStats : hitterStats;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`View bet details: ${bet?.selection || 'bet'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="w-full bg-gradient-to-b from-[#131e2e] to-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_6px_20px_rgba(0,0,0,0.6)] hover:border-[#3d5a6a] focus:outline-none focus:border-[#00D4FF] focus:ring-1 focus:ring-[#00D4FF] transition-all duration-200 cursor-pointer touch-manipulation snap-start group"
      onClick={() => {
        onClick();
        if (navigator.vibrate)
          try {
            navigator.vibrate(8);
          } catch (e) {}
      }}
    >
      {/* Top tier bar */}
      <div
        className="h-1 w-full"
        style={{ background: tierColor, boxShadow: `0 0 8px ${tierColor}` }}
      />

      <div className="p-3">
        <div className="flex justify-between items-start mb-2">
          {rank !== undefined && (
            <div className="bg-[#0a0a15] border border-[#2a3a4a] rounded-sm px-2 py-0.5 text-[17px] font-black text-slate-300">
              {rankLabel} <span style={{ color: tierColor }}>#{rank}</span>
            </div>
          )}
          {bet.game_time && (
            <div className="ml-auto text-[16px] font-black text-[#5a6a7a] capitalize tracking-widest bg-[#0a0a15] border border-[#2a3a4a] rounded-sm px-2 py-0.5">
              {new Date(bet.game_time).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Chicago',
                timeZoneName: 'short',
              })}
            </div>
          )}
        </div>

        <div className="flex gap-3 mb-3">
          {/* Image */}
          <div className="flex-shrink-0 relative">
            {showPlayerImg ? (
              <div
                className="w-16 h-16 rounded-full overflow-hidden border-[2px] bg-[#0a0a15] shadow-md"
                style={{ borderColor: tierColor }}
              >
                <img
                  src={playerImageUrl!}
                  alt={bet?.player_name || bet?.selection}
                  className="w-full h-full object-cover object-top"
                  loading="lazy"
                  onError={() => setImgError(true)}
                />
              </div>
            ) : showTeamLogo ? (
              <div className="w-16 h-16 rounded-full bg-[#0a0a15] border-2 border-[#2a3a4a] flex items-center justify-center p-1.5 shadow-md">
                <img
                  src={effectiveTeamLogoUrl!}
                  alt={bet?.team || 'MLB'}
                  className="w-full h-full object-contain"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            ) : (
              <div
                className="w-16 h-16 rounded-full bg-[#0a0a15] border-2 border-[#2a3a4a] flex items-center justify-center"
                style={{ borderColor: `${tierColor}55` }}
              >
                <Target size={24} style={{ color: tierColor }} />
              </div>
            )}
            {/* Overlay team logo on player image */}
            {showPlayerImg && teamLogoUrl && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#0a0a15] rounded-full border border-[#2a3a4a] p-0.5 flex items-center justify-center z-10">
                <img src={teamLogoUrl} alt="Team" className="w-full h-full object-contain" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {/* For totals: show both teams in smaller multi-line text; otherwise single-line truncate */}
            <div
              className={`font-black text-[#5a6a7a] capitalize mb-0.5 ${
                isTotalBet
                  ? 'text-[12px] tracking-wide leading-snug'
                  : 'text-[17px] tracking-widest truncate'
              }`}
              style={isTotalBet ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}}
            >
              {formatMatchup(bet.matchup) || stripCity(bet.team_name) || 'MLB GAME'}
            </div>
            <div
              className="font-black text-white capitalize leading-tight text-[24px] whitespace-normal"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              {isTotalBet
                ? (() => {
                    const sel = (bet.selection || '').toLowerCase();
                    const isOver = sel.includes('over');
                    let prefix = 'Bet The';
                    if (bet.market && bet.market.includes('first_5')) prefix = 'Bet The First 5 Inning';
                    return `${prefix} ${isOver ? 'Over' : 'Under'}`;
                  })()
                : `Bet The ${marketLabel}`}
              <div className="text-[24px] font-black mt-1 truncate" style={{ fontFamily: '"Rajdhani", sans-serif', color: '#00D4FF' }}>
                {(() => {
                  let target = '';
                  if (bet.player_name) {
                    target = bet.player_name;
                  } else if (bet.market === 'total' || bet.market === 'first_5_total') {
                    target = '';
                  } else {
                    target = stripCity(selectionLabel(bet?.selection, bet?.matchup)).replace(/over|under/i, '').trim();
                  }
                  return `${target} ${lineStr} ${formatOdds(bet.best_price)}`.trim().replace(/\s+/g, ' ');
                })()}
              </div>
            </div>
            {/* Hide market badge for totals — the Over/Under label already makes it obvious */}
            {!isTotalBet && (
              <div className="flex items-center gap-1.5 mt-1 text-[17px] font-black capitalize">
                <span
                  className="px-1.5 rounded-sm"
                  style={{ background: tierBg, color: tierColor, border: `1px solid ${tierBorder}` }}
                >
                  {marketLabel}
                </span>
                <span className="text-[#3d4f5f] truncate">{bet.market?.replace(/_/g, ' ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Pitcher Strikeout Bet — prominent bet/price/K-rate display for SO props */}
        {isPitcherProp && typeStr.includes('strikeout') && bet.line != null && (
          <div className="mb-2 bg-[#0a0f1a] border border-[#2a3a4a] rounded-sm p-2 flex items-stretch gap-2">
            <div className="flex-1 flex flex-col justify-center min-w-0">
              <div className="text-[11px] font-black text-[#5a6a7a] tracking-widest mb-0.5">BET</div>
              <div
                className="text-[19px] font-black text-white leading-tight"
                style={{ fontFamily: '"Rajdhani", sans-serif' }}
              >
                {(bet.selection || '').toLowerCase().includes('over') ? 'Over' : 'Under'}{' '}
                {bet.line} K
              </div>
            </div>
            <div className="border-l border-[#2a3a4a] pl-2 flex flex-col justify-center">
              <div className="text-[11px] font-black text-[#5a6a7a] tracking-widest mb-0.5">PRICE</div>
              <div
                className="text-[19px] font-black leading-tight"
                style={{
                  fontFamily: '"Rajdhani", sans-serif',
                  color: Number(bet.best_price) > 0 ? '#00D4FF' : '#ffffff',
                }}
              >
                {formatOdds(bet.best_price)}
              </div>
            </div>
            {bet.pitcher_k_per_g != null && (
              <div className="border-l border-[#2a3a4a] pl-2 flex flex-col justify-center">
                <div className="text-[11px] font-black text-[#5a6a7a] tracking-widest mb-0.5">Season K/G</div>
                <div
                  className="text-[19px] font-black text-[#00D4FF] leading-tight"
                  style={{ fontFamily: '"Rajdhani", sans-serif' }}
                >
                  {Number(bet.pitcher_k_per_g).toFixed(2)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats Grid */}
        {allStats.length > 0 && (
          <div className="grid grid-cols-5 gap-1 mb-3 px-4 md:px-0">
            {allStats.slice(0, 5).map((s, i) => (
              <div
                key={i}
                className="bg-[#0a0a15] border border-[#1a2530] rounded-sm py-1 flex flex-col items-center justify-center"
              >
                <span className="text-[13px] font-black text-[#5a6a7a] capitalize tracking-widest leading-none mb-0.5">
                  {s.label}
                </span>
                <span
                  className="text-[18px] font-black leading-none"
                  style={{ fontFamily: '"Rajdhani", sans-serif', color: s.color || '#fff' }}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Metrics Footer — reduced font sizes so all 4 stats fit within their frames */}
        <div className="flex justify-between items-center bg-[#0a0a15] border border-[#2a3a4a] rounded-sm p-1.5 shadow-inner">
          <div className="text-center px-1 border-r border-[#2a3a4a] flex-1 min-w-0">
            <div className="text-[11px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5">
              Odds
            </div>
            <div
              className="text-[20px] font-black text-white leading-none"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              {formatOdds(bet.best_price)}
            </div>
          </div>
          <div className="text-center px-1 border-r border-[#2a3a4a] flex-1 min-w-0">
            <div className="text-[11px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5">
              Win%
            </div>
            <div
              className="text-[20px] font-black text-white leading-none"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              {formatWinPct(bet.win_confidence)}
            </div>
          </div>
          {bet.ev_pct != null && (
            <div className="text-center px-1 border-r border-[#2a3a4a] flex-1 min-w-0">
              <div className="text-[11px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5">
                Ev%
              </div>
              <div
                className="text-[20px] font-black leading-none"
                style={{
                  fontFamily: '"Rajdhani", sans-serif',
                  color: Number(bet.ev_pct) > 0 ? '#00D4FF' : '#FF6B6B',
                }}
              >
                {Number(bet.ev_pct) > 0 ? '+' : ''}
                {Number(bet.ev_pct).toFixed(1)}%
              </div>
            </div>
          )}
          <div className="text-center px-1 flex-1 min-w-0">
            <div className="text-[11px] font-black text-[#5a6a7a] capitalize tracking-widest mb-0.5">
              Score
            </div>
            <div
              className="text-[22px] font-black leading-none"
              style={{ fontFamily: '"Rajdhani", sans-serif', color: tierColor }}
            >
              {bet.bet_score}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Category Carousel Section
// ──────────────────────────────────────────────────────────────────────────────
const CategoryCarousel = ({
  title,
  icon: Icon,
  bets,
  onBetClick,
  rankLabel = 'RANK',
}: {
  title: string;
  icon?: any;
  bets: any[];
  onBetClick: (bet: any) => void;
  rankLabel?: string;
}) => {
  if (!bets || bets.length === 0) return null;

  // Render up to 10 best bets per the user's specific limits. Grid flows N cards into
  // rows, so a category with 1 bet shows 1 card and a category with 8 shows 8.
  // The length===0 guard above is the only (graceful) empty state.
  return (
    <div className="mb-8 w-full">
      <SectionHeader icon={Icon || Zap} label={title} />
      <MetalFrame className="p-3 md:p-4 bg-transparent border-0 w-full overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 w-full">
          {bets.map((bet, idx) => (
            <BetCard
              key={`${bet.game_pk}-${bet.bet_type}-${bet.market}-${bet.selection}-${bet.player_id ?? ''}-${bet.line ?? ''}`}
              bet={bet}
              rank={idx + 1}
              rankLabel={rankLabel}
              onClick={() => onBetClick(bet)}
            />
          ))}
        </div>
      </MetalFrame>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────────
export default function BestBetsPage() {
  const router = useRouter();
  const [selectedBet, setSelectedBet] = useState<any | null>(null);
  const [todayStr, setTodayStr] = useState<string>('');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    setTodayStr(formatter.format(new Date()));
  }, []);

  const { data, error, isLoading } = useSWR('/api/mlb/best-bets', fetcher, {
    refreshInterval: 60000,
  });

  useEffect(() => {
    const handleHash = () => {
      if (!window.location.hash.startsWith('#bet')) {
        setSelectedBet(null);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const openModal = useCallback((bet: any) => {
    setSelectedBet(bet);
    window.scrollTo(0, 0);
    window.history.pushState(null, '', `#bet`);
  }, []);
  
  const closeModal = useCallback(() => {
    if (window.location.hash.startsWith('#bet')) {
      window.history.back();
    } else {
      setSelectedBet(null);
    }
  }, []);

  const bets = data?.bets || [];
  const officialDate = data?.officialDate || null;
  const stats = data?.stats || { totalBets: 0, eliteBets: 0, topScore: 0, topLock: 0 };
  const isStale = !!(todayStr && officialDate && officialDate < todayStr);

  // Categorize
  // "Most Likely to Win" = highest win-probability moneylines (h2h). Run lines and totals
  // have their own dedicated sections; including them here double-listed the same bets.
  const mostLikelyToWin = useMemo(() => {
    if (data?.topMoneylines?.length > 0) {
      return data.topMoneylines;
    }
    return [...bets]
      .filter((b) => ['line', 'game'].includes(b.bet_type) && (b.market === 'h2h' || b.market === 'moneyline'))
      .sort((a, b) => (Number(b.win_confidence) || 0) - (Number(a.win_confidence) || 0))
      .slice(0, 10);
  }, [bets, data]);

  const bestMoneyLines = useMemo(() => {
    const filtered = [...bets].filter((b) => ['line', 'game'].includes(b.bet_type) && (b.market === 'h2h' || b.market === 'moneyline'));
    const merged = [...filtered, ...(data?.topMoneylines || [])];
    const unique = Array.from(new Map(merged.map(b => [`${b.player_id}-${b.selection}-${b.market}`, b])).values());
    return unique.sort((a, b) => (Number(b.bet_score) || 0) - (Number(a.bet_score) || 0));
  }, [bets, data]);

  const bestRunLines = useMemo(() => {
    const filtered = [...bets].filter((b) => b.bet_type === 'line' && (b.market === 'run_line' || b.market === 'runline' || b.market === 'spread'));
    const merged = [...filtered, ...(data?.topRunlines || [])];
    const unique = Array.from(new Map(merged.map(b => [`${b.player_id}-${b.selection}-${b.market}`, b])).values());
    return unique.sort((a, b) => (Number(b.bet_score) || 0) - (Number(a.bet_score) || 0));
  }, [bets, data]);

  const bestTotals = useMemo(() => {
    const filtered = [...bets].filter((b) => ['line', 'game'].includes(b.bet_type) && b.market === 'total');
    const merged = [...filtered, ...(data?.topTotals || [])];
    const unique = Array.from(new Map(merged.map(b => [`${b.player_id}-${b.selection}-${b.market}`, b])).values());
    return unique.sort((a, b) => (Number(b.bet_score) || 0) - (Number(a.bet_score) || 0));
  }, [bets, data]);

  const mostLikelyToHomer = useMemo(() => {
    const filtered = [...bets].filter((b) => {
      const m = (b.market || '').toLowerCase();
      return m === 'home_run' || m === 'hr' || m.includes('home_run');
    });
    const merged = [...filtered, ...(data?.topHomers || [])];
    const unique = Array.from(new Map(merged.map(b => [`${b.player_id}-${b.selection}-${b.market}`, b])).values());
    return unique.sort((a, b) => (Number(b.win_confidence) || 0) - (Number(a.win_confidence) || 0)).slice(0, 10);
  }, [bets, data]);

  const topPropsByMarket = useMemo(() => {
    const propsMap = new Map<string, any[]>();
    bets.forEach((b: any) => {
      const typeStr = ((b.bet_type || '') + ' ' + (b.market || '')).toLowerCase();
      // Only props
      if (
        b.bet_type === 'prop' ||
        typeStr.includes('prop') ||
        typeStr.includes('pitcher') ||
        typeStr.includes('hits') ||
        typeStr.includes('home_run') ||
        typeStr.includes('strikeout') ||
        typeStr.includes('rbi') ||
        typeStr.includes('f5') ||
        typeStr.includes('first_5') ||
        typeStr.includes('team_total')
      ) {
        const m = b.market || 'Other Prop';
        // Skip home runs here since we have a dedicated section
        if (m === 'home_run' || m === 'hr') return;

        if (!propsMap.has(m)) propsMap.set(m, []);
        propsMap.get(m)!.push(b);
      }
    });

    const groups: { title: string; bets: any[] }[] = [];
    for (const [market, groupBets] of propsMap.entries()) {
      const sorted = [...groupBets]
        .sort((a, b) => (Number(b.bet_score) || 0) - (Number(a.bet_score) || 0))
        .slice(0, 10);
      if (sorted.length > 0) {
        const titleMarket = market.replace(/_/g, ' ');
        const finalTitle = titleMarket.includes('f5') 
          ? `Top ${titleMarket.replace('f5', 'F5')}` 
          : `Top ${titleMarket}`;
        groups.push({ title: finalTitle, bets: sorted });
      }
    }

    // Sort groups by the highest bet score in the group
    groups.sort((a, b) => {
      const maxA = a.bets[0] ? Number(a.bets[0].bet_score) : 0;
      const maxB = b.bets[0] ? Number(b.bets[0].bet_score) : 0;
      return maxB - maxA;
    });

    return groups;
  }, [bets]);

  if (error || data?.error) {
    return (
      <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
        <SEOHead
          title="Today's MLB Best Bets — AI Model Picks &amp; Edge Ratings | Smarter.Poker"
          description="Daily MLB best bets and betting edges powered by Smarter.Poker's AI prediction model."
          noindex={true}
        />
        <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
        <MlbSubNav />
        <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
          <div className="text-center bg-[#0d1117] p-8 rounded-sm border-2 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.1)] relative overflow-hidden">
            <div className="absolute left-0 top-0 w-1 h-full bg-red-500" />
            <Activity className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h2
              className="text-[34px] font-black text-white capitalize tracking-wider mb-1"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              System Error
            </h2>
            <p className="text-red-400 font-black capitalize tracking-widest text-[14px]">
              Failed To Load Data. Please Try Again.
            </p>
          </div>
        </main>
        <BottomNavBar />
      </div>
    );
  }

  
  if (selectedBet) {
    return <BetDetailView bet={selectedBet} onClose={closeModal} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
      <SEOHead
        title="Today's MLB Best Bets — AI Model Picks & Edge Ratings | Smarter.Poker"
        description="Daily MLB best bets and betting edges powered by Smarter.Poker's AI prediction model. Covers moneyline, run line, totals, and player props with ELITE/STRONG/LEAN/THIN/PASS tier ratings for every pick."
        canonical="/hub/MLB-ANALYTICS/best-bets"
        jsonLd={{
          '@type': 'Dataset',
          name: "Today's MLB Best Bets",
          description:
            'Daily AI-model-generated MLB betting picks with edge percentages, tier ratings, and win probability scores.',
          url: 'https://smarter.poker/hub/MLB-ANALYTICS/best-bets',
          creator: { '@type': 'Organization', name: 'Smarter.Poker', url: 'https://smarter.poker' },
          keywords: 'MLB best bets, MLB picks today, MLB betting predictions, baseball betting',
        }}
        ogImage="/images/mlb/og.png"
      />

      <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
      <MlbSubNav />
      <ScoringGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* Page Header — Metal Vault Style */}
      <header className="relative px-4 pt-4 pb-4 bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-b-[3px] border-[#3d4f5f] shadow-[0_6px_25px_rgba(0,0,0,0.7)] z-10">
        {/* Decorative corner bolts */}
        <div className="absolute top-3 left-3 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)]" />
        <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#5a6a7a] to-[#3a4a5a] border border-[#1a2a3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)]" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              href="/hub/MLB-ANALYTICS"
              className="inline-flex items-center gap-1 text-[#00D4FF] text-[16px] font-black no-underline tracking-widest capitalize hover:text-white transition-colors  mb-1"
            >
              <ArrowLeft size={12} /> Dashboard
            </Link>
            <h1
              className="m-0 text-[47px] font-black text-white capitalize tracking-[0.12em] leading-none drop-shadow-[0_0_6px_rgba(255,255,255,0.15)]"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              Best{' '}
              <span className="text-[#00D4FF] drop-shadow-[0_0_10px_rgba(0,212,255,0.6)]">
                Bets
              </span>
            </h1>
            <p className="m-0 text-[16px] font-black tracking-widest text-[#5a6a7a] uppercase mt-1">
              Ranked By Bet Score · {officialDate ? new Date(`${officialDate}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'numeric', day: 'numeric', year: 'numeric' }).replace(/\//g, '-').toUpperCase() : ''}
            </p>
          </div>
          <button
            onClick={() => {
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try {
                  navigator.vibrate(15);
                } catch (e) {}
              }
              setIsGuideOpen(true);
            }}
            title="Scoring Scale Guide"
            className="text-right bg-[#0a0a15] hover:bg-[#1a2332] transition-colors cursor-pointer px-2.5 py-2 rounded-sm border border-[#2a3a4a] hover:border-[#00D4FF] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] group min-h-[44px]"
          >
            <div className="flex items-center justify-end gap-1 text-[#00D4FF] text-[17px] font-black tracking-widest capitalize drop-shadow-[0_0_4px_rgba(0,212,255,0.4)]">
              <Info size={12} className="opacity-70 group-hover:opacity-100" />
              MLB Edge
            </div>
            <div className="text-[16px] font-black text-[#5a6a7a] mt-0.5 capitalize tracking-widest border-t border-[#2a3a4a] pt-1">
              Score 0–100
            </div>
            <div className="text-[14px] font-black text-[#3d4f5f] capitalize tracking-widest">
              Value + Conf
            </div>
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-2 mt-3 px-4 md:px-0">
          {[
            { label: 'Bets', value: isLoading && !data ? null : stats.totalBets, color: '#ffffff' },
            {
              label: 'Elite',
              value: isLoading && !data ? null : stats.eliteBets,
              color: '#00D4FF',
            },
            {
              label: 'Top Score',
              value:
                isLoading && !data
                  ? null
                  : stats.topScore
                    ? Number(stats.topScore) % 1 !== 0
                      ? Number(stats.topScore).toFixed(1)
                      : stats.topScore
                    : 0,
              color: '#FFD700',
            },
            {
              label: 'Top Lock',
              value: isLoading && !data ? null : `${(Number(stats.topLock) || 0).toFixed(1)}%`,
              color: '#8a9ba8',
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-[#0a0a15] border border-[#2a3a4a] rounded-sm py-2 px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <div className="text-[14px] font-black text-[#5a6a7a] tracking-widest capitalize ">
                {label}
              </div>
              {value === null ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto mt-1 text-[#00D4FF]" />
              ) : (
                <div
                  className="text-[38px] font-black mt-0.5 leading-none"
                  style={{ fontFamily: '"Rajdhani", sans-serif', color }}
                >
                  {value}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom neon strip */}
        <div className="absolute bottom-0 left-[10%] right-[10%] h-[2px] bg-[#00D4FF] shadow-[0_0_8px_#00D4FF,0_0_16px_rgba(0,212,255,0.3)] rounded-t-full" />
      </header>

      <MlbPremiumGate featureName="Best Bets Recommendations">
        <div className="w-full max-w-5xl mx-auto pt-6">
          {/* Stale Warning */}
          {isStale && !isLoading && (
            <div className="mx-4 mb-4 bg-[#1a1500] border-2 border-amber-500/40 rounded-sm p-3 shadow-[0_0_12px_rgba(245,158,11,0.08)] relative overflow-hidden">
              <div className="absolute left-0 top-0 w-1 h-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
              <div className="pl-2 text-amber-500 text-[18px] font-black tracking-widest capitalize  flex items-center gap-2">
                <CalendarX size={13} /> Stale Slate — Not Actionable
              </div>
              <div className="pl-2 text-amber-600/70 text-[17px] font-black capitalize tracking-wider mt-0.5 ">
                Picks from {officialDate || 'previous date'}, not today ({todayStr}).
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex flex-col gap-2 pb-4">
            {isLoading && !data ? (
              <div className="text-center py-16 mx-4 bg-[#0d1117] border-2 border-[#2a3a4a] rounded-sm shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mx-auto mb-3" />
                <div className="text-[18px] font-black text-[#00D4FF] tracking-widest capitalize animate-pulse">
                  Scanning Database...
                </div>
              </div>
            ) : bets.length === 0 ? (
              <div className="text-center py-14 px-5 mx-4 bg-[#0d1117] border-2 border-dashed border-[#2a3a4a] rounded-sm shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                <div className="mb-3 text-[#3d4f5f] flex justify-center">
                  <CalendarX size={40} />
                </div>
                <div className="text-[26px] font-black text-white mb-1.5 capitalize tracking-wider ">
                  No Qualifying Bets Today.
                </div>
                <div className="text-[17px] font-black tracking-widest text-[#5a6a7a] capitalize ">
                  Model is respecting the market.
                </div>
              </div>
            ) : (
              <>
                <CategoryCarousel
                  title="Most Likely to Win"
                  icon={Target}
                  bets={mostLikelyToWin}
                  onBetClick={openModal}
                />
                <CategoryCarousel
                  title="Best Money Lines"
                  icon={Zap}
                  bets={bestMoneyLines}
                  onBetClick={openModal}
                />
                <CategoryCarousel
                  title="Best Run Lines"
                  icon={Activity}
                  bets={bestRunLines}
                  onBetClick={openModal}
                />
                <CategoryCarousel
                  title="Best Over / Unders"
                  icon={TrendingUp}
                  bets={bestTotals}
                  onBetClick={openModal}
                />
                <CategoryCarousel
                  title="Most Likely to Homer"
                  icon={Zap}
                  bets={mostLikelyToHomer}
                  onBetClick={openModal}
                />
                
                {/* Dynamically grouped props from topPropsByMarket covers F5, Team Totals, Strikeouts, etc. */}

                {topPropsByMarket.map((group, idx) => (
                  <CategoryCarousel
                    key={idx}
                    title={group.title}
                    bets={group.bets}
                    onBetClick={openModal}
                  />
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          {bets.length > 0 && (
            <div className="mx-4 mb-4 px-3 py-3 bg-[#0d1117] border border-[#2a3a4a] rounded-sm text-center">
              <div className="text-[16px] font-black tracking-widest text-[#5a6a7a] capitalize  leading-relaxed">
                <span className="text-[#00D4FF]">Analysis Only</span> — Not Betting Advice. Score
                (0–100) ranks EV + Confidence. EV% = Expected Return Per $1. Bet Responsibly.
              </div>
            </div>
          )}
        </div>
      </MlbPremiumGate>

      <BottomNavBar />

      
    </div>
  );
}
