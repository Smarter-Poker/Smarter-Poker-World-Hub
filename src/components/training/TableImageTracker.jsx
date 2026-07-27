/**
 * TableImageTracker — Your Table Image & Metagame Guide
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Understand and manipulate your perceived image at the table.
 */
import React, { useState } from 'react';

const IMAGES = [
  {
    name: 'Tight-Aggressive (TAG)',
    icon: '▲',
    color: '#10b981',
    perception: 'Opponents think you only play strong hands and bet aggressively.',
    exploits: [
      { adj: 'Bluff more', reason: 'Opponents give you credit for strong hands. Your bluffs get more respect.' },
      { adj: 'Open slightly wider', reason: 'Your raises get more folds preflop. Steal blinds more often.' },
      { adj: 'Slow-play occasionally', reason: 'When you do check, opponents may bet into your monsters.' },
    ],
    counters: ['Opponents will start 3-betting you light', 'Regs will float your c-bets more', 'Eventually you\'ll get less action on value hands'],
  },
  {
    name: 'Loose-Aggressive (LAG)',
    icon: '▲',
    color: '#ef4444',
    perception: 'Opponents think you\'re a maniac who plays too many hands aggressively.',
    exploits: [
      { adj: 'Value bet thinner', reason: 'Opponents call you down lighter. Get paid with marginal hands.' },
      { adj: 'Reduce bluff frequency', reason: 'You\'re already getting called — make sure you have goods.' },
      { adj: 'Trap more', reason: 'Let opponents hang themselves trying to catch your bluffs.' },
    ],
    counters: ['You\'ll face more check-raises', 'Opponents trap with strong hands', 'Variance is much higher'],
  },
  {
    name: 'Tight-Passive (Nit)',
    icon: '·',
    color: '#3b82f6',
    perception: 'Opponents think you only play premiums and never bluff.',
    exploits: [
      { adj: 'Your rare bluffs work great', reason: 'Nobody expects you to bluff. Use it selectively for max fold equity.' },
      { adj: 'Open raise for max steal', reason: 'When you do raise, people over-fold thinking you have AA.' },
      { adj: 'Time to adjust', reason: 'If you actually ARE a nit, start opening up. You\'re leaving money on the table.' },
    ],
    counters: ['You get zero action with strong hands', 'Opponents steal your blinds relentlessly', 'Miss tons of +EV opportunities'],
  },
  {
    name: 'Loose-Passive (Fish)',
    icon: '▲',
    color: '#f59e0b',
    perception: 'Opponents think you call too much and don\'t raise enough.',
    exploits: [
      { adj: 'Tighten up', reason: 'If this is your actual style, you\'re losing money. Play fewer, stronger hands.' },
      { adj: 'Raise more preflop', reason: 'Stop limping and calling. Aggression wins in poker.' },
      { adj: 'Fold more rivers', reason: 'Loose-passive players call too much. Save bets by folding bad hands.' },
    ],
    counters: ['Opponents value bet you relentlessly', 'Nobody bluffs you (they know you\'ll call)', 'You bleed chips slowly but surely'],
  },
];

const TIPS = [
  'Your image changes throughout a session based on shown hands',
  'After showing a bluff, tighten up — opponents will call you wider',
  'After showing premiums, bluff more — opponents will over-fold',
  'New to the table? Default TAG image. Adjust after 30+ minutes',
];

function TableImageTracker() {
  const [selected, setSelected] = useState(0);
  const img = IMAGES[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f97316' }}>Table Image Tracker</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {IMAGES.map((im, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: selected === i ? im.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 10, fontWeight: 700,
            }}>
              <div style={{ fontSize: 16 }}>{im.icon}</div>
              <div>{im.name.split(' (')[0]}</div>
            </button>
          ))}
        </div>

        <div style={{ padding: 14, background: `${img.color}11`, borderRadius: 10, border: `1px solid ${img.color}33`, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: img.color, marginBottom: 4 }}>{img.icon} {img.name}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, fontStyle: 'italic' }}>{img.perception}</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: 6 }}>How to Exploit This Image</div>
          {img.exploits.map((e, i) => (
            <div key={i} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: img.color, marginBottom: 2 }}>{e.adj}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{e.reason}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: 10, background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.12)', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Watch Out For</div>
          {img.counters.map((c, i) => (
            <div key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>- {c}</div>
          ))}
        </div>

        <div style={{ padding: 10, background: 'rgba(249,115,22,0.06)', borderRadius: 8, border: '1px solid rgba(249,115,22,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f97316', marginBottom: 4 }}>Meta Tips</div>
          {TIPS.map((t, i) => (
            <div key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2, lineHeight: 1.4 }}>• {t}</div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Table Image Tracker failed: {err.message}</div>;
  }
}

export default TableImageTracker;
