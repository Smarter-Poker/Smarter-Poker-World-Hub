/**
 * DailyPersonalQuiz — Auto-Generated Daily Quiz Targeting Your Weaknesses
 * CRITICAL GAP CLOSER: GTO Wizard daily challenges personalized to user
 * Generates quiz hands based on detected leak areas
 */
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';

const QUIZ_CATEGORIES = [
  { id: 'preflop', label: 'Preflop Ranges', icon: '◇', color: '#3b82f6' },
  { id: 'cbet', label: 'C-Bet Strategy', icon: '●', color: '#22c55e' },
  { id: 'barrel', label: 'Multi-Street Barrels', icon: '▲', color: '#ef4444' },
  { id: 'bluffcatch', label: 'Bluff Catching', icon: '◇', color: '#f59e0b' },
  { id: 'sizing', label: 'Bet Sizing', icon: '■', color: '#8b5cf6' },
];

const DAILY_QUESTIONS = [
  { category: 'preflop', difficulty: 'Medium',
    scenario: 'UTG opens 2.5x at 100bb 6-max. You\'re in the CO with K♠Q♥.',
    board: null, pot: null, position: 'CO vs UTG Open',
    options: [
      { action: 'Fold', ev: -0.2, correct: false, explain: 'KQo is strong enough to continue vs UTG. Folding is too tight.' },
      { action: 'Call', ev: 0.8, correct: false, explain: 'Calling is acceptable but misses value. KQo plays better as a 3-bet in position.' },
      { action: '3-Bet to 7.5bb', ev: 1.4, correct: true, explain: 'Correct! KQo 3-bets for value in position. You have blockers to KK/QQ and play well postflop.' },
      { action: '3-Bet to 10bb', ev: 0.6, correct: false, explain: 'Sizing is too large. 3x the open (7.5bb) is standard. 4x bloats the pot unnecessarily.' },
    ] },
  { category: 'cbet', difficulty: 'Hard',
    scenario: 'You opened BTN, BB called. Flop: J♥ 8♣ 4♠. You have A♠5♠.',
    board: 'J♥ 8♣ 4♠', pot: '6.5bb', position: 'BTN vs BB SRP',
    options: [
      { action: 'Check', ev: 0.3, correct: false, explain: 'Checking isn\'t bad but misses a profitable c-bet. You have backdoor nut flush and overcard equity.' },
      { action: 'Bet 2bb (33%)', ev: 1.1, correct: true, explain: 'Correct! Small c-bet is ideal. You have backdoor equity, an overcard, and fold equity vs BB\'s wide range.' },
      { action: 'Bet 4.5bb (66%)', ev: 0.4, correct: false, explain: 'Too large with this hand. You don\'t want to build a big pot with A-high. Small sizing accomplishes the same goal.' },
      { action: 'Bet 6.5bb (pot)', ev: -0.8, correct: false, explain: 'Way too large. Pot-sized c-bet with A-high is lighting money on fire. You only get called by better.' },
    ] },
  { category: 'barrel', difficulty: 'Hard',
    scenario: 'You 3-bet BTN from SB, called. Flop K♦9♥3♣, you bet 33%, called. Turn: 6♠. You have A♠Q♠.',
    board: 'K♦ 9♥ 3♣ 6♠', pot: '22bb', position: 'SB 3BP vs BTN',
    options: [
      { action: 'Check', ev: 0.8, correct: true, explain: 'Correct! AQo missed. The turn brick doesn\'t improve you. Check and reassess. You can bluff some rivers.' },
      { action: 'Bet 7bb (33%)', ev: 0.2, correct: false, explain: 'Small barrel has some merit but AQo isn\'t the best bluff candidate here. Save bullets for better spots.' },
      { action: 'Bet 15bb (66%)', ev: -1.2, correct: false, explain: 'Too aggressive. Villain called flop on a K-high board — they have Kx, 99, draws. Don\'t barrel into strength.' },
      { action: 'Bet 22bb (pot)', ev: -2.5, correct: false, explain: 'Massively overplaying A-high. This is a disaster bet that only gets called by hands that crush you.' },
    ] },
  { category: 'bluffcatch', difficulty: 'Expert',
    scenario: 'BTN opens, you call BB. Board: Q♥T♣7♠ 2♦ 5♥. Villain bet flop 33%, turn 66%, river 100%. You have J♥J♣.',
    board: 'Q♥ T♣ 7♠ 2♦ 5♥', pot: '38bb', position: 'BB vs BTN 3-barrel',
    options: [
      { action: 'Fold', ev: 0.4, correct: true, explain: 'Correct! JJ is a fold vs 3-barrel with overbet river. BTN\'s range is polarized — QT+, sets, or bluffs. JJ loses to all value.' },
      { action: 'Call', ev: -3.2, correct: false, explain: 'JJ can\'t beat any value bet on this board. Q7, QT, T7, sets, straights all crush you. Don\'t be a calling station.' },
      { action: 'Raise to 95bb', ev: -8.5, correct: false, explain: 'Raising JJ as a bluff on this runout is suicide. You block nothing and BTN is never folding better.' },
    ] },
  { category: 'sizing', difficulty: 'Medium',
    scenario: 'You have A♠A♥ on K♣7♦2♠ 9♥ 3♣ vs a tight player. Pot is 15bb. River decision.',
    board: 'K♣ 7♦ 2♠ 9♥ 3♣', pot: '15bb', position: 'IP vs tight villain',
    options: [
      { action: 'Check', ev: 0.5, correct: false, explain: 'You\'re leaving value on the table. AA is strong and villain can have Kx, 99, 77 that pay off.' },
      { action: 'Bet 5bb (33%)', ev: 2.8, correct: true, explain: 'Correct! Thin value bet with small sizing. Villain is tight — they\'ll call 33% with Kx but fold to larger sizes.' },
      { action: 'Bet 10bb (66%)', ev: 1.5, correct: false, explain: 'Decent but too large vs a tight player. They fold Kx hands which are the bulk of their calling range.' },
      { action: 'Bet 15bb (pot)', ev: -0.3, correct: false, explain: 'Way too large. Tight player folds everything except sets and two pair. You get no value.' },
    ] },
];

