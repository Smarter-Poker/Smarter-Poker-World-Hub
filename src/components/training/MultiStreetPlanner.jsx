/**
 * MultiStreetPlanner — GTO Wizard-Style Multi-Street Betting Plan Visualizer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Plan and visualize bet sizing across flop → turn → river. Shows how
 * different flop sizings commit stacks on later streets.
 */
import React, { useState, useMemo } from 'react';

const PRESETS = [
  { name: 'Small Ball', flop: 33, turn: 50, river: 67, description: 'Preserve stack flexibility. Good for merged ranges on dry boards.' },
  { name: 'Standard', flop: 50, turn: 67, river: 75, description: 'Balanced approach. Works across most textures and range compositions.' },
  { name: 'Geometric', flop: 40, turn: 60, river: 100, description: 'Sized to get all-in by river. Each bet grows proportionally to build the pot.' },
  { name: 'Overbet Line', flop: 33, turn: 75, river: 150, description: 'Small flop, escalate turn/river. Maximizes value from nutted hands.' },
  { name: 'Pot Control', flop: 33, turn: 0, river: 67, description: 'Bet-check-bet line. Good for medium-strength hands that want to control pot size.' },
];

function MultiStreetPlanner() {
  const [startPot, setStartPot] = useState(6);
  const [effectiveStack, setEffectiveStack] = useState(100);
  const [flopPct, setFlopPct] = useState(50);
  const [turnPct, setTurnPct] = useState(67);
  const [riverPct, setRiverPct] = useState(75);
  const [activePreset, setActivePreset] = useState(null);

  const plan = useMemo(() => {
    let pot = startPot;
    let remaining = effectiveStack;
    const streets = [];

    // Flop
    const flopBet = Math.round(pot * flopPct / 100 * 10) / 10;
    const flopPotAfter = pot + flopBet * 2;
    remaining -= flopBet;
    streets.push({ street: 'Flop', pot, bet: flopBet, potAfter: flopPotAfter, remaining, pctPot: flopPct, spr: Math.round(remaining / flopPotAfter * 10) / 10 });

    // Turn
    pot = flopPotAfter;
    const turnBet = turnPct > 0 ? Math.round(pot * turnPct / 100 * 10) / 10 : 0;
    const turnPotAfter = pot + turnBet * 2;
    remaining -= turnBet;
    streets.push({ street: 'Turn', pot, bet: turnBet, potAfter: turnPotAfter, remaining: Math.max(0, remaining), pctPot: turnPct, spr: turnPotAfter > 0 ? Math.round(Math.max(0, remaining) / turnPotAfter * 10) / 10 : 0 });

    // River
    pot = turnPotAfter;
    const riverBet = riverPct > 0 ? Math.min(Math.round(pot * riverPct / 100 * 10) / 10, Math.max(0, remaining)) : 0;
    const riverPotAfter = pot + riverBet * 2;
    remaining -= riverBet;
    streets.push({ street: 'River', pot, bet: riverBet, potAfter: riverPotAfter, remaining: Math.max(0, remaining), pctPot: riverPct, spr: 0 });

    const totalInvested = flopBet + turnBet + riverBet;
    const commitPct = Math.round((totalInvested / effectiveStack) * 100);
    const isAllIn = remaining <= 0;

    return { streets, totalInvested, commitPct, isAllIn };
  }, [startPot, effectiveStack, flopPct, turnPct, riverPct]);

  const applyPreset = (preset) => {
    setFlopPct(preset.flop);
    setTurnPct(preset.turn);
    setRiverPct(preset.river);
    setActivePreset(preset.name);
  };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#a78bfa' }}>Multi-Street Planner</h3>

        {/* Setup */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Starting Pot (bb)</div>
            <input type="range" min={2} max={30} step={0.5} value={startPot} onChange={e => setStartPot(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#a78bfa' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', textAlign: 'center' }}>{startPot} bb</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Effective Stack (bb)</div>
            <input type="range" min={20} max={200} step={5} value={effectiveStack} onChange={e => setEffectiveStack(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#a78bfa' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', textAlign: 'center' }}>{effectiveStack} bb</div>
          </div>
        </div>

        {/* Presets */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {PRESETS.map(p => (
            <button key={p.name} onClick={() => applyPreset(p)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: activePreset === p.name ? '#a78bfa' : 'rgba(255,255,255,0.06)',
              color: activePreset === p.name ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{p.name}</button>
          ))}
        </div>

        {activePreset && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12, padding: 8, background: 'rgba(167,139,250,0.06)', borderRadius: 6 }}>
            {PRESETS.find(p => p.name === activePreset)?.description}
          </div>
        )}

        {/* Street Sizing Sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Flop Bet %', value: flopPct, set: setFlopPct, color: '#3b82f6' },
            { label: 'Turn Bet %', value: turnPct, set: setTurnPct, color: '#10b981' },
            { label: 'River Bet %', value: riverPct, set: setRiverPct, color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{s.label}</div>
              <input type="range" min={0} max={200} step={5} value={s.value} onChange={e => { s.set(parseInt(e.target.value)); setActivePreset(null); }} style={{ width: '100%', accentColor: s.color }} />
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}%</div>
            </div>
          ))}
        </div>

        {/* Street Breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {plan.streets.map((s, i) => (
            <div key={s.street} style={{
              display: 'grid', gridTemplateColumns: '70px 1fr 80px 80px 60px', alignItems: 'center', gap: 8,
              padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8,
              borderLeft: `3px solid ${['#3b82f6', '#10b981', '#f59e0b'][i]}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: ['#3b82f6', '#10b981', '#f59e0b'][i] }}>{s.street}</span>
              <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min((s.bet / effectiveStack) * 100 * 3, 100)}%`, background: ['#3b82f6', '#10b981', '#f59e0b'][i], borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, textAlign: 'right' }}>
                {s.bet > 0 ? `${s.bet.toFixed(1)} bb` : 'Check'}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
                Pot: {s.potAfter.toFixed(1)}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
                SPR: {s.spr}
              </span>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          {[
            { label: 'Total Invested', value: `${plan.totalInvested.toFixed(1)} bb`, color: '#a78bfa' },
            { label: 'Stack Committed', value: `${plan.commitPct}%`, color: plan.commitPct > 80 ? '#ef4444' : plan.commitPct > 50 ? '#f59e0b' : '#10b981' },
            { label: 'Stack Remaining', value: `${Math.max(0, effectiveStack - plan.totalInvested).toFixed(1)} bb`, color: '#3b82f6' },
            { label: 'All-In?', value: plan.isAllIn ? 'YES' : 'No', color: plan.isAllIn ? '#ef4444' : '#10b981' },
          ].map(s => (
            <div key={s.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Multi-Street Planner failed to load: {err.message}</div>;
  }
}

export default MultiStreetPlanner;
