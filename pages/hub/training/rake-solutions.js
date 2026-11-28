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


import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import at from '../../../src/styles/training/analysis-tools.module.css';
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
  { id: 'low-5-3', label: '5%/$3', pct: 5, cap: 3, desc: 'Illustrative $3 Cap', color: '#86daff' },
  {
    id: 'mid-5-5',
    label: 'Mid 5%/$5',
    pct: 5,
    cap: 5,
    desc: 'Illustrative $5 Cap',
    color: '#86daff',
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
    color: '#86daff',
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

function FreqBar({ value, maxVal = 80, compare = false, label }) {
  const width = Math.min(100, (value / maxVal) * 100);
  return (
    <div className={at.freqRow}>
      <span className={at.small}>{label}</span>
      <div className={at.track} style={{ blockSize: 12 }}>
        <motion.div
          className={`${at.fill} ${compare ? at.fillSilver : ''}`}
          animate={{ width: `${width}%` }}
          transition={{ duration: MOTION.slow, ease: 'easeOut' }}
        />
      </div>
      <strong className={compare ? at.white : at.ice}>{value}%</strong>
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
      <div className={at.shell}>
        <TrainingPageHead slug="training-rake-solutions" note="Authored Toy Curve • Not Solver Or Strategy Data" />

        <div className={at.page}>
          <div role="note" data-training-authority="authored-toy-model" className={`sd-panel ${at.note}`}>
            This Page Applies A Disclosed Toy Curve To Authored Reference Numbers. It Does Not
            Run A Solver, Measure A Player Pool, Calculate EV, Or Recommend A Poker Strategy.
          </div>

          {/* Rake Selector */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="rs-structure-title">
            <h2 id="rs-structure-title" className={at.sectionTitle}>Select Rake Structure</h2>
            <div className={`${at.cardsGrid} ${at.cardsGrid2}`}>
              {RAKE_PRESETS.map((rk) => (
                <motion.button
                  key={rk.id}
                  type="button"
                  className={`sd-button ${at.choiceCard}`}
                  aria-pressed={activeRake.id === rk.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setActiveRake(rk);
                  }}
                >
                  <span className={at.choiceTitle}>{rk.label}</span>
                  <span className={at.choiceMeta}>{rk.desc}</span>
                  <span className={at.choiceMeta}>{rk.pct}% / ${rk.cap} Cap</span>
                </motion.button>
              ))}
            </div>

            {/* Compare toggle */}
            <label className={at.field}>
              <span className={at.label}>Compare With</span>
              <select
                aria-label="Rake Structure"
                className={at.select}
                value={compareRake?.id || ''}
                onChange={(e) =>
                  setCompareRake(RAKE_PRESETS.find((r) => r.id === e.target.value) || null)
                }
              >
                <option value="">None</option>
                {RAKE_PRESETS.filter((r) => r.id !== activeRake.id).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Position Selector */}
            <div className={at.field}>
              <span className={at.label}>Position</span>
              <div className={at.segmented} role="group" aria-label="Position">
                {POSITIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="sd-button"
                    aria-pressed={selectedPosition === p}
                    onClick={() => setSelectedPosition(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Frequency Comparisons */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="rs-freq-title">
            <div>
              <h2 id="rs-freq-title" className={at.sectionTitle}>
                {selectedPosition} - {activeRake.label}
              </h2>
              <p className={at.small}>Illustrative Values After The Authored Rake Curve</p>
            </div>

            {STATS.map((stat) => {
              const val = adjustedFreqs[selectedPosition][stat.key];
              const baseVal = AUTHORED_REFERENCE_FREQS[selectedPosition][stat.key];
              const delta = val - baseVal;
              return (
                <div key={stat.key} className={at.field}>
                  <div className={at.barHead} style={{ margin: 0 }}>
                    <span>
                      <span aria-hidden className={at.ice}>{stat.icon}</span> {stat.label}
                    </span>
                    <span>
                      Authored Ref: {baseVal}%
                      {delta !== 0 && (
                        <strong className={at.white}>
                          {' '}({delta > 0 ? '+' : ''}
                          {delta}%)
                        </strong>
                      )}
                    </span>
                  </div>
                  <FreqBar value={val} label={activeRake.label} />
                  {compareRake && compareFreqs && (
                    <FreqBar
                      value={compareFreqs[selectedPosition][stat.key]}
                      compare
                      label={`Vs ${compareRake.label}`}
                    />
                  )}
                </div>
              );
            })}
          </section>

          {/* Position Overview Grid */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="rs-overview-title">
            <h2 id="rs-overview-title" className={at.sectionTitle}>All Positions - RFI Adjustment</h2>
            <div className={`${at.metrics} ${at.metrics3}`}>
              {POSITIONS.map((pos) => {
                const val = adjustedFreqs[pos].rfi;
                const base = AUTHORED_REFERENCE_FREQS[pos].rfi;
                const delta = val - base;
                return (
                  <button
                    key={pos}
                    type="button"
                    className={`sd-metric ${at.metric} ${at.metricButton}`}
                    data-active={selectedPosition === pos ? 'true' : undefined}
                    aria-pressed={selectedPosition === pos}
                    onClick={() => setSelectedPosition(pos)}
                  >
                    <span className={at.metricLabel}>{pos}</span>
                    <strong className={at.metricValue} data-tone="ice">{val}%</strong>
                    {delta !== 0 && (
                      <span className={at.small}>
                        {delta > 0 ? '+' : ''}
                        {delta}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Insight Box */}
          <section className={`sd-panel ${at.panel} ${at.tight}`} aria-labelledby="rs-formula-title">
            <h2 id="rs-formula-title" className={at.eyebrow}>Model Formula</h2>
            <p className={at.copy}>
              Pressure Equals (Rake Percentage ÷ 5) × The Smaller Of (Cap ÷ 3) Or 2. Authored
              Coefficients Then Move The Four Display Values. The Result Is A Sensitivity
              Illustration Only; It Is Not A Win-Rate Estimate, Range, Action, Or Recommendation.
            </p>
          </section>
        </div>
      </div>
      <HubPageSummary page="training-rake-solutions" />
    </>
  );
}
