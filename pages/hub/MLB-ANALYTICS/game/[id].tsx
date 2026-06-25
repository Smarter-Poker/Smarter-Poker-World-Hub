import Link from 'next/link';

import { useRouter } from 'next/router';
import { useMemo, useState, useEffect } from 'react';
import useSWR from 'swr';
import { Target, Loader2, Zap, X, TrendingUp, TrendingDown, Minus, Info, Activity, ChevronUp, ChevronDown } from 'lucide-react';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { teamLogo, playerHeadshot, type GameCard } from '../../../../src/lib/mlb_data';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Canonical tier palette — same five tiers/colors as src/lib/betScore.ts and every other
// MLB surface (ELITE cyan, STRONG emerald, LEAN sky, THIN amber, PASS slate).
const TIER_HEX: Record<string, string> = {
  ELITE: '#00D4FF',
  STRONG: '#34D399',
  LEAN: '#38BDF8',
  THIN: '#F59E0B',
  PASS: '#64748B',
};

const PROP_LABELS: Record<string, string> = {
  home_run: 'Home Run', hits: 'Hits', hrr: 'H+R+RBI', total_bases: 'Total Bases',
  rbi: 'RBIs', runs: 'Runs', walks: 'Walks', stolen_bases: 'Stolen Bases',
  earned_runs: 'Earned Runs', pitcher_strikeouts: 'Pitcher Ks', pitcher_walks: 'Pitcher BB',
  strikeouts: 'Strikeouts',
};
const propLabel = (p?: string | null) =>
  p ? (PROP_LABELS[p] ?? p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())) : '';

// ── Stat formatters (shared by the prop modal) ─────────────────────────────────
const f3 = (v: any) => (v == null ? '—' : Number(v).toFixed(3).replace(/^0\./, '.'));
const f2 = (v: any) => (v == null ? '—' : Number(v).toFixed(2));
const f0 = (v: any) => (v == null ? '—' : String(Math.round(Number(v))));
const fmtOdds = (o: any) => (o == null ? '—' : Number(o) > 0 ? `+${o}` : `${o}`);

