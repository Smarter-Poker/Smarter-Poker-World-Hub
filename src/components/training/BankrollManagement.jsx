/**
 * BankrollManagement — Complete Bankroll Guide
 * Rules for managing your poker bankroll across formats
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

const FORMATS = [
  { name: 'Cash Games', buyins: 30, color: '#22c55e', risk: 'Low',
    rules: ['30+ buy-ins minimum', 'Move down at 20 buy-ins', 'Move up at 40+ buy-ins', 'Never risk more than 5% of roll'] },
  { name: 'MTT / SNG', buyins: 100, color: '#3b82f6', risk: 'High',
    rules: ['100+ buy-ins minimum', 'Variance is extreme in tournaments', 'Even winners have 50+ BI downswings', 'Fire one bullet per tournament max'] },
  { name: 'Sit & Go', buyins: 50, color: '#f59e0b', risk: 'Medium',
    rules: ['50+ buy-ins minimum', 'Lower variance than MTTs', 'ICM mastery reduces variance further', 'Stay disciplined near the bubble'] },
  { name: 'Spin & Go', buyins: 200, color: '#ef4444', risk: 'Very High',
    rules: ['200+ buy-ins (hyper turbo)', 'Extremely high variance', 'Jackpot hits are rare — grind the base', 'ROI is slim, volume is key'] },
];

export default function BankrollManagement() {
  const [formatIdx, setFormatIdx] = useState(0);
  const [bankroll, setBankroll] = useState(3000);
  const format = FORMATS[formatIdx];

  const analysis = useMemo(() => {
    const maxStake = bankroll / format.buyins;
    const stakes = [
      { name: 'NL2', bi: 2 }, { name: 'NL5', bi: 5 }, { name: 'NL10', bi: 10 },
      { name: 'NL25', bi: 25 }, { name: 'NL50', bi: 50 }, { name: 'NL100', bi: 100 },
      { name: 'NL200', bi: 200 }, { name: 'NL500', bi: 500 },
    ];
    const recommended = stakes.filter(s => s.bi <= maxStake).pop() || stakes[0];
    const moveDown = stakes.filter(s => s.bi <= (bankroll / (format.buyins * 1.5))).pop() || stakes[0];
    return { maxStake: maxStake.toFixed(0), recommended, moveDown, buyinsAtRec: Math.floor(bankroll / recommended.bi) };
  }, [bankroll, format]);

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Bankroll Management
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Protect your roll — the #1 reason players go broke is poor BRM.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {FORMATS.map((f, i) => (
          <button key={i} onClick={() => setFormatIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: formatIdx === i ? `2px solid ${f.color}` : '1px solid rgba(255,255,255,0.06)',
              background: formatIdx === i ? `${f.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: formatIdx === i ? f.color : '#64748b' }}>{f.name}</div>
            <div style={{ fontSize: 9, color: '#94a3b8' }}>{f.buyins}+ BIs</div>
          </button>
        ))}
      </div>

      {/* Bankroll slider */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Your Bankroll</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>${bankroll.toLocaleString()}</span>
        </div>
        <input type="range" min={100} max={50000} step={100} value={bankroll} onChange={e => setBankroll(+e.target.value)}
          style={{ width: '100%', accentColor: format.color }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          <div style={{ background: `${format.color}15`, borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Play At</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: format.color }}>{analysis.recommended.name}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Buy-ins</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>{analysis.buyinsAtRec}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Move Down</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>{analysis.moveDown.name}</div>
          </div>
        </div>
      </div>

      {/* Format rules */}
      <div style={{ background: `${format.color}06`, borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: format.color, marginBottom: 6 }}>{format.name} Rules (Risk: {format.risk})</div>
        {format.rules.map((r, i) => (
          <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '3px 0', display: 'flex', gap: 6 }}>
            <span style={{ color: format.color }}>•</span> {r}
          </div>
        ))}
      </div>
    </div>
  );
}
