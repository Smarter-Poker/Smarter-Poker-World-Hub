/**
 * HandRankingQuiz — GTO Wizard-Style Hand Ranking & Equity Quiz
 * ═══════════════════════════════════════════════════════════════════════════
 * Quiz on hand rankings, relative hand strength, and equity matchups.
 * Multiple question types: rank ordering, equity estimation, board reading.
 */
import React, { useState, useCallback, useMemo } from 'react';

const QUESTIONS = [
  {
    id: 1, type: 'equity', category: 'Preflop',
    question: 'What is the approximate equity of A♠K♠ vs Q♥Q♦ all-in preflop?',
    options: ['35%', '40%', '46%', '52%'],
    answer: 2, // 46%
    explanation: 'AKs vs QQ is a classic coin-flip weighted toward the pair. AKs has ~46% equity thanks to flush and straight outs. Suited adds ~3% over AKo.',
  },
  {
    id: 2, type: 'ranking', category: 'Board Reading',
    question: 'Board: K♠ Q♥ J♦ T♣. Which hand is the nuts?',
    options: ['A♠ 9♠ (Broadway straight)', 'K♥ K♦ (Set of Kings)', 'Q♠ Q♦ (Set of Queens)', 'A♥ K♣ (Top pair + straight)'],
    answer: 0,
    explanation: 'A-high straight (AKQJT) is the nuts on this board. Sets lose to the straight. AK also makes the straight but A9 specifically makes the nut straight with A-high.',
  },
  {
    id: 3, type: 'equity', category: 'Postflop',
    question: 'Board: 9♥ 8♥ 2♣. What is T♥7♥ equity vs A♠A♦?',
    options: ['52%', '58%', '64%', '70%'],
    answer: 2, // ~64%
    explanation: 'T7hh has an open-ended straight flush draw on 982hh. With straight outs, flush outs, and straight flush outs combined, T7hh has ~64% equity against pocket aces.',
  },
  {
    id: 4, type: 'ranking', category: 'Hand Strength',
    question: 'Rank these hands from strongest to weakest on A♣ K♣ 7♣ 3♠ 2♦:',
    options: [
      'Q♣J♣ (Flush) > A♠K♠ (Two Pair) > A♥7♥ (Two Pair) > K♥Q♥ (Pair)',
      'A♠K♠ (Two Pair) > Q♣J♣ (Flush) > K♥Q♥ (Pair) > A♥7♥ (Two Pair)',
      'Q♣J♣ (Flush) > A♥7♥ (Two Pair) > A♠K♠ (Two Pair) > K♥Q♥ (Pair)',
      'A♠K♠ (Two Pair) > A♥7♥ (Two Pair) > Q♣J♣ (Flush) > K♥Q♥ (Pair)',
    ],
    answer: 0,
    explanation: 'Flush (QJcc) beats all two pairs. AK two pair and A7 two pair are ranked by the higher second pair — AK beats A7. KQ is just one pair of kings.',
  },
  {
    id: 5, type: 'equity', category: 'Preflop',
    question: 'What is the equity of 7♠2♦ vs A♥A♣ all-in preflop?',
    options: ['8%', '12%', '16%', '22%'],
    answer: 1, // ~12%
    explanation: '72o is the worst starting hand in poker. Against AA it has approximately 12% equity — mostly from making two pair or a miracle straight.',
  },
  {
    id: 6, type: 'ranking', category: 'Board Reading',
    question: 'Board: 6♠ 5♠ 4♠ 3♠. What beats what?',
    options: [
      '7♠8♠ (Straight Flush) > A♠K♥ (Nut Flush) > 8♥7♥ (Straight)',
      'A♠K♥ (Nut Flush) > 7♠8♠ (Straight Flush) > 8♥7♥ (Straight)',
      '8♥7♥ (Straight) > A♠K♥ (Nut Flush) > 7♠8♠ (Straight Flush)',
      '7♠8♠ (Straight Flush) > 8♥7♥ (Straight) > A♠K♥ (Nut Flush)',
    ],
    answer: 0,
    explanation: 'Straight flush (7♠8♠ makes 4-5-6-7-8 of spades) beats the nut flush (A♠ high flush), which beats a regular straight (87 for 4-5-6-7-8 no flush).',
  },
  {
    id: 7, type: 'equity', category: 'Postflop',
    question: 'Board: A♥ T♠ 5♦. What is K♥Q♥ equity vs A♣T♣?',
    options: ['3%', '7%', '11%', '16%'],
    answer: 1, // ~7%
    explanation: 'KQ has just 3 outs to a gutshot straight (J) plus runner-runner possibilities. Against flopped top two pair, KQ has roughly 7% equity.',
  },
  {
    id: 8, type: 'ranking', category: 'Hand Strength',
    question: 'Which hand has the most equity on 8♠ 7♠ 6♣ with two cards to come?',
    options: ['A♠A♥ (Overpair)', '9♠5♠ (Straight + Flush Draw)', 'T♣9♣ (Open-Ender)', '8♥8♦ (Set)'],
    answer: 1,
    explanation: '9♠5♠ has a made straight (5-6-7-8-9) PLUS a flush draw. It already has the nuts and can improve to a straight flush. This dominates even the set of 8s.',
  },
  {
    id: 9, type: 'equity', category: 'Preflop',
    question: 'J♠J♥ vs A♣K♣ vs 8♠8♥ — who has the most equity 3-way?',
    options: ['JJ (~42%)', 'AKs (~32%)', '88 (~26%)', 'All roughly equal (~33%)'],
    answer: 0,
    explanation: 'JJ has the most equity at ~42% as the highest pair. AKs has ~32% with overcards and flush potential. 88 is the weakest at ~26%, dominated by JJ and needing to dodge overcards.',
  },
  {
    id: 10, type: 'ranking', category: 'Board Reading',
    question: 'Board: Q♦ Q♠ Q♣ Q♥ 5♠. Who wins?',
    options: ['A♠K♠ (Quad Queens + Ace kicker)', 'K♥K♦ (Quad Queens + King kicker)', '5♥5♦ (Full House Q-Q-Q-5-5)', 'A♥2♥ (Quad Queens + Ace kicker)'],
    answer: 0,
    explanation: 'With all four queens on the board, everyone plays quad queens. The winner is determined by the highest kicker. AK and A2 both play the Ace, but AK and A2 tie since only 5 cards play (QQQQА). Actually all Ace-holders tie!',
  },
];

