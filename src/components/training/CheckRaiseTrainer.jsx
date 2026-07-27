/**
 * CheckRaiseTrainer — GTO Wizard-Style Check-Raise Strategy Trainer
 * ═══════════════════════════════════════════════════════════════════════════
 * Train optimal check-raise spots: frequencies, sizing, range construction.
 * Covers flop, turn, and river check-raises with different board textures.
 */
import React, { useState, useMemo } from 'react';

const SPOTS = [
  {
    id: 1, street: 'Flop', board: 'T♥ 7♠ 4♦', position: 'BB vs BTN', villainBet: '33%',
    xrFreq: 12, optimalSize: '3x', evGain: '+2.1 bb/100',
    valueRange: 'Sets (TT, 77, 44), Two pair (T7), Strong draws (98s, 65s)',
    bluffRange: 'Gutshots (86s, 53s), Backdoor flush draws, A5s-A3s',
    checkCallRange: 'Top pair weak kicker, middle pair, 8x pairs',
    strategy: 'Low frequency check-raise on dry board. Focus on sets and strong draws for value, gutshots with backdoor equity as bluffs.',
    tips: ['Keep x/r frequency around 10-15% on dry boards', 'Use 3x sizing to deny equity', 'Bluffs should have backup equity'],
  },
  {
    id: 2, street: 'Flop', board: 'J♣ 9♣ 5♥', position: 'BB vs CO', villainBet: '67%',
    xrFreq: 18, optimalSize: '2.5x', evGain: '+3.8 bb/100',
    valueRange: 'Sets, Two pair (J9s), Flush draws with pair (Jxcc), Combo draws (T8cc)',
    bluffRange: 'Flush draws without pair (A♣K♣, Q♣8♣), Open-enders (T8, 87)',
    checkCallRange: 'Top pair good kicker, flush draws with overcards, 99-66',
    strategy: 'Higher x/r frequency on wet board vs larger sizing. Many draws want to build pot. Combo draws are premium x/r candidates.',
    tips: ['Increase x/r frequency on wet textures', 'Combo draws are ideal x/r bluffs', 'Mix strongest flush draws between call and raise'],
  },
  {
    id: 3, street: 'Turn', board: 'K♠ 8♦ 3♣ 6♠', position: 'BB vs BTN', villainBet: '67%',
    xrFreq: 8, optimalSize: '2.5x', evGain: '+1.5 bb/100',
    valueRange: 'Sets, two pair, turned flush draws with pair (K♠x♠)',
    bluffRange: 'Spade flush draws (A♠x♠), straight draws (75, 97)',
    checkCallRange: 'Kx top pair, pocket pairs 99-QQ',
    strategy: 'Turn check-raises are less frequent but very powerful. Strong range when 6 completes some draws. Spade draws added as new bluff candidates.',
    tips: ['Turn x/r frequency should be 6-10%', 'Bluffs need river equity', 'Sizing should commit or nearly commit stacks'],
  },
  {
    id: 4, street: 'River', board: 'Q♥ 9♠ 5♦ 2♣ 7♥', position: 'BB vs BTN', villainBet: '75%',
    xrFreq: 6, optimalSize: '2.2x', evGain: '+4.2 bb/100',
    valueRange: 'Straights (86, T8), sets, rivered two pair (Q7, 97)',
    bluffRange: 'Missed flush draws (hearts), busted straight draws, Ax no pair',
    checkCallRange: 'Queens with decent kicker, 99, overpairs',
    strategy: 'River check-raises are polarized: nuts or air. The 7 completes some straights for BB. Use missed draws as bluffs at MDF-exploiting frequency.',
    tips: ['River x/r is purely polarized', 'Calculate MDF for villain', 'Only bluff with hands that block villain calls'],
  },
  {
    id: 5, street: 'Flop', board: 'A♥ K♦ 8♠', position: 'BB vs UTG', villainBet: '33%',
    xrFreq: 5, optimalSize: '4x', evGain: '+0.8 bb/100',
    valueRange: 'Sets (AA, KK, 88), AK two pair',
    bluffRange: 'QJ gutshot, T9 backdoor, suited connectors with BDFD',
    checkCallRange: 'Ax weak kicker, Kx hands, pocket pairs',
    strategy: 'Very low x/r frequency vs UTG on AK board. UTG range crushes this board. Only raise the absolute nuts and minimal bluffs.',
    tips: ['Respect UTG range on broadway boards', 'Keep x/r below 6% vs EP openers', 'Larger sizing (4x) to maximize value from narrow range'],
  },
];

