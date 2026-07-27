/**
 * PotControlStrategy — When and How to Control Pot Size
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Interactive guide for pot control decisions with medium-strength hands.
 */
import React, { useState } from 'react';

const SPOTS = [
  {
    title: 'Overpair on Wet Board',
    hand: 'QQ on J♥ T♥ 5♣',
    action: 'Check Turn',
    color: '#f59e0b',
    category: 'Control',
    reasoning: 'QQ is strong but vulnerable. The board has straight and flush draws. If you bet flop and get called, checking turn controls the pot. You avoid building a huge pot where you\'re often behind on bad rivers.',
    doList: ['Bet flop for value + protection', 'Check back turn to control', 'Call reasonable river bets'],
    dontList: ['Don\'t 3-barrel into wet boards', 'Don\'t overplay one pair', 'Don\'t fold to single river bets'],
  },
  {
    title: 'Top Pair Weak Kicker',
    hand: 'A♣ 4♣ on A♠ 9♦ 3♣',
    action: 'Bet Small → Check',
    color: '#3b82f6',
    category: 'Control',
    reasoning: 'You have top pair but terrible kicker. Bet flop small to get value from worse (middle pairs, draws). Check turn because better aces have you dominated. Keep the pot small.',
    doList: ['Small flop c-bet for thin value', 'Check turn to keep pot manageable', 'Fold to large river aggression'],
    dontList: ['Don\'t fast-play weak top pair', 'Don\'t call 3 streets of aggression', 'Don\'t raise if check-raised'],
  },
  {
    title: 'Second Pair Good Board',
    hand: 'K♥ Q♥ on A♣ Q♦ 7♠',
    action: 'Check Flop',
    color: '#8b5cf6',
    category: 'Control',
    reasoning: 'Second pair on an ace-high board. Many hands that bet have you beat (Ax). Checking keeps the pot small. You can call a small bet but should avoid inflating the pot yourself.',
    doList: ['Check flop — you\'re not strong enough to bet', 'Call one small bet if villain bets', 'Consider folding to large multi-street aggression'],
    dontList: ['Don\'t lead into the preflop raiser', 'Don\'t call multiple large bets', 'Don\'t turn your hand into a bluff'],
  },
  {
    title: 'Set on Dry Board',
    hand: '7♠ 7♥ on K♣ 7♦ 2♠',
    action: 'Build the Pot!',
    color: '#10b981',
    category: 'No Control',
    reasoning: 'You have a SET on a dry board — DO NOT pot control! You want to build the biggest pot possible. Bet all three streets. Sets are too strong to slow-play on most textures.',
    doList: ['Bet flop, bet turn, bet river', 'Size up with each street', 'Consider check-raise if OOP'],
    dontList: ['Don\'t check back for deception', 'Don\'t worry about scaring opponents', 'Don\'t slow-play unless board is super dry'],
  },
  {
    title: 'Nut Flush Draw IP',
    hand: 'A♥ 8♥ on K♥ 5♥ 3♣',
    action: 'Call or Raise',
    color: '#e879f9',
    category: 'Semi-Aggro',
    reasoning: 'Nut flush draw has great equity (~35% vs top pair). In position, you can call to keep the pot controlled, or raise as a semi-bluff. Checking back is wasting equity — you have fold equity + draw equity.',
    doList: ['Call a bet to see turn cheaply', 'Raise as semi-bluff if you want fold equity', 'Bet if checked to — charge weaker draws'],
    dontList: ['Don\'t fold — you have massive equity', 'Don\'t check back with 9+ outs', 'Don\'t overbet as a semi-bluff on flop'],
  },
];

function PotControlStrategy() {
  const [selected, setSelected] = useState(0);
  const spot = SPOTS[selected];
  const catColors = { 'Control': '#f59e0b', 'No Control': '#10b981', 'Semi-Aggro': '#e879f9' };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f59e0b' }}>Pot Control Strategy</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {SPOTS.map((s, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: selected === i ? s.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>{s.title}</button>
          ))}
        </div>

        <div style={{ padding: 14, background: `${spot.color}11`, borderRadius: 10, border: `1px solid ${spot.color}33`, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: spot.color }}>{spot.title}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{spot.hand}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                background: `${catColors[spot.category]}22`, color: catColors[spot.category],
              }}>{spot.category}</span>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginTop: 2 }}>{spot.action}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{spot.reasoning}</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
          <div style={{ flex: 1, padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.12)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>Do</div>
            {spot.doList.map((d, i) => (
              <div key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 2, lineHeight: 1.5 }}>+ {d}</div>
            ))}
          </div>
          <div style={{ flex: 1, padding: 10, background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.12)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Don't</div>
            {spot.dontList.map((d, i) => (
              <div key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 2, lineHeight: 1.5 }}>- {d}</div>
            ))}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Pot Control Strategy failed: {err.message}</div>;
  }
}

export default PotControlStrategy;
