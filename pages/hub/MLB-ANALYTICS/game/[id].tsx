import { useRouter } from 'next/router';
import { useMemo } from 'react';
import useSWR from 'swr';
import { ArrowLeft, Target, TrendingUp, Loader2, Zap, Activity } from 'lucide-react';
import Link from 'next/link';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { teamLogo, type GameCard } from '../../../../src/lib/mlb_data';

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

export default function GameMatchupDashboard() {
  const router = useRouter();
  const { id } = router.query;
  const gamePk = typeof id === 'string' ? parseInt(id, 10) : null;

  // Fetch dashboard data to get the slate games (and find our game) — live, refresh every 2 min
  const { data: dashData, error: dashErr } = useSWR('/api/mlb/dashboard', fetcher, {
    refreshInterval: 120000,
  });
  // Fetch bets and props — model output updates daily, check every 5 min
  const { data: betsData, error: betsErr } = useSWR('/api/mlb/best-bets', fetcher, {
    refreshInterval: 300000,
  });
  const { data: propsData, error: propsErr } = useSWR('/api/mlb/props', fetcher, {
    refreshInterval: 300000,
  });

  const isLoading = (!dashData && !dashErr) || (!betsData && !betsErr) || (!propsData && !propsErr);

  const game: GameCard | undefined = useMemo(() => {
    if (!dashData?.slateGames || !gamePk) return undefined;
    return dashData.slateGames.find((g: GameCard) => g.gamePk === gamePk);
  }, [dashData, gamePk]);

  const gameBets = useMemo(() => {
    if (!game || !betsData?.bets) return [];
    // Match bets by seeing if the bet's matchup string contains our team abbreviations,
    // or if team_id matches (if available)
    const _matched = betsData.bets.filter((b: any) => {
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
      const k = `${p.player_id}|${p.prop}|${p.line ?? ''}|${p.selection ?? ''}`;
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
          <p className="tracking-widest uppercase font-bold text-sm">Loading Matchup...</p>
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
      />

      <UniversalHeader pageDepth={2} onBackClick={() => router.back()} />
      <MlbSubNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* BACK BUTTON */}
        <Link
          href="/hub/MLB-ANALYTICS"
          className="inline-flex items-center text-[#00D4FF] hover:text-[#FF4444] transition-colors text-sm font-bold uppercase tracking-wider"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#00D4FF]">
            <Loader2 className="w-12 h-12 animate-spin mb-4" />
            <p className="tracking-widest uppercase font-['Rajdhani']">Loading Matchup Data...</p>
          </div>
        ) : !game ? (
          <div className="text-center py-20">
            <p className="text-[#FF4444] font-['Rajdhani'] text-xl">
              Game not found on today's slate.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* MATCHUP HEADER CARD */}
            <div className="bg-[#0A101C] border border-[#1A2436] rounded-xl p-6 relative overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]">
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
                    />
                  </div>
                  <h2 className="text-2xl font-bold tracking-widest uppercase font-['Rajdhani'] text-white">
                    {game.away}
                  </h2>
                  <p className="text-sm text-[#8BA4D5] uppercase tracking-wider mt-1">
                    {game.awayRecord ? `${game.awayRecord.wins}-${game.awayRecord.losses}` : ''}
                    {game.awayStreak ? ` [${game.awayStreak}]` : ''}
                  </p>
                  {game.awayStarter && (
                    <p className="text-sm font-['Rajdhani'] mt-2 text-[#00D4FF]">
                      P: {game.awayStarter.name}{' '}
                      {game.awayStarter.wins != null
                        ? `(${game.awayStarter.wins}-${game.awayStarter.losses}, ${game.awayStarter.era})`
                        : ''}
                    </p>
                  )}
                </div>

                {/* VS BADGE */}
                <div className="flex flex-col items-center">
                  <div className="text-[#1A2436] font-black text-4xl italic px-4">VS</div>
                  <div className="mt-4 px-3 py-1 bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30 rounded text-xs font-bold tracking-widest font-['Rajdhani'] whitespace-nowrap">
                    {game.firstPitch
                      ? new Date(game.firstPitch).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZoneName: 'short',
                        })
                      : 'TBD'}
                  </div>
                  {game.lineupState === 'confirmed' && (
                    <div className="mt-2 text-xs font-bold text-[#00FF88] uppercase tracking-widest font-['Rajdhani'] bg-[#00FF88]/10 px-2 py-0.5 rounded border border-[#00FF88]/20">
                      Confirmed Lineups
                    </div>
                  )}
                </div>

                {/* HOME TEAM */}
                <div className="flex flex-col items-center flex-1">
                  <div className="w-16 h-16 mb-4 relative drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={teamLogo(game.homeId) || ''}
                      alt={game.home}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <h2 className="text-2xl font-bold tracking-widest uppercase font-['Rajdhani'] text-white">
                    {game.home}
                  </h2>
                  <p className="text-sm text-[#8BA4D5] uppercase tracking-wider mt-1">
                    {game.homeRecord ? `${game.homeRecord.wins}-${game.homeRecord.losses}` : ''}
                    {game.homeStreak ? ` [${game.homeStreak}]` : ''}
                  </p>
                  {game.homeStarter && (
                    <p className="text-sm font-['Rajdhani'] mt-2 text-[#00D4FF]">
                      P: {game.homeStarter.name}{' '}
                      {game.homeStarter.wins != null
                        ? `(${game.homeStarter.wins}-${game.homeStarter.losses}, ${game.homeStarter.era})`
                        : ''}
                    </p>
                  )}
                </div>
              </div>

              {/* ODDS STRIP */}
              <div className="mt-8 pt-6 border-t border-[#1A2436] grid grid-cols-3 gap-4">
                <div className="bg-[#060B14] p-3 rounded text-center border border-[#1A2436]">
                  <p className="text-xs text-[#8BA4D5] uppercase tracking-widest mb-1">Moneyline</p>
                  <div className="flex justify-around">
                    <span className="font-['Rajdhani'] text-lg font-bold text-white">
                      {game.avgAwayLine
                        ? game.avgAwayLine > 0
                          ? `+${game.avgAwayLine}`
                          : game.avgAwayLine
                        : '-'}
                    </span>
                    <span className="text-[#1A2436] mx-2">|</span>
                    <span className="font-['Rajdhani'] text-lg font-bold text-white">
                      {game.avgHomeLine
                        ? game.avgHomeLine > 0
                          ? `+${game.avgHomeLine}`
                          : game.avgHomeLine
                        : '-'}
                    </span>
                  </div>
                </div>
                <div className="bg-[#060B14] p-3 rounded text-center border border-[#1A2436]">
                  <p className="text-xs text-[#8BA4D5] uppercase tracking-widest mb-1">Spread</p>
                  <div className="flex justify-around">
                    <span className="font-['Rajdhani'] text-lg font-bold text-white">
                      {game.avgAwaySpreadLine
                        ? game.avgAwaySpreadLine > 0
                          ? `+${game.avgAwaySpreadLine}`
                          : game.avgAwaySpreadLine
                        : '-'}
                    </span>
                    <span className="text-[#1A2436] mx-2">|</span>
                    <span className="font-['Rajdhani'] text-lg font-bold text-white">
                      {game.avgHomeSpreadLine
                        ? game.avgHomeSpreadLine > 0
                          ? `+${game.avgHomeSpreadLine}`
                          : game.avgHomeSpreadLine
                        : '-'}
                    </span>
                  </div>
                </div>
                <div className="bg-[#060B14] p-3 rounded text-center border border-[#1A2436]">
                  <p className="text-xs text-[#8BA4D5] uppercase tracking-widest mb-1">Total</p>
                  <div className="font-['Rajdhani'] text-lg font-bold text-white">
                    {game.avgTotalLine ? `O/U ${game.avgTotalLine}` : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* SPLIT DASHBOARD */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* GAME BETS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-5 h-5 text-[#00D4FF]" />
                  <h3 className="text-xl font-bold uppercase tracking-widest font-['Rajdhani'] text-white">
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
                        <span className="font-['Rajdhani'] text-lg font-bold text-white">
                          {bet.team_name || bet.selection}{' '}
                          {bet.market && (
                            <span className="text-[#8BA4D5] text-sm ml-1">
                              {bet.market.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-[#8BA4D5] uppercase tracking-wider">
                          {bet.bet_type}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <div
                          className={`font-['Rajdhani'] text-lg font-bold ${bet.ev_pct > 0 ? 'text-[#00FF88]' : 'text-white'}`}
                        >
                          {bet.ev_pct > 0 ? '+' : ''}
                          {(Number(bet.ev_pct) || 0).toFixed(1)}% EV
                        </div>
                        <span
                          className="text-xs font-['Rajdhani'] px-2 rounded font-bold"
                          style={{
                            color: TIER_HEX[bet.bet_tier] || '#00D4FF',
                            background: `${TIER_HEX[bet.bet_tier] || '#00D4FF'}1a`,
                          }}
                        >
                          {bet.bet_score != null
                            ? `${Number(bet.bet_score).toFixed(0)}${bet.bet_tier ? ' · ' + bet.bet_tier : ''}`
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
                  <h3 className="text-xl font-bold uppercase tracking-widest font-['Rajdhani'] text-white">
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
                      className="bg-[#0A101C] p-4 rounded-lg border border-[#1A2436] flex items-center justify-between hover:border-[#00D4FF]/30 transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="font-['Rajdhani'] text-lg font-bold text-white">
                          {prop.player_name}
                        </span>
                        <span className="text-xs text-[#8BA4D5] uppercase tracking-wider">
                          {prop.selection} {prop.line} | {prop.market}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <div
                          className={`font-['Rajdhani'] text-lg font-bold ${prop.ev_pct > 0 ? 'text-[#00FF88]' : 'text-white'}`}
                        >
                          {prop.ev_pct > 0 ? '+' : ''}
                          {(Number(prop.ev_pct) || 0).toFixed(1)}% EV
                        </div>
                        <span className="text-xs font-['Rajdhani'] text-[#00D4FF] bg-[#00D4FF]/10 px-2 rounded">
                          Odds:{' '}
                          {(() => {
                            const o = prop.odds ?? prop.price;
                            return o == null ? '—' : Number(o) > 0 ? `+${o}` : `${o}`;
                          })()}
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
      <BottomNavBar />
    </div>
  );
}
