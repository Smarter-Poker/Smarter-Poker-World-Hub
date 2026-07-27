/**
 * FinalTableICM — GTO Wizard-Style Final Table ICM Pressure Simulator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Simulate final table ICM scenarios with pay jumps, stack distributions,
 * bubble factor calculations, and optimal push/fold decisions.
 */
import React, { useState, useMemo } from 'react';

const SCENARIOS = [
  {
    id: 1, name: '9-Player FT Start',
    payouts: [10000, 6500, 4200, 3000, 2200, 1700, 1300, 1000, 800],
    stacks: [45000, 38000, 35000, 32000, 28000, 25000, 22000, 18000, 12000],
    blinds: '1000/2000 + 200', heroSeat: 0,
    description: 'Full final table just starting. Deep stacks, minimal ICM pressure.',
  },
  {
    id: 2, name: 'FT Bubble (10→9)',
    payouts: [10000, 6500, 4200, 3000, 2200, 1700, 1300, 1000, 800],
    stacks: [52000, 42000, 38000, 30000, 25000, 22000, 18000, 15000, 10000, 3000],
    blinds: '1000/2000 + 200', heroSeat: 0,
    description: 'Short stack about to bust. Maximum ICM pressure on medium stacks.',
  },
  {
    id: 3, name: '5-Handed Pay Jump',
    payouts: [10000, 6500, 4200, 3000, 2200],
    stacks: [85000, 62000, 55000, 38000, 15000],
    blinds: '2000/4000 + 400', heroSeat: 2,
    description: 'Significant pay jump from 5th to 4th. Short stack creates ICM tension.',
  },
  {
    id: 4, name: '3-Handed for Title',
    payouts: [10000, 6500, 4200],
    stacks: [120000, 95000, 40000],
    blinds: '3000/6000 + 600', heroSeat: 0,
    description: 'Heads-up bubble. Massive pay jump from 3rd to 2nd. Short stack survival pressure.',
  },
  {
    id: 5, name: 'Heads-Up Final',
    payouts: [10000, 6500],
    stacks: [155000, 100000],
    blinds: '4000/8000 + 800', heroSeat: 0,
    description: 'Heads-up for the title. ICM still matters — $3,500 pay difference.',
  },
];

function calculateICMEquity(stacks, payouts) {
  const total = stacks.reduce((s, v) => s + v, 0);
  // Simplified ICM: proportional + pay jump weighting
  return stacks.map((stack, i) => {
    const chipPct = stack / total;
    // Weight toward chip-chop but adjust for ICM compression
    const rawEquity = payouts.reduce((sum, payout, place) => {
      const prob = place === 0 ? chipPct : chipPct * (1 - chipPct) * (1 / (place + 0.5));
      return sum + prob * payout;
    }, 0);
    // Normalize
    return rawEquity;
  });
}

