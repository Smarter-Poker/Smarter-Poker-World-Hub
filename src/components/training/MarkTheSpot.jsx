/**
 * MarkTheSpot — One-Click Hand Bookmark During Play
 * CRITICAL GAP CLOSER: GTO Wizard lets you mark hands for later review
 * Bookmark interesting spots during training, review them later with solver analysis
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const BOOKMARK_TAGS = [
  { id: 'tough', label: 'Tough Spot', icon: '', color: '#f59e0b'},
  { id: 'bluff', label: 'Bluff Attempt', icon: '', color: '#ef4444'},
  { id: 'hero', label: 'Hero Call', icon: '', color: '#8b5cf6'},
  { id: 'mistake', label: 'Mistake', icon: '✕', color: '#dc2626'},
  { id: 'greatplay', label: 'Great Play', icon: '✓', color: '#22c55e'},
  { id: 'sizing', label: 'Sizing Question', icon: '', color: '#3b82f6'},
  { id: 'range', label: 'Range Question', icon: '', color: '#06b6d4'},
  { id: 'exploit', label: 'Exploit Spot', icon: '', color: '#f97316'},
];

const SAMPLE_BOOKMARKS = [
  { id: 1, hand: 'A♠K♥', board: 'Q♥ J♣ 4♠ 8♦ 2♥', position: 'BTN vs BB', tag: 'bluff',
    action: 'Bet 75% pot on river', result: 'Lost 15.5bb', note: 'Should I have given up? Villain called with QJ.',
    timestamp: '2 min ago', street: 'river', pot: '22bb', evLoss: -3.2 },
  { id: 2, hand: 'T♠T♣', board: 'A♥ K♦ 3♠ 9♥', position: 'CO vs UTG', tag: 'hero',
    action: 'Called 2/3 pot bet on turn', result: 'Won 18bb', note: 'Villain had ATo. Was this call too loose vs UTG range?',
    timestamp: '8 min ago', street: 'turn', pot: '14bb', evLoss: 0 },
  { id: 3, hand: '7♥6♥', board: 'K♠ 5♥ 3♥ 2♦ Q♣', position: 'SB vs BTN', tag: 'mistake',
    action: 'Check-called all three streets', result: 'Lost 25bb', note: 'Missed flush draw, called river anyway. Need to fold river.',
    timestamp: '15 min ago', street: 'river', pot: '32bb', evLoss: -8.5 },
  { id: 4, hand: 'K♣Q♣', board: 'J♥ T♣ 4♣', position: 'BTN vs SB 3BP', tag: 'sizing',
    action: 'Bet 33% pot with OESD+FD', result: 'Villain folded', note: 'Should I have bet bigger with 15 outs? Or is small to get calls better?',
    timestamp: '22 min ago', street: 'flop', pot: '18bb', evLoss: 1.1 },
  { id: 5, hand: 'J♠J♦', board: 'Q♥ 8♣ 5♠ 2♦ 4♥', position: 'CO vs BB', tag: 'tough',
    action: 'Faced check-raise on flop, called', result: 'Won 12bb', note: 'BB x/r flop with what range? Should I 3-bet the flop?',
    timestamp: '30 min ago', street: 'flop', pot: '20bb', evLoss: 0.5 },
];

export default function MarkTheSpot() {
  const [bookmarks, setBookmarks] = useState(SAMPLE_BOOKMARKS);
  const [filterTag, setFilterTag] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [sortBy, setSortBy] = useState('recent');

  const filtered = filterTag ? bookmarks.filter(b => b.tag === filterTag) : bookmarks;
  const sorted = sortBy === 'evloss'
    ? [...filtered].sort((a, b) => a.evLoss - b.evLoss)
    : filtered;

  const totalEVLoss = bookmarks.reduce((acc, b) => acc + (b.evLoss < 0 ? b.evLoss : 0), 0);

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Mark The Spot
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>Bookmark hands during play for later review with solver analysis.</p>

      {/* Stats Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Bookmarks', value: bookmarks.length, color: '#f59e0b' },
          { label: 'Mistakes', value: bookmarks.filter(b => b.tag === 'mistake').length, color: '#ef4444' },
          { label: 'EV Lost', value: `${totalEVLoss.toFixed(1)}bb`, color: '#dc2626' },
          { label: 'Great Plays', value: bookmarks.filter(b => b.tag === 'greatplay').length, color: '#22c55e' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tag Filter */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setFilterTag(null)}
          style={{ padding: '4px 8px', borderRadius: 4, border: !filterTag ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.06)',
            background: !filterTag ? 'rgba(245,158,11,0.1)' : 'rgba(0,0,0,0.2)', cursor: 'pointer',
            fontSize: 9, fontWeight: 700, color: !filterTag ? '#f59e0b' : '#64748b' }}>All</button>
        {BOOKMARK_TAGS.map(t => (
          <button key={t.id} onClick={() => setFilterTag(filterTag === t.id ? null : t.id)}
            style={{ padding: '4px 8px', borderRadius: 4, border: filterTag === t.id ? `1px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: filterTag === t.id ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 9, fontWeight: 700, color: filterTag === t.id ? t.color : '#64748b' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[
          { id: 'recent', label: 'Most Recent' },
          { id: 'evloss', label: 'Biggest EV Loss' },
        ].map(s => (
          <button key={s.id} onClick={() => setSortBy(s.id)}
            style={{ padding: '4px 8px', borderRadius: 4, border: sortBy === s.id ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)',
              background: sortBy === s.id ? 'rgba(59,130,246,0.1)' : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 9, fontWeight: 700, color: sortBy === s.id ? '#3b82f6' : '#64748b' }}>{s.label}</button>
        ))}
      </div>

      {/* Bookmark List */}
      <div style={{ display: 'grid', gap: 8 }}>
        {sorted.map(b => {
          const tag = BOOKMARK_TAGS.find(t => t.id === b.tag);
          const expanded = expandedId === b.id;
          return (
            <motion.div key={b.id} layout onClick={() => setExpandedId(expanded ? null : b.id)}
              style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 12, cursor: 'pointer',
                borderLeft: `3px solid ${tag?.color || '#64748b'}`, transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: '#e2e8f0' }}>{b.hand}</span>
                  <span style={{ padding: '2px 6px', borderRadius: 4, background: `${tag?.color}15`, fontSize: 9, fontWeight: 700, color: tag?.color }}>{tag?.icon} {tag?.label}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{b.timestamp}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: b.evLoss <= 0 ? '#ef4444' : '#22c55e', fontFamily: 'monospace' }}>
                    {b.evLoss > 0 ? '+' : ''}{b.evLoss.toFixed(1)}bb EV
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{b.position} | {b.street} | Pot: {b.pot}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>Board: {b.board}</div>

              <AnimatePresence>
                {expanded && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700, marginBottom: 4 }}>Action: {b.action}</div>
                      <div style={{ fontSize: 11, color: b.result.includes('Won') ? '#22c55e' : '#ef4444', marginBottom: 4 }}>Result: {b.result}</div>
                      <div style={{ fontSize: 11, color: '#f59e0b', fontStyle: 'italic'}}> {b.note}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                           Analyze with Solver
                        </button>
                        <button style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                           Remove
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
