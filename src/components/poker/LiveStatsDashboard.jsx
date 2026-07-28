/**
 * LiveStatsDashboard — Real-Time Session Statistics Panel (Phase 26 #4)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Slide-out panel showing live session performance metrics.
 * All data is accumulated in-memory from table events — zero DB calls.
 * 
 * Features:
 *   - Session P&L sparkline graph
 *   - Running VPIP / PFR / AF / Win Rate
 *   - Position-based win-rate breakdown
 *   - Biggest pot won/lost
 *   - Session duration timer
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════
//  SPARKLINE — Tiny SVG P&L Graph
// ═══════════════════════════════════════════════════════════

function Sparkline({ data, width = 200, height = 50, color = '#4ade80' }) {
  if (!data || data.length < 2) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;
  
  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  
  const lastVal = data[data.length - 1];
  const firstVal = data[0];
  const isPositive = lastVal >= firstVal;
  const lineColor = isPositive ? '#4ade80' : '#ef4444';
  
  // Create gradient fill area
  const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;
  
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Zero line */}
      {min < 0 && max > 0 && (
        <line
          x1={padding} y1={height - padding - ((0 - min) / range) * (height - padding * 2)}
          x2={width - padding} y2={height - padding - ((0 - min) / range) * (height - padding * 2)}
          stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" strokeDasharray="3,3"
        />
      )}
      {/* Fill area */}
      <polygon points={areaPoints} fill="url(#sparkGrad)" />
      {/* Line */}
      <polyline points={points} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* End dot */}
      <circle
        cx={width - padding}
        cy={height - padding - ((lastVal - min) / range) * (height - padding * 2)}
        r="3" fill={lineColor}
      />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
//  STAT ROW
// ═══════════════════════════════════════════════════════════

