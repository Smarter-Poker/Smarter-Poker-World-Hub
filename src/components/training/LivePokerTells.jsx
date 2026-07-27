/**
 * LivePokerTells — Live Poker Physical Tells Guide
 * Reading physical behavior at the live table
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const TELLS = [
  { tell: 'Chip Handling After Looking at Cards', icon: '●', color: '#22c55e',
    reliable: 'Medium-High',
    strong: 'Immediately touches/plays with chips after seeing hole cards → usually a strong hand. Ready to bet.',
    weak: 'Looks at cards, then carefully places them down, no chip movement → weak/marginal hand.',
    counter: 'Good players fake-touch chips with weak hands. Weight this tell heavily for recreational players only.' },
  { tell: 'Speech / Verbal Patterns', icon: '·', color: '#ef4444',
    reliable: 'Medium',
    strong: '"Are you sure you want to call?" or trash talk → usually strong. Trying to provoke a call.',
    weak: 'Quiet, concentrated, minimal talk → could be either. Sudden silence after talking = usually strong.',
    counter: 'Hollywood is real at live tables. Some players talk MORE with big hands, some talk LESS. Build a baseline.' },
  { tell: 'Bet Sizing & Motion', icon: '●', color: '#3b82f6',
    reliable: 'High',
    strong: 'Confident, smooth bet motion with exact chips → practiced/prepared = usually strong.',
    weak: 'Hesitant bet, counting chips slowly, pushing in uncertainty → often weak or bluffing.',
    counter: 'This is one of the most reliable tells. The WAY someone bets matters more than the amount.' },
  { tell: 'Eye Contact & Gaze', icon: '○', color: '#f59e0b',
    reliable: 'Medium',
    strong: 'Staring you down while waiting for your decision → usually bluffing (trying to intimidate).',
    weak: 'Looking away, avoiding eye contact, looking at phone → usually strong (doesn\'t want attention).',
    counter: 'This tell is reversed from what you\'d expect. Strength = avoidance. Weakness = confrontation.' },
  { tell: 'Posture & Body Language', icon: '◇', color: '#8b5cf6',
    reliable: 'Medium-High',
    strong: 'Leaning back, relaxed, still body → usually strong hand. Comfortable and confident.',
    weak: 'Leaning forward, rigid, touching face/neck → usually uncomfortable = bluffing or marginal.',
    counter: 'Posture changes are subconscious and hard to fake. Very reliable for recreational players.' },
];

export default function LivePokerTells() {
  const [tellIdx, setTellIdx] = useState(0);
  const tell = TELLS[tellIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ○ Live Poker Tells
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Read physical behavior at the live table.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {TELLS.map((t, i) => (
          <button key={i} onClick={() => setTellIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: tellIdx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: tellIdx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{t.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: tellIdx === i ? t.color : '#64748b' }}>{t.tell.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={tellIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>{tell.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: tell.color }}>{tell.tell}</span>
          </div>
          <div style={{ background: `${tell.color}20`, borderRadius: 6, padding: '3px 8px' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: tell.color }}>{tell.reliable}</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Indicates Strength</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{tell.strong}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Indicates Weakness</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{tell.weak}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Counter / Caveat</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{tell.counter}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
