/**
 * HeadsUpTrainer — GTO Wizard-Style Heads-Up Specific Training
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Specialized heads-up training covering SB vs BB dynamics, wide range
 * construction, aggression strategies, and HU-specific GTO adjustments.
 */
import React, { useState, useMemo } from 'react';

const HU_SCENARIOS = [
  {
    id: 1, name: 'SB Open Range 100bb',
    position: 'SB (BTN)', action: 'Open Raise',
    rangeSize: 82, raise: 72, limp: 10, fold: 18,
    description: 'At 100bb deep heads-up, SB should open ~82% of hands. Mix of raises and limps.',
    keyAdjustments: [
      'Raise all broadway combos and pairs',
      'Limp medium suited connectors and weak suited aces',
      'Fold worst offsuit hands (72o, 83o, 93o, etc.)',
      'Min-raise as default sizing (2-2.5x)',
    ],
    raiseSample: 'AA-22, AKs-A2s, KQs-K5s, QJs-Q8s, JTs-J8s, T9s-T7s, 98s-96s, 87s-85s, 76s-74s, 65s-63s, 54s, AKo-A2o, KQo-K9o, QJo-Q9o, JTo-J9o, T9o',
    limpSample: 'K4s-K2s, Q7s-Q5s, J7s, T6s, 95s, 84s, 73s, 62s, 53s-52s, 43s-42s, 32s',
  },
  {
    id: 2, name: 'BB Defense vs Min-Raise',
    position: 'BB', action: 'Defend',
    rangeSize: 70, raise: 15, call: 55, fold: 30,
    description: 'BB should defend ~70% vs a min-raise heads-up. Mix of 3-bets and calls.',
    keyAdjustments: [
      '3-bet ~15% for value and as bluffs',
      'Call wide with suited hands and pairs',
      'Fold worst offsuit combos only',
      'Adjust wider vs passive opponents',
    ],
    raiseSample: 'AA-TT, AKs-AJs, KQs, AKo-AQo, A5s-A4s, 76s, 87s',
    callSample: '99-22, ATs-A2s, KJs-K2s, QJs-Q5s, JTs-J6s, T9s-T6s, 98s-95s, 87s-84s, 76s-73s, 65s-62s, 54s-52s, 43s, AJo-A2o, KJo-K7o, QJo-Q8o, JTo-J8o, T9o-T8o, 98o-97o, 87o',
  },
  {
    id: 3, name: 'SB Limp Strategy',
    position: 'SB (BTN)', action: 'Limp',
    rangeSize: 10, limp: 10, limpraise: 3,
    description: 'Limping range is small but important. Contains hands too weak to raise but with playability.',
    keyAdjustments: [
      'Limp hands that play well postflop but are too weak to raise',
      'Include some traps (AA, KK) at very low frequency (~5%)',
      'Limp-raise with premium hands mixed in',
      'Size limp-raise to ~4x BB raise',
    ],
    limpSample: 'K4s-K2s, Q6s-Q4s, J7s-J6s, T6s-T5s, 95s-94s, 84s-83s, 73s-72s, 63s-62s, 53s-52s, 43s-42s, 32s',
  },
  {
    id: 4, name: 'Postflop IP (SB) 100bb',
    position: 'SB (IP)', action: 'Postflop',
    cbetFreq: 55, checkFreq: 45,
    description: 'As IP player postflop in HU, c-bet ~55% across all flop textures. Check more on connected boards.',
    keyAdjustments: [
      'C-bet high on A-high and K-high dry boards (70-85%)',
      'Check more on 7-8-9 connected boards (30-40% c-bet)',
      'Use 33% sizing as default on most textures',
      'Overbet river with polarized range on blank runouts',
    ],
  },
  {
    id: 5, name: 'BB Donk Bet Strategy',
    position: 'BB (OOP)', action: 'Donk Bet',
    donkFreq: 8,
    description: 'Donk betting from BB is rare but has specific high-EV spots in HU play.',
    keyAdjustments: [
      'Donk on boards that favor BB range (low connected, suited)',
      'Use small sizing (25-33%) when donking',
      'Donk with nutted hands + draws as bluffs',
      'Avoid donking on A/K-high boards (IP has advantage)',
      'Increase donk frequency on monotone boards to ~15%',
    ],
  },
];

