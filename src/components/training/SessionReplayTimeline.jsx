/**
 * SESSION REPLAY TIMELINE
 * ═══════════════════════════════════════════════════════════════════════════
 * Visual timeline of an entire training session:
 * - Chronological hand timeline with EV markers
 * - Cumulative EV graph overlay
 * - Filter by correct/mistake/inaccuracy
 * - Click any hand to see detail
 * - Session summary stats
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo } from 'react';

// ═══ SAMPLE SESSION DATA ═══
const SESSION_HANDS = [
  { id: 1, hand: 'A♠K♥', board: 'K♠ 8♦ 3♣ J♥ 2♠', position: 'BTN', action: 'Bet → Call', result: 'correct', ev: 0.0, evLoss: 0, explanation: 'Standard value bet line with TPTK. Sized well on all streets.' },
  { id: 2, hand: '7♠6♠', board: 'T♠ 9♥ 2♣', position: 'CO', action: 'Bet 33%', result: 'correct', ev: 0.0, evLoss: 0, explanation: 'Good semi-bluff c-bet with backdoor flush + gutshot.' },
  { id: 3, hand: 'Q♣J♦', board: 'A♠ 8♦ 4♣', position: 'BTN', action: 'Check', result: 'inaccuracy', ev: -0.3, evLoss: 0.3, explanation: 'Should bet 33% here. QJ has enough equity as a bluff with two overcards.' },
  { id: 4, hand: 'A♥A♦', board: 'K♠ Q♥ J♦', position: 'UTG', action: 'Bet 67%', result: 'correct', ev: 0.0, evLoss: 0, explanation: 'Good value sizing on connected board. Want to charge draws.' },
  { id: 5, hand: '9♦8♦', board: '7♣ 6♠ 2♥', position: 'BB', action: 'Check-Raise', result: 'correct', ev: 0.0, evLoss: 0, explanation: 'Perfect check-raise spot with open-ended straight draw.' },
  { id: 6, hand: 'K♠Q♠', board: 'A♣ 9♥ 5♦ 3♠', position: 'CO', action: 'Bet 75%', result: 'mistake', ev: -2.1, evLoss: 2.1, explanation: 'Over-barreling with KQ on ace-high board. Should check turn to control pot.' },
  { id: 7, hand: 'T♣T♥', board: 'J♠ 8♦ 4♣', position: 'BTN', action: 'Bet 33%', result: 'correct', ev: 0.0, evLoss: 0, explanation: 'Good small bet with medium pair. Denies equity efficiently.' },
  { id: 8, hand: '5♥4♥', board: 'A♠ K♦ 8♣', position: 'BB', action: 'Fold', result: 'correct', ev: 0.0, evLoss: 0, explanation: 'Clean fold with no equity and no backdoors.' },
  { id: 9, hand: 'A♣8♣', board: 'K♥ 7♣ 2♣ J♦ 9♣', position: 'BTN', action: 'Bet Pot', result: 'inaccuracy', ev: -0.5, evLoss: 0.5, explanation: 'Nut flush should bet 67% not pot. Overbetting narrows calling range too much.' },
  { id: 10, hand: 'K♦J♦', board: 'Q♠ T♥ 3♣', position: 'MP', action: 'Call', result: 'correct', ev: 0.0, evLoss: 0, explanation: 'Good call with open-ended straight draw. Great implied odds.' },
  { id: 11, hand: '3♠3♦', board: 'A♣ K♥ Q♦', position: 'UTG', action: 'Fold', result: 'correct', ev: 0.0, evLoss: 0, explanation: 'Easy fold on broadway board with pocket threes.' },
  { id: 12, hand: 'Q♥T♥', board: 'J♠ 9♦ 2♣ 8♥', position: 'BTN', action: 'Check', result: 'mistake', ev: -1.8, evLoss: 1.8, explanation: 'Turned the nuts! Must bet for value. Checking is a significant mistake.' },
  { id: 13, hand: 'A♦Q♣', board: 'A♠ 7♥ 4♦ 9♣ K♠', position: 'CO', action: 'Bet 50%', result: 'correct', ev: 0.0, evLoss: 0, explanation: 'Good river value with top pair good kicker.' },
  { id: 14, hand: '8♣7♣', board: 'K♠ 5♦ 2♣', position: 'BTN', action: 'Bet 33%', result: 'inaccuracy', ev: -0.4, evLoss: 0.4, explanation: 'C-bet with 87 on K52 is slightly too wide. Better to check this combo.' },
  { id: 15, hand: 'J♥J♠', board: 'T♦ 6♣ 3♥ A♠', position: 'MP', action: 'Check', result: 'correct', ev: 0.0, evLoss: 0, explanation: 'Good pot control with JJ when ace turns. No need to put in more money.' },
];

function getResultConfig(result) {
  if (result === 'correct') return { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', label: '✓ Correct' };
  if (result === 'inaccuracy') return { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: '~ Inaccuracy' };
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: '✕ Mistake'};
}

// ═══ CUMULATIVE EV GRAPH ═══
function EVTimeline({ hands }) {
  const W = 560, H = 80, PAD = 20;
  const points = [];
  let cumEV = 0;
  hands.forEach((h, i) => { cumEV += h.ev; points.push({ x: i, y: cumEV }); });

  if (points.length === 0) return null;
  const minY = Math.min(0, ...points.map(p => p.y)) - 0.5;
  const maxY = Math.max(0, ...points.map(p => p.y)) + 0.5;
  const xScale = (W - PAD * 2) / Math.max(1, points.length - 1);
  const yScale = (H - PAD * 2) / Math.max(0.1, maxY - minY);

  const toX = (i) => PAD + i * xScale;
  const toY = (v) => H - PAD - (v - minY) * yScale;
  const zeroY = toY(0);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.x)} ${toY(p.y)}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <line x1={PAD} x2={W - PAD} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeDasharray="3" />
      <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
      {points.map((p, i) => {
        const h = hands[i];
        return (
          <circle key={i} cx={toX(p.x)} cy={toY(p.y)} r={3}
            fill={h.result === 'correct' ? '#22c55e' : h.result === 'inaccuracy' ? '#f59e0b' : '#ef4444'}
            stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
        );
      })}
      <text x={W - PAD} y={toY(cumEV) - 6} fill={cumEV >= 0 ? '#22c55e' : '#ef4444'} fontSize="9" fontWeight="700" textAnchor="end">
        {cumEV >= 0 ? '+' : ''}{cumEV.toFixed(1)}bb
      </text>
    </svg>
  );
}

// ═══ MAIN COMPONENT ═══
export default function SessionReplayTimeline() {
  const [selectedHand, setSelectedHand] = useState(null);
  const [filterResult, setFilterResult] = useState(null);

  const filtered = filterResult ? SESSION_HANDS.filter(h => h.result === filterResult) : SESSION_HANDS;
  const totalEVLoss = SESSION_HANDS.reduce((a, h) => a + h.evLoss, 0);
  const correctCount = SESSION_HANDS.filter(h => h.result === 'correct').length;
  const accuracy = Math.round((correctCount / SESSION_HANDS.length) * 100);
  const mistakes = SESSION_HANDS.filter(h => h.result === 'mistake').length;
  const inaccuracies = SESSION_HANDS.filter(h => h.result === 'inaccuracy').length;

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Session Replay</h3>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Chronological timeline of your training session</div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 16 }}>
          {[
            { label: 'Hands', value: SESSION_HANDS.length, color: '#f1f5f9' },
            { label: 'Accuracy', value: `${accuracy}%`, color: '#22c55e' },
            { label: 'Mistakes', value: mistakes, color: '#ef4444' },
            { label: 'Inaccuracies', value: inaccuracies, color: '#f59e0b' },
            { label: 'EV Loss', value: `${totalEVLoss.toFixed(1)}bb`, color: '#ef4444' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 16, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* EV Timeline */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 6, marginBottom: 16 }}>
          <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, marginBottom: 2, marginLeft: 4 }}>Cumulative EV</div>
          <EVTimeline hands={SESSION_HANDS} />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {[null, 'correct', 'inaccuracy', 'mistake'].map(r => {
            const cfg = r ? getResultConfig(r) : { color: '#f1f5f9', label: `All (${SESSION_HANDS.length})` };
            return (
              <button key={r || 'all'} onClick={() => setFilterResult(r)} style={{
                padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: filterResult === r ? `${cfg.color}20` : 'rgba(255,255,255,0.04)',
                color: filterResult === r ? cfg.color : '#64748b', fontSize: 10, fontWeight: 600,
              }}>
                {r ? cfg.label : 'All'}
                {r && ` (${SESSION_HANDS.filter(h => h.result === r).length})`}
              </button>
            );
          })}
        </div>

        {/* Hand Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map((h, i) => {
            const cfg = getResultConfig(h.result);
            const isSelected = selectedHand === h.id;
            return (
              <div key={h.id}>
                <div onClick={() => setSelectedHand(isSelected ? null : h.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderRadius: 6, cursor: 'pointer',
                  background: isSelected ? cfg.bg : 'rgba(0,0,0,0.1)',
                  border: isSelected ? `1px solid ${cfg.color}30` : '1px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ color: '#475569', fontSize: 10, width: 16, fontWeight: 600 }}>#{h.id}</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                  <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 800, width: 40 }}>{h.hand}</span>
                  <span style={{ color: '#f59e0b', fontSize: 9, fontWeight: 600, width: 28 }}>{h.position}</span>
                  <span style={{ color: '#64748b', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.board}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: 10, width: 60, textAlign: 'right' }}>{h.action}</span>
                  {h.evLoss > 0 && (
                    <span style={{ color: '#ef4444', fontSize: 10, fontWeight: 700, width: 50, textAlign: 'right' }}>
                      -{h.evLoss.toFixed(1)}bb
                    </span>
                  )}
                  {h.evLoss === 0 && (
                    <span style={{ color: '#22c55e', fontSize: 10, width: 50, textAlign: 'right' }}>✓</span>
                  )}
                </div>

                {/* Expanded detail */}
                {isSelected && (
                  <div style={{
                    margin: '4px 0 4px 24px', padding: 10, borderRadius: 6,
                    background: cfg.bg, border: `1px solid ${cfg.color}20`,
                  }}>
                    <div style={{ color: cfg.color, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{cfg.label}</div>
                    <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.5 }}>{h.explanation}</div>
                    {h.evLoss > 0 && (
                      <div style={{ color: '#ef4444', fontSize: 10, fontWeight: 600, marginTop: 6 }}>
                        EV Loss: -{h.evLoss.toFixed(1)}bb
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Session Replay</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
