/**
 * FlopCBetMatrix — C-Bet Decision Matrix by Board Texture & Position
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Interactive matrix showing optimal c-bet strategy based on board type,
 * position, and whether heads-up or multiway.
 */
import React, { useState } from 'react';

const BOARD_TYPES = [
  { name: 'A-high dry', example: 'A♠ 7♦ 2♣', category: 'dry' },
  { name: 'K-high dry', example: 'K♣ 6♠ 3♦', category: 'dry' },
  { name: 'Mid connected', example: 'T♥ 9♣ 7♦', category: 'wet' },
  { name: 'Low connected', example: '8♣ 7♦ 5♠', category: 'wet' },
  { name: 'Monotone', example: 'J♠ 8♠ 3♠', category: 'wet' },
  { name: 'Paired', example: 'Q♣ Q♦ 5♠', category: 'dry' },
  { name: 'Rainbow high', example: 'K♥ J♣ 9♦', category: 'mid' },
  { name: 'Low dry', example: '6♣ 4♦ 2♠', category: 'dry' },
];

const STRATEGIES = {
  'IP-HU': {
    dry: { freq: 70, sizing: '33%', strategy: 'C-bet frequently with small sizing. Range advantage on high cards. Air + value both profitable.' },
    wet: { freq: 40, sizing: '67%', strategy: 'C-bet less but bigger. Need strong hands or draws. Air folds out less on connected boards.' },
    mid: { freq: 55, sizing: '50%', strategy: 'Medium frequency and sizing. Board is somewhat dynamic — choose hands with equity when called.' },
  },
  'IP-MW': {
    dry: { freq: 40, sizing: '50%', strategy: 'Reduce frequency multiway. Only bet strong top pairs+ and best draws. Too many players to bluff through.' },
    wet: { freq: 25, sizing: '67%', strategy: 'Very selective. Only bet strong made hands and nut draws. Bluffing into multiple players is burning money.' },
    mid: { freq: 30, sizing: '50%', strategy: 'Tight and strong. Multiway on connected boards = someone has something. Only continue with equity.' },
  },
  'OOP-HU': {
    dry: { freq: 55, sizing: '33%', strategy: 'Still profitable to c-bet frequently on dry boards even OOP. Small sizing lets you bet wide.' },
    wet: { freq: 30, sizing: '67%', strategy: 'Careful OOP on wet boards. IP villain can float and outplay you on later streets. Be selective.' },
    mid: { freq: 40, sizing: '50%', strategy: 'Moderate frequency. Being OOP is a disadvantage — choose hands that play well across multiple streets.' },
  },
  'OOP-MW': {
    dry: { freq: 30, sizing: '33%', strategy: 'Check more multiway OOP. Let the field act and then decide. Only bet strong value hands.' },
    wet: { freq: 15, sizing: '67%', strategy: 'Almost always check. OOP multiway on wet board = nightmare. Only bet the nuts or near-nuts.' },
    mid: { freq: 20, sizing: '50%', strategy: 'Very rarely c-bet. Check most of range and play defensively. This is the worst spot to c-bet.' },
  },
};

function FlopCBetMatrix() {
  const [position, setPosition] = useState('IP-HU');
  const [selectedBoard, setSelectedBoard] = useState(0);

  const board = BOARD_TYPES[selectedBoard];
  const strat = STRATEGIES[position][board.category];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#06b6d4' }}>Flop C-Bet Matrix</h3>

        {/* Position Selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {[
            { id: 'IP-HU', label: 'IP Heads-Up' },
            { id: 'IP-MW', label: 'IP Multiway' },
            { id: 'OOP-HU', label: 'OOP Heads-Up' },
            { id: 'OOP-MW', label: 'OOP Multiway' },
          ].map(p => (
            <button key={p.id} onClick={() => setPosition(p.id)} style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: position === p.id ? '#06b6d4' : 'rgba(255,255,255,0.06)',
              color: position === p.id ? '#000' : 'rgba(255,255,255,0.6)', border: 'none', flex: 1,
            }}>{p.label}</button>
          ))}
        </div>

        {/* Board Selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {BOARD_TYPES.map((b, i) => {
            const catColor = b.category === 'dry' ? '#3b82f6' : b.category === 'wet' ? '#ef4444' : '#f59e0b';
            return (
              <button key={b.name} onClick={() => setSelectedBoard(i)} style={{
                padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                background: selectedBoard === i ? catColor : 'rgba(255,255,255,0.06)',
                color: selectedBoard === i ? '#fff' : 'rgba(255,255,255,0.6)', border: 'none',
              }}>{b.name}</button>
            );
          })}
        </div>

        {/* Board Display */}
        <div style={{ textAlign: 'center', padding: 12, background: 'rgba(6,182,212,0.06)', borderRadius: 10, border: '1px solid rgba(6,182,212,0.15)', marginBottom: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: 4, marginBottom: 4 }}>{board.example}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{board.name} • {board.category.toUpperCase()}</div>
        </div>

        {/* Strategy */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: strat.freq > 50 ? '#10b981' : strat.freq > 30 ? '#f59e0b' : '#ef4444' }}>{strat.freq}%</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>C-Bet Frequency</div>
          </div>
          <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#06b6d4' }}>{strat.sizing}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Bet Sizing</div>
          </div>
          <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 8, marginTop: 10 }}>
              <div style={{ width: `${strat.freq}%`, height: '100%', background: strat.freq > 50 ? '#10b981' : strat.freq > 30 ? '#f59e0b' : '#ef4444', borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Frequency Bar</div>
          </div>
        </div>

        <div style={{ padding: 12, background: 'rgba(6,182,212,0.06)', borderRadius: 8, border: '1px solid rgba(6,182,212,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', marginBottom: 4 }}>Strategy: {position.replace('-', ' ')}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{strat.strategy}</div>
        </div>

        {/* Quick Matrix View */}
        <div style={{ marginTop: 16, fontSize: 11, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Quick Reference ({position.replace('-', ' ')})</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {['dry', 'mid', 'wet'].map(cat => {
            const s = STRATEGIES[position][cat];
            const color = cat === 'dry' ? '#3b82f6' : cat === 'wet' ? '#ef4444' : '#f59e0b';
            return (
              <div key={cat} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, textAlign: 'center', borderTop: `3px solid ${color}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 2 }}>{cat.toUpperCase()}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{s.freq}%</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{s.sizing}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>C-Bet Matrix failed to load: {err.message}</div>;
  }
}

export default FlopCBetMatrix;