function StatRow({ label, value, color, maxPct }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', width: 80 }}>{label}</span>
      <div style={{ flex: 1, height: 14, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min((value / (maxPct || 100)) * 100, 100)}%`, background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 40, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

function HeadsUpTrainer() {
  const [selectedId, setSelectedId] = useState(1);
  const [showRanges, setShowRanges] = useState(false);

  const scenario = useMemo(() => HU_SCENARIOS.find(s => s.id === selectedId), [selectedId]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#eab308' }}>Heads-Up Trainer</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showRanges} onChange={e => setShowRanges(e.target.checked)} style={{ accentColor: '#eab308' }} />
            Show Ranges
          </label>
        </div>

        {/* Scenario Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {HU_SCENARIOS.map(s => (
            <button key={s.id} onClick={() => setSelectedId(s.id)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: selectedId === s.id ? '#eab308' : 'rgba(255,255,255,0.06)',
              color: selectedId === s.id ? '#000' : 'rgba(255,255,255,0.7)', border: 'none',
            }}>{s.name}</button>
          ))}
        </div>

        {/* Scenario Header */}
        <div style={{ padding: 14, background: 'rgba(234,179,8,0.06)', borderRadius: 10, border: '1px solid rgba(234,179,8,0.15)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#eab308' }}>{scenario.name}</span>
            <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 4, background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>{scenario.position}</span>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{scenario.description}</div>
        </div>

        {/* Frequency Bars */}
        <div style={{ marginBottom: 16 }}>
          {scenario.rangeSize && <StatRow label="Range Size" value={scenario.rangeSize} color="#eab308" />}
          {scenario.raise !== undefined && <StatRow label="Raise" value={scenario.raise} color="#10b981" />}
          {scenario.call !== undefined && <StatRow label="Call" value={scenario.call} color="#3b82f6" />}
          {scenario.limp !== undefined && <StatRow label="Limp" value={scenario.limp} color="#f59e0b" />}
          {scenario.fold !== undefined && <StatRow label="Fold" value={scenario.fold} color="#ef4444" />}
          {scenario.cbetFreq !== undefined && <StatRow label="C-Bet" value={scenario.cbetFreq} color="#8b5cf6" />}
          {scenario.checkFreq !== undefined && <StatRow label="Check" value={scenario.checkFreq} color="#6b7280" />}
          {scenario.donkFreq !== undefined && <StatRow label="Donk Bet" value={scenario.donkFreq} color="#ec4899" />}
          {scenario.limpraise !== undefined && <StatRow label="Limp-Raise" value={scenario.limpraise} color="#dc2626" />}
        </div>

        {/* Key Adjustments */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#eab308', marginBottom: 8 }}>Key Adjustments</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {scenario.keyAdjustments.map((adj, i) => (
              <div key={i} style={{
                padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                borderLeft: '3px solid rgba(234,179,8,0.4)',
                fontSize: 12, color: 'rgba(255,255,255,0.8)',
              }}>{adj}</div>
            ))}
          </div>
        </div>

        {/* Range Samples */}
        {showRanges && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scenario.raiseSample && (
              <div style={{ padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.12)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>Raise Range</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{scenario.raiseSample}</div>
              </div>
            )}
            {scenario.callSample && (
              <div style={{ padding: 10, background: 'rgba(59,130,246,0.06)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.12)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', marginBottom: 4 }}>Call Range</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{scenario.callSample}</div>
              </div>
            )}
            {scenario.limpSample && (
              <div style={{ padding: 10, background: 'rgba(245,158,11,0.06)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.12)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>Limp Range</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{scenario.limpSample}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Heads-Up Trainer failed to load: {err.message}</div>;
  }
}

export default HeadsUpTrainer;
