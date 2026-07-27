/**
 * TABLE DYNAMICS PANEL
 * ═══════════════════════════════════════════════════════════════════════════
 * Real-time table dynamics analysis:
 * - Table aggression meter
 * - Stack distribution visualization
 * - Position advantage indicator
 * - Table type classification
 * - Dynamic strategy adjustments
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo } from 'react';

// ═══ TABLE PRESETS ═══
const TABLE_PRESETS = [
  {
    id: 'tough', label: 'Tough Table',
    players: [
      { name: 'RegShark1', position: 'UTG', stack: 105, vpip: 22, pfr: 19, af: 3.5 },
      { name: 'RegShark2', position: 'MP', stack: 112, vpip: 24, pfr: 21, af: 3.2 },
      { name: 'GTO_Pro', position: 'CO', stack: 145, vpip: 26, pfr: 23, af: 3.8 },
      { name: 'Hero', position: 'BTN', stack: 100, vpip: 25, pfr: 20, af: 3.0 },
      { name: 'TightReg', position: 'SB', stack: 88, vpip: 18, pfr: 15, af: 2.8 },
      { name: 'NittyNick', position: 'BB', stack: 92, vpip: 14, pfr: 11, af: 2.2 },
    ]
  },
  {
    id: 'soft', label: 'Soft Table',
    players: [
      { name: 'FishyJoe', position: 'UTG', stack: 45, vpip: 55, pfr: 8, af: 0.6 },
      { name: 'Hero', position: 'MP', stack: 120, vpip: 25, pfr: 20, af: 3.0 },
      { name: 'Whale99', position: 'CO', stack: 200, vpip: 48, pfr: 5, af: 0.4 },
      { name: 'RecPlayer', position: 'BTN', stack: 65, vpip: 42, pfr: 12, af: 1.0 },
      { name: 'CasualDan', position: 'SB', stack: 78, vpip: 38, pfr: 10, af: 0.8 },
      { name: 'TightFish', position: 'BB', stack: 55, vpip: 32, pfr: 6, af: 0.5 },
    ]
  },
  {
    id: 'mixed', label: 'Mixed Table',
    players: [
      { name: 'RegPlayer', position: 'UTG', stack: 98, vpip: 22, pfr: 18, af: 3.0 },
      { name: 'FishBoy', position: 'MP', stack: 52, vpip: 50, pfr: 7, af: 0.5 },
      { name: 'Hero', position: 'CO', stack: 115, vpip: 25, pfr: 20, af: 3.0 },
      { name: 'Maniac42', position: 'BTN', stack: 180, vpip: 38, pfr: 32, af: 4.5 },
      { name: 'NitKing', position: 'SB', stack: 90, vpip: 12, pfr: 10, af: 2.0 },
      { name: 'Station88', position: 'BB', stack: 68, vpip: 45, pfr: 5, af: 0.4 },
    ]
  },
];

// ═══ TABLE TYPE CLASSIFICATION ═══
function classifyTable(players) {
  const avgVpip = players.reduce((a, p) => a + p.vpip, 0) / players.length;
  const avgPfr = players.reduce((a, p) => a + p.pfr, 0) / players.length;
  const avgAf = players.reduce((a, p) => a + p.af, 0) / players.length;

  if (avgVpip > 35) return { type: 'Loose-Passive', color: '#22c55e', desc: 'Very soft — value bet relentlessly, tighten bluffs', icon: '💰' };
  if (avgVpip > 30 && avgAf > 2.5) return { type: 'Loose-Aggressive', color: '#f59e0b', desc: 'Wild table — tighten up, trap with premium hands', icon: '🔥' };
  if (avgVpip < 22 && avgAf > 2.5) return { type: 'Tight-Aggressive', color: '#ef4444', desc: 'Reg-heavy — look for seat change or adjust dynamics', icon: '⚔️' };
  if (avgVpip < 22) return { type: 'Tight-Passive', color: '#3b82f6', desc: 'Steal aggressively, bluff more, they overfold', icon: '🧊' };
  return { type: 'Mixed', color: '#a855f7', desc: 'Adjust per-player, target the weakest links', icon: '🎯' };
}

// ═══ AGGRESSION METER ═══
function AggressionMeter({ value, label }) {
  const color = value > 3.0 ? '#ef4444' : value > 2.0 ? '#f59e0b' : value > 1.0 ? '#22c55e' : '#3b82f6';
  const pct = Math.min(100, (value / 5) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#64748b', fontSize: 9, fontWeight: 600 }}>{label}</span>
        <span style={{ color, fontSize: 11, fontWeight: 800 }}>{value.toFixed(1)}</span>
      </div>
      <div style={{ height: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'all 0.3s' }} />
      </div>
    </div>
  );
}

// ═══ STACK DISTRIBUTION ═══
function StackDistribution({ players }) {
  const maxStack = Math.max(...players.map(p => p.stack));
  return (
    <div>
      <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Stack Distribution</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
        {players.map((p, i) => {
          const pct = (p.stack / maxStack) * 100;
          const isHero = p.name === 'Hero';
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ color: '#64748b', fontSize: 7, marginBottom: 2 }}>{p.stack}bb</span>
              <div style={{
                width: '100%', borderRadius: '3px 3px 0 0',
                height: `${pct * 0.6}px`,
                background: isHero ? '#3b82f6' : p.vpip > 35 ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.1)',
                border: isHero ? '1px solid rgba(59,130,246,0.5)' : 'none',
                transition: 'height 0.3s',
              }} />
              <span style={{ color: isHero ? '#3b82f6' : '#475569', fontSize: 7, fontWeight: isHero ? 700 : 500, marginTop: 2 }}>
                {p.position}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══ DYNAMIC ADJUSTMENTS ═══
function DynamicAdjustments({ players, tableType }) {
  const adjustments = [];
  const fish = players.filter(p => p.vpip > 35 && p.name !== 'Hero');
  const regs = players.filter(p => p.vpip < 28 && p.pfr > 15 && p.name !== 'Hero');
  const maniacs = players.filter(p => p.af > 4 && p.name !== 'Hero');
  const shortStacks = players.filter(p => p.stack < 40 && p.name !== 'Hero');

  if (fish.length > 0) {
    adjustments.push({ priority: 'high', text: `Isolate ${fish.map(f => f.name).join(', ')} with wider range`, color: '#22c55e' });
    adjustments.push({ priority: 'high', text: 'Value bet thinner — they call too wide', color: '#22c55e' });
  }
  if (regs.length >= 3) {
    adjustments.push({ priority: 'medium', text: 'Consider table change — too many regs', color: '#f59e0b' });
  }
  if (maniacs.length > 0) {
    adjustments.push({ priority: 'high', text: `Tighten range vs ${maniacs.map(m => m.name).join(', ')}, then trap`, color: '#ef4444' });
  }
  if (shortStacks.length > 0) {
    adjustments.push({ priority: 'low', text: `Short stacks (${shortStacks.map(s => s.name).join(', ')}) — expect shove-or-fold`, color: '#3b82f6' });
  }
  if (tableType.type === 'Loose-Passive') {
    adjustments.push({ priority: 'medium', text: 'Reduce bluff frequency — they call too much', color: '#f59e0b' });
    adjustments.push({ priority: 'medium', text: 'Increase value bet sizing — charge draws', color: '#f59e0b' });
  }
  if (tableType.type === 'Tight-Aggressive') {
    adjustments.push({ priority: 'medium', text: 'Steal blinds more aggressively', color: '#a855f7' });
    adjustments.push({ priority: 'low', text: '3-bet light from BTN and CO', color: '#3b82f6' });
  }

  return (
    <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12 }}>
      <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Strategy Adjustments</div>
      {adjustments.map((a, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', marginTop: 4, flexShrink: 0,
            background: a.priority === 'high' ? '#ef4444' : a.priority === 'medium' ? '#f59e0b' : '#3b82f6',
          }} />
          <span style={{ color: '#94a3b8', fontSize: 10, lineHeight: 1.4 }}>{a.text}</span>
        </div>
      ))}
    </div>
  );
}

// ═══ MAIN COMPONENT ═══
export default function TableDynamicsPanel() {
  const [selectedTable, setSelectedTable] = useState(0);
  const [isPoppedOut, setIsPoppedOut] = useState(false);
  
  const table = TABLE_PRESETS[selectedTable];
  const tableType = useMemo(() => classifyTable(table.players), [table]);

  const avgVpip = table.players.reduce((a, p) => a + p.vpip, 0) / table.players.length;
  const avgPfr = table.players.reduce((a, p) => a + p.pfr, 0) / table.players.length;
  const avgAf = table.players.reduce((a, p) => a + p.af, 0) / table.players.length;
  const avgStack = table.players.reduce((a, p) => a + p.stack, 0) / table.players.length;

  const PanelWrapper = isPoppedOut ? motion.div : 'div';
  const wrapperProps = isPoppedOut ? {
    drag: true,
    dragMomentum: false,
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    style: {
      position: 'fixed',
      top: '10%',
      right: '10%',
      zIndex: 9999,
      width: 350,
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
      cursor: 'grab'
    },
    whileDrag: { cursor: 'grabbing' }
  } : {
    style: {
      width: '100%'
    }
  };

  try {
    return (
      <PanelWrapper {...wrapperProps}>
        <div style={{ background: 'rgba(15,23,42,0.85)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Table Dynamics</h3>
                <button 
                  onClick={() => setIsPoppedOut(!isPoppedOut)}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: 4,
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    fontSize: 10
                  }}
                >
                  {isPoppedOut ? 'Dock' : 'Pop-out'}
                </button>
              </div>
              <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>Real-time table analysis and strategy</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 18 }}>{tableType.icon}</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: tableType.color, fontSize: 13, fontWeight: 800 }}>{tableType.type}</div>
                <div style={{ color: '#64748b', fontSize: 9 }}>{tableType.desc.split('—')[0]}</div>
              </div>
            </div>
          </div>

        {/* Table preset selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {TABLE_PRESETS.map((t, i) => (
            <button key={t.id} onClick={() => setSelectedTable(i)} style={{
              padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: selectedTable === i ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              color: selectedTable === i ? '#3b82f6' : '#94a3b8',
              fontSize: 11, fontWeight: 600,
              border: selectedTable === i ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Stats overview */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Avg VPIP', value: `${avgVpip.toFixed(0)}%`, color: avgVpip > 30 ? '#22c55e' : '#f59e0b' },
            { label: 'Avg PFR', value: `${avgPfr.toFixed(0)}%`, color: '#3b82f6' },
            { label: 'Avg AF', value: avgAf.toFixed(1), color: avgAf > 2.5 ? '#ef4444' : '#22c55e' },
            { label: 'Avg Stack', value: `${avgStack.toFixed(0)}bb`, color: '#a855f7' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 18, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Aggression + Stack */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10 }}>
            <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Aggression Profile</div>
            {table.players.map((p, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <AggressionMeter value={p.af} label={`${p.name} (${p.position})`} />
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10 }}>
            <StackDistribution players={table.players} />
          </div>
        </div>

        {/* Player Grid */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10, marginBottom: 16 }}>
          <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Player Overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 50px 50px 50px 50px', gap: 4, marginBottom: 4 }}>
            {['Player', 'Pos', 'VPIP', 'PFR', 'AF', 'Stack'].map(h => (
              <div key={h} style={{ color: '#475569', fontSize: 8, fontWeight: 700, textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>
          {table.players.map((p, i) => {
            const isHero = p.name === 'Hero';
            const isFish = p.vpip > 35;
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 50px 50px 50px 50px 50px', gap: 4, padding: '4px 0',
                borderTop: '1px solid rgba(255,255,255,0.03)',
                background: isHero ? 'rgba(59,130,246,0.05)' : isFish ? 'rgba(34,197,94,0.03)' : 'transparent',
              }}>
                <span style={{ color: isHero ? '#3b82f6' : '#f1f5f9', fontSize: 10, fontWeight: isHero ? 700 : 500 }}>{p.name}</span>
                <span style={{ color: '#f59e0b', fontSize: 10, fontWeight: 600 }}>{p.position}</span>
                <span style={{ color: p.vpip > 35 ? '#22c55e' : p.vpip < 20 ? '#3b82f6' : '#f1f5f9', fontSize: 10, fontWeight: 700 }}>{p.vpip}%</span>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>{p.pfr}%</span>
                <span style={{ color: p.af > 3 ? '#ef4444' : '#94a3b8', fontSize: 10 }}>{p.af}</span>
                <span style={{ color: p.stack < 50 ? '#f59e0b' : '#94a3b8', fontSize: 10 }}>{p.stack}bb</span>
              </div>
            );
          })}
        </div>

        {/* Dynamic Adjustments */}
        <DynamicAdjustments players={table.players} tableType={tableType} />
        </div>
      </PanelWrapper>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Table Dynamics</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
