/**
 * SessionGoalTracker — GTO Wizard-Style Session Goal Setting & Tracking
 * ═══════════════════════════════════════════════════════════════════════════
 * Set session goals (hands, study time, profit targets), track progress
 * with visual bars, streaks, and completion history.
 */
import React, { useState, useCallback } from 'react';

const DEFAULT_GOALS = [
  { id: 'hands', label: 'Hands Played', target: 500, current: 0, unit: 'hands', icon: '', color: '#3b82f6'},
  { id: 'study', label: 'Study Time', target: 60, current: 0, unit: 'min', icon: '', color: '#8b5cf6'},
  { id: 'drills', label: 'Drills Completed', target: 20, current: 0, unit: 'drills', icon: '', color: '#10b981'},
  { id: 'accuracy', label: 'GTO Accuracy', target: 75, current: 0, unit: '%', icon: '✓', color: '#f59e0b'},
  { id: 'reviews', label: 'Hand Reviews', target: 10, current: 0, unit: 'hands', icon: '', color: '#ec4899'},
  { id: 'evloss', label: 'Max EV Loss', target: 5, current: 0, unit: 'bb/100', icon: '', color: '#ef4444', inverted: true },
];

const PRESETS = [
  { name: 'Quick Session', goals: { hands: 200, study: 30, drills: 10, accuracy: 70, reviews: 5, evloss: 8 } },
  { name: 'Deep Study', goals: { hands: 100, study: 120, drills: 30, accuracy: 80, reviews: 20, evloss: 4 } },
  { name: 'Grind Mode', goals: { hands: 1000, study: 15, drills: 5, accuracy: 65, reviews: 3, evloss: 10 } },
  { name: 'Tournament Prep', goals: { hands: 300, study: 90, drills: 25, accuracy: 75, reviews: 15, evloss: 5 } },
];

const SESSION_HISTORY = [
  { date: '2024-03-15', completed: 5, total: 6, duration: '2h 15m', streak: true },
  { date: '2024-03-14', completed: 6, total: 6, duration: '3h 00m', streak: true },
  { date: '2024-03-13', completed: 4, total: 6, duration: '1h 45m', streak: false },
  { date: '2024-03-12', completed: 6, total: 6, duration: '2h 30m', streak: true },
  { date: '2024-03-11', completed: 3, total: 6, duration: '1h 10m', streak: false },
  { date: '2024-03-10', completed: 5, total: 6, duration: '2h 00m', streak: true },
  { date: '2024-03-09', completed: 6, total: 6, duration: '2h 45m', streak: true },
];

