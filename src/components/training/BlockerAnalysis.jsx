/**
 * BlockerAnalysis — GTO Wizard-Style Blocker Effect Visualizer
 * ═══════════════════════════════════════════════════════════════════════════
 * Visualize how blockers affect range composition, bluff candidacy,
 * and call/fold decisions. Shows removal effects on combos.
 */
import React, { useState, useMemo } from 'react';

const SCENARIOS = [
  {
    id: 1, name: 'River Bluff — Ace Blocker',
    board: 'K♥ T♠ 7♦ 3♣ 2♥',
    heroHand: 'A♠ 5♠',
    situation: 'Hero missed flush draw on river. Should hero bluff?',
    blockerEffect: {
      blocks: ['AK (6→3 combos)', 'AT (6→3 combos)', 'AA (6→3 combos)'],
      unblocks: ['KT, KQ, KJ (full combos)', 'TT, 77 (full combos)'],
    },
    verdict: 'GOOD BLUFF',
    verdictColor: '#10b981',
    analysis: 'A♠ blocks villain\'s top value hands (AK, AT, AA) reducing their calling range by ~12 combos. Doesn\'t block KT/KJ/KQ which villain folds. Excellent bluff candidate.',
    removalImpact: '+8.2% fold equity',
    tips: ['Blocking villain value range = good bluff', 'A♠ is a premium blocker on K-high board', 'Missed flush draws with ace blockers are ideal bluffs'],
  },
  {
    id: 2, name: 'River Call — Flush Blocker',
    board: 'Q♣ 9♣ 4♦ 7♣ J♠',
    heroHand: 'Q♥ T♣',
    situation: 'Villain bets river. Hero has top pair + club blocker.',
    blockerEffect: {
      blocks: ['Club flushes (T♣ removes ~8 flush combos)', 'QT straight draws'],
      unblocks: ['Sets (QQ, 99, 44)', 'Two pair (Q9, Q7, J9)'],
    },
    verdict: 'GOOD CALL',
    verdictColor: '#3b82f6',
    analysis: 'T♣ removes ~8 flush combos from villain range. Since flushes are the main value hands, this significantly reduces the probability villain has a flush. Good call with top pair.',
    removalImpact: '-14% flush combos in villain range',
    tips: ['Blocking villain\'s value range = call more', 'Single club blocker removes significant flush combos', 'Unblocking bluffs (non-club hands) is also favorable'],
  },
  {
    id: 3, name: 'River Bluff — Bad Blockers',
    board: 'A♠ K♦ 8♣ 3♥ 5♠',
    heroHand: '6♠ 4♠',
    situation: 'Hero has busted spade draw. Should hero bluff?',
    blockerEffect: {
      blocks: ['65s (irrelevant)', 'A6/A5/A4 — blocks some weak Ax villain FOLDS'],
      unblocks: ['AK, AA, KK (full combos — villain CALLS)', 'A8, K8 (full combos)'],
    },
    verdict: 'BAD BLUFF',
    verdictColor: '#ef4444',
    analysis: '64s blocks hands villain would fold anyway (weak Ax) but doesn\'t block the value hands villain calls with (AK, AA, KK). Terrible blocker configuration for a bluff.',
    removalImpact: '-3% fold equity (negative impact)',
    tips: ['Blocking villain fold range = bad bluff', 'Want to block calls, not folds', '64s has worst possible blockers on AK8 board'],
  },
  {
    id: 4, name: 'River Call — Straight Blocker',
    board: 'J♥ T♥ 4♦ 9♠ 8♣',
    heroHand: 'Q♠ Q♦',
    situation: 'Villain overbets river. Hero has QQ. Four-to-a-straight board.',
    blockerEffect: {
      blocks: ['QJ straight (Q blocks half of Q7 combos)', 'Q8 combos'],
      unblocks: ['76 (all 16 combos — nutted straight)', 'KQ (all combos — nut straight)', 'J8, T8 (two pair)'],
    },
    verdict: 'BAD CALL',
    verdictColor: '#ef4444',
    analysis: 'QQ doesn\'t block the nut straights (76, KQ still have full combos). Q blocks some QJ but not the main value hands. Facing overbet on 4-straight board, QQ is a fold.',
    removalImpact: '+2% call equity (insufficient)',
    tips: ['Need to block nut straights to call overbet', 'Q doesn\'t effectively block 76 or KQ', 'Overpair without straight blocker = fold on 4-straight boards'],
  },
  {
    id: 5, name: 'Preflop 4-Bet Bluff — Blockers',
    board: 'Preflop',
    heroHand: 'A♣ 5♣',
    situation: 'Villain 3-bets. Should hero 4-bet bluff with A5s?',
    blockerEffect: {
      blocks: ['AA (6→3 combos)', 'AK (16→8 combos)', 'AQ (16→8 combos)'],
      unblocks: ['KK, QQ, JJ (full combos)'],
    },
    verdict: 'GREAT 4-BET BLUFF',
    verdictColor: '#10b981',
    analysis: 'A♣ removes half of AA, AK, AQ combos from villain\'s 5-bet and call range. This drastically reduces the chance villain continues. A5s also has wheel potential if called.',
    removalImpact: '+12% fold equity vs 3-bet range',
    tips: ['Ax suited = best 4-bet bluff hands', 'Blocks AA/AK which 5-bet', 'Retains playability if called (wheel, flush)', 'A5s > A9s for 4-bet bluff (straight potential)'],
  },
];

