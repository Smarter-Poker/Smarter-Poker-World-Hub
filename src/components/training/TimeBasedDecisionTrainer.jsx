/**
 * TimeBasedDecisionTrainer — GTO Wizard-Style Timed Decision Pressure Drill
 * ═══════════════════════════════════════════════════════════════════════════
 * Practice making GTO decisions under time pressure. Configurable timer,
 * tracks speed vs accuracy, and identifies slow-decision spots.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';

const DECISIONS = [
  { id: 1, board: 'K♠ 9♦ 4♣', hand: 'A♠ K♥', position: 'BTN vs BB', action: 'Villain checks', correct: 'bet33', options: ['bet33', 'bet67', 'check'], explanation: 'Top pair top kicker on dry board — c-bet 33% with high frequency.' },
  { id: 2, board: 'J♥ T♥ 8♠', hand: '7♣ 6♣', position: 'CO vs BB', action: 'Villain checks', correct: 'check', options: ['bet33', 'bet67', 'check'], explanation: 'Open-ended but no backdoor flush draw on wet board. Check and realize equity.' },
  { id: 3, board: 'A♦ 7♠ 2♣', hand: 'Q♠ Q♥', position: 'UTG vs BB', action: 'Villain bets 67%', correct: 'call', options: ['raise', 'call', 'fold'], explanation: 'QQ is strong but ace on board. Call and evaluate turn. Raising bloats pot unnecessarily.' },
  { id: 4, board: 'T♣ 8♣ 3♦ 5♣', hand: 'A♣ 2♦', position: 'BTN vs BB', action: 'Villain checks turn', correct: 'bet67', options: ['bet33', 'bet67', 'check'], explanation: 'Turned nut flush draw with backdoor straight. Bet 67% — semi-bluff with massive equity.' },
  { id: 5, board: 'K♥ Q♦ J♠ 9♣ 4♥', hand: 'A♠ T♣', position: 'IP vs BB', action: 'Villain bets 75%', correct: 'raise', options: ['raise', 'call', 'fold'], explanation: 'Nut straight on river. Raise for value — villain bets wide here with Kx, Qx.' },
  { id: 6, board: '6♠ 5♠ 3♦', hand: 'A♥ A♦', position: 'SB vs BB', action: 'Villain check-raises', correct: 'call', options: ['reraise', 'call', 'fold'], explanation: 'AA is strong but board is very connected. Call the check-raise — don\'t inflate pot on draw-heavy board.' },
  { id: 7, board: 'Q♣ 8♦ 2♠ 7♣ K♣', hand: '9♣ 6♣', position: 'BB vs BTN', action: 'Villain bets 50%', correct: 'raise', options: ['raise', 'call', 'fold'], explanation: 'Rivered flush. Raise for value — villain is betting for thin value with Kx or Qx.' },
  { id: 8, board: 'A♣ K♦ T♥', hand: '5♠ 5♦', position: 'BB vs CO', action: 'Villain c-bets 33%', correct: 'fold', options: ['raise', 'call', 'fold'], explanation: '55 has almost no equity on AKT board. No draws, dominated. Clean fold.' },
  { id: 9, board: '9♥ 8♥ 7♦ 2♣', hand: 'T♥ 6♥', position: 'BTN vs BB', action: 'Villain donk bets 50%', correct: 'raise', options: ['raise', 'call', 'fold'], explanation: 'Made straight with flush redraw. Raise for value and protection against villain\'s draws.' },
  { id: 10, board: 'J♠ 4♦ 2♣ 8♠ Q♠', hand: 'A♠ 3♠', position: 'CO vs BB', action: 'Villain checks river', correct: 'bet67', options: ['bet33', 'bet67', 'check'], explanation: 'Rivered nut flush. Bet 67% for max value — villain checks back flushes that beat us.' },
];

const TIME_LIMITS = [5, 10, 15, 20, 30];

function TimeBasedDecisionTrainer() {
  const [timeLimit, setTimeLimit] = useState(10);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0, totalTime: 0, timedOut: 0 });
  const [history, setHistory] = useState([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const decision = DECISIONS[currentIdx];

  const startRound = useCallback(() => {
    setIsRunning(true);
    setTimeLeft(timeLimit);
    setSelected(null);
    setShowResult(false);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setIsRunning(false);
          setShowResult(true);
          setStats(p => ({ ...p, total: p.total + 1, timedOut: p.timedOut + 1, totalTime: p.totalTime + timeLimit }));
          setHistory(p => [{ hand: decision.hand, board: decision.board, correct: false, time: timeLimit, timedOut: true }, ...p].slice(0, 15));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [timeLimit, decision]);

  const handleSelect = useCallback((choice) => {
    if (!isRunning || showResult) return;
    clearInterval(timerRef.current);
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    const isCorrect = choice === decision.correct;
    setSelected(choice);
    setShowResult(true);
    setIsRunning(false);
    setStats(p => ({
      correct: p.correct + (isCorrect ? 1 : 0),
      total: p.total + 1,
      totalTime: p.totalTime + elapsed,
      timedOut: p.timedOut,
    }));
    setHistory(p => [{ hand: decision.hand, board: decision.board.slice(0, 10), correct: isCorrect, time: elapsed, timedOut: false }, ...p].slice(0, 15));
  }, [isRunning, showResult, decision]);

  const nextDecision = useCallback(() => {
    setCurrentIdx((currentIdx + 1) % DECISIONS.length);
    startRound();
  }, [currentIdx, startRound]);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const avgTime = stats.total > 0 ? (stats.totalTime / stats.total).toFixed(1) : '0';
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const timerPct = (timeLeft / timeLimit) * 100;

  const labelMap = { bet33: 'Bet 33%', bet67: 'Bet 67%', check: 'Check', call: 'Call', raise: 'Raise', fold: 'Fold', reraise: '4-Bet' };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#f472b6' }}>Timed Decisions</h3>
          <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            <span>{accuracy}% accuracy</span>
            <span>Avg: {avgTime}s</span>
          </div>
        </div>

        {/* Time Limit Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Timer:</span>
          {TIME_LIMITS.map(t => (
            <button key={t} onClick={() => { setTimeLimit(t); setTimeLeft(t); }} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: timeLimit === t ? '#f472b6' : 'rgba(255,255,255,0.06)',
              color: timeLimit === t ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{t}s</button>
          ))}
        </div>

        {/* Timer Bar */}
        {isRunning && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${timerPct}%`, borderRadius: 4, transition: 'width 1s linear',
                background: timerPct > 50 ? '#10b981' : timerPct > 25 ? '#f59e0b' : '#ef4444',
              }} />
            </div>
            <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 900, color: timerPct > 25 ? '#fff' : '#ef4444', marginTop: 4 }}>{timeLeft}s</div>
          </div>
        )}

        {/* Decision Display */}
        <div style={{ textAlign: 'center', padding: 16, background: 'rgba(244,114,182,0.06)', borderRadius: 10, border: '1px solid rgba(244,114,182,0.15)', marginBottom: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: 4, marginBottom: 6 }}>{decision.board}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f472b6', marginBottom: 6 }}>Hero: {decision.hand}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{decision.position} • {decision.action}</div>
        </div>

        {/* Action Buttons or Start */}
        {!isRunning && !showResult && (
          <div style={{ textAlign: 'center' }}>
            <button onClick={startRound} style={{
              padding: '14px 40px', borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', background: '#f472b6', color: '#fff',
            }}>Start Round</button>
          </div>
        )}

        {isRunning && !showResult && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {decision.options.map(opt => (
              <button key={opt} onClick={() => handleSelect(opt)} style={{
                padding: '14px 24px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', background: 'rgba(244,114,182,0.15)', color: '#f472b6', flex: 1, maxWidth: 140,
              }}>{labelMap[opt] || opt}</button>
            ))}
          </div>
        )}

        {/* Result */}
        {showResult && (
          <div>
            <div style={{
              padding: 12, borderRadius: 8, marginBottom: 12, textAlign: 'center',
              background: selected === decision.correct ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${selected === decision.correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: selected === decision.correct ? '#10b981' : '#ef4444' }}>
                {!selected ? '⏰ Timed Out!': selected === decision.correct ? '✓ Correct!': '✕ Wrong'}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{decision.explanation}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={nextDecision} style={{
                padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', background: '#f472b6', color: '#fff',
              }}>Next →</button>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Recent ({history.length})</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {history.map((h, i) => (
                <span key={i} style={{
                  padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: h.timedOut ? 'rgba(245,158,11,0.12)' : h.correct ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                  color: h.timedOut ? '#f59e0b' : h.correct ? '#10b981' : '#ef4444',
                }}>{h.time}s {h.timedOut ? '⏰': h.correct ? '✓': '✕'}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Timed Decisions failed to load: {err.message}</div>;
  }
}

export default TimeBasedDecisionTrainer;
