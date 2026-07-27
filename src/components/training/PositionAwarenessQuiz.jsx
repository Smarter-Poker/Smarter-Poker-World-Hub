/**
 * PositionAwarenessQuiz — GTO Wizard-Style Position Knowledge Quiz
 * ═══════════════════════════════════════════════════════════════════════════
 * Test understanding of positional advantages, opening ranges by position,
 * and how position affects strategy decisions.
 */
import React, { useState, useMemo } from 'react';

const QUESTIONS = [
  {
    q: 'Which position has the highest win rate in a full ring (9-max) game?',
    options: ['UTG', 'CO', 'BTN', 'BB'],
    correct: 2,
    explanation: 'The Button (BTN) has the highest win rate because it acts last postflop on every street. This informational advantage allows wider opening, better bluffing, and more accurate value betting.',
  },
  {
    q: 'What is the approximate open-raise range for UTG in a 6-max game?',
    options: ['~8% (very tight)', '~15% (tight)', '~25% (medium)', '~40% (wide)'],
    correct: 1,
    explanation: 'UTG opens approximately 15% in 6-max — tight because 5 players can wake up with a hand behind you. This includes big pairs, big broadway, suited aces, and some suited connectors.',
  },
  {
    q: 'In a 3-bet pot where CO 3-bets and BTN calls, who has the range advantage on A-high flops?',
    options: ['CO (3-bettor)', 'BTN (caller)', 'Equal', 'Depends on suits'],
    correct: 0,
    explanation: 'The 3-bettor (CO) has a significant range advantage on A-high boards because their range contains more AA, AK, AQs combos. The BTN caller often has capped Ax hands.',
  },
  {
    q: 'From which position should you NEVER flat-call a raise in GTO poker?',
    options: ['UTG', 'CO', 'SB', 'BB'],
    correct: 2,
    explanation: 'The SB should almost never flat-call — only 3-bet or fold. Flatting from SB leaves you OOP for the entire hand with the BB still to act behind. 3-betting gives fold equity and initiative.',
  },
  {
    q: 'What is the approximate opening range for BTN in 6-max?',
    options: ['~25%', '~35%', '~45%', '~55%'],
    correct: 2,
    explanation: 'BTN opens approximately 45% of hands — very wide because only the blinds remain. This includes most broadway, suited cards, many offsuit broadways, and small pairs. Position postflop compensates for hand quality.',
  },
  {
    q: 'When should BB defend the widest against a raise?',
    options: ['vs UTG open', 'vs MP open', 'vs CO open', 'vs BTN open'],
    correct: 3,
    explanation: 'BB should defend widest vs BTN opens because: (1) BTN opens widest so their range is weakest, (2) you close the action, (3) you already have 1bb invested, and (4) you get a positional discount.',
  },
  {
    q: 'Which concept is MOST important in early position play?',
    options: ['Implied odds', 'Range tightness', 'Bluff frequency', 'Pot control'],
    correct: 1,
    explanation: 'Range tightness is paramount in early position. With many players behind, you need hands strong enough to withstand 3-bets and play well out of position. Implied odds are secondary.',
  },
  {
    q: 'In a HU pot (BTN vs BB), who has the nut advantage on 7♠5♣2♦?',
    options: ['BTN (always)', 'BB', 'Equal', 'Depends on preflop action'],
    correct: 1,
    explanation: 'BB has the nut advantage on low connected boards like 752. BB defends with many low suited connectors and pairs (75s, 52s, 77, 55, 22) that BTN raises less frequently.',
  },
  {
    q: 'What is the "positional discount" in poker?',
    options: [
      'Playing fewer hands from early position',
      'The extra value gained from acting last',
      'BB getting better odds to call due to posted blind',
      'Discounting opponent range based on position',
    ],
    correct: 2,
    explanation: 'The positional discount refers to the BB getting better pot odds to call raises because they already have 1bb invested. This discount allows BB to defend wider than other positions.',
  },
  {
    q: 'How does being IP (in position) affect your bluffing frequency?',
    options: [
      'You should bluff less IP',
      'You should bluff more IP',
      'Position does not affect bluffing',
      'You should only bluff OOP',
    ],
    correct: 1,
    explanation: 'Being IP allows you to bluff more because you get to see your opponent act first. You can bluff when they show weakness (checking) and give up when they show strength. This information advantage makes bluffs more efficient.',
  },
];

function PositionAwarenessQuiz() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [showAll, setShowAll] = useState(false);

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
              <button key={i} onClick={() => handleSelect(i)} style={{
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
          <div>
            <div style={{ padding: 12, background: 'rgba(129,140,248,0.06)', borderRadius: 8, border: '1px solid rgba(129,140,248,0.12)', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', marginBottom: 4 }}>Explanation</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{question.explanation}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={nextQuestion} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#818cf8', color: '#fff' }}>Next Question →</button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Position Quiz failed to load: {err.message}</div>;
  }
}

export default PositionAwarenessQuiz;