function StatRow({ label, value, color = '#E4E6EB', suffix = '' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ color: '#B0B3B8', fontSize: 11 }}>{label}</span>
      <span style={{ color, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {value}{suffix}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  POSITION WIN-RATE BAR
// ═══════════════════════════════════════════════════════════

function PositionBar({ label, wins, total, color }) {
  const pct = total > 0 ? (wins / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ color: '#888', fontSize: 10, width: 28, fontWeight: 600 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ height: '100%', background: color, borderRadius: 3 }}
        />
      </div>
      <span style={{ color: '#aaa', fontSize: 9, width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function LiveStatsDashboard({ isOpen, onClose, stats }) {
  const {
    handsPlayed = 0,
    handsWon = 0,
    vpipCount = 0,
    pfrCount = 0,
    aggressionBets = 0,
    aggressionCalls = 0,
    biggestWin = 0,
    biggestLoss = 0,
    plHistory = [],
    positionWins = {},
    positionTotal = {},
    sessionStart = Date.now(),
    currentStack = 0,
    startingStack = 0,
  } = stats || {};

  const [elapsed, setElapsed] = useState('0:00');

  useEffect(() => {
    if (!isOpen) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - sessionStart) / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setElapsed(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isOpen, sessionStart]);

  const vpip = handsPlayed > 0 ? ((vpipCount / handsPlayed) * 100).toFixed(1) : '0.0';
  const pfr = handsPlayed > 0 ? ((pfrCount / handsPlayed) * 100).toFixed(1) : '0.0';
  const af = aggressionCalls > 0 ? (aggressionBets / aggressionCalls).toFixed(2) : '∞';
  const winRate = handsPlayed > 0 ? ((handsWon / handsPlayed) * 100).toFixed(1) : '0.0';
  const netPL = currentStack - startingStack;

  const POS_COLORS = {
    BTN: '#FFD700', SB: '#ef4444', BB: '#22c55e',
    EP: '#60a5fa', MP: '#a78bfa', LP: '#fb923c',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{
            position: 'absolute', top: 8, right: 8, bottom: 8,
            width: 260, zIndex: 60,
            background: 'linear-gradient(180deg, rgba(20,20,28,0.97) 0%, rgba(10,10,15,0.98) 100%)',
            borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
            backdropFilter: 'blur(20px)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'rgba(0,0,0,0.3)',
          }}>
            <div>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>SESSION STATS</div>
              <div style={{ color: '#666', fontSize: 9, fontFamily: 'monospace' }}>{elapsed}</div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.06)', color: '#888', border: 'none', borderRadius: 6, width: 28, height: 28, fontSize: 14, cursor: 'pointer' }}
            >✕</button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {/* P&L Header */}
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ color: '#888', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>Net P&L</div>
              <div style={{
                fontSize: 28, fontWeight: 900,
                color: netPL >= 0 ? '#4ade80' : '#ef4444',
                fontVariantNumeric: 'tabular-nums',
                textShadow: `0 0 20px ${netPL >= 0 ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}>
                {netPL >= 0 ? '+' : ''}{netPL.toLocaleString()}
              </div>
            </div>

            {/* Sparkline */}
            {plHistory.length >= 2 && (
              <div style={{
                background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 6px',
                marginBottom: 12, border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <Sparkline data={plHistory} width={228} height={48} />
              </div>
            )}

            {/* Stats Grid */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: '#666', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Performance</div>
              <StatRow label="Hands Played" value={handsPlayed} />
              <StatRow label="Win Rate" value={winRate} suffix="%" color={parseFloat(winRate) > 40 ? '#4ade80' : '#ef4444'} />
              <StatRow label="VPIP" value={vpip} suffix="%" color="#60a5fa" />
              <StatRow label="PFR" value={pfr} suffix="%" color="#a78bfa" />
              <StatRow label="Aggression" value={af} color="#FFD700" />
              <StatRow label="Biggest Win" value={`+${biggestWin.toLocaleString()}`} color="#4ade80" />
              <StatRow label="Biggest Loss" value={`-${biggestLoss.toLocaleString()}`} color="#ef4444" />
            </div>

            {/* Position Win Rates */}
            <div>
              <div style={{ color: '#666', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Win Rate by Position</div>

              {/* Phase 27 #4: Mini Table Felt Heatmap */}
              <div style={{
                position: 'relative', width: '100%', height: 80,
                background: 'radial-gradient(ellipse at center, #1a3a2a 0%, #0d1f15 70%)',
                borderRadius: 40, border: '2px solid rgba(139,69,19,0.5)',
                marginBottom: 10, boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
              }}>
                {/* Position dots arranged around the mini table */}
                {[
                  { pos: 'BTN', x: '82%', y: '50%' },
                  { pos: 'SB', x: '70%', y: '15%' },
                  { pos: 'BB', x: '50%', y: '10%' },
                  { pos: 'EP', x: '30%', y: '15%' },
                  { pos: 'MP', x: '18%', y: '50%' },
                  { pos: 'LP', x: '30%', y: '85%' },
                ].map(seat => {
                  const wins = positionWins[seat.pos] || 0;
                  const total = positionTotal[seat.pos] || 0;
                  const winPct = total > 0 ? (wins / total) * 100 : 50;
                  const dotColor = total === 0 ? '#555' : winPct >= 50 ? '#22c55e' : winPct >= 30 ? '#eab308' : '#ef4444';
                  return (
                    <div
                      key={seat.pos}
                      style={{
                        position: 'absolute', left: seat.x, top: seat.y,
                        transform: 'translate(-50%, -50%)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                      }}
                    >
                      <div style={{
                        width: 14, height: 14, borderRadius: '50%',
                        background: `radial-gradient(circle, ${dotColor}, ${dotColor}88)`,
                        border: '1.5px solid rgba(255,255,255,0.2)',
                        boxShadow: total > 0 ? `0 0 6px ${dotColor}60` : 'none',
                      }} />
                      <span style={{ color: '#aaa', fontSize: 7, fontWeight: 700 }}>{seat.pos}</span>
                    </div>
                  );
                })}
                {/* "D" dealer button */}
                <div style={{
                  position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#FFD700', color: '#000', fontSize: 8, fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 8px rgba(255,215,0,0.4)',
                }}>D</div>
              </div>

              {Object.entries(POS_COLORS || {}).map(([pos, color]) => (
                <PositionBar
                  key={pos}
                  label={pos}
                  wins={positionWins[pos] || 0}
                  total={positionTotal[pos] || 0}
                  color={color}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
