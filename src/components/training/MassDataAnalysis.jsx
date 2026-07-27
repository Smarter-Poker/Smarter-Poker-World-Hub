/**
 * MassDataAnalysis — Aggregate Stats Dashboard
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * View aggregated training statistics and patterns across all sessions.
 * Identifies strengths, weaknesses, and improvement trends.
 */
import React, { useState, useMemo } from 'react';

const MOCK_DATA = {
  totalHands: 12847,
  totalSessions: 156,
  avgAccuracy: 68.4,
  avgEVLoss: -2.1,
  bestStreak: 23,
  worstStreak: -8,
  byPosition: [
    { pos: 'UTG', hands: 1850, accuracy: 72.1, evLoss: -1.4, color: '#ef4444' },
    { pos: 'MP', hands: 2100, accuracy: 70.3, evLoss: -1.8, color: '#f59e0b' },
    { pos: 'CO', hands: 2450, accuracy: 69.5, evLoss: -2.0, color: '#eab308' },
    { pos: 'BTN', hands: 2800, accuracy: 71.8, evLoss: -1.6, color: '#22c55e' },
    { pos: 'SB', hands: 1750, accuracy: 63.2, evLoss: -3.1, color: '#3b82f6' },
    { pos: 'BB', hands: 1897, accuracy: 64.8, evLoss: -2.8, color: '#8b5cf6' },
  ],
  byStreet: [
    { street: 'Preflop', accuracy: 74.2, evLoss: -0.8, color: '#3b82f6' },
    { street: 'Flop', accuracy: 68.1, evLoss: -2.3, color: '#10b981' },
    { street: 'Turn', accuracy: 65.4, evLoss: -2.8, color: '#f59e0b' },
    { street: 'River', accuracy: 62.7, evLoss: -3.5, color: '#ef4444' },
  ],
  byAction: [
    { action: 'Bet/Raise', accuracy: 70.2, freq: 35, color: '#ef4444' },
    { action: 'Call', accuracy: 64.8, freq: 28, color: '#3b82f6' },
    { action: 'Check', accuracy: 71.5, freq: 22, color: '#10b981' },
    { action: 'Fold', accuracy: 68.9, freq: 15, color: '#6b7280' },
  ],
  weeklyTrend: [61, 63, 65, 64, 67, 69, 68, 71, 70, 72, 68, 74],
};

function MassDataAnalysis() {
  const [view, setView] = useState('overview');

  const data = MOCK_DATA;
  const maxTrend = Math.max(...data.weeklyTrend);
  const minTrend = Math.min(...data.weeklyTrend);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#8b5cf6' }}>Mass Data Analysis</h3>
          <div style={{ display: 'flex', gap: 4 }}>
            {['overview', 'position', 'street', 'action'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 600,
                cursor: 'pointer', background: view === v ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
                color: view === v ? '#fff' : 'rgba(255,255,255,0.6)',
              }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
        </div>

        {view === 'overview' && (
          <>
            {/* Key Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Total Hands', value: data.totalHands.toLocaleString(), color: '#fff' },
                { label: 'Sessions', value: data.totalSessions, color: '#8b5cf6' },
                { label: 'Avg Accuracy', value: `${data.avgAccuracy}%`, color: data.avgAccuracy > 70 ? '#10b981' : '#f59e0b' },
                { label: 'Avg EV Loss', value: `${data.avgEVLoss} bb`, color: '#ef4444' },
                { label: 'Best Streak', value: data.bestStreak, color: '#10b981' },
              ].map(s => (
                <div key={s.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Trend Chart */}
            <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6', marginBottom: 8 }}>Weekly Accuracy Trend</div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 60 }}>
                {data.weeklyTrend.map((v, i) => {
                  const height = ((v - minTrend) / (maxTrend - minTrend)) * 50 + 10;
                  return (
                    <div key={i} style={{
                      flex: 1, height, borderRadius: '3px 3px 0 0',
                      background: v >= 70 ? '#10b981' : v >= 65 ? '#f59e0b' : '#ef4444',
                      position: 'relative',
                    }}>
                      <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>{v}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>12 weeks ago</span>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>This week</span>
              </div>
            </div>
          </>
        )}

        {view === 'position' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.byPosition.map(p => (
              <div key={p.pos} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `4px solid ${p.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: p.color }}>{p.pos}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{p.hands} hands</span>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ fontSize: 12, color: p.accuracy > 70 ? '#10b981' : '#f59e0b' }}>Accuracy: {p.accuracy}%</span>
                  <span style={{ fontSize: 12, color: '#ef4444' }}>EV Loss: {p.evLoss} bb/hand</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 6 }}>
                  <div style={{ width: `${p.accuracy}%`, height: '100%', background: p.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'street' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.byStreet.map(s => (
              <div key={s.street} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `4px solid ${s.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.street}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: s.accuracy > 70 ? '#10b981' : s.accuracy > 65 ? '#f59e0b' : '#ef4444' }}>{s.accuracy}%</span>
                </div>
                <div style={{ fontSize: 11, color: '#ef4444' }}>Avg EV Loss: {s.evLoss} bb/hand</div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, marginTop: 6 }}>
                  <div style={{ width: `${s.accuracy}%`, height: '100%', background: s.color, borderRadius: 4 }} />
                </div>
              </div>
            ))}
            <div style={{ padding: 10, background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Biggest Leak</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>River decisions — accuracy drops {(data.byStreet[0].accuracy - data.byStreet[3].accuracy).toFixed(1)}% from preflop. Focus on river bluff-catching and thin value.</div>
            </div>
          </div>
        )}

        {view === 'action' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', height: 32, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
              {data.byAction.map(a => (
                <div key={a.action} style={{ width: `${a.freq}%`, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                  {a.action} {a.freq}%
                </div>
              ))}
            </div>
            {data.byAction.map(a => (
              <div key={a.action} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `4px solid ${a.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: a.color }}>{a.action}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: a.accuracy > 70 ? '#10b981' : '#f59e0b' }}>{a.accuracy}%</span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Frequency: {a.freq}% of decisions</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Mass Data Analysis failed to load: {err.message}</div>;
  }
}

export default MassDataAnalysis;
