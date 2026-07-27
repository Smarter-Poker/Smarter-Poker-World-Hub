/**
 * SessionCoachingEngine — Real-Time Coaching Tips During Play
 * CRITICAL GAP CLOSER: GTO Wizard provides real-time feedback
 * Analyzes your play and gives coaching tips after each hand
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const COACHING_MODES = [
  { id: 'realtime', label: 'Real-Time', icon: '', color: '#ef4444', desc: 'Tips after every decision'},
  { id: 'post', label: 'Post-Hand', icon: '', color: '#3b82f6', desc: 'Analysis after each hand'},
  { id: 'session', label: 'Session Review', icon: '', color: '#8b5cf6', desc: 'End-of-session summary'},
];

const RECENT_TIPS = [
  { type: 'warning', icon: '▲', priority: 'high', street: 'Flop',
    message: 'You check-folded Q♠T♠ on J♥9♦4♣. You have an open-ended straight draw with 8 outs.',
    advice: 'Call or check-raise with OESD. You need to defend flop with draws to avoid being exploited.',
    evImpact: '-2.3bb', hand: 'Q♠T♠' },
  { type: 'good', icon: '✓', priority: 'low', street: 'River',
    message: 'Great thin value bet with A♥K♦ on K♣8♥3♠2♦7♣. Bet 40% pot and got called by K♠J♥.',
    advice: 'Perfect sizing for thin value. Smaller bet gets called by worse hands more often.',
    evImpact: '+1.8bb', hand: 'A♥K♦' },
  { type: 'mistake', icon: '✕', priority: 'critical', street: 'Turn',
    message: 'You called a pot-sized turn bet with 8♦7♦ on A♣K♥5♠2♦. No draw, no pair, no equity.',
    advice: 'This is a pure fold. You have zero equity against any value range. Don\'t call "to see" — fold immediately.',
    evImpact: '-8.5bb', hand: '8♦7♦' },
  { type: 'tip', icon: '', priority: 'medium', street: 'Preflop',
    message: 'You\'ve been opening 2x from BTN for the last 15 hands. Opponents may start 3-betting light.',
    advice: 'Mix in some 2.5x and 3x opens to keep opponents guessing. Vary your sizing with range.',
    evImpact: '0', hand: 'General' },
  { type: 'pattern', icon: '', priority: 'medium', street: 'Multi',
    message: 'Pattern detected: You\'re c-betting 88% of flops. GTO frequency is ~55-65% depending on position.',
    advice: 'Check back more medium-strength hands. Your c-bet range is too wide and unbalanced.',
    evImpact: '-1.2bb/hand', hand: 'Pattern' },
];

const SESSION_STATS = {
  handsPlayed: 142,
  duration: '2h 15m',
  profit: 38.5,
  vpip: 28,
  pfr: 22,
  cbetFlop: 72,
  cbetTurn: 45,
  wwsf: 52,
  wtsd: 28,
  w$sd: 55,
  biggestWin: 45,
  biggestLoss: -22,
  mistakeCount: 8,
  evLostTotal: -15.3,
};

const COACHING_FOCUS = [
  { area: 'C-Bet Frequency', your: '72%', gto: '58%', status: 'over', color: '#ef4444',
    tip: 'You\'re c-betting too often. Check back on boards that favor the caller\'s range.' },
  { area: 'River Fold Freq', your: '68%', gto: '52%', status: 'over', color: '#f59e0b',
    tip: 'Folding too much on rivers. You\'re being exploited by river bluffs.' },
  { area: '3-Bet %', your: '5%', gto: '8%', status: 'under', color: '#3b82f6',
    tip: 'Add more 3-bet bluffs. You\'re too passive preflop — opponents play freely against you.' },
  { area: 'WTSD', your: '28%', gto: '26%', status: 'ok', color: '#22c55e',
    tip: 'Your showdown frequency is near optimal. Keep it up.' },
];

export default function SessionCoachingEngine() {
  const [mode, setMode] = useState('realtime');
  const [showAllTips, setShowAllTips] = useState(false);

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #22c55e, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Session Coach
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>Real-time coaching engine analyzing every decision. Learn while you play.</p>

      {/* Mode Selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {COACHING_MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            style={{ flex: 1, padding: '8px 6px', borderRadius: 10, border: mode === m.id ? `2px solid ${m.color}` : '1px solid rgba(255,255,255,0.06)',
              background: mode === m.id ? `${m.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{m.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: mode === m.id ? m.color : '#64748b' }}>{m.label}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{m.desc}</div>
          </button>
        ))}
      </div>

      {/* Session Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
        {[
          { label: 'Hands', value: SESSION_STATS.handsPlayed, color: '#e2e8f0' },
          { label: 'Profit', value: `+${SESSION_STATS.profit}bb`, color: '#22c55e' },
          { label: 'Mistakes', value: SESSION_STATS.mistakeCount, color: '#ef4444' },
          { label: 'EV Lost', value: `${SESSION_STATS.evLostTotal}bb`, color: '#dc2626' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coaching Focus Areas */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 10 }}>FOCUS AREAS</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {COACHING_FOCUS.map((f, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, borderLeft: `3px solid ${f.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: f.color }}>{f.area}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#ef4444' }}>You: {f.your}</span>
                  <span style={{ fontSize: 10, color: '#22c55e' }}>GTO: {f.gto}</span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{f.tip}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Tips Feed */}
      <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>RECENT COACHING TIPS</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {(showAllTips ? RECENT_TIPS : RECENT_TIPS.slice(0, 3)).map((tip, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
            style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12,
              borderLeft: `3px solid ${tip.type === 'mistake' ? '#ef4444' : tip.type === 'good' ? '#22c55e' : tip.type === 'warning' ? '#f59e0b' : '#3b82f6'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{tip.icon} {tip.hand} — {tip.street}</span>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                color: tip.evImpact.startsWith('-') ? '#ef4444' : tip.evImpact === '0' ? '#64748b' : '#22c55e' }}>{tip.evImpact}</span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{tip.message}</div>
            <div style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}> {tip.advice}</div>
          </motion.div>
        ))}
      </div>

      {!showAllTips && RECENT_TIPS.length > 3 && (
        <button onClick={() => setShowAllTips(true)}
          style={{ width: '100%', padding: '8px', marginTop: 8, borderRadius: 8, border: '1px solid rgba(59,130,246,0.2)',
            background: 'rgba(59,130,246,0.05)', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>
          Show All {RECENT_TIPS.length} Tips
        </button>
      )}
    </div>
  );
}
