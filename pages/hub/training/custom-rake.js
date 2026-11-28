/**
 * RAKE COST ESTIMATOR — Transparent Teaching Model
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Input a rake structure to explore one disclosed cost model. This page does
 * not run a solver and does not prescribe GTO frequencies or EV.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-8 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-3 — hex sweep batch 6: extended palette literals routed
import React, { useState, useMemo } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';


import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import at from '../../../src/styles/training/analysis-tools.module.css';
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// RAKE PRESETS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RAKE_PRESETS = [
  {
    id: 'micro',
    label: 'Micro Stakes Online',
    pct: 5.0,
    cap: 1.0,
    bigBlind: 0.10,
    bbCap: 5.0,
    desc: '$0.01/$0.02 - $0.05/$0.10',
  },
  {
    id: 'low',
    label: 'Low Stakes Online',
    pct: 5.0,
    cap: 3.0,
    bigBlind: 0.50,
    bbCap: 3.0,
    desc: '$0.10/$0.25 - $0.25/$0.50',
  },
  { id: 'mid', label: 'Mid Stakes Online', pct: 4.5, cap: 3.5, bigBlind: 2, bbCap: 1.75, desc: '$1/$2 Representative Model' },
  { id: 'high', label: 'High Stakes Online', pct: 3.0, cap: 5.0, bigBlind: 10, bbCap: 1.0, desc: '$5/$10 Representative Model' },
  {
    id: 'live_low',
    label: 'Live $1/$2-$1/$3',
    pct: 10.0,
    cap: 5.0,
    bigBlind: 2,
    bbCap: 2.5,
    desc: 'Typical live low stakes',
  },
  {
    id: 'live_mid',
    label: 'Live $2/$5',
    pct: 5.0,
    cap: 8.0,
    bigBlind: 5,
    bbCap: 1.6,
    desc: 'Standard live mid stakes',
  },
  {
    id: 'live_high',
    label: 'Live $5/$10+',
    pct: 3.5,
    cap: 10.0,
    bigBlind: 10,
    bbCap: 1.0,
    desc: 'Live high stakes',
  },
  {
    id: 'custom',
    label: 'Custom Rake',
    pct: 5.0,
    cap: 3.0,
    bigBlind: 1,
    bbCap: 0,
    desc: 'Enter your own rake structure',
  },
];

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// RAKE IMPACT CALCULATOR
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function calculateRakeImpact(rakePct, capDollars, stackBB, bigBlindDollars) {
  const safeRake = Math.max(0, Number(rakePct) || 0);
  const safeCapDollars = Math.max(0, Number(capDollars) || 0);
  const safeStack = Math.max(1, Number(stackBB) || 100);
  const safeBigBlind = Math.max(0.01, Number(bigBlindDollars) || 1);
  const avgPotBB = safeStack * 0.12;
  const capBB = safeCapDollars / safeBigBlind;
  const rakePerPot = Math.min(capBB, avgPotBB * (safeRake / 100));
  const rakePerHandBB = rakePerPot;
  const handsPerHour = 28;
  const rakePerHourBB = rakePerHandBB * handsPerHour * 0.35;

  const impactBand = safeRake > 6 ? 'Higher' : safeRake > 4 ? 'Moderate' : 'Lower';

  return {
    rakePerPot: Number.isFinite(rakePerPot) ? (Number.isFinite(Number(rakePerPot)) ? Number(rakePerPot) : 0).toFixed(2) : '0.00',
    rakePerHourBB: Number.isFinite(rakePerHourBB) ? (Number.isFinite(Number(rakePerHourBB)) ? Number(rakePerHourBB) : 0).toFixed(1) : '0.0',
    monthlyImpactBB: Number.isFinite(rakePerHourBB) ? (Number.isFinite(Number(rakePerHourBB * 40)) ? Number(rakePerHourBB * 40) : 0).toFixed(0) : '0',
    adjustments: [
      {
        stat: 'Open Raise Range',
        adj: `${impactBand} Rake Sensitivity`,
        color: '#86daff',
        note: 'Marginal opens may lose value as rake rises; verify a concrete spot before changing a range.',
      },
      {
        stat: '3-Bet Frequency',
        adj: 'Spot Dependent',
        color: 'var(--sp-accent-blue)',
        note: 'Rake alone does not determine a 3-bet frequency; positions, stacks, sizing, and ranges remain required.',
      },
      {
        stat: 'Cold Call Range',
        adj: `${impactBand} Rake Sensitivity`,
        color: 'var(--sp-accent-red)',
        note: 'Calls that realize thin edges can be sensitive to rake; this model does not choose between call, raise, or fold.',
      },
      {
        stat: 'C-Bet Frequency',
        adj: 'Board And Range Dependent',
        color: 'var(--sp-accent-blue)',
        note: 'No postflop betting frequency can be inferred from a rake percentage without a full decision tree.',
      },
      {
        stat: 'Suited Connectors',
        adj: `${impactBand} Rake Sensitivity`,
        color: 'var(--sp-accent-red)',
        note: 'Speculative hands may be rake-sensitive, but a concrete position and action are required for a range decision.',
      },
    ],
  };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function CustomRakePage() {
  const router = useRouter();
  const [preset, setPreset] = useState(RAKE_PRESETS[0]);
  const [customPct, setCustomPct] = useState(5.0);
  const [customCap, setCustomCap] = useState(3.0);
  const [customBigBlind, setCustomBigBlind] = useState(1.0);
  const [stackDepth, setStackDepth] = useState(100);

  useTrainingBus('custom-rake');

  const rakePct = preset.id === 'custom' ? customPct : preset.pct;
  const rakeCap = preset.id === 'custom' ? customCap : preset.cap;
  const bigBlind = preset.id === 'custom' ? customBigBlind : preset.bigBlind;

  const impact = useMemo(() => {
    return calculateRakeImpact(rakePct, rakeCap, stackDepth, bigBlind);
  }, [rakePct, rakeCap, stackDepth, bigBlind]);


  return (
    <>
      <SEOHead
        title="Poker Rake Cost Estimator Calculator"
        description="Calculate How Pot Percentage Rake, Dollar Caps, And No-Flop-No-Drop Rules Impact Your Hourly Poker Win Rate And BB/100 Bottom Line On Smarter.Poker."
        canonical="/hub/training/custom-rake"
      />

      <div className={at.shell}>
        <TrainingPageHead slug="training-custom-rake" note="Transparent Teaching Model • Not A Solver • Not Strategy Advice" />

        <div className={at.page}>
          {/* Rake Preset Grid */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="cr-structure-title">
            <h2 id="cr-structure-title" className={at.sectionTitle}>Rake Structure</h2>
            <div className={at.cardsGrid}>
              {RAKE_PRESETS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`sd-button ${at.choiceCard}`}
                  aria-pressed={preset.id === r.id}
                  onClick={() => setPreset(r)}
                >
                  <span className={at.choiceTitle}>{r.label}</span>
                  <span className={at.choiceMeta}>{r.pct}% / Cap ${r.cap}</span>
                  <span className={at.choiceMeta}>{r.desc}</span>
                </button>
              ))}
            </div>

            {/* Custom Inputs */}
            {preset.id === 'custom' && (
              <div className={`${at.metrics} ${at.metrics3}`}>
                <label className={at.field}>
                  <span className={at.label}>Rake %</span>
                  <input
                    aria-label="Custom Rake Percentage"
                    type="number"
                    step="0.5"
                    inputMode="decimal"
                    className={at.input}
                    value={customPct}
                    onChange={(e) => setCustomPct(parseFloat(e.target.value) || 0)}
                  />
                </label>
                <label className={at.field}>
                  <span className={at.label}>Cap ($)</span>
                  <input
                    aria-label="Custom Rake Cap"
                    type="number"
                    step="0.5"
                    inputMode="decimal"
                    className={at.input}
                    value={customCap}
                    onChange={(e) => setCustomCap(parseFloat(e.target.value) || 0)}
                  />
                </label>
                <label className={at.field}>
                  <span className={at.label}>Big Blind ($)</span>
                  <input
                    aria-label="Big Blind In Dollars"
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    className={at.input}
                    value={customBigBlind}
                    onChange={(e) => setCustomBigBlind(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                  />
                </label>
              </div>
            )}

            {/* Stack Depth Slider */}
            <label className={at.field}>
              <span className={at.barHead}>
                <span>Stack Depth</span>
                <strong className={at.ice}>{stackDepth}BB</strong>
              </span>
              <input
                aria-label="Stack Depth In Big Blinds"
                type="range"
                className={at.range}
                min="20"
                max="200"
                value={stackDepth}
                onChange={(e) => setStackDepth(parseInt(e.target.value, 10))}
              />
            </label>
          </section>

          {/* Impact Stats */}
          <div className={`${at.metrics} ${at.metrics3}`}>
            {[
              { label: 'Estimated Rake Per Pot', value: `${impact.rakePerPot}BB`, tone: 'ice' },
              { label: 'Estimated Rake / Hour', value: `${impact.rakePerHourBB}BB`, tone: 'down' },
              { label: '40-Hour Model', value: `${impact.monthlyImpactBB}BB`, tone: 'down' },
            ].map((s) => (
              <div key={s.label} className={`sd-metric ${at.metric}`}>
                <span className={at.metricLabel}>{s.label}</span>
                <strong className={at.metricValue} data-tone={s.tone}>{s.value}</strong>
              </div>
            ))}
          </div>

          {/* Strategy Adjustments */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="cr-prompts-title">
            <h2 id="cr-prompts-title" className={at.sectionTitle}>Rake Sensitivity Study Prompts</h2>
            <div className={at.list}>
              {impact.adjustments.map((a, i) => (
                <div key={i} className={at.listRow} style={{ display: 'grid', gap: 4 }}>
                  <div className={at.barHead} style={{ margin: 0 }}>
                    <span>{a.stat}</span>
                    <strong className={at.ice}>{a.adj}</strong>
                  </div>
                  <span className={at.small}>{a.note}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Key Insight */}
          <section className={`sd-panel ${at.panel} ${at.tight}`} aria-labelledby="cr-insight-title">
            <h2 id="cr-insight-title" className={at.eyebrow}>Key Insight</h2>
            <p className={at.copy}>
              This Teaching Estimate Uses A {rakePct}% Rake, ${rakeCap} Cap, ${bigBlind} Big Blind,
              A Pot Equal To 12% Of The Selected Stack, 28 Hands Per Hour, And A 35% Raked-Pot Share.
              It Estimates {impact.rakePerHourBB}BB/Hour Under Those Assumptions. It Does Not Solve A
              Poker Tree, Produce EV, Or Prescribe Any Range Or Action.
            </p>
          </section>
        </div>
      </div>
      <HubPageSummary page="training-custom-rake" />
    </>
  );
}
