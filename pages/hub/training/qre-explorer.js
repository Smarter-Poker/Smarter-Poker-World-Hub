/**
 * QRE POPULATION TENDENCIES — Quantal Response Equilibrium Explorer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Models how real humans play vs GTO. Shows population-adjusted frequencies
 * with QRE noise parameter (λ). Lower λ = more random, higher λ = GTO-like.
 *
 * Route: /hub/training/qre-explorer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-41 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';

// TRAIN-CSS-MOTION-ADOPT-6 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// QRE ENGINE — Quantal Response Equilibrium Adjustment
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Quantal Response Equilibrium (QRE) models bounded rationality.
 * Players make mistakes proportional to the EV difference between options.
 * λ (lambda) controls the "rationality" parameter:
 *   λ = 0:  Equal probability for all actions (random play)
 *   λ → ∞: Perfect GTO (Nash Equilibrium)
 *   λ = 1-5: Typical population play
 */

const GTO_ACTIONS = {
  'UTG-preflop': [
    { action: 'Open Raise', gtoFreq: 15, ev: 1.2 },
    { action: 'Fold', gtoFreq: 85, ev: 0 },
  ],
  'CO-preflop': [
    { action: 'Open Raise', gtoFreq: 27, ev: 1.8 },
    { action: 'Fold', gtoFreq: 73, ev: 0 },
  ],
  'BTN-preflop': [
    { action: 'Open Raise', gtoFreq: 48, ev: 2.2 },
    { action: 'Limp', gtoFreq: 5, ev: 0.4 },
    { action: 'Fold', gtoFreq: 47, ev: 0 },
  ],
  'SB-preflop': [
    { action: 'Open Raise', gtoFreq: 36, ev: 1.5 },
    { action: 'Limp', gtoFreq: 8, ev: 0.3 },
    { action: 'Fold', gtoFreq: 56, ev: 0 },
  ],
  'BB-vs3bet': [
    { action: '4-Bet', gtoFreq: 8, ev: 3.5 },
    { action: 'Call', gtoFreq: 25, ev: 1.2 },
    { action: 'Fold', gtoFreq: 67, ev: 0 },
  ],
  'IP-cbet-flop': [
    { action: 'C-Bet 33%', gtoFreq: 55, ev: 1.8 },
    { action: 'C-Bet 75%', gtoFreq: 15, ev: 1.2 },
    { action: 'Check', gtoFreq: 30, ev: 0.8 },
  ],
  'OOP-check-raise': [
    { action: 'Check-Raise', gtoFreq: 12, ev: 2.8 },
    { action: 'Check-Call', gtoFreq: 38, ev: 0.9 },
    { action: 'Check-Fold', gtoFreq: 50, ev: 0 },
  ],
  'river-bluff': [
    { action: 'Value Bet', gtoFreq: 30, ev: 4.5 },
    { action: 'Bluff', gtoFreq: 15, ev: 2.1 },
    { action: 'Check', gtoFreq: 55, ev: 0.5 },
  ],
};

const SPOT_LABELS = {
  'UTG-preflop': { label: 'UTG Open', street: 'Preflop', icon: '◆' },
  'CO-preflop': { label: 'CO Open', street: 'Preflop', icon: '◆' },
  'BTN-preflop': { label: 'BTN Open', street: 'Preflop', icon: '◆' },
  'SB-preflop': { label: 'SB Open', street: 'Preflop', icon: '⇄' },
  'BB-vs3bet': { label: 'BB vs 3-Bet', street: 'Preflop', icon: '▲' },
  'IP-cbet-flop': { label: 'IP C-Bet', street: 'Flop', icon: '●' },
  'OOP-check-raise': { label: 'OOP Check-Raise', street: 'Flop', icon: '⌁' },
  'river-bluff': { label: 'River Bluff', street: 'River', icon: '◇' },
};

const POOL_PRESETS = [
  { id: '2nl', label: '2NL Online', lambda: 0.8, desc: 'Very loose, passive, high error rate' },
  { id: '25nl', label: '25NL Online', lambda: 2.5, desc: 'Basic understanding, moderate errors' },
  { id: '200nl', label: '200NL Online', lambda: 5.0, desc: 'Competent, near-optimal play' },
  {
    id: 'live-1-2',
    label: 'Live $1/$2',
    lambda: 1.2,
    desc: 'Loose-passive, calling station tendencies',
  },
  { id: 'live-5-10', label: 'Live $5/$10', lambda: 3.5, desc: 'Mixed pool, some strong regulars' },
  { id: 'highroller', label: 'High Roller', lambda: 8.0, desc: 'Elite players, nearly GTO' },
];

