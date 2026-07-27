/**
 * PreFlopSimulator — GTO Wizard-Style Full Preflop Action Tree Simulator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Simulate complete preflop action sequences: open → 3-bet → 4-bet → 5-bet.
 * Shows decision trees, sizing recommendations, and range adjustments.
 */
import React, { useState, useMemo } from 'react';

const ACTION_TREES = [
  {
    id: 1, name: 'Single Raised Pot',
    sequence: ['UTG opens 2.5x', 'Folds to BB', 'BB defends'],
    positions: { opener: 'UTG', defender: 'BB' },
    openerRange: '~15% (AA-77, AKs-ATs, KQs-KTs, AKo-AJo, suited connectors)',
    defenderOptions: [
      { action: '3-Bet (12%)', hands: 'QQ+, AKs, AKo, A5s-A2s, 76s, 87s', sizing: '9-10bb', color: '#ef4444' },
      { action: 'Call (28%)', hands: 'JJ-22, AQs-A2s, KQs-K9s, QJs-Q9s, suited connectors, AQo-ATo', sizing: 'Flat 2.5bb', color: '#3b82f6' },
      { action: 'Fold (60%)', hands: 'Worst offsuit hands, low disconnected', sizing: '—', color: '#6b7280' },
    ],
    postflopNotes: 'UTG has tight range with overpairs and big cards. BB has wider range but position disadvantage.',
  },
  {
    id: 2, name: '3-Bet Pot',
    sequence: ['CO opens 2.5x', 'BTN 3-bets to 8x', 'CO decides'],
    positions: { opener: 'CO', defender: 'BTN' },
    openerRange: '~27% opening range from CO',
    defenderOptions: [
      { action: '4-Bet (6%)', hands: 'AA, KK, QQ, AKs, AKo, A5s (blocker)', sizing: '20-22bb', color: '#ef4444' },
      { action: 'Call (12%)', hands: 'JJ, TT, AQs, AQo, KQs, JTs, T9s, 98s', sizing: 'Flat 8bb', color: '#3b82f6' },
      { action: 'Fold (82%)', hands: 'Most of opening range — suited connectors, weak broadway, small pairs', sizing: '—', color: '#6b7280' },
    ],
    postflopNotes: 'BTN 3-bet range is polarized (value + bluffs). CO 4-bet range is very tight. Calling range plays well IP.',
  },
  {
    id: 3, name: '4-Bet Pot',
    sequence: ['BTN opens 2.5x', 'SB 3-bets to 10x', 'BTN 4-bets to 22x', 'SB decides'],
    positions: { opener: 'BTN', defender: 'SB' },
    openerRange: 'BTN 4-bet range: ~6% (AA, KK, QQ, AKs, AKo, A5s, 76s)',
    defenderOptions: [
      { action: '5-Bet All-in', hands: 'AA, KK (sometimes QQ, AKs)', sizing: 'Shove 100bb', color: '#ef4444' },
      { action: 'Call', hands: 'QQ, AKs, AKo (sometimes JJ)', sizing: 'Flat 22bb', color: '#3b82f6' },
      { action: 'Fold', hands: 'All 3-bet bluffs (A5s, 76s, etc.), TT, AQs', sizing: '—', color: '#6b7280' },
    ],
    postflopNotes: '4-bet pots are very high SPR. Both ranges are extremely narrow. Overpairs play simply — bet/bet/bet.',
  },
  {
    id: 4, name: 'Multiway Pot',
    sequence: ['MP opens 2.5x', 'CO calls', 'BTN calls', 'BB squeezes to 12x'],
    positions: { opener: 'MP', defender: 'BB' },
    openerRange: 'Multiway pot — all callers have capped ranges',
    defenderOptions: [
      { action: 'Squeeze (10%)', hands: 'QQ+, AKs, AKo, A5s-A3s, KJs, T9s', sizing: '12-14bb (4x + 1x per caller)', color: '#ef4444' },
      { action: 'Call (18%)', hands: 'JJ-22, AQs-ATs, KQs, suited connectors', sizing: 'Flat 2.5bb', color: '#3b82f6' },
      { action: 'Fold (72%)', hands: 'Weak hands — too many players, no position', sizing: '—', color: '#6b7280' },
    ],
    postflopNotes: 'Multiway pots reduce bluffing frequency dramatically. Play tighter, bet for value. Implied odds matter more.',
  },
  {
    id: 5, name: 'Limped Pot (HU)',
    sequence: ['SB limps', 'BB decides'],
    positions: { opener: 'SB', defender: 'BB' },
    openerRange: 'SB limp range: ~10-15% (weak suited, traps)',
    defenderOptions: [
      { action: 'Raise to 3.5x (40%)', hands: 'AA-77, AKs-A7s, KQs-KTs, AKo-ATo, broadway hands', sizing: '3.5bb', color: '#ef4444' },
      { action: 'Check (60%)', hands: 'Weak offsuit, suited junk, hands that play postflop', sizing: 'Check', color: '#3b82f6' },
    ],
    postflopNotes: 'SB limp range can contain traps (AA, KK at low frequency). Raise aggressively but be aware of limp-raises.',
  },
];

function PreFlopSimulator() {
  const [selectedId, setSelectedId] = useState(1);

  const tree = useMemo(() => ACTION_TREES.find(t => t.id === selectedId), [selectedId]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#e879f9' }}>Preflop Simulator</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {ACTION_TREES.map(t => (
            <button key={t.id} onClick={() => setSelectedId(t.id)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: selectedId === t.id ? '#e879f9' : 'rgba(255,255,255,0.06)',
              color: selectedId === t.id ? '#000' : 'rgba(255,255,255,0.7)', border: 'none',
            }}>{t.name}</button>
          ))}
        </div>

        {/* Action Sequence */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {tree.sequence.map((step, i) => (
            <React.Fragment key={i}>
              <div style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'rgba(232,121,249,0.1)', color: '#e879f9',
                border: '1px solid rgba(232,121,249,0.2)',
              }}>{step}</div>
              {i < tree.sequence.length - 1 && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>→</span>}
            </React.Fragment>
          ))}
        </div>

        {/* Opener Range */}
        <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 16, borderLeft: '3px solid #e879f9' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e879f9', marginBottom: 4 }}>Opening Range</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{tree.openerRange}</div>
        </div>

        {/* Decision Options */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Decision Point — {tree.positions.defender || tree.positions.opener}:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tree.defenderOptions.map((opt, i) => (
              <div key={i} style={{
                padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.03)',
                borderLeft: `4px solid ${opt.color}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: opt.color }}>{opt.action}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Size: {opt.sizing}</span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{opt.hands}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Frequency Pie */}
        <div style={{ display: 'flex', gap: 4, height: 20, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
          {tree.defenderOptions.map((opt, i) => {
            const pct = parseInt(opt.action.match(/\d+/)?.[0] || '33');
            return (
              <div key={i} style={{
                flex: pct, background: opt.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: '#fff',
              }}>{pct}%</div>
            );
          })}
        </div>

        {/* Postflop Notes */}
        <div style={{ padding: 10, background: 'rgba(232,121,249,0.06)', borderRadius: 8, border: '1px solid rgba(232,121,249,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e879f9', marginBottom: 4 }}>Postflop Notes</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{tree.postflopNotes}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Preflop Simulator failed to load: {err.message}</div>;
  }
}

export default PreFlopSimulator;