export default function GameMatchupDashboard() {
  const router = useRouter();
  const { id } = router.query;
  const gamePk = typeof id === 'string' ? parseInt(id, 10) : null;

  const [selectedProp, setSelectedProp] = useState<any | null>(null);

  // Fetch dashboard data to get the slate games (and find our game) — live, refresh every 2 min
  const { data: dashData, error: dashErr } = useSWR('/api/mlb/dashboard', fetcher, {
    refreshInterval: 120000,
  });
  const { data: specificGameData, error: specificGameErr } = useSWR(gamePk && (!dashData || !dashData.slateGames?.find((g: any) => g.gamePk === gamePk)) ? `/api/mlb/game/${gamePk}` : null, fetcher);
  // Fetch bets and props — model output updates daily, check every 5 min
  const { data: betsData, error: betsErr } = useSWR('/api/mlb/best-bets', fetcher, {
    refreshInterval: 300000,
  });
  const { data: propsData, error: propsErr } = useSWR('/api/mlb/props', fetcher, {
    refreshInterval: 300000,
  });

  const isLoading = (!dashData && !dashErr && !specificGameData && !specificGameErr) || (!betsData && !betsErr) || (!propsData && !propsErr);

  const game: GameCard | undefined = useMemo(() => {
    if (!gamePk) return undefined;
    if (dashData?.slateGames) {
      const found = dashData.slateGames.find((g: GameCard) => g.gamePk === gamePk);
      if (found) return found;
    }
    return specificGameData;
  }, [dashData, specificGameData, gamePk]);

  const gameBets = useMemo(() => {
    if (!game || !betsData?.bets) return [];
    // Match bets by seeing if the bet's matchup string contains our team abbreviations,
    // or if team_id matches (if available)
    const _matched = betsData.bets.filter((b: any) => {
      if ((b.bet_type || '').toLowerCase() === 'prop' || b.player_id != null) return false;
      const h = game.home.toLowerCase();
      const a = game.away.toLowerCase();
      const bMatchup = (b.matchup || '').toLowerCase();
      const bTeam = (b.team || '').toLowerCase();
      const bTeamName = (b.team_name || '').toLowerCase();

      // If the bet has a team_id, we can precisely match
      if (b.team_id && (b.team_id === game.homeId || b.team_id === game.awayId)) return true;

      return (
        bMatchup.includes(h) ||
        bMatchup.includes(a) ||
        bTeam === h ||
        bTeam === a ||
        bTeamName === h ||
        bTeamName === a
      );
    });
    // Dedupe: bets API returns every intraday snapshot; keep one per bet.
    const _seen = new Set<string>();
    return _matched.filter((b: any) => {
      const k = `${b.market}|${b.selection}|${b.line ?? ''}|${b.player_id ?? ''}`;
      if (_seen.has(k)) return false;
      _seen.add(k);
      return true;
    });
  }, [game, betsData]);

  const gameProps = useMemo(() => {
    if (!game || !propsData?.props) return [];
    // Match props by team_id precisely
    const _mp = propsData.props.filter(
      (p: any) => p.team_id === game.homeId || p.team_id === game.awayId
    );
    const _sp = new Set<string>();
    return _mp.filter((p: any) => {
      const k = `${p.player_id}|${p.prop}|${p.line ?? ''}|${p.side ?? ''}`;
      if (_sp.has(k)) return false;
      _sp.add(k);
      return true;
    });
  }, [game, propsData]);

  if (!gamePk) {
    return (
      <div className="min-h-screen bg-[#060B14] text-[#E0E7FF] pb-[70px] w-full max-w-[100vw] overflow-x-hidden box-border">
        <UniversalHeader pageDepth={2} onBackClick={() => router.back()} />
        <MlbSubNav />
        <div className="flex flex-col items-center justify-center py-20 text-[#00D4FF]">
          <Loader2 className="w-12 h-12 animate-spin mb-4" />
          <p className="tracking-widest capitalize font-bold text-[23px]">Loading Matchup...</p>
        </div>
        <BottomNavBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060B14] text-[#E0E7FF] font-['Orbitron',sans-serif] selection:bg-[#00D4FF]/30 pb-[70px] w-full max-w-[100vw] overflow-x-hidden box-border">
      <SEOHead
        title={
          game
            ? `${game.away} vs ${game.home} — MLB Predictions & Betting Odds | Smarter.Poker`
            : 'MLB Game Matchup — Predictions & Odds | Smarter.Poker'
        }
        description={
          game
            ? `AI-powered predictions, live odds, and best bets for ${game.away} @ ${game.home}. Win probability, edge ratings, and prop picks for today's MLB matchup.`
            : "Live odds, AI predictions, and top bets for today's MLB matchup."
        }
        canonical={game ? `/hub/MLB-ANALYTICS/game/${router.query.id}` : undefined}
        ogImage="/images/mlb/og.png"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'SportsEvent',
          name: game ? `${game.away} vs ${game.home}` : 'MLB Game',
          description: `AI-powered predictions and betting odds for ${game?.away} at ${game?.home}.`,
          startDate: game?.firstPitch || new Date().toISOString(),
          competitor: [
            { '@type': 'SportsTeam', name: game?.away || 'Away Team' },
            { '@type': 'SportsTeam', name: game?.home || 'Home Team' },
          ],
          provider: {
            '@type': 'Organization',
            name: 'Smarter.Poker',
            url: 'https://smarter.poker',
          },
        }}
      />

      <UniversalHeader pageDepth={2} onBackClick={() => router.back()} />
      <MlbSubNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Back navigation is provided by UniversalHeader (pageDepth=2); no duplicate link. */}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#00D4FF]">
            <Loader2 className="w-12 h-12 animate-spin mb-4" />
            <p className="tracking-widest capitalize font-['Rajdhani']">Loading Matchup Data...</p>
          </div>
        ) : !game ? (
          <div className="text-center py-20">
            <p className="text-[#FF4444] font-['Rajdhani'] text-[34px]">
              Game not found on today's slate.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* MATCHUP HEADER CARD */}
            <div className="bg-[#0A101C] border border-[#1A2436] rounded-xl p-6 relative overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]">
              {/* Visually-hidden h1 for SEO — actual matchup displayed as h2s below */}
              <h1 className="sr-only">
                {game.away} vs {game.home} — MLB Game Predictions
              </h1>
              <div className="absolute top-0 left-0 w-1 h-full bg-[#00D4FF]"></div>

              <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                {/* AWAY TEAM */}
                <div className="flex flex-col items-center flex-1">
                  <div className="w-16 h-16 mb-4 relative drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={teamLogo(game.awayId) || ''}
                      alt={game.away}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <h2 className="text-[40px] font-extrabold font-['Rajdhani'] tracking-widest capitalize font-['Rajdhani'] text-white">
                    {game.away}
                  </h2>
                  <p className="text-[23px] text-[#8BA4D5] capitalize tracking-wider mt-1">
                    {game.awayRecord ? `${game.awayRecord.wins}-${game.awayRecord.losses}` : ''}
                    {game.awayStreak ? ` [${game.awayStreak}]` : ''}
                  </p>
                  {game.awayStarter && (
                    <p className="text-[23px] font-['Rajdhani'] mt-2 text-[#00D4FF]">
                      P: {game.awayStarter.name}{' '}
                      {game.awayStarter.wins != null
                        ? `(${game.awayStarter.wins}-${game.awayStarter.losses}, ${game.awayStarter.era}${game.awayStarter.whip != null ? `, ${game.awayStarter.whip.toFixed(2)} WHIP` : ''})`
                        : ''}
                    </p>
                  )}
                </div>

                {/* VS BADGE */}
                <div className="flex flex-col items-center">
                  <div className="text-[#1A2436] font-black text-[61px] italic px-4">Vs</div>
                  <div className="mt-4 px-3 py-1 bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30 rounded text-[21px] font-bold tracking-widest font-['Rajdhani'] whitespace-nowrap">
                    {game.firstPitch
                      ? new Date(game.firstPitch).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZoneName: 'short',
                        })
                      : 'TBD'}
                  </div>
                </div>

                {/* HOME TEAM */}
                <div className="flex flex-col items-center flex-1">
                  <div className="w-16 h-16 mb-4 relative drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={teamLogo(game.homeId) || ''}
                      alt={game.home}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <h2 className="text-[40px] font-extrabold font-['Rajdhani'] tracking-widest capitalize font-['Rajdhani'] text-white">
                    {game.home}
                  </h2>
                  <p className="text-[23px] text-[#8BA4D5] capitalize tracking-wider mt-1">
                    {game.homeRecord ? `${game.homeRecord.wins}-${game.homeRecord.losses}` : ''}
                    {game.homeStreak ? ` [${game.homeStreak}]` : ''}
                  </p>
                  {game.homeStarter && (
                    <p className="text-[23px] font-['Rajdhani'] mt-2 text-[#00D4FF]">
                      P: {game.homeStarter.name}{' '}
                      {game.homeStarter.wins != null
                        ? `(${game.homeStarter.wins}-${game.homeStarter.losses}, ${game.homeStarter.era}${game.homeStarter.whip != null ? `, ${game.homeStarter.whip.toFixed(2)} WHIP` : ''})`
                        : ''}
                    </p>
                  )}
                </div>
              </div>

              {/* ODDS STRIP */}
              <div className="mt-8 pt-6 border-t border-[#1A2436] grid grid-cols-3 gap-4 px-4 md:px-0">
                <div className="bg-[#060B14] p-3 rounded text-center border border-[#1A2436]">
                  <p className="text-[21px] text-[#8BA4D5] capitalize tracking-widest mb-1">
                    Moneyline
                  </p>
                  <div className="flex justify-around">
                    <span className="font-['Rajdhani'] text-[30px] font-extrabold font-['Rajdhani'] text-white">
                      {game.avgAwayLine
                        ? game.avgAwayLine > 0
                          ? `+${game.avgAwayLine}`
                          : game.avgAwayLine
                        : '-'}
                    </span>
                    <span className="text-[#1A2436] mx-2">|</span>
                    <span className="font-['Rajdhani'] text-[30px] font-extrabold font-['Rajdhani'] text-white">
                      {game.avgHomeLine
                        ? game.avgHomeLine > 0
                          ? `+${game.avgHomeLine}`
                          : game.avgHomeLine
                        : '-'}
                    </span>
                  </div>
                </div>
                <div className="bg-[#060B14] p-3 rounded text-center border border-[#1A2436]">
                  <p className="text-[21px] text-[#8BA4D5] capitalize tracking-widest mb-1">
                    Spread
                  </p>
                  <div className="flex justify-around">
                    <span className="font-['Rajdhani'] text-[30px] font-extrabold font-['Rajdhani'] text-white">
                      {game.avgAwaySpreadLine
                        ? game.avgAwaySpreadLine > 0
                          ? `+${game.avgAwaySpreadLine}`
                          : game.avgAwaySpreadLine
                        : '-'}
                    </span>
                    <span className="text-[#1A2436] mx-2">|</span>
                    <span className="font-['Rajdhani'] text-[30px] font-extrabold font-['Rajdhani'] text-white">
                      {game.avgHomeSpreadLine
                        ? game.avgHomeSpreadLine > 0
                          ? `+${game.avgHomeSpreadLine}`
                          : game.avgHomeSpreadLine
                        : '-'}
                    </span>
                  </div>
                </div>
                <div className="bg-[#060B14] p-3 rounded text-center border border-[#1A2436]">
                  <p className="text-[21px] text-[#8BA4D5] capitalize tracking-widest mb-1">
                    Total
                  </p>
                  <div className="font-['Rajdhani'] text-[30px] font-extrabold font-['Rajdhani'] text-white">
                    {game.avgTotalLine ? `O/U ${game.avgTotalLine}` : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* SPLIT DASHBOARD */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 md:px-0">
              {/* GAME BETS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-5 h-5 text-[#00D4FF]" />
                  <h3 className="text-[34px] font-extrabold font-['Rajdhani'] capitalize tracking-widest font-['Rajdhani'] text-white">
                    Top Game Bets
                  </h3>
                </div>
                {gameBets.length === 0 ? (
                  <div className="bg-[#0A101C] p-6 text-center rounded-lg border border-[#1A2436]">
                    <p className="text-[#8BA4D5] font-['Rajdhani']">
                      No active edges found for this matchup.
                    </p>
                  </div>
                ) : (
                  gameBets.slice(0, 10).map((bet: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-[#0A101C] p-4 rounded-lg border border-[#1A2436] flex items-center justify-between hover:border-[#00D4FF]/30 transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="font-['Rajdhani'] text-[30px] font-extrabold font-['Rajdhani'] text-white">
                          {bet.team_name || bet.selection}{' '}
                          {bet.market && (
                            <span className="text-[#8BA4D5] text-[23px] ml-1">
                              {bet.market.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span className="text-[21px] text-[#8BA4D5] capitalize tracking-wider">
                          {bet.bet_type}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <div
                          className={`font-['Rajdhani'] text-[30px] font-extrabold font-['Rajdhani'] ${bet.ev_pct > 0 ? 'text-[#00FF88]' : 'text-white'}`}
                        >
                          {bet.ev_pct > 0 ? '+' : ''}
                          {(Number(bet.ev_pct) || 0).toFixed(1)}% EV
                        </div>
                        <span
                          className="text-[21px] font-['Rajdhani'] px-2 rounded font-bold"
                          style={{
                            color: TIER_HEX[bet.bet_tier] || '#00D4FF',
                            background: `${TIER_HEX[bet.bet_tier] || '#00D4FF'}1a`,
                          }}
                        >
                          {bet.bet_score != null
                            ? `${Number(bet.bet_score) % 1 !== 0 ? Number(bet.bet_score).toFixed(1) : bet.bet_score}${bet.bet_tier ? ' · ' + bet.bet_tier : ''}`
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* GAME PROPS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5 text-[#00D4FF]" />
                  <h3 className="text-[34px] font-extrabold font-['Rajdhani'] capitalize tracking-widest font-['Rajdhani'] text-white">
                    Top Player Props
                  </h3>
                </div>
                {gameProps.length === 0 ? (
                  <div className="bg-[#0A101C] p-6 text-center rounded-lg border border-[#1A2436]">
                    <p className="text-[#8BA4D5] font-['Rajdhani']">
                      No active prop edges found for this matchup.
                    </p>
                  </div>
                ) : (
                  gameProps.slice(0, 10).map((prop: any, idx: number) => (
                    <div
                      key={idx}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedProp(prop)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedProp(prop);
                        }
                      }}
                      className="bg-[#0A101C] p-4 rounded-lg border border-[#1A2436] flex items-center justify-between hover:border-[#00D4FF]/40 transition-colors cursor-pointer focus:outline-none focus:border-[#00D4FF]/60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Link href={`/hub/MLB-ANALYTICS/players/${prop.player_id}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={playerHeadshot(prop.player_id) || teamLogo(prop.team_id) || ''}
                            alt={prop.player_name}
                            className="w-10 h-10 rounded-full object-cover bg-[#060B14] border border-[#1A2436] shrink-0"
                            loading="lazy"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-['Rajdhani'] text-[30px] font-extrabold font-['Rajdhani'] text-white truncate hover:text-[#00D4FF] transition-colors">
                              {prop.player_name}
                            </span>
                          </div>
                        </Link>
                        <div className="flex flex-col min-w-0 justify-end pb-1">
                          <span className="text-[21px] text-[#8BA4D5] capitalize tracking-wider">
                            {propLabel(prop.prop)} {prop.side === 'under' ? 'U' : 'O'} {prop.line}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <div
                          className={`font-['Rajdhani'] text-[30px] font-extrabold font-['Rajdhani'] ${prop.ev_pct > 0 ? 'text-[#00FF88]' : 'text-white'}`}
                        >
                          {prop.ev_pct > 0 ? '+' : ''}
                          {(Number(prop.ev_pct) || 0).toFixed(1)}% EV
                        </div>
                        <span className="text-[21px] font-['Rajdhani'] text-[#00D4FF] bg-[#00D4FF]/10 px-2 rounded">
                          Odds: {fmtOdds(prop.odds ?? prop.price)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {selectedProp && game && (
        <PropModal prop={selectedProp} game={game} onClose={() => setSelectedProp(null)} />
      )}

      <BottomNavBar />
    </div>
  );
}

// ── Player-prop detail modal ───────────────────────────────────────────────────
function PropModal({
  prop,
  game,
  onClose,
}: {
  prop: any;
  game: GameCard;
  onClose: () => void;
}) {
  const [showLogs, setShowLogs] = useState(false);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isPitcher = prop.player_kind === 'pitcher';
  const s = prop.stats || {};
  const tierColor = TIER_HEX[prop.bet_tier] || '#00D4FF';
  const head = playerHeadshot(prop.player_id) || teamLogo(prop.team_id) || '';

  // Opposing starter: the player faces the OTHER team's starting pitcher.
  const playerIsHome = prop.team_id != null && prop.team_id === game.homeId;
  const playerIsAway = prop.team_id != null && prop.team_id === game.awayId;
  const oppStarter = playerIsHome ? game.awayStarter : playerIsAway ? game.homeStarter : null;
  const oppTeam = playerIsHome ? game.away : playerIsAway ? game.home : null;

  const wl = s.w == null && s.l == null ? '—' : `${f0(s.w)}-${f0(s.l)}`;
  const statCells: [string, string][] = isPitcher
    ? [
        ['ERA', f2(s.era)],
        ['WHIP', f2(s.whip)],
        ['FIP', f2(s.fip)],
        ['SIERA', f2(s.siera)],
        ['W-L', wl],
        ['SO', f0(s.so)],
        ['K/IP', f2(s.k_per_ip)],
        ['K/G', f2(s.k_per_g)],
      ]
    : [
        ['AVG', f3(s.avg)],
        ['OBP', f3(s.obp)],
        ['SLG', f3(s.slg)],
        ['wOBA', f3(s.woba)],
        ['wRC+', f0(s.wrc_plus)],
        ['HR', f0(s.hr)],
        ['RBI', f0(s.rbi)],
      ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-[#0A101C] border border-[#1A2436] w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-[0_0_40px_rgba(0,212,255,0.18)] font-['Orbitron',sans-serif]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-5 border-b border-[#1A2436]">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 text-[#8BA4D5] hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-4 pr-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={head}
              alt={prop.player_name}
              className="w-16 h-16 rounded-full object-cover bg-[#060B14] border border-[#00D4FF]/30 shrink-0"
              loading="lazy"
            />
            <div className="min-w-0">
              <h3 className="text-[26px] font-extrabold font-['Rajdhani'] text-white truncate">
                {prop.player_name}
              </h3>
              <p className="text-[17px] text-[#8BA4D5] font-['Rajdhani'] tracking-wider">
                {prop.team_abbr ? `${prop.team_abbr} · ` : ''}
                {propLabel(prop.prop)} {prop.side === 'under' ? 'Under' : 'Over'} {prop.line}
                {'  ·  '}
                {fmtOdds(prop.odds ?? prop.price)}
              </p>
            </div>
          </div>
        </div>

        {/* Score row */}
        <div className="grid grid-cols-3 gap-px bg-[#1A2436] border-b border-[#1A2436]">
          <div className="bg-[#0A101C] p-3 text-center">
            <p className="text-[12px] text-[#8BA4D5] capitalize tracking-widest mb-1">Bet Score</p>
            <p
              className="text-[30px] font-extrabold font-['Rajdhani'] leading-none"
              style={{ color: tierColor }}
            >
              {prop.bet_score != null ? (Number(prop.bet_score) % 1 !== 0 ? Number(prop.bet_score).toFixed(1) : prop.bet_score) : '—'}
            </p>
            <p className="text-[13px] font-bold mt-1" style={{ color: tierColor }}>
              {prop.bet_tier || ''}
            </p>
          </div>
          <div className="bg-[#0A101C] p-3 text-center">
            <p className="text-[12px] text-[#8BA4D5] capitalize tracking-widest mb-1">Top Lock</p>
            <p className="text-[30px] font-extrabold font-['Rajdhani'] leading-none text-white">
              {prop.win_confidence != null ? `${Number(prop.win_confidence).toFixed(1)}%` : '—'}
            </p>
            <p className="text-[13px] text-[#8BA4D5] mt-1">to hit</p>
          </div>
          <div className="bg-[#0A101C] p-3 text-center">
            <p className="text-[12px] text-[#8BA4D5] capitalize tracking-widest mb-1">Expected</p>
            <p
              className={`text-[30px] font-extrabold font-['Rajdhani'] leading-none ${prop.ev_pct > 0 ? 'text-[#00FF88]' : 'text-white'}`}
            >
              {prop.ev_pct > 0 ? '+' : ''}
              {prop.ev_pct != null ? `${Number(prop.ev_pct).toFixed(1)}%` : '—'}
            </p>
            <p className="text-[13px] text-[#8BA4D5] mt-1">EV / $1</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Verdict */}
          {prop.score_verdict && (
            <div
              className="rounded-lg px-4 py-3 text-[16px] font-bold font-['Rajdhani'] tracking-wide"
              style={{ color: tierColor, background: `${tierColor}14`, border: `1px solid ${tierColor}40` }}
            >
              {prop.score_verdict}
            </div>
          )}

          {/* Why this bet */}
          <div>
            <h4 className="text-[15px] text-[#8BA4D5] capitalize tracking-widest mb-2 font-['Rajdhani']">
              Why This Bet
            </h4>
            {Array.isArray(prop.score_factors) && prop.score_factors.length > 0 ? (
              <ul className="space-y-2">
                {prop.score_factors.map((fct: any, i: number) => {
                  const Icon =
                    fct.dir === 'up'
                      ? TrendingUp
                      : fct.dir === 'down'
                        ? TrendingDown
                        : fct.dir === 'flat'
                          ? Minus
                          : Info;
                  const c =
                    fct.dir === 'up'
                      ? '#00FF88'
                      : fct.dir === 'down'
                        ? '#FF6B6B'
                        : fct.dir === 'flat'
                          ? '#F59E0B'
                          : '#00D4FF';
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <Icon className="w-4 h-4 mt-1 shrink-0" style={{ color: c }} />
                      <span className="text-[14px] text-[#C7D2E6] font-['Rajdhani'] leading-snug">
                        {fct.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[14px] text-[#8BA4D5] font-['Rajdhani']">
                Not enough model edge to grade this prop.
              </p>
            )}
          </div>

          {/* Player stats */}
          <div>
            <h4 className="text-[15px] text-[#8BA4D5] capitalize tracking-widest mb-2 font-['Rajdhani']">
              {isPitcher ? 'Pitcher Stats (Season)' : 'Hitter Stats (Season)'}
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {statCells.map(([label, val]) => (
                <div
                  key={label}
                  className="bg-[#060B14] border border-[#1A2436] rounded p-2 text-center"
                >
                  <p className="text-[12px] text-[#8BA4D5] tracking-widest">{label}</p>
                  <p className="text-[20px] font-extrabold font-['Rajdhani'] text-white leading-tight">
                    {val}
                  </p>
                </div>
              ))}
            </div>

            {/* Last 10 Games Log */}
            {isPitcher && prop.stats?.last10 && prop.stats.last10.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowLogs(!showLogs)}
                  className="w-full flex items-center justify-between bg-[#060B14] border border-[#1A2436] px-3 py-2 rounded-sm text-left hover:bg-[#111827] transition-colors"
                >
                  <span className="text-[14px] font-black text-white capitalize tracking-widest flex items-center gap-2 font-['Rajdhani']">
                    <Activity size={12} className="text-[#00D4FF]" />
                    {showLogs ? 'Hide Last 10 Games' : 'Show Last 10 Games'}
                  </span>
                  {showLogs ? (
                    <ChevronUp size={16} className="text-[#8BA4D5]" />
                  ) : (
                    <ChevronDown size={16} className="text-[#8BA4D5]" />
                  )}
                </button>

                {showLogs && (
                  <div className="mt-2 border border-[#1A2436] rounded-sm overflow-hidden">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-[#111827] border-b border-[#1A2436]">
                        <tr>
                          <th className="px-3 py-2 font-black tracking-wider text-[#8BA4D5] capitalize font-['Rajdhani']">Date</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#8BA4D5] capitalize font-['Rajdhani']">IP</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#8BA4D5] capitalize font-['Rajdhani']">H</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#8BA4D5] capitalize font-['Rajdhani']">ER</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#8BA4D5] capitalize font-['Rajdhani']">BB</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#00D4FF] capitalize font-['Rajdhani']">K</th>
                          <th className="px-3 py-2 font-black tracking-wider text-[#8BA4D5] capitalize font-['Rajdhani']">Pit</th>
                        </tr>
                      </thead>
                      <tbody className="bg-[#060B14]">
                        {prop.stats.last10.map((log: any, idx: number) => (
                          <tr
                            key={idx}
                            className="border-b border-[#1A2436] last:border-b-0 hover:bg-[#111827] transition-colors"
                          >
                            <td className="px-3 py-2 font-bold text-slate-300 font-['Rajdhani']">
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

          {/* Matchup */}
          {oppStarter && (
            <div>
              <h4 className="text-[15px] text-[#8BA4D5] capitalize tracking-widest mb-2 font-['Rajdhani']">
                Matchup{oppTeam ? ` vs ${oppTeam}` : ''}
              </h4>
              <div className="bg-[#060B14] border border-[#1A2436] rounded-lg p-3 flex items-center justify-between">
                <span className="text-[14px] text-[#8BA4D5] font-['Rajdhani'] tracking-wider">
                  Opposing Starter
                </span>
                <span className="text-[17px] font-bold font-['Rajdhani'] text-[#00D4FF] text-right">
                  {oppStarter.name}
                  {oppStarter.wins != null
                    ? ` (${oppStarter.wins}-${oppStarter.losses}, ${oppStarter.era} ERA${oppStarter.whip != null ? `, ${oppStarter.whip.toFixed(2)} WHIP` : ''})`
                    : ''}
                </span>
              </div>
            </div>
          )}

          {prop.price_estimated && (
            <p className="text-[12px] text-[#8BA4D5] font-['Rajdhani'] italic">
              Under price is a no-vig fair estimate (book has not posted a live under price).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
