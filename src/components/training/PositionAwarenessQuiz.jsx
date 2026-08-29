/**
 * PositionAwarenessQuiz — GTO Wizard-Style Position Knowledge Quiz
 * ═══════════════════════════════════════════════════════════════════════════
 * Test understanding of positional advantages, opening ranges by position,
 * and how position affects strategy decisions.
 */
import React, { useState } from 'react';

const QUESTIONS = [
  {
    q: 'Which position has the highest win rate in a full ring (9-max) game?',
    options: ['UTG', 'CO', 'BTN', 'BB'],
    correct: 2,
    explanation: 'The Button (BTN) has the highest win rate because it acts last postflop on every street. This informational advantage allows wider opening, better bluffing, and more accurate value betting.',
  },
  {
    q: 'In A 100 BB, 6-Max Cash Game Without Antes, Action Folds To Under The Gun. Which Approximate First-In Raise Frequency Matches This Lesson\'s Baseline?',
    options: ['Approximately 8%', 'Approximately 15%', 'Approximately 25%', 'Approximately 40%'],
    correct: 1,
    explanation: 'Under The Gun has five players left to act, so this lesson uses a tight first-in baseline of approximately 15%, including premium pairs, strong broadways, suited aces, and selected suited connectors.',
  },
  {
    q: 'At 100 BB, Action Folds To The Cutoff, Who Raises To 2.5 BB. The Button 3-Bets And The Cutoff Calls. Who Usually Holds The Range Advantage On A-High Flops?',
    options: ['The Cutoff, Who Called The 3-Bet', 'The Button, Who 3-Bet', 'Neither; The Ranges Are Equally Strong', 'It Depends Only On The Suit Of The Ace'],
    correct: 1,
    explanation: 'The Button’s 3-betting range retains more AA, AK, and AQ combinations, while the Cutoff’s call caps some of its strongest hands.',
  },
  {
    q: 'At 100 BB, Action Folds To The Button, Who Raises To 2.5 BB. Which Simplified Small-Blind Response Strategy Does This Lesson Use With The Big Blind Still To Act?',
    options: ['Use A 3-Bet-Or-Fold Baseline', 'Use A Call-Or-3-Bet Baseline Without Folds', 'Call Every Hand That Continues', 'Fold The Entire Range'],
    correct: 0,
    explanation: 'This simplified lesson uses a 3-bet-or-fold Small Blind baseline to avoid calling out of position with the Big Blind still to act. Some solved formats can include calls, so the exact configuration still matters.',
  },
  {
    q: 'In A 100 BB, 6-Max Cash Game Without Antes, Action Folds To The Button. Which Approximate First-In Raise Frequency Matches This Lesson\'s Baseline?',
    options: ['~25%', '~35%', '~45%', '~55%'],
    correct: 2,
    explanation: 'Only the blinds remain and the Button acts last after the flop, so this lesson uses a wide first-in baseline of approximately 45%.',
  },
  {
    q: 'At 100 BB, Against Which First-In Raiser Does This Lesson Give The Big Blind Its Widest Defending Range?',
    options: ['Under The Gun', 'Middle Position', 'Cutoff', 'Button'],
    correct: 3,
    explanation: 'When action folds to the Button, who raises, that first-in range is the widest of these choices. The Big Blind also closes the action and has already invested one blind, supporting its widest defense.',
  },
  {
    q: 'Which concept is MOST important in early position play?',
    options: ['Implied odds', 'Range tightness', 'Bluff frequency', 'Pot control'],
    correct: 1,
    explanation: 'Range tightness is paramount in early position. With many players behind, you need hands strong enough to withstand 3-bets and play well out of position. Implied odds are secondary.',
  },
  {
    q: 'At 100 BB, Action Folds To The Button, Who Raises, And The Big Blind Calls. On 7♠5♣2♦, Which Range Contains More 75s And 52s Two-Pair Combinations?',
    options: ['The Button\'s Raising Range', 'The Big Blind\'s Calling Range', 'Both Ranges Contain The Same Number', 'Neither Range Can Contain Those Hands'],
    correct: 1,
    explanation: 'The Big Blind calls more low suited combinations such as 75s and 52s, so its range contains more two-pair combinations on this low board.',
  },
  {
    q: 'What Does The "Blind Discount" Mean When The Big Blind Faces A Preflop Raise?',
    options: [
      'Early Position Must Enter With Fewer Hands',
      'Acting Last Adds Chips To The Pot',
      'The Posted Big Blind Reduces The Additional Chips Needed To Call',
      'The Raiser Must Use A Smaller Bet Size',
    ],
    correct: 2,
    explanation: 'The Big Blind has already posted one blind, so the additional amount required to call is smaller than it would be from an uninvested seat.',
  },
  {
    q: 'In A Heads-Up Postflop Pot, Which Information Advantage Can Make In-Position Bluffs More Efficient?',
    options: [
      'You See The Opponent\'s Action Before Choosing Your Own',
      'Position Requires A Lower Bluffing Frequency On Every Board',
      'Position Automatically Increases The Cards\' Showdown Equity',
      'Position Changes Preflop Decisions But Not Postflop Decisions',
    ],
    correct: 0,
    explanation: 'Acting last reveals whether the opponent checks or bets before you choose a bluff, value bet, call, raise, or check-back.',
  },
];

