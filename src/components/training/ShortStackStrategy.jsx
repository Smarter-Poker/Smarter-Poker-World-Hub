/**
 * ShortStackStrategy — Short Stack Push/Fold & Strategy Guide
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Push/fold charts and strategy for short-stacked tournament play.
 * Interactive charts showing shove ranges by stack size and position.
 */
import React, { useState } from 'react';

const PUSH_FOLD_CHARTS = [
  {
    bb: '10bb', label: '10 Big Blinds',
    positions: [
      { pos: 'UTG', range: 'AA-77, AKs-ATs, KQs, AKo-AJo', pct: 12, color: '#ef4444' },
      { pos: 'MP', range: 'AA-66, AKs-A8s, KQs-KTs, AKo-ATo', pct: 16, color: '#f59e0b' },
      { pos: 'CO', range: 'AA-44, AKs-A5s, KQs-K9s, QJs, AKo-A9o, KQo', pct: 22, color: '#eab308' },
      { pos: 'BTN', range: 'AA-22, A2s+, K5s+, Q8s+, J8s+, T8s+, 97s+, 87s, ATo+, KTo+, QTo+, JTo', pct: 38, color: '#22c55e' },
      { pos: 'SB', range: 'AA-22, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 86s+, 76s, A2o+, K7o+, Q9o+, J9o+', pct: 52, color: '#3b82f6' },
    ],
    notes: 'At 10bb, still some fold equity. Can wait for decent hands from early position but must open up from late position.',
  },
  {
    bb: '8bb', label: '8 Big Blinds',
    positions: [
      { pos: 'UTG', range: 'AA-55, AKs-A8s, KQs, AKo-ATo', pct: 16, color: '#ef4444' },
      { pos: 'MP', range: 'AA-44, AKs-A5s, KQs-K9s, QJs, AKo-A9o, KQo', pct: 22, color: '#f59e0b' },
      { pos: 'CO', range: 'AA-22, A2s+, K7s+, Q9s+, J9s+, T9s, ATo+, KTo+, QJo', pct: 30, color: '#eab308' },
      { pos: 'BTN', range: 'AA-22, A2s+, K2s+, Q6s+, J7s+, T7s+, 97s+, 86s+, A2o+, K8o+, Q9o+, JTo', pct: 45, color: '#22c55e' },
      { pos: 'SB', range: 'Nearly any two cards — 60-70%', pct: 65, color: '#3b82f6' },
    ],
    notes: 'At 8bb, fold equity is diminishing. Need to shove wider or you will blind out. SB should shove very wide vs BB.',
  },
  {
    bb: '5bb', label: '5 Big Blinds',
    positions: [
      { pos: 'UTG', range: 'AA-22, A2s+, K5s+, Q8s+, J9s+, T9s, ATo+, KTo+, QJo', pct: 28, color: '#ef4444' },
      { pos: 'MP', range: 'AA-22, A2s+, K3s+, Q6s+, J8s+, T8s+, 98s, A2o+, K9o+, QTo+', pct: 35, color: '#f59e0b' },
      { pos: 'CO', range: 'AA-22, A2s+, K2s+, Q3s+, J6s+, T7s+, 96s+, 86s+, A2o+, K5o+, Q8o+, J9o+', pct: 48, color: '#eab308' },
      { pos: 'BTN', range: 'Almost any two cards (65%+)', pct: 65, color: '#22c55e' },
      { pos: 'SB', range: 'Any two cards', pct: 80, color: '#3b82f6' },
    ],
    notes: 'At 5bb, zero fold equity. Shove or fold only. Any ace, any pair, any two broadway cards — just get it in.',
  },
  {
    bb: '15bb', label: '15 Big Blinds',
    positions: [
      { pos: 'UTG', range: 'AA-88, AKs-ATs, KQs, AKo-AQo', pct: 10, color: '#ef4444' },
      { pos: 'MP', range: 'AA-77, AKs-A9s, KQs-KJs, AKo-AJo, KQo', pct: 13, color: '#f59e0b' },
      { pos: 'CO', range: 'AA-55, AKs-A7s, KQs-KTs, QJs-QTs, AKo-ATo, KQo-KJo', pct: 18, color: '#eab308' },
      { pos: 'BTN', range: 'AA-33, A2s+, K6s+, Q8s+, J8s+, T8s+, 98s, 87s, ATo+, KTo+, QTo+', pct: 30, color: '#22c55e' },
      { pos: 'SB', range: 'AA-22, A2s+, K4s+, Q7s+, J8s+, T8s+, 97s+, 87s, A5o+, K9o+, QTo+', pct: 40, color: '#3b82f6' },
    ],
    notes: 'At 15bb, you have some play. Can min-raise/fold with marginal hands. Shove with strong hands to maximize fold equity.',
  },
];

