/**
 * RiverSizingGuide — River Bet Sizing Decision Framework
 * ═══════════════════════════════════════════════════════════════════════════
 * Systematic approach to choosing the right river bet size.
 */
import React, { useState } from 'react';

const SIZES = [
  {
    name: '25-33% Pot',
    label: 'Small',
    color: '#10b981',
    icon: '',
    when: 'Thin value on dry boards',
    logic: 'Use when your hand is good but not great. Small bets get called by the widest range of worse hands. Ideal for top pair on dry boards, or when villain\'s range is mostly weak.',
    examples: ['AJ on A♠ 7♦ 3♣ 2♠ K♥ — bet small for value from Ax', 'KQ on K♣ 8♦ 4♣ 2♥ 5♠ — thin value vs middle pairs'],
    avoid: 'Don\'t use when you have the nuts — you\'re leaving money on the table.',
  },
  {
    name: '50-66% Pot',
    label: 'Medium',
    color: '#3b82f6',
    icon: '',
    when: 'Standard value & bluffs',
    logic: 'The default river bet size. Works for both value and bluffs. Gives decent fold equity for bluffs while extracting reasonable value from strong seconds.',
    examples: ['Sets on semi-wet boards', 'Standard bluffs with decent blockers', 'Two pair trying to get called by top pair'],
    avoid: 'Don\'t default to this mindlessly — consider if small or large is better.',
  },
  {
    name: '75-100% Pot',
    label: 'Large',
    color: '#f59e0b',
    icon: '',
    when: 'Polarized — nuts or air',
    logic: 'Large bets are polarized: you either have the nuts or nothing. Use for maximum value from strong hands, or as bluffs when you need fold equity against medium-strength hands.',
    examples: ['Nut flush on completed board', 'Full house after draw-heavy runout', 'Pure bluffs with strong blockers'],
    avoid: 'Don\'t use with medium-strength hands — you only get called by better.',
  },
  {
    name: '125-200% Pot',
    label: 'Overbet',
    color: '#ef4444',
    icon: '',
    when: 'Nut advantage + capped villain',
    logic: 'Overbets exploit situations where you can have the nuts and villain cannot. They maximize value and apply maximum pressure. Villain must defend very wide or get exploited.',
    examples: ['Nut flush on rivered flush board when villain capped', 'Quads/full house when villain has visible top pair+', 'Bold bluffs representing the nuts on scary rivers'],
    avoid: 'Never overbet without nut advantage. If villain can have the nuts too, size down.',
  },
  {
    name: 'Check',
    label: 'Check',
    color: '#8b5cf6',
    icon: '',
    when: 'Showdown value or give up',
    logic: 'Check when you have showdown value (medium pairs, weak top pair) or when you\'ve given up with air. Checking induces bluffs from missed draws and keeps the pot small with marginal hands.',
    examples: ['Middle pair on board that hits villain\'s range', 'Missed draws with no blockers', 'Weak top pair when villain\'s range is stronger'],
    avoid: 'Don\'t check the nuts in position! That\'s leaving money on the table.',
  },
];

function RiverSizingGuide() {
  const [selected, setSelected] = useState(0);
  const s = SIZES[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#e879f9' }}>River Sizing Guide</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {SIZES.map((sz, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: selected === i ? sz.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 10, fontWeight: 700, textAlign: 'center',
            }}>
              <div style={{ fontSize: 14 }}>{sz.icon}</div>
              <div>{sz.label}</div>
            </button>
          ))}
        </div>

        <div style={{ padding: 14, background: `${s.color}11`, borderRadius: 10, border: `1px solid ${s.color}33`, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: s.color, marginBottom: 2 }}>{s.name}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Best for: {s.when}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{s.logic}</div>
        </div>

        <div style={{ padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.12)', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>Good Examples</div>
          {s.examples.map((ex, i) => (
            <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 2, lineHeight: 1.5 }}>• {ex}</div>
          ))}
        </div>

        <div style={{ padding: 10, background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 2 }}>Avoid</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{s.avoid}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>River Sizing Guide failed: {err.message}</div>;
  }
}

export default RiverSizingGuide;
