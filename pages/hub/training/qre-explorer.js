/**
 * QRE TOY MODEL — Quantal Response Learning Explorer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Demonstrates how a softmax responds to authored utility weights. It does not
 * contain solver output, Nash frequencies, measured pool data, or strategy advice.
 *
 * Route: /hub/training/qre-explorer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-41 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

// TRAIN-CSS-MOTION-ADOPT-6 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// QRE TEACHING MODEL — Softmax Adjustment Over Authored Inputs
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * This deliberately simplified teaching model applies a softmax to arbitrary,
 * dimensionless utility weights. Lambda changes concentration only. Neither the
 * weights nor the reference frequencies are solver-derived or population samples.
 */

const AUTHORED_ACTIONS = {
  'UTG-preflop': [
    { action: 'Open Raise', referenceFreq: 15, utility: 1.2 },
    { action: 'Fold', referenceFreq: 85, utility: 0 },
  ],
  'CO-preflop': [
    { action: 'Open Raise', referenceFreq: 27, utility: 1.8 },
    { action: 'Fold', referenceFreq: 73, utility: 0 },
  ],
  'BTN-preflop': [
    { action: 'Open Raise', referenceFreq: 48, utility: 2.2 },
    { action: 'Limp', referenceFreq: 5, utility: 0.4 },
    { action: 'Fold', referenceFreq: 47, utility: 0 },
  ],
  'SB-preflop': [
    { action: 'Open Raise', referenceFreq: 36, utility: 1.5 },
    { action: 'Limp', referenceFreq: 8, utility: 0.3 },
    { action: 'Fold', referenceFreq: 56, utility: 0 },
  ],
  'BB-vs3bet': [
    { action: '4-Bet', referenceFreq: 8, utility: 3.5 },
    { action: 'Call', referenceFreq: 25, utility: 1.2 },
    { action: 'Fold', referenceFreq: 67, utility: 0 },
  ],
  'IP-cbet-flop': [
    { action: 'C-Bet 33%', referenceFreq: 55, utility: 1.8 },
    { action: 'C-Bet 75%', referenceFreq: 15, utility: 1.2 },
    { action: 'Check', referenceFreq: 30, utility: 0.8 },
  ],
  'OOP-check-raise': [
    { action: 'Check-Raise', referenceFreq: 12, utility: 2.8 },
    { action: 'Check-Call', referenceFreq: 38, utility: 0.9 },
    { action: 'Check-Fold', referenceFreq: 50, utility: 0 },
  ],
  'river-bluff': [
    { action: 'Value Bet', referenceFreq: 30, utility: 4.5 },
    { action: 'Bluff', referenceFreq: 15, utility: 2.1 },
    { action: 'Check', referenceFreq: 55, utility: 0.5 },
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

const MODEL_PRESETS = [
  { id: 'diffuse', label: 'Diffuse', lambda: 0.8, desc: 'Actions remain broadly distributed' },
  { id: 'soft', label: 'Soft', lambda: 1.5, desc: 'Utility differences have a modest effect' },
  { id: 'balanced', label: 'Medium', lambda: 2.5, desc: 'A middle teaching setting' },
  { id: 'focused', label: 'Focused', lambda: 4.0, desc: 'Higher-utility actions concentrate' },
  { id: 'sharp', label: 'Sharp', lambda: 6.0, desc: 'A strongly concentrated illustration' },
  { id: 'very-sharp', label: 'Very Sharp', lambda: 8.0, desc: 'An extreme sensitivity illustration' },
];

function computeQRE(actions, lambda) {
  // Softmax teaching model over dimensionless authored utilities.
  const maxUtility = Math.max(...actions.map((a) => a.utility));
  const scaled = actions.map((a) => Math.exp(lambda * (a.utility - maxUtility)));
  const total = scaled.reduce((s, v) => s + v, 0);
  return actions.map((a, i) => ({
    ...a,
    modelFreq: Math.round((scaled[i] / total) * 100),
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
    Object.entries(AUTHORED_ACTIONS || {}).forEach(([spot, actions]) => {
      result[spot] = computeQRE(actions, lambda);
    });
    return result;
  }, [lambda]);

  const currentActions = qreResults[selectedSpot] || [];
  const spotInfo = SPOT_LABELS[selectedSpot];

  const handlePreset = (preset) => {
    setActivePreset(preset.id);
    setLambda(preset.lambda);
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>QRE Toy Model</div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
              Authored Illustration • No Solver Or Population Data
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
                  Concentration Parameter (λ)
                </div>
                <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)', marginTop: 2 }}>
                  Lower = More Even → Higher = More Concentrated
                </div>
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--sp-accent-purple)' }}>
                {(Number.isFinite(Number(lambda)) ? Number(lambda) : 0).toFixed(1)}
              </div>
            </div>
            <input
              aria-label="Model Concentration Lambda"
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
              <span>Diffuse</span>
              <span>Soft</span>
              <span>Medium</span>
              <span>Focused</span>
              <span>Sharp</span>
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
            Illustration Presets
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              marginBottom: 24,
            }}
          >
            {MODEL_PRESETS.map((p) => (
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

          {/* Authored reference versus teaching-model comparison */}
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
                AUTHORED
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sp-accent-purple)', textAlign: 'center' }}>
                MODEL
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sp-accent-amber)', textAlign: 'center' }}>
                DELTA
              </div>
            </div>

            {currentActions.map((a) => {
              const delta = a.modelFreq - a.referenceFreq;
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
                    <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>
                      Model Utility: {a.utility}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sp-accent-green)' }}>
                      {a.referenceFreq}%
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sp-accent-purple)' }}>
                      {a.modelFreq}%
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
                        animate={{ width: `${a.referenceFreq}%` }}
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
                        animate={{ width: `${a.modelFreq}%` }}
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
              <span style={{ color: 'var(--sp-accent-green)', fontWeight: 700 }}>Authored Reference</span>
              <span style={{ color: 'var(--sp-accent-purple)', fontWeight: 700 }}>Toy Model</span>
            </div>
          </div>

          {/* Model interpretation */}
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
              Model Observation
            </div>
            <div style={{ fontSize: 13, color: 'var(--sp-fg)', lineHeight: 1.6 }}>
              {lambda < 1.5
                ? 'At this setting, the toy model keeps the authored actions relatively diffuse.'
                : lambda < 3
                  ? 'At this setting, authored utility differences create moderate concentration.'
                  : lambda < 6
                    ? 'At this setting, the toy model places much more weight on the highest authored utility.'
                    : 'At this setting, the toy model is extremely sensitive to the highest authored utility.'}{' '}
              This Is A Mathematical Illustration Only. It Does Not Describe A Real Player Pool,
              Establish Action Quality, Or Recommend Poker Strategy.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
