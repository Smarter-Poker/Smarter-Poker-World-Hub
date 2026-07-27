/**
 * BLUFF CATCHER ANALYZER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Analyze bluff-catching decisions on the river:
 * - Minimum defense frequency (MDF) calculations
 * - Villain's value-to-bluff ratio analysis
 * - Hand ranking within your range
 * - Call/fold threshold identification
 * - EV calculations for calling vs folding
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● BLUFF CATCHING SCENARIOS ●●●
const SCENARIOS = [
  {
    id: 'river_half_pot',
    name: 'River ½ Pot Bet',
    board: 'K♠ T♥ 6♣ 2♦ 9♠',
    pot: 120,
    bet: 60,
    heroHand: 'Q♠ T♣',
    heroHandName: 'Second Pair (Tens)',
    villainRange: {
      value: ['Sets (3)', 'Two Pair (6)', 'Straights (4)', 'Top Pair AK/KQ (8)'],
      bluffs: ['Missed FD (6)', 'Busted OESD (4)', 'A-high (3)'],
      valueCombos: 21,
      bluffCombos: 13,
    },
    mdf: 66.7,
    potOdds: 25.0,
    heroRanking: 62,
    evCall: 8.4,
    evFold: 0,
    recommendation: 'CALL',
    reasoning: 'Villain needs 34+ bluff combos to make folding correct. With only 21 value combos and 13 bluffs, they\'re bluffing 38% — above the 33% threshold. Second pair is a mandatory call.',
  },
  {
    id: 'river_pot_bet',
    name: 'River Pot-Size Bet',
    board: 'A♥ J♦ 8♣ 3♠ 5♥',
    pot: 200,
    bet: 200,
    heroHand: 'K♠ J♠',
    heroHandName: 'Second Pair (Jacks)',
    villainRange: {
      value: ['Sets (6)', 'Two Pair (8)', 'AK/AQ/AJ (12)'],
      bluffs: ['Missed FD (4)', 'KQ/QT (4)', 'Busted draws (2)'],
      valueCombos: 26,
      bluffCombos: 10,
    },
    mdf: 50.0,
    potOdds: 33.3,
    heroRanking: 45,
    evCall: -18.2,
    evFold: 0,
    recommendation: 'FOLD',
    reasoning: 'Against pot-sized bet, villain only needs 50% value. With 26 value vs 10 bluffs (72% value), they\'re far too value-heavy. KJ is not high enough in our range to call.',
  },
  {
    id: 'river_overbet',
    name: 'River 1.5x Overbet',
    board: 'Q♦ 9♣ 4♠ 7♦ 2♣',
    pot: 150,
    bet: 225,
    heroHand: 'A♦ Q♣',
    heroHandName: 'Top Pair Top Kicker',
    villainRange: {
      value: ['Sets (6)', 'Two Pair (4)', 'Straights (6)'],
      bluffs: ['Busted FD (8)', 'Missed straight (4)', 'Air (3)'],
      valueCombos: 16,
      bluffCombos: 15,
    },
    mdf: 40.0,
    potOdds: 37.5,
    heroRanking: 78,
    evCall: 22.5,
    evFold: 0,
    recommendation: 'CALL',
    reasoning: 'Overbet means villain needs fewer bluffs to be balanced. With 16 value and 15 bluffs (48% bluffs), they\'re over-bluffing significantly. TPTK is a clear call.',
  },
  {
    id: 'river_small_bet',
    name: 'River ⅓ Pot Bet',
    board: 'T♠ 8♥ 3♣ K♦ 6♠',
    pot: 180,
    bet: 60,
    heroHand: '9♠ 8♠',
    heroHandName: 'Second Pair (Eights)',
    villainRange: {
      value: ['KT/K8 (6)', 'Sets (4)', 'Two Pair (4)', 'Overpairs (4)'],
      bluffs: ['Missed draws (6)', 'A-high (8)', 'Low pairs (4)'],
      valueCombos: 18,
      bluffCombos: 18,
    },
    mdf: 75.0,
    potOdds: 20.0,
    heroRanking: 55,
    evCall: 15.6,
    evFold: 0,
    recommendation: 'CALL',
    reasoning: 'Small bet means you need to defend 75% of range. With equal value/bluff combos, villain is bluffing 50% — well above the 25% threshold. Easy call with any pair.',
  },
  {
    id: 'tough_spot',
    name: 'Tough Marginal Spot',
    board: 'J♥ 7♦ 4♣ 2♠ T♥',
    pot: 160,
    bet: 110,
    heroHand: 'A♣ 7♣',
    heroHandName: 'Second Pair (Sevens)',
    villainRange: {
      value: ['JT (6)', 'Sets (4)', 'Two Pair (3)', 'Overpairs (6)'],
      bluffs: ['Missed FD (5)', 'AK/AQ (4)', 'Busted draws (3)'],
      valueCombos: 19,
      bluffCombos: 12,
    },
    mdf: 59.3,
    potOdds: 28.9,
    heroRanking: 40,
    evCall: -3.1,
    evFold: 0,
    recommendation: 'CLOSE FOLD',
    reasoning: 'Villain has 19 value vs 12 bluffs (61% value). At this sizing, they need ~41% bluffs to justify a call. With only 39% bluffs, it\'s a marginal fold — but barely.',
  },
];

function getRecColor(rec) {
  if (rec === 'CALL') return '#22c55e';
  if (rec === 'FOLD') return '#ef4444';
  return '#f59e0b';
}

// ●●● RANGE PIE ●●●
function RangePie({ valueCombos, bluffCombos }) {
  const total = valueCombos + bluffCombos;
  const vPct = (valueCombos / total) * 100;
  const bPct = (bluffCombos / total) * 100;
  const vAngle = (vPct / 100) * 360;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
        <circle cx="30" cy="30" r="28" fill="none" stroke="#ef4444" strokeWidth="4"
          strokeDasharray={`${(vPct / 100) * 175.9} 175.9`}
          transform="rotate(-90 30 30)" strokeLinecap="round" />
        <circle cx="30" cy="30" r="28" fill="none" stroke="#22c55e" strokeWidth="4"
          strokeDasharray={`${(bPct / 100) * 175.9} 175.9`}
          strokeDashoffset={`-${(vPct / 100) * 175.9}`}
          transform="rotate(-90 30 30)" strokeLinecap="round" />
        <text x="30" y="30" textAnchor="middle" dominantBaseline="middle" fill="#f1f5f9" fontSize="10" fontWeight="800">{total}</text>
      </svg>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ color: '#ef4444', fontSize: 10, fontWeight: 700 }}>Value: {valueCombos} ({vPct.toFixed(0)}%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ color: '#22c55e', fontSize: 10, fontWeight: 700 }}>Bluffs: {bluffCombos} ({bPct.toFixed(0)}%)</span>
        </div>
      </div>
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function BluffCatcherAnalyzer() {
  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS[0]);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Bluff Catcher Analyzer</h3>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Should you call or fold with bluff catchers?</div>
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
              <div style={{ color: '#64748b', fontSize: 8, marginTop: 1 }}>{s.heroHandName}</div>
            </button>
          ))}
        </div>

        {/* Board + Hero Hand */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, flex: 1 }}>
            <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Board</div>
            <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>{selectedScenario.board}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10 }}>
            <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Hero Hand</div>
            <div style={{ color: '#f59e0b', fontSize: 16, fontWeight: 800 }}>{selectedScenario.heroHand}</div>
            <div style={{ color: '#94a3b8', fontSize: 9 }}>{selectedScenario.heroHandName}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10 }}>
            <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Pot / Bet</div>
            <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 800 }}>{selectedScenario.pot} / {selectedScenario.bet}</div>
            <div style={{ color: '#94a3b8', fontSize: 9 }}>{((selectedScenario.bet / selectedScenario.pot) * 100).toFixed(0)}% of pot</div>
          </div>
        </div>

        {/* Key metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
          {[
            { label: 'MDF', value: `${selectedScenario.mdf.toFixed(1)}%`, color: '#3b82f6', desc: 'Min Defense Freq' },
            { label: 'Pot Odds', value: `${selectedScenario.potOdds.toFixed(1)}%`, color: '#f59e0b', desc: 'Equity needed' },
            { label: 'Hand Rank', value: `Top ${selectedScenario.heroRanking}%`, color: '#a78bfa', desc: 'In our range' },
            { label: 'EV of Call', value: `${selectedScenario.evCall >= 0 ? '+' : ''}${selectedScenario.evCall.toFixed(1)}`, color: selectedScenario.evCall >= 0 ? '#22c55e' : '#ef4444', desc: 'vs fold = 0' },
          ].map((m, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>{m.label}</div>
              <div style={{ color: m.color, fontSize: 18, fontWeight: 800 }}>{m.value}</div>
              <div style={{ color: '#475569', fontSize: 7 }}>{m.desc}</div>
            </div>
          ))}
        </div>

        {/* Villain range breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10 }}>
            <div style={{ color: '#ef4444', fontSize: 9, fontWeight: 700, marginBottom: 6 }}>VALUE HANDS ({selectedScenario.villainRange.valueCombos})</div>
            {selectedScenario.villainRange.value.map((v, i) => (
              <div key={i} style={{ color: '#94a3b8', fontSize: 10, marginBottom: 2 }}>• {v}</div>
            ))}
          </div>
          <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10 }}>
            <div style={{ color: '#22c55e', fontSize: 9, fontWeight: 700, marginBottom: 6 }}>BLUFFS ({selectedScenario.villainRange.bluffCombos})</div>
            {selectedScenario.villainRange.bluffs.map((b, i) => (
              <div key={i} style={{ color: '#94a3b8', fontSize: 10, marginBottom: 2 }}>• {b}</div>
            ))}
          </div>
        </div>

        {/* Range pie */}
        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <RangePie valueCombos={selectedScenario.villainRange.valueCombos} bluffCombos={selectedScenario.villainRange.bluffCombos} />
        </div>

        {/* Recommendation */}
        <div style={{
          background: `${getRecColor(selectedScenario.recommendation)}08`,
          borderRadius: 8, padding: 12,
          border: `1px solid ${getRecColor(selectedScenario.recommendation)}25`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 800,
              background: `${getRecColor(selectedScenario.recommendation)}15`,
              color: getRecColor(selectedScenario.recommendation),
            }}>{selectedScenario.recommendation}</span>
          </div>
          <div style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1.6 }}>{selectedScenario.reasoning}</div>
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Bluff Catcher Analyzer</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