function HandRankingQuiz() {
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0, byCategory: {} });

  const question = QUESTIONS[currentQ];

  const handleSelect = useCallback((idx) => {
    if (showResult) return;
    setSelected(idx);
    setShowResult(true);
    const isCorrect = idx === question.answer;
    setStats(prev => {
      const cat = question.category;
      const catStats = prev.byCategory[cat] || { correct: 0, total: 0 };
      return {
        correct: prev.correct + (isCorrect ? 1 : 0),
        total: prev.total + 1,
        byCategory: {
          ...prev.byCategory,
          [cat]: { correct: catStats.correct + (isCorrect ? 1 : 0), total: catStats.total + 1 },
        },
      };
    });
  }, [showResult, question]);

  const nextQuestion = useCallback(() => {
    setCurrentQ((currentQ + 1) % QUESTIONS.length);
    setSelected(null);
    setShowResult(false);
  }, [currentQ]);

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#a855f7' }}>Hand Ranking Quiz</h3>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            <span>Q{currentQ + 1}/{QUESTIONS.length}</span>
            <span style={{ color: accuracy >= 70 ? '#10b981' : '#f59e0b' }}>{stats.correct}/{stats.total} ({accuracy}%)</span>
          </div>
        </div>

        {/* Category + Type Badge */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>{question.category}</span>
          <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>{question.type === 'equity' ? 'Equity' : 'Ranking'}</span>
        </div>

        {/* Question */}
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 16, lineHeight: 1.5, padding: 14, background: 'rgba(168,85,247,0.06)', borderRadius: 8, border: '1px solid rgba(168,85,247,0.12)' }}>
          {question.question}
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {question.options.map((opt, idx) => {
            let bg = 'rgba(255,255,255,0.04)';
            let border = 'rgba(255,255,255,0.08)';
            let color = 'rgba(255,255,255,0.8)';
            if (showResult) {
              if (idx === question.answer) { bg = 'rgba(16,185,129,0.12)'; border = 'rgba(16,185,129,0.4)'; color = '#10b981'; }
              else if (idx === selected) { bg = 'rgba(239,68,68,0.12)'; border = 'rgba(239,68,68,0.4)'; color = '#ef4444'; }
            } else if (idx === selected) {
              bg = 'rgba(168,85,247,0.1)'; border = 'rgba(168,85,247,0.3)';
            }
            return (
              <button key={idx} onClick={() => handleSelect(idx)} style={{
                padding: '12px 16px', borderRadius: 8, border: `1px solid ${border}`, background: bg,
                color, fontSize: 13, textAlign: 'left', cursor: showResult ? 'default' : 'pointer',
                fontWeight: showResult && idx === question.answer ? 700 : 400,
                transition: 'all 0.15s ease',
              }}>
                <span style={{ fontWeight: 700, marginRight: 8, color: 'rgba(255,255,255,0.4)' }}>{String.fromCharCode(65 + idx)}</span>
                {opt}
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {showResult && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              padding: 12, borderRadius: 8,
              background: selected === question.answer ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${selected === question.answer ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: selected === question.answer ? '#10b981' : '#ef4444', marginBottom: 6 }}>
                {selected === question.answer ? '✓ Correct!': '✕ Incorrect'}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{question.explanation}</div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button onClick={nextQuestion} style={{
                padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', background: '#a855f7', color: '#fff',
              }}>Next Question →</button>
            </div>
          </div>
        )}

        {/* Category Breakdown */}
        {stats.total > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(stats.byCategory || {}).map(([cat, s]) => (
              <div key={cat} style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 11 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{cat}: </span>
                <span style={{ fontWeight: 700, color: (s.correct / s.total) >= 0.7 ? '#10b981' : '#f59e0b' }}>{s.correct}/{s.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Hand Ranking Quiz failed to load: {err.message}</div>;
  }
}

export default HandRankingQuiz;
