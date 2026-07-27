/**
 * SeatSelectionGuide — Table Seat Selection Strategy
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Guide for choosing optimal seats based on player types and dynamics.
 */
import React, { useState } from 'react';

const SEATS = [
  {
    pos: 'Direct Left of Whale',
    icon: '◆',
    rating: 5,
    color: '#10b981',
    reason: 'You act AFTER the weak player. Isolate them in position with raises.',
    tips: ['Widen your ISO range vs their limps', 'Value bet thinner — they call too wide', 'Avoid bluffing — they don\'t fold'],
  },
  {
    pos: 'Direct Left of Aggro',
    icon: '⌁',
    rating: 4,
    color: '#3b82f6',
    reason: 'Position on the aggressive player lets you trap with strong hands.',
    tips: ['Flat more premiums preflop', 'Let them barrel into your monsters', 'Check-raise more on favorable boards'],
  },
  {
    pos: 'Direct Right of Nit',
    icon: '■',
    rating: 4,
    color: '#8b5cf6',
    reason: 'The nit folds too much — steal their blinds and attack their tight range.',
    tips: ['Raise wide when they\'re in the blinds', 'Their 3-bets are always strong — fold trash', 'Steal relentlessly on the button'],
  },
  {
    pos: 'Direct Right of Whale',
    icon: '▲',
    rating: 2,
    color: '#f59e0b',
    reason: 'Whale acts before you preflop BUT after you postflop from blinds. Awkward.',
    tips: ['You\'ll be OOP postflop frequently', 'Harder to isolate — others act after you', 'Not ideal but workable with tight ranges'],
  },
  {
    pos: 'Across from Aggro',
    icon: '·',
    rating: 3,
    color: '#6b7280',
    reason: 'No positional advantage either way. Standard play required.',
    tips: ['Focus on other positional edges', 'Play fundamentally sound poker', 'Watch for table dynamic shifts'],
  },
];

const PRINCIPLES = [
  { title: 'Position is Profit', desc: 'Having position on weak players is the #1 seat selection factor. You see their action first and can adjust.' },
  { title: 'Avoid OOP vs Good LAGs', desc: 'Being out of position against skilled aggressive players is a nightmare. Change seats if possible.' },
  { title: 'Stack Depth Matters', desc: 'Sit with deep stacks to your right (they act before you) and short stacks to your left.' },
  { title: 'Table Change', desc: 'If the table is all regs with no edge, request a table change. Don\'t ego-battle good players.' },
];

function SeatSelectionGuide() {
  const [selected, setSelected] = useState(0);
  const [showPrinciples, setShowPrinciples] = useState(false);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#10b981' }}>Seat Selection Guide</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          {SEATS.map((s, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              padding: 10, borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
              background: selected === i ? `${s.color}18` : 'rgba(255,255,255,0.03)',
              borderLeft: selected === i ? `3px solid ${s.color}` : '3px solid transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.pos}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                    {'★'.repeat(s.rating)}{'☆'.repeat(5 - s.rating)}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: 14, background: `${SEATS[selected].color}11`, borderRadius: 10, border: `1px solid ${SEATS[selected].color}33`, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: SEATS[selected].color, marginBottom: 6 }}>{SEATS[selected].pos}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 10 }}>{SEATS[selected].reason}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SEATS[selected].tips.map((tip, j) => (
              <div key={j} style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', paddingLeft: 10, borderLeft: `2px solid ${SEATS[selected].color}44` }}>
                {tip}
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => setShowPrinciples(!showPrinciples)} style={{
          width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)',
          background: 'rgba(16,185,129,0.06)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          color: '#10b981', marginBottom: showPrinciples ? 8 : 0,
        }}>
          {showPrinciples ? 'Hide' : 'Show'} Core Principles
        </button>

        {showPrinciples && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {PRINCIPLES.map((p, i) => (
              <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: 2 }}>{p.title}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{p.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Seat Selection Guide failed: {err.message}</div>;
  }
}

export default SeatSelectionGuide;
