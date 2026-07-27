/**
 * RangeMemorizationDrill — GTO Wizard-Style Range Flashcard Trainer
 * ═══════════════════════════════════════════════════════════════════════════
 * Flashcard-style drill for memorizing opening ranges by position.
 * Shows a hand, user decides if it's in the range or not.
 */
import React, { useState, useCallback, useMemo } from 'react';

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];

// Range definitions by position (hands in the opening range)
const RANGES = {
  'UTG RFI': new Set([
    'AA','KK','QQ','JJ','TT','99','88','77',
    'AKs','AQs','AJs','ATs','A5s','A4s',
    'KQs','KJs','KTs',
    'QJs','QTs',
    'JTs',
    'T9s',
    '98s',
    'AKo','AQo','AJo',
    'KQo',
  ]),
  'CO RFI': new Set([
    'AA','KK','QQ','JJ','TT','99','88','77','66','55',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'KQs','KJs','KTs','K9s',
    'QJs','QTs','Q9s',
    'JTs','J9s',
    'T9s','T8s',
    '98s','97s',
    '87s','86s',
    '76s',
    '65s',
    'AKo','AQo','AJo','ATo',
    'KQo','KJo','KTo',
    'QJo','QTo',
    'JTo',
  ]),
  'BTN RFI': new Set([
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'KQs','KJs','KTs','K9s','K8s','K7s','K6s','K5s',
    'QJs','QTs','Q9s','Q8s','Q7s',
    'JTs','J9s','J8s','J7s',
    'T9s','T8s','T7s',
    '98s','97s','96s',
    '87s','86s','85s',
    '76s','75s',
    '65s','64s',
    '54s','53s',
    '43s',
    'AKo','AQo','AJo','ATo','A9o','A8o','A7o',
    'KQo','KJo','KTo','K9o',
    'QJo','QTo','Q9o',
    'JTo','J9o',
    'T9o',
    '98o',
    '87o',
  ]),
  'SB RFI': new Set([
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'KQs','KJs','KTs','K9s','K8s','K7s','K6s','K5s','K4s',
    'QJs','QTs','Q9s','Q8s','Q7s','Q6s',
    'JTs','J9s','J8s','J7s',
    'T9s','T8s','T7s',
    '98s','97s','96s',
    '87s','86s',
    '76s','75s',
    '65s','64s',
    '54s','53s',
    '43s',
    'AKo','AQo','AJo','ATo','A9o','A8o','A7o','A6o','A5o',
    'KQo','KJo','KTo','K9o',
    'QJo','QTo','Q9o',
    'JTo','J9o',
    'T9o',
    '98o',
  ]),
  'BB vs BTN': new Set([
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'KQs','KJs','KTs','K9s','K8s','K7s','K6s','K5s','K4s','K3s',
    'QJs','QTs','Q9s','Q8s','Q7s','Q6s','Q5s',
    'JTs','J9s','J8s','J7s','J6s',
    'T9s','T8s','T7s','T6s',
    '98s','97s','96s','95s',
    '87s','86s','85s',
    '76s','75s','74s',
    '65s','64s','63s',
    '54s','53s','52s',
    '43s','42s',
    '32s',
    'AKo','AQo','AJo','ATo','A9o','A8o','A7o','A6o','A5o','A4o','A3o',
    'KQo','KJo','KTo','K9o','K8o','K7o',
    'QJo','QTo','Q9o','Q8o',
    'JTo','J9o','J8o',
    'T9o','T8o',
    '98o','97o',
    '87o','86o',
    '76o',
    '65o',
  ]),
};

const RANGE_NAMES = Object.keys(RANGES || {});

function generateHand() {
  const i = Math.floor(Math.random() * 13);
  const j = Math.floor(Math.random() * 13);
  if (i === j) return RANKS[i] + RANKS[j]; // pair
  const suited = Math.random() < 0.5;
  const hi = Math.min(i, j);
  const lo = Math.max(i, j);
  return RANKS[hi] + RANKS[lo] + (suited ? 's' : 'o');
}

function getSuitSymbol(idx) {
  return ['♠', '♥', '♦', '♣'][idx % 4];
}

function getSuitColor(idx) {
  return [1, 2].includes(idx % 4) ? '#ef4444' : '#fff';
}

