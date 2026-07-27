/**
 * SqueezeTrainer — GTO Wizard-Style Squeeze Play Strategy Trainer
 * ═══════════════════════════════════════════════════════════════════════════
 * Train optimal squeeze spots: identify when to squeeze, sizing, range
 * construction based on opener position, callers, and stack depth.
 */
import React, { useState, useMemo } from 'react';

const SQUEEZE_SPOTS = [
  {
    id: 1, name: 'BB vs CO Open + BTN Call',
    opener: 'CO', callers: ['BTN'], hero: 'BB', stackDepth: '100bb',
    squeezeFreq: 14, squeezeSize: '4x + 1x per caller = 5x',
    valueRange: 'QQ+, AKs, AKo',
    bluffRange: 'A5s-A2s, KJs, QTs, 76s, 87s',
    flatRange: 'JJ-22, AQs-ATs, KQs-KTs, QJs, JTs, T9s, 98s, 87s, AQo-AJo',
    foldRange: 'Weak offsuit, disconnected low cards',
    evGain: '+2.8 bb/100',
    reasoning: 'BTN cold-caller has capped range (would 3-bet premium). CO open wide. BB squeezes profitably with polarized range.',
    tips: ['BTN caller is capped — exploit this', 'Size larger with more callers', 'A5s-A2s are ideal bluffs (block AA, wheel potential)'],
  },
  {
    id: 2, name: 'SB vs UTG Open + MP Call',
    opener: 'UTG', callers: ['MP'], hero: 'SB', stackDepth: '100bb',
    squeezeFreq: 6, squeezeSize: '4.5x + 1x per caller = 5.5x',
    valueRange: 'KK+, AKs',
    bluffRange: 'A5s, A4s (very selective)',
    flatRange: 'Very narrow — QQ, JJ, AQs (trap some)',
    foldRange: 'Most of range',
    evGain: '+1.2 bb/100',
    reasoning: 'UTG range is very strong. MP caller also has decent range. SB should squeeze very tight — only premiums and minimal bluffs.',
    tips: ['Respect EP ranges', 'Only 6% squeeze frequency', 'QQ is often a flat here, not a squeeze'],
  },
  {
    id: 3, name: 'BB vs BTN Open + SB Call',
    opener: 'BTN', callers: ['SB'], hero: 'BB', stackDepth: '100bb',
    squeezeFreq: 18, squeezeSize: '4x + 1x = 5x',
    valueRange: 'TT+, AKs, AQs, AKo',
    bluffRange: 'A8s-A2s, K9s, Q9s, J9s, T9s, 98s, 87s, 76s, 65s',
    flatRange: '99-22, AJs-ATs, KQs-KTs, QJs-QTs, JTs, T9s, 98s, AQo-ATo, KQo',
    foldRange: 'Worst offsuit hands, disconnected',
    evGain: '+4.1 bb/100',
    reasoning: 'BTN opens very wide (42%). SB cold-call is capped. BB can squeeze wide and profitably — both opponents fold frequently.',
    tips: ['Widest squeeze spot in poker', 'Both opponents have capped ranges', 'Size to ~5x, larger if SB is sticky'],
  },
  {
    id: 4, name: 'CO vs EP Open + MP Call (MTT 30bb)',
    opener: 'EP', callers: ['MP'], hero: 'CO', stackDepth: '30bb',
    squeezeFreq: 8, squeezeSize: 'All-in (30bb)',
    valueRange: 'QQ+, AKs, AKo',
    bluffRange: 'ATs, A5s, KQs (blockers)',
    flatRange: 'Never — squeeze or fold at 30bb',
    foldRange: 'Everything else',
    evGain: '+3.5 bb/100',
    reasoning: 'At 30bb in MTT, squeeze = shove. No flat calling. ICM pressure makes opponents fold wider. Pure push/fold squeeze.',
    tips: ['30bb squeeze = all-in only', 'No flatting at this depth', 'ICM amplifies fold equity', 'ATs/KQs are blocker shoves'],
  },
  {
    id: 5, name: 'BTN vs CO Open + 2 Callers',
    opener: 'CO', callers: ['HJ', 'MP'], hero: 'BTN', stackDepth: '100bb',
    squeezeFreq: 10, squeezeSize: '4x + 2x (callers) = 6x',
    valueRange: 'JJ+, AKs, AQs, AKo',
    bluffRange: 'A5s-A3s, KTs, QJs, T9s',
    flatRange: 'TT-77, AJs-ATs, KQs-KJs, QTs, JTs, 98s',
    foldRange: 'Weak holdings',
    evGain: '+3.2 bb/100',
    reasoning: 'Multi-way pots are very profitable squeeze spots. Multiple callers = more dead money. Size up significantly. Callers fold frequently facing squeeze.',
    tips: ['More callers = bigger size', 'Dead money makes bluffs profitable', 'Wider value range than vs single caller', 'Position advantage post-flop if called'],
  },
];

