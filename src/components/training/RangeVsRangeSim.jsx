/**
 * RangeVsRangeSim — Range vs Range Equity Simulator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Compare equity of common range vs range matchups.
 * Shows how ranges interact on different board textures.
 */
import React, { useState, useMemo } from 'react';

const MATCHUPS = [
  {
    name: 'BTN Open vs BB 3-Bet',
    range1: { label: 'BTN (35%)', color: '#3b82f6', hands: 'AA-22, AKs-A2s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s-T8s, 98s-97s, 87s-86s, 76s-75s, 65s, 54s, AKo-ATo, KQo-KTo, QJo-QTo, JTo' },
    range2: { label: 'BB 3-Bet (8%)', color: '#ef4444', hands: 'AA-TT, AKs-ATs, KQs, QJs, A5s-A4s, AKo-AJo, KQo' },
    boards: [
      { texture: 'A♠ K♦ 7♣', eq1: 38, eq2: 62, note: 'AK board — 3-bettor has massive range + nut advantage' },
      { texture: 'T♥ 6♣ 2♦', eq1: 47, eq2: 53, note: 'Low board — BTN catches up. 3-bettor still has overpairs' },
      { texture: 'J♠ T♠ 9♣', eq1: 49, eq2: 51, note: 'Connected board — BTN has more straights/two pairs' },
      { texture: '5♣ 4♣ 3♦', eq1: 52, eq2: 48, note: 'Low connected — BTN has suited connectors, 3-bettor whiffs' },
    ],
  },
  {
    name: 'CO Open vs BTN Flat',
    range1: { label: 'CO (22%)', color: '#10b981', hands: 'AA-22, AKs-A7s, A5s-A4s, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, 76s, AKo-ATo, KQo-KJo, QJo' },
    range2: { label: 'BTN Flat (18%)', color: '#f59e0b', hands: 'TT-22, AQs-A9s, A5s-A4s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s-T8s, 98s-97s, 87s-86s, 76s, 65s, AQo-AJo, KQo' },
    boards: [
      { texture: 'K♠ 8♦ 3♣', eq1: 53, eq2: 47, note: 'K-high dry — CO has more Kx combos, range advantage' },
      { texture: '9♥ 7♣ 5♦', eq1: 48, eq2: 52, note: 'Medium connected — BTN has more suited connectors' },
      { texture: 'A♠ Q♦ 2♣', eq1: 55, eq2: 45, note: 'AQ board — CO opened wider with Ax, has range advantage' },
      { texture: '6♣ 5♣ 4♣', eq1: 45, eq2: 55, note: 'Monotone low — BTN has suited connectors + flush draws' },
    ],
  },
  {
    name: 'SB vs BB (Limped)',
    range1: { label: 'SB Limp (50%)', color: '#e879f9', hands: 'Wide — nearly any two cards except strongest 3-bets' },
    range2: { label: 'BB Check (100%)', color: '#6b7280', hands: 'Random hand — entire range' },
    boards: [
      { texture: 'A♠ J♦ 5♣', eq1: 52, eq2: 48, note: 'SB slight edge — has more Ax combos in limp range' },
      { texture: '7♥ 6♣ 2♦', eq1: 50, eq2: 50, note: 'Low board — ranges overlap heavily, near coin flip' },
      { texture: 'K♠ K♦ 3♣', eq1: 50, eq2: 50, note: 'Paired board — both ranges have similar Kx frequency' },
      { texture: 'T♣ 9♣ 8♣', eq1: 50, eq2: 50, note: 'Wet board — both ranges have tons of draws, very even' },
    ],
  },
  {
    name: 'UTG Open vs MP Flat',
    range1: { label: 'UTG (14%)', color: '#ef4444', hands: 'AA-77, AKs-ATs, KQs-KJs, QJs, JTs, T9s, AKo-AJo, KQo' },
    range2: { label: 'MP Flat (10%)', color: '#3b82f6', hands: 'TT-66, AQs-ATs, KQs-KJs, QJs, JTs, T9s, AQo-AJo, KQo' },
    boards: [
      { texture: 'A♠ K♦ Q♣', eq1: 56, eq2: 44, note: 'Broadway board — UTG has more premium combos (AA, KK, AK)' },
      { texture: '8♥ 7♣ 3♦', eq1: 54, eq2: 46, note: 'Low board — UTG overpairs dominate. MP has some sets' },
      { texture: 'T♠ T♦ 5♣', eq1: 48, eq2: 52, note: 'Paired T — MP has more TT, T9s combos from flat range' },
      { texture: 'J♠ 9♣ 6♦', eq1: 53, eq2: 47, note: 'J-high — UTG has JJ, QQ+. Both have suited connectors' },
    ],
  },
];

function RangeVsRangeSim() {
  const [matchupIdx, setMatchupIdx] = useState(0);
  const [boardIdx, setBoardIdx] = useState(0);
  const matchup = MATCHUPS[matchupIdx];
  const board = matchup.boards[boardIdx];

  const switchMatchup = (i) => { setMatchupIdx(i); setBoardIdx(0); };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#06b6d4' }}>Range vs Range Equity</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {MATCHUPS.map((m, i) => (
            <button key={i} onClick={() => switchMatchup(i)} style={{
              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: matchupIdx === i ? '#06b6d4' : 'rgba(255,255,255,0.06)',
              color: matchupIdx === i ? '#000' : 'rgba(255,255,255,0.5)',
            }}>{m.name}</button>
          ))}
        </div>

        {/* Range display */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[matchup.range1, matchup.range2].map((r, i) => (
            <div key={i} style={{ padding: 10, background: `${r.color}11`, borderRadius: 8, border: `1px solid ${r.color}33` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: r.color, marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{r.hands}</div>
            </div>
          ))}
        </div>

        {/* Board selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {matchup.boards.map((b, i) => (
            <button key={i} onClick={() => setBoardIdx(i)} style={{
              flex: 1, padding: '6px 4px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: boardIdx === i ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
              color: '#fff', fontSize: 11, fontWeight: 600,
            }}>{b.texture}</button>
          ))}
        </div>

        {/* Equity bar */}
        <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 10, marginBottom: 12 }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: 3 }}>{board.texture}</span>
          </div>
          <div style={{ display: 'flex', height: 36, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${board.eq1}%`, background: matchup.range1.color, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.5s' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{board.eq1}%</span>
            </div>
            <div style={{ width: `${board.eq2}%`, background: matchup.range2.color, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.5s' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{board.eq2}%</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: matchup.range1.color }}>{matchup.range1.label}</span>
            <span style={{ fontSize: 11, color: matchup.range2.color }}>{matchup.range2.label}</span>
          </div>
        </div>

        <div style={{ padding: 10, background: 'rgba(6,182,212,0.06)', borderRadius: 8, border: '1px solid rgba(6,182,212,0.12)' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{board.note}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Range vs Range Sim failed to load: {err.message}</div>;
  }
}

export default RangeVsRangeSim;
