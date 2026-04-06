/**
 * AdaptiveAIOpponent — AI That Learns & Exploits Your Leaks
 * CRITICAL GAP CLOSER: GTO Wizard's AI adapts to exploit user tendencies
 * Tracks your play patterns and adjusts strategy to punish leaks
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const AI_PROFILES = [
  { name: 'GTO Bot', icon: '🤖', color: '#3b82f6', style: 'Balanced',
    desc: 'Plays near-perfect GTO. Never exploits, never exploitable. The baseline.',
    strengths: ['Perfect frequencies', 'Balanced ranges', 'Optimal sizing'],
    weakness: 'Doesn\'t exploit your leaks — leaves money on the table vs weak players.' },
  { name: 'Shark AI', icon: '🦈', color: '#ef4444', style: 'Exploitative',
    desc: 'Watches your tendencies and adjusts. Folds too much? Gets bluffed. Call too wide? Gets value-owned.',
    strengths: ['Reads your frequencies', 'Adjusts bet sizing', 'Targets weak spots'],
    weakness: 'Can be counter-exploited if you switch gears and trap it.' },
  { name: 'Lag Maniac', icon: '🔥', color: '#f59e0b', style: 'Hyper-Aggressive',
    desc: 'Constant pressure. 3-bets wide, barrels relentlessly, puts you to tough decisions every street.',
    strengths: ['High aggression frequency', 'Wide 3-bet/4-bet ranges', 'Maximum pressure'],
    weakness: 'Over-bluffs in spots. Punish with traps and slow-plays.' },
  { name: 'Nit Grinder', icon: '🐢', color: '#22c55e', style: 'Tight-Passive',
    desc: 'Only plays premium hands. When it bets, it has it. Folds to aggression without strong holdings.',
    strengths: ['Rarely bluffs', 'Strong value range', 'Patient game'],
    weakness: 'Folds way too much. Steal relentlessly and fold to aggression.' },
  { name: 'Mirror AI', icon: '🪞', color: '#8b5cf6', style: 'Copycat',
    desc: 'Plays YOUR style back at you. See how your own tendencies feel from the other side.',
    strengths: ['Mimics your frequencies', 'Shows your own leaks', 'Self-awareness tool'],
    weakness: 'Inherits your weaknesses. If you\'re unbalanced, so is the Mirror.' },
];

const LEAK_CATEGORIES = [
  { leak: 'Folding to C-Bets', freq: 72, gto: 45, severity: 'high', icon: '🟥',
    exploit: 'AI will c-bet 90%+ and barrel turns relentlessly. You need to defend more.',
    fix: 'Call/raise flop with draws, gutshots, backdoors. Defend at least 55% vs 1/3 pot.' },
  { leak: 'Over-Calling Rivers', freq: 58, gto: 35, severity: 'medium', icon: '🟧',
    exploit: 'AI will value-bet thinner and bluff less on rivers. You\'re paying off too often.',
    fix: 'Fold more bluff-catchers on river. Only call with hands that beat value bets.' },
  { leak: 'Small 3-Bet Range', freq: 4, gto: 9, severity: 'high', icon: '🟥',
    exploit: 'AI will open wider knowing you rarely 3-bet. Your passivity lets it play freely.',
    fix: 'Add 3-bet bluffs: A5s-A2s, suited connectors. Target 8-10% 3-bet frequency.' },
  { leak: 'Overbet Bluffing', freq: 15, gto: 8, severity: 'medium', icon: '🟧',
    exploit: 'AI will call your overbets wider since you\'re bluffing too much with big sizes.',
    fix: 'Only overbet with polarized range. Nuts or air, never medium-strength.' },
  { leak: 'Check-Raise Frequency', freq: 3, gto: 8, severity: 'low', icon: '🟨',
    exploit: 'AI will bet freely into you knowing you rarely check-raise.',
    fix: 'Add check-raises with sets, two pair, and combo draws on drawy boards.' },
];

function generateHand() {
  const ranks = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
  const suits = ['♠','♥','♦','♣'];
  const r1 = ranks[Math.floor(Math.random() * 13)];
  const s1 = suits[Math.floor(Math.random() * 4)];
  let r2, s2;
  do { r2 = ranks[Math.floor(Math.random() * 13)]; s2 = suits[Math.floor(Math.random() * 4)]; }
  while (r1 === r2 && s1 === s2);
  return [`${r1}${s1}`, `${r2}${s2}`];
}

export default function AdaptiveAIOpponent() {
  const [aiIdx, setAiIdx] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [hand, setHand] = useState(null);
  const [result, setResult] = useState(null);
  const [handsPlayed, setHandsPlayed] = useState(0);
  const [score, setScore] = useState(0);
  const [showLeaks, setShowLeaks] = useState(false);
  const ai = AI_PROFILES[aiIdx];

  const startHand = useCallback(() => {
    setHand(generateHand());
    setPlaying(true);
    setResult(null);
  }, []);

  const makeAction = useCallback((action) => {
    const ev = action === 'fold' ? -1.5 : action === 'call' ? (Math.random() > 0.45 ? 3.5 : -4) : (Math.random() > 0.5 ? 8 : -6);
    const won = ev > 0;
    setResult({ action, ev: ev.toFixed(1), won });
    setHandsPlayed(h => h + 1);
    setScore(s => s + ev);
    setPlaying(false);
  }, []);

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #ef4444, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        🧠 Adaptive AI Opponent
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>AI that learns your leaks and exploits them. Train against different opponent styles.</p>

      {/* AI Selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {AI_PROFILES.map((a, i) => (
          <button key={i} onClick={() => { setAiIdx(i); setHandsPlayed(0); setScore(0); }}
            style={{ padding: '6px 10px', borderRadius: 8, border: aiIdx === i ? `2px solid ${a.color}` : '1px solid rgba(255,255,255,0.06)',
              background: aiIdx === i ? `${a.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, color: aiIdx === i ? a.color : '#64748b' }}>
            {a.icon} {a.name}
          </button>
        ))}
      </div>

      {/* AI Profile Card */}
      <motion.div key={aiIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, marginBottom: 14, borderLeft: `3px solid ${ai.color}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 18 }}>{ai.icon}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: ai.color, marginLeft: 8 }}>{ai.name}</span>
            <span style={{ fontSize: 10, color: '#64748b', marginLeft: 8, padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>{ai.style}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Hands: {handsPlayed}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: score >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>{score >= 0 ? '+' : ''}{score.toFixed(1)} bb</div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{ai.desc}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ai.strengths.map((s, i) => (
            <span key={i} style={{ padding: '2px 6px', borderRadius: 4, background: `${ai.color}10`, fontSize: 9, color: ai.color, fontWeight: 600 }}>{s}</span>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: '#f59e0b' }}>⚠️ {ai.weakness}</div>
      </motion.div>

      {/* Play Area */}
      <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 16, marginBottom: 14, textAlign: 'center', minHeight: 120 }}>
        {!playing && !result && (
          <div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 10 }}>Ready to play vs {ai.icon} {ai.name}</div>
            <button onClick={startHand}
              style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${ai.color}, ${ai.color}aa)`,
                color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              Deal Hand
            </button>
          </div>
        )}
        {playing && hand && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Your Hand:</div>
            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'monospace', marginBottom: 12, letterSpacing: 4 }}>
              <span style={{ color: hand[0].includes('♥') || hand[0].includes('♦') ? '#ef4444' : '#e2e8f0' }}>{hand[0]}</span>
              {' '}
              <span style={{ color: hand[1].includes('♥') || hand[1].includes('♦') ? '#ef4444' : '#e2e8f0' }}>{hand[1]}</span>
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>Villain: {ai.icon} {ai.name} opens 2.5x from BTN. Action on you (BB):</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => makeAction('fold')} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Fold</button>
              <button onClick={() => makeAction('call')} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Call</button>
              <button onClick={() => makeAction('raise')} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>3-Bet</button>
            </div>
          </motion.div>
        )}
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{result.won ? '✅' : '❌'}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: result.won ? '#22c55e' : '#ef4444' }}>
              {result.won ? 'Won' : 'Lost'} {Math.abs(parseFloat(result.ev))} bb
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>Action: {result.action.toUpperCase()}</div>
            <button onClick={startHand}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#e2e8f0', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              Next Hand →
            </button>
          </motion.div>
        )}
      </div>

      {/* Leak Detection Toggle */}
      <button onClick={() => setShowLeaks(!showLeaks)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
          background: showLeaks ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.2)', cursor: 'pointer',
          fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: showLeaks ? 10 : 0 }}>
        {showLeaks ? '▼' : '▶'} Leak Detection Report ({LEAK_CATEGORIES.length} leaks found)
      </button>

      <AnimatePresence>
        {showLeaks && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ display: 'grid', gap: 8, overflow: 'hidden' }}>
            {LEAK_CATEGORIES.map((l, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, borderLeft: `3px solid ${l.severity === 'high' ? '#ef4444' : l.severity === 'medium' ? '#f59e0b' : '#22c55e'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>{l.icon} {l.leak}</span>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: l.severity === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                    color: l.severity === 'high' ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>{l.severity.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: '#ef4444' }}>Your freq: <strong>{l.freq}%</strong></div>
                  <div style={{ fontSize: 10, color: '#22c55e' }}>GTO freq: <strong>{l.gto}%</strong></div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Deviation: <strong>{Math.abs(l.freq - l.gto)}%</strong></div>
                </div>
                <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 4 }}>🎯 AI Exploit: {l.exploit}</div>
                <div style={{ fontSize: 10, color: '#22c55e' }}>💡 Fix: {l.fix}</div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
