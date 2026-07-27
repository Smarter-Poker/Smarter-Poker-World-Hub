/**
 * BlindBattleGuide — SB vs BB Strategy Guide
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Comprehensive blind vs blind strategy for both SB and BB perspectives.
 */
import React, { useState } from 'react';

const SB_STRATS = [
  {
    title: 'SB Open — Raise or Fold',
    color: '#f59e0b',
    desc: 'From the SB, you should either raise or fold. Limping is sometimes used in advanced play but open-raising is the standard GTO approach.',
    range: '~50% of hands',
    sizing: '2.5-3x BB',
    hands: 'All pairs, most suited hands, broadways, suited connectors down to 54s, offsuit broadways',
  },
  {
    title: 'SB 3-Bet vs BTN',
    color: '#ef4444',
    desc: 'When the BTN opens, SB should 3-bet a polarized range: premiums + some bluffs. Flatting from SB is awkward — you\'re OOP with BB still to act.',
    range: '~10-12%',
    sizing: '3.5-4x open',
    hands: 'AA-TT, AKs-ATs, AKo-AJo, KQs, plus A5s-A2s as bluffs',
  },
  {
    title: 'SB vs BB 3-Bet',
    color: '#3b82f6',
    desc: 'When BB 3-bets your open, you\'re OOP. Tighten up significantly. 4-bet only premiums, fold most of your range.',
    range: '4-bet ~5%',
    sizing: '2.5x 3-bet',
    hands: 'AA, KK, QQ, AKs for value. A5s, A4s as bluffs.',
  },
];

const BB_STRATS = [
  {
    title: 'BB Defense vs SB',
    color: '#10b981',
    desc: 'BB gets the best price and closes the action. Defend very wide vs SB opens — you\'re getting great odds and SB range is wide.',
    range: '~65-70% of hands',
    sizing: 'Call or 3-bet',
    hands: 'All pairs, all suited hands, most broadways, suited connectors, suited gappers',
  },
  {
    title: 'BB 3-Bet vs SB',
    color: '#8b5cf6',
    desc: 'Mix 3-bets with strong value and strategic bluffs. SB will fold a lot since they\'re OOP.',
    range: '~18-22%',
    sizing: '3x open',
    hands: 'AA-88, AKs-A9s, AKo-ATo, KQs-KTs, suited connectors, plus low suited aces as bluffs',
  },
  {
    title: 'BB Check-Raise Flop',
    color: '#e879f9',
    desc: 'As the preflop caller OOP, check-raising is your main weapon for aggression. Use it with strong hands and draws.',
    range: 'Situational',
    sizing: '3-3.5x c-bet',
    hands: 'Sets, two pair, nut flush draws, open-enders with backdoors',
  },
];

function BlindBattleGuide() {
  const [perspective, setPerspective] = useState('sb');
  const strats = perspective === 'sb' ? SB_STRATS : BB_STRATS;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#e879f9' }}>Blind Battle Guide</h3>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setPerspective('sb')} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: perspective === 'sb' ? '#f59e0b' : 'rgba(255,255,255,0.06)',
            color: perspective === 'sb' ? '#000' : 'rgba(255,255,255,0.5)',
            fontSize: 13, fontWeight: 700,
          }}>Small Blind</button>
          <button onClick={() => setPerspective('bb')} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: perspective === 'bb' ? '#10b981' : 'rgba(255,255,255,0.06)',
            color: perspective === 'bb' ? '#000' : 'rgba(255,255,255,0.5)',
            fontSize: 13, fontWeight: 700,
          }}>Big Blind</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {strats.map((s, i) => (
            <div key={i} style={{ padding: 12, background: `${s.color}08`, borderRadius: 10, border: `1px solid ${s.color}22` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.title}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>{s.range}</span>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 6 }}>{s.desc}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                  Size: {s.sizing}
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>{s.hands}</div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Blind Battle Guide failed: {err.message}</div>;
  }
}

export default BlindBattleGuide;
