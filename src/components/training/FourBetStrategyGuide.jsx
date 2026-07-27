/**
 * FourBetStrategyGuide — 4-Bet Pot Strategy
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Guide for 4-bet pots: when to 4-bet, sizing, and postflop play.
 */
import React, { useState } from 'react';

const SCENARIOS = [
  {
    title: 'BTN 4-Bet vs BB 3-Bet', color: '#ef4444',
    sizing: '2.2-2.5x the 3-bet',
    valueRange: 'AA, KK, QQ, AKs, AKo',
    bluffRange: 'A5s, A4s, A3s, K5s',
    valuePct: 60, bluffPct: 40,
    postflop: [
      { board: 'A-high', action: 'C-bet 25% pot always. Massive range advantage in 4-bet pots.' },
      { board: 'K-high', action: 'C-bet 25-33%. KK/AK connect. Check back QQ sometimes.' },
      { board: 'Low board', action: 'Check more often. 4-bet range misses low boards. Control pot with overcards.' },
    ],
    note: 'In position 4-bets are very powerful. You realize equity well and can bluff more.',
  },
  {
    title: 'SB 4-Bet vs BTN 3-Bet', color: '#3b82f6',
    sizing: '2.5-3x the 3-bet',
    valueRange: 'AA, KK, QQ, AKs, AKo, JJ',
    bluffRange: 'A5s, A4s (very few bluffs)',
    valuePct: 75, bluffPct: 25,
    postflop: [
      { board: 'A-high', action: 'C-bet 33%. You have AK/AA. Opponent has capped range.' },
      { board: 'K-high', action: 'C-bet 33%. KK/AK work well. JJ can check.' },
      { board: 'Low board', action: 'C-bet small. Overpairs are strong at this SPR. Commit with QQ+.' },
    ],
    note: 'OOP 4-bets need to be tighter. Fewer bluffs because you cant realize equity well.',
  },
  {
    title: 'CO 4-Bet vs BTN 3-Bet', color: '#10b981',
    sizing: '2.2-2.5x the 3-bet',
    valueRange: 'AA, KK, QQ, AKs, AKo',
    bluffRange: 'A5s, A4s, A3s, A2s, K9s',
    valuePct: 55, bluffPct: 45,
    postflop: [
      { board: 'Connected', action: 'Check more. Board hits BTN calling range. Play cautiously with AK.' },
      { board: 'Paired', action: 'Range c-bet small. Nobody has trips in 4-bet pots.' },
      { board: 'A/K high', action: 'Standard c-bet 25-33%. Take it down with strong range advantage.' },
    ],
    note: 'CO vs BTN is a common 4-bet dynamic. Balance value and bluffs carefully.',
  },
];

function FourBetStrategyGuide() {
  const [selected, setSelected] = useState(0);
  const s = SCENARIOS[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f43f5e' }}>4-Bet Strategy</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {SCENARIOS.map((sc, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: selected === i ? sc.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 10, fontWeight: 700,
            }}>{sc.title}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 10, background: `${s.color}11`, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Sizing</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.sizing}</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Value</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#10b981' }}>{s.valuePct}%</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(239,68,68,0.06)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Bluffs</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#ef4444' }}>{s.bluffPct}%</div>
          </div>
        </div>

        {/* Range display */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 8, borderLeft: '3px solid #10b981' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>Value 4-Bet</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{s.valueRange}</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(239,68,68,0.06)', borderRadius: 8, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Bluff 4-Bet</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{s.bluffRange}</div>
          </div>
        </div>

        {/* Postflop play */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Postflop in 4-Bet Pots:</div>
          {s.postflop.map((p, i) => (
            <div key={i} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 4, display: 'flex', gap: 8 }}>
              <div style={{ minWidth: 65, fontSize: 10, fontWeight: 700, color: s.color }}>{p.board}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{p.action}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: 10, background: `${s.color}09`, borderRadius: 8, border: `1px solid ${s.color}22` }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{s.note}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>4-Bet Strategy failed to load: {err.message}</div>;
  }
}

export default FourBetStrategyGuide;