function computeQRE(actions, lambda) {
  // Softmax / logit QRE model
  const maxEv = Math.max(...actions.map((a) => a.ev));
  const scaled = actions.map((a) => Math.exp(lambda * (a.ev - maxEv)));
  const total = scaled.reduce((s, v) => s + v, 0);
  return actions.map((a, i) => ({
    ...a,
    qreFreq: Math.round((scaled[i] / total) * 100),
  }));
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function QREExplorerPage() {
  const router = useRouter();
  useTrainingBus('qre-explorer');

  const [lambda, setLambda] = useState(2.5);
  const [selectedSpot, setSelectedSpot] = useState('BTN-preflop');
  const [activePreset, setActivePreset] = useState(null);

  const qreResults = useMemo(() => {
    const result = {};
    Object.entries(GTO_ACTIONS || {}).forEach(([spot, actions]) => {
      result[spot] = computeQRE(actions, lambda);
    });
    return result;
  }, [lambda]);

  const currentActions = qreResults[selectedSpot] || [];
  const spotInfo = SPOT_LABELS[selectedSpot];

  const handlePreset = (preset) => {
    setActivePreset(preset.id);
    setLambda(preset.lambda);
    (async () => {
      try {
        const token = await getAccessToken();
        if (token) {
          authedFetch('/api/training/save-session', {
            method: 'POST',
            body: JSON.stringify({
              gameId: 'qre-explorer',
              questionsAnswered: 1,
              questionsCorrect: 1,
              accuracy: 100,
            }),
          }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        }
        eventBus?.emit?.(
          EventType?.SESSION_END || 'session:end',
          { accuracy: 100, questionsAnswered: 1, questionsCorrect: 1 },
          'qre-explorer'
        );
      } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    })();
  };

  return (
    <>
      <Head>
        <title>QRE Explorer | Smarter.Poker Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', sans-serif",
          paddingBottom: 60,
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
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: 'var(--sp-fg-muted)',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ←
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>QRE Explorer</div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
              Population Tendencies — Quantal Response Equilibrium
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 700, margin: '0 auto' }}>
          {/* λ Slider */}
          <div
            style={{
              padding: 24,
              borderRadius: 16,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(99,102,241,0.2)',
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--sp-accent-purple)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Rationality Parameter (λ)
                </div>
                <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)', marginTop: 2 }}>
                  0 = random play → ∞ = perfect GTO
                </div>
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--sp-accent-purple)' }}>
                {(Number.isFinite(Number(lambda)) ? Number(lambda) : 0).toFixed(1)}
              </div>
            </div>
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={lambda}
              onChange={(e) => {
                setLambda(parseFloat(e.target.value));
                setActivePreset(null);
              }}
              style={{ width: '100%', accentColor: 'var(--sp-accent-purple)' }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 9,
                color: 'var(--sp-fg-dim)',
                marginTop: 4,
              }}
            >
              <span>Random</span>
              <span>Fish</span>
              <span>Reg</span>
              <span>Crusher</span>
              <span>GTO Bot</span>
            </div>
          </div>

          {/* Pool Presets */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--sp-fg-dim)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 12,
            }}
          >
            Population Presets
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              marginBottom: 24,
            }}
          >
            {POOL_PRESETS.map((p) => (
              <motion.button
                key={p.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => handlePreset(p)}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${activePreset === p.id ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.05)'}`,
                  background:
                    activePreset === p.id ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.02)',
                  color: activePreset === p.id ? 'var(--sp-accent-purple)' : 'var(--sp-fg-muted)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>{p.label}</div>
                <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)' }}>λ = {p.lambda}</div>
              </motion.button>
            ))}
          </div>

          {/* Spot Selector */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--sp-fg-dim)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 12,
            }}
          >
            Decision Spot
          </div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 8,
              marginBottom: 20,
            }}
          >
            {Object.entries(SPOT_LABELS || {}).map(([key, info]) => (
              <button
                key={key}
                onClick={() => setSelectedSpot(key)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  background: selectedSpot === key ? 'var(--sp-accent-purple)' : 'rgba(255,255,255,0.04)',
                  color: selectedSpot === key ? '#fff' : 'var(--sp-fg-muted)',
                }}
              >
                {info.icon} {info.label}
              </button>
            ))}
          </div>

          {/* GTO vs QRE Comparison */}
          <div
            style={{
              background: 'rgba(0,0,0,0.2)',
              padding: 24,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.05)',
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800 }}>
                {spotInfo.icon} {spotInfo.label}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: 'rgba(167,139,250,0.1)',
                  color: 'var(--sp-accent-purple)',
                }}
              >
                {spotInfo.street}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 60px 60px 60px',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sp-fg-dim)' }}>ACTION</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sp-accent-green)', textAlign: 'center' }}>
                GTO
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sp-accent-purple)', textAlign: 'center' }}>
                QRE
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sp-accent-amber)', textAlign: 'center' }}>
                DELTA
              </div>
            </div>

            {currentActions.map((a) => {
              const delta = a.qreFreq - a.gtoFreq;
              return (
                <motion.div
                  key={a.action}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 60px 60px 60px',
                    gap: 8,
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)' }}>
                      {a.action}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>EV: {a.ev}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sp-accent-green)' }}>
                      {a.gtoFreq}%
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sp-accent-purple)' }}>
                      {a.qreFreq}%
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: Math.abs(delta) < 3 ? 'var(--sp-fg-muted)' : delta > 0 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                      }}
                    >
                      {delta > 0 ? '+' : ''}
                      {delta}%
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Visual Bar Chart */}
          <div
            style={{
              background: 'rgba(0,0,0,0.2)',
              padding: 24,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.05)',
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg-muted)', marginBottom: 16 }}>
              Frequency Distribution
            </div>
            {currentActions.map((a) => (
              <div key={a.action} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg)', marginBottom: 6 }}>
                  {a.action}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        height: 10,
                        borderRadius: 3,
                        background: 'rgba(255,255,255,0.04)',
                        overflow: 'hidden',
                        marginBottom: 2,
                      }}
                    >
                      <motion.div
                        animate={{ width: `${a.gtoFreq}%` }}
                        transition={{ duration: MOTION.slow }}
                        style={{ height: '100%', background: 'var(--sp-accent-green)', borderRadius: 3 }}
                      />
                    </div>
                    <div
                      style={{
                        height: 10,
                        borderRadius: 3,
                        background: 'rgba(255,255,255,0.04)',
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        animate={{ width: `${a.qreFreq}%` }}
                        transition={{ duration: MOTION.slow }}
                        style={{ height: '100%', background: 'var(--sp-accent-purple)', borderRadius: 3 }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                gap: 16,
                justifyContent: 'center',
                fontSize: 10,
                marginTop: 8,
              }}
            >
              <span style={{ color: 'var(--sp-accent-green)', fontWeight: 700 }}>GTO (Nash)</span>
              <span style={{ color: 'var(--sp-accent-purple)', fontWeight: 700 }}>QRE (Population)</span>
            </div>
          </div>

          {/* Exploit Suggestion */}
          <div
            style={{
              padding: 20,
              borderRadius: 16,
              background: 'rgba(251,191,36,0.05)',
              border: '1px solid rgba(251,191,36,0.15)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--sp-accent-amber)',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Exploit Recommendation
            </div>
            <div style={{ fontSize: 13, color: 'var(--sp-fg)', lineHeight: 1.6 }}>
              {lambda < 1.5
                ? 'This population plays nearly randomly. Exploit by value-betting thinner, bluffing less (they call too much), and sizing up for value.'
                : lambda < 3
                  ? 'Typical recreational pool. They over-fold to aggression preflop and under-bluff postflop. Increase 3-bet frequency and barrel bluffs on scary runouts.'
                  : lambda < 6
                    ? 'Competent pool approaching GTO. Exploit marginal edges by adjusting bet sizing and targeting small frequency leaks in specific spots.'
                    : 'Near-GTO population. Standard balanced strategy is optimal. Focus on mixed strategy precision and maximizing BB/100 through positional awareness.'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
