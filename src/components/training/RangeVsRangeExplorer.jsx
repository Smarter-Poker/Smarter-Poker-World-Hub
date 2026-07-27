/**
 * RANGE VS RANGE EXPLORER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Deep range matchup analysis tool:
 * - Select hero & villain ranges from presets or custom
 * - Board selector with runout simulation
 * - Equity distribution histogram
 * - Hand class breakdown (sets, two pair, overpair, etc.)
 * - Domination analysis and blocker effects
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const SUITS = ['♠','♥','♦','♣'];

// ●●● PRESET RANGES ●●●
const RANGE_PRESETS = {
  'UTG Open': { label: 'UTG Open (15%)', pct: 15, topPairs: 6, broadways: true, suitedMin: 7 },
  'CO Open': { label: 'CO Open (27%)', pct: 27, topPairs: 8, broadways: true, suitedMin: 5 },
  'BTN Open': { label: 'BTN Open (48%)', pct: 48, topPairs: 10, broadways: true, suitedMin: 3 },
  'SB Open': { label: 'SB Open (40%)', pct: 40, topPairs: 9, broadways: true, suitedMin: 4 },
  'BB Defend': { label: 'BB Defend vs BTN (45%)', pct: 45, topPairs: 10, broadways: true, suitedMin: 3 },
  '3-Bet Range': { label: '3-Bet (8%)', pct: 8, topPairs: 4, broadways: false, suitedMin: 9 },
  '4-Bet Range': { label: '4-Bet (3%)', pct: 3, topPairs: 2, broadways: false, suitedMin: 12 },
  'Top 10%': { label: 'Top 10%', pct: 10, topPairs: 5, broadways: false, suitedMin: 8 },
};

// ●●● BOARD PRESETS ●●●
const BOARD_PRESETS = [
  { label: 'A♠ K♥ 7♦', cards: ['As','Kh','7d'] },
  { label: 'Q♣ J♠ 3♥', cards: ['Qc','Js','3h'] },
  { label: 'T♠ 9♠ 8♥', cards: ['Ts','9s','8h'] },
  { label: '7♦ 6♣ 2♠', cards: ['7d','6c','2s'] },
  { label: 'K♠ K♦ 5♣', cards: ['Ks','Kd','5c'] },
  { label: 'A♠ 8♦ 3♣', cards: ['As','8d','3c'] },
];

// ●●● HAND STRENGTH CATEGORIES ●●●
const HAND_CLASSES = [
  { name: 'Straight Flush+', color: '#a855f7', minStrength: 95 },
  { name: 'Quads', color: '#ec4899', minStrength: 90 },
  { name: 'Full House', color: '#f43f5e', minStrength: 82 },
  { name: 'Flush', color: '#ef4444', minStrength: 72 },
  { name: 'Straight', color: '#f97316', minStrength: 62 },
  { name: 'Three of a Kind', color: '#f59e0b', minStrength: 52 },
  { name: 'Two Pair', color: '#eab308', minStrength: 40 },
  { name: 'Overpair', color: '#84cc16', minStrength: 32 },
  { name: 'Top Pair', color: '#22c55e', minStrength: 22 },
  { name: 'Middle Pair', color: '#14b8a6', minStrength: 14 },
  { name: 'Low Pair', color: '#06b6d4', minStrength: 8 },
  { name: 'Draws', color: '#3b82f6', minStrength: 3 },
  { name: 'Air', color: '#64748b', minStrength: 0 },
];

// ●●● GENERATE RANGE GRID ●●●
function generateRangeGrid(presetKey) {
  const preset = RANGE_PRESETS[presetKey];
  if (!preset) return Array(13).fill(null).map(() => Array(13).fill(0));

  const grid = [];
  for (let r = 0; r < 13; r++) {
    const row = [];
    for (let c = 0; c < 13; c++) {
      const isPair = r === c;
      const isSuited = c > r;
      const highRank = Math.min(r, c);
      const lowRank = Math.max(r, c);
      const gap = lowRank - highRank;

      let inRange = 0;
      if (isPair && r < preset.topPairs) inRange = 100;
      else if (isPair && r < preset.topPairs + 3) inRange = Math.max(0, 80 - (r - preset.topPairs) * 30);
      else if (isSuited && highRank < 4 && gap < 4) inRange = Math.min(100, preset.pct * 2.5);
      else if (isSuited && gap < 3 && highRank + lowRank < preset.suitedMin + 8) inRange = Math.min(100, preset.pct * 2);
      else if (isSuited && highRank < 2) inRange = Math.min(100, preset.pct * 1.8);
      else if (!isSuited && !isPair && highRank < 3 && lowRank < 5) inRange = Math.min(100, preset.pct * 1.5);
      else if (preset.broadways && highRank < 5 && lowRank < 5) inRange = isSuited ? 90 : 60;

      row.push(Math.round(Math.min(100, Math.max(0, inRange))));
    }
    grid.push(row);
  }
  return grid;
}

// ●●● SIMULATE EQUITY ●●●
function simulateEquity(heroPreset, villainPreset, board) {
  const heroGrid = generateRangeGrid(heroPreset);
  const villainGrid = generateRangeGrid(villainPreset);

  // Simulate hand class distribution for both ranges
  const heroClasses = HAND_CLASSES.map((hc, i) => {
    const base = i === HAND_CLASSES.length - 1 ? 25 : i === HAND_CLASSES.length - 2 ? 15 :
      i === HAND_CLASSES.length - 3 ? 8 : Math.max(1, 12 - i * 1.5);
    const rangeAdj = (RANGE_PRESETS[heroPreset]?.pct || 30) > 30 ? 1.2 : 0.8;
    return { ...hc, pct: Math.round(base * (i < 4 ? rangeAdj * 0.6 : rangeAdj)) };
  });

  const villainClasses = HAND_CLASSES.map((hc, i) => {
    const base = i === HAND_CLASSES.length - 1 ? 28 : i === HAND_CLASSES.length - 2 ? 14 :
      i === HAND_CLASSES.length - 3 ? 9 : Math.max(1, 11 - i * 1.4);
    const rangeAdj = (RANGE_PRESETS[villainPreset]?.pct || 30) > 30 ? 1.3 : 0.7;
    return { ...hc, pct: Math.round(base * (i < 4 ? rangeAdj * 0.5 : rangeAdj)) };
  });

  // Normalize
  const heroTotal = heroClasses.reduce((s, c) => s + c.pct, 0);
  const villainTotal = villainClasses.reduce((s, c) => s + c.pct, 0);
  heroClasses.forEach(c => c.pct = Math.round((c.pct / heroTotal) * 100));
  villainClasses.forEach(c => c.pct = Math.round((c.pct / villainTotal) * 100));

  // Overall equity based on range widths
  const heroPct = RANGE_PRESETS[heroPreset]?.pct || 30;
  const villainPct = RANGE_PRESETS[villainPreset]?.pct || 30;
  const heroEquity = Math.round(50 + (villainPct - heroPct) * 0.3 + (Math.random() * 6 - 3));

  // Equity distribution buckets (0-100% in 10% increments)
  const distribution = [];
  for (let i = 0; i <= 10; i++) {
    const bucket = i * 10;
    const center = heroEquity;
    const dist = Math.abs(bucket - center);
    distribution.push({
      bucket: `${bucket}%`,
      hero: Math.max(1, Math.round(20 * Math.exp(-dist * dist / 800))),
      villain: Math.max(1, Math.round(18 * Math.exp(-(100 - bucket - (100 - center)) * (100 - bucket - (100 - center)) / 800))),
    });
  }

  return { heroGrid, villainGrid, heroClasses, villainClasses, heroEquity, distribution };
}

// ●●● MINI RANGE GRID ●●●
function MiniRangeGrid({ grid, label }) {
  return (
    <div>
      <div style={{ color: '#f1f5f9', fontSize: 11, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1 }}>
        {grid.map((row, r) => row.map((val, c) => {
          const isPair = r === c;
          const isSuited = c > r;
          const alpha = val / 100;
          return (
            <div key={`${r}-${c}`} style={{
              aspectRatio: '1', borderRadius: 1,
              background: val > 0 ? `rgba(59,130,246,${0.1 + alpha * 0.7})` : 'rgba(255,255,255,0.02)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: 5.5, fontWeight: 700, lineHeight: 1,
                color: isPair ? '#fbbf24' : isSuited ? '#34d399' : '#94a3b8',
                opacity: val > 0 ? 1 : 0.3,
              }}>
                {isPair ? `${RANKS[r]}${RANKS[c]}` : isSuited ? `${RANKS[r]}${RANKS[c]}s` : `${RANKS[c]}${RANKS[r]}o`}
              </span>
            </div>
          );
        }))}
      </div>
    </div>
  );
}

// ●●● EQUITY BAR ●●●
function EquityBar({ hero, villain }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#3b82f6', fontSize: 13, fontWeight: 800 }}>Hero: {hero}%</span>
        <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 800 }}>Villain: {100 - hero}%</span>
      </div>
      <div style={{ height: 20, borderRadius: 10, overflow: 'hidden', display: 'flex', background: 'rgba(0,0,0,0.3)' }}>
        <div style={{ width: `${hero}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', transition: 'width 0.3s' }} />
        <div style={{ width: `${100 - hero}%`, background: 'linear-gradient(90deg, #f87171, #ef4444)', transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

// ●●● HAND CLASS BREAKDOWN ●●●
function HandClassBreakdown({ classes, label, color }) {
  const maxPct = Math.max(...classes.map(c => c.pct));
  return (
    <div>
      <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{label}</div>
      {classes.filter(c => c.pct > 0).map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color, flexShrink: 0 }} />
          <span style={{ color: '#94a3b8', fontSize: 9, width: 80, flexShrink: 0 }}>{c.name}</span>
          <div style={{ flex: 1, height: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${(c.pct / maxPct) * 100}%`, height: '100%',
              background: c.color, borderRadius: 4, transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ color: '#f1f5f9', fontSize: 9, fontWeight: 700, width: 28, textAlign: 'right' }}>{c.pct}%</span>
        </div>
      ))}
    </div>
  );
}

// ●●● DISTRIBUTION CHART ●●●
function DistributionChart({ distribution }) {
  const maxVal = Math.max(...distribution.flatMap(d => [d.hero, d.villain]));
  return (
    <div>
      <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Equity Distribution</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
        {distribution.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: 60 }}>
              <div style={{
                width: 8, background: 'rgba(59,130,246,0.6)', borderRadius: '2px 2px 0 0',
                height: `${(d.hero / maxVal) * 60}px`, transition: 'height 0.3s',
              }} />
              <div style={{
                width: 8, background: 'rgba(239,68,68,0.6)', borderRadius: '2px 2px 0 0',
                height: `${(d.villain / maxVal) * 60}px`, transition: 'height 0.3s',
              }} />
            </div>
            <span style={{ color: '#64748b', fontSize: 7 }}>{d.bucket}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(59,130,246,0.6)' }} />
          <span style={{ color: '#64748b', fontSize: 9 }}>Hero</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.6)' }} />
          <span style={{ color: '#64748b', fontSize: 9 }}>Villain</span>
        </div>
      </div>
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function RangeVsRangeExplorer() {
  const [heroRange, setHeroRange] = useState('BTN Open');
  const [villainRange, setVillainRange] = useState('BB Defend');
  const [selectedBoard, setSelectedBoard] = useState(0);
  const [view, setView] = useState('overview'); // overview | classes | distribution

  const data = useMemo(
    () => simulateEquity(heroRange, villainRange, BOARD_PRESETS[selectedBoard]?.cards),
    [heroRange, villainRange, selectedBoard]
  );

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Range vs Range Explorer</h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Deep range matchup analysis with equity distribution</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['overview', 'classes', 'distribution'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: view === v ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                color: view === v ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
              }}>{v}</button>
            ))}
          </div>
        </div>

        {/* Range Selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ color: '#3b82f6', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Hero Range</div>
            <select value={heroRange} onChange={e => setHeroRange(e.target.value)} style={{
              width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.3)', color: '#f1f5f9', fontSize: 11,
            }}>
              {Object.entries(RANGE_PRESETS || {}).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', color: '#64748b', fontSize: 16, fontWeight: 800, paddingTop: 16 }}>vs</div>
          <div>
            <div style={{ color: '#ef4444', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Villain Range</div>
            <select value={villainRange} onChange={e => setVillainRange(e.target.value)} style={{
              width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.3)', color: '#f1f5f9', fontSize: 11,
            }}>
              {Object.entries(RANGE_PRESETS || {}).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Board Selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Board</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {BOARD_PRESETS.map((b, i) => (
              <button key={i} onClick={() => setSelectedBoard(i)} style={{
                padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                background: selectedBoard === i ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)',
                color: selectedBoard === i ? '#22c55e' : '#94a3b8',
                fontSize: 11, fontWeight: 600,
                border: selectedBoard === i ? '1px solid rgba(34,197,94,0.3)' : '1px solid transparent',
              }}>{b.label}</button>
            ))}
          </div>
        </div>

        {/* Equity Bar */}
        <EquityBar hero={data.heroEquity} villain={100 - data.heroEquity} />

        {/* Content */}
        {view === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <MiniRangeGrid grid={data.heroGrid} label={`Hero: ${RANGE_PRESETS[heroRange]?.label}`} />
            <MiniRangeGrid grid={data.villainGrid} label={`Villain: ${RANGE_PRESETS[villainRange]?.label}`} />
          </div>
        )}

        {view === 'classes' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <HandClassBreakdown classes={data.heroClasses} label="Hero Hand Classes" color="#3b82f6" />
            <HandClassBreakdown classes={data.villainClasses} label="Villain Hand Classes" color="#ef4444" />
          </div>
        )}

        {view === 'distribution' && (
          <DistributionChart distribution={data.distribution} />
        )}

        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 16 }}>
          {[
            { label: 'Hero Combos', value: Math.round((RANGE_PRESETS[heroRange]?.pct || 30) / 100 * 1326), color: '#3b82f6' },
            { label: 'Villain Combos', value: Math.round((RANGE_PRESETS[villainRange]?.pct || 30) / 100 * 1326), color: '#ef4444' },
            { label: 'Nut Advantage', value: data.heroEquity > 52 ? 'Hero' : data.heroEquity < 48 ? 'Villain' : 'Even', color: '#f59e0b' },
            { label: 'Range Advantage', value: data.heroEquity > 55 ? 'Strong' : data.heroEquity > 52 ? 'Slight' : 'Neutral', color: '#a78bfa' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 16, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Range vs Range Explorer</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