function PositionAwarenessQuiz() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const question = QUESTIONS[currentIdx];
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  const handleSelect = (idx) => {
    if (selected !== null) return;
    setSelected(idx);
    setStats(prev => ({ correct: prev.correct + (idx === question.correct ? 1 : 0), total: prev.total + 1 }));
  };

  const nextQuestion = () => {
    setCurrentIdx((currentIdx + 1) % QUESTIONS.length);
    setSelected(null);
  };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#818cf8' }}>Position Awareness Quiz</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{stats.correct}/{stats.total} ({accuracy}%) • Q{currentIdx + 1}/{QUESTIONS.length}</span>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
          {QUESTIONS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i === currentIdx ? '#818cf8' : i < currentIdx ? 'rgba(129,140,248,0.3)' : 'rgba(255,255,255,0.06)',
            }} />
          ))}
        </div>

        {/* Question */}
        <div style={{ padding: 14, background: 'rgba(129,140,248,0.06)', borderRadius: 10, border: '1px solid rgba(129,140,248,0.15)', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.5 }}>{question.q}</div>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {question.options.map((opt, i) => {
            const isCorrect = i === question.correct;
            const isSelected = i === selected;
            let bg = 'rgba(255,255,255,0.04)';
            let border = '1px solid rgba(255,255,255,0.08)';
            let color = 'rgba(255,255,255,0.8)';

            if (selected !== null) {
              if (isCorrect) { bg = 'rgba(16,185,129,0.1)'; border = '1px solid rgba(16,185,129,0.3)'; color = '#10b981'; }
              else if (isSelected) { bg = 'rgba(239,68,68,0.1)'; border = '1px solid rgba(239,68,68,0.3)'; color = '#ef4444'; }
            }

            return (
              <button key={i} onClick={() => handleSelect(i)} disabled={selected !== null} aria-pressed={isSelected} style={{
                padding: '12px 16px', borderRadius: 8, border, background: bg,
                cursor: selected === null ? 'pointer' : 'default', textAlign: 'left',
                fontSize: 13, fontWeight: 600, color,
              }}>
                {String.fromCharCode(65 + i)}. {opt}
                {selected !== null && isCorrect && ' ✓'}
                {selected !== null && isSelected && !isCorrect && '✕'}
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {selected !== null && (
          <section
            className={`sp-command-verdict ${selected === question.correct ? 'is-correct' : 'is-incorrect'}`}
            aria-live="assertive"
            aria-atomic="true"
          >
            <strong>{selected === question.correct ? 'Correct' : 'Incorrect'}</strong>
            <div><span>Your Answer</span><b>{question.options[selected]}</b></div>
            <div><span>Correct Answer</span><b>{question.options[question.correct]}</b></div>
            <p>{question.explanation}</p>
            <em>This Result Will Stay Open Until You Click Next.</em>
            <button onClick={nextQuestion}>Next Question →</button>
          </section>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Position Quiz failed to load: {err.message}</div>;
  }
}

export default PositionAwarenessQuiz;
