/**
 * EquityRealizationGuide — Understanding Equity Realization
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Shows how much of your raw equity you actually realize based on
 * position, hand type, and stack depth. Key GTO concept.
 */
import React, { useState } from 'react';

const FACTORS = [
  {
    factor: 'Position', color: '#3b82f6',
    scenarios: [
      { label: 'In Position (IP)', eqr: 110, raw: 50, realized: 55, note: 'Acting last lets you control pot size, bluff more effectively, and extract extra value. You realize MORE than your raw equity.' },
      { label: 'Out of Position (OOP)', eqr: 70, raw: 50, realized: 35, note: 'Acting first means opponents can adjust. You over-fold, miss value, and get bluffed more. You realize LESS than raw equity.' },
      { label: 'BTN vs BB (extreme)', eqr: 120, raw: 48, realized: 58, note: 'BTN has maximum positional advantage. Even with slightly less raw equity, BTN can realize more.' },
    ],
  },
  {
    factor: 'Hand Type', color: '#10b981',
    scenarios: [
      { label: 'Suited Connectors IP', eqr: 95, raw: 42, realized: 40, note: 'Great equity realization — make strong hands (straights, flushes) and can bluff effectively with draws.' },
      { label: 'Offsuit Broadway OOP', eqr: 60, raw: 45, realized: 27, note: 'Poor EQR — makes top pair which is hard to play OOP. Gets dominated by better Ax/Kx.' },
      { label: 'Small Pairs IP', eqr: 85, raw: 44, realized: 37, note: 'Good EQR when IP — set mine profitably. When you hit, you stack opponents. When you miss, fold cheaply.' },
      { label: 'Small Pairs OOP', eqr: 55, raw: 44, realized: 24, note: 'Bad EQR OOP — same set mining but harder to extract. Check-raise looks obvious. Fold too often without set.' },
    ],
  },
  {
    factor: 'Stack Depth', color: '#f59e0b',
    scenarios: [
      { label: 'Deep (100bb+)', eqr: 100, raw: 50, realized: 50, note: 'Full equity realization possible. Multi-street play allows strong hands to get paid and draws to develop.' },
      { label: 'Medium (40-60bb)', eqr: 90, raw: 50, realized: 45, note: 'Slightly reduced EQR. Fewer streets to play means less room for implied odds. Speculative hands suffer.' },
      { label: 'Short (15-25bb)', eqr: 75, raw: 50, realized: 38, note: 'Low EQR for speculative hands. Push/fold means you cant set mine or chase draws. Premium hands gain EQR.' },
    ],
  },
  {
    factor: 'Multiway', color: '#e879f9',
    scenarios: [
      { label: '3-Way Pot', eqr: 70, raw: 33, realized: 23, note: 'EQR drops significantly multiway. More players = more likely someone has you beat. Bluffing becomes nearly impossible.' },
      { label: '4-Way Pot', eqr: 55, raw: 25, realized: 14, note: 'Terrible EQR for most hands. Only nut hands realize equity. Bluffs fail, draws are competed, and reverse implied odds spike.' },
      { label: 'Heads-Up Pot', eqr: 100, raw: 50, realized: 50, note: 'Full EQR in HU pots. You can bluff, value bet thin, and control the pot. This is where skill shines.' },
    ],
  },
];

function EquityRealizationGuide() {
  const [activeFactor, setActiveFactor] = useState(0);
  const factor = FACTORS[activeFactor];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#06b6d4' }}>Equity Realization</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {FACTORS.map((f, i) => (
            <button key={f.factor} onClick={() => setActiveFactor(i)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: activeFactor === i ? f.color : 'rgba(255,255,255,0.06)',
              color: activeFactor === i ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 11, fontWeight: 700,
            }}>{f.factor}</button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {factor.scenarios.map((s, i) => (
            <div key={i} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 10, borderLeft: `4px solid ${factor.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: s.eqr >= 95 ? '#10b981' : s.eqr >= 70 ? '#f59e0b' : '#ef4444' }}>
                  EQR: {s.eqr}%
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 2 }}>
                    <div style={{ height: '100%', width: `${s.raw}%`, background: '#6b7280', borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Raw: {s.raw}%</div>
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }}>→</div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 2 }}>
                    <div style={{ height: '100%', width: `${s.realized}%`, background: s.realized > s.raw ? '#10b981' : '#ef4444', borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Realized: {s.realized}%</div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{s.note}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, padding: 10, background: 'rgba(6,182,212,0.06)', borderRadius: 8, border: '1px solid rgba(6,182,212,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', marginBottom: 4 }}>Key Takeaway</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
            Raw equity doesnt equal money won. A hand with 40% equity IP might be more profitable than a hand with 50% equity OOP. Always consider how much equity you can actually REALIZE before calling or raising.
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Equity Realization Guide failed to load: {err.message}</div>;
  }
}

export default EquityRealizationGuide;
