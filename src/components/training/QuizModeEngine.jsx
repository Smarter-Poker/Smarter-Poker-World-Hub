/**
 * QUIZ MODE ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 * Timed quiz mode with competitive scoring:
 * - 3 difficulty levels: Quick (30s), Standard (60s), Expert (no timer)
 * - Mixed question types: action, sizing, range, EV estimation
 * - Streak bonuses, speed bonuses, perfect round bonuses
 * - Session summary with accuracy breakdown
 * - Leaderboard-ready score output
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';

const DIFFICULTIES = [
  { id: 'quick', label: 'Quick', timer: 15, questions: 10, color: '#22c55e' },
  { id: 'standard', label: 'Standard', timer: 30, questions: 15, color: '#3b82f6' },
  { id: 'expert', label: 'Expert', timer: 0, questions: 20, color: '#ef4444' },
];

// ═══ QUESTION BANK ═══
const QUESTION_BANK = [
  // Action questions
  { type: 'action', q: 'You have A♠K♠ on BTN. UTG opens 2.5x. What do you do?', options: ['Fold', 'Call', '3-Bet to 8x', '3-Bet to 10x'], correct: 2, explanation: 'AKs is a premium 3-bet hand from the BTN vs UTG open.' },
  { type: 'action', q: 'BB with 9♣7♣. BTN opens 2.5x. SB folds. Your action?', options: ['Fold', 'Call', '3-Bet', 'All-in'], correct: 1, explanation: '97s has good implied odds and playability to defend the BB vs BTN open.' },
  { type: 'action', q: 'CO with J♥T♥. Folds to you. What do you do?', options: ['Fold', 'Limp', 'Raise 2.2x', 'Raise 3x'], correct: 2, explanation: 'JTs is a clear open-raise from the CO. Standard 2.2x sizing.' },
  { type: 'action', q: 'K♠Q♦8♣ flop. You c-bet 33%, BB check-raises to 3x. You have A♠A♥.', options: ['Fold', 'Call', 'Re-raise', 'All-in'], correct: 1, explanation: 'AA is too strong to fold but re-raising turns our hand face-up. Call and reassess turn.' },
  { type: 'action', q: 'River: A♣K♦7♠4♥2♣. You have Q♠J♠ after barreling flop+turn. BB checks.', options: ['Check back', 'Bet 33%', 'Bet 75%', 'Overbet'], correct: 3, explanation: 'QJ has no showdown value. An overbet bluff is optimal as it polarizes our range and maximizes fold equity.' },

  // Sizing questions
  { type: 'sizing', q: 'Dry A♠7♦2♣ flop, BTN vs BB SRP. You\'re IP with range advantage. What c-bet size?', options: ['25-33%', '50%', '67-75%', 'Pot'], correct: 0, explanation: 'On dry boards with range advantage, small sizing lets you c-bet your entire range profitably.' },
  { type: 'sizing', q: 'Wet T♥9♥8♣ flop, you have J♠J♦ IP in SRP. Bet size?', options: ['33%', '50%', '75%', 'Overbet'], correct: 2, explanation: 'On coordinated boards, bigger sizing is needed to charge draws and protect your equity.' },
  { type: 'sizing', q: 'River with the nuts on a dry board. Opponent has shown strength. Size?', options: ['33%', '50%', '75%', 'Overbet'], correct: 3, explanation: 'With the nuts against a strong range, overbet to extract maximum value.' },

  // Range questions
  { type: 'range', q: 'UTG opens at 6-max. Approximately what % of hands is a standard RFI range?', options: ['8-10%', '13-16%', '20-25%', '30-35%'], correct: 1, explanation: 'UTG RFI range is typically 13-16% — pairs 22+, ATs+, KQs, AQo+.' },
  { type: 'range', q: 'BTN opens at 6-max. What\'s the approximate RFI percentage?', options: ['20-25%', '30-35%', '40-50%', '55-65%'], correct: 2, explanation: 'BTN has the widest open range at ~40-50% since only the blinds remain.' },
  { type: 'range', q: 'BB faces a BTN open. What % of hands should BB defend (call + 3-bet)?', options: ['20-30%', '35-45%', '50-60%', '65-75%'], correct: 2, explanation: 'BB gets the best odds and should defend ~50-60% vs BTN, using a mix of calls and 3-bets.' },

  // EV questions
  { type: 'ev', q: 'You face a pot-sized bet on the river. You need at least what equity to call?', options: ['25%', '33%', '40%', '50%'], correct: 1, explanation: 'Facing a pot-sized bet, you need 33% equity: Risk/(Risk+Reward) = Pot/(Pot + 2*Pot) = 1/3.' },
  { type: 'ev', q: 'You have a flush draw on the flop (9 outs). What\'s your approximate equity to hit by the river?', options: ['19%', '27%', '35%', '42%'], correct: 2, explanation: 'Rule of 4: 9 outs × 4 = 36%. Actual: ~35% to hit a flush by the river with 2 cards to come.' },
  { type: 'ev', q: 'Pot is 100bb. You bet 50bb. Opponent needs to fold at least X% for a pure bluff to profit.', options: ['25%', '33%', '40%', '50%'], correct: 1, explanation: 'Bet/(Bet+Pot) = 50/(50+100) = 33%. Villain needs to fold 33%+ for your bluff to be profitable.' },

  // Concept questions
  { type: 'concept', q: 'What is "range advantage"?', options: ['Having more nut hands', 'Higher average equity', 'More combo draws', 'Better position'], correct: 0, explanation: 'Range advantage means having more strong/nutted combinations in your range on a given board texture.' },
  { type: 'concept', q: 'In a 3-bet pot, the 3-bettor typically has what advantage on most boards?', options: ['Position', 'Range advantage', 'Stack advantage', 'Information'], correct: 1, explanation: 'The 3-bettor has range advantage on most boards because their range is narrower and stronger.' },
  { type: 'concept', q: 'What does "polarized" mean in poker strategy?', options: ['Playing only premium hands', 'Betting with only strong hands and bluffs, not medium strength', 'Always raising or folding', 'Playing from the blinds'], correct: 1, explanation: 'A polarized range contains strong value hands and bluffs, with medium-strength hands checking.' },
];

// ═══ MAIN COMPONENT ═══
export default function QuizModeEngine() {
  const [phase, setPhase] = useState('setup'); // setup | playing | results
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[1]);
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const timerRef = useRef(null);

  // Start quiz
  const startQuiz = useCallback(() => {
    // Phase 62: Fisher-Yates instead of biased sort(()=>Math.random()-0.5).
    const _bank = [...QUESTION_BANK];
    for (let i = _bank.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [_bank[i], _bank[j]] = [_bank[j], _bank[i]];
    }
    const shuffled = _bank.slice(0, difficulty.questions);
    setQuestions(shuffled);
    setCurrentQ(0);
    setSelected(null);
    setAnswers([]);
    setStreak(0);
    setBestStreak(0);
    setTimeLeft(difficulty.timer);
    setPhase('playing');
  }, [difficulty]);

  // Timer
  useEffect(() => {
    if (phase !== 'playing' || difficulty.timer === 0 || selected !== null) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          // Auto-wrong on timeout
          handleAnswer(-1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, currentQ, selected, difficulty.timer]);

  const handleAnswer = useCallback((optIdx) => {
    if (selected !== null) return;
    clearInterval(timerRef.current);
    setSelected(optIdx);
    const q = questions[currentQ];
    const isCorrect = optIdx === q?.correct;
    const timeBonus = difficulty.timer > 0 ? Math.round(timeLeft / difficulty.timer * 50) : 0;
    const streakBonus = isCorrect ? streak * 10 : 0;
    const basePoints = isCorrect ? 100 : 0;

    setAnswers(prev => [...prev, {
      question: q, selected: optIdx, correct: isCorrect,
      points: basePoints + timeBonus + streakBonus,
      timeLeft, streak: isCorrect ? streak + 1 : 0,
    }]);

    if (isCorrect) {
      setStreak(prev => {
        const newStreak = prev + 1;
        setBestStreak(best => Math.max(best, newStreak));
        return newStreak;
      });
    } else {
      setStreak(0);
    }
  }, [selected, questions, currentQ, timeLeft, streak, difficulty]);

  const nextQuestion = useCallback(() => {
    if (currentQ + 1 >= questions.length) {
      setPhase('results');
    } else {
      setCurrentQ(prev => prev + 1);
      setSelected(null);
      setTimeLeft(difficulty.timer);
    }
  }, [currentQ, questions, difficulty]);

  const totalScore = answers.reduce((s, a) => s + a.points, 0);
  const correctCount = answers.filter(a => a.correct).length;

  // ═══ SETUP PHASE ═══
  if (phase === 'setup') {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>
          Quiz Mode
        </h3>
        <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
          Test your poker knowledge under pressure. Choose a difficulty and go.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {DIFFICULTIES.map(d => (
            <div key={d.id} onClick={() => setDifficulty(d)} style={{
              padding: 16, borderRadius: 10, cursor: 'pointer', textAlign: 'center',
              background: difficulty.id === d.id ? `${d.color}15` : 'rgba(0,0,0,0.15)',
              border: difficulty.id === d.id ? `2px solid ${d.color}40` : '2px solid transparent',
              transition: 'all 0.2s',
            }}>
              <div style={{ color: d.color, fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{d.label}</div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>{d.questions} questions</div>
              <div style={{ color: '#64748b', fontSize: 11 }}>{d.timer > 0 ? `${d.timer}s per question` : 'No time limit'}</div>
            </div>
          ))}
        </div>

        <button onClick={startQuiz} style={{
          width: '100%', padding: '12px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
          fontSize: 16, fontWeight: 700,
        }}>
          Start Quiz
        </button>
      </div>
    );
  }

  // ═══ RESULTS PHASE ═══
  if (phase === 'results') {
    const accuracy = questions.length > 0 ? Math.round(correctCount / questions.length * 100) : 0;
    const typeBreakdown = {};
    answers.forEach(a => {
      const type = a.question?.type || 'unknown';
      if (!typeBreakdown[type]) typeBreakdown[type] = { correct: 0, total: 0 };
      typeBreakdown[type].total++;
      if (a.correct) typeBreakdown[type].correct++;
    });

    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>Quiz Results</h3>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ color: accuracy >= 80 ? '#22c55e' : accuracy >= 60 ? '#f59e0b' : '#ef4444', fontSize: 48, fontWeight: 800 }}>
            {totalScore}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 14 }}>points</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Accuracy', value: `${accuracy}%`, color: accuracy >= 80 ? '#22c55e' : '#f59e0b' },
            { label: 'Correct', value: `${correctCount}/${questions.length}`, color: '#3b82f6' },
            { label: 'Best Streak', value: bestStreak.toString(), color: '#8b5cf6' },
            { label: 'Difficulty', value: difficulty.label, color: difficulty.color },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 18, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Type breakdown */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>By Category</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(typeBreakdown || {}).map(([type, data]) => (
              <div key={type} style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>
                <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, textTransform: 'capitalize' }}>{type}</div>
                <div style={{ color: data.correct === data.total ? '#22c55e' : '#f59e0b', fontSize: 14, fontWeight: 700 }}>
                  {data.correct}/{data.total}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => setPhase('setup')} style={{
          width: '100%', padding: '12px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 14, fontWeight: 700,
        }}>
          Play Again
        </button>
      </div>
    );
  }

  // ═══ PLAYING PHASE ═══
  const q = questions[currentQ];
  if (!q) return null;

  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700 }}>Q{currentQ + 1}/{questions.length}</span>
          <span style={{ color: '#64748b', fontSize: 11 }}>Score: {totalScore}</span>
          {streak > 1 && (
            <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 11, fontWeight: 700 }}>
              🔥 {streak} streak
            </span>
          )}
        </div>
        {difficulty.timer > 0 && (
          <div style={{
            color: timeLeft <= 5 ? '#ef4444' : '#f1f5f9',
            fontSize: 20, fontWeight: 800, fontFamily: 'monospace',
          }}>
            {timeLeft}s
          </div>
        )}
      </div>

      {/* Timer bar */}
      {difficulty.timer > 0 && (
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 16 }}>
          <div style={{
            height: '100%', borderRadius: 2, transition: 'width 1s linear',
            width: `${(timeLeft / difficulty.timer) * 100}%`,
            background: timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f59e0b' : '#3b82f6',
          }} />
        </div>
      )}

      {/* Question */}
      <div style={{
        background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 16, marginBottom: 16,
      }}>
        <div style={{
          padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginBottom: 8,
          background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase',
        }}>
          {q.type}
        </div>
        <div style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>
          {q.q}
        </div>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {q.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect = i === q.correct;
          const showResult = selected !== null;

          return (
            <button key={i} onClick={() => handleAnswer(i)} disabled={selected !== null} style={{
              padding: '12px 16px', borderRadius: 8, border: 'none',
              cursor: selected !== null ? 'default' : 'pointer', textAlign: 'left',
              background: showResult
                ? isCorrect ? 'rgba(34,197,94,0.15)' : isSelected ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)'
                : 'rgba(255,255,255,0.06)',
              border: showResult
                ? isCorrect ? '1px solid rgba(34,197,94,0.3)' : isSelected ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent'
                : '1px solid rgba(255,255,255,0.06)',
              color: showResult
                ? isCorrect ? '#22c55e' : isSelected ? '#ef4444' : '#64748b'
                : '#f1f5f9',
              fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
            }}>
              {opt}
            </button>
          );
        })}
      </div>

      {/* Explanation */}
      {selected !== null && (
        <div style={{
          background: 'rgba(59,130,246,0.08)', borderRadius: 8, padding: 12, marginBottom: 12,
          border: '1px solid rgba(59,130,246,0.15)',
        }}>
          <div style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.5 }}>{q.explanation}</div>
        </div>
      )}

      {selected !== null && (
        <button onClick={nextQuestion} style={{
          width: '100%', padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 14, fontWeight: 700,
        }}>
          {currentQ + 1 >= questions.length ? 'See Results' : 'Next Question'}
        </button>
      )}
    </div>
  );
}
