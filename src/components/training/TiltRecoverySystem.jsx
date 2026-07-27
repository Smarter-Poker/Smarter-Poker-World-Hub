/**
 * TiltRecoverySystem — Mental Game Tilt Management
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Identify tilt type, assess severity, and get recovery strategies.
 * Interactive system to help players regain their A-game.
 */
import React, { useState } from 'react';

const TILT_TYPES = [
  {
    type: 'Bad Beat Tilt', emoji: 'Frustration', color: '#ef4444',
    trigger: 'Lost a big pot you "should have won"',
    symptoms: ['Playing too aggressively to "get even"', 'Seeing every hand as a chance to win it back', 'Calling wider hoping to hit', 'Feeling angry at opponents luck'],
    recovery: [
      'Acknowledge: variance is a fundamental part of poker',
      'Review: was your play actually correct? If yes, nothing to fix',
      'Breathe: 3 deep breaths before every decision for next 15 min',
      'Refocus: your job is to make +EV decisions, not win every pot',
    ],
    severity: 'High',
  },
  {
    type: 'Entitlement Tilt', emoji: 'Arrogance', color: '#f59e0b',
    trigger: 'Feeling you deserve to win because youre better',
    symptoms: ['Underestimating opponents', 'Playing fancy for ego', 'Getting tilted when "fish" win', 'Refusing to adjust strategy'],
    recovery: [
      'Reality check: even the best players lose 40% of sessions',
      'Humble up: every player at the table can outplay you sometimes',
      'Focus on process: are you making the best decision RIGHT NOW?',
      'Detach from results: skill shows over 100k+ hands, not 100',
    ],
    severity: 'Medium',
  },
  {
    type: 'Revenge Tilt', emoji: 'Vendetta', color: '#e879f9',
    trigger: 'One specific player has won multiple pots against you',
    symptoms: ['Targeting one player specifically', 'Playing hands you wouldnt normally play against them', 'Trying to bluff them more than usual', 'Ignoring better spots at the table'],
    recovery: [
      'Recognize: you are not playing the player, youre playing the game',
      'If theyre bad: they WILL give you their chips if you play well',
      'If theyre good: dont fight battles you dont need to win',
      'Table change: if you cant stop focusing on them, move tables',
    ],
    severity: 'High',
  },
  {
    type: 'Desperation Tilt', emoji: 'Panic', color: '#dc2626',
    trigger: 'Down multiple buy-ins, feeling pressure to recover',
    symptoms: ['Moving up stakes to win back losses', 'Playing longer sessions when losing', 'Making desperate bluffs', 'Ignoring bankroll management'],
    recovery: [
      'STOP: Take a mandatory 15-minute break right now',
      'Set a stop-loss: decide max loss BEFORE sitting down',
      'Move DOWN stakes if anything — never up when losing',
      'Tomorrow: losses today will mean nothing in your poker career',
    ],
    severity: 'Critical',
  },
  {
    type: 'Winner Tilt', emoji: 'Overconfidence', color: '#10b981',
    trigger: 'On a heater, feeling invincible',
    symptoms: ['Playing too many hands because youre running well', 'Taking unnecessary risks', 'Ignoring pot odds because youll probably win', 'Staying too long to keep winning'],
    recovery: [
      'Lock up profits: set a winning threshold and take breaks',
      'Stay disciplined: winning doesnt change what correct play is',
      'Remember: heaters end. Your inflated winrate WILL regress',
      'Use the confidence positively: play your A-game, dont get sloppy',
    ],
    severity: 'Low',
  },
];

function TiltRecoverySystem() {
  const [selected, setSelected] = useState(null);
  const [tiltLevel, setTiltLevel] = useState(3);

  const sevColors = { 'Critical': '#dc2626', 'High': '#ef4444', 'Medium': '#f59e0b', 'Low': '#10b981' };
  const tiltLabels = ['Zen', 'Calm', 'Slight', 'Moderate', 'Strong', 'Severe', 'Critical'];
  const tiltColors = ['#10b981', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#dc2626'];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f43f5e' }}>Tilt Recovery System</h3>

        {/* Tilt level meter */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Current Tilt Level</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: tiltColors[tiltLevel] }}>{tiltLabels[tiltLevel]}</span>
          </div>
          <input type="range" min={0} max={6} value={tiltLevel} onChange={e => setTiltLevel(parseInt(e.target.value))} style={{ width: '100%', accentColor: tiltColors[tiltLevel] }} />
          <div style={{ textAlign: 'center', fontSize: 11, marginTop: 4, color: tiltLevel >= 4 ? '#ef4444' : tiltLevel >= 2 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
            {tiltLevel >= 5 ? 'STOP PLAYING. Take a break immediately.' :
             tiltLevel >= 4 ? 'Warning: Your decisions are likely compromised.' :
             tiltLevel >= 2 ? 'Monitor closely. Slow down your decisions.' :
             'Youre in a good headspace. Keep playing your A-game.'}
          </div>
        </div>

        {/* Tilt type selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {TILT_TYPES.map((t, i) => (
            <button key={i} onClick={() => setSelected(selected === i ? null : i)} style={{
              padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: selected === i ? t.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>{t.type}</button>
          ))}
        </div>

        {selected !== null && (() => {
          const tilt = TILT_TYPES[selected];
          return (
            <div>
              <div style={{ padding: 12, background: `${tilt.color}11`, borderRadius: 10, border: `1px solid ${tilt.color}33`, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: tilt.color }}>{tilt.type}</span>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${sevColors[tilt.severity]}22`, color: sevColors[tilt.severity] }}>{tilt.severity}</span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Trigger: {tilt.trigger}</div>

                <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Symptoms:</div>
                {tilt.symptoms.map((s, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', paddingLeft: 8, borderLeft: '2px solid rgba(239,68,68,0.2)', marginBottom: 3 }}>{s}</div>
                ))}
              </div>

              <div style={{ padding: 12, background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 6 }}>Recovery Protocol:</div>
                {tilt.recovery.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, paddingLeft: 8, borderLeft: '2px solid rgba(16,185,129,0.3)', marginBottom: 4 }}>{r}</div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Tilt Recovery System failed to load: {err.message}</div>;
  }
}

export default TiltRecoverySystem;
