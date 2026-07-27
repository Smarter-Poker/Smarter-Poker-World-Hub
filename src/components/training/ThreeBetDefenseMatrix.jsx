/**
 * ThreeBetDefenseMatrix — 3-Bet Defense Strategy
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Interactive matrix showing optimal defense strategies vs 3-bets
 * from different positions. Includes 4-bet, call, and fold ranges.
 */
import React, { useState } from 'react';

const MATCHUPS = [
  {
    opener: 'UTG', threeBetter: 'BTN', color: '#ef4444',
    defense: { fourBet: 8, call: 12, fold: 80 },
    fourBetRange: 'AA, KK, QQ, AKs, AKo (value) + A5s, A4s (bluffs)',
    callRange: 'JJ, TT, AQs, AQo, AJs, KQs',
    foldRange: 'Everything else — UTG range is narrow, 3-bet is strong',
    note: 'UTG vs BTN 3-bet: very tight defense. BTNs 3-bet range is wide but UTG must respect it.',
  },
  {
    opener: 'CO', threeBetter: 'BTN', color: '#f59e0b',
    defense: { fourBet: 10, call: 22, fold: 68 },
    fourBetRange: 'AA, KK, QQ, AKs, AKo (value) + A5s, A4s, KTs (bluffs)',
    callRange: 'JJ, TT, 99, AQs, AQo, AJs, KQs, KJs, QJs, JTs, T9s',
    foldRange: 'Weak suited connectors, small pairs, offsuit hands',
    note: 'CO vs BTN 3-bet: medium defense. Call range is wider since CO opens wider.',
  },
  {
    opener: 'BTN', threeBetter: 'BB', color: '#10b981',
    defense: { fourBet: 12, call: 35, fold: 53 },
    fourBetRange: 'AA-QQ, AKs, AKo (value) + A5s-A2s, K9s, Q9s (bluffs)',
    callRange: 'JJ-77, AQs-ATs, AQo-AJo, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, 76s',
    foldRange: 'Weak offsuit, low gappers, trash',
    note: 'BTN vs BB 3-bet: wide defense. You have position postflop so can call much wider.',
  },
  {
    opener: 'SB', threeBetter: 'BB', color: '#3b82f6',
    defense: { fourBet: 11, call: 18, fold: 71 },
    fourBetRange: 'AA-QQ, AKs, AKo (value) + A5s, A4s, K5s (bluffs)',
    callRange: 'JJ-88, AQs, AJs, KQs, KJs, QJs, T9s, 98s',
    foldRange: 'Most of range — OOP without position advantage',
    note: 'SB vs BB 3-bet: tricky spot. Out of position postflop makes calling more costly.',
  },
];

function ThreeBetDefenseMatrix() {
  const [selected, setSelected] = useState(2);
  const matchup = MATCHUPS[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f472b6' }}>3-Bet Defense Matrix</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {MATCHUPS.map((m, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: selected === i ? m.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 10, fontWeight: 700,
            }}>
              <div>{m.opener} vs</div>
              <div>{m.threeBetter} 3-bet</div>
            </button>
          ))}
        </div>

        {/* Defense frequency bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Defense Breakdown</div>
          <div style={{ display: 'flex', height: 36, borderRadius: 8, overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ width: `${matchup.defense.fourBet}%`, background: '#e879f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{matchup.defense.fourBet}%</span>
            </div>
            <div style={{ width: `${matchup.defense.call}%`, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{matchup.defense.call}%</span>
            </div>
            <div style={{ width: `${matchup.defense.fold}%`, background: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{matchup.defense.fold}%</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
            <span style={{ color: '#e879f9' }}>4-Bet</span>
            <span style={{ color: '#3b82f6' }}>Call</span>
            <span style={{ color: '#6b7280' }}>Fold</span>
          </div>
        </div>

        {/* Range details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { label: '4-Bet Range', range: matchup.fourBetRange, color: '#e879f9', pct: matchup.defense.fourBet },
            { label: 'Call Range', range: matchup.callRange, color: '#3b82f6', pct: matchup.defense.call },
            { label: 'Fold Range', range: matchup.foldRange, color: '#6b7280', pct: matchup.defense.fold },
          ].map(r => (
            <div key={r.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `4px solid ${r.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{r.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{r.pct}%</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{r.range}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: 10, background: 'rgba(244,114,182,0.06)', borderRadius: 8, border: '1px solid rgba(244,114,182,0.12)' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{matchup.note}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>3-Bet Defense Matrix failed to load: {err.message}</div>;
  }
}

export default ThreeBetDefenseMatrix;
