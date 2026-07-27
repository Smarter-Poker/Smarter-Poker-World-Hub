/**
 * CUSTOM SPOT DRILL BUILDER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GTO Wizard-style custom drill creator:
 * - Select position, street, stack depth, board texture
 * - Choose scenario type (SRP, 3-bet pot, 4-bet pot, squeeze pot)
 * - Configure IP/OOP, # of players, bet sizing
 * - Save custom drills for repeated practice
 * - Quick-launch prebuilt drill templates
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useCallback } from 'react';

const POSITIONS = ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
const POT_TYPES = ['Single Raised', '3-Bet', '4-Bet', 'Limped', 'Squeeze'];
const BOARD_TEXTURES = ['Any', 'Dry', 'Wet', 'Monotone', 'Paired', 'Broadway', 'Low', 'Connected'];
const STACK_RANGES = [
  { label: 'Deep (100bb+)', min: 100, max: 200 },
  { label: 'Standard (60-100bb)', min: 60, max: 100 },
  { label: 'Medium (40-60bb)', min: 40, max: 60 },
  { label: 'Short (25-40bb)', min: 25, max: 40 },
  { label: 'Shallow (15-25bb)', min: 15, max: 25 },
  { label: 'Push/Fold (<15bb)', min: 5, max: 15 },
];

// ●●● PREBUILT DRILL TEMPLATES ●●●
const DRILL_TEMPLATES = [
  {
    name: 'C-Bet or Check (IP)',
    desc: 'Practice c-betting decisions as the preflop raiser in position',
    config: { heroPos: 'CO', street: 'Flop', potType: 'Single Raised', position: 'IP', boardTexture: 'Any', stackRange: 1, numHands: 20 },
    difficulty: 'Beginner',
    color: '#22c55e',
  },
  {
    name: 'Facing C-Bet (OOP)',
    desc: 'Defend vs c-bets as the big blind in single raised pots',
    config: { heroPos: 'BB', street: 'Flop', potType: 'Single Raised', position: 'OOP', boardTexture: 'Any', stackRange: 1, numHands: 20 },
    difficulty: 'Beginner',
    color: '#22c55e',
  },
  {
    name: '3-Bet Pot C-Bet',
    desc: 'C-bet decisions in 3-bet pots — higher SPR pressure',
    config: { heroPos: 'BTN', street: 'Flop', potType: '3-Bet', position: 'IP', boardTexture: 'Any', stackRange: 1, numHands: 20 },
    difficulty: 'Intermediate',
    color: '#f59e0b',
  },
  {
    name: 'Turn Barrel Decision',
    desc: 'Continue betting or check back on the turn after c-betting flop',
    config: { heroPos: 'CO', street: 'Turn', potType: 'Single Raised', position: 'IP', boardTexture: 'Any', stackRange: 1, numHands: 20 },
    difficulty: 'Intermediate',
    color: '#f59e0b',
  },
  {
    name: 'River Value or Bluff',
    desc: 'Thin value bets and river bluffs — the hardest decisions',
    config: { heroPos: 'BTN', street: 'River', potType: 'Single Raised', position: 'IP', boardTexture: 'Any', stackRange: 1, numHands: 15 },
    difficulty: 'Advanced',
    color: '#ef4444',
  },
  {
    name: 'Monotone Board Play',
    desc: 'Navigate flush-heavy boards where ranges are polarized',
    config: { heroPos: 'CO', street: 'Flop', potType: 'Single Raised', position: 'IP', boardTexture: 'Monotone', stackRange: 1, numHands: 20 },
    difficulty: 'Advanced',
    color: '#ef4444',
  },
  {
    name: 'Short Stack 3-Bet Pot',
    desc: '40bb effective in 3-bet pots — jam or fold dynamics',
    config: { heroPos: 'SB', street: 'Flop', potType: '3-Bet', position: 'OOP', boardTexture: 'Any', stackRange: 2, numHands: 20 },
    difficulty: 'Advanced',
    color: '#ef4444',
  },
  {
    name: 'Squeeze Spot Defense',
    desc: 'React to squeezes from the blinds after you call an open',
    config: { heroPos: 'BTN', street: 'Preflop', potType: 'Squeeze', position: 'IP', boardTexture: 'Any', stackRange: 1, numHands: 15 },
    difficulty: 'Intermediate',
    color: '#f59e0b',
  },
];

export default function CustomSpotDrillBuilder() {
  const [mode, setMode] = useState('templates'); // 'templates' | 'custom'
  const [config, setConfig] = useState({
    heroPos: 'CO',
    villainPos: 'BB',
    street: 'Flop',
    potType: 'Single Raised',
    position: 'IP',
    boardTexture: 'Any',
    stackRange: 1,
    numHands: 20,
    name: '',
  });
  const [savedDrills, setSavedDrills] = useState([]);
  const [activeDrill, setActiveDrill] = useState(null);

  const updateConfig = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const saveDrill = useCallback(() => {
    if (!config.name.trim()) return;
    setSavedDrills(prev => [...prev, { ...config, id: Date.now() }]);
    setConfig(prev => ({ ...prev, name: '' }));
  }, [config]);

  const launchDrill = useCallback((drill) => {
    setActiveDrill(drill);
  }, []);

  const sectionStyle = {
    background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 12,
  };

  const labelStyle = {
    color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 1, display: 'block',
  };

  const chipStyle = (active) => ({
    padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
    background: active ? '#3b82f6' : 'rgba(255,255,255,0.06)',
    color: active ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 600,
    transition: 'all 0.15s',
  });

  // ●●● ACTIVE DRILL VIEW ●●●
  if (activeDrill) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>
            {activeDrill.name || 'Custom Drill'}
          </h3>
          <button onClick={() => setActiveDrill(null)} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: 12, fontWeight: 600,
          }}>
            Back to Builder
          </button>
        </div>

        <div style={sectionStyle}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Hero', value: activeDrill.heroPos || activeDrill.config?.heroPos },
              { label: 'Street', value: activeDrill.street || activeDrill.config?.street },
              { label: 'Pot Type', value: activeDrill.potType || activeDrill.config?.potType },
              { label: 'Position', value: activeDrill.position || activeDrill.config?.position },
              { label: 'Board', value: activeDrill.boardTexture || activeDrill.config?.boardTexture },
              { label: 'Hands', value: activeDrill.numHands || activeDrill.config?.numHands },
            ].map(item => (
              <div key={item.label}>
                <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 600 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Simulated drill progress */}
        <div style={{ ...sectionStyle, textAlign: 'center', padding: 40 }}>
          <div style={{ color: '#3b82f6', fontSize: 48, fontWeight: 800, marginBottom: 8 }}>
            Ready
          </div>
          <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20 }}>
            This drill will generate {activeDrill.numHands || activeDrill.config?.numHands || 20} hands matching your criteria.
          </div>
          <div style={{ color: '#64748b', fontSize: 12, marginBottom: 20 }}>
            Hands are generated using solver-approximate frequencies for the selected spot.
            Your answers are compared against GTO strategy and scored.
          </div>
          <button onClick={() => setActiveDrill(null)} style={{
            padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
            fontSize: 14, fontWeight: 700,
          }}>
            Start Drill (use Training tab)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>
          Custom Spot Drill Builder
        </h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setMode('templates')} style={chipStyle(mode === 'templates')}>Templates</button>
          <button onClick={() => setMode('custom')} style={chipStyle(mode === 'custom')}>Custom</button>
        </div>
      </div>

      {mode === 'templates' ? (
        /* ●●● TEMPLATE MODE ●●● */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {DRILL_TEMPLATES.map((tmpl, i) => (
            <div key={i} style={{
              ...sectionStyle, cursor: 'pointer', transition: 'all 0.15s',
              border: '1px solid rgba(255,255,255,0.04)',
            }}
              onClick={() => launchDrill({ ...tmpl.config, name: tmpl.name })}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700 }}>{tmpl.name}</div>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: `${tmpl.color}20`, color: tmpl.color,
                }}>
                  {tmpl.difficulty}
                </span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 10 }}>{tmpl.desc}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[tmpl.config.heroPos, tmpl.config.street, tmpl.config.potType, tmpl.config.position].map((tag, j) => (
                  <span key={j} style={{
                    padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)',
                    color: '#64748b', fontSize: 10, fontWeight: 600,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {/* Saved custom drills */}
          {savedDrills.map((drill, i) => (
            <div key={drill.id} style={{
              ...sectionStyle, cursor: 'pointer', border: '1px solid rgba(139, 92, 246, 0.2)',
            }}
              onClick={() => launchDrill(drill)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700 }}>{drill.name}</div>
                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                  Custom
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[drill.heroPos, drill.street, drill.potType, drill.position].map((tag, j) => (
                  <span key={j} style={{
                    padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)',
                    color: '#64748b', fontSize: 10, fontWeight: 600,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ●●● CUSTOM BUILDER MODE ●●● */
        <div>
          {/* Hero Position */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Hero Position</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {POSITIONS.map(p => (
                <button key={p} onClick={() => updateConfig('heroPos', p)} style={chipStyle(config.heroPos === p)}>{p}</button>
              ))}
            </div>
          </div>

          {/* Street */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Street</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {STREETS.map(s => (
                <button key={s} onClick={() => updateConfig('street', s)} style={chipStyle(config.street === s)}>{s}</button>
              ))}
            </div>
          </div>

          {/* Pot Type */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Pot Type</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {POT_TYPES.map(pt => (
                <button key={pt} onClick={() => updateConfig('potType', pt)} style={chipStyle(config.potType === pt)}>{pt}</button>
              ))}
            </div>
          </div>

          {/* Position (IP/OOP) */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Relative Position</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {['IP', 'OOP'].map(p => (
                <button key={p} onClick={() => updateConfig('position', p)} style={chipStyle(config.position === p)}>{p}</button>
              ))}
            </div>
          </div>

          {/* Board Texture */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Board Texture Filter</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {BOARD_TEXTURES.map(bt => (
                <button key={bt} onClick={() => updateConfig('boardTexture', bt)} style={chipStyle(config.boardTexture === bt)}>{bt}</button>
              ))}
            </div>
          </div>

          {/* Stack Depth */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Effective Stack</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {STACK_RANGES.map((sr, i) => (
                <button key={i} onClick={() => updateConfig('stackRange', i)} style={chipStyle(config.stackRange === i)}>{sr.label}</button>
              ))}
            </div>
          </div>

          {/* Number of Hands */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Hands per Session</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[10, 15, 20, 30, 50].map(n => (
                <button key={n} onClick={() => updateConfig('numHands', n)} style={chipStyle(config.numHands === n)}>{n}</button>
              ))}
            </div>
          </div>

          {/* Save & Launch */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <input
              value={config.name}
              onChange={e => updateConfig('name', e.target.value)}
              placeholder="Drill name (to save)"
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.2)', color: '#f1f5f9', fontSize: 13, outline: 'none',
              }}
            />
            <button onClick={saveDrill} style={{
              padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'rgba(139,92,246,0.2)', color: '#a78bfa', fontSize: 12, fontWeight: 700,
            }}>
              Save
            </button>
            <button onClick={() => launchDrill(config)} style={{
              padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
              fontSize: 12, fontWeight: 700,
            }}>
              Launch Drill
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
