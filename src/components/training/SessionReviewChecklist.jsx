/**
 * SessionReviewChecklist — Post-Session Review System
 * ═══════════════════════════════════════════════════════════════════════════
 * Structured checklist for reviewing poker sessions.
 * Helps identify patterns, leaks, and areas for improvement.
 */
import React, { useState } from 'react';

const CATEGORIES = [
  {
    name: 'Preflop Decisions', color: '#3b82f6',
    items: [
      { text: 'Did I open the correct range from each position?', key: 'pf1' },
      { text: 'Did I 3-bet enough (or too much)?', key: 'pf2' },
      { text: 'Did I fold to 3-bets with the right hands?', key: 'pf3' },
      { text: 'Was my sizing appropriate for the situation?', key: 'pf4' },
      { text: 'Did I avoid playing OOP without a strong reason?', key: 'pf5' },
    ],
  },
  {
    name: 'Postflop Play', color: '#10b981',
    items: [
      { text: 'Did I c-bet at the right frequency for each board?', key: 'po1' },
      { text: 'Were my bet sizes aligned with my range?', key: 'po2' },
      { text: 'Did I give up at the right time with weak hands?', key: 'po3' },
      { text: 'Did I extract maximum value with strong hands?', key: 'po4' },
      { text: 'Were my bluffs well-timed with appropriate blockers?', key: 'po5' },
    ],
  },
  {
    name: 'Mental Game', color: '#f59e0b',
    items: [
      { text: 'Did I maintain composure after bad beats?', key: 'mg1' },
      { text: 'Was I playing my A-game throughout the session?', key: 'mg2' },
      { text: 'Did I recognize when I was tilting and adjust?', key: 'mg3' },
      { text: 'Was I focused on making good decisions, not results?', key: 'mg4' },
      { text: 'Did I take breaks when needed?', key: 'mg5' },
    ],
  },
  {
    name: 'Game Selection', color: '#e879f9',
    items: [
      { text: 'Was I at the most profitable table available?', key: 'gs1' },
      { text: 'Did I adjust my strategy to opponent tendencies?', key: 'gs2' },
      { text: 'Was the session length appropriate?', key: 'gs3' },
      { text: 'Did I quit when conditions deteriorated?', key: 'gs4' },
    ],
  },
];

function SessionReviewChecklist() {
  const [checks, setChecks] = useState({});
  const [notes, setNotes] = useState('');

  const toggle = (key) => {
    setChecks(prev => {
      const current = prev[key] || 0;
      const next = current === 0 ? 1 : current === 1 ? -1 : 0;
      return { ...prev, [key]: next };
    });
  };

  const totalItems = CATEGORIES.reduce((s, c) => s + c.items.length, 0);
  const positives = Object.values(checks || {}).filter(v => v === 1).length;
  const negatives = Object.values(checks || {}).filter(v => v === -1).length;
  const score = totalItems > 0 ? Math.round((positives / totalItems) * 100) : 0;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#14b8a6' }}>Session Review</h3>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444' }}>{score}%</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{positives} yes / {negatives} no</div>
          </div>
        </div>

        {CATEGORIES.map(cat => (
          <div key={cat.name} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: cat.color, marginBottom: 6 }}>{cat.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cat.items.map(item => {
                const state = checks[item.key] || 0;
                return (
                  <div key={item.key} onClick={() => toggle(item.key)} style={{
                    padding: '8px 10px', background: state === 1 ? 'rgba(16,185,129,0.06)' : state === -1 ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
                    borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    border: state === 1 ? '1px solid rgba(16,185,129,0.2)' : state === -1 ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: state === 1 ? '#10b981' : state === -1 ? '#ef4444' : 'rgba(255,255,255,0.1)',
                      fontSize: 12, fontWeight: 700, color: '#fff',
                    }}>
                      {state === 1 ? '✓': state === -1 ? '✕': ''}
                    </div>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', flex: 1 }}>{item.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Session Notes:</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Key hands, observations, areas to study..." style={{
            width: '100%', height: 60, padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 11, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }} />
        </div>

        <div style={{ marginTop: 10, padding: 8, background: 'rgba(20,184,166,0.06)', borderRadius: 6, border: '1px solid rgba(20,184,166,0.12)' }}>
          <div style={{ fontSize: 10, color: '#14b8a6', fontWeight: 600 }}>
            {score >= 80 ? 'Excellent session discipline. Keep it up!' :
             score >= 60 ? 'Good session overall. A few areas to improve.' :
             score >= 40 ? 'Mixed session. Focus on the red areas next time.' :
             score > 0 ? 'Tough session. Review each "no" and create a plan.' :
             'Click items to rate: ✓ (yes), ✕ (no), blank (skip)'}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Session Review failed to load: {err.message}</div>;
  }
}

export default SessionReviewChecklist;
