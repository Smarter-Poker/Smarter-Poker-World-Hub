/**
 * RUNOUT SIMULATOR
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GTO Wizard-style runout analysis:
 * - See how strategy changes on every possible turn/river card
 * - Card-by-card frequency heatmap
 * - Best/worst runout cards for your range
 * - EV shift per card
 * - Board texture classification per runout
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const SUITS = [
  { s: '♠', color: '#f1f5f9' },
  { s: '♥', color: '#ef4444' },
  { s: '♦', color: '#3b82f6' },
  { s: '♣', color: '#22c55e' },
];

// ●●● FLOP PRESETS ●●●
const FLOP_PRESETS = [
  { label: 'A♠ K♥ 7♦', cards: ['A♠','K♥','7♦'], texture: 'Dry Broadway' },
  { label: 'Q♣ J♠ T♥', cards: ['Q♣','J♠','T♥'], texture: 'Connected' },
  { label: 'T♠ 9♠ 2♣', cards: ['T♠','9♠','2♣'], texture: 'Monotone Draw' },
  { label: '7♦ 5♣ 3♥', cards: ['7♦','5♣','3♥'], texture: 'Low Dry' },
  { label: 'K♠ 8♦ 3♣', cards: ['K♠','8♦','3♣'], texture: 'Standard Dry' },
  { label: '9♥ 8♥ 6♦', cards: ['9♥','8♥','6♦'], texture: 'Wet Connected' },
];

// ●●● GENERATE RUNOUT DATA ●●●
function generateRunoutData(flop) {
  const cards = [];
  const flopRanks = flop.cards.map(c => c[0]);
  const flopSuits = flop.cards.map(c => c.slice(1));
  const hasFlush = flopSuits[0] === flopSuits[1] || flopSuits[0] === flopSuits[2] || flopSuits[1] === flopSuits[2];

  for (let r = 0; r < RANKS.length; r++) {
    for (let si = 0; si < SUITS.length; si++) {
      const card = `${RANKS[r]}${SUITS[si].s}`;
      // Skip cards already on flop
      if (flop.cards.includes(card)) continue;

      const rank = RANKS[r];
      const suit = SUITS[si].s;

      // Calculate how this card changes strategy
      let betFreqShift = 0;
      let evShift = 0;
      let category = 'neutral';

      // Overcard
      const isOvercard = r < RANKS.indexOf(flopRanks[0]);
      // Pairs the board
      const pairsBoard = flopRanks.includes(rank);
      // Completes straight
      const isConnector = flopRanks.some(fr => Math.abs(RANKS.indexOf(fr) - r) === 1);
      // Flush card
      const flushSuit = flopSuits.find((s, i) => flopSuits.filter(fs => fs === s).length >= 2);
      const completesFlush = flushSuit && suit === flushSuit;
      const bringsFlushDraw = !hasFlush && flopSuits.includes(suit);

      if (completesFlush) {
        betFreqShift = -25; evShift = -1.8; category = 'bad';
      } else if (isOvercard && !pairsBoard) {
        betFreqShift = -10; evShift = -0.6; category = 'slightly_bad';
      } else if (pairsBoard) {
        betFreqShift = 15; evShift = 0.8; category = 'good';
      } else if (isConnector) {
        betFreqShift = -5; evShift = -0.3; category = 'slightly_bad';
      } else if (bringsFlushDraw) {
        betFreqShift = -8; evShift = -0.4; category = 'slightly_bad';
      } else if (r > 7) {
        betFreqShift = 12; evShift = 0.5; category = 'good';
      } else {
        betFreqShift = Math.round(Math.random() * 10 - 3);
        evShift = Math.round((Math.random() * 0.8 - 0.2) * 100) / 100;
        category = betFreqShift > 5 ? 'good' : betFreqShift < -5 ? 'slightly_bad' : 'neutral';
      }

      // Base bet frequency from position
      const baseBet = 55;
      const betFreq = Math.max(5, Math.min(95, baseBet + betFreqShift));
      const checkFreq = 100 - betFreq;

      cards.push({
        card, rank, suit, suitColor: SUITS[si].color,
        betFreq, checkFreq, evShift, category, betFreqShift,
        tags: [
          pairsBoard && 'Pairs Board',
          completesFlush && 'Flush Complete',
          bringsFlushDraw && 'Flush Draw',
          isOvercard && 'Overcard',
          isConnector && 'Connector',
        ].filter(Boolean),
      });
    }
  }
  return cards;
}

function getCategoryColor(cat) {
  if (cat === 'good') return '#22c55e';
  if (cat === 'slightly_bad') return '#f59e0b';
  if (cat === 'bad') return '#ef4444';
  return '#64748b';
}

function getHeatColor(betFreq) {
  if (betFreq > 70) return 'rgba(239,68,68,0.5)';
  if (betFreq > 55) return 'rgba(239,68,68,0.25)';
  if (betFreq > 45) return 'rgba(255,255,255,0.06)';
  if (betFreq > 30) return 'rgba(59,130,246,0.25)';
  return 'rgba(59,130,246,0.5)';
}

// ●●● MAIN COMPONENT ●●●
export default function RunoutSimulator() {
  const [selectedFlop, setSelectedFlop] = useState(0);
  const [selectedCard, setSelectedCard] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // grid | ranked | category
  const [filterCat, setFilterCat] = useState(null);

  const flop = FLOP_PRESETS[selectedFlop];
  const runouts = useMemo(() => generateRunoutData(flop), [flop]);

  const filtered = filterCat ? runouts.filter(r => r.category === filterCat) : runouts;
  const sorted = viewMode === 'ranked'
    ? [...filtered].sort((a, b) => b.evShift - a.evShift)
    : filtered;

  const bestCards = [...runouts].sort((a, b) => b.evShift - a.evShift).slice(0, 5);
  const worstCards = [...runouts].sort((a, b) => a.evShift - b.evShift).slice(0, 5);
  const avgBet = Math.round(runouts.reduce((a, r) => a + r.betFreq, 0) / runouts.length);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Runout Simulator</h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
              {flop.texture} — Avg Bet Freq: {avgBet}%
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['grid', 'ranked'].map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: viewMode === v ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                color: viewMode === v ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
              }}>{v === 'grid' ? 'Card Grid' : 'EV Ranked'}</button>
            ))}
          </div>
        </div>

        {/* Flop selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {FLOP_PRESETS.map((f, i) => (
            <button key={i} onClick={() => { setSelectedFlop(i); setSelectedCard(null); }} style={{
              padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: selectedFlop === i ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              color: selectedFlop === i ? '#3b82f6' : '#94a3b8', fontSize: 11, fontWeight: 600,
              border: selectedFlop === i ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            }}>{f.label}</button>
          ))}
        </div>

        {/* Current flop display */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
          {flop.cards.map((c, i) => (
            <div key={i} style={{
              width: 50, height: 70, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              color: c.includes('♥') || c.includes('♦') ? '#ef4444' : '#f1f5f9',
              fontSize: 18, fontWeight: 800,
            }}>{c}</div>
          ))}
          {selectedCard && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', color: '#475569', fontSize: 14 }}>→</div>
              <div style={{
                width: 50, height: 70, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                color: selectedCard.suitColor, fontSize: 18, fontWeight: 800,
              }}>{selectedCard.card}</div>
            </>
          )}
        </div>

        {/* Category filters */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, justifyContent: 'center' }}>
          {[null, 'good', 'neutral', 'slightly_bad', 'bad'].map(cat => (
            <button key={cat || 'all'} onClick={() => setFilterCat(cat)} style={{
              padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: filterCat === cat ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
              color: cat ? getCategoryColor(cat) : filterCat === null ? '#f1f5f9' : '#64748b',
              fontSize: 10, fontWeight: 600,
            }}>{cat === null ? 'All' : cat === 'good' ? 'Good' : cat === 'slightly_bad' ? 'Meh' : cat === 'bad' ? 'Bad' : 'Neutral'}</button>
          ))}
        </div>

        {/* Card Grid / Ranked */}
        {viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 3, marginBottom: 16 }}>
            {sorted.map((r, i) => (
              <div key={i} onClick={() => setSelectedCard(r)} style={{
                aspectRatio: '0.72', borderRadius: 4, cursor: 'pointer',
                background: selectedCard?.card === r.card ? 'rgba(245,158,11,0.3)' : getHeatColor(r.betFreq),
                border: selectedCard?.card === r.card ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.04)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                <span style={{ color: r.suitColor, fontSize: 9, fontWeight: 800, lineHeight: 1 }}>{r.rank}</span>
                <span style={{ color: r.suitColor, fontSize: 8, lineHeight: 1 }}>{r.suit}</span>
                <span style={{ color: '#64748b', fontSize: 6, marginTop: 1 }}>{r.betFreq}%</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
            {sorted.map((r, i) => (
              <div key={i} onClick={() => setSelectedCard(r)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                background: selectedCard?.card === r.card ? 'rgba(245,158,11,0.1)' : i % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent',
                borderRadius: 4, cursor: 'pointer',
              }}>
                <span style={{ color: '#64748b', fontSize: 9, width: 16 }}>#{i + 1}</span>
                <span style={{ color: r.suitColor, fontSize: 14, fontWeight: 800, width: 30 }}>{r.card}</span>
                <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${r.betFreq}%`, height: '100%', background: r.betFreq > 55 ? '#ef4444' : '#3b82f6', borderRadius: 4 }} />
                </div>
                <span style={{ color: '#94a3b8', fontSize: 10, width: 35, textAlign: 'right' }}>{r.betFreq}%</span>
                <span style={{
                  color: r.evShift > 0 ? '#22c55e' : r.evShift < -0.5 ? '#ef4444' : '#f59e0b',
                  fontSize: 10, fontWeight: 700, width: 45, textAlign: 'right',
                }}>{r.evShift > 0 ? '+' : ''}{r.evShift.toFixed(1)}bb</span>
              </div>
            ))}
          </div>
        )}

        {/* Selected card detail */}
        {selectedCard && (
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ color: selectedCard.suitColor, fontSize: 24, fontWeight: 800 }}>{selectedCard.card}</span>
              <div>
                <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 700 }}>Turn: {selectedCard.card}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {selectedCard.tags.map((t, i) => (
                    <span key={i} style={{ padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#64748b', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>Bet Freq</div>
                <div style={{ color: '#ef4444', fontSize: 18, fontWeight: 800 }}>{selectedCard.betFreq}%</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#64748b', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>Check Freq</div>
                <div style={{ color: '#3b82f6', fontSize: 18, fontWeight: 800 }}>{selectedCard.checkFreq}%</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#64748b', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>EV Shift</div>
                <div style={{ color: selectedCard.evShift > 0 ? '#22c55e' : '#ef4444', fontSize: 18, fontWeight: 800 }}>
                  {selectedCard.evShift > 0 ? '+' : ''}{selectedCard.evShift.toFixed(2)}bb
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Best / Worst */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10 }}>
            <div style={{ color: '#22c55e', fontSize: 10, fontWeight: 700, marginBottom: 6 }}>Best Runouts</div>
            {bestCards.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ color: c.suitColor, fontSize: 12, fontWeight: 800 }}>{c.card}</span>
                <span style={{ color: '#22c55e', fontSize: 10 }}>+{c.evShift.toFixed(1)}bb</span>
                <span style={{ color: '#64748b', fontSize: 9, marginLeft: 'auto' }}>{c.betFreq}% bet</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10 }}>
            <div style={{ color: '#ef4444', fontSize: 10, fontWeight: 700, marginBottom: 6 }}>Worst Runouts</div>
            {worstCards.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ color: c.suitColor, fontSize: 12, fontWeight: 800 }}>{c.card}</span>
                <span style={{ color: '#ef4444', fontSize: 10 }}>{c.evShift.toFixed(1)}bb</span>
                <span style={{ color: '#64748b', fontSize: 9, marginLeft: 'auto' }}>{c.betFreq}% bet</span>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, justifyContent: 'center' }}>
          {[
            { color: 'rgba(239,68,68,0.5)', label: 'High Bet' },
            { color: 'rgba(255,255,255,0.06)', label: 'Mixed' },
            { color: 'rgba(59,130,246,0.5)', label: 'High Check' },
          ].map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
              <span style={{ color: '#64748b', fontSize: 9 }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Runout Simulator</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
