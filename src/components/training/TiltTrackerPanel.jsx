/**
 * TILT TRACKER PANEL
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Monitor and manage tilt during sessions:
 * - Real-time tilt meter with severity levels
 * - Tilt trigger identification and tracking
 * - Cool-down timer and breathing exercises
 * - Session emotion log
 * - Tilt pattern analysis over time
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useCallback } from 'react';

// ●●● TILT TRIGGERS ●●●
const TRIGGERS = [
  { id: 'bad_beat', label: 'Bad Beat', icon: '▼', weight: 25 },
  { id: 'cooler', label: 'Cooler', icon: '◇', weight: 15 },
  { id: 'suckout', label: 'Suckout', icon: '●', weight: 30 },
  { id: 'missed_value', label: 'Missed Value', icon: '●', weight: 10 },
  { id: 'bad_bluff', label: 'Bad Bluff Caught', icon: '◇', weight: 20 },
  { id: 'timing', label: 'Bad Timing Tell', icon: '○', weight: 8 },
  { id: 'opponent_luck', label: 'Opponent Running Hot', icon: '▲', weight: 18 },
  { id: 'fatigue', label: 'Fatigue', icon: '·', weight: 12 },
];

const TILT_LEVELS = [
  { name: 'Zen', range: [0, 15], color: '#22c55e', desc: 'Playing your A-game. Stay focused.' },
  { name: 'Mild', range: [15, 35], color: '#84cc16', desc: 'Slight frustration. Take a deep breath.' },
  { name: 'Rising', range: [35, 55], color: '#f59e0b', desc: 'Tilt building. Consider taking a break.' },
  { name: 'Tilted', range: [55, 75], color: '#f97316', desc: 'Decision quality declining. Stop and reset.' },
  { name: 'Full Tilt', range: [75, 100], color: '#ef4444', desc: 'STOP PLAYING. Leave the table immediately.' },
];

const COOL_DOWN_TIPS = [
  'Take 5 slow, deep breaths — in for 4, hold for 4, out for 4',
  'Stand up and stretch for 60 seconds',
  'Drink water. Hydration helps emotional regulation.',
  'Remind yourself: one hand doesn\'t define your skill',
  'Review your last 3 hands objectively — were they good decisions?',
  'Walk away for 10 minutes. The game will be there when you return.',
  'Focus on process, not results. Did you play correctly?',
  'Visualize your best session ever. Channel that energy.',
];

function getTiltLevel(score) {
  return TILT_LEVELS.find(l => score >= l.range[0] && score < l.range[1]) || TILT_LEVELS[TILT_LEVELS.length - 1];
}

// ●●● TILT METER ●●●
function TiltMeter({ score }) {
  const level = getTiltLevel(score);
  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 16, textAlign: 'center', marginBottom: 16 }}>
      <div style={{ color: level.color, fontSize: 32, fontWeight: 800 }}>{score}</div>
      <div style={{ color: level.color, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{level.name}</div>
      <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 10 }}>{level.desc}</div>
      <div style={{ height: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          width: `${Math.min(100, score)}%`, height: '100%', borderRadius: 5,
          background: `linear-gradient(90deg, #22c55e, #f59e0b, #ef4444)`,
          transition: 'width 0.5s ease',
        }} />
        {TILT_LEVELS.map((l, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${l.range[1]}%`, top: 0, bottom: 0,
            width: 1, background: 'rgba(255,255,255,0.15)',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {TILT_LEVELS.map(l => (
          <span key={l.name} style={{ color: l.color, fontSize: 7, fontWeight: 600 }}>{l.name}</span>
        ))}
      </div>
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function TiltTrackerPanel() {
  const [tiltScore, setTiltScore] = useState(12);
  const [activeTriggers, setActiveTriggers] = useState([]);
  const [emotionLog, setEmotionLog] = useState([
    { time: '2:15 PM', trigger: 'bad_beat', score: 35, note: 'Lost set over set — $200 pot' },
    { time: '2:22 PM', trigger: 'cooldown', score: 20, note: 'Took 5-minute break, deep breathing' },
    { time: '2:45 PM', trigger: 'suckout', score: 48, note: 'Villain rivered flush vs my top 2 pair' },
    { time: '2:50 PM', trigger: 'cooldown', score: 30, note: 'Walked away, drank water' },
    { time: '3:10 PM', trigger: 'missed_value', score: 18, note: 'Should have bet river with trips' },
  ]);
  const [showCoolDown, setShowCoolDown] = useState(false);
  const [currentTip, setCurrentTip] = useState(0);

  const handleTrigger = useCallback((trigger) => {
    const isActive = activeTriggers.includes(trigger.id);
    const newTriggers = isActive
      ? activeTriggers.filter(t => t !== trigger.id)
      : [...activeTriggers, trigger.id];

    setActiveTriggers(newTriggers);

    const newScore = Math.min(100, Math.max(0,
      isActive ? tiltScore - trigger.weight : tiltScore + trigger.weight
    ));
    setTiltScore(newScore);

    if (!isActive) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      setEmotionLog(prev => [{
        time: timeStr,
        trigger: trigger.id,
        score: newScore,
        note: `${trigger.label} triggered`,
      }, ...prev].slice(0, 20));
    }
  }, [activeTriggers, tiltScore]);

  const handleCoolDown = useCallback(() => {
    setShowCoolDown(true);
    setCurrentTip(Math.floor(Math.random() * COOL_DOWN_TIPS.length));
    const reduction = Math.min(tiltScore, 15);
    setTiltScore(prev => Math.max(0, prev - reduction));
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    setEmotionLog(prev => [{
      time: timeStr,
      trigger: 'cooldown',
      score: Math.max(0, tiltScore - reduction),
      note: 'Cool-down exercise completed',
    }, ...prev].slice(0, 20));
  }, [tiltScore]);

  const level = getTiltLevel(tiltScore);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Tilt Tracker</h3>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Monitor your emotional state and stay in control</div>
        </div>

        {/* Tilt Meter */}
        <TiltMeter score={tiltScore} />

        {/* Trigger buttons */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Log a Trigger</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TRIGGERS.map(t => {
              const isActive = activeTriggers.includes(t.id);
              return (
                <button key={t.id} onClick={() => handleTrigger(t)} style={{
                  padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
                  background: isActive ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.15)',
                  border: isActive ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
                  color: isActive ? '#ef4444' : '#94a3b8', fontSize: 9, fontWeight: 600,
                }}>
                  <span style={{ marginRight: 3 }}>{t.icon}</span>{t.label}
                  <span style={{ color: '#64748b', fontSize: 7, marginLeft: 3 }}>+{t.weight}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cool Down */}
        <div style={{ marginBottom: 16 }}>
          <button onClick={handleCoolDown} style={{
            width: '100%', padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
            background: tiltScore > 30 ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.1)',
            border: tiltScore > 30 ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(59,130,246,0.2)',
            color: tiltScore > 30 ? '#22c55e' : '#3b82f6', fontSize: 12, fontWeight: 700,
          }}>
            {tiltScore > 50 ? '▲ COOL DOWN NOW (-15)' : tiltScore > 30 ? '◇ Take a Breather (-15)' : '· Reset & Refocus (-15)'}
          </button>

          {showCoolDown && (
            <div style={{ marginTop: 8, background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 12, border: '1px solid rgba(34,197,94,0.15)' }}>
              <div style={{ color: '#22c55e', fontSize: 9, fontWeight: 700, marginBottom: 4 }}>COOL-DOWN TIP</div>
              <div style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1.6 }}>{COOL_DOWN_TIPS[currentTip]}</div>
              <button onClick={() => {
                setCurrentTip((currentTip + 1) % COOL_DOWN_TIPS.length);
              }} style={{
                marginTop: 6, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
                color: '#22c55e', fontSize: 9, fontWeight: 600,
              }}>Next Tip</button>
            </div>
          )}
        </div>

        {/* Manual slider override */}
        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Manual Override</span>
            <span style={{ color: level.color, fontSize: 10, fontWeight: 800 }}>{tiltScore}</span>
          </div>
          <input type="range" min={0} max={100} value={tiltScore}
            onChange={e => setTiltScore(Number(e.target.value))}
            style={{ width: '100%', accentColor: level.color, height: 4, cursor: 'pointer' }} />
        </div>

        {/* Emotion log */}
        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10 }}>
          <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Session Emotion Log</div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {emotionLog.map((entry, i) => {
              const entryLevel = getTiltLevel(entry.score);
              const isCooldown = entry.trigger === 'cooldown';
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                  borderBottom: i < emotionLog.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                }}>
                  <span style={{ color: '#64748b', fontSize: 9, width: 50, flexShrink: 0 }}>{entry.time}</span>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: isCooldown ? '#22c55e' : entryLevel.color,
                  }} />
                  <span style={{ color: isCooldown ? '#22c55e' : '#94a3b8', fontSize: 10, flex: 1 }}>{entry.note}</span>
                  <span style={{ color: entryLevel.color, fontSize: 10, fontWeight: 700, width: 24, textAlign: 'right' }}>{entry.score}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Tilt Tracker</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
