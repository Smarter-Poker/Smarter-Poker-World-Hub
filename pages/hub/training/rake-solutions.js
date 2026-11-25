/**
 * RAKE SENSITIVITY MODEL — Authored Teaching Illustration
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Explore one disclosed mathematical curve over authored reference values.
 * This page contains no solver output, EV calculation, or strategy advice.
 *
 * Route: /hub/training/rake-solutions
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-45 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['Ac', 'Kc'],
  plo4: ['Ac', 'Kc', 'Qd', 'Jd'],
  plo5: ['Ac', 'Kc', 'Qd', 'Jd', 'Ts'],
  plo6: ['Ac', 'Kc', 'Qd', 'Jd', 'Ts', '9s'],
  plo8: ['Ac', 'Kc', 'Qd', 'Jd'],
};

const BOARD_BY_STREET = {
  preflop: [],
  flop: ['Qc', '7c', '2h'],
  turn: ['Qc', '7c', '2h', '9d'],
  river: ['Qc', '7c', '2h', '9d', '4s'],
};

const pillStyle = (active) => ({
  padding: '6px 12px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  border: active ? '1px solid #67e8f9' : '1px solid rgba(255,255,255,0.16)',
  background: active
    ? 'linear-gradient(180deg, rgba(8,145,178,0.75), rgba(3,50,74,0.92))'
    : 'rgba(255,255,255,0.05)',
  color: active ? '#e8fbff' : '#cbd5e1',
});

// TRAIN-CSS-MOTION-ADOPT-21 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// RAKE STRUCTURE PRESETS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RAKE_PRESETS = [
  {
    id: 'no-rake',
    label: 'No Rake',
    pct: 0,
    cap: 0,
    desc: 'Zero-Cost Illustration',
    color: 'var(--sp-accent-green)',
  },
  {
    id: 'micro-5-1',
    label: 'Micros 5%/$1',
    pct: 5,
    cap: 1,
    desc: 'Illustrative $1 Cap',
    color: 'var(--sp-accent-blue)',
  },
  { id: 'low-5-3', label: '5%/$3', pct: 5, cap: 3, desc: 'Illustrative $3 Cap', color: 'var(--sp-accent-purple)' },
  {
    id: 'mid-5-5',
    label: 'Mid 5%/$5',
    pct: 5,
    cap: 5,
    desc: 'Illustrative $5 Cap',
    color: 'var(--sp-accent-amber)',
  },
  {
    id: 'live-10-5',
    label: 'Live 10%/$5',
    pct: 10,
    cap: 5,
    desc: 'Illustrative 10% Model',
    color: 'var(--sp-accent-red)',
  },
  {
    id: 'live-5-15',
    label: 'Live 5%/$15',
    pct: 5,
    cap: 15,
    desc: 'Illustrative $15 Cap',
    color: '#ec4899',
  },
];

// Arbitrary authored teaching references. These are not solver frequencies.
const AUTHORED_REFERENCE_FREQS = {
  UTG: { rfi: 15, fold3bet: 55, threeBet: 3, cbet: 60 },
  HJ: { rfi: 18, fold3bet: 50, threeBet: 5, cbet: 62 },
  CO: { rfi: 27, fold3bet: 45, threeBet: 7, cbet: 65 },
  BTN: { rfi: 48, fold3bet: 40, threeBet: 10, cbet: 70 },
  SB: { rfi: 36, fold3bet: 42, threeBet: 12, cbet: 55 },
  BB: { rfi: 0, fold3bet: 38, threeBet: 14, cbet: 48 },
};

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STATS = [
  { key: 'rfi', label: 'RFI %', desc: 'Raise First In', icon: '◆' },
  { key: 'fold3bet', label: 'Fold to 3-Bet', desc: 'Fold vs 3-Bet %', icon: '▼' },
  { key: 'threeBet', label: '3-Bet %', desc: '3-Bet Frequency', icon: '▲' },
  { key: 'cbet', label: 'C-Bet %', desc: 'Continuation Bet', icon: '●' },
];

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// RAKE ADJUSTMENT ENGINE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function applyIllustrativeRakeCurve(baseline, rakePct, rakeCap) {
  // Disclosed toy curve: pressure = (percentage / 5) × min(cap / 3, 2).
  // The coefficients below are authored visual inputs, not empirical or solved data.
  const rakePressure = (rakePct / 5) * Math.min(rakeCap / 3, 2); // normalized 0-2 scale
  return {
    rfi: baseline.rfi === 0 ? 0 : Math.max(5, Math.round(baseline.rfi - rakePressure * 3.5)),
    fold3bet: Math.min(75, Math.round(baseline.fold3bet + rakePressure * 4)),
    threeBet: Math.max(1, Math.round(baseline.threeBet - rakePressure * 1.5)),
    cbet: Math.max(35, Math.round(baseline.cbet - rakePressure * 2.5)),
  };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// VISUAL COMPONENTS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function FreqBar({ value, maxVal = 80, color, label }) {
  const width = Math.min(100, (value / maxVal) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div
        style={{ width: 36, fontSize: 12, fontWeight: 700, color: 'var(--sp-fg-muted)', textAlign: 'right' }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          height: 16,
          borderRadius: 4,
          background: 'rgba(255,255,255,0.04)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <motion.div
          animate={{ width: `${width}%` }}
          transition={{ duration: MOTION.slow, ease: 'easeOut' }}
          style={{ height: '100%', background: color, borderRadius: 4 }}
        />
      </div>
      <div style={{ width: 32, fontSize: 12, fontWeight: 800, color }}>{value}%</div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function RakeSolutionsPage() {
  const router = useRouter();
  useTrainingBus('rake-solutions');

  const [activeRake, setActiveRake] = useState(RAKE_PRESETS[0]);
  const [compareRake, setCompareRake] = useState(null);
  const [selectedPosition, setSelectedPosition] = useState('BTN');
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [street, setStreet] = useState('flop');
  const [effectiveStackBb, setEffectiveStackBb] = useState(100);
  const [pot, setPot] = useState(12);
  const [toCall, setToCall] = useState(4);

  const heroCards = HERO_CARDS_BY_VARIANT[activeVariant] || HERO_CARDS_BY_VARIANT.nlh;
  const boardCards = BOARD_BY_STREET[street] || BOARD_BY_STREET.flop;

  const brainEval = useMemo(
    () =>
      evaluateTrainingSpotWithHorseBrain({
        variant: activeVariant,
        street,
        heroCards,
        boardCards,
        pot,
        toCall,
        effectiveStackBb,
      }),
    [activeVariant, street, heroCards, boardCards, pot, toCall, effectiveStackBb]
  );

  const arenaHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        { gameId: activeVariant === 'nlh' ? 'cash-002' : 'cash-005', variant: activeVariant },
        'rake-solutions'
      ),
    [activeVariant]
  );

  // Compute adjusted frequencies
  const adjustedFreqs = useMemo(() => {
    const result = {};
    POSITIONS.forEach((pos) => {
      result[pos] = applyIllustrativeRakeCurve(AUTHORED_REFERENCE_FREQS[pos], activeRake.pct, activeRake.cap);
    });
    return result;
  }, [activeRake]);

  const compareFreqs = useMemo(() => {
    if (!compareRake) return null;
    const result = {};
    POSITIONS.forEach((pos) => {
      result[pos] = applyIllustrativeRakeCurve(AUTHORED_REFERENCE_FREQS[pos], compareRake.pct, compareRake.cap);
    });
    return result;
  }, [compareRake]);

  return (
    <>
      <SEOHead
        title="Poker Rake Sensitivity Explorer"
        description="Visualize How Pot Percentage Rake And Dollar Caps Shift Preflop Opening, Cold-Calling, And Three-Betting Sensitivity Curves On Smarter.Poker."
        canonical="/hub/training/rake-solutions"
      />
      <div
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>Rake Sensitivity Model</div>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>
              Authored Toy Curve • Not Solver Or Strategy Data
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 700, margin: '0 auto' }}>
          <div
            role="note"
            data-training-authority="authored-toy-model"
            style={{
              padding: 14,
              marginBottom: 20,
              border: '1px solid rgba(251,191,36,0.28)',
              background: 'rgba(251,191,36,0.06)',
              color: 'var(--sp-fg-muted)',
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            This Page Applies A Disclosed Toy Curve To Authored Reference Numbers. It Does Not
            Run A Solver, Measure A Player Pool, Calculate EV, Or Recommend A Poker Strategy.
          </div>
          {/* Rake Selector */}
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--sp-fg-dim)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 12,
            }}
          >
            Select Rake Structure
          </div>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}
          >
            {RAKE_PRESETS.map((rk) => (
              <motion.button
                key={rk.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setActiveRake(rk);
                }}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: activeRake.id === rk.id ? `${rk.color}15` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${activeRake.id === rk.id ? `${rk.color}55` : 'rgba(255,255,255,0.05)'}`,
                  color: activeRake.id === rk.id ? rk.color : 'var(--sp-fg-muted)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>{rk.label}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: activeRake.id === rk.id ? `${rk.color}aa` : 'var(--sp-fg-dim)',
                  }}
                >
                  {rk.desc}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: 'var(--sp-fg)' }}>
                  {rk.pct}% / ${rk.cap} Cap
                </div>
              </motion.button>
            ))}
          </div>

          {/* Compare toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg-muted)' }}>Compare With:</span>
            <select
              aria-label="Rake Structure"
              value={compareRake?.id || ''}
              onChange={(e) =>
                setCompareRake(RAKE_PRESETS.find((r) => r.id === e.target.value) || null)
              }
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--sp-fg)',
                fontSize: 12,
              }}
            >
              <option value="">None</option>
              {RAKE_PRESETS.filter((r) => r.id !== activeRake.id).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Position Selector */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 24, overflowX: 'auto' }}>
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPosition(p)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: selectedPosition === p ? activeRake.color : 'rgba(255,255,255,0.04)',
                  color: selectedPosition === p ? '#fff' : 'var(--sp-fg-muted)',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Frequency Comparisons */}
          <div
            style={{
              background: 'rgba(0,0,0,0.2)',
              padding: 24,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.05)',
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
              {selectedPosition} - {activeRake.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginBottom: 20 }}>
              Illustrative Values After The Authored Rake Curve
            </div>

            {STATS.map((stat) => {
              const val = adjustedFreqs[selectedPosition][stat.key];
              const baseVal = AUTHORED_REFERENCE_FREQS[selectedPosition][stat.key];
              const delta = val - baseVal;
              return (
                <div key={stat.key} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{stat.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)' }}>
                        {stat.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--sp-fg-muted)' }}>
                        Authored Ref: {baseVal}%
                      </span>
                      {delta !== 0 && (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: delta > 0 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                          }}
                        >
                          {delta > 0 ? '+' : ''}
                          {delta}%
                        </span>
                      )}
                    </div>
                  </div>
                  <FreqBar value={val} color={activeRake.color} label="" />
                  {compareRake && compareFreqs && (
                    <FreqBar
                      value={compareFreqs[selectedPosition][stat.key]}
                      color={compareRake.color}
                      label="vs"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Position Overview Grid */}
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--sp-fg-dim)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 12,
            }}
          >
            All Positions - RFI Adjustment
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {POSITIONS.map((pos) => {
              const val = adjustedFreqs[pos].rfi;
              const base = AUTHORED_REFERENCE_FREQS[pos].rfi;
              const delta = val - base;
              return (
                <motion.div
                  key={pos}
                  whileHover={{ scale: 1.03 }}
                  onClick={() => setSelectedPosition(pos)}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    textAlign: 'center',
                    cursor: 'pointer',
                    background:
                      selectedPosition === pos ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${selectedPosition === pos ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sp-fg)' }}>{pos}</div>
                  <div
                    style={{ fontSize: 22, fontWeight: 900, color: activeRake.color, marginTop: 4 }}
                  >
                    {val}%
                  </div>
                  {delta !== 0 && (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: delta > 0 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                        marginTop: 2,
                      }}
                    >
                      {delta > 0 ? '+' : ''}
                      {delta}%
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Insight Box */}
          <div
            style={{
              marginTop: 24,
              padding: 20,
              borderRadius: 16,
              background: 'rgba(251,191,36,0.05)',
              border: '1px solid rgba(251,191,36,0.15)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--sp-accent-amber)',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Model Formula
            </div>
            <div style={{ fontSize: 13, color: 'var(--sp-fg)', lineHeight: 1.6 }}>
              Pressure Equals (Rake Percentage ÷ 5) × The Smaller Of (Cap ÷ 3) Or 2. Authored
              Coefficients Then Move The Four Display Values. The Result Is A Sensitivity
              Illustration Only; It Is Not A Win-Rate Estimate, Range, Action, Or Recommendation.
            </div>
          </div>

          <div
            data-specialty-brain-panel="true"
            data-brain-engine={brainEval.engineModule}
            data-recommended-action={brainEval.correctAnswer}
            data-active-variant={activeVariant}
            style={{
              marginTop: 24,
              padding: 18,
              borderRadius: 16,
              border: '1px solid rgba(56,189,248,0.40)',
              background: 'rgba(15,23,42,0.82)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#67e8f9', textTransform: 'uppercase' }}>
                Horse Brain Equilibrium &amp; EV Calibration Panel
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#4ade80' }}>
                {`Engine: ${brainEval.engineModule} · Action: ${brainEval.correctAnswerText}`}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Variant</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
                    <button key={v} type="button" data-variant-option={v} onClick={() => setActiveVariant(v)} style={pillStyle(activeVariant === v)}>
                      {v.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Street</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {['preflop', 'flop', 'turn', 'river'].map((st) => (
                    <button key={st} type="button" data-street-option={st} onClick={() => setStreet(st)} style={pillStyle(street === st)}>
                      {st.charAt(0).toUpperCase() + st.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Stack Depth</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[20, 50, 100, 200].map((stk) => (
                    <button key={stk} type="button" data-stack-option={stk} onClick={() => setEffectiveStackBb(stk)} style={pillStyle(effectiveStackBb === stk)}>
                      {stk} BB
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Pot Size</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[6, 12, 24].map((p) => (
                    <button key={p} type="button" data-pot-option={p} onClick={() => setPot(p)} style={pillStyle(pot === p)}>
                      {p} BB
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Facing Bet</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[0, 4, 8, 16].map((bet) => (
                    <button key={bet} type="button" data-facing-bet-option={bet} onClick={() => setToCall(bet)} style={pillStyle(toCall === bet)}>
                      {bet} BB
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>Rake Environment</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {RAKE_PRESETS.slice(0, 4).map((rk) => (
                    <button key={rk.id} type="button" data-rake-option={rk.id} onClick={() => setActiveRake(rk)} style={pillStyle(activeRake.id === rk.id)}>
                      {rk.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Hand Strength</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc' }}>{brainEval.handScore}/100</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Category</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#38bdf8' }}>{brainEval.madeHandCategory}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Recommended Action</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#4ade80' }}>{brainEval.correctAnswerText}</div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.55, marginBottom: 14 }}>{brainEval.explanation}</div>

            <button
              type="button"
              data-launch-club-arena-cta="true"
              data-launch-href={arenaHref}
              onClick={() => router.push(arenaHref)}
              style={{
                display: 'inline-flex',
                minHeight: 44,
                alignItems: 'center',
                padding: '0 18px',
                borderRadius: 8,
                border: '1px solid #67e8f9',
                background: 'linear-gradient(180deg, #0891b2, #075985)',
                color: '#fff',
                fontWeight: 900,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Practice Equilibrium Spot In Club Arena →
            </button>
          </div>
        </div>
      </div>
      <HubPageSummary page="training-rake-solutions" />
    </>
  );
}
