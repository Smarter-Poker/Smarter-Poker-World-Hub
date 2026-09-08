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
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

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
        color: 'var(--sp-accent-amber)',
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
      <Head>
        <title>Rake Cost Estimator | Smarter.Poker</title>
        <meta
          name="description"
          content="Explore a transparent teaching estimate of rake cost without solver or GTO claims"
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
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #3a3b3c' }}>
          <button
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
            Back To Training
          </button>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            Rake Cost Estimator
          </h1>
          <p style={{ fontSize: 14, color: '#b0b3b8', margin: '2px 0 0' }}>
            Transparent Teaching Model • Not A Solver • Not Strategy Advice
          </p>
        </div>

        <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
          {/* Rake Preset Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {RAKE_PRESETS.map((r) => (
              <button
                key={r.id}
                onClick={() => setPreset(r)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  background:
                    preset.id === r.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${preset.id === r.id ? 'var(--sp-accent-blue)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: preset.id === r.id ? 'var(--sp-accent-blue)' : '#e4e6eb',
                    marginBottom: 2,
                  }}
                >
                  {r.label}
                </div>
                <div style={{ fontSize: 11, color: '#b0b3b8' }}>
                  {r.pct}% / Cap ${r.cap}
                </div>
                <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>{r.desc}</div>
              </button>
            ))}
          </div>

          {/* Custom Inputs */}
          {preset.id === 'custom' && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#b0b3b8',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Rake %
                </label>
                <input
                  aria-label="Custom Rake Percentage"
                  type="number"
                  step="0.5"
                  value={customPct}
                  onChange={(e) => setCustomPct(parseFloat(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 14,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e4e6eb',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#b0b3b8',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Cap ($)
                </label>
                <input
                  aria-label="Custom Rake Cap"
                  type="number"
                  step="0.5"
                  value={customCap}
                  onChange={(e) => setCustomCap(parseFloat(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 14,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e4e6eb',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#b0b3b8', display: 'block', marginBottom: 4 }}>
                  Big Blind ($)
                </label>
                <input
                  aria-label="Big Blind In Dollars"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={customBigBlind}
                  onChange={(e) => setCustomBigBlind(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 14, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e6eb' }}
                />
              </div>
            </div>
          )}

          {/* Stack Depth Slider */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#b0b3b8' }}>Stack Depth</label>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#e4e6eb' }}>
                {stackDepth}BB
              </span>
            </div>
            <input
              aria-label="Stack Depth In Big Blinds"
              type="range"
              min="20"
              max="200"
              value={stackDepth}
              onChange={(e) => setStackDepth(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: 'var(--sp-accent-blue)' }}
            />
          </div>

          {/* Impact Stats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginBottom: 20,
            }}
          >
            {[
              { label: 'Estimated Rake Per Pot', value: `${impact.rakePerPot}BB`, color: 'var(--sp-accent-amber)' },
              { label: 'Estimated Rake / Hour', value: `${impact.rakePerHourBB}BB`, color: 'var(--sp-accent-red)' },
              { label: '40-Hour Model', value: `${impact.monthlyImpactBB}BB`, color: 'var(--sp-accent-red)' },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  padding: '14px',
                  borderRadius: 10,
                  textAlign: 'center',
                  background: `${s.color}08`,
                  border: `1px solid ${s.color}25`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: s.color,
                    letterSpacing: '0.08em',
                    marginBottom: 4,
                  }}
                >
                  {s.label.toUpperCase()}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#e4e6eb' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Strategy Adjustments */}
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
              Rake Sensitivity Study Prompts
            </h3>
            {impact.adjustments.map((a, i) => (
              <div
                key={i}
                style={{
                  padding: '10px 14px',
                  marginBottom: 8,
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.2)',
                  borderLeft: `3px solid ${a.color}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e4e6eb' }}>{a.stat}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: a.color }}>{a.adj}</span>
                </div>
                <div style={{ fontSize: 12, color: '#b0b3b8' }}>{a.note}</div>
              </div>
            ))}
          </div>

          {/* Key Insight */}
          <div
            style={{
              marginTop: 16,
              padding: '14px 18px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))',
              border: '1px solid rgba(99,102,241,0.2)',
              borderLeft: '3px solid #818cf8',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--sp-accent-blue)',
                letterSpacing: '0.08em',
                marginBottom: 4,
              }}
            >
              KEY INSIGHT
            </div>
            <div style={{ fontSize: 13, color: '#e4e6eb', lineHeight: 1.5 }}>
              This Teaching Estimate Uses A {rakePct}% Rake, ${rakeCap} Cap, ${bigBlind} Big Blind,
              A Pot Equal To 12% Of The Selected Stack, 28 Hands Per Hour, And A 35% Raked-Pot Share.
              It Estimates {impact.rakePerHourBB}BB/Hour Under Those Assumptions. It Does Not Solve A
              Poker Tree, Produce EV, Or Prescribe Any Range Or Action.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