function CheckRaiseTrainer() {
  const [selectedId, setSelectedId] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [userGuess, setUserGuess] = useState(null);

  const spot = useMemo(() => SPOTS.find(s => s.id === selectedId), [selectedId]);

  const handleGuess = (guess) => {
    setUserGuess(guess);
  };

  const freqBucket = (freq) => {
    if (freq <= 6) return 'Rarely';
    if (freq <= 12) return 'Sometimes';
    if (freq <= 18) return 'Often';
    return 'Frequently';
  };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#14b8a6' }}>Check-Raise Trainer</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
            <input type="checkbox" checked={quizMode} onChange={e => { setQuizMode(e.target.checked); setUserGuess(null); }} style={{ accentColor: '#14b8a6' }} />
            Quiz Mode
          </label>
        </div>

        {/* Spot Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {SPOTS.map(s => (
            <button key={s.id} onClick={() => { setSelectedId(s.id); setShowDetails(false); setUserGuess(null); }}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: selectedId === s.id ? '#14b8a6' : 'rgba(255,255,255,0.06)',
                color: selectedId === s.id ? '#000' : 'rgba(255,255,255,0.7)', border: 'none',
              }}>{spot.id === s.id ? '▸ ' : ''}{s.street}: {s.board.slice(0, 8)}...</button>
          ))}
        </div>

        {/* Board + Spot Info */}
        <div style={{ padding: 16, background: 'rgba(20,184,166,0.06)', borderRadius: 10, border: '1px solid rgba(20,184,166,0.15)', marginBottom: 16 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', letterSpacing: 4, marginBottom: 8, textAlign: 'center' }}>{spot.board}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            <span>{spot.street}</span>
            <span>{spot.position}</span>
            <span>Villain bets {spot.villainBet}</span>
            <span>Sizing: <span style={{ color: '#14b8a6', fontWeight: 700 }}>{spot.optimalSize}</span></span>
          </div>
        </div>

        {/* Quiz Mode */}
        {quizMode && !userGuess && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 10, textAlign: 'center' }}>
              How often should you check-raise here?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {['Rarely', 'Sometimes', 'Often', 'Frequently'].map(g => (
                <button key={g} onClick={() => handleGuess(g)} style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', background: 'rgba(20,184,166,0.1)', color: '#14b8a6',
                }}>{g}</button>
              ))}
            </div>
          </div>
        )}

        {quizMode && userGuess && (
          <div style={{
            padding: 12, borderRadius: 8, marginBottom: 16, textAlign: 'center',
            background: userGuess === freqBucket(spot.xrFreq) ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${userGuess === freqBucket(spot.xrFreq) ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: userGuess === freqBucket(spot.xrFreq) ? '#10b981' : '#ef4444' }}>
              {userGuess === freqBucket(spot.xrFreq) ? '✓ Correct!': `✕ Wrong — Answer: ${freqBucket(spot.xrFreq)}`}
            </span>
            <span style={{ marginLeft: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>X/R frequency: {spot.xrFreq}%</span>
          </div>
        )}

        {/* Frequency Gauge */}
        {(!quizMode || userGuess) && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Check-Raise Frequency</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#14b8a6' }}>{spot.xrFreq}% ({freqBucket(spot.xrFreq)})</span>
              </div>
              <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
                <div style={{ height: '100%', width: `${Math.min(spot.xrFreq * 3, 100)}%`, background: 'linear-gradient(90deg, #14b8a6, #2dd4bf)', borderRadius: 5 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                <span>0%</span><span>10%</span><span>20%</span><span>30%+</span>
              </div>
            </div>

            {/* Range Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Value Range', range: spot.valueRange, color: '#10b981' },
                { label: 'Bluff Range', range: spot.bluffRange, color: '#f59e0b' },
                { label: 'Check-Call Range', range: spot.checkCallRange, color: '#3b82f6' },
              ].map(r => (
                <div key={r.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `3px solid ${r.color}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: r.color, marginBottom: 4 }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{r.range}</div>
                </div>
              ))}
            </div>

            {/* Strategy + Tips */}
            <div style={{ padding: 12, background: 'rgba(20,184,166,0.06)', borderRadius: 8, border: '1px solid rgba(20,184,166,0.12)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#14b8a6', marginBottom: 6 }}>Strategy — EV: {spot.evGain}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, marginBottom: 8 }}>{spot.strategy}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {spot.tips.map((tip, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', paddingLeft: 12, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, color: '#14b8a6' }}>•</span>
                    {tip}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Check-Raise Trainer failed to load: {err.message}</div>;
  }
}

export default CheckRaiseTrainer;
