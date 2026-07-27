/**
 * POPUP HUD OVERLAY
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GTO Wizard-style HUD stats overlay:
 * - Real-time player stats popup on hover
 * - VPIP, PFR, 3-Bet, Fold to 3-Bet, C-Bet, WTSD, W$SD
 * - Color-coded stat ranges (tight/loose/passive/aggressive)
 * - Positional stats breakdown
 * - Player type classification
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● PLAYER ARCHETYPES ●●●
const ARCHETYPES = {
  nit: { label: 'Nit', color: '#3b82f6', icon: '◇', desc: 'Extremely tight, only plays premium hands' },
  tag: { label: 'TAG', color: '#22c55e', icon: '◆', desc: 'Tight-Aggressive — solid winning player' },
  lag: { label: 'LAG', color: '#f59e0b', icon: '▲', desc: 'Loose-Aggressive — wide range, lots of pressure' },
  whale: { label: 'Whale', color: '#ef4444', icon: '●', desc: 'Loose-Passive — calls too much, easy to value bet' },
  maniac: { label: 'Maniac', color: '#a855f7', icon: '▲', desc: 'Hyper-aggressive, bets and raises everything' },
  rock: { label: 'Rock', color: '#64748b', icon: '●', desc: 'Very tight and passive, predictable' },
};

// ●●● SAMPLE PLAYERS ●●●
const SAMPLE_PLAYERS = [
  {
    name: 'Hero', seat: 1, stack: 102.5, position: 'BTN',
    stats: { vpip: 24, pfr: 19, threeBet: 8.5, foldTo3Bet: 55, cbet: 68, foldToCbet: 42, wtsd: 28, wsd: 54, af: 3.2, hands: 1250 },
    positional: { UTG: { vpip: 12, pfr: 11 }, MP: { vpip: 16, pfr: 14 }, CO: { vpip: 28, pfr: 24 }, BTN: { vpip: 42, pfr: 35 }, SB: { vpip: 35, pfr: 28 }, BB: { vpip: 32, pfr: 12 } },
  },
  {
    name: 'FishyMcFish', seat: 2, stack: 67.3, position: 'SB',
    stats: { vpip: 52, pfr: 8, threeBet: 2.1, foldTo3Bet: 75, cbet: 45, foldToCbet: 55, wtsd: 38, wsd: 42, af: 0.8, hands: 380 },
    positional: { UTG: { vpip: 35, pfr: 5 }, MP: { vpip: 42, pfr: 6 }, CO: { vpip: 55, pfr: 8 }, BTN: { vpip: 65, pfr: 12 }, SB: { vpip: 58, pfr: 10 }, BB: { vpip: 62, pfr: 5 } },
  },
  {
    name: 'GTO_Shark', seat: 3, stack: 145.8, position: 'BB',
    stats: { vpip: 26, pfr: 22, threeBet: 10.2, foldTo3Bet: 48, cbet: 72, foldToCbet: 38, wtsd: 26, wsd: 56, af: 3.8, hands: 5200 },
    positional: { UTG: { vpip: 14, pfr: 13 }, MP: { vpip: 18, pfr: 16 }, CO: { vpip: 30, pfr: 27 }, BTN: { vpip: 45, pfr: 38 }, SB: { vpip: 38, pfr: 32 }, BB: { vpip: 34, pfr: 14 } },
  },
  {
    name: 'AggroDogg', seat: 4, stack: 198.2, position: 'UTG',
    stats: { vpip: 35, pfr: 30, threeBet: 14.5, foldTo3Bet: 35, cbet: 82, foldToCbet: 28, wtsd: 30, wsd: 48, af: 4.5, hands: 920 },
    positional: { UTG: { vpip: 22, pfr: 20 }, MP: { vpip: 28, pfr: 25 }, CO: { vpip: 40, pfr: 36 }, BTN: { vpip: 52, pfr: 45 }, SB: { vpip: 42, pfr: 38 }, BB: { vpip: 38, pfr: 18 } },
  },
  {
    name: 'NitKing99', seat: 5, stack: 88.4, position: 'MP',
    stats: { vpip: 11, pfr: 9, threeBet: 3.2, foldTo3Bet: 72, cbet: 55, foldToCbet: 50, wtsd: 22, wsd: 58, af: 2.1, hands: 2100 },
    positional: { UTG: { vpip: 6, pfr: 5 }, MP: { vpip: 8, pfr: 7 }, CO: { vpip: 14, pfr: 12 }, BTN: { vpip: 18, pfr: 15 }, SB: { vpip: 12, pfr: 10 }, BB: { vpip: 15, pfr: 4 } },
  },
  {
    name: 'CallStation42', seat: 6, stack: 43.7, position: 'CO',
    stats: { vpip: 45, pfr: 6, threeBet: 1.5, foldTo3Bet: 82, cbet: 35, foldToCbet: 62, wtsd: 42, wsd: 38, af: 0.5, hands: 650 },
    positional: { UTG: { vpip: 30, pfr: 3 }, MP: { vpip: 38, pfr: 4 }, CO: { vpip: 48, pfr: 6 }, BTN: { vpip: 58, pfr: 8 }, SB: { vpip: 52, pfr: 7 }, BB: { vpip: 55, pfr: 4 } },
  },
];

function classifyPlayer(stats) {
  if (stats.vpip < 15 && stats.pfr < 12) return stats.af > 2 ? 'nit' : 'rock';
  if (stats.vpip < 28 && stats.pfr > 18) return 'tag';
  if (stats.vpip > 35 && stats.pfr > 25) return stats.af > 4 ? 'maniac' : 'lag';
  if (stats.vpip > 40 && stats.pfr < 12) return 'whale';
  if (stats.vpip > 30 && stats.pfr > 20) return 'lag';
  return 'tag';
}

function getStatColor(stat, value) {
  if (stat === 'vpip') return value > 35 ? '#ef4444' : value > 25 ? '#f59e0b' : value > 18 ? '#22c55e' : '#3b82f6';
  if (stat === 'pfr') return value > 25 ? '#ef4444' : value > 18 ? '#f59e0b' : value > 12 ? '#22c55e' : '#3b82f6';
  if (stat === 'threeBet') return value > 12 ? '#ef4444' : value > 8 ? '#f59e0b' : value > 5 ? '#22c55e' : '#3b82f6';
  if (stat === 'cbet') return value > 75 ? '#ef4444' : value > 60 ? '#22c55e' : value > 40 ? '#f59e0b' : '#3b82f6';
  if (stat === 'af') return value > 4 ? '#ef4444' : value > 2.5 ? '#22c55e' : value > 1.5 ? '#f59e0b' : '#3b82f6';
  return '#94a3b8';
}

// ●●● STAT CELL ●●●
function StatCell({ label, value, stat, suffix }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#475569', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: getStatColor(stat, value), fontSize: 14, fontWeight: 800 }}>
        {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}{suffix || ''}
      </div>
    </div>
  );
}

// ●●● PLAYER CARD ●●●
function PlayerCard({ player, isExpanded, onToggle }) {
  const archetype = classifyPlayer(player.stats);
  const arch = ARCHETYPES[archetype];

  return (
    <div style={{
      background: isExpanded ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)',
      borderRadius: 8, padding: 10, cursor: 'pointer',
      border: isExpanded ? `1px solid ${arch.color}30` : '1px solid rgba(255,255,255,0.04)',
      transition: 'all 0.2s',
    }} onClick={onToggle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>{arch.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700 }}>{player.name}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: arch.color, fontSize: 9, fontWeight: 700 }}>{arch.label}</span>
            <span style={{ color: '#475569', fontSize: 9 }}>Seat {player.seat}</span>
            <span style={{ color: '#f59e0b', fontSize: 9, fontWeight: 600 }}>{player.position}</span>
            <span style={{ color: '#64748b', fontSize: 9 }}>{player.stack.toFixed(1)}bb</span>
          </div>
        </div>
        <span style={{ color: '#475569', fontSize: 9 }}>{player.stats.hands} hands</span>
      </div>

      {/* Quick stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
        <StatCell label="VPIP" value={player.stats.vpip} stat="vpip" suffix="%" />
        <StatCell label="PFR" value={player.stats.pfr} stat="pfr" suffix="%" />
        <StatCell label="3-Bet" value={player.stats.threeBet} stat="threeBet" suffix="%" />
        <StatCell label="C-Bet" value={player.stats.cbet} stat="cbet" suffix="%" />
        <StatCell label="AF" value={player.stats.af} stat="af" />
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
          {/* Extended stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 10 }}>
            <StatCell label="F to 3B" value={player.stats.foldTo3Bet} stat="foldTo3Bet" suffix="%" />
            <StatCell label="F to CB" value={player.stats.foldToCbet} stat="foldToCbet" suffix="%" />
            <StatCell label="WTSD" value={player.stats.wtsd} stat="wtsd" suffix="%" />
            <StatCell label="W$SD" value={player.stats.wsd} stat="wsd" suffix="%" />
          </div>

          {/* Positional stats */}
          <div style={{ color: '#475569', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
            Positional VPIP / PFR
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3 }}>
            {Object.entries(player.positional || {}).map(([pos, stats]) => (
              <div key={pos} style={{
                background: 'rgba(0,0,0,0.2)', borderRadius: 4, padding: '4px 2px', textAlign: 'center',
              }}>
                <div style={{ color: '#64748b', fontSize: 7, fontWeight: 700 }}>{pos}</div>
                <div style={{ color: getStatColor('vpip', stats.vpip), fontSize: 10, fontWeight: 700 }}>{stats.vpip}</div>
                <div style={{ color: getStatColor('pfr', stats.pfr), fontSize: 9, fontWeight: 600 }}>{stats.pfr}</div>
              </div>
            ))}
          </div>

          {/* Archetype description */}
          <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 4, background: `${arch.color}10` }}>
            <span style={{ color: arch.color, fontSize: 10 }}>{arch.desc}</span>
          </div>

          {/* Exploits */}
          <div style={{ marginTop: 8 }}>
            <div style={{ color: '#475569', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Exploit Suggestions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {player.stats.vpip > 35 && (
                <div style={{ color: '#22c55e', fontSize: 10 }}>• Value bet thinner — calls too wide</div>
              )}
              {player.stats.foldTo3Bet > 65 && (
                <div style={{ color: '#22c55e', fontSize: 10 }}>• 3-bet light — folds too much to 3-bets</div>
              )}
              {player.stats.foldToCbet > 55 && (
                <div style={{ color: '#22c55e', fontSize: 10 }}>• C-bet wider — overfolds to continuation bets</div>
              )}
              {player.stats.cbet > 75 && (
                <div style={{ color: '#22c55e', fontSize: 10 }}>• Check-raise more — c-bets too aggressively</div>
              )}
              {player.stats.pfr < 10 && player.stats.vpip > 30 && (
                <div style={{ color: '#22c55e', fontSize: 10 }}>• Iso-raise — passive preflop, easy to dominate</div>
              )}
              {player.stats.wtsd > 35 && (
                <div style={{ color: '#22c55e', fontSize: 10 }}>• Reduce bluffs — goes to showdown too often</div>
              )}
              {player.stats.af < 1.5 && (
                <div style={{ color: '#22c55e', fontSize: 10 }}>• Bet for value more — passive postflop</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ●●● TABLE VIEW ●●●
function TableView({ players, expandedPlayer, setExpandedPlayer }) {
  const positions = [
    { angle: 270, label: 'BTN' },
    { angle: 330, label: 'SB' },
    { angle: 30, label: 'BB' },
    { angle: 90, label: 'UTG' },
    { angle: 150, label: 'MP' },
    { angle: 210, label: 'CO' },
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: 260, marginBottom: 12 }}>
      {/* Table */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 220, height: 120, borderRadius: '50%',
        background: 'rgba(34,197,94,0.08)', border: '2px solid rgba(34,197,94,0.2)',
      }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#22c55e', fontSize: 11, fontWeight: 600, opacity: 0.5 }}>
          Pot: 12.5bb
        </div>
      </div>

      {/* Seats */}
      {players.map((p, i) => {
        const pos = positions[i];
        const rad = (pos.angle * Math.PI) / 180;
        const x = 50 + 42 * Math.cos(rad);
        const y = 50 + 38 * Math.sin(rad);
        const arch = ARCHETYPES[classifyPlayer(p.stats)];
        const isExp = expandedPlayer === i;

        return (
          <div key={i} onClick={() => setExpandedPlayer(isExp ? null : i)} style={{
            position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)',
            background: isExp ? `${arch.color}25` : 'rgba(0,0,0,0.4)',
            border: `1px solid ${isExp ? arch.color + '50' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 6, padding: '4px 8px', cursor: 'pointer', minWidth: 60, textAlign: 'center',
            transition: 'all 0.2s',
          }}>
            <div style={{ color: '#f1f5f9', fontSize: 9, fontWeight: 700 }}>{p.name.slice(0, 8)}</div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              <span style={{ color: getStatColor('vpip', p.stats.vpip), fontSize: 8, fontWeight: 700 }}>{p.stats.vpip}</span>
              <span style={{ color: '#475569', fontSize: 8 }}>/</span>
              <span style={{ color: getStatColor('pfr', p.stats.pfr), fontSize: 8, fontWeight: 700 }}>{p.stats.pfr}</span>
              <span style={{ color: '#475569', fontSize: 8 }}>/</span>
              <span style={{ color: getStatColor('threeBet', p.stats.threeBet), fontSize: 8, fontWeight: 700 }}>{p.stats.threeBet}</span>
            </div>
            <div style={{ color: '#f59e0b', fontSize: 7, fontWeight: 600 }}>{p.stack.toFixed(1)}bb</div>
          </div>
        );
      })}
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function PopupHUDOverlay() {
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [view, setView] = useState('table'); // table | list

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Player HUD</h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Click any player for detailed stats and exploits</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['table', 'list'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: view === v ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                color: view === v ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
              }}>{v === 'table' ? 'Table View' : 'List View'}</button>
            ))}
          </div>
        </div>

        {/* Table View */}
        {view === 'table' && (
          <TableView players={SAMPLE_PLAYERS} expandedPlayer={expandedPlayer} setExpandedPlayer={setExpandedPlayer} />
        )}

        {/* Player Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(view === 'list' ? SAMPLE_PLAYERS : expandedPlayer !== null ? [SAMPLE_PLAYERS[expandedPlayer]] : []).map((p, i) => (
            <PlayerCard key={p.name} player={p} isExpanded={true} onToggle={() => view === 'list' && setExpandedPlayer(expandedPlayer === i ? null : i)} />
          ))}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {Object.values(ARCHETYPES || {}).map(a => (
            <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10 }}>{a.icon}</span>
              <span style={{ color: a.color, fontSize: 9, fontWeight: 600 }}>{a.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Player HUD</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
