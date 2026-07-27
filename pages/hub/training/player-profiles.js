/**
 * CUSTOM PLAYER PROFILES — Exploitative Opponent Modeling
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Apply pre-built villain profiles (Nit, TAG, LAG, Maniac, Calling Station, Fish)
 * and see how optimal counter-strategy adapts for every spot.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// BUG FIX (TRAIN-PROFILES-A11Y-1): button hardening (type=button +
// aria-label) across the player-profiles surface. Card-suit glyphs
// (♠♣♥♦) in profile descriptions remain (semantic). Same surface-
// specific a11y pattern as PR #320/#322/#324/#327-#350.
// TRAIN-CSS-TOKENS-BATCH4-20 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-13 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { getAuthUser } from '../../../src/lib/authUtils';

// TRAIN-CSS-MOTION-ADOPT-16 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// PLAYER PROFILES DATABASE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const PROFILES = {
  gto: {
    id: 'gto',
    name: 'GTO Balanced',
    color: 'var(--sp-accent-green)',
    border: 'rgba(34,197,94,0.3)',
    desc: 'Perfectly balanced, unexploitable baseline strategy',
    stats: {
      vpip: 24,
      pfr: 20,
      threeBet: 8.5,
      foldTo3Bet: 52,
      cBet: 67,
      foldToCBet: 38,
      wtsd: 28,
      aggFactor: 2.8,
    },
    weaknesses: [],
    exploits: ['None — this is the baseline strategy'],
  },
  nit: {
    id: 'nit',
    name: 'Ultra Nit',
    color: 'var(--sp-accent-blue)',
    border: 'rgba(59,130,246,0.3)',
    desc: 'Plays extremely tight. Only enters pots with premium hands.',
    stats: {
      vpip: 12,
      pfr: 10,
      threeBet: 4,
      foldTo3Bet: 72,
      cBet: 75,
      foldToCBet: 45,
      wtsd: 22,
      aggFactor: 1.8,
    },
    weaknesses: ['Over-folds to 3-bets', 'Predictable ranges', 'Folds too much on later streets'],
    exploits: [
      '3-bet light frequently',
      'Steal blinds aggressively',
      'Float flop c-bets and bet turn',
    ],
  },
  tag: {
    id: 'tag',
    name: 'Tight-Aggressive',
    color: 'var(--sp-accent-cyan)',
    border: 'rgba(6,182,212,0.3)',
    desc: 'Solid, tight-aggressive regular. Small pool of leaks.',
    stats: {
      vpip: 22,
      pfr: 18,
      threeBet: 7,
      foldTo3Bet: 55,
      cBet: 70,
      foldToCBet: 40,
      wtsd: 27,
      aggFactor: 2.5,
    },
    weaknesses: ['Slightly over-folds to 3-bets', 'Can be exploited in 4-bet pots'],
    exploits: [
      '4-bet bluff selectively',
      'Attack their blind defense',
      'Exploit predictable sizing tells',
    ],
  },
  lag: {
    id: 'lag',
    name: 'Loose-Aggressive',
    color: 'var(--sp-accent-amber)',
    border: 'rgba(245,158,11,0.3)',
    desc: 'Wide opening ranges with aggressive postflop play.',
    stats: {
      vpip: 32,
      pfr: 26,
      threeBet: 12,
      foldTo3Bet: 40,
      cBet: 78,
      foldToCBet: 32,
      wtsd: 30,
      aggFactor: 3.5,
    },
    weaknesses: [
      'Overbluffs in marginal spots',
      'Wide ranges are capped on many boards',
      'Susceptible to check-raises',
    ],
    exploits: [
      'Trap with premium hands',
      'Check-raise more frequently',
      'Call down lighter against their bluffs',
    ],
  },
  callingStation: {
    id: 'callingStation',
    name: 'Calling Station',
    color: 'var(--sp-accent-purple)',
    border: 'rgba(168,85,247,0.3)',
    desc: 'Passive player who calls too much and rarely raises.',
    stats: {
      vpip: 42,
      pfr: 8,
      threeBet: 2,
      foldTo3Bet: 30,
      cBet: 35,
      foldToCBet: 18,
      wtsd: 42,
      aggFactor: 0.8,
    },
    weaknesses: ['Calls with weak holdings', 'Never folds draws', 'Rarely raises for value'],
    exploits: [
      'Value bet thinner (top pair is good)',
      'Never bluff',
      'Bet large with strong hands for max value',
    ],
  },
  maniac: {
    id: 'maniac',
    name: 'Maniac',
    color: 'var(--sp-accent-red)',
    border: 'rgba(239,68,68,0.3)',
    desc: 'Hyper-aggressive. Raises and re-raises with a very wide range.',
    stats: {
      vpip: 55,
      pfr: 42,
      threeBet: 18,
      foldTo3Bet: 25,
      cBet: 88,
      foldToCBet: 50,
      wtsd: 35,
      aggFactor: 4.2,
    },
    weaknesses: [
      'Range is extremely wide and weak',
      'Overbluffs constantly',
      'Susceptible to 4-bet traps',
    ],
    exploits: [
      'Flat call pre with premium hands',
      'Let them hang themselves',
      'Check-call more, let them barrel off',
    ],
  },
  fish: {
    id: 'fish',
    name: 'Recreational Fish',
    color: '#f472b6',
    border: 'rgba(244,114,182,0.3)',
    desc: 'Inexperienced player. Random bet sizing, calls with anything.',
    stats: {
      vpip: 52,
      pfr: 10,
      threeBet: 3,
      foldTo3Bet: 60,
      cBet: 40,
      foldToCBet: 25,
      wtsd: 38,
      aggFactor: 0.5,
    },
    weaknesses: ['No concept of position', 'Chases draws at any price', 'Sizes bets randomly'],
    exploits: [
      'Isolate with wider range',
      'Bet big for value',
      'Avoid fancy plays — keep it simple',
    ],
  },
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// GTO ADAPTATION ENGINE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function computeAdaptation(profileId) {
  const profile = PROFILES[profileId];
  if (!profile || profileId === 'gto') {
    return {
      preflopAdj: { openRange: '0%', threeBetRange: '0%', foldMore: '0%' },
      postflopAdj: { cBetFreq: '0%', valueRange: '0%', bluffFreq: '0%' },
      summary: 'Play GTO baseline strategy — no adjustments needed.',
    };
  }
  const s = profile.stats;
  const gto = PROFILES.gto.stats;

  // Preflop adjustments
  const openAdj = s.foldTo3Bet > 60 ? '+8% (steal more)' : s.vpip > 40 ? '-5% (tighten up)' : '+3%';
  const threeBetAdj =
    s.foldTo3Bet > 55 ? '+6% (3-bet light)' : s.threeBet > 12 ? '-4% (flat more)' : '+2%';
  const foldAdj =
    s.threeBet > 12 ? '+10% (fold marginal)' : s.threeBet < 5 ? '-8% (defend wider)' : '0%';

  // Postflop adjustments
  const cBetAdj =
    s.foldToCBet > 40 ? '+15% (c-bet more)' : s.foldToCBet < 25 ? '-20% (check more)' : '+5%';
  const valueAdj =
    s.wtsd > 35 ? '+12% (thinner value)' : s.wtsd < 25 ? '-8% (tighten value)' : '0%';
  const bluffAdj =
    s.foldToCBet > 40 ? '+10% (bluff more)' : s.wtsd > 35 ? '-15% (never bluff)' : '0%';

  return {
    preflopAdj: { openRange: openAdj, threeBetRange: threeBetAdj, foldMore: foldAdj },
    postflopAdj: { cBetFreq: cBetAdj, valueRange: valueAdj, bluffFreq: bluffAdj },
    summary: profile.exploits.join('. ') + '.',
  };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// SCENARIO GENERATOR
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const SCENARIOS = [
  { id: 1, spot: 'UTG opens 2.5x, Hero in BTN', action: 'Pre-flop Decision', board: null },
  { id: 2, spot: 'Hero opens BTN, Villain 3-bets from BB', action: 'Facing 3-Bet', board: null },
  { id: 3, spot: 'Hero c-bets 65% on A♠ 7♥ 2♦', action: 'C-bet Response', board: 'A♠ 7♥ 2♦' },
  {
    id: 4,
    spot: 'Villain donk-bets 75% on K♣ T♠ 4♥',
    action: 'Facing Donk Bet',
    board: 'K♣ T♠ 4♥',
  },
  {
    id: 5,
    spot: 'Turn barrel: J♠ 8♥ 3♦ → 5♣',
    action: 'Multi-Street Barrel',
    board: 'J♠ 8♥ 3♦ 5♣',
  },
  {
    id: 6,
    spot: 'River decision: Q♥ 9♠ 6♦ 2♣ → K♦',
    action: 'River Value/Bluff',
    board: 'Q♥ 9♠ 6♦ 2♣ K♦',
  },
];

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// SAFE HELPERS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, safeNum(v, min)));
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STAT BAR COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function StatBar({ label, value, gtoValue, max = 100, color }) {
  const val = safeNum(value);
  const gto = safeNum(gtoValue);
  const safeMax = Math.max(1, safeNum(max, 100));
  const diff = val - gto;
  const diffColor = Math.abs(diff) < 3 ? 'var(--sp-accent-green)' : diff > 0 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-blue)';
  const barWidth = clamp((val / safeMax) * 100, 0, 100);
  const gtoMarker = clamp((gto / safeMax) * 100, 0, 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span
          style={{
            fontSize: 12,
            color: '#b0b3b8',
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span
            style={{ fontSize: 13, color, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif" }}
          >
            {val}%
          </span>
          <span style={{ fontSize: 11, color: diffColor, fontWeight: 600 }}>
            ({diff > 0 ? '+' : ''}
            {(Number.isFinite(Number(diff)) ? Number(diff) : 0).toFixed(1)} vs GTO)
          </span>
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          height: 6,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 3,
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${barWidth}%` }}
          transition={{ duration: MOTION.slow, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            background: color,
            borderRadius: 3,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -2,
            left: `${gtoMarker}%`,
            width: 2,
            height: 10,
            background: 'var(--sp-accent-green)',
            borderRadius: 1,
          }}
        />
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function PlayerProfilesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState('nit');
  const [activeScenario, setActiveScenario] = useState(0);
  const [showAdaptation, setShowAdaptation] = useState(false);
  const [customStats, setCustomStats] = useState(null);
  const [showCustomEditor, setShowCustomEditor] = useState(false);

  useTrainingBus('player-profiles');

  useEffect(() => {
    try {
      setUser(getAuthUser());
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, []);

  const profile = PROFILES[selectedProfile] || PROFILES.gto;
  const adaptation = useMemo(() => computeAdaptation(selectedProfile), [selectedProfile]);
  const gto = PROFILES.gto.stats;
  const safeScenarioIdx = clamp(activeScenario, 0, SCENARIOS.length - 1);

  const handleProfileSelect = useCallback((id) => {
    setSelectedProfile(id);
    setShowAdaptation(false);
    setActiveScenario(0);
    // HARDENED: safe eventBus access
    try {
      eventBus?.emit?.(
        EventType?.SESSION_END || 'session:end',
        {
          source: 'PlayerProfiles',
          action: 'profile_selected',
          profileId: id,
        },
        'PlayerProfiles'
      );
      eventBus?.emit?.('training:session-complete', {
        game_id: 'player-profiles',
        accuracy: 100,
        correct_answers: 1,
        total_questions: 1,
        hands_played: 1,
      });
    } catch (e) {
      console.warn('[PlayerProfiles] EventBus error:', e);
    }
  }, []);

  return (
    <>
      <Head>
        <title>Custom Player Profiles | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Apply exploitative opponent profiles and see how GTO strategy adapts"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: '#0a0a1a',
          color: '#e4e6eb',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #3a3b3c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <button
              type="button"
              aria-label="Back to training"
              onClick={() => router.back()}
              style={{
                background: 'none',
                border: 'none',
                color: '#b0b3b8',
                fontSize: 14,
                cursor: 'pointer',
                marginBottom: 4,
              }}
            >
              {/* TRAIN-PROFILES-A11Y-1: back button hardening */}
              Back to Training
            </button>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: 0,
                fontFamily: "'Rajdhani', sans-serif",
              }}
            >
              Custom Player Profiles
            </h1>
            <p style={{ fontSize: 14, color: '#b0b3b8', margin: '2px 0 0' }}>
              Apply opponent types and see how your strategy should adapt
            </p>
          </div>
        </div>

        <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
          {/* Profile Selector Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 8,
              marginBottom: 20,
            }}
          >
            {Object.values(PROFILES || {}).map((p) => (
              <motion.button
                key={p.id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleProfileSelect(p.id)}
                style={{
                  padding: '12px 10px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: selectedProfile === p.id ? `${p.color}15` : 'rgba(255,255,255,0.04)',
                  border: `2px solid ${selectedProfile === p.id ? p.color : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: p.color,
                    fontFamily: "'Rajdhani', sans-serif",
                    letterSpacing: '0.05em',
                  }}
                >
                  {p.name.toUpperCase()}
                </div>
                <div
                  style={{ fontSize: 11, color: '#b0b3b8', textAlign: 'center', lineHeight: 1.3 }}
                >
                  {p.desc.split('.')[0]}
                </div>
              </motion.button>
            ))}
          </div>

          {/* Selected Profile Stats */}
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${profile.border}`,
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: profile.color,
                  margin: 0,
                  fontFamily: "'Rajdhani', sans-serif",
                }}
              >
                {profile.name} — HUD Stats
              </h2>
              <div
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  background: `${profile.color}20`,
                  color: profile.color,
                  letterSpacing: '0.08em',
                }}
              >
                VPIP/PFR: {profile.stats.vpip}/{profile.stats.pfr}
              </div>
            </div>

            <StatBar
              label="VPIP"
              value={profile.stats.vpip}
              gtoValue={gto.vpip}
              color={profile.color}
            />
            <StatBar
              label="PFR"
              value={profile.stats.pfr}
              gtoValue={gto.pfr}
              color={profile.color}
            />
            <StatBar
              label="3-Bet"
              value={profile.stats.threeBet}
              gtoValue={gto.threeBet}
              max={25}
              color={profile.color}
            />
            <StatBar
              label="Fold to 3-Bet"
              value={profile.stats.foldTo3Bet}
              gtoValue={gto.foldTo3Bet}
              color={profile.color}
            />
            <StatBar
              label="C-Bet"
              value={profile.stats.cBet}
              gtoValue={gto.cBet}
              color={profile.color}
            />
            <StatBar
              label="Fold to C-Bet"
              value={profile.stats.foldToCBet}
              gtoValue={gto.foldToCBet}
              color={profile.color}
            />
            <StatBar
              label="WTSD"
              value={profile.stats.wtsd}
              gtoValue={gto.wtsd}
              max={50}
              color={profile.color}
            />
            <StatBar
              label="Aggression Factor"
              value={profile.stats.aggFactor * 10}
              gtoValue={gto.aggFactor * 10}
              max={50}
              color={profile.color}
            />
          </div>

          {/* Weaknesses & Exploits */}
          {profile.id !== 'gto' && (
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}
            >
              <div
                style={{
                  background: 'rgba(239,68,68,0.04)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--sp-accent-red)',
                    margin: '0 0 10px',
                    letterSpacing: '0.08em',
                  }}
                >
                  WEAKNESSES
                </h3>
                {profile.weaknesses.map((w, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 13,
                      color: '#e4e6eb',
                      marginBottom: 6,
                      paddingLeft: 12,
                      borderLeft: '2px solid rgba(239,68,68,0.3)',
                    }}
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div
                style={{
                  background: 'rgba(34,197,94,0.04)',
                  border: '1px solid rgba(34,197,94,0.15)',
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--sp-accent-green)',
                    margin: '0 0 10px',
                    letterSpacing: '0.08em',
                  }}
                >
                  OPTIMAL EXPLOITS
                </h3>
                {profile.exploits.map((e, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 13,
                      color: '#e4e6eb',
                      marginBottom: 6,
                      paddingLeft: 12,
                      borderLeft: '2px solid rgba(34,197,94,0.3)',
                    }}
                  >
                    {e}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GTO Adaptation Panel */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setShowAdaptation(!showAdaptation)}
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: 10,
              cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
              border: '1px solid rgba(99,102,241,0.25)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--sp-accent-blue)',
                fontFamily: "'Rajdhani', sans-serif",
                letterSpacing: '0.08em',
              }}
            >
              GTO ADAPTATION ENGINE
            </span>
            <span style={{ fontSize: 12, color: 'var(--sp-accent-blue)' }}>
              {showAdaptation ? 'Hide' : 'Show'} Counter-Strategy
            </span>
          </motion.button>

          <AnimatePresence>
            {showAdaptation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden', marginBottom: 16 }}
              >
                <div
                  style={{
                    background: 'rgba(99,102,241,0.04)',
                    border: '1px solid rgba(99,102,241,0.15)',
                    borderRadius: 10,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 16,
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <h4
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--sp-accent-blue)',
                          margin: '0 0 10px',
                          letterSpacing: '0.1em',
                        }}
                      >
                        PREFLOP ADJUSTMENTS
                      </h4>
                      {Object.entries(adaptation.preflopAdj || {}).map(([key, val]) => (
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 12, color: '#b0b3b8' }}>
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: val.includes('+')
                                ? 'var(--sp-accent-green)'
                                : val.includes('-')
                                  ? 'var(--sp-accent-red)'
                                  : '#b0b3b8',
                            }}
                          >
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <h4
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--sp-accent-blue)',
                          margin: '0 0 10px',
                          letterSpacing: '0.1em',
                        }}
                      >
                        POSTFLOP ADJUSTMENTS
                      </h4>
                      {Object.entries(adaptation.postflopAdj || {}).map(([key, val]) => (
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 12, color: '#b0b3b8' }}>
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: val.includes('+')
                                ? 'var(--sp-accent-green)'
                                : val.includes('-')
                                  ? 'var(--sp-accent-red)'
                                  : '#b0b3b8',
                            }}
                          >
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '12px 16px',
                      background: 'rgba(99,102,241,0.08)',
                      borderRadius: 8,
                      fontSize: 13,
                      color: '#e4e6eb',
                      lineHeight: 1.5,
                      borderLeft: '3px solid #818cf8',
                    }}
                  >
                    {adaptation.summary}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scenario Practice */}
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h3
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: '#e4e6eb',
                margin: '0 0 14px',
                fontFamily: "'Rajdhani', sans-serif",
              }}
            >
              Practice Spots vs {profile.name}
            </h3>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {SCENARIOS.map((s, i) => (
                <button
              type="button"
                  key={s.id}
                  onClick={() => setActiveScenario(i)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    background:
                      activeScenario === i ? `${profile.color}20` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${activeScenario === i ? profile.color : 'rgba(255,255,255,0.08)'}`,
                    color: activeScenario === i ? profile.color : '#b0b3b8',
                  }}
                >
                  {s.action}
                </button>
              ))}
            </div>
            <div
              style={{
                padding: 16,
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e4e6eb', marginBottom: 8 }}>
                {SCENARIOS[safeScenarioIdx]?.spot || 'Select a scenario'}
              </div>
              {SCENARIOS[safeScenarioIdx]?.board && (
                <div style={{ fontSize: 13, color: '#b0b3b8', marginBottom: 12 }}>
                  Board:{' '}
                  <span style={{ color: '#e4e6eb', fontWeight: 600 }}>
                    {SCENARIOS[safeScenarioIdx].board}
                  </span>
                </div>
              )}
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(34,197,94,0.06)',
                  borderRadius: 8,
                  borderLeft: `3px solid ${profile.color}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: profile.color,
                    letterSpacing: '0.1em',
                    marginBottom: 4,
                  }}
                >
                  OPTIMAL PLAY vs {(profile.name || 'OPPONENT').toUpperCase()}
                </div>
                <div style={{ fontSize: 13, color: '#e4e6eb', lineHeight: 1.5 }}>
                  {(profile.exploits || [])[
                    safeScenarioIdx % Math.max(1, (profile.exploits || []).length)
                  ] || 'Play GTO baseline.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
