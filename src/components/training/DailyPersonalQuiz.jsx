/**
 * DailyPersonalQuiz - Daily Strategy Rotation
 * Five authored solver scenarios covering essential strategy areas.
 */
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import styles from '../../styles/training/daily-personal-quiz-casino.module.css';

const QUIZ_CATEGORIES = [
  { id: 'preflop', label: 'Preflop Ranges', icon: '◇', color: '#3b82f6' },
  { id: 'cbet', label: 'C-Bet Strategy', icon: '●', color: '#22c55e' },
  { id: 'barrel', label: 'Multi-Street Barrels', icon: '▲', color: '#ef4444' },
  { id: 'bluffcatch', label: 'Bluff Catching', icon: '◇', color: '#f59e0b' },
  { id: 'sizing', label: 'Bet Sizing', icon: '■', color: '#8b5cf6' },
];

const DAILY_QUESTIONS = [
  { category: 'preflop', difficulty: 'Medium',
    scenario: 'At 100 BB effective in 6-max, action folds to Under The Gun, who raises to 2.5 BB. You are in the Cutoff with K♠Q♥. What is your best action?',
    board: null, pot: null, position: 'CO vs UTG Open',
    options: [
      { action: 'Fold', ev: -0.2, correct: false, explain: 'KQo is strong enough to continue vs UTG. Folding is too tight.' },
      { action: 'Call', ev: 0.8, correct: false, explain: 'Calling is acceptable but misses value. KQo plays better as a 3-bet in position.' },
      { action: '3-Bet to 7.5bb', ev: 1.4, correct: true, explain: 'Correct! KQo 3-bets for value in position. You have blockers to KK/QQ and play well postflop.' },
      { action: '3-Bet to 10bb', ev: 0.6, correct: false, explain: 'Sizing is too large. 3x the open (7.5bb) is standard. 4x bloats the pot unnecessarily.' },
    ] },
  { category: 'cbet', difficulty: 'Hard',
    scenario: 'You raise first in from the Button and the Big Blind calls. The flop is J♥ 8♣ 4♠, and the Big Blind checks. You hold A♠5♠. What is your best action?',
    board: 'J♥ 8♣ 4♠', pot: '6.5bb', position: 'BTN vs BB SRP',
    options: [
      { action: 'Check', ev: 0.3, correct: false, explain: 'Checking isn\'t bad but misses a profitable c-bet. You have backdoor nut flush and overcard equity.' },
      { action: 'Bet 2bb (33%)', ev: 1.1, correct: true, explain: 'Correct! Small c-bet is ideal. You have backdoor equity, an overcard, and fold equity vs BB\'s wide range.' },
      { action: 'Bet 4.5bb (66%)', ev: 0.4, correct: false, explain: 'Too large with this hand. You don\'t want to build a big pot with A-high. Small sizing accomplishes the same goal.' },
      { action: 'Bet 6.5bb (pot)', ev: -0.8, correct: false, explain: 'Way too large. Pot-sized c-bet with A-high is lighting money on fire. You only get called by better.' },
    ] },
  { category: 'barrel', difficulty: 'Hard',
    scenario: 'You 3-bet from the Small Blind and the Button calls. On K♦9♥3♣, you bet 33% pot and the Button calls. The turn is 6♠. You hold A♠Q♠ and are first to act. What is your best action?',
    board: 'K♦ 9♥ 3♣ 6♠', pot: '22bb', position: 'SB 3BP vs BTN',
    options: [
      { action: 'Check', ev: 0.8, correct: true, explain: 'Correct! AQo missed. The turn brick doesn\'t improve you. Check and reassess. You can bluff some rivers.' },
      { action: 'Bet 7bb (33%)', ev: 0.2, correct: false, explain: 'Small barrel has some merit but AQo isn\'t the best bluff candidate here. Save bullets for better spots.' },
      { action: 'Bet 15bb (66%)', ev: -1.2, correct: false, explain: 'Too aggressive. Villain called flop on a K-high board - they have Kx, 99, draws. Don\'t barrel into strength.' },
      { action: 'Bet 22bb (pot)', ev: -2.5, correct: false, explain: 'Massively overplaying A-high. This is a disaster bet that only gets called by hands that crush you.' },
    ] },
  { category: 'bluffcatch', difficulty: 'Expert',
    scenario: 'Action folds to the Button, who raises; you call from the Big Blind. On Q♥T♣7♠ 2♦ 5♥, the Button bets 33% pot on the flop, 66% on the turn, and 100% on the river. You hold J♥J♣. What is your best action?',
    board: 'Q♥ T♣ 7♠ 2♦ 5♥', pot: '38bb', position: 'BB vs BTN 3-barrel',
    options: [
      { action: 'Fold', ev: 0.4, correct: true, explain: 'Correct! JJ is a fold vs 3-barrel with overbet river. BTN\'s range is polarized - QT+, sets, or bluffs. JJ loses to all value.' },
      { action: 'Call', ev: -3.2, correct: false, explain: 'JJ can\'t beat any value bet on this board. Q7, QT, T7, sets, straights all crush you. Don\'t be a calling station.' },
      { action: 'Raise to 95bb', ev: -8.5, correct: false, explain: 'Raising JJ as a bluff on this runout is suicide. You block nothing and BTN is never folding better.' },
      { action: 'Min-Raise to 76bb', ev: -6.9, correct: false, explain: 'A small river raise represents very little and gives the Button excellent odds to continue with every value hand.' },
    ] },
  { category: 'sizing', difficulty: 'Medium',
    scenario: 'You hold A♠A♥ on K♣7♦2♠ 9♥ 3♣ against a tight opponent. The opponent checks to you on the river with 15 BB in the pot. What is your best action?',
    board: 'K♣ 7♦ 2♠ 9♥ 3♣', pot: '15bb', position: 'IP vs tight villain',
    options: [
      { action: 'Check', ev: 0.5, correct: false, explain: 'You\'re leaving value on the table. AA is strong and villain can have Kx, 99, 77 that pay off.' },
      { action: 'Bet 5bb (33%)', ev: 2.8, correct: true, explain: 'Correct! Thin value bet with small sizing. Villain is tight - they\'ll call 33% with Kx but fold to larger sizes.' },
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
    <section className={styles.quiz} aria-labelledby="daily-personal-quiz-title">
      <header className={styles.marquee}>
        <span>Personal Strategy Table</span>
        <h3 id="daily-personal-quiz-title">Daily Strategy Quiz</h3>
        <p>Five Daily Solver Scenarios Across Essential Strategy Areas.</p>
      </header>

      {/* Stats Bar */}
      <div className={styles.stats} aria-label="Daily Quiz Status">
        {[
          { label: 'Score', value: `${score}/${answered}` },
          { label: 'Accuracy', value: answered > 0 ? `${Math.round(score/answered*100)}%` : '-' },
          { label: 'Streak', value: `${streak}` },
          { label: 'Question', value: `${qIdx + 1}/${DAILY_QUESTIONS.length}` },
        ].map((s, i) => (
          <div key={i}>
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Category Tags */}
      <div className={styles.categories} aria-label="Strategy Categories">
        {QUIZ_CATEGORIES.map(c => (
          <span key={c.id} data-active={q.category === c.id || undefined}>
            {c.icon} {c.label}
          </span>
        ))}
      </div>

      {/* Question Card */}
      <motion.div key={qIdx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        className={styles.questionCard}>
        <div className={styles.questionMeta}>
          <span>{q.difficulty}</span>
          <span>{q.position}</span>
        </div>
        <p className={styles.scenario}>{q.scenario}</p>
        {q.board && (
          <div className={styles.tableReadout}>
            <span>Board <strong>{q.board}</strong></span>
            {q.pot && <span>Pot <strong>{q.pot}</strong></span>}
          </div>
        )}

        {/* Options */}
        <div className={styles.options}>
          {q.options.map((opt, i) => {
            const isSelected = selected === i;
            const showResult = selected !== null;
            return (
              <button key={i} type="button" onClick={() => handleAnswer(i)} disabled={selected !== null}
                data-correct={(showResult && opt.correct) || undefined}
                data-incorrect={(showResult && isSelected && !opt.correct) || undefined}>
                <div className={styles.optionHeading}>
                  <span>{opt.action}</span>
                  {showResult && <span>EV: {opt.ev > 0 ? '+' : ''}{opt.ev} BB</span>}
                </div>
                {showResult && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.explanation}>
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.nextWrap}>
          <button type="button" onClick={nextQuestion}>
            Next Question <span aria-hidden="true">›</span>
          </button>
        </motion.div>
      )}
    </section>
  );
}
