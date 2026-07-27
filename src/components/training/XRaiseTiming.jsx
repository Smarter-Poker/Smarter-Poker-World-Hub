/**
 * XRaiseTiming — When to Check-Raise vs Lead
 * Optimal timing for check-raises on each street
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const STREETS = [
  { name: 'Flop', icon: '◇', color: '#3b82f6', scenarios: [
    { hand: 'Set on wet board', action: 'CHECK-RAISE', sizing: '3-3.5x', reason: 'Build pot + charge draws. Wet boards mean villain c-bets wide.' },
    { hand: 'Flush draw + pair', action: 'CHECK-RAISE', sizing: '3x', reason: 'Semi-bluff with massive equity. Puts max pressure with fold equity + draw equity.' },
    { hand: 'Top pair top kicker', action: 'CHECK-CALL', sizing: 'N/A', reason: 'Too strong to fold, not strong enough to raise for value. Trap and re-evaluate.' },
    { hand: 'Gutshot only', action: 'CHECK-FOLD', sizing: 'N/A', reason: 'Only 4 outs, no fold equity implied. Save chips for better spots.' },
  ]},
  { name: 'Turn', icon: '↻', color: '#f59e0b', scenarios: [
    { hand: 'Made straight on turn', action: 'CHECK-RAISE', sizing: '2.5-3x', reason: 'Delayed check-raise on turn looks super strong. Extract max from overpairs and draws.' },
    { hand: 'Flush completed', action: 'DONK BET or X/R', sizing: '66-75%', reason: 'Either lead or check-raise. Don\'t risk a check-check with the nuts.' },
    { hand: 'Turned two pair', action: 'CHECK-RAISE', sizing: '2.5x', reason: 'Strong but vulnerable. Raise to deny redraws and build pot vs villain\'s barrel range.' },
    { hand: 'Missed draw', action: 'CHECK-FOLD', sizing: 'N/A', reason: 'Draw bricked. Unless you have good bluff equity, let it go. Save for river bluff if needed.' },
  ]},
  { name: 'River', icon: '★', color: '#ef4444', scenarios: [
    { hand: 'Full house', action: 'CHECK-RAISE', sizing: '2.5-3x', reason: 'Let them bluff or value bet. Then raise for max value. River check-raise = massive pot.' },
    { hand: 'Missed draw (bluff)', action: 'CHECK-RAISE', sizing: 'Overbet', reason: 'Turn your busted draw into a bluff. Check-raise overbet tells a convincing story.' },
    { hand: 'Second nut flush', action: 'CHECK-CALL', sizing: 'N/A', reason: 'Strong but not nutted. Check-call to keep in villain\'s bluffs. Don\'t raise into the nuts.' },
    { hand: 'Top pair on river', action: 'CHECK-CALL', sizing: 'N/A', reason: 'Showdown value. Just call and see if you\'re good. Raising gets called only by better.' },
  ]},
];

export default function XRaiseTiming() {
  const [streetIdx, setStreetIdx] = useState(0);
  const street = STREETS[streetIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Check-Raise Timing
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Know exactly when to spring the trap on every street.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
        {STREETS.map((s, i) => (
          <button key={i} onClick={() => setStreetIdx(i)}
            style={{ padding: '10px 8px', borderRadius: 10, border: streetIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: streetIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>{s.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: streetIdx === i ? s.color : '#64748b' }}>{s.name}</div>
          </button>
        ))}
      </div>

      <motion.div key={streetIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ display: 'grid', gap: 8 }}>
        {street.scenarios.map((s, i) => {
          const actionColor = s.action.includes('RAISE') ? '#22c55e' : s.action.includes('CALL') ? '#f59e0b' : s.action.includes('FOLD') ? '#ef4444' : '#3b82f6';
          return (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, borderLeft: `3px solid ${actionColor}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{s.hand}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: actionColor, background: `${actionColor}15`, padding: '2px 8px', borderRadius: 4 }}>{s.action}</span>
                  {s.sizing !== 'N/A' && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 4 }}>{s.sizing}</span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.reason}</div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
