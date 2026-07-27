/**
 * FLOP CATEGORY BROWSER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Browse GTO solutions organized by flop category:
 * - Categorized by texture (monotone, two-tone, rainbow, paired)
 * - Ranked, connected, and high-card groupings
 * - Strategy summary per category
 * - C-bet frequency and sizing data
 * - Quick-browse with drill-down detail
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● FLOP CATEGORIES ●●●
const CATEGORIES = [
  {
    id: 'high_dry_rainbow',
    group: 'Dry',
    name: 'High Dry Rainbow',
    pattern: 'Axx / Kxx Rainbow',
    examples: ['A♠ 7♦ 2♣', 'K♣ 8♥ 3♦', 'A♥ 9♣ 4♦'],
    frequency: 12.4,
    ipCbet: 75, oopCbet: 40,
    preferredSize: '33%',
    checkFreq: 25,
    keyStrategy: 'High frequency small c-bets. Range advantage is massive on ace/king-high dry boards.',
    subCategories: [
      { name: 'Ace-high', cbet: 78, size: '33%', examples: 3240 },
      { name: 'King-high', cbet: 72, size: '33%', examples: 2880 },
    ],
    rangeAdvantage: 'IP',
    difficulty: 'Easy',
  },
  {
    id: 'mid_dry_rainbow',
    group: 'Dry',
    name: 'Mid Dry Rainbow',
    pattern: 'Txx / 9xx Rainbow, disconnected',
    examples: ['T♠ 6♦ 2♣', '9♥ 4♣ 2♦', 'J♣ 5♥ 2♦'],
    frequency: 8.6,
    ipCbet: 62, oopCbet: 32,
    preferredSize: '33-50%',
    checkFreq: 38,
    keyStrategy: 'Moderate c-bet frequency. IP advantage is solid but not as extreme as high-card dry.',
    subCategories: [
      { name: 'Jack-high', cbet: 65, size: '33%', examples: 2160 },
      { name: 'Ten-high', cbet: 60, size: '50%', examples: 1920 },
      { name: 'Nine-high', cbet: 58, size: '50%', examples: 1680 },
    ],
    rangeAdvantage: 'IP',
    difficulty: 'Medium',
  },
  {
    id: 'low_rainbow',
    group: 'Dry',
    name: 'Low Rainbow',
    pattern: '8xx or lower, Rainbow',
    examples: ['8♠ 4♦ 2♣', '7♥ 3♣ 2♦', '6♣ 4♥ 2♦'],
    frequency: 6.2,
    ipCbet: 48, oopCbet: 28,
    preferredSize: '50-67%',
    checkFreq: 52,
    keyStrategy: 'Lower c-bet frequency. BB range connects better with low boards. Size up when betting.',
    subCategories: [
      { name: 'Eight-high', cbet: 52, size: '50%', examples: 1440 },
      { name: 'Seven and below', cbet: 44, size: '67%', examples: 1080 },
    ],
    rangeAdvantage: 'Neutral',
    difficulty: 'Medium',
  },
  {
    id: 'two_tone_high',
    group: 'Two-Tone',
    name: 'High Two-Tone',
    pattern: 'Axx / Kxx with flush draw',
    examples: ['A♠ 8♠ 3♦', 'K♥ 7♥ 2♣', 'A♦ T♦ 5♣'],
    frequency: 14.8,
    ipCbet: 58, oopCbet: 30,
    preferredSize: '33-50%',
    checkFreq: 42,
    keyStrategy: 'Still high frequency but more checking than dry. Flush draws reduce range advantage slightly.',
    subCategories: [
      { name: 'Ace-high two-tone', cbet: 62, size: '33%', examples: 4320 },
      { name: 'King-high two-tone', cbet: 55, size: '50%', examples: 3840 },
    ],
    rangeAdvantage: 'IP',
    difficulty: 'Medium',
  },
  {
    id: 'two_tone_connected',
    group: 'Two-Tone',
    name: 'Connected Two-Tone',
    pattern: 'Connected cards with flush draw',
    examples: ['T♠ 9♠ 7♦', 'J♥ T♥ 8♣', '9♦ 8♦ 6♣'],
    frequency: 10.2,
    ipCbet: 42, oopCbet: 25,
    preferredSize: '67%',
    checkFreq: 58,
    keyStrategy: 'Selective c-betting. Many draws available. Polarize sizing — small or large, not medium.',
    subCategories: [
      { name: 'Broadway connected', cbet: 45, size: '67%', examples: 2880 },
      { name: 'Middle connected', cbet: 40, size: '67%', examples: 2400 },
      { name: 'Low connected', cbet: 38, size: '75%', examples: 1920 },
    ],
    rangeAdvantage: 'OOP',
    difficulty: 'Hard',
  },
  {
    id: 'monotone',
    group: 'Monotone',
    name: 'Monotone Boards',
    pattern: 'All three cards same suit',
    examples: ['Q♥ 8♥ 3♥', 'J♠ 7♠ 2♠', 'K♦ 9♦ 4♦'],
    frequency: 5.2,
    ipCbet: 32, oopCbet: 20,
    preferredSize: '33%',
    checkFreq: 68,
    keyStrategy: 'Very low c-bet frequency. Check most range. Only bet strong made flushes and nut flush draws.',
    subCategories: [
      { name: 'High monotone', cbet: 35, size: '33%', examples: 960 },
      { name: 'Low monotone', cbet: 28, size: '33%', examples: 720 },
    ],
    rangeAdvantage: 'OOP',
    difficulty: 'Hard',
  },
  {
    id: 'paired_high',
    group: 'Paired',
    name: 'High Paired',
    pattern: 'Board paired with T+ card',
    examples: ['K♠ K♦ 7♣', 'Q♥ Q♣ 5♦', 'J♠ J♦ 3♣'],
    frequency: 4.8,
    ipCbet: 68, oopCbet: 35,
    preferredSize: '33%',
    checkFreq: 32,
    keyStrategy: 'High c-bet frequency. Trips are rare in both ranges. Bet small and often.',
    subCategories: [
      { name: 'Ace/King paired', cbet: 72, size: '33%', examples: 480 },
      { name: 'Queen-Ten paired', cbet: 65, size: '33%', examples: 600 },
    ],
    rangeAdvantage: 'IP',
    difficulty: 'Easy',
  },
  {
    id: 'paired_low',
    group: 'Paired',
    name: 'Low Paired',
    pattern: 'Board paired with 9 or below',
    examples: ['7♠ 7♦ 3♣', '5♥ 5♣ 2♦', '3♠ 3♦ 8♣'],
    frequency: 5.8,
    ipCbet: 55, oopCbet: 30,
    preferredSize: '33-50%',
    checkFreq: 45,
    keyStrategy: 'Moderate frequency. BB has more trip combos with low pairs. Still profitable to c-bet with small sizing.',
    subCategories: [
      { name: 'Nine-Seven paired', cbet: 58, size: '33%', examples: 540 },
      { name: 'Six and below paired', cbet: 50, size: '50%', examples: 660 },
    ],
    rangeAdvantage: 'Neutral',
    difficulty: 'Medium',
  },
];

const GROUPS = [...new Set(CATEGORIES.map(c => c.group))];

function getDifficultyColor(d) {
  if (d === 'Easy') return '#22c55e';
  if (d === 'Medium') return '#f59e0b';
  return '#ef4444';
}

function getAdvantageColor(a) {
  if (a === 'IP') return '#22c55e';
  if (a === 'OOP') return '#ef4444';
  return '#64748b';
}

// ●●● MAIN COMPONENT ●●●
export default function FlopCategoryBrowser() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [filterGroup, setFilterGroup] = useState(null);
  const [sortBy, setSortBy] = useState('frequency'); // frequency | cbet | difficulty

  const filtered = useMemo(() => {
    let cats = filterGroup ? CATEGORIES.filter(c => c.group === filterGroup) : CATEGORIES;
    if (sortBy === 'frequency') cats = [...cats].sort((a, b) => b.frequency - a.frequency);
    else if (sortBy === 'cbet') cats = [...cats].sort((a, b) => b.ipCbet - a.ipCbet);
    else cats = [...cats].sort((a, b) => {
      const order = { Easy: 0, Medium: 1, Hard: 2 };
      return order[a.difficulty] - order[b.difficulty];
    });
    return cats;
  }, [filterGroup, sortBy]);

  const totalFlops = CATEGORIES.reduce((a, c) => a + c.frequency, 0);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Flop Category Browser</h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Browse GTO solutions by flop texture — {totalFlops.toFixed(1)}% of all flops covered</div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setFilterGroup(null)} style={{
            padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
            background: !filterGroup ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
            border: !filterGroup ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            color: !filterGroup ? '#3b82f6' : '#64748b', fontSize: 10, fontWeight: 600,
          }}>All ({CATEGORIES.length})</button>
          {GROUPS.map(g => {
            const count = CATEGORIES.filter(c => c.group === g).length;
            return (
              <button key={g} onClick={() => setFilterGroup(g)} style={{
                padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                background: filterGroup === g ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                border: filterGroup === g ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                color: filterGroup === g ? '#3b82f6' : '#64748b', fontSize: 10, fontWeight: 600,
              }}>{g} ({count})</button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {['frequency', 'cbet', 'difficulty'].map(s => (
            <button key={s} onClick={() => setSortBy(s)} style={{
              padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
              background: sortBy === s ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
              border: sortBy === s ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
              color: sortBy === s ? '#f59e0b' : '#64748b', fontSize: 10, fontWeight: 600,
            }}>Sort: {s === 'frequency' ? 'Frequency' : s === 'cbet' ? 'C-Bet %' : 'Difficulty'}</button>
          ))}
        </div>

        {/* Category list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(cat => {
            const isExpanded = selectedCategory === cat.id;
            return (
              <div key={cat.id}>
                <div onClick={() => setSelectedCategory(isExpanded ? null : cat.id)} style={{
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  background: isExpanded ? 'rgba(59,130,246,0.08)' : 'rgba(0,0,0,0.1)',
                  border: isExpanded ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ padding: '2px 5px', borderRadius: 3, background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontSize: 7, fontWeight: 800 }}>{cat.group}</span>
                    <span style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700, flex: 1 }}>{cat.name}</span>
                    <span style={{ color: getDifficultyColor(cat.difficulty), fontSize: 9, fontWeight: 700 }}>{cat.difficulty}</span>
                    <span style={{ color: '#f59e0b', fontSize: 11, fontWeight: 800 }}>{cat.frequency}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: '#64748b', fontSize: 9 }}>{cat.pattern}</span>
                    <span style={{ color: '#22c55e', fontSize: 9, fontWeight: 600 }}>IP C-bet: {cat.ipCbet}%</span>
                    <span style={{ color: getAdvantageColor(cat.rangeAdvantage), fontSize: 9, fontWeight: 600 }}>Advantage: {cat.rangeAdvantage}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ margin: '4px 0 4px 12px', padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(59,130,246,0.1)' }}>
                    {/* Examples */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      {cat.examples.map((ex, i) => (
                        <span key={i} style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.2)', color: '#f1f5f9', fontSize: 11, fontWeight: 600 }}>{ex}</span>
                      ))}
                    </div>

                    {/* Stats grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
                      {[
                        { label: 'IP C-Bet', value: `${cat.ipCbet}%`, color: '#22c55e' },
                        { label: 'OOP C-Bet', value: `${cat.oopCbet}%`, color: '#f59e0b' },
                        { label: 'Sizing', value: cat.preferredSize, color: '#3b82f6' },
                        { label: 'Check Freq', value: `${cat.checkFreq}%`, color: '#64748b' },
                      ].map((s, i) => (
                        <div key={i} style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 4, padding: 6, textAlign: 'center' }}>
                          <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600 }}>{s.label}</div>
                          <div style={{ color: s.color, fontSize: 14, fontWeight: 800 }}>{s.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Sub-categories */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Sub-Categories</div>
                      {cat.subCategories.map((sub, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                          <span style={{ color: '#94a3b8', fontSize: 10, flex: 1 }}>{sub.name}</span>
                          <span style={{ color: '#22c55e', fontSize: 10, fontWeight: 700 }}>C-bet: {sub.cbet}%</span>
                          <span style={{ color: '#3b82f6', fontSize: 10 }}>Size: {sub.size}</span>
                          <span style={{ color: '#64748b', fontSize: 9 }}>{sub.examples.toLocaleString()} flops</span>
                        </div>
                      ))}
                    </div>

                    {/* Strategy */}
                    <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 6, padding: 8, border: '1px solid rgba(59,130,246,0.15)' }}>
                      <div style={{ color: '#3b82f6', fontSize: 9, fontWeight: 700, marginBottom: 2 }}>KEY STRATEGY</div>
                      <div style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1.5 }}>{cat.keyStrategy}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Flop Category Browser</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
