/**
 * CheckBehindStrategy — When to Check Back in Position
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Strategic guide for checking back IP to control pot, induce, or protect equity.
 */
import React, { useState } from 'react';

const SPOTS = [
  {
    title: 'Showdown Value',
    hand: 'A♠ T♣ on K♦ T♥ 5♣ | 2♠',
    street: 'Turn',
    action: 'Check Behind',
    color: '#3b82f6',
    reason: 'Second pair has showdown value but can\'t handle aggression. Betting turns your hand into a target — villain only continues with better. Check back, get to showdown cheaply.',
    benefit: 'See free river, avoid being raised off your equity',
  },
  {
    title: 'Induce Bluffs',
    hand: 'K♠ K♥ on Q♣ 7♦ 2♠ | 4♣',
    street: 'Turn',
    action: 'Check Behind',
    color: '#10b981',
    reason: 'Overpair on a dry board. Villain\'s range is weak after calling flop. Check turn to induce river bluffs from missed draws and weak hands that would fold to a bet.',
    benefit: 'Extract extra value from villain\'s bluff range on river',
  },
  {
    title: 'Board Texture Shift',
    hand: 'J♥ J♣ on T♥ 8♥ 3♣ | 7♥',
    street: 'Turn',
    action: 'Check Behind',
    color: '#f59e0b',
    reason: 'Flush completes + straight gets there. Your overpair is now a bluff-catcher. Don\'t put more money in — check and evaluate river.',
    benefit: 'Avoid bloating pot when your hand is now marginal',
  },
  {
    title: 'Protect Check Range',
    hand: 'A♣ A♦ on K♠ Q♦ J♣',
    street: 'Flop',
    action: 'Check Behind',
    color: '#8b5cf6',
    reason: 'Board smashes villain\'s calling range (KQ, KJ, QJ, JT, AT). Your aces are vulnerable. Check back some % of the time to protect your checking range and avoid getting check-raised.',
    benefit: 'Balanced strategy — prevents villain from exploiting your check range',
  },
  {
    title: 'Thin Value Trap',
    hand: '9♠ 9♥ on A♣ 5♦ 3♠ | 8♣ | 2♦',
    street: 'River',
    action: 'Check Behind',
    color: '#ef4444',
    reason: 'Middle pair on ace-high board. What calls that you beat? Almost nothing. Betting is turning your hand into a bluff. Check behind and win at showdown vs missed draws.',
    benefit: 'Don\'t turn a winning hand into a losing bluff',
  },
];

function CheckBehindStrategy() {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const spot = SPOTS[idx];

  const next = () => { setIdx((idx + 1) % SPOTS.length); setRevealed(false); };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#8b5cf6' }}>Check Behind Strategy</h3>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{idx + 1}/{SPOTS.length}</span>
        </div>

        <div style={{ padding: 14, background: 'rgba(139,92,246,0.06)', borderRadius: 10, border: '1px solid rgba(139,92,246,0.15)', marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{spot.street} — In Position</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{spot.hand}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#8b5cf6' }}>{spot.title}</div>
        </div>

        {!revealed ? (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Should you bet or check behind?</div>
            <button onClick={() => setRevealed(true)} style={{
              padding: '10px 24px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', background: '#8b5cf6', color: '#fff',
            }}>Reveal Strategy</button>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <span style={{
                fontSize: 16, fontWeight: 900, color: spot.color,
                padding: '4px 16px', borderRadius: 8, background: `${spot.color}18`,
              }}>{spot.action}</span>
            </div>
            <div style={{ padding: 10, background: `${spot.color}08`, borderRadius: 8, border: `1px solid ${spot.color}22`, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{spot.reason}</div>
            </div>
            <div style={{ padding: 8, background: 'rgba(16,185,129,0.06)', borderRadius: 6, border: '1px solid rgba(16,185,129,0.12)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', marginBottom: 2 }}>Key Benefit</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{spot.benefit}</div>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center' }}>
          <button onClick={next} style={{
            padding: '8px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: '#8b5cf6', color: '#fff', fontSize: 12, fontWeight: 600,
          }}>Next Spot →</button>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Check Behind Strategy failed: {err.message}</div>;
  }
}

export default CheckBehindStrategy;
