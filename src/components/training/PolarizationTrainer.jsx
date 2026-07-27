/**
 * PolarizationTrainer — GTO Wizard-Style Range Polarization Trainer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Understand and practice polarized vs merged vs linear betting strategies.
 * Visual range breakdowns showing value, bluff, and check portions.
 */
import React, { useState, useMemo } from 'react';

const STRATEGIES = [
  {
    id: 1, name: 'Polarized River Bet',
    board: 'K♥ 9♠ 4♦ 2♣ 7♥',
    position: 'IP vs BB', sizing: '75% pot',
    valueRange: { pct: 35, hands: 'Sets (KK, 99, 44), Two pair (K9, K7), Rivered hands (97)' },
    bluffRange: { pct: 18, hands: 'Missed flush draws (hearts), busted gutshots, A-high no pair' },
    checkRange: { pct: 47, hands: 'One pair kings, medium pairs (QQ, JJ), weak pairs' },
    explanation: 'River betting should be polarized: strong hands for value and weak hands as bluffs. Middle-strength hands check to realize their showdown value.',
    mdf: 57,
    optimalRatio: '2:1 value to bluff at 75% pot',
    tips: ['Never bet medium-strength hands on river', 'Bluff frequency = pot odds villain gets', 'At 75% pot, need ~35% bluffs in betting range'],
  },
  {
    id: 2, name: 'Merged Flop C-Bet',
    board: 'A♠ 7♦ 2♣',
    position: 'BTN vs BB', sizing: '33% pot',
    valueRange: { pct: 55, hands: 'Top pair+, all Ax, medium pairs (88-QQ)' },
    bluffRange: { pct: 10, hands: 'Backdoor draws, gutshots' },
    checkRange: { pct: 35, hands: 'Small pocket pairs, weak suited connectors, air' },
    explanation: 'Small c-bet on dry board uses a merged strategy: bet wide with any piece + some air. Not polarized — medium hands are included in the betting range.',
    mdf: 75,
    optimalRatio: '5:1 value to bluff at 33% pot',
    tips: ['Small sizing = merged strategy', 'Include medium-strength hands in bet range', 'Villain must defend very wide (75%) vs 33%', 'Dry boards favor small merged c-bets'],
  },
  {
    id: 3, name: 'Linear 3-Bet Range',
    board: 'Preflop',
    position: 'CO vs UTG Open', sizing: '3x',
    valueRange: { pct: 70, hands: 'QQ+, AKs, AKo, AQs — hands that dominate opener' },
    bluffRange: { pct: 0, hands: 'None — linear range has no bluffs' },
    checkRange: { pct: 30, hands: 'Flat: JJ, TT, AQo, AJs, KQs, suited connectors' },
    explanation: 'Linear 3-bet range uses only hands that are ahead of villain\'s calling range. No bluffs. Used vs strong openers where bluffs have low EV.',
    mdf: 0,
    optimalRatio: 'Pure value — no bluffs needed',
    tips: ['Linear = all value, no bluffs', 'Use vs EP openers with tight ranges', 'Every hand in 3-bet range is ahead of calling range', 'Contrast with polarized 3-bet from BTN'],
  },
  {
    id: 4, name: 'Polarized 3-Bet (BTN vs CO)',
    board: 'Preflop',
    position: 'BTN vs CO Open', sizing: '3x',
    valueRange: { pct: 40, hands: 'QQ+, AKs, AKo — premium value' },
    bluffRange: { pct: 25, hands: 'A5s-A2s, K9s, Q9s, 76s, 87s, 98s — blockers + playability' },
    checkRange: { pct: 35, hands: 'Flat: JJ-88, AQs-ATs, KQs-KTs, QJs, JTs, suited connectors' },
    explanation: 'Polarized 3-bet splits range into strong value and playable bluffs. Medium hands flat to keep range balance. Bluffs chosen for blockers and postflop playability.',
    mdf: 0,
    optimalRatio: '~1.6:1 value to bluff',
    tips: ['Polarized = value hands + bluffs, no middling', 'A5s-A2s block AA (best blocker bluffs)', 'Suited connectors have postflop playability', 'Middling hands (AJs, KQs) flat to keep balanced call range'],
  },
  {
    id: 5, name: 'Turn Overbet (Polarized)',
    board: 'Q♣ 8♦ 3♠ A♥',
    position: 'IP vs BB', sizing: '150% pot',
    valueRange: { pct: 25, hands: 'AA (trips), AQ (two pair), sets, turned nut straight (if available)' },
    bluffRange: { pct: 15, hands: 'Club flush draws, missed gutshots with ace blocker, KT' },
    checkRange: { pct: 60, hands: 'Qx one pair, medium pairs, weak Ax, draws without equity' },
    explanation: 'Turn overbet is extremely polarized. Only nut hands bet and only hands with equity + blocker value bluff. 60% of range checks — overbetting isn\'t high frequency.',
    mdf: 40,
    optimalRatio: '~1.7:1 value to bluff at 150%',
    tips: ['Overbets are the most polarized strategy', 'Check 60% of range — only bet nuts/air', 'Villain only defends ~40% vs 1.5x pot', 'Bluffs need ace blocker or strong draws'],
  },
];