function ProgressBar({ current, target, color, inverted }) {
  const pct = inverted
    ? (current <= target ? 100 : Math.max(0, 100 - ((current - target) / target) * 100))
    : Math.min((current / target) * 100, 100);
  const isComplete = inverted ? current <= target && current > 0 : current >= target;

  return (
    <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: isComplete ? '#10b981' : color,
          borderRadius: 4,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
}

function GoalCard({ goal, onUpdate }) {
  const pct = goal.inverted
    ? (goal.current <= goal.target && goal.current > 0 ? 100 : goal.current === 0 ? 0 : Math.max(0, 100 - ((goal.current - goal.target) / goal.target) * 100))
    : Math.min((goal.current / goal.target) * 100, 100);
  const isComplete = goal.inverted ? goal.current <= goal.target && goal.current > 0 : goal.current >= goal.target;
  const increment = goal.id === 'accuracy' ? 5 : goal.id === 'evloss' ? 1 : goal.id === 'study' ? 15 : goal.id === 'hands' ? 50 : 1;

  return (
    <div style={{
      padding: 14,
      background: isComplete ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
      borderRadius: 10,
      border: `1px solid ${isComplete ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{goal.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{goal.label}</span>
        </div>
        {isComplete && <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: 4 }}>DONE</span>}
      </div>

      <ProgressBar current={goal.current} target={goal.target} color={goal.color} inverted={goal.inverted} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          {goal.current} / {goal.target} {goal.unit} ({Math.round(pct)}%)
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => onUpdate(goal.id, Math.max(0, goal.current - increment))}
            style={{
              width: 26, height: 26, borderRadius: 4, border: 'none',
              background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >−</button>
          <button
            onClick={() => onUpdate(goal.id, goal.current + increment)}
            style={{
              width: 26, height: 26, borderRadius: 4, border: 'none',
              background: goal.color, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >+</button>
        </div>
      </div>
    </div>
  );
}

function SessionGoalTracker() {
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [activePreset, setActivePreset] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const updateGoal = useCallback((id, newValue) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, current: newValue } : g));
  }, []);

  const applyPreset = useCallback((preset) => {
    setGoals(prev => prev.map(g => ({ ...g, target: preset.goals[g.id] || g.target, current: 0 })));
    setActivePreset(preset.name);
  }, []);

  const resetAll = useCallback(() => {
    setGoals(prev => prev.map(g => ({ ...g, current: 0 })));
  }, []);

  const completedCount = goals.filter(g => g.inverted ? (g.current <= g.target && g.current > 0) : g.current >= g.target).length;
  const totalPct = Math.round(goals.reduce((sum, g) => {
    const p = g.inverted
      ? (g.current <= g.target && g.current > 0 ? 100 : g.current === 0 ? 0 : Math.max(0, 100 - ((g.current - g.target) / g.target) * 100))
      : Math.min((g.current / g.target) * 100, 100);
    return sum + p;
  }, 0) / goals.length);

  const currentStreak = SESSION_HISTORY.filter((s, i) => {
    if (i === 0) return s.completed >= s.total - 1;
    return SESSION_HISTORY.slice(0, i + 1).every(h => h.completed >= h.total - 1);
  }).length;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#8b5cf6' }}>Session Goals</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{completedCount}/{goals.length} complete</span>
            <button
              onClick={() => setShowHistory(!showHistory)}
              style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: showHistory ? '#8b5cf6' : 'rgba(255,255,255,0.08)',
                color: showHistory ? '#fff' : 'rgba(255,255,255,0.7)',
              }}
            >History</button>
            <button
              onClick={resetAll}
              style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
            >Reset</button>
          </div>
        </div>

        {/* Overall Progress */}
        <div style={{ marginBottom: 16, padding: 12, background: 'rgba(139,92,246,0.08)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Session Progress</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: totalPct >= 100 ? '#10b981' : '#8b5cf6' }}>{totalPct}%</span>
          </div>
          <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${totalPct}%`, background: totalPct >= 100 ? '#10b981' : 'linear-gradient(90deg, #8b5cf6, #a78bfa)', borderRadius: 5, transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Current streak: <span style={{ color: '#f59e0b', fontWeight: 700 }}>{currentStreak} days</span></span>
            {activePreset && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Preset: <span style={{ color: '#8b5cf6', fontWeight: 600 }}>{activePreset}</span></span>}
          </div>
        </div>

        {/* Presets */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {PRESETS.map(p => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: activePreset === p.name ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
                color: activePreset === p.name ? '#fff' : 'rgba(255,255,255,0.6)',
                border: 'none',
              }}
            >{p.name}</button>
          ))}
        </div>

        {showHistory ? (
          /* Session History */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SESSION_HISTORY.map((s, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                border: `1px solid ${s.completed >= s.total ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{s.date}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: s.completed >= s.total ? '#10b981' : s.completed >= s.total - 1 ? '#f59e0b' : '#ef4444' }}>
                    {s.completed}/{s.total} goals
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{s.duration}</span>
                  {s.streak && <span style={{ fontSize: 11, color: '#f59e0b'}}>▲</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Goal Cards */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {goals.map(goal => (
              <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} />
            ))}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Session Goal Tracker failed to load: {err.message}</div>;
  }
}

export default SessionGoalTracker;