const CALL_RANGES = [
  { vsPos: 'vs UTG shove', range: 'QQ+, AKs, AKo', width: 4 },
  { vsPos: 'vs MP shove', range: 'JJ+, AKs, AKo, AQs', width: 5 },
  { vsPos: 'vs CO shove', range: 'TT+, AQs+, AKo', width: 7 },
  { vsPos: 'vs BTN shove', range: '88+, ATs+, AJo+, KQs', width: 10 },
  { vsPos: 'vs SB shove', range: '77+, A8s+, ATo+, KTs+, KJo+, QJs', width: 14 },
];

function ShortStackStrategy() {
  const [selectedBB, setSelectedBB] = useState(0);
  const [showCalls, setShowCalls] = useState(false);

  const chart = PUSH_FOLD_CHARTS[selectedBB];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#fb7185' }}>Short Stack Strategy</h3>
          <button onClick={() => setShowCalls(!showCalls)} style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: showCalls ? '#fb7185' : 'rgba(255,255,255,0.08)',
            color: showCalls ? '#000' : 'rgba(255,255,255,0.6)',
          }}>{showCalls ? 'Shove Ranges' : 'Call Ranges'}</button>
        </div>

        {!showCalls ? (
          <>
            {/* BB Selector */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {PUSH_FOLD_CHARTS.map((c, i) => (
                <button key={c.bb} onClick={() => setSelectedBB(i)} style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: selectedBB === i ? '#fb7185' : 'rgba(255,255,255,0.06)',
                  color: selectedBB === i ? '#000' : 'rgba(255,255,255,0.6)', border: 'none', flex: 1,
                }}>{c.bb}</button>
              ))}
            </div>

            {/* Header */}
            <div style={{ textAlign: 'center', padding: 10, background: 'rgba(251,113,133,0.06)', borderRadius: 8, marginBottom: 16, border: '1px solid rgba(251,113,133,0.15)' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fb7185' }}>{chart.label} — Push/Fold</div>
            </div>

            {/* Position Ranges */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {chart.positions.map((p, i) => (
                <div key={p.pos} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `4px solid ${p.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: p.color }}>{p.pos}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: p.color }}>{p.pct}% of hands</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{p.range}</div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 6 }}>
                    <div style={{ width: `${p.pct}%`, height: '100%', background: p.color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Notes */}
            <div style={{ padding: 10, background: 'rgba(251,113,133,0.06)', borderRadius: 8, border: '1px solid rgba(251,113,133,0.12)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#fb7185', marginBottom: 4 }}>Strategy Notes</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{chart.notes}</div>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: 10, background: 'rgba(251,113,133,0.06)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fb7185' }}>BB Call Ranges vs Shoves</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>How wide to call when facing an all-in</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CALL_RANGES.map((c, i) => (
                <div key={c.vsPos} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: '4px solid #3b82f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>{c.vsPos}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>~{c.width}% call</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{c.range}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Short Stack Strategy failed to load: {err.message}</div>;
  }
}

export default ShortStackStrategy;
