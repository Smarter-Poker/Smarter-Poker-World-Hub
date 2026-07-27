/**
 * EarlyPositionGuide — Early Position (UTG/UTG+1) Strategy
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Comprehensive guide for playing from early position in 6-max and 9-max.
 */
import React, { useState } from 'react';

const EP_RANGES = {
  '6max': {
    label: '6-Max UTG',
    open: '~18% of hands',
    color: '#3b82f6',
    hands: [
      { tier: 'Always Open', hands: 'AA, KK, QQ, JJ, TT, AKs, AKo, AQs, AQo, AJs', color: '#10b981' },
      { tier: 'Standard Open', hands: '99, 88, ATs, AJo, KQs, KJs, QJs, JTs', color: '#3b82f6' },
      { tier: 'Conditional Open', hands: '77, 66, A9s, A5s-A4s, KTs, QTs, T9s, 98s', color: '#f59e0b' },
      { tier: 'Never Open', hands: 'Offsuit broadways (KTo, QJo, etc), small suited connectors, random offsuit', color: '#ef4444' },
    ],
  },
  '9max': {
    label: '9-Max UTG',
    open: '~12% of hands',
    color: '#8b5cf6',
    hands: [
      { tier: 'Always Open', hands: 'AA, KK, QQ, JJ, TT, AKs, AKo, AQs', color: '#10b981' },
      { tier: 'Standard Open', hands: '99, AQo, AJs, ATs, KQs', color: '#3b82f6' },
      { tier: 'Conditional Open', hands: '88, 77, AJo, KJs, QJs, JTs', color: '#f59e0b' },
      { tier: 'Never Open', hands: 'Most offsuit hands, suited gappers, small pairs at tough tables', color: '#ef4444' },
    ],
  },
};

const MISTAKES = [
  { mistake: 'Opening too wide', fix: 'EP ranges should be TIGHT. You have 5+ players behind you in 9-max. Every hand you add has reverse implied odds.', severity: 'Critical' },
  { mistake: 'Limping', fix: 'Never limp from EP. Open-raise or fold. Limping invites multiway pots where your positional disadvantage is magnified.', severity: 'Critical' },
  { mistake: 'Not 4-betting enough', fix: 'When you 3-bet from EP, your range is strong. But don\'t just flat 3-bets with KK/QQ — 4-bet for value.', severity: 'Major' },
  { mistake: 'C-betting too wide OOP', fix: 'In EP, you\'re OOP postflop. C-bet selectively on favorable boards. Check strong hands sometimes for protection.', severity: 'Major' },
  { mistake: 'Playing passively postflop', fix: 'EP range is premium-heavy. When you connect, bet for value. Don\'t slow-play in multiway pots.', severity: 'Minor' },
];

function EarlyPositionGuide() {
  const [format, setFormat] = useState('6max');
  const [showMistakes, setShowMistakes] = useState(false);
  const range = EP_RANGES[format];
  const sevColors = { 'Critical': '#ef4444', 'Major': '#f59e0b', 'Minor': '#3b82f6' };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#3b82f6' }}>Early Position Guide</h3>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {Object.entries(EP_RANGES || {}).map(([key, val]) => (
            <button key={key} onClick={() => setFormat(key)} style={{
              flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: format === key ? val.color : 'rgba(255,255,255,0.06)',
              color: format === key ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 13, fontWeight: 700,
            }}>{val.label}</button>
          ))}
        </div>

        <div style={{ padding: 12, background: `${range.color}11`, borderRadius: 10, border: `1px solid ${range.color}33`, marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: range.color }}>{range.label} Opening Range</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>{range.open}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {range.hands.map((h, i) => (
            <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `3px solid ${h.color}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: h.color, marginBottom: 2 }}>{h.tier}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, letterSpacing: 0.3 }}>{h.hands}</div>
            </div>
          ))}
        </div>

        <button onClick={() => setShowMistakes(!showMistakes)} style={{
          width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
          background: 'rgba(239,68,68,0.06)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          color: '#ef4444', marginBottom: showMistakes ? 8 : 0,
        }}>
          {showMistakes ? 'Hide' : 'Show'} Common EP Mistakes
        </button>

        {showMistakes && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {MISTAKES.map((m, i) => (
              <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                    background: `${sevColors[m.severity]}22`, color: sevColors[m.severity],
                  }}>{m.severity}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{m.mistake}</span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{m.fix}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Early Position Guide failed: {err.message}</div>;
  }
}

export default EarlyPositionGuide;