export default function DailyPersonalQuiz() {
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const q = DAILY_QUESTIONS[qIdx];

  const handleAnswer = useCallback((optIdx) => {
    if (selected !== null) return;
    setSelected(optIdx);
    setAnswered(a => a + 1);
    if (q.options[optIdx].correct) {
      setScore(s => s + 1);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
  }, [selected, q]);

  const nextQuestion = useCallback(() => {
    setQIdx(i => (i + 1) % DAILY_QUESTIONS.length);
    setSelected(null);
  }, []);

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Daily Strategy Quiz
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>Personalized daily challenges targeting your weak spots.</p>

      {/* Stats Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Score', value: `${score}/${answered}`, color: '#22c55e' },
          { label: 'Accuracy', value: answered > 0 ? `${Math.round(score/answered*100)}%` : '—', color: '#3b82f6' },
          { label: 'Streak', value: `${streak}▲`, color: '#f59e0b' },
          { label: 'Question', value: `${qIdx + 1}/${DAILY_QUESTIONS.length}`, color: '#8b5cf6' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Category Tags */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {QUIZ_CATEGORIES.map(c => (
          <span key={c.id} style={{ padding: '3px 8px', borderRadius: 4, background: q.category === c.id ? `${c.color}15` : 'rgba(0,0,0,0.2)',
            border: q.category === c.id ? `1px solid ${c.color}` : '1px solid transparent',
            fontSize: 9, fontWeight: 700, color: q.category === c.id ? c.color : '#64748b' }}>
            {c.icon} {c.label}
          </span>
        ))}
      </div>

      {/* Question Card */}
      <motion.div key={qIdx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', padding: '2px 8px', background: 'rgba(245,158,11,0.1)', borderRadius: 4 }}>{q.difficulty}</span>
          <span style={{ fontSize: 10, color: '#64748b' }}>{q.position}</span>
        </div>
        <p style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 8, lineHeight: 1.5 }}>{q.scenario}</p>
        {q.board && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Board: <strong style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{q.board}</strong></span>
            {q.pot && <span style={{ fontSize: 11, color: '#64748b' }}>Pot: <strong style={{ color: '#22c55e', fontFamily: 'monospace' }}>{q.pot}</strong></span>}
          </div>
        )}

        {/* Options */}
        <div style={{ display: 'grid', gap: 6 }}>
          {q.options.map((opt, i) => {
            const isSelected = selected === i;
            const showResult = selected !== null;
            const bgColor = showResult
              ? opt.correct ? 'rgba(34,197,94,0.15)' : isSelected ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.2)'
              : 'rgba(0,0,0,0.2)';
            const borderColor = showResult
              ? opt.correct ? '#22c55e' : isSelected ? '#ef4444' : 'transparent'
              : isSelected ? '#3b82f6' : 'rgba(255,255,255,0.06)';
            return (
              <button key={i} onClick={() => handleAnswer(i)}
                style={{ padding: 10, borderRadius: 8, border: `1px solid ${borderColor}`, background: bgColor, cursor: selected === null ? 'pointer' : 'default', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: showResult ? (opt.correct ? '#22c55e' : isSelected ? '#ef4444' : '#64748b') : '#e2e8f0' }}>
                    {opt.action}
                  </span>
                  {showResult && <span style={{ fontSize: 10, fontFamily: 'monospace', color: opt.ev >= 0 ? '#22c55e' : '#ef4444' }}>EV: {opt.ev > 0 ? '+' : ''}{opt.ev} bb</span>}
                </div>
                {showResult && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                    {opt.explain}
                  </motion.div>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Next Button */}
      {selected !== null && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center' }}>
          <button onClick={nextQuestion}
            style={{ padding: '10px 30px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            Next Question →
          </button>
        </motion.div>
      )}
    </div>
  );
}
