/**
 * HAND STRENGTH DISTRIBUTION
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Visualize hand strength distributions across ranges:
 * - Equity buckets showing range composition
 * - Nut advantage analysis
 * - Vulnerability assessment
 * - Category breakdown (nuts, strong, medium, weak, air)
 * - Board-specific distribution shifts
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState } from 'react';

// ●●● SCENARIO PRESETS ●●●
const SCENARIOS = [
  {
    id: 'btn_vs_bb_Kh8d3c',
    name: 'BTN vs BB',
    board: 'K♥ 8♦ 3♣',
    street: 'Flop',
    hero: 'BTN',
    villain: 'BB',
    heroDistribution: [
      { bucket: '90-100%', pct: 8, hands: 'Sets, Two Pair', color: '#16a34a' },
      { bucket: '75-90%', pct: 15, hands: 'Top Pair Good Kicker', color: '#22c55e' },
      { bucket: '60-75%', pct: 12, hands: 'Top Pair Weak, Middle Pair', color: '#84cc16' },
      { bucket: '45-60%', pct: 14, hands: 'Gutshots, Overcards', color: '#f59e0b' },
      { bucket: '30-45%', pct: 18, hands: 'Backdoor Draws', color: '#f97316' },
      { bucket: '15-30%', pct: 15, hands: 'Low Pairs', color: '#ef4444' },
      { bucket: '0-15%', pct: 18, hands: 'Complete Air', color: '#991b1b' },
    ],
    villainDistribution: [
      { bucket: '90-100%', pct: 5, hands: 'Sets, Two Pair', color: '#16a34a' },
      { bucket: '75-90%', pct: 10, hands: 'Top Pair', color: '#22c55e' },
      { bucket: '60-75%', pct: 15, hands: 'Middle Pair, Pair+Draw', color: '#84cc16' },
      { bucket: '45-60%', pct: 18, hands: 'Weak Pairs, Draws', color: '#f59e0b' },
      { bucket: '30-45%', pct: 20, hands: 'Gutshots, Backdoors', color: '#f97316' },
      { bucket: '15-30%', pct: 16, hands: 'Weak Draws', color: '#ef4444' },
      { bucket: '0-15%', pct: 16, hands: 'Air', color: '#991b1b' },
    ],
    nutAdvantage: 'hero',
    heroNuts: 8, villainNuts: 5,
    vulnerability: 'Low — dry board, few draws to worry about',
    insight: 'BTN has significant nut advantage with more sets and strong top pairs. Can c-bet at high frequency with small sizing.',
  },
  {
    id: 'co_vs_bb_Ts9s7d',
    name: 'CO vs BB',
    board: 'T♠ 9♠ 7♦',
    street: 'Flop',
    hero: 'CO',
    villain: 'BB',
    heroDistribution: [
      { bucket: '90-100%', pct: 5, hands: 'Sets, Straights', color: '#16a34a' },
      { bucket: '75-90%', pct: 10, hands: 'Overpairs, Top Pair', color: '#22c55e' },
      { bucket: '60-75%', pct: 14, hands: 'Middle Pair+Draw', color: '#84cc16' },
      { bucket: '45-60%', pct: 20, hands: 'Flush Draws, OESDs', color: '#f59e0b' },
      { bucket: '30-45%', pct: 22, hands: 'Gutshots, Overcards', color: '#f97316' },
      { bucket: '15-30%', pct: 15, hands: 'Backdoor Draws', color: '#ef4444' },
      { bucket: '0-15%', pct: 14, hands: 'No Equity', color: '#991b1b' },
    ],
    villainDistribution: [
      { bucket: '90-100%', pct: 7, hands: 'Sets, Two Pair, Straights', color: '#16a34a' },
      { bucket: '75-90%', pct: 12, hands: 'Top Pair, Overpairs', color: '#22c55e' },
      { bucket: '60-75%', pct: 16, hands: 'Middle Pair+FD', color: '#84cc16' },
      { bucket: '45-60%', pct: 22, hands: 'Draws, Combo Draws', color: '#f59e0b' },
      { bucket: '30-45%', pct: 20, hands: 'Gutshots, Pair+Backdoor', color: '#f97316' },
      { bucket: '15-30%', pct: 13, hands: 'Weak Hands', color: '#ef4444' },
      { bucket: '0-15%', pct: 10, hands: 'Air', color: '#991b1b' },
    ],
    nutAdvantage: 'villain',
    heroNuts: 5, villainNuts: 7,
    vulnerability: 'High — many draws, board will change significantly on turn',
    insight: 'BB has more two-pair and straight combos on this connected board. CO should check more and use larger sizing when betting.',
  },
  {
    id: 'btn_vs_bb_Ah7c2d',
    name: 'BTN vs BB (Ace High)',
    board: 'A♥ 7♣ 2♦',
    street: 'Flop',
    hero: 'BTN',
    villain: 'BB',
    heroDistribution: [
      { bucket: '90-100%', pct: 10, hands: 'Sets, Two Pair', color: '#16a34a' },
      { bucket: '75-90%', pct: 18, hands: 'Top Pair Good Kicker', color: '#22c55e' },
      { bucket: '60-75%', pct: 12, hands: 'Top Pair Weak Kicker', color: '#84cc16' },
      { bucket: '45-60%', pct: 10, hands: 'Middle Pair, Pocket Pairs', color: '#f59e0b' },
      { bucket: '30-45%', pct: 12, hands: 'Low Pairs', color: '#f97316' },
      { bucket: '15-30%', pct: 18, hands: 'Overcards', color: '#ef4444' },
      { bucket: '0-15%', pct: 20, hands: 'Air', color: '#991b1b' },
    ],
    villainDistribution: [
      { bucket: '90-100%', pct: 4, hands: 'Sets, Two Pair', color: '#16a34a' },
      { bucket: '75-90%', pct: 12, hands: 'Top Pair', color: '#22c55e' },
      { bucket: '60-75%', pct: 10, hands: 'Ace Weak Kicker', color: '#84cc16' },
      { bucket: '45-60%', pct: 14, hands: 'Middle Pair+', color: '#f59e0b' },
      { bucket: '30-45%', pct: 18, hands: 'Low Pairs, Gutshots', color: '#f97316' },
      { bucket: '15-30%', pct: 20, hands: 'Weak Holdings', color: '#ef4444' },
      { bucket: '0-15%', pct: 22, hands: 'Complete Air', color: '#991b1b' },
    ],
    nutAdvantage: 'hero',
    heroNuts: 10, villainNuts: 4,
    vulnerability: 'Very Low — extremely dry, almost no draws',
    insight: 'Massive BTN advantage. Ace blocks BB\'s strongest hands. C-bet very frequently with 33% sizing.',
  },
  {
    id: 'sb_vs_btn_Qh8h3s_turn',
    name: 'SB vs BTN (Turn)',
    board: 'Q♥ 8♥ 3♠ J♦',
    street: 'Turn',
    hero: 'SB',
    villain: 'BTN',
    heroDistribution: [
      { bucket: '90-100%', pct: 6, hands: 'Sets, Straights, Flushes', color: '#16a34a' },
      { bucket: '75-90%', pct: 12, hands: 'Two Pair, Top Pair+FD', color: '#22c55e' },
      { bucket: '60-75%', pct: 14, hands: 'Top Pair Good Kicker', color: '#84cc16' },
      { bucket: '45-60%', pct: 16, hands: 'Flush Draws, OESDs', color: '#f59e0b' },
      { bucket: '30-45%', pct: 20, hands: 'Weak Top Pair, Gutshots', color: '#f97316' },
      { bucket: '15-30%', pct: 16, hands: 'Bottom Pair', color: '#ef4444' },
      { bucket: '0-15%', pct: 16, hands: 'Missed Draws, Air', color: '#991b1b' },
    ],
    villainDistribution: [
      { bucket: '90-100%', pct: 8, hands: 'Sets, Straights, Two Pair', color: '#16a34a' },
      { bucket: '75-90%', pct: 14, hands: 'Overpairs, Strong TP', color: '#22c55e' },
      { bucket: '60-75%', pct: 16, hands: 'Top Pair, Strong Draws', color: '#84cc16' },
      { bucket: '45-60%', pct: 18, hands: 'Combo Draws, Medium Hands', color: '#f59e0b' },
      { bucket: '30-45%', pct: 18, hands: 'Weak Draws, Floats', color: '#f97316' },
      { bucket: '15-30%', pct: 14, hands: 'Backdoors Gone', color: '#ef4444' },
      { bucket: '0-15%', pct: 12, hands: 'Air', color: '#991b1b' },
    ],
    nutAdvantage: 'villain',
    heroNuts: 6, villainNuts: 8,
    vulnerability: 'Medium — flush draw still live, but fewer outs remaining',
    insight: 'BTN retains range advantage on turn. SB should check-raise polarized and check-call medium strength.',
  },
  {
    id: 'river_nuts',
    name: 'BTN vs BB (River)',
    board: 'K♠ T♥ 6♣ 2♦ 9♠',
    street: 'River',
    hero: 'BTN',
    villain: 'BB',
    heroDistribution: [
      { bucket: '90-100%', pct: 12, hands: 'Straights, Sets+', color: '#16a34a' },
      { bucket: '75-90%', pct: 14, hands: 'Two Pair, Overpairs', color: '#22c55e' },
      { bucket: '60-75%', pct: 16, hands: 'Top Pair Strong', color: '#84cc16' },
      { bucket: '45-60%', pct: 14, hands: 'Top Pair Weak', color: '#f59e0b' },
      { bucket: '30-45%', pct: 12, hands: 'Middle Pair', color: '#f97316' },
      { bucket: '15-30%', pct: 14, hands: 'Low Pair, Missed Draws', color: '#ef4444' },
      { bucket: '0-15%', pct: 18, hands: 'Busted Draws, Air', color: '#991b1b' },
    ],
    villainDistribution: [
      { bucket: '90-100%', pct: 6, hands: 'Straights, Sets', color: '#16a34a' },
      { bucket: '75-90%', pct: 10, hands: 'Two Pair', color: '#22c55e' },
      { bucket: '60-75%', pct: 14, hands: 'Top Pair', color: '#84cc16' },
      { bucket: '45-60%', pct: 18, hands: 'Second Pair, Third Pair', color: '#f59e0b' },
      { bucket: '30-45%', pct: 20, hands: 'Weak Showdown', color: '#f97316' },
      { bucket: '15-30%', pct: 16, hands: 'Missed Draws', color: '#ef4444' },
      { bucket: '0-15%', pct: 16, hands: 'Air', color: '#991b1b' },
    ],
    nutAdvantage: 'hero',
    heroNuts: 12, villainNuts: 6,
    vulnerability: 'None — river, all draws resolved',
    insight: 'BTN has 2x the nut combos on river. Should bet polarized — value with nuts, bluff with busted draws.',
  },
];

// ●●● DISTRIBUTION BAR ●●●
function DistributionBars({ distribution, label, side }) {
  const maxPct = Math.max(...distribution.map(d => d.pct));
  return (
    <div>
      <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      {distribution.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ color: '#94a3b8', fontSize: 8, width: 48, textAlign: 'right', flexShrink: 0 }}>{d.bucket}</span>
          <div style={{ flex: 1, height: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              width: `${(d.pct / maxPct) * 100}%`, height: '100%', background: d.color,
              borderRadius: 3, transition: 'width 0.3s', opacity: 0.7,
              display: 'flex', alignItems: 'center', paddingLeft: 4,
            }}>
              {d.pct > 8 && <span style={{ color: '#fff', fontSize: 7, fontWeight: 700 }}>{d.pct}%</span>}
            </div>
          </div>
          <span style={{ color: '#64748b', fontSize: 7, width: 80, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.hands}</span>
        </div>
      ))}
    </div>
  );
}

// ●●● NUT ADVANTAGE DISPLAY ●●●
function NutAdvantageBar({ heroNuts, villainNuts, heroLabel, villainLabel }) {
  const total = heroNuts + villainNuts;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#22c55e', fontSize: 10, fontWeight: 700 }}>{heroLabel}: {heroNuts}%</span>
        <span style={{ color: '#ef4444', fontSize: 10, fontWeight: 700 }}>{villainLabel}: {villainNuts}%</span>
      </div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${(heroNuts / total) * 100}%`, background: '#22c55e', opacity: 0.7, transition: 'width 0.3s' }} />
        <div style={{ width: `${(villainNuts / total) * 100}%`, background: '#ef4444', opacity: 0.7, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function HandStrengthDistribution() {
  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS[0]);
  const [viewMode, setViewMode] = useState('sidebyside'); // sidebyside | overlay

  const heroStrong = selectedScenario.heroDistribution.slice(0, 3).reduce((a, d) => a + d.pct, 0);
  const heroWeak = selectedScenario.heroDistribution.slice(4).reduce((a, d) => a + d.pct, 0);
  const villainStrong = selectedScenario.villainDistribution.slice(0, 3).reduce((a, d) => a + d.pct, 0);
  const villainWeak = selectedScenario.villainDistribution.slice(4).reduce((a, d) => a + d.pct, 0);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Hand Strength Distribution</h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Equity bucket analysis for range matchups</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['sidebyside', 'overlay'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: viewMode === m ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                color: viewMode === m ? '#3b82f6' : '#64748b', fontSize: 10, fontWeight: 600,
              }}>{m === 'sidebyside' ? 'Side by Side' : 'Overlay'}</button>
            ))}
          </div>
        </div>

        {/* Scenario selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
          {SCENARIOS.map(s => (
            <button key={s.id} onClick={() => setSelectedScenario(s)} style={{
              padding: '6px 10px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
              background: selectedScenario.id === s.id ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.15)',
              border: selectedScenario.id === s.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              color: selectedScenario.id === s.id ? '#f1f5f9' : '#94a3b8', fontSize: 10, fontWeight: 600,
            }}>
              <div>{s.name}</div>
              <div style={{ color: '#64748b', fontSize: 8, marginTop: 1 }}>{s.board}</div>
            </button>
          ))}
        </div>

        {/* Board display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
          <div style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>{selectedScenario.board}</div>
          <span style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: 9, fontWeight: 600 }}>{selectedScenario.street}</span>
          <span style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 9, fontWeight: 600 }}>{selectedScenario.hero} vs {selectedScenario.villain}</span>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
          {[
            { label: `${selectedScenario.hero} Strong`, value: `${heroStrong}%`, color: '#22c55e' },
            { label: `${selectedScenario.villain} Strong`, value: `${villainStrong}%`, color: '#ef4444' },
            { label: `${selectedScenario.hero} Weak`, value: `${heroWeak}%`, color: '#f97316' },
            { label: `${selectedScenario.villain} Weak`, value: `${villainWeak}%`, color: '#64748b' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 16, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Distributions */}
        {viewMode === 'sidebyside' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10 }}>
              <DistributionBars distribution={selectedScenario.heroDistribution} label={`${selectedScenario.hero} (Hero)`} side="hero" />
            </div>
            <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10 }}>
              <DistributionBars distribution={selectedScenario.villainDistribution} label={`${selectedScenario.villain} (Villain)`} side="villain" />
            </div>
          </div>
        ) : (
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Overlay Comparison</div>
            {selectedScenario.heroDistribution.map((d, i) => {
              const vd = selectedScenario.villainDistribution[i];
              return (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ color: '#94a3b8', fontSize: 8, marginBottom: 2 }}>{d.bucket}</div>
                  <div style={{ position: 'relative', height: 14 }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: `${d.pct * 2.5}%`, height: 6, background: '#22c55e', opacity: 0.6, borderRadius: 3 }} />
                    <div style={{ position: 'absolute', top: 8, left: 0, width: `${vd.pct * 2.5}%`, height: 6, background: '#ef4444', opacity: 0.6, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <span style={{ color: '#22c55e', fontSize: 7 }}>{selectedScenario.hero}: {d.pct}%</span>
                    <span style={{ color: '#ef4444', fontSize: 7 }}>{selectedScenario.villain}: {vd.pct}%</span>
                    <span style={{ color: d.pct > vd.pct ? '#22c55e' : '#ef4444', fontSize: 7, fontWeight: 700 }}>
                      Δ {d.pct > vd.pct ? '+' : ''}{d.pct - vd.pct}%
                    </span>
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 10, marginTop: 8, justifyContent: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 8, height: 4, borderRadius: 2, background: '#22c55e' }} />
                <span style={{ color: '#94a3b8', fontSize: 8 }}>{selectedScenario.hero}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 8, height: 4, borderRadius: 2, background: '#ef4444' }} />
                <span style={{ color: '#94a3b8', fontSize: 8 }}>{selectedScenario.villain}</span>
              </span>
            </div>
          </div>
        )}

        {/* Nut Advantage */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Nut Advantage</div>
          <NutAdvantageBar heroNuts={selectedScenario.heroNuts} villainNuts={selectedScenario.villainNuts} heroLabel={selectedScenario.hero} villainLabel={selectedScenario.villain} />
          <div style={{ marginTop: 6, display: 'flex', gap: 10 }}>
            <span style={{ padding: '3px 8px', borderRadius: 4, background: selectedScenario.nutAdvantage === 'hero' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: selectedScenario.nutAdvantage === 'hero' ? '#22c55e' : '#ef4444', fontSize: 10, fontWeight: 700 }}>
              {selectedScenario.nutAdvantage === 'hero' ? selectedScenario.hero : selectedScenario.villain} has nut advantage
            </span>
            <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: 10, fontWeight: 600 }}>
              Vulnerability: {selectedScenario.vulnerability}
            </span>
          </div>
        </div>

        {/* Strategic insight */}
        <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 12, border: '1px solid rgba(59,130,246,0.15)' }}>
          <div style={{ color: '#3b82f6', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Strategic Insight</div>
          <div style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1.6 }}>{selectedScenario.insight}</div>
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Hand Strength Distribution</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
