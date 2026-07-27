/**
 * BANKROLL TRACKER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Bankroll management and session tracking:
 * - Session log with buy-in, cash-out, profit/loss
 * - Running bankroll chart (SVG line graph)
 * - Risk of Ruin calculator
 * - Stake level recommendations
 * - Win rate and hourly rate stats
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● SAMPLE SESSION DATA ●●●
const INITIAL_SESSIONS = [
  { id: 1, date: '2025-12-01', stakes: '1/2 NL', buyIn: 200, cashOut: 385, hours: 4.5, notes: 'Good session, ran well' },
  { id: 2, date: '2025-12-03', stakes: '1/2 NL', buyIn: 200, cashOut: 120, hours: 3.0, notes: 'Cooler AK vs AA' },
  { id: 3, date: '2025-12-05', stakes: '1/2 NL', buyIn: 200, cashOut: 520, hours: 6.0, notes: 'Hit sets, exploited fish' },
  { id: 4, date: '2025-12-07', stakes: '1/2 NL', buyIn: 200, cashOut: 165, hours: 2.5, notes: 'Short session, tilted early' },
  { id: 5, date: '2025-12-10', stakes: '2/5 NL', buyIn: 500, cashOut: 825, hours: 5.0, notes: 'Moved up, solid play' },
  { id: 6, date: '2025-12-12', stakes: '2/5 NL', buyIn: 500, cashOut: 280, hours: 4.0, notes: 'Bad river runouts' },
  { id: 7, date: '2025-12-14', stakes: '1/2 NL', buyIn: 200, cashOut: 445, hours: 5.5, notes: 'Dropped back down, crushed' },
  { id: 8, date: '2025-12-16', stakes: '1/2 NL', buyIn: 200, cashOut: 310, hours: 3.5, notes: 'Steady grind' },
  { id: 9, date: '2025-12-18', stakes: '2/5 NL', buyIn: 500, cashOut: 740, hours: 6.0, notes: 'Big pot with KK' },
  { id: 10, date: '2025-12-20', stakes: '2/5 NL', buyIn: 500, cashOut: 350, hours: 4.5, notes: 'Tough table, grinded' },
];

// ●●● STAKES LEVELS ●●●
const STAKES = [
  { label: '0.25/0.50', buyIn: 50, minBR: 2000 },
  { label: '0.50/1', buyIn: 100, minBR: 4000 },
  { label: '1/2', buyIn: 200, minBR: 8000 },
  { label: '2/5', buyIn: 500, minBR: 20000 },
  { label: '5/10', buyIn: 1000, minBR: 40000 },
  { label: '10/20', buyIn: 2000, minBR: 80000 },
];

// ●●● SVG LINE CHART ●●●
function BankrollChart({ sessions, startingBR }) {
  const W = 560, H = 140, PAD = 30;
  const points = [];
  let running = startingBR;
  points.push({ x: 0, y: running });
  sessions.forEach((s, i) => {
    running += (s.cashOut - s.buyIn);
    points.push({ x: i + 1, y: running });
  });

  const minY = Math.min(...points.map(p => p.y)) - 200;
  const maxY = Math.max(...points.map(p => p.y)) + 200;
  const xScale = (W - PAD * 2) / Math.max(1, points.length - 1);
  const yScale = (H - PAD * 2) / Math.max(1, maxY - minY);

  const toX = (i) => PAD + i * xScale;
  const toY = (v) => H - PAD - (v - minY) * yScale;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.x)} ${toY(p.y)}`).join(' ');
  const areaD = pathD + ` L ${toX(points[points.length - 1].x)} ${H - PAD} L ${PAD} ${H - PAD} Z`;

  const finalBR = points[points.length - 1].y;
  const isUp = finalBR >= startingBR;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(frac => {
        const y = PAD + (H - PAD * 2) * frac;
        return <line key={frac} x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />;
      })}
      {/* Area fill */}
      <path d={areaD} fill={isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'} />
      {/* Line */}
      <path d={pathD} fill="none" stroke={isUp ? '#22c55e' : '#ef4444'} strokeWidth="2" />
      {/* Points */}
      {points.map((p, i) => (
        <circle key={i} cx={toX(p.x)} cy={toY(p.y)} r={3}
          fill={i === 0 ? '#f59e0b' : isUp ? '#22c55e' : '#ef4444'}
          stroke="rgba(0,0,0,0.3)" strokeWidth="1"
        />
      ))}
      {/* Labels */}
      <text x={PAD} y={12} fill="#64748b" fontSize="8" fontWeight="600">
        ${maxY.toLocaleString()}
      </text>
      <text x={PAD} y={H - 5} fill="#64748b" fontSize="8" fontWeight="600">
        ${minY.toLocaleString()}
      </text>
      <text x={W - PAD} y={toY(finalBR) - 8} fill={isUp ? '#22c55e' : '#ef4444'} fontSize="9" fontWeight="700" textAnchor="end">
        ${finalBR.toLocaleString()}
      </text>
    </svg>
  );
}