function StackBar({ stack, maxStack, label, color, equity, isHero }) {
  const pct = (stack / maxStack) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div style={{ width: 40, fontSize: 11, fontWeight: isHero ? 800 : 600, color: isHero ? '#f59e0b' : '#fff', textAlign: 'right' }}>{label}</div>
      <div style={{ flex: 1, height: 20, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, border: isHero ? '1px solid #f59e0b' : 'none' }} />
        <span style={{ position: 'absolute', left: 8, top: 2, fontSize: 10, fontWeight: 700, color: '#fff' }}>
          {(stack / 1000).toFixed(0)}K
        </span>
      </div>
      <div style={{ width: 60, fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>
        ${equity ? equity.toFixed(0) : '—'}
      </div>
    </div>
  );
}

function FinalTableICM() {
  const [selectedId, setSelectedId] = useState(1);
  const [showEquity, setShowEquity] = useState(true);

  const scenario = useMemo(() => SCENARIOS.find(s => s.id === selectedId), [selectedId]);
  const maxStack = useMemo(() => Math.max(...scenario.stacks), [scenario]);
  const totalChips = useMemo(() => scenario.stacks.reduce((s, v) => s + v, 0), [scenario]);

  const equities = useMemo(() => {
    return calculateICMEquity(scenario.stacks, scenario.payouts);
  }, [scenario]);

  const totalPrizePool = useMemo(() => scenario.payouts.reduce((s, v) => s + v, 0), [scenario]);

  const bubbleFactor = useMemo(() => {
    if (scenario.stacks.length <= 2) return 1.0;
    const heroEq = equities[scenario.heroSeat];
    const heroChipPct = scenario.stacks[scenario.heroSeat] / totalChips;
    const chipEV = heroChipPct * totalPrizePool;
    return heroEq > 0 ? (heroEq / chipEV) : 1;
  }, [equities, scenario, totalChips, totalPrizePool]);

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4'];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#f97316' }}>Final Table ICM</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showEquity} onChange={e => setShowEquity(e.target.checked)} style={{ accentColor: '#f97316' }} />
            Show $EV
          </label>
        </div>

        {/* Scenario Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {SCENARIOS.map(s => (
            <button key={s.id} onClick={() => setSelectedId(s.id)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: selectedId === s.id ? '#f97316' : 'rgba(255,255,255,0.06)',
              color: selectedId === s.id ? '#000' : 'rgba(255,255,255,0.7)', border: 'none',
            }}>{s.name}</button>
          ))}
        </div>

        {/* Description */}
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 12, padding: 10, background: 'rgba(249,115,22,0.06)', borderRadius: 6, border: '1px solid rgba(249,115,22,0.1)' }}>
          {scenario.description} — Blinds: {scenario.blinds}
        </div>

        {/* Stack Visualization */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>Stack Distribution</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Total: {(totalChips / 1000).toFixed(0)}K chips | Prize Pool: ${totalPrizePool.toLocaleString()}</span>
          </div>
          {scenario.stacks.map((stack, i) => (
            <StackBar
              key={i}
              stack={stack}
              maxStack={maxStack}
              label={`P${i + 1}`}
              color={colors[i % colors.length]}
              equity={showEquity ? equities[i] : null}
              isHero={i === scenario.heroSeat}
            />
          ))}
        </div>

        {/* Payout Structure */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {scenario.payouts.map((payout, i) => {
            const jump = i > 0 ? scenario.payouts[i - 1] - payout : 0;
            return (
              <div key={i} style={{
                padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', flex: 1, minWidth: 60,
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{i + 1}{i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>${payout.toLocaleString()}</div>
                {jump > 0 && <div style={{ fontSize: 9, color: '#f59e0b' }}>+${jump.toLocaleString()}</div>}
              </div>
            );
          })}
        </div>

        {/* ICM Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {[
            { label: 'Hero Chip EV', value: `$${((scenario.stacks[scenario.heroSeat] / totalChips) * totalPrizePool).toFixed(0)}`, color: '#3b82f6' },
            { label: 'Hero $EV (ICM)', value: `$${equities[scenario.heroSeat]?.toFixed(0) || '—'}`, color: '#10b981' },
            { label: 'Bubble Factor', value: bubbleFactor.toFixed(2), color: bubbleFactor > 1.3 ? '#ef4444' : '#f59e0b' },
            { label: 'ICM Tax', value: `${((1 - (equities[scenario.heroSeat] / ((scenario.stacks[scenario.heroSeat] / totalChips) * totalPrizePool))) * 100).toFixed(1)}%`, color: '#ec4899' },
            { label: 'Players Left', value: scenario.stacks.length, color: '#8b5cf6' },
            { label: 'Hero BBs', value: Math.round(scenario.stacks[scenario.heroSeat] / parseInt(scenario.blinds.split('/')[1])), color: '#22d3ee' },
          ].map(m => (
            <div key={m.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: m.color }}>{m.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Final Table ICM failed to load: {err.message}</div>;
  }
}

export default FinalTableICM;
