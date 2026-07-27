/**
 * OppTendencyTracker — Opponent Tendency Notes
 * Track and categorize opponent tendencies for exploitation
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DEFAULT_TENDENCIES = [
  { pos: 'UTG', vpip: 22, pfr: 18, af: 3.2, type: 'TAG', notes: 'Opens tight, 3-bets with premiums only' },
  { pos: 'HJ', vpip: 35, pfr: 12, af: 1.5, type: 'LAP', notes: 'Calls a lot pre, passive post. Calling station.' },
  { pos: 'CO', vpip: 28, pfr: 22, af: 2.8, type: 'TAG', notes: 'Standard reg. Folds to 3-bets from blinds.' },
  { pos: 'BTN', vpip: 45, pfr: 8, af: 0.8, type: 'Fish', notes: 'Limps a lot. Only raises with monsters. Classic fish.' },
  { pos: 'SB', vpip: 30, pfr: 24, af: 3.5, type: 'LAG', notes: 'Aggressive 3-bettor. Overbluffs rivers.' },
  { pos: 'BB', vpip: 38, pfr: 10, af: 1.2, type: 'LAP', notes: 'Defends wide but plays passively post.' },
];

const TYPE_COLORS = { TAG: '#3b82f6', LAG: '#ef4444', LAP: '#f59e0b', NIT: '#22c55e', Fish: '#ec4899' };
const TYPE_EXPLOITS = {
  TAG: ['3-bet light from position', 'Steal their blinds', 'Respect their raises post-flop'],
  LAG: ['Call down lighter', 'Let them bluff into you', 'Trap with strong hands', 'Don\'t 4-bet light'],
  LAP: ['Value bet thin', 'Never bluff them', 'Isolate preflop', 'Bet for value on all 3 streets'],
  NIT: ['Steal blinds relentlessly', 'Fold to their aggression', '3-bet their opens light', 'Bluff scare cards'],
  Fish: ['Isolate preflop', 'Value bet relentlessly', 'Don\'t fancy play', 'Be patient and extract'],
};

export default function OppTendencyTracker() {
  const [players, setPlayers] = useState(DEFAULT_TENDENCIES);
  const [selected, setSelected] = useState(0);
  const player = players[selected];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Opponent Tendency Tracker
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Profile your opponents and find their leaks.</p>

      {/* Seat selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 16 }}>
        {players.map((p, i) => (
          <button key={i} onClick={() => setSelected(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: selected === i ? `2px solid ${TYPE_COLORS[p.type]}` : '1px solid rgba(255,255,255,0.06)',
              background: selected === i ? `${TYPE_COLORS[p.type]}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: TYPE_COLORS[p.type] }}>{p.pos}</div>
            <div style={{ fontSize: 9, color: '#64748b' }}>{p.type}</div>
          </button>
        ))}
      </div>

      {/* Player profile */}
      <motion.div key={selected} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 800, color: TYPE_COLORS[player.type] }}>{player.pos}</span>
            <span style={{ fontSize: 14, color: '#64748b', marginLeft: 8 }}>— {player.type}</span>
          </div>
          <div style={{ padding: '4px 10px', borderRadius: 6, background: `${TYPE_COLORS[player.type]}20`,
            fontSize: 12, fontWeight: 700, color: TYPE_COLORS[player.type] }}>
            {player.type}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'VPIP', val: `${player.vpip}%`, color: player.vpip > 30 ? '#ef4444' : '#22c55e' },
            { label: 'PFR', val: `${player.pfr}%`, color: player.pfr > 20 ? '#f59e0b' : '#3b82f6' },
            { label: 'AF', val: player.af.toFixed(1), color: player.af > 2.5 ? '#ef4444' : '#3b82f6' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12, fontStyle: 'italic'}}> {player.notes}</div>

        {/* Exploitation tips */}
        <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 6 }}>✓ Exploit {player.type}</div>
          {(TYPE_EXPLOITS[player.type] || []).map((tip, i) => (
            <div key={i} style={{ fontSize: 12, color: '#cbd5e1', padding: '2px 0', display: 'flex', gap: 6 }}>
              <span style={{ color: '#22c55e' }}>→</span> {tip}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