function BlockerAnalysis() {
  const [selectedId, setSelectedId] = useState(1);

  const scenario = useMemo(() => SCENARIOS.find(s => s.id === selectedId), [selectedId]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#d946ef' }}>Blocker Analysis</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {SCENARIOS.map(s => (
            <button key={s.id} onClick={() => setSelectedId(s.id)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: selectedId === s.id ? '#d946ef' : 'rgba(255,255,255,0.06)',
              color: selectedId === s.id ? '#fff' : 'rgba(255,255,255,0.7)', border: 'none',
            }}>{s.name}</button>
          ))}
        </div>

        {/* Board + Hand */}
        <div style={{ textAlign: 'center', padding: 16, background: 'rgba(217,70,239,0.06)', borderRadius: 10, border: '1px solid rgba(217,70,239,0.15)', marginBottom: 16 }}>
          {scenario.board !== 'Preflop' && (
            <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: 5, marginBottom: 6 }}>{scenario.board}</div>
          )}
          <div style={{ fontSize: 20, fontWeight: 700, color: '#d946ef', marginBottom: 6 }}>Hero: {scenario.heroHand}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{scenario.situation}</div>
        </div>

        {/* Verdict */}
        <div style={{
          padding: 12, borderRadius: 8, marginBottom: 16, textAlign: 'center',
          background: `${scenario.verdictColor}15`,
          border: `1px solid ${scenario.verdictColor}40`,
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: scenario.verdictColor }}>{scenario.verdict}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Removal Impact: <span style={{ fontWeight: 700, color: scenario.verdictColor }}>{scenario.removalImpact}</span></div>
        </div>

        {/* Blocker Effects */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ padding: 12, background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.12)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: 8 }}>Blocks (Removes)</div>
            {scenario.blockerEffect.blocks.map((b, i) => (
              <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4, paddingLeft: 10, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#10b981' }}>✓</span>{b}
              </div>
            ))}
          </div>
          <div style={{ padding: 12, background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.12)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>Doesn't Block</div>
            {scenario.blockerEffect.unblocks.map((b, i) => (
              <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4, paddingLeft: 10, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#ef4444'}}>✕</span>{b}
              </div>
            ))}
          </div>
        </div>

        {/* Analysis */}
        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#d946ef', marginBottom: 4 }}>Analysis</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{scenario.analysis}</div>
        </div>

        {/* Tips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {scenario.tips.map((tip, i) => (
            <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', paddingLeft: 12, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: '#d946ef' }}>•</span>{tip}
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Blocker Analysis failed to load: {err.message}</div>;
  }
}

export default BlockerAnalysis;
