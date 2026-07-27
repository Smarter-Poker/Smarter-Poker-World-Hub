/**
 * PreFlopOpenChart — Preflop Opening Ranges by Position
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Visual chart showing recommended opening ranges from each position.
 * Interactive 13x13 grid with color-coded actions.
 */
import React, { useState, useMemo } from 'react';

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];

const RANGES = {
  UTG: new Set(['AA','KK','QQ','JJ','TT','99','88','77','AKs','AQs','AJs','ATs','A5s','A4s','KQs','KJs','KTs','QJs','QTs','JTs','T9s','98s','AKo','AQo','AJo']),
  HJ: new Set(['AA','KK','QQ','JJ','TT','99','88','77','66','AKs','AQs','AJs','ATs','A9s','A5s','A4s','A3s','KQs','KJs','KTs','K9s','QJs','QTs','Q9s','JTs','J9s','T9s','98s','87s','76s','AKo','AQo','AJo','ATo','KQo','KJo']),
  CO: new Set(['AA','KK','QQ','JJ','TT','99','88','77','66','55','AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s','KQs','KJs','KTs','K9s','K8s','QJs','QTs','Q9s','Q8s','JTs','J9s','J8s','T9s','T8s','98s','97s','87s','86s','76s','75s','65s','54s','AKo','AQo','AJo','ATo','A9o','KQo','KJo','KTo','QJo','QTo','JTo']),
  BTN: new Set(['AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22','AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s','KQs','KJs','KTs','K9s','K8s','K7s','K6s','K5s','QJs','QTs','Q9s','Q8s','Q7s','Q6s','JTs','J9s','J8s','J7s','T9s','T8s','T7s','98s','97s','96s','87s','86s','76s','75s','65s','64s','54s','53s','43s','AKo','AQo','AJo','ATo','A9o','A8o','A7o','A6o','A5o','A4o','A3o','A2o','KQo','KJo','KTo','K9o','QJo','QTo','Q9o','JTo','J9o','T9o','98o','87o']),
  SB: new Set(['AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22','AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s','KQs','KJs','KTs','K9s','K8s','K7s','K6s','K5s','K4s','K3s','K2s','QJs','QTs','Q9s','Q8s','Q7s','Q6s','Q5s','JTs','J9s','J8s','J7s','J6s','T9s','T8s','T7s','98s','97s','96s','87s','86s','76s','75s','65s','64s','54s','53s','43s','AKo','AQo','AJo','ATo','A9o','A8o','A7o','A6o','A5o','A4o','A3o','A2o','KQo','KJo','KTo','K9o','K8o','QJo','QTo','Q9o','Q8o','JTo','J9o','J8o','T9o','T8o','98o','97o','87o','76o','65o']),
};

function getHandName(r, c) {
  if (r === c) return RANKS[r] + RANKS[c];
  if (r < c) return RANKS[r] + RANKS[c] + 's';
  return RANKS[c] + RANKS[r] + 'o';
}

function PreFlopOpenChart() {
  const [position, setPosition] = useState('BTN');

  const range = RANGES[position] || new Set();
  const count = range.size;
  const totalHands = 169;
  const pct = Math.round((count / totalHands) * 100);

  const posColors = { UTG: '#ef4444', HJ: '#f59e0b', CO: '#84cc16', BTN: '#10b981', SB: '#3b82f6' };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#a78bfa' }}>Preflop Open Chart</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {Object.keys(RANGES || {}).map(pos => (
            <button key={pos} onClick={() => setPosition(pos)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: position === pos ? posColors[pos] : 'rgba(255,255,255,0.06)',
              color: position === pos ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 12, fontWeight: 700,
            }}>{pos}</button>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: posColors[position] }}>{position}</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}> — {count} hands ({pct}%)</span>
        </div>

        {/* 13x13 Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1, marginBottom: 16 }}>
          {RANKS.map((_, r) =>
            RANKS.map((_, c) => {
              const hand = getHandName(r, c);
              const inRange = range.has(hand);
              const isPair = r === c;
              const isSuited = r < c;
              return (
                <div key={`${r}-${c}`} style={{
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, fontWeight: 600, borderRadius: 2,
                  background: inRange ? `${posColors[position]}` : 'rgba(255,255,255,0.04)',
                  color: inRange ? '#000' : 'rgba(255,255,255,0.2)',
                  border: isPair ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                }}>
                  {hand}
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          <span>Pairs: diagonal</span>
          <span>Suited: above diagonal</span>
          <span>Offsuit: below diagonal</span>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Preflop Open Chart failed to load: {err.message}</div>;
  }
}

export default PreFlopOpenChart;
