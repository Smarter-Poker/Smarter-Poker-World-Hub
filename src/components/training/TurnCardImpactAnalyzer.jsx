/**
 * TurnCardImpactAnalyzer — How Turn Cards Change Strategy
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Analyze how different turn card categories impact equity distribution,
 * range advantage, and optimal strategy adjustments.
 */
import React, { useState } from 'react';

const TURN_CATEGORIES = [
  {
    name: 'Overcard (Ace)',
    example: 'Flop: T♠ 7♦ 3♣ → Turn: A♥',
    color: '#ef4444',
    icon: 'A',
    rangeImpact: 'Shifts advantage to preflop aggressor (has more Ax combos)',
    forIP: { change: 'Positive', detail: 'Great barrel card. You can represent AK, AQ, AJ. Defenders fold many pairs below the Ace.' },
    forOOP: { change: 'Negative', detail: 'Bad card for BB/caller. Your Tx and 7x hands are now weaker. Check more and evaluate carefully.' },
    equityShift: '+8% for aggressor',
    barrelFreq: '65-75%',
  },
  {
    name: 'Overcard (K/Q)',
    example: 'Flop: 9♣ 6♦ 2♠ → Turn: K♦',
    color: '#f59e0b',
    icon: 'K',
    rangeImpact: 'Moderate advantage shift to aggressor (has KQ, KJ, AK)',
    forIP: { change: 'Positive', detail: 'Good barrel card. Represents overpairs and strong Kx hands. Forces defender to fold medium pairs.' },
    forOOP: { change: 'Slightly negative', detail: 'K is less scary than A for defender. Still some Kx in defending range. Proceed with caution.' },
    equityShift: '+5% for aggressor',
    barrelFreq: '55-65%',
  },
  {
    name: 'Board Pairs',
    example: 'Flop: J♥ 8♣ 5♦ → Turn: J♠',
    color: '#8b5cf6',
    icon: 'J=J',
    rangeImpact: 'Reduces combos of trips for both. Favors aggressor on high pair, defender on low pair.',
    forIP: { change: 'Mixed', detail: 'If board pairs the high card (J), good for aggressor. If pairs low card, defender benefits from more combos.' },
    forOOP: { change: 'Mixed', detail: 'Paired boards shrink effective ranges. Can be a good bluff spot if you block the paired card.' },
    equityShift: 'Neutral (depends)',
    barrelFreq: '50-60%',
  },
  {
    name: 'Flush Completes',
    example: 'Flop: K♠ 9♠ 4♣ → Turn: 6♠',
    color: '#3b82f6',
    icon: '♠♠♠',
    rangeImpact: 'Defender typically has more flush draws (called with draws). Aggressor range is capped.',
    forIP: { change: 'Negative', detail: 'Flush completing is usually bad for aggressor. Defender called the flop with many flush draws that now got there.' },
    forOOP: { change: 'Positive', detail: 'Your flush draws completed. Can lead/donk or check-raise. Aggressor is scared to barrel into completed flush.' },
    equityShift: '+10% for defender',
    barrelFreq: '25-35% (slow down)',
  },
  {
    name: 'Straight Completes',
    example: 'Flop: T♥ 9♣ 3♦ → Turn: 8♠',
    color: '#10b981',
    icon: '→→',
    rangeImpact: 'Heavily favors defender. BB has many suited connectors (J7, 76, QJ) that complete straights.',
    forIP: { change: 'Negative', detail: 'Scary card. Many straight combos in defender range. Slow down with one-pair hands. Only continue with nutted hands.' },
    forOOP: { change: 'Positive', detail: 'Great card for defender. Can check-raise aggressively with made straights and semi-bluff with remaining draws.' },
    equityShift: '+12% for defender',
    barrelFreq: '20-30% (danger)',
  },
  {
    name: 'Brick / Blank',
    example: 'Flop: K♠ 9♦ 4♣ → Turn: 2♥',
    color: '#6b7280',
    icon: '2',
    rangeImpact: 'No change. Board texture stays the same. Range advantages from flop carry over.',
    forIP: { change: 'Neutral', detail: 'Brick = no change. If you were planning to barrel, its not a good bluff card (no scare value). But value hands can continue.' },
    forOOP: { change: 'Neutral', detail: 'Nothing changed. If you were calling flop, same evaluation applies. Draws didnt improve or worsen.' },
    equityShift: 'No change',
    barrelFreq: '40-50% (standard)',
  },
];

function TurnCardImpactAnalyzer() {
  const [selected, setSelected] = useState(0);

  const cat = TURN_CATEGORIES[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#a78bfa' }}>Turn Card Impact Analyzer</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {TURN_CATEGORIES.map((t, i) => (
            <button key={t.name} onClick={() => setSelected(i)} style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: selected === i ? t.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{t.icon} {t.name}</button>
          ))}
        </div>

        <div style={{ textAlign: 'center', padding: 12, background: `${cat.color}08`, borderRadius: 10, border: `1px solid ${cat.color}20`, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: 2, marginBottom: 4 }}>{cat.example}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{cat.rangeImpact}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: cat.color }}>{cat.equityShift}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Equity Shift</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: cat.color }}>{cat.barrelFreq}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Barrel Frequency</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 12, borderRadius: 8, borderLeft: '4px solid #10b981', background: cat.forIP.change === 'Positive' ? 'rgba(16,185,129,0.06)' : cat.forIP.change === 'Negative' ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: cat.forIP.change === 'Positive' ? '#10b981' : cat.forIP.change === 'Negative' ? '#ef4444' : '#f59e0b', marginBottom: 4 }}>
              For Aggressor (IP): {cat.forIP.change}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{cat.forIP.detail}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 8, borderLeft: '4px solid #3b82f6', background: cat.forOOP.change === 'Positive' ? 'rgba(16,185,129,0.06)' : cat.forOOP.change === 'Negative' ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: cat.forOOP.change === 'Positive' ? '#10b981' : cat.forOOP.change === 'Negative' ? '#ef4444' : '#f59e0b', marginBottom: 4 }}>
              For Defender (OOP): {cat.forOOP.change}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{cat.forOOP.detail}</div>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Turn Impact Analyzer failed to load: {err.message}</div>;
  }
}

export default TurnCardImpactAnalyzer;
