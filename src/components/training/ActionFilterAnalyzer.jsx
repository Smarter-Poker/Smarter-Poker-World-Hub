/**
 * ActionFilterAnalyzer — Advanced Hand Filter & Action Analysis
 * COMPETITIVE GAP CLOSER: Mirrors GTO Wizard's HH Analyzer action filters
 * Filter hands by position, action, board type, EV loss, and more
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

const SAMPLE_HANDS = [
  { id: 1, hand: 'A♠K♥', pos: 'BTN', action: '3-Bet', street: 'Preflop', board: '-', evLoss: 0, result: '+15.2bb', classification: 'Best' },
  { id: 2, hand: 'Q♠J♠', pos: 'CO', action: 'C-Bet 33%', street: 'Flop', board: 'K♥T♦2♣', evLoss: -0.8, result: '+8.5bb', classification: 'Correct' },
  { id: 3, hand: 'T♥T♣', pos: 'MP', action: 'Call', street: 'River', board: 'A♠K♥7♦3♣9♠', evLoss: -3.2, result: '-22.0bb', classification: 'Blunder' },
  { id: 4, hand: '8♠7♠', pos: 'BTN', action: 'Float', street: 'Flop', board: 'A♠5♥2♦', evLoss: -1.5, result: '+12.0bb', classification: 'Inaccuracy' },
  { id: 5, hand: 'K♠Q♥', pos: 'HJ', action: 'Fold', street: 'Turn', board: 'J♠T♦4♣K♥', evLoss: -5.1, result: '-8.0bb', classification: 'Blunder' },
  { id: 6, hand: 'A♥A♣', pos: 'UTG', action: '4-Bet', street: 'Preflop', board: '-', evLoss: 0, result: '+35.0bb', classification: 'Best' },
  { id: 7, hand: '6♠5♠', pos: 'BB', action: 'X-Raise', street: 'Flop', board: '7♣4♥2♠', evLoss: -0.3, result: '+18.5bb', classification: 'Correct' },
  { id: 8, hand: 'J♥J♣', pos: 'CO', action: 'Check', street: 'River', board: 'Q♠8♥3♦5♣T♠', evLoss: -2.8, result: '-15.0bb', classification: 'Wrong' },
  { id: 9, hand: '9♠8♥', pos: 'BTN', action: 'Bet 75%', street: 'Turn', board: 'T♣7♦2♠J♥', evLoss: -0.5, result: '+22.0bb', classification: 'Correct' },
  { id: 10, hand: 'A♣K♣', pos: 'SB', action: 'C-Bet 50%', street: 'Flop', board: 'Q♠7♥3♦', evLoss: -1.2, result: '-6.0bb', classification: 'Inaccuracy' },
  { id: 11, hand: 'K♥Q♠', pos: 'BTN', action: 'Fold', street: 'River', board: 'J♠T♦9♣2♥8♠', evLoss: -4.2, result: '-12.0bb', classification: 'Wrong' },
  { id: 12, hand: '5♣5♠', pos: 'CO', action: 'Set Mine', street: 'Preflop', board: '-', evLoss: 0, result: '+45.0bb', classification: 'Best' },
];

const POSITIONS = ['All', 'UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STREETS = ['All', 'Preflop', 'Flop', 'Turn', 'River'];
const CLASSIFICATIONS = ['All', 'Best', 'Correct', 'Inaccuracy', 'Wrong', 'Blunder'];
const ACTIONS = ['All', 'Bet', 'C-Bet', 'Check', 'Call', 'Raise', 'X-Raise', 'Fold', '3-Bet', '4-Bet', 'Float'];

const classColors = { Best: '#22c55e', Correct: '#86efac', Inaccuracy: '#f59e0b', Wrong: '#ef4444', Blunder: '#dc2626' };

export default function ActionFilterAnalyzer() {
  const [posFilter, setPosFilter] = useState('All');
  const [streetFilter, setStreetFilter] = useState('All');
  const [classFilter, setClassFilter] = useState('All');
  const [sortBy, setSortBy] = useState('evLoss');
  const [minEvLoss, setMinEvLoss] = useState(0);

  const filtered = useMemo(() => {
    let data = [...SAMPLE_HANDS];
    if (posFilter !== 'All') data = data.filter(h => h.pos === posFilter);
    if (streetFilter !== 'All') data = data.filter(h => h.street === streetFilter);
    if (classFilter !== 'All') data = data.filter(h => h.classification === classFilter);
    if (minEvLoss > 0) data = data.filter(h => Math.abs(h.evLoss) >= minEvLoss);
    data.sort((a, b) => sortBy === 'evLoss' ? a.evLoss - b.evLoss : parseFloat(b.result) - parseFloat(a.result));
    return data;
  }, [posFilter, streetFilter, classFilter, sortBy, minEvLoss]);

  const totalEvLoss = filtered.reduce((s, h) => s + h.evLoss, 0);
  const blunders = filtered.filter(h => h.classification === 'Blunder' || h.classification === 'Wrong').length;

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #3b82f6, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Action Filter Analyzer
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>Filter your hands by any criteria. Find your biggest leaks instantly.</p>

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>POSITION</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {POSITIONS.map(p => (
              <button key={p} onClick={() => setPosFilter(p)}
                style={{ padding: '3px 8px', borderRadius: 4, border: posFilter === p ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.04)',
                  background: posFilter === p ? 'rgba(59,130,246,0.1)' : 'rgba(0,0,0,0.2)', cursor: 'pointer',
                  fontSize: 9, fontWeight: 700, color: posFilter === p ? '#3b82f6' : '#64748b' }}>{p}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>STREET</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {STREETS.map(s => (
              <button key={s} onClick={() => setStreetFilter(s)}
                style={{ padding: '3px 8px', borderRadius: 4, border: streetFilter === s ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.04)',
                  background: streetFilter === s ? 'rgba(34,197,94,0.1)' : 'rgba(0,0,0,0.2)', cursor: 'pointer',
                  fontSize: 9, fontWeight: 700, color: streetFilter === s ? '#22c55e' : '#64748b' }}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>CLASSIFICATION</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {CLASSIFICATIONS.map(c => (
              <button key={c} onClick={() => setClassFilter(c)}
                style={{ padding: '3px 8px', borderRadius: 4, border: classFilter === c ? `1px solid ${classColors[c] || '#8b5cf6'}` : '1px solid rgba(255,255,255,0.04)',
                  background: classFilter === c ? `${classColors[c] || '#8b5cf6'}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
                  fontSize: 9, fontWeight: 700, color: classFilter === c ? (classColors[c] || '#8b5cf6') : '#64748b' }}>{c}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>MIN EV LOSS</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {[0, 1, 2, 3, 5].map(v => (
              <button key={v} onClick={() => setMinEvLoss(v)}
                style={{ padding: '3px 8px', borderRadius: 4, border: minEvLoss === v ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.04)',
                  background: minEvLoss === v ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.2)', cursor: 'pointer',
                  fontSize: 9, fontWeight: 700, color: minEvLoss === v ? '#ef4444' : '#64748b' }}>{v === 0 ? 'Any' : `≥${v}bb`}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ background: 'rgba(59,130,246,0.08)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#3b82f6' }}>{filtered.length}</div>
          <div style={{ fontSize: 9, color: '#64748b' }}>Hands Found</div>
        </div>
        <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444' }}>{totalEvLoss.toFixed(1)}bb</div>
          <div style={{ fontSize: 9, color: '#64748b' }}>Total EV Loss</div>
        </div>
        <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b' }}>{blunders}</div>
          <div style={{ fontSize: 9, color: '#64748b' }}>Mistakes</div>
        </div>
      </div>

      {/* Hand List */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 50px 80px 60px 60px 70px 70px', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {['Hand', 'Pos', 'Action', 'Street', 'EV Loss', 'Result', 'Grade'].map(h => (
            <div key={h} style={{ fontSize: 8, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>
        {filtered.map((h, i) => (
          <motion.div key={h.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
            style={{ display: 'grid', gridTemplateColumns: '60px 50px 80px 60px 60px 70px 70px', padding: '8px 10px',
              borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>{h.hand}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{h.pos}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1' }}>{h.action}</span>
            <span style={{ fontSize: 10, color: '#64748b' }}>{h.street}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: h.evLoss < -2 ? '#ef4444' : h.evLoss < 0 ? '#f59e0b' : '#22c55e', fontFamily: 'monospace' }}>
              {h.evLoss === 0 ? '0' : h.evLoss.toFixed(1)}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: parseFloat(h.result) >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>{h.result}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: classColors[h.classification] }}>{h.classification}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
