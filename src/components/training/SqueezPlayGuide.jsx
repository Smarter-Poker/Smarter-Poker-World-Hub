/**
 * SqueezPlayGuide — Squeeze Play Strategy
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Guide for executing squeeze plays (3-bet after open + cold call).
 * Shows optimal spots, sizing, and range construction.
 */
import React, { useState } from 'react';

const SPOTS = [
  {
    position: 'BB vs CO open + BTN call', color: '#ef4444',
    squeezeRange: '12-15%',
    value: 'AA-TT, AKs-ATs, KQs, AKo-AJo',
    bluffs: 'A5s-A2s, K9s, Q9s, J9s, T8s, 97s',
    sizing: '4x open + 1x per caller = ~12-13bb',
    foldEquity: '65-70%',
    reasoning: 'BTNs cold-call caps their range (no AA/KK). CO opened but faces a 3-bet behind — often folds medium hands. High fold equity makes squeezing very profitable.',
    tips: ['Target flat-callers specifically', 'Size larger when OOP', 'BTN is capped — they cant have premiums'],
  },
  {
    position: 'SB vs UTG open + MP call', color: '#f59e0b',
    squeezeRange: '7-9%',
    value: 'AA-QQ, AKs, AKo',
    bluffs: 'A5s, A4s, K5s (very selective)',
    sizing: '4.5x open + 1x per caller = ~13-14bb',
    foldEquity: '55-60%',
    reasoning: 'UTG opened strong and MP called strong. Less fold equity here. Tighten squeeze range significantly. Only squeeze with premiums and a few suited bluffs.',
    tips: ['Respect early position opens', 'Fewer bluffs when ranges are strong', 'MP caller might have TT-JJ (trapping)'],
  },
  {
    position: 'BTN vs MP open + CO call', color: '#10b981',
    squeezeRange: '10-13%',
    value: 'AA-JJ, AKs-AJs, KQs, AKo-AQo',
    bluffs: 'A5s-A2s, K9s-K8s, Q9s, J9s, T9s',
    sizing: '3.5x open + 1x per caller = ~10-11bb',
    foldEquity: '60-65%',
    reasoning: 'In position squeeze is powerful. You have positional advantage postflop if called. Can squeeze slightly wider. COs flat-call is capped.',
    tips: ['IP squeezes can be wider', 'Size slightly smaller since you have position', 'Even if called, you play well postflop'],
  },
  {
    position: 'CO vs LJ open + HJ call', color: '#3b82f6',
    squeezeRange: '9-11%',
    value: 'AA-JJ, AKs-AQs, KQs, AKo',
    bluffs: 'A5s-A3s, KTs, QTs',
    sizing: '3.5x open + 1x per caller = ~10-11bb',
    foldEquity: '58-63%',
    reasoning: 'Good squeeze spot. Both opponents have defined ranges. LJs open is somewhat wide and HJs flat is capped. Squeeze profitable with moderate fold equity.',
    tips: ['Watch for EP nits who wont fold', 'Adjust based on player types', 'Add more bluffs vs weak callers'],
  },
];

function SqueezPlayGuide() {
  const [selected, setSelected] = useState(0);
  const spot = SPOTS[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f97316' }}>Squeeze Play Guide</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {SPOTS.map((s, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              flex: 1, padding: '6px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: selected === i ? s.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 9, fontWeight: 700, lineHeight: 1.3,
            }}>{s.position}</button>
          ))}
        </div>

        <div style={{ padding: 12, background: `${spot.color}11`, borderRadius: 10, border: `1px solid ${spot.color}33`, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: spot.color, marginBottom: 8 }}>{spot.position}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{spot.squeezeRange}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Squeeze Range</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>{spot.foldEquity}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Fold Equity</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#3b82f6' }}>{spot.sizing}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Sizing</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 8, borderLeft: '3px solid #10b981' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>Value Range</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{spot.value}</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(239,68,68,0.06)', borderRadius: 8, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Bluff Range</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{spot.bluffs}</div>
          </div>
        </div>

        <div style={{ padding: 10, background: 'rgba(249,115,22,0.06)', borderRadius: 8, border: '1px solid rgba(249,115,22,0.12)', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{spot.reasoning}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {spot.tips.map((t, i) => (
            <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', paddingLeft: 8, borderLeft: `2px solid ${spot.color}44` }}>{t}</div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Squeeze Play Guide failed to load: {err.message}</div>;
  }
}

export default SqueezPlayGuide;