function RangeMemorizationDrill() {
  const [rangeName, setRangeName] = useState(RANGE_NAMES[0]);
  const [hand, setHand] = useState(() => generateHand());
  const [result, setResult] = useState(null); // { correct, answer, userAnswer }
  const [stats, setStats] = useState({ correct: 0, wrong: 0, streak: 0, bestStreak: 0 });
  const [history, setHistory] = useState([]);

  const range = RANGES[rangeName];
  const isInRange = range.has(hand);

  const handleAnswer = useCallback((userSaysIn) => {
    const correct = userSaysIn === isInRange;
    setResult({ correct, answer: isInRange ? 'IN range' : 'NOT in range', userAnswer: userSaysIn ? 'IN' : 'OUT' });
    setStats(prev => {
      const newStreak = correct ? prev.streak + 1 : 0;
      return {
        correct: prev.correct + (correct ? 1 : 0),
        wrong: prev.wrong + (correct ? 0 : 1),
        streak: newStreak,
        bestStreak: Math.max(prev.bestStreak, newStreak),
      };
    });
    setHistory(prev => [{ hand, inRange: isInRange, correct, rangeName }, ...prev].slice(0, 20));
  }, [hand, isInRange, rangeName]);

  const nextHand = useCallback(() => {
    setHand(generateHand());
    setResult(null);
  }, []);

  const resetStats = useCallback(() => {
    setStats({ correct: 0, wrong: 0, streak: 0, bestStreak: 0 });
    setHistory([]);
  }, []);

  const total = stats.correct + stats.wrong;
  const accuracy = total > 0 ? Math.round((stats.correct / total) * 100) : 0;

  const handDisplay = useMemo(() => {
    if (!hand) return '';
    if (hand.length === 2) return `${hand[0]}${hand[1]}`; // pair
    return hand;
  }, [hand]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#10b981' }}>Range Memorization Drill</h3>
          <button
            onClick={resetStats}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
          >Reset</button>
        </div>

        {/* Range Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {RANGE_NAMES.map(r => (
            <button
              key={r}
              onClick={() => { setRangeName(r); setResult(null); setHand(generateHand()); }}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: rangeName === r ? '#10b981' : 'rgba(255,255,255,0.06)',
                color: rangeName === r ? '#000' : 'rgba(255,255,255,0.7)',
                border: 'none',
              }}
            >{r}</button>
          ))}
        </div>

        {/* Stats Bar */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, padding: 12, background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.15)', flexWrap: 'wrap' }}>
          {[
            { label: 'Correct', value: stats.correct, color: '#10b981' },
            { label: 'Wrong', value: stats.wrong, color: '#ef4444' },
            { label: 'Accuracy', value: `${accuracy}%`, color: accuracy >= 80 ? '#10b981' : accuracy >= 60 ? '#f59e0b' : '#ef4444' },
            { label: 'Streak', value: stats.streak, color: '#f59e0b' },
            { label: 'Best', value: stats.bestStreak, color: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', flex: 1, minWidth: 60 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Hand Display */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            display: 'inline-block', padding: '30px 50px', borderRadius: 16,
            background: result ? (result.correct ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)') : 'rgba(255,255,255,0.05)',
            border: `2px solid ${result ? (result.correct ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)') : 'rgba(255,255,255,0.1)'}`,
          }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: '#fff', fontFamily: 'monospace', letterSpacing: 4 }}>
              {handDisplay}
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
              Is this hand in the <span style={{ color: '#10b981', fontWeight: 700 }}>{rangeName}</span> range?
            </div>
          </div>
        </div>

        {/* Result Display */}
        {result && (
          <div style={{
            textAlign: 'center', marginBottom: 16, padding: 12, borderRadius: 8,
            background: result.correct ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${result.correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: result.correct ? '#10b981' : '#ef4444' }}>
              {result.correct ? '✓ Correct!': '✕ Wrong!'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
              {handDisplay} is <span style={{ fontWeight: 700, color: isInRange ? '#10b981' : '#ef4444' }}>{result.answer}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
          {result ? (
            <button
              onClick={nextHand}
              style={{
                padding: '14px 40px', borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700,
                cursor: 'pointer', background: '#8b5cf6', color: '#fff',
              }}
            >Next Hand →</button>
          ) : (
            <>
              <button
                onClick={() => handleAnswer(true)}
                style={{
                  padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
                  cursor: 'pointer', background: '#10b981', color: '#fff', flex: 1, maxWidth: 200,
                }}
              >✓ In Range</button>
              <button
                onClick={() => handleAnswer(false)}
                style={{
                  padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
                  cursor: 'pointer', background: '#ef4444', color: '#fff', flex: 1, maxWidth: 200,
                }}
              >✕ Not In Range</button>
            </>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Recent ({history.length})</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {history.map((h, i) => (
                <div key={i} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: 'monospace',
                  background: h.correct ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                  color: h.correct ? '#10b981' : '#ef4444',
                  border: `1px solid ${h.correct ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                }}>
                  {h.hand} {h.correct ? '✓': '✕'}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Range Memorization Drill failed to load: {err.message}</div>;
  }
}

export default RangeMemorizationDrill;