function RangeBar({ value, bluff, check }) {
  return (
    <div style={{ height: 28, borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 4 }}>
      <div style={{ width: `${value}%`, background: 'linear-gradient(90deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
        {value > 10 ? `Value ${value}%` : ''}
      </div>
      <div style={{ width: `${bluff}%`, background: 'linear-gradient(90deg, #ef4444, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
        {bluff > 8 ? `Bluff ${bluff}%` : ''}
      </div>
      <div style={{ width: `${check}%`, background: 'linear-gradient(90deg, #6b7280, #4b5563)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
        {check > 10 ? `Check ${check}%` : ''}
      </div>
    </div>
  );
}

function PolarizationTrainer() {
  const [selectedId, setSelectedId] = useState(1);

  const strat = useMemo(() => STRATEGIES.find(s => s.id === selectedId), [selectedId]);

  const isPolarized = strat.bluffRange.pct > 0 && strat.checkRange.pct > 20;
  const stratType = strat.bluffRange.pct === 0 ? 'Linear' : isPolarized ? 'Polarized' : 'Merged';

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#6366f1' }}>Polarization Trainer</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {STRATEGIES.map(s => (
            <button key={s.id} onClick={() => setSelectedId(s.id)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: selectedId === s.id ? '#6366f1' : 'rgba(255,255,255,0.06)',
              color: selectedId === s.id ? '#fff' : 'rgba(255,255,255,0.7)', border: 'none',
            }}>{s.name}</button>
          ))}
        </div>

        {/* Header */}
        <div style={{ padding: 14, background: 'rgba(99,102,241,0.06)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.15)', marginBottom: 16, textAlign: 'center' }}>
          {strat.board !== 'Preflop' && (
            <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: 5, marginBottom: 6 }}>{strat.board}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            <span>{strat.position}</span>
            <span>Sizing: {strat.sizing}</span>
            <span style={{ color: '#6366f1', fontWeight: 700 }}>{stratType} Strategy</span>
          </div>
        </div>

        {/* Range Bar */}
        <RangeBar value={strat.valueRange.pct} bluff={strat.bluffRange.pct} check={strat.checkRange.pct} />

        {/* Range Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Value Range', pct: strat.valueRange.pct, hands: strat.valueRange.hands, color: '#10b981' },
            { label: 'Bluff Range', pct: strat.bluffRange.pct, hands: strat.bluffRange.hands, color: '#ef4444' },
            { label: 'Check/Call Range', pct: strat.checkRange.pct, hands: strat.checkRange.hands, color: '#6b7280' },
          ].map(r => (
            <div key={r.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `3px solid ${r.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{r.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{r.pct}%</span>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{r.hands}</div>
            </div>
          ))}
        </div>

        {/* Explanation */}
        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{strat.explanation}</div>
        </div>

        {/* MDF + Ratio */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          {strat.mdf > 0 && (
            <div style={{ flex: 1, padding: 10, background: 'rgba(99,102,241,0.06)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#6366f1' }}>{strat.mdf}%</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Villain MDF</div>
            </div>
          )}
          <div style={{ flex: 1, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{strat.optimalRatio}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Optimal V:B Ratio</div>
          </div>
        </div>

        {/* Tips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {strat.tips.map((tip, i) => (
            <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', paddingLeft: 12, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: '#6366f1' }}>•</span>{tip}
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Polarization Trainer failed to load: {err.message}</div>;
  }
}

export default PolarizationTrainer;
