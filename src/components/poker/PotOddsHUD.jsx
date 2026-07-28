/**
 * PotOddsHUD — Phase 27 Feature #3
 * ═══════════════════════════════════════════════════
 * Compact overlay showing real-time pot odds and SPR
 * when the hero faces a bet/raise decision.
 *
 * Props:
 *   potSize       — current total pot
 *   betToCall     — amount hero must call
 *   heroStack     — hero's remaining chip stack
 *   isVisible     — show only when hero faces a bet
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PotOddsHUD({ potSize = 0, betToCall = 0, heroStack = 0, isVisible = false }) {
  if (!isVisible || betToCall <= 0 || potSize <= 0) return null;

  // Calculate pot odds: pot:bet ratio and equity needed
  const totalPot = potSize + betToCall; // pot after our call
  const potOddsRatio = (potSize / betToCall).toFixed(1);
  const equityNeeded = ((betToCall / totalPot) * 100).toFixed(1);

  // Stack-to-pot ratio
  const spr = heroStack > 0 ? (heroStack / potSize).toFixed(1) : '∞';

  // Color coding based on pot odds favorability
  const isGoodOdds = parseFloat(equityNeeded) < 25;
  const isMarginal = parseFloat(equityNeeded) >= 25 && parseFloat(equityNeeded) < 35;
  const oddsColor = isGoodOdds ? '#22c55e' : isMarginal ? '#eab308' : '#ef4444';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'fixed',
          top: 60,
          right: 12,
          zIndex: 120,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '8px 14px',
          minWidth: 150,
          pointerEvents: 'none',
        }}
      >
        {/* Header */}
        <div style={{
          fontSize: 9, fontWeight: 800, color: '#666',
          letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
        }}>
          POT ODDS
        </div>

        {/* Main odds display */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
          <span style={{ color: oddsColor, fontSize: 16, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
            {potOddsRatio}:1
          </span>
          <span style={{ color: '#888', fontSize: 10 }}>
            Need {equityNeeded}%
          </span>
        </div>

        {/* SPR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#555', fontSize: 9, fontWeight: 700 }}>SPR</span>
            <span style={{
              color: parseFloat(spr) > 8 ? '#22c55e' : parseFloat(spr) > 3 ? '#eab308' : '#ef4444',
              fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            }}>
              {spr}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#555', fontSize: 9, fontWeight: 700 }}>CALL</span>
            <span style={{ color: '#B0B3B8', fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {betToCall.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Favorability bar */}
        <div style={{
          width: '100%', height: 3, borderRadius: 2, marginTop: 6,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, 100 - parseFloat(equityNeeded))}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
              height: '100%', borderRadius: 2,
              background: `linear-gradient(90deg, ${oddsColor}80, ${oddsColor})`,
            }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
