/**
 * BlindDefenseTrainer — GTO Wizard-Style Blind Defense Strategy Trainer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Train proper BB and SB defense frequencies vs opens from each position.
 * Shows which hands to 3-bet, call, or fold from the blinds.
 */
import React, { useState, useMemo } from 'react';

const DEFENSE_DATA = [
  {
    opener: 'UTG', openPct: 15, openSize: '2.5x',
    bb3bet: { pct: 5, hands: 'QQ+, AKs, AKo, A5s-A2s (bluffs)' },
    bbCall: { pct: 12, hands: 'JJ-22, AQs-A9s, KQs-KTs, QJs-Q9s, JTs-J9s, T9s-87s, 76s-54s' },
    bbFold: { pct: 83, hands: 'Weak offsuit, disconnected, low cards' },
    sb3bet: { pct: 4, hands: 'QQ+, AKs, AKo' },
    sbFold: { pct: 96, hands: 'Almost everything — worst position vs tightest range' },
    notes: 'UTG opens tight. Defend selectively. 3-bet only premiums + some blockers.',
  },
  {
    opener: 'MP', openPct: 18, openSize: '2.5x',
    bb3bet: { pct: 6, hands: 'QQ+, AKs, AKo, AJs, A5s-A3s' },
    bbCall: { pct: 15, hands: 'JJ-22, AQs-A7s, KQs-K9s, QJs-Q9s, suited connectors, AQo-ATo' },
    bbFold: { pct: 79, hands: 'Weak offsuit, trash hands' },
    sb3bet: { pct: 5, hands: 'QQ+, AKs, AKo, A5s' },
    sbFold: { pct: 95, hands: 'Almost everything' },
    notes: 'MP slightly wider than UTG. BB can defend a bit more. SB still very tight.',
  },
  {
    opener: 'CO', openPct: 27, openSize: '2.5x',
    bb3bet: { pct: 9, hands: 'TT+, AKs-ATs, AKo-AJo, KQs, A5s-A2s, 87s-76s (bluffs)' },
    bbCall: { pct: 22, hands: '99-22, A9s-A2s, K9s+, Q9s+, J9s+, T8s+, suited connectors, ATo, KJo+' },
    bbFold: { pct: 69, hands: 'Worst hands only' },
    sb3bet: { pct: 8, hands: 'JJ+, AKs-AQs, AKo, A5s-A3s, KQs, 76s' },
    sbFold: { pct: 92, hands: 'Most hands — still OOP' },
    notes: 'CO opens wide. BB should 3-bet aggressively with polarized range. Call wide with position discount.',
  },
  {
    opener: 'BTN', openPct: 45, openSize: '2.5x',
    bb3bet: { pct: 12, hands: '88+, ATs+, AJo+, KQs-KTs, QJs, A9s-A2s, suited connectors (wide polar)' },
    bbCall: { pct: 30, hands: '77-22, A8s-A2s, K8s+, Q8s+, J8s+, T7s+, any suited connector, KTo+, QTo+, JTo' },
    bbFold: { pct: 58, hands: 'Only worst offsuit combos' },
    sb3bet: { pct: 11, hands: '99+, ATs+, AJo+, KQs, A5s-A2s, suited connectors, KJs' },
    sbFold: { pct: 89, hands: 'Weak hands — complete OOP vs wide range' },
    notes: 'BTN opens very wide. BB must defend aggressively or get exploited. 3-bet wide with polar range.',
  },
  {
    opener: 'SB (open)', openPct: 50, openSize: '2.5x',
    bb3bet: { pct: 16, hands: '77+, A2s+, ATo+, KTs+, KJo+, QTs+, JTs, T9s, suited connectors, broadways' },
    bbCall: { pct: 25, hands: '66-22, suited gappers, weak suited, K8s-K2s, Q8s-Q2s, J7s+' },
    bbFold: { pct: 59, hands: 'Worst offsuit only — you close the action + have position discount' },
    sb3bet: { pct: 0, hands: '—' },
    sbFold: { pct: 0, hands: '—' },
    notes: 'SB opens widest. BB should 3-bet very aggressively — you have position AND close the action.',
  },
];

function BlindDefenseTrainer() {
  const [selectedOpener, setSelectedOpener] = useState(3);
  const [view, setView] = useState('bb');

  const data = DEFENSE_DATA[selectedOpener];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#f472b6' }}>Blind Defense Trainer</h3>
          <div style={{ display: 'flex', gap: 4 }}>
            {['bb', 'sb'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', background: view === v ? '#f472b6' : 'rgba(255,255,255,0.06)',
                color: view === v ? '#000' : 'rgba(255,255,255,0.6)',
              }}>{v.toUpperCase()}</button>
            ))}
          </div>
        </div>

        {/* Opener Selection */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {DEFENSE_DATA.map((d, i) => (
            <button key={d.opener} onClick={() => setSelectedOpener(i)} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: selectedOpener === i ? '#f472b6' : 'rgba(255,255,255,0.06)',
              color: selectedOpener === i ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{d.opener} ({d.openPct}%)</button>
          ))}
        </div>

        {/* Opener Info */}
        <div style={{ padding: 10, background: 'rgba(244,114,182,0.06)', borderRadius: 8, marginBottom: 16, borderLeft: '3px solid #f472b6' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            <span style={{ fontWeight: 700, color: '#f472b6' }}>{data.opener}</span> opens {data.openSize} ({data.openPct}% range) → {view === 'bb' ? 'BB' : 'SB'} defends
          </div>
        </div>

        {view === 'bb' ? (
          <>
            {/* BB Defense Breakdown */}
            <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ width: `${data.bb3bet.pct}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>3B {data.bb3bet.pct}%</div>
              <div style={{ width: `${data.bbCall.pct}%`, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>Call {data.bbCall.pct}%</div>
              <div style={{ width: `${data.bbFold.pct}%`, background: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>Fold {data.bbFold.pct}%</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'BB 3-Bet', data: data.bb3bet, color: '#ef4444' },
                { label: 'BB Call', data: data.bbCall, color: '#3b82f6' },
                { label: 'BB Fold', data: data.bbFold, color: '#6b7280' },
              ].map(item => (
                <div key={item.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `4px solid ${item.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.data.pct}%</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{item.data.hands}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* SB Defense */}
            {data.sb3bet.pct > 0 ? (
              <>
                <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ width: `${data.sb3bet.pct}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>3B {data.sb3bet.pct}%</div>
                  <div style={{ width: `${data.sbFold.pct}%`, background: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>Fold {data.sbFold.pct}%</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: '4px solid #ef4444' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>SB 3-Bet ({data.sb3bet.pct}%)</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{data.sb3bet.hands}</div>
                  </div>
                  <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: '4px solid #6b7280' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>SB Fold ({data.sbFold.pct}%)</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{data.sbFold.hands}</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                SB is the opener in this scenario — switch to BB view
              </div>
            )}
          </>
        )}

        {/* Notes */}
        <div style={{ padding: 10, background: 'rgba(244,114,182,0.06)', borderRadius: 8, border: '1px solid rgba(244,114,182,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f472b6', marginBottom: 4 }}>Key Concept</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{data.notes}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Blind Defense Trainer failed to load: {err.message}</div>;
  }
}

export default BlindDefenseTrainer;
