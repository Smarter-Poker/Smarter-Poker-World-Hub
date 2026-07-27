/**
 * XRaiseSizingGuide — Check-Raise Sizing Guide by Board Texture
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Learn optimal check-raise sizing based on board texture, SPR,
 * and hand type (value vs bluff).
 */
import React, { useState } from 'react';

const TEXTURES = [
  {
    name: 'Dry/Static',
    example: 'K♠ 7♦ 2♣',
    color: '#3b82f6',
    sizing: '3x-3.5x bet',
    value: { hands: 'Sets (KK, 77, 22), K7s, strong Kx', note: 'Dry boards dont change much. Size to build pot with strong hands. Villains calling range is defined.' },
    bluff: { hands: 'Gutshots (T9, 98), backdoor draws, A5s-A3s', note: 'Bluff with hands that have some equity. Dont over-bluff on static boards — villain calling range is sticky.' },
    freq: 8, tip: 'Check-raise less on dry boards. Villain c-bets wide here, so you get better value by calling and check-raising turn.',
  },
  {
    name: 'Wet/Connected',
    example: 'T♥ 9♣ 7♦',
    color: '#ef4444',
    sizing: '3.5x-4x bet',
    value: { hands: 'Two pair+, sets, made straights (J8, 86)', note: 'Size bigger! Wet boards mean draws are calling. Charge maximum to deny equity.' },
    bluff: { hands: 'Combo draws (8♣6♣), OESD+pair, flush draws', note: 'Semi-bluff with strong draws. You need equity when called because villain is calling wider on wet boards.' },
    freq: 14, tip: 'Check-raise more on wet boards. Denying equity is critical. Big sizing punishes draws.',
  },
  {
    name: 'Monotone (3 flush)',
    example: 'J♠ 8♠ 3♠',
    color: '#10b981',
    sizing: '3x bet',
    value: { hands: 'Nut flush, sets, two pair (must have a spade often)', note: 'Size standard. Nut flush is the key hand. Sets need to size to protect. Without a flush blocker, be cautious.' },
    bluff: { hands: 'A♠x (nut flush blocker), bare high spade', note: 'Bluff with nut flush blockers. A♠ is the best blocker — it removes villains nut flush combos.' },
    freq: 10, tip: 'Monotone boards are scary for everyone. Check-raise with nut flush and strong blockers only.',
  },
  {
    name: 'Paired Board',
    example: 'Q♣ Q♦ 5♠',
    color: '#f59e0b',
    sizing: '2.5x-3x bet',
    value: { hands: 'Trips (Qx), full house (QQ, 55), overpairs', note: 'Smaller sizing works because ranges are narrow. Trips are strong but full houses are nutted.' },
    bluff: { hands: 'A-high, suited connectors, backdoor draws', note: 'Good spot to bluff because its hard for anyone to have a Q. Villain folds a lot of pocket pairs and Ax.' },
    freq: 12, tip: 'Paired boards are great for bluff check-raises. Most players dont have trips, so they fold a lot.',
  },
  {
    name: 'Ace-High Dry',
    example: 'A♥ 7♣ 2♦',
    color: '#8b5cf6',
    sizing: '3x bet',
    value: { hands: 'Sets (AA rare from BB), A7, two pair, strong Ax', note: 'A-high boards favor the raiser. If BB check-raises, its very strong. Size standard for value.' },
    bluff: { hands: 'Gutshots (65, 43), backdoor flush draws, 98s', note: 'Bluffing is tough because villain has many Ax combos. Only bluff with hands that have some equity.' },
    freq: 5, tip: 'Check-raise rarely on A-high. Range disadvantage for BB means most of your range should check-call.',
  },
];

function XRaiseSizingGuide() {
  const [selected, setSelected] = useState(1);

  const tex = TEXTURES[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f472b6' }}>Check-Raise Sizing Guide</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {TEXTURES.map((t, i) => (
            <button key={t.name} onClick={() => setSelected(i)} style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: selected === i ? t.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{t.name}</button>
          ))}
        </div>

        <div style={{ textAlign: 'center', padding: 12, background: `${tex.color}08`, borderRadius: 10, border: `1px solid ${tex.color}20`, marginBottom: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: 4, marginBottom: 4 }}>{tex.example}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: tex.color }}>{tex.name} Board</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: tex.color }}>{tex.sizing}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Optimal X/R Size</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: tex.color }}>{tex.freq}%</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>X/R Frequency</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 12, background: 'rgba(16,185,129,0.06)', borderRadius: 8, borderLeft: '4px solid #10b981' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: 6 }}>Value X/R Hands</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{tex.value.hands}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{tex.value.note}</div>
          </div>
          <div style={{ padding: 12, background: 'rgba(239,68,68,0.06)', borderRadius: 8, borderLeft: '4px solid #ef4444' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Bluff X/R Hands</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{tex.bluff.hands}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{tex.bluff.note}</div>
          </div>
        </div>

        <div style={{ padding: 10, background: `${tex.color}08`, borderRadius: 8, border: `1px solid ${tex.color}15` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: tex.color, marginBottom: 4 }}>Key Tip</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{tex.tip}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>X-Raise Sizing Guide failed to load: {err.message}</div>;
  }
}

export default XRaiseSizingGuide;
