/**
 * HighStakesGuide — High Stakes Strategy (NL500+)
 * Elite-level concepts for crushing the toughest games
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const HIGH_CONCEPTS = [
  { title: 'Game Theory Optimal as Baseline', icon: '◇', color: '#ef4444',
    detail: 'At high stakes, GTO is your shield. You must know optimal frequencies before deviating. Every exploit you make exposes you to counter-exploitation.',
    principle: 'Play near-GTO vs unknowns and strong regs. Deviate only when you have high-confidence reads.',
    warning: 'Regs at this level track your stats meticulously. Unbalanced lines get punished within 1000 hands.' },
  { title: 'Thin Value & Thin Bluffs', icon: '✕', color: '#f59e0b',
    detail: 'The edge at high stakes comes from razor-thin margins. Value betting 2nd pair on the river and bluffing with marginal blockers.',
    principle: 'Every missed thin value bet or thin bluff costs you fractions of a big blind — over thousands of hands, this is your entire win rate.',
    warning: 'Don\'t go thin just for the sake of it. Your reads and range analysis must be sharp.' },
  { title: 'Metagame Warfare', icon: '●', color: '#8b5cf6',
    detail: 'High stakes is a repeated game. Your opponents adjust to you, and you must adjust to their adjustments. It\'s an infinite loop.',
    principle: 'Track how specific opponents adjust to your recent lines. If you bluffed the river last time and got caught, they\'ll call wider next time.',
    warning: 'Don\'t be predictable in your adjustments. Mix the timing and direction of your exploits.' },
  { title: 'Advanced Sizing Strategies', icon: '■', color: '#22c55e',
    detail: 'At high stakes, sizing IS information. Use geometric sizing, overbets, and micro-bets to manipulate opponent ranges.',
    principle: 'Geometric sizing across streets to get all-in by river with value hands. Overbet rivers to maximize fold equity with bluffs.',
    warning: 'Inconsistent sizing is a massive tell. If you overbet only with bluffs or only with nuts, you\'re exploitable.' },
  { title: 'Mental Fortitude', icon: '▲', color: '#3b82f6',
    detail: 'Swings at high stakes are brutal. A 10BI downswing at NL1k is $10,000. You need ironclad mental game and bankroll.',
    principle: 'Minimum 30 buy-ins. Automatic stop-loss at -3BI. Regular mental game coaching. No tilt, ever.',
    warning: 'One tilted session can erase a month of grinding. The mental game IS the game at this level.' },
];

export default function HighStakesGuide() {
  const [idx, setIdx] = useState(0);
  const c = HIGH_CONCEPTS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        High Stakes Strategy (NL500+)
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Elite concepts for the toughest games on the planet.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {HIGH_CONCEPTS.map((t, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? t.color : '#64748b' }}>
            {t.icon} {t.title}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: c.color, marginBottom: 8 }}>{c.icon} {c.title}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{c.detail}</p>
        <div style={{ background: `${c.color}08`, borderRadius: 8, padding: 10, marginBottom: 8, borderLeft: `3px solid ${c.color}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: c.color }}>PRINCIPLE</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.principle}</div>
        </div>
        <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>WARNING</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.warning}</div>
        </div>
      </motion.div>
    </div>
  );
}
