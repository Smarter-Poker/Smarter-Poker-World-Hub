/**
 * AggregatedFlopReport — Aggregate Flop Strategy Report (All 1,755 Flops)
 * COMPETITIVE GAP CLOSER: Mirrors GTO Wizard's Aggregate Flop Reports
 * Shows optimal strategy trends across all strategically distinct flops
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

// Simulated aggregate data by flop texture category
const FLOP_CATEGORIES = [
  { cat: 'Monotone', icon: '♠♠♠', count: 286, color: '#3b82f6',
    cbetIP: 32, cbetOOP: 18, checkIP: 68, checkOOP: 82, avgBetSize: '33%',
    xrFreq: 14, foldToCbet: 42, example: 'A♠ K♠ 7♠',
    insight: 'Monotone boards crush c-bet frequency. Check most of your range — flush draws dominate equity distribution.' },
  { cat: 'Two-Tone', icon: '♠♠♥', count: 858, color: '#22c55e',
    cbetIP: 52, cbetOOP: 30, checkIP: 48, checkOOP: 70, avgBetSize: '33-50%',
    xrFreq: 10, foldToCbet: 38, example: 'Q♠ J♠ 5♥',
    insight: 'Two-tone boards are the most common. IP can c-bet frequently with small sizing. OOP should check-raise more.' },
  { cat: 'Rainbow', icon: '♠♥♦', count: 611, color: '#f59e0b',
    cbetIP: 62, cbetOOP: 38, checkIP: 38, checkOOP: 62, avgBetSize: '50-75%',
    xrFreq: 8, foldToCbet: 45, example: 'K♠ 7♥ 2♦',
    insight: 'Rainbow dry boards = high c-bet frequency. Aggressor has massive range advantage. Bet big for value and protection.' },
  { cat: 'Paired', icon: 'K K 7', count: 156, color: '#8b5cf6',
    cbetIP: 70, cbetOOP: 42, checkIP: 30, checkOOP: 58, avgBetSize: '25-33%',
    xrFreq: 6, foldToCbet: 52, example: 'K♠ K♥ 7♦',
    insight: 'Paired boards heavily favor the preflop raiser. C-bet small and frequently — opponent rarely connects.' },
  { cat: 'Connected', icon: '8 9 T', count: 324, color: '#ef4444',
    cbetIP: 38, cbetOOP: 22, checkIP: 62, checkOOP: 78, avgBetSize: '33%',
    xrFreq: 16, foldToCbet: 35, example: 'T♠ 9♥ 8♦',
    insight: 'Connected boards equalize ranges. Both players have draws and made hands. Check more, c-bet less, be prepared for check-raises.' },
  { cat: 'High Card', icon: 'A K Q', count: 180, color: '#06b6d4',
    cbetIP: 58, cbetOOP: 35, checkIP: 42, checkOOP: 65, avgBetSize: '33%',
    xrFreq: 9, foldToCbet: 40, example: 'A♠ K♥ Q♦',
    insight: 'Broadway boards favor the aggressor\'s range but equity runs close. Small c-bets work well. Big bets get called too often.' },
];

const SORT_OPTIONS = ['cbetIP', 'cbetOOP', 'xrFreq', 'foldToCbet'];
const SORT_LABELS = { cbetIP: 'C-Bet IP%', cbetOOP: 'C-Bet OOP%', xrFreq: 'X/R Freq%', foldToCbet: 'Fold to CB%' };

export default function AggregatedFlopReport() {
  const [selectedCat, setSelectedCat] = useState(0);
  const [sortKey, setSortKey] = useState('cbetIP');

  const sorted = useMemo(() =>
    [...FLOP_CATEGORIES].sort((a, b) => b[sortKey] - a[sortKey]),
    [sortKey]
  );

  const cat = FLOP_CATEGORIES[selectedCat];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #ef4444, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        · Aggregated Flop Report
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>Strategy trends across all 1,755 strategically distinct flops.</p>

      {/* Total Flops Banner */}
      <div style={{ background: 'rgba(59,130,246,0.08)', borderRadius: 10, padding: 10, marginBottom: 14, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#3b82f6' }}>1,755</div>
          <div style={{ fontSize: 9, color: '#64748b' }}>Total Flops</div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e' }}>6</div>
          <div style={{ fontSize: 9, color: '#64748b' }}>Categories</div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>47%</div>
          <div style={{ fontSize: 9, color: '#64748b' }}>Avg C-Bet IP</div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>28%</div>
          <div style={{ fontSize: 9, color: '#64748b' }}>Avg C-Bet OOP</div>
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {FLOP_CATEGORIES.map((c, i) => (
          <button key={i} onClick={() => setSelectedCat(i)}
            style={{ padding: '6px 10px', borderRadius: 8, border: selectedCat === i ? `2px solid ${c.color}` : '1px solid rgba(255,255,255,0.06)',
              background: selectedCat === i ? `${c.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, color: selectedCat === i ? c.color : '#64748b' }}>
            {c.icon} {c.cat} ({c.count})
          </button>
        ))}
      </div>

      {/* Category Detail */}
      <motion.div key={selectedCat} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: cat.color }}>{cat.icon} {cat.cat} Boards</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>{cat.count} flops | e.g. {cat.example}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'C-Bet IP', val: cat.cbetIP, color: '#3b82f6' },
            { label: 'C-Bet OOP', val: cat.cbetOOP, color: '#ef4444' },
            { label: 'X/R Freq', val: cat.xrFreq, color: '#8b5cf6' },
            { label: 'Fold to CB', val: cat.foldToCbet, color: '#f59e0b' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}%</div>
              <div style={{ fontSize: 9, color: '#64748b' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: `${cat.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${cat.color}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: cat.color }}>KEY INSIGHT</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{cat.insight}</div>
        </div>
      </motion.div>

      {/* Comparison Table */}
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 4, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>SORT BY:</span>
          {SORT_OPTIONS.map(k => (
            <button key={k} onClick={() => setSortKey(k)}
              style={{ padding: '2px 6px', borderRadius: 4, background: sortKey === k ? 'rgba(59,130,246,0.15)' : 'transparent',
                border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, color: sortKey === k ? '#3b82f6' : '#64748b' }}>
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>
        {sorted.map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)',
            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: c.color }}>{c.cat}</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#3b82f6' }}>{c.cbetIP}%</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ef4444' }}>{c.cbetOOP}%</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#8b5cf6' }}>{c.xrFreq}%</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#f59e0b' }}>{c.foldToCbet}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
