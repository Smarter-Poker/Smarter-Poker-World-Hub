/**
 * ODDS ORACLE WIDGET
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Quick-reference odds and probability tool:
 * - Preflop all-in equity matchups
 * - Common hand vs hand scenarios
 * - Outs-to-equity conversion chart
 * - Rule of 2 and 4 calculator
 * - Probability of hitting draws
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState } from 'react';

// ●●● COMMON MATCHUPS ●●●
const MATCHUPS = [
  { hero: 'AA', villain: 'KK', equity: 81.9, type: 'Overpair vs Underpair' },
  { hero: 'AA', villain: 'AKs', equity: 87.2, type: 'Pair vs Dominated' },
  { hero: 'AA', villain: 'JTs', equity: 77.5, type: 'Pair vs Suited Conn' },
  { hero: 'KK', villain: 'AKo', equity: 69.2, type: 'Pair vs Overcard' },
  { hero: 'QQ', villain: 'AKs', equity: 54.1, type: 'Coinflip+' },
  { hero: 'JJ', villain: 'AKo', equity: 56.8, type: 'Classic Coinflip' },
  { hero: 'AKs', villain: 'QJs', equity: 62.4, type: 'Domination' },
  { hero: 'AKo', villain: '76s', equity: 59.1, type: 'Big vs Small' },
  { hero: 'AKs', villain: '22', equity: 48.2, type: 'Overs vs Small Pair' },
  { hero: 'AQo', villain: 'KJs', equity: 63.8, type: 'Domination' },
  { hero: 'TT', villain: '55', equity: 80.4, type: 'Overpair vs Under' },
  { hero: 'AJs', villain: 'KQo', equity: 60.3, type: 'Ace-High vs Broadway' },
];

// ●●● OUTS TABLE ●●●
const OUTS_TABLE = [
  { outs: 1, flop: 4.3, turn: 2.2, desc: '1 out (e.g., one specific card)' },
  { outs: 2, flop: 8.4, turn: 4.3, desc: '2 outs (e.g., pocket pair to set)' },
  { outs: 3, flop: 12.5, turn: 6.5, desc: '3 outs (e.g., one overcard)' },
  { outs: 4, flop: 16.5, turn: 8.7, desc: '4 outs (e.g., gutshot)' },
  { outs: 5, flop: 20.4, turn: 10.9, desc: '5 outs (e.g., pair + gutshot)' },
  { outs: 6, flop: 24.1, turn: 13.0, desc: '6 outs (e.g., two overcards)' },
  { outs: 7, flop: 27.8, turn: 15.2, desc: '7 outs (e.g., set to full house)' },
  { outs: 8, flop: 31.5, turn: 17.4, desc: '8 outs (e.g., OESD)' },
  { outs: 9, flop: 35.0, turn: 19.6, desc: '9 outs (e.g., flush draw)' },
  { outs: 10, flop: 38.4, turn: 21.7, desc: '10 outs (e.g., gutshot + FD)' },
  { outs: 12, flop: 45.0, turn: 26.1, desc: '12 outs (e.g., OESD + FD)' },
  { outs: 15, flop: 54.1, turn: 32.6, desc: '15 outs (e.g., mega combo draw)' },
];

// ●●● QUICK PROBABILITIES ●●●
const QUICK_PROBS = [
  { event: 'Flopping a set with pocket pair', prob: 11.8 },
  { event: 'Flopping two pair (unpaired hand)', prob: 2.02 },
  { event: 'Flopping a flush draw (suited hand)', prob: 10.9 },
  { event: 'Making a flush by the river (with FD on flop)', prob: 35.0 },
  { event: 'Flopping at least one pair', prob: 32.4 },
  { event: 'Being dealt a pocket pair', prob: 5.9 },
  { event: 'Being dealt suited cards', prob: 23.5 },
  { event: 'Being dealt AA', prob: 0.45 },
  { event: 'Flopping a straight (connected cards)', prob: 1.3 },
  { event: 'Runner-runner flush', prob: 4.2 },
  { event: 'Hitting an overcard on the flop (with AK)', prob: 43.0 },
  { event: 'Both overcards pairing by river (with AK)', prob: 48.7 },
];

// ●●● MAIN COMPONENT ●●●
export default function OddsOracleWidget() {
  const [activeTab, setActiveTab] = useState('matchups'); // matchups | outs | probs
  const [outsInput, setOutsInput] = useState(9);

  const rule2 = outsInput * 2;
  const rule4 = outsInput * 4;
  const actualTurn = OUTS_TABLE.find(o => o.outs === outsInput)?.turn || (outsInput * 2.17);
  const actualFlop = OUTS_TABLE.find(o => o.outs === outsInput)?.flop || (outsInput * 3.92);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Odds Oracle</h3>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Quick-reference poker odds and probabilities</div>
        </div>

        {/* Tab selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {[
            { id: 'matchups', label: 'Hand Matchups' },
            { id: 'outs', label: 'Outs & Odds' },
            { id: 'probs', label: 'Probabilities' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '6px 14px', borderRadius: 6, cursor: 'pointer', flex: 1,
              background: activeTab === tab.id ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.15)',
              border: activeTab === tab.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              color: activeTab === tab.id ? '#3b82f6' : '#94a3b8', fontSize: 11, fontWeight: 700,
            }}>{tab.label}</button>
          ))}
        </div>

        {activeTab === 'matchups' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 60px 1fr 50px', gap: 4, padding: '0 8px' }}>
              <span style={{ color: '#475569', fontSize: 8, fontWeight: 700 }}>HERO</span>
              <span style={{ color: '#475569', fontSize: 8, fontWeight: 700 }}>VILLAIN</span>
              <span style={{ color: '#475569', fontSize: 8, fontWeight: 700 }}>TYPE</span>
              <span style={{ color: '#475569', fontSize: 8, fontWeight: 700, textAlign: 'right' }}>EQUITY</span>
            </div>
            {MATCHUPS.map((m, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '60px 60px 1fr 50px', gap: 4,
                padding: '6px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.08)',
              }}>
                <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 800 }}>{m.hero}</span>
                <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 800 }}>{m.villain}</span>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>{m.type}</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    color: m.equity >= 60 ? '#22c55e' : m.equity >= 50 ? '#f59e0b' : '#ef4444',
                    fontSize: 12, fontWeight: 800,
                  }}>{m.equity}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'outs' && (
          <>
            {/* Rule of 2 & 4 calculator */}
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700, marginBottom: 8 }}>RULE OF 2 & 4 CALCULATOR</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: '#64748b', fontSize: 9, fontWeight: 600 }}>Number of Outs</span>
                <span style={{ color: '#f59e0b', fontSize: 18, fontWeight: 800 }}>{outsInput}</span>
              </div>
              <input type="range" min={1} max={20} value={outsInput}
                onChange={e => setOutsInput(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#f59e0b', height: 4, cursor: 'pointer', marginBottom: 10 }} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600 }}>FLOP → RIVER (×4)</div>
                  <div style={{ color: '#3b82f6', fontSize: 20, fontWeight: 800 }}>{rule4}%</div>
                  <div style={{ color: '#64748b', fontSize: 8 }}>Actual: {typeof actualFlop === 'number' ? actualFlop.toFixed(1) : actualFlop}%</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600 }}>TURN → RIVER (×2)</div>
                  <div style={{ color: '#22c55e', fontSize: 20, fontWeight: 800 }}>{rule2}%</div>
                  <div style={{ color: '#64748b', fontSize: 8 }}>Actual: {typeof actualTurn === 'number' ? actualTurn.toFixed(1) : actualTurn}%</div>
                </div>
              </div>
            </div>

            {/* Outs reference table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '35px 55px 55px 1fr', gap: 4, padding: '0 6px' }}>
                <span style={{ color: '#475569', fontSize: 8, fontWeight: 700 }}>OUTS</span>
                <span style={{ color: '#475569', fontSize: 8, fontWeight: 700, textAlign: 'center' }}>FLOP→R</span>
                <span style={{ color: '#475569', fontSize: 8, fontWeight: 700, textAlign: 'center' }}>TURN→R</span>
                <span style={{ color: '#475569', fontSize: 8, fontWeight: 700 }}>EXAMPLE</span>
              </div>
              {OUTS_TABLE.map(o => (
                <div key={o.outs} style={{
                  display: 'grid', gridTemplateColumns: '35px 55px 55px 1fr', gap: 4,
                  padding: '4px 6px', borderRadius: 4,
                  background: outsInput === o.outs ? 'rgba(59,130,246,0.08)' : 'transparent',
                }}>
                  <span style={{ color: '#f59e0b', fontSize: 11, fontWeight: 800 }}>{o.outs}</span>
                  <span style={{ color: '#3b82f6', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>{o.flop}%</span>
                  <span style={{ color: '#22c55e', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>{o.turn}%</span>
                  <span style={{ color: '#64748b', fontSize: 9 }}>{o.desc}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'probs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {QUICK_PROBS.map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                borderRadius: 4, background: 'rgba(0,0,0,0.08)',
              }}>
                <span style={{ color: '#94a3b8', fontSize: 10, flex: 1 }}>{p.event}</span>
                <div style={{ width: 60, height: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{
                    width: `${Math.min(100, p.prob)}%`, height: '100%', borderRadius: 4,
                    background: p.prob > 30 ? '#22c55e' : p.prob > 10 ? '#f59e0b' : '#ef4444',
                    opacity: 0.6,
                  }} />
                </div>
                <span style={{
                  color: p.prob > 30 ? '#22c55e' : p.prob > 10 ? '#f59e0b' : '#ef4444',
                  fontSize: 11, fontWeight: 800, width: 40, textAlign: 'right', flexShrink: 0,
                }}>{p.prob}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Odds Oracle</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