function SqueezeTrainer() {
  const [selectedId, setSelectedId] = useState(1);
  const [showRanges, setShowRanges] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [guess, setGuess] = useState(null);

  const spot = useMemo(() => SQUEEZE_SPOTS.find(s => s.id === selectedId), [selectedId]);

  const freqBrackets = ['< 5%', '5-10%', '10-15%', '15-20%', '> 20%'];
  const getCorrectBracket = (freq) => {
    if (freq < 5) return '< 5%';
    if (freq < 10) return '5-10%';
    if (freq < 15) return '10-15%';
    if (freq < 20) return '15-20%';
    return '> 20%';
  };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#7c3aed' }}>Squeeze Trainer</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
              <input type="checkbox" checked={quizMode} onChange={e => { setQuizMode(e.target.checked); setGuess(null); }} style={{ accentColor: '#7c3aed' }} />Quiz
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showRanges} onChange={e => setShowRanges(e.target.checked)} style={{ accentColor: '#7c3aed' }} />Ranges
            </label>
          </div>
        </div>

        {/* Spot Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {SQUEEZE_SPOTS.map(s => (
            <button key={s.id} onClick={() => { setSelectedId(s.id); setGuess(null); }} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: selectedId === s.id ? '#7c3aed' : 'rgba(255,255,255,0.06)',
              color: selectedId === s.id ? '#fff' : 'rgba(255,255,255,0.7)', border: 'none',
            }}>{s.name}</button>
          ))}
        </div>

        {/* Spot Header */}
        <div style={{ padding: 14, background: 'rgba(124,58,237,0.06)', borderRadius: 10, border: '1px solid rgba(124,58,237,0.15)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed' }}>{spot.name}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{spot.stackDepth}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            <span>Opener: <span style={{ color: '#fff', fontWeight: 600 }}>{spot.opener}</span></span>
            <span>Callers: <span style={{ color: '#fff', fontWeight: 600 }}>{spot.callers.join(', ')}</span></span>
            <span>Hero: <span style={{ color: '#7c3aed', fontWeight: 600 }}>{spot.hero}</span></span>
          </div>
        </div>

        {/* Quiz Mode */}
        {quizMode && !guess && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 10, textAlign: 'center' }}>
              What is the optimal squeeze frequency?
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {freqBrackets.map(b => (
                <button key={b} onClick={() => setGuess(b)} style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', background: 'rgba(124,58,237,0.1)', color: '#7c3aed',
                }}>{b}</button>
              ))}
            </div>
          </div>
        )}

        {quizMode && guess && (
          <div style={{
            padding: 10, borderRadius: 8, marginBottom: 12, textAlign: 'center',
            background: guess === getCorrectBracket(spot.squeezeFreq) ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${guess === getCorrectBracket(spot.squeezeFreq) ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: guess === getCorrectBracket(spot.squeezeFreq) ? '#10b981' : '#ef4444' }}>
              {guess === getCorrectBracket(spot.squeezeFreq) ? '✓ Correct!': `✕ Answer: ${spot.squeezeFreq}%`}
            </span>
          </div>
        )}

        {/* Stats */}
        {(!quizMode || guess) && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#7c3aed' }}>{spot.squeezeFreq}%</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Squeeze Freq</div>
              </div>
              <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{spot.squeezeSize}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Sizing</div>
              </div>
              <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>{spot.evGain}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV Gain</div>
              </div>
            </div>

            {/* Strategy */}
            <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>Strategy</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{spot.reasoning}</div>
            </div>

            {/* Tips */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: showRanges ? 12 : 0 }}>
              {spot.tips.map((tip, i) => (
                <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', paddingLeft: 12, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: '#7c3aed' }}>•</span>{tip}
                </div>
              ))}
            </div>

            {/* Ranges */}
            {showRanges && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'Value Squeeze', range: spot.valueRange, color: '#10b981' },
                  { label: 'Bluff Squeeze', range: spot.bluffRange, color: '#f59e0b' },
                  { label: 'Flat Call', range: spot.flatRange, color: '#3b82f6' },
                  { label: 'Fold', range: spot.foldRange, color: '#ef4444' },
                ].map(r => (
                  <div key={r.label} style={{ padding: 8, background: 'rgba(255,255,255,0.02)', borderRadius: 6, borderLeft: `3px solid ${r.color}` }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: r.color }}>{r.label}: </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{r.range}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Squeeze Trainer failed to load: {err.message}</div>;
  }
}

export default SqueezeTrainer;
