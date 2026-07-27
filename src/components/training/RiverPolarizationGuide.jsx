/**
 * RiverPolarizationGuide — Polarized vs Linear River Betting
 * ═══════════════════════════════════════════════════════════════════════════
 * Understand when to use polarized vs linear (merged) betting
 * strategies on the river.
 */
import React, { useState } from 'react';

const CONCEPTS = [
  {
    type: 'Polarized', color: '#ef4444',
    definition: 'Betting with only the best hands (value) and worst hands (bluffs). Nothing in between.',
    when: ['Large bet sizes (66%+ pot)', 'River decisions where ranges are defined', 'When you want to put opponent in a tough spot', 'Overbet situations'],
    example: {
      board: 'K♠ 9♥ 4♣ 7♦ 2♠',
      hand: 'Either AA (value) or 65s (bluff)',
      sizing: 'Bet 75-150% pot',
      reasoning: 'Your range has strong hands (sets, two pair) and missed draws. Nothing in between. Bet big to maximize value from strong hands and get folds with bluffs.',
    },
    ratio: '2:1 value to bluff (at 75% pot size)',
    visual: { value: 40, bluff: 25, check: 35 },
  },
  {
    type: 'Linear (Merged)', color: '#10b981',
    definition: 'Betting with a range of hands from strong to medium-strong. Few or no bluffs.',
    when: ['Small bet sizes (25-33% pot)', 'When opponent calls too wide', 'Multiway pots', 'When opponent doesnt fold to big bets'],
    example: {
      board: 'A♣ Q♦ 7♣ 3♥ 9♠',
      hand: 'AJ, AK, KQ, QJ — all for thin value',
      sizing: 'Bet 25-33% pot',
      reasoning: 'Against a calling station, bet thin with any pair. They wont fold, so no point bluffing. Extract value from second-best hands.',
    },
    ratio: '4:1 value to bluff (mostly value)',
    visual: { value: 55, bluff: 10, check: 35 },
  },
];

const QUIZ = [
  { q: 'You have a set on a dry river. Opponent is a tight player.', a: 'Polarized', reason: 'Bet big for value. Tight player only calls with strong hands, so maximize when they do call.' },
  { q: 'You have top pair on a wet river. Opponent is a calling station.', a: 'Linear', reason: 'Bet small for thin value. Calling station wont fold, so extract value with medium hands.' },
  { q: 'You have a missed flush draw on the river. Opponent checked to you.', a: 'Polarized', reason: 'If you bet, it should be as a bluff in a polarized range. Bet big to represent the nuts or check.' },
  { q: 'Multiway pot on the river. You have second pair.', a: 'Linear', reason: 'In multiway pots, use small bets with merged ranges. Checking is also fine — bluffing is dangerous multiway.' },
];

function RiverPolarizationGuide() {
  const [tab, setTab] = useState(0);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState(null);

  const concept = CONCEPTS[tab];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#d946ef' }}>River Polarization</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {CONCEPTS.map((c, i) => (
            <button key={i} onClick={() => setTab(i)} style={{
              flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === i ? c.color : 'rgba(255,255,255,0.06)',
              color: tab === i ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 13, fontWeight: 700,
            }}>{c.type}</button>
          ))}
        </div>

        <div style={{ padding: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{concept.definition}</div>
        </div>

        {/* Visual range composition */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Range Composition:</div>
          <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ width: `${concept.visual.value}%`, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>Value {concept.visual.value}%</span>
            </div>
            <div style={{ width: `${concept.visual.bluff}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{concept.visual.bluff}%</span>
            </div>
            <div style={{ width: `${concept.visual.check}%`, background: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>Check {concept.visual.check}%</span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Optimal ratio: {concept.ratio}</div>
        </div>

        {/* When to use */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: concept.color, marginBottom: 4 }}>When to use {concept.type}:</div>
          {concept.when.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', paddingLeft: 8, borderLeft: `2px solid ${concept.color}44`, marginBottom: 3 }}>{w}</div>
          ))}
        </div>

        {/* Example */}
        <div style={{ padding: 10, background: `${concept.color}09`, borderRadius: 8, border: `1px solid ${concept.color}22`, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: 2, marginBottom: 4 }}>{concept.example.board}</div>
          <div style={{ fontSize: 11, color: concept.color, fontWeight: 600, marginBottom: 2 }}>{concept.example.hand}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Size: {concept.example.sizing}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{concept.example.reasoning}</div>
        </div>

        {/* Mini quiz */}
        <div style={{ padding: 10, background: 'rgba(217,70,239,0.06)', borderRadius: 8, border: '1px solid rgba(217,70,239,0.15)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d946ef', marginBottom: 6 }}>Quick Quiz</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>{QUIZ[quizIdx].q}</div>
          {!quizAnswer && (
            <div style={{ display: 'flex', gap: 6 }}>
              {['Polarized', 'Linear'].map(a => (
                <button key={a} onClick={() => setQuizAnswer(a)} style={{
                  flex: 1, padding: 6, borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: a === 'Polarized' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                  color: a === 'Polarized' ? '#ef4444' : '#10b981', fontSize: 11, fontWeight: 700,
                }}>{a}</button>
              ))}
            </div>
          )}
          {quizAnswer && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: quizAnswer === QUIZ[quizIdx].a ? '#10b981' : '#ef4444', marginBottom: 4 }}>
                {quizAnswer === QUIZ[quizIdx].a ? '✓ Correct!': `✕ Answer: ${QUIZ[quizIdx].a}`}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>{QUIZ[quizIdx].reason}</div>
              <button onClick={() => { setQuizIdx((quizIdx + 1) % QUIZ.length); setQuizAnswer(null); }} style={{ padding: '4px 12px', borderRadius: 4, border: 'none', fontSize: 10, cursor: 'pointer', background: '#d946ef', color: '#fff', fontWeight: 600 }}>Next →</button>
            </div>
          )}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Polarization Guide failed to load: {err.message}</div>;
  }
}

export default RiverPolarizationGuide;