// ●●● RISK OF RUIN CALCULATOR ●●●
function RiskOfRuin({ sessions, bankroll }) {
  const profits = sessions.map(s => s.cashOut - s.buyIn);
  const avgProfit = profits.reduce((a, b) => a + b, 0) / profits.length;
  const variance = profits.reduce((a, b) => a + (b - avgProfit) ** 2, 0) / profits.length;
  const stdDev = Math.sqrt(variance);

  // Simplified RoR formula: e^(-2 * winrate * bankroll / variance)
  const ror = stdDev > 0 ? Math.min(100, Math.max(0.01, Math.exp(-2 * avgProfit * bankroll / (stdDev * stdDev)) * 100)) : 0;

  const rorColor = ror < 2 ? '#22c55e' : ror < 5 ? '#f59e0b' : ror < 15 ? '#f97316' : '#ef4444';
  const rorLabel = ror < 2 ? 'Very Low' : ror < 5 ? 'Low' : ror < 15 ? 'Moderate' : 'High';

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
      <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Risk of Ruin</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ color: rorColor, fontSize: 28, fontWeight: 800 }}>{ror.toFixed(1)}%</div>
          <div style={{ color: rorColor, fontSize: 10, fontWeight: 600 }}>{rorLabel} Risk</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, ror)}%`, height: '100%', background: rorColor, borderRadius: 4 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ color: '#64748b', fontSize: 8 }}>0%</span>
            <span style={{ color: '#64748b', fontSize: 8 }}>Std Dev: ${stdDev.toFixed(0)}</span>
            <span style={{ color: '#64748b', fontSize: 8 }}>100%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function BankrollTracker() {
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);
  const [startingBR, setStartingBR] = useState(5000);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSession, setNewSession] = useState({ stakes: '1/2 NL', buyIn: '', cashOut: '', hours: '', notes: '' });

  const stats = useMemo(() => {
    const profits = sessions.map(s => s.cashOut - s.buyIn);
    const totalProfit = profits.reduce((a, b) => a + b, 0);
    const totalHours = sessions.reduce((a, s) => a + s.hours, 0);
    const winSessions = profits.filter(p => p > 0).length;
    const currentBR = startingBR + totalProfit;
    const hourlyRate = totalHours > 0 ? totalProfit / totalHours : 0;
    const biggestWin = Math.max(...profits);
    const biggestLoss = Math.min(...profits);

    // Recommended stakes based on bankroll
    const recommended = STAKES.filter(s => currentBR >= s.minBR);
    const maxStake = recommended.length > 0 ? recommended[recommended.length - 1] : STAKES[0];

    return { totalProfit, totalHours, winSessions, currentBR, hourlyRate, biggestWin, biggestLoss, maxStake, sessions: sessions.length };
  }, [sessions, startingBR]);

  const addSession = () => {
    if (!newSession.buyIn || !newSession.cashOut) return;
    setSessions(prev => [...prev, {
      id: prev.length + 1,
      date: new Date().toISOString().split('T')[0],
      stakes: newSession.stakes,
      buyIn: Number(newSession.buyIn),
      cashOut: Number(newSession.cashOut),
      hours: Number(newSession.hours) || 0,
      notes: newSession.notes,
    }]);
    setNewSession({ stakes: '1/2 NL', buyIn: '', cashOut: '', hours: '', notes: '' });
    setShowAddForm(false);
  };

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Bankroll Tracker</h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Track sessions, manage bankroll, calculate risk</div>
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: showAddForm ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
            color: showAddForm ? '#ef4444' : '#22c55e', fontSize: 11, fontWeight: 700,
          }}>
            {showAddForm ? 'Cancel' : '+ Log Session'}
          </button>
        </div>

        {/* Add session form */}
        {showAddForm && (
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Stakes</div>
              <select value={newSession.stakes} onChange={e => setNewSession(p => ({ ...p, stakes: e.target.value }))} style={{
                padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.3)', color: '#f1f5f9', fontSize: 11,
              }}>
                {STAKES.map(s => <option key={s.label} value={`${s.label} NL`}>{s.label} NL</option>)}
              </select>
            </div>
            {['buyIn', 'cashOut', 'hours'].map(field => (
              <div key={field}>
                <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, marginBottom: 2, textTransform: 'capitalize' }}>
                  {field === 'buyIn' ? 'Buy-In ($)' : field === 'cashOut' ? 'Cash-Out ($)' : 'Hours'}
                </div>
                <input
                  type="number" value={newSession[field]}
                  onChange={e => setNewSession(p => ({ ...p, [field]: e.target.value }))}
                  placeholder="0"
                  style={{
                    padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.3)', color: '#f1f5f9', fontSize: 11, width: 80,
                  }}
                />
              </div>
            ))}
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Notes</div>
              <input
                type="text" value={newSession.notes}
                onChange={e => setNewSession(p => ({ ...p, notes: e.target.value }))}
                placeholder="Session notes..."
                style={{
                  padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(0,0,0,0.3)', color: '#f1f5f9', fontSize: 11, width: '100%',
                }}
              />
            </div>
            <button onClick={addSession} style={{
              padding: '5px 14px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 700,
            }}>Save</button>
          </div>
        )}

        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Current Bankroll', value: `$${stats.currentBR.toLocaleString()}`, color: stats.currentBR >= startingBR ? '#22c55e' : '#ef4444' },
            { label: 'Total Profit', value: `${stats.totalProfit >= 0 ? '+' : ''}$${stats.totalProfit.toLocaleString()}`, color: stats.totalProfit >= 0 ? '#22c55e' : '#ef4444' },
            { label: 'Hourly Rate', value: `$${stats.hourlyRate.toFixed(1)}/hr`, color: stats.hourlyRate >= 0 ? '#34d399' : '#f97316' },
            { label: 'Win Rate', value: `${Math.round(stats.winSessions / stats.sessions * 100)}%`, color: '#3b82f6' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 18, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 8, marginBottom: 16 }}>
          <BankrollChart sessions={sessions} startingBR={startingBR} />
        </div>

        {/* Risk of Ruin + Stake Recommendation */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <RiskOfRuin sessions={sessions} bankroll={stats.currentBR} />
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
            <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Stake Recommendation</div>
            <div style={{ color: '#f59e0b', fontSize: 11, marginBottom: 8 }}>
              Max recommended: <strong>{stats.maxStake.label} NL</strong>
            </div>
            {STAKES.map((s, i) => {
              const canPlay = stats.currentBR >= s.minBR;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: canPlay ? '#22c55e' : 'rgba(255,255,255,0.1)',
                  }} />
                  <span style={{ color: canPlay ? '#f1f5f9' : '#475569', fontSize: 10, flex: 1 }}>{s.label} NL</span>
                  <span style={{ color: '#64748b', fontSize: 9 }}>${s.minBR.toLocaleString()} min</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Session Log */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12 }}>
          <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            Session Log ({sessions.length} sessions, {stats.totalHours.toFixed(1)}hrs)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 60px 60px 60px 60px 1fr', gap: 4, marginBottom: 6 }}>
            {['Date', 'Stakes', 'Buy-In', 'Out', 'P/L', 'Notes'].map(h => (
              <div key={h} style={{ color: '#475569', fontSize: 8, fontWeight: 700, textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>
          {[...sessions].reverse().map((s, i) => {
            const pl = s.cashOut - s.buyIn;
            return (
              <div key={s.id} style={{
                display: 'grid', gridTemplateColumns: '80px 60px 60px 60px 60px 1fr', gap: 4, padding: '4px 0',
                borderTop: i > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none',
              }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>{s.date}</span>
                <span style={{ color: '#f1f5f9', fontSize: 10, fontWeight: 600 }}>{s.stakes}</span>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>${s.buyIn}</span>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>${s.cashOut}</span>
                <span style={{ color: pl >= 0 ? '#22c55e' : '#ef4444', fontSize: 10, fontWeight: 700 }}>
                  {pl >= 0 ? '+' : ''}${pl}
                </span>
                <span style={{ color: '#64748b', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.notes}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Bankroll Tracker</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
