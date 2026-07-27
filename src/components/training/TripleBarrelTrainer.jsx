/**
 * TripleBarrelTrainer — Triple Barrel Strategy Guide
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * When and how to fire three streets of aggression.
 */
import React, { useState } from 'react';

const SCENARIOS = [
  {
    name: 'Nut Advantage',
    board: 'A♠ K♦ 7♣ → 3♠ → 2♥',
    hero: 'A♥ Q♣',
    line: 'Bet → Bet → Bet',
    sizing: ['33%', '50%', '66%'],
    verdict: 'Must Barrel',
    color: '#10b981',
    reason: 'You have nut advantage on AK7. Top pair strong kicker plays well over 3 streets. Villain\'s range is capped after calling twice — mostly Kx, medium pairs.',
    keys: ['Board favors your range heavily', 'Villain capped after 2 calls', 'Size up on river for max value'],
  },
  {
    name: 'Backdoor Turned Equity',
    board: 'T♠ 7♦ 3♣ → J♠ → Q♠',
    hero: 'A♠ 9♠',
    line: 'Bet → Bet → Shove',
    sizing: ['50%', '66%', 'All-in'],
    verdict: 'Great Barrel',
    color: '#3b82f6',
    reason: 'Backdoor flush draw gave equity on turn. River completes — now a monster. Turn barrel was semi-bluff, river is value. Perfect triple barrel.',
    keys: ['Backdoor equity justifies turn barrel', 'River completes your draw', 'Opponent can\'t have many flushes'],
  },
  {
    name: 'Brick Runout Bluff',
    board: 'K♥ Q♦ 5♠ → 8♣ → 2♦',
    hero: 'J♠ T♠',
    line: 'Bet → Bet → Bluff',
    sizing: ['33%', '50%', '75%'],
    verdict: 'Risky Barrel',
    color: '#f59e0b',
    reason: 'Open-ended on flop, bricked turn and river. Triple barrel bluff can work if villain has Ax with no pair, but you need to commit significant chips with zero equity.',
    keys: ['Blockers to QJ, KJ straights help', 'Must commit large river sizing', 'Only profitable vs disciplined opponents'],
  },
  {
    name: 'Wet Board Check Turn',
    board: 'J♥ T♥ 6♣ → K♥',
    hero: 'A♣ A♦',
    line: 'Bet → Check → ???',
    sizing: ['66%', '—', '—'],
    verdict: 'Stop Barreling',
    color: '#ef4444',
    reason: 'Turn brings flush completion + straight card. AA is now a bluff-catcher. Villain\'s continuing range crushes you. Check turn and evaluate river.',
    keys: ['Board got drastically worse for you', 'Villain\'s range improved massively', 'Overpairs become bluff-catchers on scary turns'],
  },
  {
    name: 'Overbet River Polarization',
    board: 'A♠ 8♦ 3♣ → 5♠ → 9♠',
    hero: '7♠ 6♠',
    line: 'Bet → Bet → Overbet',
    sizing: ['33%', '66%', '150%'],
    verdict: 'Polarized Barrel',
    color: '#8b5cf6',
    reason: 'Gutshot on flop, picked up flush draw on turn, hit flush on river. Overbet river — you have the nuts and need to maximize value from strong Ax hands.',
    keys: ['Had equity every street', 'River overbet is optimal with nuts', 'Polarized = either nuts or air'],
  },
];

function TripleBarrelTrainer() {
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const s = SCENARIOS[idx];

  const next = () => { setIdx((idx + 1) % SCENARIOS.length); setShowAnswer(false); };
  const prev = () => { setIdx((idx - 1 + SCENARIOS.length) % SCENARIOS.length); setShowAnswer(false); };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#f59e0b' }}>Triple Barrel Trainer</h3>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{idx + 1}/{SCENARIOS.length}</span>
        </div>

        <div style={{ padding: 14, background: 'rgba(245,158,11,0.06)', borderRadius: 10, border: '1px solid rgba(245,158,11,0.15)', marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: 2, marginBottom: 4 }}>{s.board}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', marginBottom: 2 }}>Hero: {s.hero}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Line: {s.line}</div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 12, justifyContent: 'center' }}>
          {s.sizing.map((sz, i) => (
            <div key={i} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: 'rgba(255,255,255,0.06)', color: sz === '—' ? 'rgba(255,255,255,0.3)' : '#fff',
            }}>
              {['Flop', 'Turn', 'River'][i]}: {sz}
            </div>
          ))}
        </div>

        {!showAnswer ? (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <button onClick={() => setShowAnswer(true)} style={{
              padding: '10px 24px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', background: '#f59e0b', color: '#000',
            }}>Should We Triple Barrel?</button>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <span style={{
                fontSize: 18, fontWeight: 900, color: s.color,
                padding: '4px 16px', borderRadius: 8, background: `${s.color}18`,
              }}>{s.verdict}</span>
            </div>
            <div style={{ padding: 10, background: `${s.color}08`, borderRadius: 8, border: `1px solid ${s.color}22`, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{s.reason}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {s.keys.map((k, i) => (
                <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', paddingLeft: 8, borderLeft: `2px solid ${s.color}44` }}>{k}</div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={prev} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontWeight: 600 }}>← Prev</button>
          <button onClick={next} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#f59e0b', color: '#000', fontSize: 12, fontWeight: 600 }}>Next →</button>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Triple Barrel Trainer failed: {err.message}</div>;
  }
}

export default TripleBarrelTrainer;
