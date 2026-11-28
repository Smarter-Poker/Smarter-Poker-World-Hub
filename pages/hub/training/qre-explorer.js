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
import SEOHead from '../../../src/components/seo/SEOHead';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';


import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import at from '../../../src/styles/training/analysis-tools.module.css';
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
      <SEOHead
        title="Quantal Response Equilibrium Explorer"
        description="Explore How Quantal Response Equilibrium And Softmax Noise Parameter Lambda Transform Sharp Nash Poker Strategies Into Smooth Distributions On Smarter.Poker."
        canonical="/hub/training/qre-explorer"
      />
      <div className={at.shell}>
        <TrainingPageHead slug="training-qre-explorer" note="Authored Illustration • No Solver Or Population Data" />

        <div className={at.page}>
          {/* λ Slider */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="qre-lambda-title">
            <div className={at.panelHead}>
              <div>
                <h2 id="qre-lambda-title" className={at.sectionTitle}>Concentration Parameter (λ)</h2>
                <p className={at.small}>Lower = More Even → Higher = More Concentrated</p>
              </div>
              <strong className={at.metricValue} data-tone="ice" style={{ fontSize: '2rem' }}>
                {(Number.isFinite(Number(lambda)) ? Number(lambda) : 0).toFixed(1)}
              </strong>
            </div>
            <input
              aria-label="Model Concentration Lambda"
              type="range"
              className={at.range}
              min="0.1"
              max="10"
              step="0.1"
              value={lambda}
              onChange={(e) => {
                setLambda(parseFloat(e.target.value));
                setActivePreset(null);
              }}
            />
            <div className={at.scaleLabels} aria-hidden>
              <span>Diffuse</span>
              <span>Soft</span>
              <span>Medium</span>
              <span>Focused</span>
              <span>Sharp</span>
            </div>

            {/* Pool Presets */}
            <hr className={at.rule} />
            <h3 className={at.label}>Illustration Presets</h3>
            <div className={`${at.metrics} ${at.metrics3}`}>
              {MODEL_PRESETS.map((p) => (
                <motion.button
                  key={p.id}
                  type="button"
                  className={`sd-button ${at.stackedButton}`}
                  aria-pressed={activePreset === p.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handlePreset(p)}
                >
                  <span className={at.choiceTitle}>{p.label}</span>
                  <span className={at.choiceMeta}>λ = {p.lambda}</span>
                </motion.button>
              ))}
            </div>
          </section>

          {/* Spot Selector */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="qre-spot-title">
            <h2 id="qre-spot-title" className={at.sectionTitle}>Decision Spot</h2>
            <div className={at.chips} role="group" aria-label="Decision Spot">
              {Object.entries(SPOT_LABELS || {}).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  className="sd-button"
                  aria-pressed={selectedSpot === key}
                  onClick={() => setSelectedSpot(key)}
                >
                  <span aria-hidden>{info.icon}</span> {info.label}
                </button>
              ))}
            </div>
          </section>

          {/* Authored reference versus teaching-model comparison */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="qre-compare-title">
            <div className={at.panelHead}>
              <h2 id="qre-compare-title" className={at.sectionTitle}>
                <span aria-hidden className={at.ice}>{spotInfo.icon}</span> {spotInfo.label}
              </h2>
              <span className={at.tag}>{spotInfo.street}</span>
            </div>

            <div className={at.tableWrap}>
              <table className={at.table}>
                <thead>
                  <tr>
                    <th scope="col">Action</th>
                    <th scope="col">Authored</th>
                    <th scope="col">Model</th>
                    <th scope="col">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {currentActions.map((a) => {
                    const delta = a.modelFreq - a.referenceFreq;
                    return (
                      <tr key={a.action}>
                        <td>
                          <strong className={at.white}>{a.action}</strong>
                          <span className={at.small} style={{ display: 'block' }}>Model Utility: {a.utility}</span>
                        </td>
                        <td>{a.referenceFreq}%</td>
                        <td className={at.ice}>{a.modelFreq}%</td>
                        <td className={Math.abs(delta) < 3 ? at.small : at.white}>
                          {delta > 0 ? '+' : ''}
                          {delta}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Visual Bar Chart */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="qre-dist-title">
            <h2 id="qre-dist-title" className={at.sectionTitle}>Frequency Distribution</h2>
            {currentActions.map((a) => (
              <div key={a.action} className={at.field}>
                <span className={at.barHead} style={{ margin: 0 }}>
                  <span>{a.action}</span>
                  <span>{a.referenceFreq}% / {a.modelFreq}%</span>
                </span>
                <div className={at.track} aria-hidden>
                  <motion.div
                    className={`${at.fill} ${at.fillSilver}`}
                    animate={{ width: `${a.referenceFreq}%` }}
                    transition={{ duration: MOTION.slow }}
                  />
                </div>
                <div className={at.track} aria-hidden>
                  <motion.div
                    className={at.fill}
                    animate={{ width: `${a.modelFreq}%` }}
                    transition={{ duration: MOTION.slow }}
                  />
                </div>
              </div>
            ))}
            <div className={at.legend} style={{ gridAutoFlow: 'column', justifyContent: 'center', gap: 16 }}>
              <span className={at.legendItem}><span className={at.legendSwatch} style={{ background: 'linear-gradient(180deg, #d4e3ef, #6d8aa3)' }} aria-hidden />Authored Reference</span>
              <span className={at.legendItem}><span className={at.legendSwatch} style={{ background: 'linear-gradient(180deg, #7fe7ff, #1d8fe0)' }} aria-hidden />Toy Model</span>
            </div>
          </section>

          {/* Model interpretation */}
          <section className={`sd-panel ${at.panel} ${at.tight}`} aria-labelledby="qre-observation-title">
            <h2 id="qre-observation-title" className={at.eyebrow}>Model Observation</h2>
            <p className={at.copy}>
              {lambda < 1.5
                ? 'At This Setting, The Toy Model Keeps The Authored Actions Relatively Diffuse.'
                : lambda < 3
                  ? 'At This Setting, Authored Utility Differences Create Moderate Concentration.'
                  : lambda < 6
                    ? 'At This Setting, The Toy Model Places Much More Weight On The Highest Authored Utility.'
                    : 'At This Setting, The Toy Model Is Extremely Sensitive To The Highest Authored Utility.'}{' '}
              This Is A Mathematical Illustration Only. It Does Not Describe A Real Player Pool,
              Establish Action Quality, Or Recommend Poker Strategy.
            </p>
          </section>
        </div>
      </div>
      <div style={{ maxWidth: 1120, margin: '24px auto', padding: '0 16px' }}>
        <SmarterAccountUnlockGate
          variant="solver-matrix"
          context="training-qre-explorer"
          redirectPath="/hub/training/qre-explorer"
        />
      </div>
      <HubPageSummary page="training-qre-explorer" />
    </>
  );
}
