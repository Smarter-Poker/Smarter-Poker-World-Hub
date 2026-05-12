/**
 * ⚔️ PvP PLAY MODE — Head-to-Head GTO Practice Lobby
 * ═══════════════════════════════════════════════════════════════════════════
 * Lobby UI for matchmaking. Real-time game state via Supabase Realtime.
 * Post-game GTO analysis for both players.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH4-13 — hex sweep batch 4: literals routed to --sp-* tokens
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { getAuthUser, getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { PvPMatch, MATCH_FORMATS, calculateRatingChange, getRankTier } from '../../../src/engines/PvPMatchEngine';

// Lazy-load PvPArena to avoid SSR issues with heavy component
const PvPArena = dynamic(() => import('../../../src/components/training/PvPArena'), { ssr: false });

// ═══════════════════════════════════════════════════════════════════════════
// HORSE AI MATCHMAKING CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const MATCHMAKING_TIMEOUT_MS = 7000; // 7 seconds before horse AI fallback
const HORSE_ENTRANCE_DELAY_MS = 1200; // Dramatic pause before horse appears

// ═══════════════════════════════════════════════════════════════════════════
// GAME FORMATS
// ═══════════════════════════════════════════════════════════════════════════

const FORMATS = {
  rapid: { name: 'Rapid', icon: '⚡', timer: 30, hands: 10, desc: '30s per decision, 10 hands' },
  standard: {
    name: 'Standard',
    icon: '🕐',
    timer: 60,
    hands: 20,
    desc: '60s per decision, 20 hands',
  },
  marathon: {
    name: 'Marathon',
    icon: '🏃',
    timer: 90,
    hands: 50,
    desc: '90s per decision, 50 hands',
  },
};

const STAKE_LEVELS = [
  { name: 'Free Play', icon: '🆓', entry: 0, prize: 'Bragging Rights' },
  { name: 'Low Stakes', icon: '💎', entry: 10, prize: '25 Diamonds' },
  { name: 'High Roller', icon: '👑', entry: 50, prize: '150 Diamonds' },
];

// ═══════════════════════════════════════════════════════════════════════════
// LOBBY PLAYER CARD
// ═══════════════════════════════════════════════════════════════════════════

function PlayerCard({ player, isReady, isSelf }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        flex: 1,
        padding: 20,
        borderRadius: 16,
        textAlign: 'center',
        background: isSelf
          ? 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(0,212,255,0.03))'
          : 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03))',
        border: `1px solid ${isSelf ? 'rgba(0,212,255,0.2)' : 'rgba(239,68,68,0.2)'}`,
      }}
    >
      {player ? (
        <>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              margin: '0 auto 12px',
              background: `linear-gradient(135deg, ${isSelf ? 'var(--sp-accent-cyan)' : 'var(--sp-accent-red)'}, ${isSelf ? 'var(--sp-accent-blue)' : 'var(--sp-accent-orange)'})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
            }}
          >
            {isSelf ? '🎮' : '⚔️'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 4 }}>
            {player.name || 'Player'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)', marginBottom: 8 }}>
            {player.rating ? `Rating: ${player.rating}` : 'Unrated'}
          </div>
          {isReady && (
            <div
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                background: 'rgba(34,197,94,0.15)',
                color: 'var(--sp-accent-green)',
                display: 'inline-block',
              }}
            >
              READY
            </div>
          )}
        </>
      ) : (
        <>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              margin: '0 auto 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '2px dashed rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              color: 'var(--sp-fg-faint)',
            }}
          >
            ?
          </div>
          <div style={{ fontSize: 12, color: 'var(--sp-fg-faint)', fontWeight: 600 }}>
            Waiting for opponent...
          </div>
        </>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SEASON LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════

const LEADERBOARD_DATA = [
  { rank: 1, name: 'GTO_Master', rating: 1847, wins: 142, losses: 38, streak: 12 },
  { rank: 2, name: 'SolverPro', rating: 1792, wins: 128, losses: 45, streak: 7 },
  { rank: 3, name: 'RangeKing', rating: 1756, wins: 115, losses: 52, streak: 5 },
  { rank: 4, name: 'PokerShark99', rating: 1701, wins: 98, losses: 61, streak: 3 },
  { rank: 5, name: 'NitHunter', rating: 1688, wins: 105, losses: 68, streak: 4 },
  { rank: 6, name: 'BluffCatcher', rating: 1655, wins: 92, losses: 71, streak: 2 },
  { rank: 7, name: 'EquityKid', rating: 1621, wins: 87, losses: 79, streak: 1 },
  { rank: 8, name: 'ThreeBetQueen', rating: 1598, wins: 81, losses: 82, streak: 0 },
  { rank: 9, name: 'FoldToWin', rating: 1567, wins: 76, losses: 85, streak: 1 },
  { rank: 10, name: 'GTOWizard_Fan', rating: 1543, wins: 72, losses: 89, streak: 0 },
];

function SeasonLeaderboard() {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg)' }}>Season Leaderboard</div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: 'var(--sp-fg-dim)',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Season 1
        </div>
      </div>
      {LEADERBOARD_DATA.map((p, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            borderRadius: 6,
            marginBottom: 2,
            background: i < 3 ? `rgba(251,191,36,${0.05 - i * 0.01})` : 'transparent',
          }}
        >
          <span
            style={{
              width: 20,
              fontSize: 10,
              fontWeight: 800,
              color: i === 0 ? 'var(--sp-accent-amber)' : i === 1 ? 'var(--sp-fg-muted)' : i === 2 ? '#d97706' : 'var(--sp-fg-faint)',
            }}
          >
            {p.rank}
          </span>
          <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--sp-fg)' }}>{p.name}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--sp-accent-purple)',
              fontFamily: "'Orbitron', monospace",
              minWidth: 40,
              textAlign: 'right',
            }}
          >
            {p.rating}
          </span>
          <span style={{ fontSize: 9, color: 'var(--sp-accent-green)', minWidth: 30, textAlign: 'right' }}>
            {p.wins}W
          </span>
          <span style={{ fontSize: 9, color: 'var(--sp-fg-dim)' }}>/{p.losses}L</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSONAL STATS
// ═══════════════════════════════════════════════════════════════════════════

function PersonalStats() {
  const [stats, setStats] = React.useState({ wins: 0, losses: 0, bestStreak: 0 });
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const loadStats = async () => {
      try {
        const token = getAccessToken();
        if (!token) {
          setStats({ wins: 23, losses: 14, bestStreak: 6 });
          setLoaded(true);
          return;
        }
        const res = await authedFetch('/api/training/save-session', {
          method: 'GET',
        });
        // API is POST-only, so use fallback data for now
        // In production, a GET /api/training/stats endpoint would provide real data
        setStats({ wins: 23, losses: 14, bestStreak: 6 });
      } catch (e) {
        setStats({ wins: 23, losses: 14, bestStreak: 6 });
      }
      setLoaded(true);
    };
    loadStats();

    // Update stats when sessions complete
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (event) => {
      const detail = event?.payload || event;
      if (detail?.gameId === 'pvp-match') {
        setStats((prev) => {
          const won = (detail?.accuracy || 0) >= 60;
          return {
            wins: prev.wins + (won ? 1 : 0),
            losses: prev.losses + (won ? 0 : 1),
            bestStreak: won ? Math.max(prev.bestStreak, 1) : prev.bestStreak,
          };
        });
      }
    });
    return unsub;
  }, []);

  const total = stats.wins + stats.losses;
  const winRate = total > 0 ? Math.round((stats.wins / total) * 100) : 0;
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 10 }}>
        Your Stats
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {[
          { label: 'W/L', value: `${stats.wins}-${stats.losses}`, color: 'var(--sp-accent-green)' },
          { label: 'Win %', value: `${winRate}%`, color: winRate >= 55 ? 'var(--sp-accent-green)' : 'var(--sp-accent-amber)' },
          { label: 'Best Streak', value: stats.bestStreak, color: 'var(--sp-accent-cyan)' },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              padding: '10px 6px',
              borderRadius: 8,
              textAlign: 'center',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: s.color,
                fontFamily: "'Orbitron', monospace",
              }}
            >
              {s.value}
            </div>
            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RECENT MATCHES
// ═══════════════════════════════════════════════════════════════════════════

function RecentMatches() {
  const matches = [
    { opponent: 'GTO_Grinder', result: 'W', score: '78-65', date: 'Today', format: 'Rapid' },
    {
      opponent: 'PokerShark99',
      result: 'L',
      score: '62-71',
      date: 'Yesterday',
      format: 'Standard',
    },
    { opponent: 'SolverPro', result: 'W', score: '85-52', date: '2 days ago', format: 'Marathon' },
    { opponent: 'NitHunter', result: 'W', score: '91-44', date: '3 days ago', format: 'Rapid' },
    { opponent: 'RangeKing', result: 'L', score: '58-73', date: '4 days ago', format: 'Standard' },
  ];

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 10 }}>
        Recent Matches
      </div>
      {matches.map((m, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            borderRadius: 8,
            marginBottom: 4,
            background: m.result === 'W' ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: m.result === 'W' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
              color: m.result === 'W' ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            {m.result}
          </span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sp-fg)' }}>vs {m.opponent}</span>
            <div style={{ fontSize: 9, color: 'var(--sp-fg-faint)' }}>{m.format}</div>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--sp-fg-muted)',
              fontFamily: "'Orbitron', monospace",
            }}
          >
            {m.score}
          </span>
          <span style={{ fontSize: 9, color: 'var(--sp-fg-faint)' }}>{m.date}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function PvPLobbyPage() {
  const router = useRouter();
  useTrainingBus('pvp-lobby');
  const [format, setFormat] = useState('standard');
  const [stakeLevel, setStakeLevel] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const [selfReady, setSelfReady] = useState(false);
  const [opponent, setOpponent] = useState(null);
  const searchTimerRef = useRef(null);

  const [inArena, setInArena] = useState(false); // When true, show PvPArena component
  const [currentUser, setCurrentUser] = useState({ name: 'You', rating: 1200 });
  const [onlineCount, setOnlineCount] = useState(null); // null until mounted (SSR-safe)
  const [searchElapsed, setSearchElapsed] = useState(0); // Countdown timer display
  const searchIntervalRef = useRef(null);
  const [isAutoMatched, setIsAutoMatched] = useState(false); // true if matched via timeout (not realtime)
  const [opponentEngine, setHorseData] = useState(null); // Full horse data for PvPArena

  useEffect(() => {
    try {
      const user = getAuthUser();
      const displayName = user?.user?.user_metadata?.display_name || user?.user_metadata?.display_name;
      if (displayName) {
        setCurrentUser({ name: displayName, rating: 1200 });
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    // Set online count client-side only to avoid hydration mismatch
    setOnlineCount(237 + Math.floor(Math.random() * 50));
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // MATCHMAKING: 7-second timeout → Horse AI fallback
  // ═══════════════════════════════════════════════════════════════════════
  const handleFindMatch = useCallback(() => {
    setIsSearching(true);
    setMatchFound(false);
    setOpponent(null);
    setSelfReady(false);
    setSearchElapsed(0);
    setIsAutoMatched(false);
    setHorseData(null);

    // Tick every second for countdown display
    searchIntervalRef.current = setInterval(() => {
      setSearchElapsed(prev => prev + 1);
    }, 1000);

    // After 7 seconds: no real player found → fetch a Horse AI opponent
    searchTimerRef.current = setTimeout(async () => {
      if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);

      try {
        const res = await fetch('/api/training/horse-opponent');
        const data = await res.json();

        if (data?.player) {
          // Brief delay to feel like real matchmaking
          await new Promise(r => setTimeout(r, HORSE_ENTRANCE_DELAY_MS));

          setIsSearching(false);
          setMatchFound(true);
          setIsAutoMatched(true);
          setHorseData(data._engine); // Internal personality for decision engine only
          setOpponent({
            name: data.player.name,
            rating: data.player.rating,
            avatar: data.player.avatar,
            id: data.player.id,
            // _engine stored internally, never rendered
            _engine: data._engine,
          });
          return;
        }
      } catch (err) {
        console.warn('[PvP] Opponent fetch failed, using fallback:', err.message);
      }

      // Fallback — still looks like a real player
      setIsSearching(false);
      setMatchFound(true);
      setIsAutoMatched(true);
      setOpponent({
        name: 'GTO_Grinder',
        rating: 1200 + Math.floor(Math.random() * 400),
        id: `fb_${Date.now()}`,
        _engine: { aggression: 7, humor: 4, technical: 8, contrarian: 3, gto: 'balanced', risk: 'moderate' },
      });
    }, MATCHMAKING_TIMEOUT_MS);
  }, []);

  // Cancel search
  const handleCancelSearch = useCallback(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    setIsSearching(false);
    setSearchElapsed(0);
  }, []);

  // Ready up → launch PvPArena for the match
  const handleReady = useCallback(() => {
    setSelfReady(true);
    // Launch PvPArena after a short countdown
    setTimeout(() => {
      setInArena(true);
    }, 1500);
  }, []);

  // Handle arena completion — save results + return to lobby
  const handleArenaComplete = useCallback(async (result) => {
    setInArena(false);
    setMatchFound(false);
    setOpponent(null);
    setSelfReady(false);

    const accuracy = result?.accuracy || 70;
    const handsCount = result?.handsPlayed || FORMATS[format].hands;

    eventBus?.emit?.(
      EventType?.SESSION_END || 'session:end',
      { gameId: 'pvp-match', handsPlayed: handsCount, accuracy },
      'PvPLobby'
    );

    // Save PvP session to Supabase
    try {
      const token = getAccessToken();
      if (!token) return;
      await authedFetch('/api/training/save-session', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'pvp-match',
          gameName: `PvP ${FORMATS[format].name} (${STAKE_LEVELS[stakeLevel].name})`,
          gtowScore: accuracy,
          totalEVLoss: result?.totalEVLoss || 0,
          handsPlayed: handsCount,
          mistakeCount: Math.round(handsCount * (1 - accuracy / 100)),
          accuracy,
          correctCount: Math.round((handsCount * accuracy) / 100),
          bestStreak: result?.bestStreak || 0,
          levelPassed: accuracy >= 60,
          level: stakeLevel + 1,
          handHistory: result?.handHistory || [],
          trainerConfig: {
            format,
            stakeLevel: STAKE_LEVELS[stakeLevel].name,
            opponent: opponent?.name,
            opponentId: opponent?.id || null,
            ratingChange: result?.ratingChange,
          },
        }),
      });
    } catch (err) {
      console.warn('[PvP] Save error:', err.message);
    }
  }, [format, stakeLevel, opponent]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    };
  }, []);

  // ═══ If in arena mode, render PvPArena full-screen ═══
  if (inArena) {
    return (
      <PvPArena
        userId={currentUser?.id || 'local-user'}
        userRating={currentUser?.rating || 1200}
        userName={currentUser?.name || 'You'}
        diamondBalance={100}
        onExit={(result) => handleArenaComplete(result || {})}
        matchedOpponent={opponent || null}
        opponentEngine={opponentEngine || null}
      />
    );
  }

  return (
    <>
      <Head>
        <title>PvP Arena | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Challenge other players to head-to-head GTO battles. Compete for diamonds and bragging rights."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '6px 12px',
              color: 'var(--sp-fg-muted)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ← Training
          </button>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              margin: 0,
              background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: "'Orbitron', monospace",
            }}
          >
            PvP Arena
          </h1>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--sp-accent-green)' }}
            />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--sp-accent-green)' }}>
              {onlineCount !== null ? `${onlineCount} Online` : ''}
            </span>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {!matchFound ? (
            /* LOBBY — Format & Stake Selection */
            <>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>⚔️</div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    fontFamily: "'Orbitron', monospace",
                    background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  HEAD-TO-HEAD
                </div>
                <p style={{ fontSize: 12, color: 'var(--sp-fg-muted)', marginTop: 8 }}>
                  Challenge another player to a GTO decision battle
                </p>
              </div>

              {/* Format Selector */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  GAME FORMAT
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {Object.entries(FORMATS || {}).map(([key, f]) => (
                    <motion.button
                      key={key}
                      onClick={() => setFormat(key)}
                      whileHover={{ scale: 1.03 }}
                      style={{
                        padding: '14px 10px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'center',
                        background:
                          format === key ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${format === key ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div style={{ fontSize: 20 }}>{f.icon}</div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: format === key ? 'var(--sp-accent-red)' : 'var(--sp-fg-muted)',
                          marginTop: 4,
                        }}
                      >
                        {f.name}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--sp-fg-faint)', marginTop: 2 }}>{f.desc}</div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Stake Level */}
              <div style={{ marginBottom: 28 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  STAKES
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {STAKE_LEVELS.map((s, i) => (
                    <motion.button
                      key={i}
                      onClick={() => setStakeLevel(i)}
                      whileHover={{ scale: 1.03 }}
                      style={{
                        padding: '12px 10px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'center',
                        background:
                          stakeLevel === i ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${stakeLevel === i ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div style={{ fontSize: 18 }}>{s.icon}</div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: stakeLevel === i ? 'var(--sp-accent-amber)' : 'var(--sp-fg-muted)',
                        }}
                      >
                        {s.name}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--sp-fg-faint)' }}>
                        {s.entry > 0 ? `Entry: ${s.entry}💎` : 'Free'}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Find Match Button */}
              <motion.button
                onClick={isSearching ? handleCancelSearch : handleFindMatch}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: 12,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 800,
                  fontFamily: "'Orbitron', monospace",
                  background: isSearching
                    ? 'rgba(239,68,68,0.2)'
                    : 'linear-gradient(135deg, #ef4444, #f59e0b)',
                  color: '#fff',
                  boxShadow: isSearching ? 'none' : '0 4px 20px rgba(239,68,68,0.3)',
                }}
              >
                {isSearching ? (
                  <span>
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    >
                      SEARCHING
                    </motion.span>
                    {' '}({Math.max(0, 7 - searchElapsed)}s) — tap to cancel
                  </span>
                ) : (
                  'FIND MATCH'
                )}
              </motion.button>

              {/* Recent Matches + Stats + Leaderboard */}
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <PersonalStats />
                <RecentMatches />
                <SeasonLeaderboard />
              </div>
            </>
          ) : (
            /* MATCH FOUND — Ready Up Screen */
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <div
                style={{
                  textAlign: 'center',
                  marginBottom: 24,
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--sp-accent-green)',
                  fontFamily: "'Orbitron', monospace",
                }}
              >
                MATCH FOUND
              </div>

              {/* Player Cards */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                <PlayerCard player={currentUser} isReady={selfReady} isSelf />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 800,
                    color: 'var(--sp-fg-faint)',
                  }}
                >
                  VS
                </div>
                <PlayerCard player={opponent} isReady={true} isSelf={false} />
              </div>

              {/* Format Info */}
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  marginBottom: 20,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>
                  {FORMATS[format].icon} {FORMATS[format].name} — {FORMATS[format].desc}
                </span>
              </div>

              {/* Ready Button */}
              {!selfReady ? (
                <motion.button
                  onClick={handleReady}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: 12,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 16,
                    fontWeight: 800,
                    fontFamily: "'Orbitron', monospace",
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    color: '#fff',
                    boxShadow: '0 4px 20px rgba(34,197,94,0.3)',
                  }}
                >
                  READY UP
                </motion.button>
              ) : (
                <div
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: 12,
                    textAlign: 'center',
                    background: 'rgba(34,197,94,0.1)',
                    border: '1px solid rgba(34,197,94,0.3)',
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--sp-accent-green)',
                    fontFamily: "'Orbitron', monospace",
                  }}
                >
                  <motion.span
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                  >
                    WAITING FOR OPPONENT...
                  </motion.span>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
}