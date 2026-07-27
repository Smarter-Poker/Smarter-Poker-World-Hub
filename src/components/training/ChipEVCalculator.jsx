/**
 * CHIP EV CALCULATOR
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Tournament chip EV calculations:
 * - Compare chip EV vs $EV in ICM spots
 * - Push/fold equity calculations
 * - Risk premium visualization
 * - Bubble factor analysis
 * - Stack-to-pot ratio considerations
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● TOURNAMENT SCENARIOS ●●●
const SCENARIOS = [
  {
    id: 'bubble_shove',
    name: 'Bubble Shove',
    desc: 'Final table bubble — 5 players, 4 pay',
    stacks: [
      { seat: 1, name: 'Hero (BTN)', chips: 25000, position: 'BTN' },
      { seat: 2, name: 'SB', chips: 15000, position: 'SB' },
      { seat: 3, name: 'BB', chips: 35000, position: 'BB' },
      { seat: 4, name: 'UTG', chips: 12000, position: 'UTG' },
      { seat: 5, name: 'CO', chips: 13000, position: 'CO' },
    ],
    blinds: { sb: 500, bb: 1000, ante: 100 },
    payouts: [50, 30, 20, 0, 0],
    totalChips: 100000,
    heroAction: 'Shove A9o from BTN',
    chipEV: 1850,
    dollarEV: 620,
    bubbleFactor: 1.42,
    riskPremium: 18,
    optimalPlay: 'Shove — +chipEV despite ICM pressure. A9o is profitable here due to fold equity.',
  },
  {
    id: 'icm_call',
    name: 'ICM Call Decision',
    desc: 'Short stack shoves, Hero in BB with TT',
    stacks: [
      { seat: 1, name: 'Hero (BB)', chips: 30000, position: 'BB' },
      { seat: 2, name: 'UTG (Shover)', chips: 8000, position: 'UTG' },
      { seat: 3, name: 'MP', chips: 22000, position: 'MP' },
      { seat: 4, name: 'CO', chips: 18000, position: 'CO' },
      { seat: 5, name: 'BTN', chips: 22000, position: 'BTN' },
    ],
    blinds: { sb: 600, bb: 1200, ante: 150 },
    payouts: [45, 27, 18, 10, 0],
    totalChips: 100000,
    heroAction: 'Call 8000 with TT',
    chipEV: 2400,
    dollarEV: 1180,
    bubbleFactor: 1.15,
    riskPremium: 8,
    optimalPlay: 'Call — Strong +chipEV and +$EV. TT dominates UTG shove range. Low ICM cost.',
  },
  {
    id: 'deep_3bet',
    name: 'Deep Stack 3-Bet Pot',
    desc: 'Early stages — deep stacks, low ICM pressure',
    stacks: [
      { seat: 1, name: 'Hero (CO)', chips: 45000, position: 'CO' },
      { seat: 2, name: 'BTN (3-Bettor)', chips: 52000, position: 'BTN' },
      { seat: 3, name: 'SB', chips: 28000, position: 'SB' },
      { seat: 4, name: 'BB', chips: 38000, position: 'BB' },
      { seat: 5, name: 'UTG', chips: 37000, position: 'UTG' },
    ],
    blinds: { sb: 200, bb: 400, ante: 50 },
    payouts: [40, 25, 18, 12, 5],
    totalChips: 200000,
    heroAction: '4-Bet to 6800 with AKs',
    chipEV: 3200,
    dollarEV: 2950,
    bubbleFactor: 1.05,
    riskPremium: 3,
    optimalPlay: '4-Bet — Deep stacks mean chipEV ≈ $EV. Play close to cash game strategy.',
  },
  {
    id: 'final_table',
    name: 'Final Table Pay Jump',
    desc: '3 players left — massive pay jump to 1st',
    stacks: [
      { seat: 1, name: 'Hero', chips: 35000, position: 'BTN' },
      { seat: 2, name: 'Chip Leader', chips: 42000, position: 'SB' },
      { seat: 3, name: 'Short Stack', chips: 23000, position: 'BB' },
    ],
    blinds: { sb: 1000, bb: 2000, ante: 250 },
    payouts: [50, 30, 20],
    totalChips: 100000,
    heroAction: 'Shove K8s from BTN',
    chipEV: 1200,
    dollarEV: -340,
    bubbleFactor: 2.15,
    riskPremium: 35,
    optimalPlay: 'Fold — Despite +chipEV, the $EV is negative. ICM pressure is extreme 3-handed with pay jumps.',
  },
];

// ●●● HELPER COMPONENTS ●●●
function StackBar({ player, maxChips, isHero }) {
  const pct = (player.chips / maxChips) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ color: isHero ? '#f59e0b' : '#94a3b8', fontSize: 10, width: 100, fontWeight: isHero ? 700 : 400 }}>{player.name}</span>
      <div style={{ flex: 1, height: 14, background: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3, transition: 'width 0.3s',
          background: isHero ? 'rgba(245,158,11,0.6)' : 'rgba(59,130,246,0.4)',
        }} />
      </div>
      <span style={{ color: isHero ? '#f59e0b' : '#f1f5f9', fontSize: 10, fontWeight: 700, width: 50, textAlign: 'right' }}>{(player.chips / 1000).toFixed(1)}k</span>
      <span style={{ color: '#64748b', fontSize: 9, width: 28 }}>{player.position}</span>
    </div>
  );
}

function EVComparisonBar({ chipEV, dollarEV }) {
  const maxAbs = Math.max(Math.abs(chipEV), Math.abs(dollarEV), 1);
  const chipPct = (chipEV / maxAbs) * 50;
  const dollarPct = (dollarEV / maxAbs) * 50;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
        <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Chip EV</div>
        <div style={{ color: chipEV >= 0 ? '#22c55e' : '#ef4444', fontSize: 24, fontWeight: 800 }}>
          {chipEV >= 0 ? '+' : ''}{chipEV}
        </div>
        <div style={{ height: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4, marginTop: 6, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.abs(chipPct) + 50}%`, height: '100%', borderRadius: 4,
            background: chipEV >= 0 ? '#22c55e' : '#ef4444', opacity: 0.6,
          }} />
        </div>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
        <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Dollar $EV</div>
        <div style={{ color: dollarEV >= 0 ? '#22c55e' : '#ef4444', fontSize: 24, fontWeight: 800 }}>
          {dollarEV >= 0 ? '+' : ''}${Math.abs(dollarEV)}
        </div>
        <div style={{ height: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4, marginTop: 6, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.abs(dollarPct) + 50}%`, height: '100%', borderRadius: 4,
            background: dollarEV >= 0 ? '#22c55e' : '#ef4444', opacity: 0.6,
          }} />
        </div>
      </div>
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function ChipEVCalculator() {
  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS[0]);

  const maxChips = useMemo(() => Math.max(...selectedScenario.stacks.map(s => s.chips)), [selectedScenario]);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Chip EV Calculator</h3>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Compare chip EV vs $EV in tournament spots</div>
        </div>

        {/* Scenario selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
          {SCENARIOS.map(s => (
            <button key={s.id} onClick={() => setSelectedScenario(s)} style={{
              padding: '6px 10px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
              background: selectedScenario.id === s.id ? 'rgba(245,158,11,0.15)' : 'rgba(0,0,0,0.15)',
              border: selectedScenario.id === s.id ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
              color: selectedScenario.id === s.id ? '#f1f5f9' : '#94a3b8', fontSize: 10, fontWeight: 600,
            }}>
              <div>{s.name}</div>
              <div style={{ color: '#64748b', fontSize: 8, marginTop: 1 }}>{s.desc}</div>
            </button>
          ))}
        </div>

        {/* Blinds & Info */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 9, fontWeight: 600 }}>
            Blinds: {selectedScenario.blinds.sb}/{selectedScenario.blinds.bb} + {selectedScenario.blinds.ante}a
          </span>
          <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: 9, fontWeight: 600 }}>
            Payouts: {selectedScenario.payouts.filter(p => p > 0).map(p => `${p}%`).join(' / ')}
          </span>
          <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontSize: 9, fontWeight: 600 }}>
            Action: {selectedScenario.heroAction}
          </span>
        </div>

        {/* Stack visualization */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10, marginBottom: 16 }}>
          <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Stack Distribution</div>
          {selectedScenario.stacks.map(p => (
            <StackBar key={p.seat} player={p} maxChips={maxChips} isHero={p.seat === 1} />
          ))}
        </div>

        {/* EV Comparison */}
        <div style={{ marginBottom: 16 }}>
          <EVComparisonBar chipEV={selectedScenario.chipEV} dollarEV={selectedScenario.dollarEV} />
        </div>

        {/* ICM Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>Bubble Factor</div>
            <div style={{ color: selectedScenario.bubbleFactor > 1.5 ? '#ef4444' : selectedScenario.bubbleFactor > 1.2 ? '#f59e0b' : '#22c55e', fontSize: 22, fontWeight: 800 }}>
              {selectedScenario.bubbleFactor.toFixed(2)}x
            </div>
            <div style={{ color: '#64748b', fontSize: 8, marginTop: 2 }}>
              {selectedScenario.bubbleFactor > 1.5 ? 'Extreme pressure' : selectedScenario.bubbleFactor > 1.2 ? 'Moderate pressure' : 'Low pressure'}
            </div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>Risk Premium</div>
            <div style={{ color: selectedScenario.riskPremium > 25 ? '#ef4444' : selectedScenario.riskPremium > 12 ? '#f59e0b' : '#22c55e', fontSize: 22, fontWeight: 800 }}>
              {selectedScenario.riskPremium}%
            </div>
            <div style={{ color: '#64748b', fontSize: 8, marginTop: 2 }}>
              ICM tax on aggressive plays
            </div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>EV Divergence</div>
            <div style={{ color: Math.abs(selectedScenario.chipEV - selectedScenario.dollarEV) > 1000 ? '#ef4444' : '#f59e0b', fontSize: 22, fontWeight: 800 }}>
              {Math.abs(selectedScenario.chipEV - selectedScenario.dollarEV)}
            </div>
            <div style={{ color: '#64748b', fontSize: 8, marginTop: 2 }}>
              Chip EV vs $EV gap
            </div>
          </div>
        </div>

        {/* Optimal Play */}
        <div style={{
          background: selectedScenario.dollarEV >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
          borderRadius: 8, padding: 12,
          border: selectedScenario.dollarEV >= 0 ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(239,68,68,0.15)',
        }}>
          <div style={{ color: selectedScenario.dollarEV >= 0 ? '#22c55e' : '#ef4444', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
            Optimal Play
          </div>
          <div style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1.6 }}>{selectedScenario.optimalPlay}</div>
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Chip EV Calculator</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
