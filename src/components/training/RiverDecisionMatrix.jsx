/**
 * RiverDecisionMatrix — River Decision Framework
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Matrix showing optimal river decisions based on hand strength,
 * board texture, and villain tendencies.
 */
import React, { useState } from 'react';

const MATRIX = [
  {
    handStrength: 'Nuts / Near-Nuts',
    icon: '◆',
    color: '#10b981',
    vsCheck: { action: 'Value Bet Large', sizing: '75-150% pot', note: 'Extract maximum. Villain cant have better — bet big.' },
    vsBet: { action: 'Raise for Value', sizing: '2.5-3x', note: 'Raise to extract max from villains value range and get called by worse.' },
    examples: 'Top set+, nut flush, nut straight, full house',
  },
  {
    handStrength: 'Strong Value',
    icon: '●',
    color: '#3b82f6',
    vsCheck: { action: 'Value Bet Medium', sizing: '50-75% pot', note: 'Good hand but not the nuts. Size for calls from worse, not to bloat pot vs better.' },
    vsBet: { action: 'Call', sizing: 'Flat', note: 'Too strong to fold, not strong enough to raise. Call and show down.' },
    examples: 'Top two pair, overpair on safe board, sets on wet boards',
  },
  {
    handStrength: 'Medium (Bluff Catcher)',
    icon: '●',
    color: '#f59e0b',
    vsCheck: { action: 'Check Back', sizing: 'Showdown', note: 'Not strong enough to value bet — worse hands fold, better hands call. Show down.' },
    vsBet: { action: 'Call (maybe)', sizing: 'MDF-based', note: 'Depends on sizing and villain. Call based on MDF, lean fold vs passive players.' },
    examples: 'Top pair weak kicker, second pair, pocket pair below top card',
  },
  {
    handStrength: 'Weak Made Hand',
    icon: '●',
    color: '#f97316',
    vsCheck: { action: 'Check Back', sizing: 'Show down', note: 'Marginal showdown value. Betting gets called by better only. Check and pray.' },
    vsBet: { action: 'Fold', sizing: '—', note: 'Too weak to bluff-catch. Fold and save chips for better spots.' },
    examples: 'Bottom pair, third pair, ace-high on paired/connected board',
  },
  {
    handStrength: 'Missed Draw / Air',
    icon: '●',
    color: '#ef4444',
    vsCheck: { action: 'Bluff (selective)', sizing: '67-100% pot', note: 'Zero showdown value = must bluff or give up. Choose the best bluffs with blockers.' },
    vsBet: { action: 'Fold', sizing: '—', note: 'Cannot call with nothing. Fold and move to next hand.' },
    examples: 'Missed flush draw, missed straight draw, complete air',
  },
];

function RiverDecisionMatrix() {
  const [selected, setSelected] = useState(null);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#e879f9' }}>River Decision Matrix</h3>

        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 4, marginBottom: 4 }}>
          <div style={{ padding: 6, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>Hand Strength</div>
          <div style={{ padding: 6, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>Villain Checks</div>
          <div style={{ padding: 6, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>Villain Bets</div>
        </div>

        {/* Matrix Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          {MATRIX.map((row, i) => (
            <div key={i} onClick={() => setSelected(selected === i ? null : i)} style={{
              display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 4, cursor: 'pointer',
              padding: 2, borderRadius: 6, background: selected === i ? `${row.color}10` : 'transparent',
            }}>
              <div style={{
                padding: 8, borderRadius: 6, borderLeft: `4px solid ${row.color}`,
                background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 16 }}>{row.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: row.color, lineHeight: 1.2 }}>{row.handStrength}</span>
              </div>
              <div style={{ padding: 8, borderRadius: 6, background: 'rgba(255,255,255,0.03)', textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: row.color }}>{row.vsCheck.action}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{row.vsCheck.sizing}</div>
              </div>
              <div style={{ padding: 8, borderRadius: 6, background: 'rgba(255,255,255,0.03)', textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: row.color }}>{row.vsBet.action}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{row.vsBet.sizing}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail Panel */}
        {selected !== null && (
          <div style={{ padding: 12, background: `${MATRIX[selected].color}08`, borderRadius: 8, border: `1px solid ${MATRIX[selected].color}20` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: MATRIX[selected].color, marginBottom: 8 }}>{MATRIX[selected].icon} {MATRIX[selected].handStrength}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>When Villain Checks:</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{MATRIX[selected].vsCheck.note}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>When Villain Bets:</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{MATRIX[selected].vsBet.note}</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Examples: {MATRIX[selected].examples}</div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>River Decision Matrix failed to load: {err.message}</div>;
  }
}

export default RiverDecisionMatrix;
