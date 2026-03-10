/**
 * 🎮 LIVE POKER TABLE — Real-Time Multiplayer
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Connects to the poker engine via Supabase Realtime (RealtimeSync).
 * Uses the custom PNG card deck from /public/cards/.
 * Based on the Golden Template table layout.
 * 
 * Features:
 *   - Real-time game state via Supabase channels
 *   - Animated card dealing & community cards
 *   - Action buttons (fold/check/call/bet/raise/all-in)
 *   - Bet slider with preset amounts
 *   - Turn timer with timebank display
 *   - Seat selection & buy-in dialog
 *   - Pot display with side pots
 *   - Chat overlay
 *   - Responsive (desktop + tablet)
 * 
 * Props:
 *   - tableId: string
 *   - supabase: Supabase client instance
 *   - userId: current user's ID
 *   - displayName: current user's display name
 *   - avatarUrl: current user's avatar
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTableConnection } from '../../hooks/useTableConnection';
import { PokerSoundManager } from './PokerSoundManager';
import ThrowableEmojis from './ThrowableEmojis';
import BBJTicker from './BBJTicker';
import { getHandStrength } from '../../lib/handStrength';

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════

import {
  TABLE_THEMES, getStoredThemeId, getStoredCardBack,
  getActiveTheme,
} from './TableThemes';
import ThemePicker from './ThemePicker';
import PlayerNoteModal from './PlayerNoteModal';
import PlayerQuickView from './PlayerQuickView';
import { eventBus, EventType } from '../../engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// MYSTERY BOUNTY ENVELOPE OVERLAY
// ═══════════════════════════════════════════════════════════════════════════

function MysteryBountyOverlay({ amount, onComplete }) {
  useEffect(() => {
    // Auto-dismiss after 6 seconds
    const timer = setTimeout(() => onComplete(), 6000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(5px)',
      }}
    >
      <motion.div
        initial={{ y: -500, rotate: -20, scale: 0.5 }}
        animate={{ y: 0, rotate: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 100 }}
        style={{
          width: 320, height: 200,
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
          borderRadius: 16,
          position: 'relative',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 40px rgba(255,215,0,0.4)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          border: '2px solid #FFF8DC',
        }}
      >
        {/* Envelope Flap Opening Animation */}
        <motion.div
          initial={{ rotateX: 0 }}
          animate={{ rotateX: 180 }}
          transition={{ delay: 1.5, duration: 0.8, ease: 'easeIn' }}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
            background: 'linear-gradient(180deg, #FFE4B5 0%, #FFD700 100%)',
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            transformOrigin: 'top',
            zIndex: 10,
            borderBottom: '1px solid rgba(0,0,0,0.2)',
          }}
        />

        {/* Revealed Bounty Amount */}
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1.2 }}
          transition={{ delay: 2.3, type: 'spring', bounce: 0.6 }}
          style={{
            background: '#fff',
            padding: '20px 40px',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            zIndex: 5,
            textAlign: 'center',
            border: '2px dashed #FFD700',
          }}
        >
          <div style={{ color: '#8B6508', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
            Mystery Bounty
          </div>
          <div style={{ color: '#22C55E', fontSize: 42, fontWeight: 900, textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            +${(amount || 0).toLocaleString()}
          </div>
        </motion.div>
      </motion.div>

      {/* Confetti particles */}
      {Array.from({ length: 30 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{
            x: 0, y: 0, opacity: 0, scale: 0
          }}
          animate={{
            x: (Math.random() - 0.5) * window.innerWidth,
            y: (Math.random() - 0.5) * window.innerHeight,
            opacity: [0, 1, 1, 0],
            scale: [0, Math.random() + 0.5, 0],
            rotate: Math.random() * 360 * 5,
          }}
          transition={{
            delay: 2.3,
            duration: 2 + Math.random() * 2,
            ease: "easeOut"
          }}
          style={{
            position: 'absolute',
            width: 10 + Math.random() * 10,
            height: 10 + Math.random() * 10,
            background: ['#FFD700', '#FF3366', '#00FFCC', '#FF9933'][Math.floor(Math.random() * 4)],
            borderRadius: Math.random() > 0.5 ? '50%' : '0%',
            zIndex: 9998,
          }}
        />
      ))}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOATING ACTION LABEL — rises from seat when player acts
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_LABEL_COLORS = {
  fold: '#ef4444', check: '#3b82f6', call: '#22c55e',
  bet: '#f59e0b', raise: '#f59e0b', all_in: '#a855f7',
};

function FloatingActionLabel({ action, amount, position }) {
  if (!action || !position) return null;
  const color = ACTION_LABEL_COLORS[action] || '#fff';
  const label = action === 'all_in' ? 'ALL-IN'
    : action === 'fold' ? 'FOLD'
      : action === 'check' ? 'CHECK'
        : action === 'call' ? `CALL ${amount ? amount.toLocaleString() : ''}`
          : action === 'bet' ? `BET ${amount ? amount.toLocaleString() : ''}`
            : action === 'raise' ? `RAISE ${amount ? amount.toLocaleString() : ''}`
              : action.toUpperCase();

  return (
    <motion.div
      key={`action-${Date.now()}`}
      initial={{ opacity: 1, y: 0, scale: 0.7 }}
      animate={{ opacity: 0, y: -40, scale: 1.1 }}
      transition={{ duration: 1.5, ease: 'easeOut' }}
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y - 8}%`,
        transform: 'translate(-50%, -100%)',
        color,
        fontSize: 13,
        fontWeight: 900,
        textShadow: `0 0 8px ${color}80, 0 2px 4px rgba(0,0,0,0.8)`,
        letterSpacing: 1,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 80,
      }}
    >
      {label}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFETTI BURST — particle celebration on big pot wins (50× BB+)
// ═══════════════════════════════════════════════════════════════════════════

function ConfettiBurst({ active }) {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (!active) { setParticles([]); return; }
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#a855f7', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899'];
    const newParticles = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 80,
      y: 30 + (Math.random() - 0.5) * 40,
      color: colors[i % colors.length],
      size: 4 + Math.random() * 6,
      rotation: Math.random() * 360,
      delay: Math.random() * 0.3,
    }));
    setParticles(newParticles);
    const t = setTimeout(() => setParticles([]), 2500);
    return () => clearTimeout(t);
  }, [active]);

  if (!particles.length) return null;

  return (
    <>
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ left: '50%', top: '40%', opacity: 1, scale: 1, rotate: 0 }}
          animate={{
            left: `${p.x}%`, top: `${p.y}%`,
            opacity: 0, scale: [1, 1.5, 0.5],
            rotate: p.rotation,
          }}
          transition={{ duration: 1.8, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            width: p.size, height: p.size,
            background: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            pointerEvents: 'none',
            zIndex: 90,
            boxShadow: `0 0 4px ${p.color}80`,
          }}
        />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// THEME PARTICLES — Dynamic background weather/effects based on theme
// ═══════════════════════════════════════════════════════════════════════════

function ThemeParticles({ config }) {
  if (!config) return null;
  const { type, count } = config;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 10 }}>
      <style>
        {`
          @keyframes driftDown {
            0% { transform: translateY(-10%) translateX(0); opacity: 0; }
            10% { opacity: 0.8; }
            90% { opacity: 0.8; }
            100% { transform: translateY(110%) translateX(20px); opacity: 0; }
          }
          @keyframes floatUp {
            0% { transform: translateY(110%) scale(0.5); opacity: 0; }
            50% { opacity: 0.6; }
            100% { transform: translateY(-10%) scale(1.2); opacity: 0; }
          }
          @keyframes firefly {
            0%, 100% { opacity: 0; transform: translate(0, 0) scale(1); }
            50% { opacity: 0.8; transform: translate(15px, -15px) scale(1.5); }
          }
        `}
      </style>
      {Array.from({ length: count }).map((_, i) => {
        let animName = '';
        let color = '#fff';
        let size = 3;

        if (type === 'snow') {
          animName = 'driftDown';
          size = 2 + Math.random() * 3;
          color = 'rgba(255,255,255,0.7)';
        } else if (type === 'goldDust') {
          animName = 'floatUp';
          size = 1 + Math.random() * 2;
          color = 'rgba(255,215,0,0.6)';
        } else if (type === 'fireflies') {
          animName = 'firefly';
          size = 2 + Math.random() * 2;
          color = 'rgba(167,243,208,0.8)'; // Greenish glow
        }

        const left = Math.random() * 100;
        const dur = (type === 'fireflies' ? 3 : 8) + Math.random() * 5;
        const delay = Math.random() * -10;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: left + '%',
              top: type === 'fireflies' ? (20 + Math.random() * 60) + '%' : '-10%',
              width: size,
              height: size,
              background: color,
              borderRadius: '50%',
              boxShadow: type === 'goldDust' || type === 'fireflies' ? `0 0 5px ${color}` : 'none',
              animation: `${animName} ${dur}s linear ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND STRENGTH METER — visual indicator for hero's relative hand strength
// ═══════════════════════════════════════════════════════════════════════════

const HAND_STRENGTH_RANKS = [
  { min: 0, max: 15, label: 'Weak', color: '#ef4444', glow: 'rgba(239,68,68,0.3)' },
  { min: 15, max: 35, label: 'Marginal', color: '#f97316', glow: 'rgba(249,115,22,0.3)' },
  { min: 35, max: 55, label: 'Medium', color: '#eab308', glow: 'rgba(234,179,8,0.3)' },
  { min: 55, max: 75, label: 'Strong', color: '#22c55e', glow: 'rgba(34,197,94,0.3)' },
  { min: 75, max: 90, label: 'Premium', color: '#3b82f6', glow: 'rgba(59,130,246,0.3)' },
  { min: 90, max: 101, label: 'Monster', color: '#a855f7', glow: 'rgba(168,85,247,0.4)' },
];

// Simple heuristic hand strength evaluator (preflop + postflop)
// Returns 0-100 representing relative strength
function evaluateHandStrength(holeCards, board) {
  if (!holeCards || holeCards.length < 2) return null;
  const RANKS_ORDER = '23456789TJQKA';
  const cardRank = (c) => {
    if (typeof c === 'number') return c >> 2;
    if (typeof c === 'string') {
      const r = c.slice(0, -1).toUpperCase().replace('10', 'T');
      return RANKS_ORDER.indexOf(r);
    }
    return c?.rank != null ? c.rank : 0;
  };
  const cardSuit = (c) => {
    if (typeof c === 'number') return c & 3;
    if (typeof c === 'string') return c.slice(-1).toLowerCase().charCodeAt(0);
    return c?.suit ?? 0;
  };

  const r1 = cardRank(holeCards[0]);
  const r2 = cardRank(holeCards[1]);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const isPair = r1 === r2;
  const isSuited = cardSuit(holeCards[0]) === cardSuit(holeCards[1]);
  const gap = high - low;
  const isConnected = gap === 1;

  // Base preflop strength (0-100)
  let strength = 0;
  if (isPair) {
    strength = 40 + (high / 12) * 55; // AA = 95, 22 = 40
  } else {
    strength = (high / 12) * 35 + (low / 12) * 15; // AKo ~50
    if (isSuited) strength += 8;
    if (isConnected) strength += 5;
    if (gap <= 2) strength += 3;
    if (gap >= 5) strength -= 5;
  }

  // Postflop adjustments if board is present
  if (board && board.length >= 3) {
    const boardRanks = board.map(c => cardRank(c));
    const allRanks = [r1, r2, ...boardRanks];
    const rankCounts = {};
    allRanks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    const maxCount = Math.max(...Object.values(rankCounts));
    const pairCount = Object.values(rankCounts).filter(c => c === 2).length;

    // Made hand bonuses
    if (maxCount >= 4) strength = Math.max(strength, 92); // Quads
    else if (maxCount === 3 && pairCount >= 1) strength = Math.max(strength, 88); // Full House
    else if (maxCount === 3) strength = Math.max(strength, 75); // Trips
    else if (pairCount >= 2) strength = Math.max(strength, 65); // Two Pair
    else if (maxCount === 2 && (rankCounts[r1] === 2 || rankCounts[r2] === 2)) {
      // Hero has a pair with the board
      const pairedRank = rankCounts[r1] === 2 ? r1 : r2;
      const isTopPair = pairedRank >= Math.max(...boardRanks);
      strength = Math.max(strength, isTopPair ? 60 : 45);
    }

    // Flush check (simplified — checks if hero has 2 cards of same suit as 3+ board cards)
    const allSuits = [cardSuit(holeCards[0]), cardSuit(holeCards[1]), ...board.map(c => cardSuit(c))];
    const suitCounts = {};
    allSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const heroSuits = [cardSuit(holeCards[0]), cardSuit(holeCards[1])];
    heroSuits.forEach(hs => {
      if ((suitCounts[hs] || 0) >= 5) strength = Math.max(strength, 82); // Flush
      else if ((suitCounts[hs] || 0) >= 4 && isSuited) strength = Math.max(strength, 55); // Flush draw
    });

    // Overcards (both cards above all board cards)
    if (r1 > Math.max(...boardRanks) && r2 > Math.max(...boardRanks) && maxCount < 2) {
      strength = Math.max(strength, 30);
    }
  }

  return Math.min(100, Math.max(0, Math.round(strength)));
}

function HandStrengthMeter({ holeCards, board, visible }) {
  if (!visible || !holeCards || holeCards.length < 2) return null;
  const strength = evaluateHandStrength(holeCards, board);
  if (strength == null) return null;
  const tier = HAND_STRENGTH_RANKS.find(t => strength >= t.min && strength < t.max) || HAND_STRENGTH_RANKS[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(0,0,0,0.8)', borderRadius: 8,
        padding: '3px 10px', border: `1px solid ${tier.color}40`,
        boxShadow: `0 0 12px ${tier.glow}`,
        marginTop: 4,
      }}
    >
      {/* Strength bar */}
      <div style={{ width: 50, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${strength}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ height: '100%', background: tier.color, borderRadius: 3 }}
        />
      </div>
      {/* Label */}
      <span style={{ fontSize: 9, fontWeight: 700, color: tier.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {tier.label}
      </span>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// POT ODDS HUD — displays pot odds when hero faces a bet
// ═══════════════════════════════════════════════════════════════════════════

function PotOddsHUD({ callAmount, potTotal, visible }) {
  if (!visible || !callAmount || callAmount <= 0 || !potTotal) return null;
  const potOddsRatio = (potTotal + callAmount) / callAmount;
  const potOddsPct = ((callAmount / (potTotal + callAmount)) * 100).toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(0,0,0,0.85)', borderRadius: 10,
        padding: '4px 12px', marginBottom: 4,
        border: '1px solid rgba(59,130,246,0.3)',
        boxShadow: '0 0 15px rgba(59,130,246,0.15)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pot Odds</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>
        {potOddsRatio.toFixed(1)}:1
      </span>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>({potOddsPct}%)</span>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EQUITY PROGRESS BAR — animated win% on all-in
// ═══════════════════════════════════════════════════════════════════════════

function EquityBar({ players }) {
  if (!players || players.length < 2) return null;

  // Sort by equity descending for visual consistency
  const sorted = [...players].sort((a, b) => (b.equity || 0) - (a.equity || 0));
  const eqColors = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#a855f7', '#ec4899'];

  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.5 }}
      style={{
        position: 'absolute',
        bottom: '18%',
        left: '15%',
        right: '15%',
        zIndex: 60,
        borderRadius: 8,
        overflow: 'hidden',
        height: 14,
        display: 'flex',
        background: 'rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {sorted.map((p, i) => (
        <motion.div
          key={p.id || i}
          initial={{ width: 0 }}
          animate={{ width: `${p.equity || 0}%` }}
          transition={{ duration: 1.2, delay: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          style={{
            height: '100%',
            background: eqColors[i % eqColors.length],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 900,
            color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            minWidth: (p.equity || 0) > 15 ? 'auto' : 0,
          }}
        >
          {(p.equity || 0) > 15 ? `${(p.equity || 0).toFixed(0)}%` : ''}
        </motion.div>
      ))}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HAPTIC FEEDBACK — mobile vibration for key events
// ═══════════════════════════════════════════════════════════════════════════

function haptic(type = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  const patterns = { light: [10], medium: [30], heavy: [50], double: [20, 40, 20], allIn: [50, 30, 80] };
  try { navigator.vibrate(patterns[type] || patterns.light); } catch (_) { }
}

// Dynamic theme — updated when user changes theme, read by all sub-components
let T = getActiveTheme();

// ═══════════════════════════════════════════════════════════════════════════
// AVATAR RESOLUTION — Maps user avatars to table-optimized images
// ═══════════════════════════════════════════════════════════════════════════

const FALLBACK_TABLE_AVATARS = [
  '/avatars/table/free_shark.png',
  '/avatars/table/free_lion.png',
  '/avatars/table/free_owl.png',
  '/avatars/table/free_fox.png',
  '/avatars/table/free_ninja.png',
  '/avatars/table/free_pirate.png',
  '/avatars/table/free_samurai.png',
  '/avatars/table/free_viking.png',
  '/avatars/table/free_knight.png',
  '/avatars/table/free_cowboy.png',
];

function resolveTableAvatar(avatarUrl, seatIndex = 0) {
  // Custom avatar (Supabase upload or external URL) — use directly
  if (avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('data:'))) {
    return avatarUrl;
  }
  // Library avatar path — map to table-optimized version
  if (avatarUrl && avatarUrl.startsWith('/avatars/')) {
    const filename = avatarUrl.split('/').pop().replace('.png', '');
    const tier = avatarUrl.includes('/vip/') ? 'vip' : 'free';
    return `/avatars/table/${tier}_${filename}.png`;
  }
  // Fallback: deterministic avatar based on seat index
  return FALLBACK_TABLE_AVATARS[seatIndex % FALLBACK_TABLE_AVATARS.length];
}

// ═══════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS — 2 to 10 seats (percentages of table container)
// Positions are OUTSIDE the table felt so avatars don't overlap the surface
// ═══════════════════════════════════════════════════════════════════════════

const SEAT_LAYOUTS = {
  2: [
    { x: 50, y: 96 },  // Hero (bottom — off table)
    { x: 50, y: -2 },  // Opponent (top — off table)
  ],
  3: [
    { x: 50, y: 96 },
    { x: 4, y: 28 },
    { x: 96, y: 28 },
  ],
  4: [
    { x: 50, y: 96 },
    { x: 2, y: 50 },
    { x: 50, y: -2 },
    { x: 98, y: 50 },
  ],
  5: [
    { x: 50, y: 96 },
    { x: 2, y: 62 },
    { x: 16, y: -2 },
    { x: 84, y: -2 },
    { x: 98, y: 62 },
  ],
  6: [
    { x: 50, y: 96 },   // Bottom center (hero)
    { x: 2, y: 68 },    // Left lower
    { x: 0, y: 28 },    // Left upper
    { x: 34, y: -4 },   // Top left
    { x: 66, y: -4 },   // Top right
    { x: 98, y: 28 },   // Right upper
  ],
  7: [
    { x: 50, y: 96 },
    { x: 4, y: 74 },
    { x: -2, y: 40 },
    { x: 18, y: -4 },
    { x: 82, y: -4 },
    { x: 102, y: 40 },
    { x: 96, y: 74 },
  ],
  8: [
    { x: 50, y: 96 },
    { x: 10, y: 82 },
    { x: -2, y: 48 },
    { x: 10, y: 10 },
    { x: 50, y: -4 },
    { x: 90, y: 10 },
    { x: 102, y: 48 },
    { x: 90, y: 82 },
  ],
  9: [
    { x: 50, y: 96 },   // Seat 1 — Hero (bottom center)
    { x: 12, y: 82 },   // Seat 2 — Lower left
    { x: -2, y: 50 },   // Seat 3 — Middle left
    { x: 8, y: 14 },    // Seat 4 — Upper left
    { x: 34, y: -4 },   // Seat 5 — Top left
    { x: 66, y: -4 },   // Seat 6 — Top right
    { x: 92, y: 14 },   // Seat 7 — Upper right
    { x: 102, y: 50 },  // Seat 8 — Middle right
    { x: 88, y: 82 },   // Seat 9 — Lower right
  ],
  10: [
    { x: 50, y: 96 },
    { x: 14, y: 84 },
    { x: -2, y: 58 },
    { x: 2, y: 24 },
    { x: 24, y: -4 },
    { x: 50, y: -6 },
    { x: 76, y: -4 },
    { x: 98, y: 24 },
    { x: 102, y: 58 },
    { x: 86, y: 84 },
  ],
};

function getSeatPositions(maxSeats) {
  return SEAT_LAYOUTS[maxSeats] || SEAT_LAYOUTS[9];
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD RENDERING — Custom PNG Deck
// ═══════════════════════════════════════════════════════════════════════════

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];

function cardIntToPath(card) {
  if (card === null || card === undefined) return null;
  const rank = Math.floor(card / 4);
  const suit = card % 4;
  return `/cards/${SUITS[suit]}_${RANKS[rank]}.png`;
}

function CardImg({ card, width = 48, faceDown = false, style = {}, delay = 0, cardBackPath, showdown = false }) {
  const height = Math.round(width * 1.4);
  const backPath = cardBackPath || getStoredCardBack();

  // ═══ SHOWDOWN 3D FLIP — card back visible first, then flips to reveal face ═══
  if (showdown && !faceDown && card != null) {
    const faceSrc = cardIntToPath(card);
    return (
      <motion.div
        style={{ width, height, perspective: 600, flexShrink: 0, ...style }}
        initial={{ opacity: 0, scale: 0.7, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, delay }}
      >
        <motion.div
          initial={{ rotateY: 180 }}
          animate={{ rotateY: 0 }}
          transition={{ duration: 0.5, delay: delay + 0.2, ease: [0.34, 1.56, 0.64, 1] }}
          style={{
            width: '100%', height: '100%', position: 'relative',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Front face (the actual card) */}
          <div style={{
            position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
            borderRadius: 4, overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.7)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}>
            {faceSrc && <img src={faceSrc} alt={`Card ${card}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />}
          </div>
          {/* Back face (card back, visible at start of flip) */}
          <div style={{
            position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: 4, overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <img src={backPath} alt="Card back" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // ═══ Standard card display (hero cards, community cards, face-down) ═══
  const src = faceDown ? backPath : cardIntToPath(card);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, rotateY: 180 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.4, delay }}
      style={{
        width, height,
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
        ...style,
      }}
    >
      {src && (
        <img
          src={src}
          alt={faceDown ? 'Card' : `Card ${card}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          draggable={false}
        />
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER SEAT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function PlayerSeat({
  seat, position, isHero, isCurrentActor, timerState, onClick, onNote, noteColor, noteType,
  numHoleCards = 2, isWinner = false, equity = null, gamePosition = null,
}) {
  const { status, player, stack, holeCards, isFolded, invested } = seat;
  const isEmpty = status === 'empty' || status === 'reserved';

  // Position badge config
  const POSITION_BADGES = {
    btn: { label: 'D', bg: '#FFD700', color: '#000' },
    sb: { label: 'SB', bg: '#4FC3F7', color: '#000' },
    bb: { label: 'BB', bg: '#81C784', color: '#000' },
    utg: { label: 'UTG', bg: '#E0E0E0', color: '#333' },
  };
  const posBadge = !isEmpty && gamePosition ? POSITION_BADGES[gamePosition] : null;
  const isSittingOut = status === 'sitting_out';
  const isDisconnected = status === 'disconnected';
  const avatarSize = isHero ? 90 : 72;

  // Resolve avatar — uses pre-made library avatars with table-optimized versions
  const resolvedAvatar = !isEmpty ? resolveTableAvatar(player?.avatarUrl, seat.seatIndex || 0) : null;

  // Dynamic card width: scale down for Omaha variants
  const cardWidth = isHero
    ? (numHoleCards <= 2 ? 52 : numHoleCards <= 4 ? 40 : 34)
    : (numHoleCards <= 2 ? 36 : numHoleCards <= 4 ? 28 : 24);
  const faceDownWidth = numHoleCards <= 2 ? 28 : numHoleCards <= 4 ? 22 : 18;

  // Timer ring
  const showTimer = isCurrentActor && timerState;
  const turnTime = timerState?.turnTime || 30;
  const isTimebank = timerState?.isTimebank;
  const timerPct = showTimer ? (timerState.remaining / (isTimebank ? 30 : turnTime)) * 100 : 0;
  const timerColor = showTimer
    ? isTimebank ? '#FF9800'  // Orange for timebank
      : timerState.remaining <= 10 ? T.timerWarning : T.timerNormal
    : T.timerNormal;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        cursor: isEmpty ? 'pointer' : onNote ? 'pointer' : 'default',
        zIndex: isCurrentActor ? 20 : 10,
        opacity: isFolded ? 0.4 : 1,
        transition: 'opacity 0.3s',
      }}
      onClick={() => isEmpty && onClick?.()}
      onContextMenu={(e) => {
        if (!isEmpty && onNote) { e.preventDefault(); onNote(); }
      }}
      onDoubleClick={() => {
        if (!isEmpty && onNote) onNote();
      }}
    >
      {/* Invested chips — floats near avatar */}
      {invested > 0 && !isFolded && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          style={{
            position: 'absolute',
            top: isHero ? -24 : 'auto',
            bottom: isHero ? 'auto' : -20,
            background: 'rgba(0,0,0,0.8)',
            color: T.accent,
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
            border: `1px solid ${T.accentDim}`,
            whiteSpace: 'nowrap',
            zIndex: 6,
          }}
        >
          {invested}
        </motion.div>
      )}

      {/* Avatar image + Timer ring */}
      <div style={{ position: 'relative' }}>
        {showTimer && (
          <>
            {/* Premium Shot Clock Ring */}
            <svg
              width={avatarSize + 14}
              height={avatarSize + 14}
              style={{
                position: 'absolute',
                top: -7, left: -7,
                transform: 'rotate(-90deg)',
                filter: timerState.remaining <= 5 ? `drop-shadow(0 0 8px ${timerColor})` : 'none',
              }}
            >
              {/* Background track */}
              <circle
                cx={(avatarSize + 14) / 2}
                cy={(avatarSize + 14) / 2}
                r={(avatarSize + 8) / 2}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={4}
              />
              {/* Animated countdown arc */}
              <circle
                cx={(avatarSize + 14) / 2}
                cy={(avatarSize + 14) / 2}
                r={(avatarSize + 8) / 2}
                fill="none"
                stroke={timerColor}
                strokeWidth={4}
                strokeDasharray={Math.PI * (avatarSize + 8)}
                strokeDashoffset={Math.PI * (avatarSize + 8) * (1 - timerPct / 100)}
                strokeLinecap="round"
                style={{
                  transition: 'stroke-dashoffset 1s linear, stroke 0.3s',
                  animation: timerState.remaining <= 5 ? 'shotClockPulse 0.6s ease-in-out infinite' : 'none',
                }}
              />
            </svg>
            {/* Countdown seconds display */}
            <div style={{
              position: 'absolute',
              top: -12, left: '50%', transform: 'translateX(-50%)',
              background: timerState.remaining <= 5 ? timerColor : 'rgba(0,0,0,0.85)',
              color: timerState.remaining <= 5 ? '#000' : '#fff',
              fontSize: 11, fontWeight: 900, padding: '1px 7px',
              borderRadius: 6, zIndex: 4, lineHeight: 1.4,
              fontVariantNumeric: 'tabular-nums',
              border: `1px solid ${timerState.remaining <= 5 ? timerColor : 'rgba(255,255,255,0.15)'}`,
              boxShadow: timerState.remaining <= 5 ? `0 0 10px ${timerColor}80` : 'none',
              animation: timerState.remaining <= 3 ? 'shotClockBlink 0.4s ease-in-out infinite' : 'none',
              transition: 'background 0.3s, color 0.3s',
            }}>
              {isTimebank ? '⏳ ' : ''}{Math.ceil(timerState.remaining)}s
            </div>
          </>
        )}

        <div
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: '50%',
            background: isEmpty
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.3)',
            border: isEmpty
              ? '2px dashed rgba(255,255,255,0.2)'
              : isWinner
                ? '3px solid #FFD700'
                : isCurrentActor
                  ? `3px solid ${T.accent}`
                  : '2px solid rgba(255,255,255,0.15)',
            animation: isCurrentActor && !isWinner ? 'seatPulse 1.8s ease-in-out infinite' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: isWinner
              ? '0 0 20px rgba(255,215,0,0.6), 0 0 40px rgba(255,215,0,0.2)'
              : isCurrentActor
                ? `0 0 20px ${T.accent}40`
                : '0 4px 12px rgba(0,0,0,0.5)',
            filter: isDisconnected ? 'grayscale(1)' : isSittingOut ? 'brightness(0.5)' : 'none',
          }}
        >
          {isEmpty ? (
            <span style={{ fontSize: 28, color: 'rgba(255,255,255,0.3)' }}>+</span>
          ) : resolvedAvatar ? (
            <img
              src={resolvedAvatar}
              alt={player?.displayName || 'Player'}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                const errors = parseInt(e.target.dataset.errorCount || '0', 10);
                e.target.dataset.errorCount = errors + 1;
                if (errors === 0 && player?.avatarUrl && e.target.src !== player.avatarUrl) {
                  // Step 1: try original avatar path
                  e.target.src = player.avatarUrl;
                } else if (errors <= 1) {
                  // Step 2: deterministic seat fallback
                  e.target.src = FALLBACK_TABLE_AVATARS[(seat.seatIndex || 0) % FALLBACK_TABLE_AVATARS.length];
                } else {
                  // Step 3: inline SVG — cannot fail
                  e.target.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="%23374151"/><text x="40" y="52" text-anchor="middle" fill="white" font-size="32" font-family="sans-serif">' + ((player?.displayName || '?')[0] || '?').toUpperCase() + '</text></svg>')}`;
                }
              }}
            />
          ) : (
            <span style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>
              {(player?.displayName || '?')[0].toUpperCase()}
            </span>
          )}
        </div>

        {/* Note color dot indicator */}
        {noteColor && (
          <div style={{
            position: 'absolute', top: 0, left: 0, width: 12, height: 12,
            borderRadius: '50%', background: noteColor, border: '2px solid rgba(0,0,0,0.4)',
            zIndex: 5,
          }} />
        )}

        {/* Position badge (D / SB / BB / UTG) */}
        {posBadge && (
          <div style={{
            position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)',
            background: posBadge.bg, color: posBadge.color,
            fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 6,
            lineHeight: 1.3, zIndex: 5, border: '1px solid rgba(0,0,0,0.2)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}>{posBadge.label}</div>
        )}
      </div>

      {/* All-in equity percentage badge */}
      {equity != null && !isEmpty && !isFolded && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            background: equity >= 60
              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
              : equity >= 40
                ? 'linear-gradient(135deg, #eab308, #ca8a04)'
                : 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 800,
            padding: '2px 10px',
            borderRadius: 10,
            textAlign: 'center',
            minWidth: 44,
            letterSpacing: -0.5,
            boxShadow: equity >= 60
              ? '0 0 12px rgba(34,197,94,0.5)'
              : equity >= 40
                ? '0 0 12px rgba(234,179,8,0.5)'
                : '0 0 12px rgba(239,68,68,0.5)',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          {equity.toFixed(1)}%
        </motion.div>
      )}

      {/* Player Name — displayed below avatar */}
      {!isEmpty && (
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: isCurrentActor ? T.accent : '#fff',
          textAlign: 'center',
          maxWidth: 90,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          lineHeight: 1.2,
        }}>
          {noteType && noteType !== 'unknown' && (
            <span style={{ marginRight: 2, fontSize: isHero ? 11 : 9 }}>
              {({ fish: '🐟', reg: '🎯', shark: '🦈', whale: '🐋', nit: '🐢', lag: '🔥', tag: '🎯' })[noteType] || ''}
            </span>
          )}
          {player?.displayName || 'Player'}
          {isSittingOut && ' 💤'}
          {isDisconnected && ' 📡'}
        </div>
      )}

      {/* Chip Count + Chip Stack Visualization */}
      {!isEmpty && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Mini chip stack tower — height proportional to BBs */}
          {(() => {
            const bb = (typeof stack === 'number' && seat.bigBlind) ? Math.floor(stack / (seat.bigBlind || 1)) : 0;
            const chipCount = bb >= 100 ? 5 : bb >= 50 ? 4 : bb >= 20 ? 3 : bb >= 5 ? 2 : 1;
            const CHIP_COLORS = ['#e8e8e8', '#ef4444', '#22c55e', '#1e1e1e', '#a855f7'];
            return (
              <div style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'center', gap: 0, marginRight: 1 }}>
                {Array.from({ length: chipCount }).map((_, ci) => (
                  <motion.div
                    key={ci}
                    initial={{ scale: 0, y: 8 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={{ delay: ci * 0.05, duration: 0.2, ease: 'easeOut' }}
                    style={{
                      width: 14, height: 4, borderRadius: 2,
                      background: `linear-gradient(to bottom, ${CHIP_COLORS[ci % CHIP_COLORS.length]}cc, ${CHIP_COLORS[ci % CHIP_COLORS.length]})`,
                      border: '0.5px solid rgba(255,255,255,0.35)',
                      boxShadow: '0 1px 1px rgba(0,0,0,0.4), inset 0 0.5px 0.5px rgba(255,255,255,0.2)',
                      marginBottom: ci > 0 ? -1 : 0,
                    }}
                  />
                ))}
              </div>
            );
          })()}
          <div style={{
            fontSize: 13, fontWeight: 800,
            color: isCurrentActor ? T.accent : '#FFD700',
            textAlign: 'center',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.1,
          }}>
            {typeof stack === 'number' ? stack.toLocaleString() : '0'}
          </div>
        </div>
      )}

      {/* Hole cards (hero or showdown) */}
      {holeCards && holeCards.length > 0 && (
        <>
          <div style={{
            display: 'flex', gap: 3, marginTop: 2,
            ...(isWinner ? {
              filter: 'drop-shadow(0 0 8px #FFD700) drop-shadow(0 0 16px rgba(255,215,0,0.4))',
              animation: 'winGlow 1.2s ease-in-out infinite alternate',
            } : {}),
          }}>
            {holeCards.map((card, i) => (
              <CardImg key={i} card={card} width={cardWidth} delay={i * 0.15} showdown={!isHero} />
            ))}
          </div>
          {/* Hand Strength Meter — hero only */}
          {isHero && <HandStrengthMeter holeCards={holeCards} board={null} visible={true} />}
        </>
      )}

      {/* Face-down cards for non-hero active players */}
      {!holeCards && !isEmpty && !isFolded && seat.isInHand && (
        <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
          {Array.from({ length: numHoleCards }).map((_, i) => (
            <CardImg key={i} card={null} width={faceDownWidth} faceDown delay={i * 0.08} />
          ))}
        </div>
      )}

      {/* Empty seat label */}
      {isEmpty && (
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
          {status === 'reserved' ? 'Reserved' : 'Open Seat'}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNITY CARDS
// ═══════════════════════════════════════════════════════════════════════════

function CommunityCards({ cards = [], boards, prevCardCount }) {
  // Track the index of newly dealt cards for spotlight effect
  const isNewCard = useCallback((idx) => {
    // Spotlight the last card dealt when going from 3→4 (turn) or 4→5 (river)
    return (cards.length === 4 && idx === 3) || (cards.length === 5 && idx === 4);
  }, [cards.length]);
  // Multi-board mode (double/triple board) — Run-It-Twice/Thrice
  if (boards && boards.length > 1 && boards.some(b => b.length > 0)) {
    const BOARD_COLORS = ['#FFD700', '#4fc3f7', '#ce93d8'];
    const BOARD_LABELS = ['Board 1', 'Board 2', 'Board 3'];
    const BOARD_GLOWS = ['rgba(255,215,0,0.15)', 'rgba(79,195,247,0.15)', 'rgba(206,147,216,0.15)'];
    return (
      <div style={{
        position: 'absolute', top: '35%', left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', gap: 4, zIndex: 15,
        alignItems: 'center',
      }}>
        {boards.map((board, bi) => (
          board.length > 0 && (
            <React.Fragment key={`board-${bi}`}>
              {/* Lightning bolt divider between boards */}
              {bi > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  justifyContent: 'center', padding: '1px 0',
                }}>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)' }} />
                  <span style={{ fontSize: 12, filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.5))' }}>⚡</span>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)' }} />
                </div>
              )}
              <motion.div
                initial={{ opacity: 0, y: bi * 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: bi * 0.2, duration: 0.4 }}
                style={{
                  display: 'flex', gap: 5, alignItems: 'center',
                  background: BOARD_GLOWS[bi] || BOARD_GLOWS[0],
                  borderRadius: 10, padding: '4px 8px',
                  border: `1px solid ${BOARD_COLORS[bi] || BOARD_COLORS[0]}30`,
                }}
              >
                <span style={{
                  fontSize: 9, color: BOARD_COLORS[bi] || BOARD_COLORS[0],
                  fontWeight: 800, marginRight: 2, textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>{BOARD_LABELS[bi] || `Board ${bi + 1}`}</span>
                {board.map((card, ci) => (
                  <motion.div
                    key={`b${bi}-c${ci}`}
                    initial={{ rotateY: 180, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ delay: bi * 0.3 + ci * 0.1, duration: 0.4 }}
                  >
                    <CardImg card={card} width={42} delay={bi * 0.3 + ci * 0.1} />
                  </motion.div>
                ))}
              </motion.div>
            </React.Fragment>
          )
        ))}
      </div>
    );
  }

  // Standard single board
  if (cards.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '42%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        gap: 6,
        zIndex: 15,
      }}
    >
      {/* Ambient glow behind cards */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 0.4, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: `${cards.length * 58 + 40}px`,
          height: '90px',
          background: `radial-gradient(ellipse, ${T.accent}30 0%, transparent 70%)`,
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />
      {cards.map((card, i) => (
        <motion.div
          key={`cc-${i}`}
          style={{
            animation: isNewCard(i) ? 'cardSpotlight 1.5s ease-in-out' : 'none',
          }}
        >
          <CardImg card={card} width={52} delay={i * 0.12} />
        </motion.div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// POT DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

function PotDisplay({ potTotal, pots = [] }) {
  if (!potTotal || potTotal <= 0) return null;

  // Generate chip stack visualization based on pot size
  const chipColors = ['#e53935', '#1e88e5', '#43a047', '#000000', '#9c27b0'];
  const chipCount = Math.min(Math.ceil(potTotal / 100), 8);

  return (
    <div
      style={{
        position: 'absolute',
        top: '28%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        zIndex: 15,
      }}
    >
      {/* Animated chip stack */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
        {Array.from({ length: Math.min(chipCount, 5) }).map((_, i) => (
          <motion.div
            key={`chip-${i}`}
            initial={{ y: -20, opacity: 0, scale: 0.5 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 300 }}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: `radial-gradient(circle at 40% 35%, ${chipColors[i % chipColors.length]}dd, ${chipColors[i % chipColors.length]})`,
              border: '1.5px solid rgba(255,255,255,0.4)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          />
        ))}
      </div>

      <motion.div
        key={potTotal}
        initial={{ scale: 0.8, y: 5 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200 }}
        style={{
          background: 'rgba(0,0,0,0.7)',
          border: `1px solid ${T.accentDim}`,
          borderRadius: 16,
          padding: '4px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 14, color: T.accent }}>🏆</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: T.accent, fontVariantNumeric: 'tabular-nums' }}>
          {potTotal.toLocaleString()}
        </span>
      </motion.div>

      {pots.length > 1 && (
        <div style={{ display: 'flex', gap: 6 }}>
          {pots.map((pot, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: i % 2 === 0 ? -10 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              style={{
                background: 'rgba(0,0,0,0.5)',
                color: T.textSecondary,
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {i === 0 ? 'Main' : `Side ${i}`}: {(pot.amount || 0).toLocaleString()}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION PANEL — Fold / Check / Call / Bet / Raise / All-In
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// PINEAPPLE DISCARD PANEL
// ═══════════════════════════════════════════════════════
function DiscardPanel({ cards, onDiscard }) {
  const [selected, setSelected] = useState(null);

  if (!cards || cards.length !== 3) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.7))',
        padding: '16px 20px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        zIndex: 200,
      }}
    >
      <span style={{ color: '#FFD700', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>
        🍍 DISCARD ONE CARD
      </span>
      <div style={{ display: 'flex', gap: 12 }}>
        {cards.map((card, i) => (
          <div
            key={i}
            onClick={() => setSelected(i)}
            style={{
              cursor: 'pointer',
              transform: selected === i ? 'translateY(-12px) scale(1.08)' : 'none',
              border: selected === i ? '3px solid #FA383E' : '3px solid transparent',
              borderRadius: 8,
              transition: 'all 0.15s',
              opacity: selected !== null && selected !== i ? 0.5 : 1,
            }}
          >
            <CardImg card={card} width={64} />
          </div>
        ))}
      </div>
      <button
        onClick={() => { if (selected !== null) onDiscard(selected); }}
        disabled={selected === null}
        style={{
          padding: '10px 32px',
          background: selected !== null ? '#FA383E' : '#3E4042',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 14,
          cursor: selected !== null ? 'pointer' : 'default',
          opacity: selected !== null ? 1 : 0.4,
          transition: 'all 0.2s',
        }}
      >
        Discard{selected !== null ? ` Card ${selected + 1}` : ''}
      </button>
    </motion.div>
  );
}

function ActionPanel({ actions, onAction, stack, currentBet, bigBlind, potTotal = 0 }) {
  const [betAmount, setBetAmount] = useState(0);
  const [showSlider, setShowSlider] = useState(false);

  // Parse legal actions
  const canFold = actions?.find(a => a.type === 'fold');
  const canCheck = actions?.find(a => a.type === 'check');
  const canCall = actions?.find(a => a.type === 'call');
  const canRaise = actions?.find(a => a.type === 'raise');
  const canBet = actions?.find(a => a.type === 'bet');
  const canAllIn = actions?.find(a => a.type === 'all_in');
  const betOrRaise = canRaise || canBet;
  const minBet = betOrRaise?.minAmount || betOrRaise?.amount || bigBlind || 2;
  const maxBet = betOrRaise?.maxAmount || stack || 0;

  // Reset bet when actions change
  useEffect(() => {
    setBetAmount(minBet);
    setShowSlider(false);
  }, [actions, minBet]);

  if (!actions || actions.length === 0) return null;

  const presets = betOrRaise ? [
    { label: '⅓', amount: Math.max(minBet, Math.floor((potTotal || bigBlind * 2) * 0.33)) },
    { label: '½', amount: Math.max(minBet, Math.floor((potTotal || bigBlind * 2) * 0.5)) },
    { label: '⅔', amount: Math.max(minBet, Math.floor((potTotal || bigBlind * 2) * 0.67)) },
    { label: 'Pot', amount: Math.max(minBet, potTotal || bigBlind * 2) },
    { label: '2×', amount: Math.max(minBet, (potTotal || bigBlind * 2) * 2) },
  ].filter(p => p.amount <= maxBet) : [];

  const callAmount = canCall?.amount || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      style={{
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        zIndex: 30,
      }}
    >
      {/* Pot Odds HUD — appears when facing a bet/call */}
      <AnimatePresence>
        {canCall && <PotOddsHUD callAmount={callAmount} potTotal={potTotal} visible={true} />}
      </AnimatePresence>
      {/* Bet slider + presets */}
      <AnimatePresence>
        {showSlider && betOrRaise && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(0,0,0,0.85)',
              borderRadius: 12,
              padding: '10px 16px',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {/* Amount display */}
            <div style={{ fontSize: 22, fontWeight: 800, color: T.accent, fontVariantNumeric: 'tabular-nums' }}>
              {betAmount.toLocaleString()}
            </div>

            {/* Slider */}
            <input
              type="range"
              min={minBet}
              max={maxBet}
              value={betAmount}
              onChange={(e) => setBetAmount(parseInt(e.target.value))}
              style={{
                width: 220,
                accentColor: T.accent,
                cursor: 'pointer',
              }}
            />

            {/* Presets */}
            <div style={{ display: 'flex', gap: 6 }}>
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setBetAmount(p.amount)}
                  style={{
                    background: 'rgba(255,215,0,0.1)',
                    color: T.accent,
                    border: `1px solid ${T.accentDim}`,
                    borderRadius: 6,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => setBetAmount(maxBet)}
                style={{
                  background: 'rgba(147,51,234,0.2)',
                  color: '#c084fc',
                  border: '1px solid #7c3aed',
                  borderRadius: 6,
                  padding: '3px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All-In
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {canFold && (
          <ActionButton
            label="Fold"
            color={T.foldRed}
            onClick={() => onAction({ type: 'fold' })}
          />
        )}

        {canCheck && (
          <ActionButton
            label="Check"
            color={T.checkBlue}
            onClick={() => onAction({ type: 'check' })}
          />
        )}

        {canCall && (() => {
          const callAmt = canCall.amount || 0;
          const potOdds = callAmt > 0 ? ((callAmt / (potTotal + callAmt)) * 100).toFixed(0) : 0;
          return (
            <ActionButton
              label={`Call ${callAmt.toLocaleString()}`}
              sublabel={potTotal > 0 ? `${potOdds}% pot odds` : null}
              color={T.callGreen}
              onClick={() => onAction({ type: 'call' })}
            />
          );
        })()}

        {betOrRaise && (
          <ActionButton
            label={showSlider ? `${canRaise ? 'Raise' : 'Bet'} ${betAmount.toLocaleString()}` : (canRaise ? 'Raise' : 'Bet')}
            color={canRaise ? T.raiseYellow : T.betOrange}
            onClick={() => {
              if (showSlider) {
                onAction({ type: canRaise ? 'raise' : 'bet', amount: betAmount });
              } else {
                setShowSlider(true);
              }
            }}
          />
        )}

        {canAllIn && !betOrRaise && (
          <ActionButton
            label={`All-In ${stack.toLocaleString()}`}
            color={T.allInPurple}
            onClick={() => onAction({ type: 'all_in' })}
          />
        )}
      </div>
    </motion.div>
  );
}

function ActionButton({ label, sublabel, color, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      style={{
        background: `linear-gradient(180deg, ${color}, ${color}CC)`,
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: sublabel ? '6px 16px 4px' : '10px 16px',
        fontSize: 14,
        fontWeight: 800,
        cursor: 'pointer',
        minWidth: 72,
        boxShadow: `0 3px 12px ${color}66`,
        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
      }}
    >
      <span>{label}</span>
      {sublabel && <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.75, marginTop: -1 }}>{sublabel}</span>}
    </motion.button>
  );
}

/**
 * PreActionBar — Checkboxes for pre-selecting actions before your turn
 * Shows when you're seated, not your turn, and a hand is in progress
 */
function PreActionBar({ preAction, setPreAction }) {
  const options = [
    { value: 'fold', label: 'Fold', color: '#ef5350' },
    { value: 'check_fold', label: 'Check/Fold', color: '#ff9800' },
    { value: 'check', label: 'Check', color: '#42a5f5' },
    { value: 'call_any', label: 'Call Any', color: '#66bb6a' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      style={{
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 6,
        zIndex: 30,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        borderRadius: 10,
        padding: '6px 12px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {options.map(opt => {
        const active = preAction === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setPreAction(active ? null : opt.value)}
            style={{
              background: active ? `${opt.color}33` : 'transparent',
              border: `1px solid ${active ? opt.color : 'rgba(255,255,255,0.15)'}`,
              borderRadius: 8,
              padding: '6px 14px',
              color: active ? opt.color : '#b0b3b8',
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s',
            }}
          >
            <span style={{
              width: 14, height: 14, borderRadius: 3, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${active ? opt.color : 'rgba(255,255,255,0.3)'}`,
              background: active ? opt.color : 'transparent',
              fontSize: 10, color: '#fff', fontWeight: 900,
            }}>
              {active ? '✓' : ''}
            </span>
            {opt.label}
          </button>
        );
      })}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BUY-IN DIALOG
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN TABLE PANEL — In-game controls for admin/owner/manager
// ═══════════════════════════════════════════════════════════════════════════

function AdminTablePanel({ tableId, clubId, tableState, seats, userId, userRole, send, onClose, supabase: sb }) {
  const [loading, setLoading] = useState(null); // action name
  const [message, setMessage] = useState(null);

  const apiCall = async (endpoint, body) => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      return await res.json();
    } catch (e) { return { error: e.message }; }
  };

  const doAction = async (action, extra = {}) => {
    setLoading(action); setMessage(null);
    const r = await apiCall('/api/club-arena/manage-table', {
      tableId, clubId, userId, action, ...extra,
    });
    setLoading(null);
    if (r.error) setMessage({ type: 'error', text: r.error });
    else setMessage({ type: 'success', text: `${action} successful` });
    setTimeout(() => setMessage(null), 3000);
  };

  const doKick = async (targetPlayerId, displayName) => {
    if (!confirm(`Kick ${displayName}?`)) return;
    send('kick_player', { targetPlayerId, role: userRole, reason: 'admin_kick' });
    setMessage({ type: 'success', text: `${displayName} kicked` });
    setTimeout(() => setMessage(null), 3000);
  };

  const isPaused = tableState?.status === 'paused';
  const seatedPlayers = seats?.filter(s => s.player && s.status !== 'empty') || [];

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 280,
        background: 'rgba(24,25,26,0.97)', borderLeft: '1px solid #3E4042',
        zIndex: 300, display: 'flex', flexDirection: 'column',
        backdropFilter: 'blur(12px)', overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #3E4042' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#E4E6EB' }}>⚙️ Admin Controls</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#B0B3B8', fontSize: 20, cursor: 'pointer' }}>✕</button>
      </div>

      {/* Status */}
      {message && (
        <div style={{ padding: '8px 16px', background: message.type === 'error' ? 'rgba(244,67,54,0.15)' : 'rgba(76,175,80,0.15)', color: message.type === 'error' ? '#ef5350' : '#66bb6a', fontSize: 12, fontWeight: 600 }}>
          {message.text}
        </div>
      )}

      {/* Table Actions */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 11, color: '#B0B3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Table Actions</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <AdminBtn label={isPaused ? '▶️ Resume Table' : '⏸️ Pause Table'} onClick={() => doAction(isPaused ? 'resume' : 'pause')} loading={loading === 'pause' || loading === 'resume'} />
          <AdminBtn label="🛑 Close Table" onClick={() => { if (confirm('Close this table? All players will be cashed out.')) doAction('close'); }} color="#FA383E" loading={loading === 'close'} />
        </div>
      </div>

      {/* Seated Players — Kick */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #3E4042' }}>
        <div style={{ fontSize: 11, color: '#B0B3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Players ({seatedPlayers.length})</div>
        {seatedPlayers.length === 0 ? (
          <div style={{ color: '#666', fontSize: 12 }}>No players seated</div>
        ) : seatedPlayers.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2a2b2c' }}>
            <div>
              <div style={{ color: '#E4E6EB', fontSize: 13, fontWeight: 600 }}>{s.player?.displayName || `Seat ${s.seatIndex + 1}`}</div>
              <div style={{ color: '#B0B3B8', fontSize: 11 }}>Stack: {(s.stack || 0).toLocaleString()}</div>
            </div>
            {String(s.player?.id) !== String(userId) && (
              <button onClick={() => doKick(s.player.id, s.player.displayName || 'Player')}
                style={{ background: 'rgba(244,67,54,0.15)', color: '#ef5350', border: '1px solid rgba(244,67,54,0.3)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                Kick
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Quick Settings */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #3E4042' }}>
        <div style={{ fontSize: 11, color: '#B0B3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Info</div>
        <div style={{ fontSize: 12, color: '#B0B3B8' }}>
          <div>Variant: {tableState?.config?.variant?.toUpperCase() || 'NLH'}</div>
          <div>Stakes: {tableState?.config?.smallBlind}/{tableState?.config?.bigBlind}</div>
          <div>Hands: {tableState?.handCount || 0}</div>
          <div>Status: {tableState?.status || 'unknown'}</div>
        </div>
      </div>
    </motion.div>
  );
}

function AdminBtn({ label, onClick, color = '#2374E1', loading = false }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{
        background: loading ? '#333' : `${color}22`, color: loading ? '#666' : color,
        border: `1px solid ${color}44`, borderRadius: 8, padding: '8px 12px',
        fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.15s',
      }}>
      {loading ? '...' : label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVER / WAITLIST BAR — Shows when player is NOT seated
// ═══════════════════════════════════════════════════════════════════════════

function ObserverBar({ tableState, userId, send, onClickSeat, seatOffer }) {
  const seats = tableState?.seats || [];
  const waitlist = tableState?.waitlist || [];
  const emptySeats = seats.filter(s => s.status === 'empty');
  const isOnWaitlist = waitlist.some(w => String(w.playerId) === String(userId));
  const myWaitPos = waitlist.findIndex(w => String(w.playerId) === String(userId));
  const tableFull = emptySeats.length === 0 && !seatOffer;

  // Countdown for seat offer
  const [offerSecs, setOfferSecs] = useState(0);
  useEffect(() => {
    if (!seatOffer) { setOfferSecs(0); return; }
    const total = Math.round((seatOffer.timeout || 30000) / 1000);
    const elapsed = Math.round((Date.now() - seatOffer.offeredAt) / 1000);
    setOfferSecs(Math.max(0, total - elapsed));
    const iv = setInterval(() => setOfferSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(iv);
  }, [seatOffer]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 120,
        background: 'linear-gradient(180deg, rgba(24,25,26,0.0) 0%, rgba(24,25,26,0.95) 30%)',
        padding: '32px 16px 16px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 8,
      }}
    >
      {/* Observer badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20, padding: '4px 16px',
      }}>
        <span style={{ fontSize: 14 }}>👁️</span>
        <span style={{ color: '#B0B3B8', fontSize: 12, fontWeight: 600 }}>Watching</span>
        {tableState?.game?.phase && tableState.game.phase !== 'idle' && (
          <span style={{ color: '#4ECDC4', fontSize: 11, fontWeight: 700 }}>LIVE</span>
        )}
      </div>

      {/* Seat offer (urgent) */}
      {seatOffer && offerSecs > 0 && (
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          style={{
            background: 'linear-gradient(135deg, rgba(76,175,80,0.2), rgba(76,175,80,0.1))',
            border: '2px solid #4caf50', borderRadius: 12,
            padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>🎉 Seat Available!</div>
            <div style={{ color: '#81C784', fontSize: 12 }}>Seat #{seatOffer.seatIndex + 1} reserved for you</div>
          </div>
          <div style={{
            fontSize: 22, fontWeight: 900, color: offerSecs < 10 ? '#FF6B6B' : '#4caf50',
            fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'center',
          }}>{offerSecs}s</div>
          <button
            onClick={() => onClickSeat(seatOffer.seatIndex)}
            style={{
              background: 'linear-gradient(135deg, #31A24C, #268a3e)',
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 20px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 3px 12px rgba(49,162,76,0.5)',
              animation: 'pulse 1s infinite',
            }}
          >Take Seat</button>
        </motion.div>
      )}

      {/* Waitlist status OR sit prompt */}
      {isOnWaitlist ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.4)',
            borderRadius: 10, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#2374E1' }}>#{myWaitPos + 1}</span>
            <div>
              <div style={{ color: '#E4E6EB', fontSize: 13, fontWeight: 700 }}>On Waitlist</div>
              <div style={{ color: '#B0B3B8', fontSize: 11 }}>
                {myWaitPos === 0 ? "You're next!" : `${myWaitPos} ahead of you`}
              </div>
            </div>
          </div>
          <button
            onClick={() => send('leave_waitlist', {})}
            style={{
              background: 'rgba(244,67,54,0.15)', color: '#ef5350',
              border: '1px solid rgba(244,67,54,0.3)', borderRadius: 8,
              padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >Leave</button>
        </div>
      ) : tableFull ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ color: '#B0B3B8', fontSize: 13 }}>
            Table full ({seats.filter(s => s.player).length}/{seats.length})
          </div>
          <button
            onClick={() => send('join_waitlist', {})}
            style={{
              background: 'linear-gradient(135deg, #2374E1, #1a5cbf)',
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 3px 12px rgba(35,116,225,0.4)',
            }}
          >
            Join Waitlist {waitlist.length > 0 ? `(${waitlist.length} waiting)` : ''}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ color: '#81C784', fontSize: 13 }}>
            {emptySeats.length} seat{emptySeats.length !== 1 ? 's' : ''} available
          </div>
          <button
            onClick={() => {
              // Click first empty seat
              const firstEmpty = seats.findIndex(s => s.status === 'empty');
              if (firstEmpty >= 0) onClickSeat(firstEmpty);
            }}
            style={{
              background: 'linear-gradient(135deg, #31A24C, #268a3e)',
              color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 3px 12px rgba(49,162,76,0.4)',
            }}
          >
            Sit Down
          </button>
        </div>
      )}

      {/* Waitlist count (when not on it) */}
      {!isOnWaitlist && waitlist.length > 0 && (
        <div style={{ color: '#B0B3B8', fontSize: 11 }}>
          {waitlist.length} player{waitlist.length !== 1 ? 's' : ''} on waitlist
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REBUY MODAL — Cash game "Add Chips" with balance check (chip locking handled by seat.js)
// ═══════════════════════════════════════════════════════════════════════════

function RebuyModal({ currentStack, maxBuyIn, chipBalance, loading, error, onConfirm, onCancel }) {
  const maxAdd = Math.max(0, Math.min(maxBuyIn - currentStack, chipBalance ?? 0));
  const minAdd = 1;
  const [amount, setAmount] = useState(maxAdd);
  const insufficient = (chipBalance ?? 0) < minAdd;

  const quickOptions = [
    { label: 'Top Up', value: maxAdd },
    { label: 'Half', value: Math.floor(maxAdd / 2) },
    { label: 'Min', value: minAdd },
  ].filter(o => o.value > 0);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        style={{
          background: '#1C1E21', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14, padding: 24, width: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: '#E4E6EB', marginBottom: 4 }}>💰 Add Chips</div>
        <div style={{ fontSize: 12, color: '#B0B3B8', marginBottom: 16 }}>Top up your stack at the table</div>

        {/* Balance info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 12 }}>
          <div>
            <div style={{ color: '#B0B3B8' }}>Current Stack</div>
            <div style={{ color: '#fff', fontWeight: 700 }}>{currentStack.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#B0B3B8' }}>Available Balance</div>
            <div style={{ color: loading ? '#666' : (chipBalance ?? 0) < minAdd ? '#ef5350' : '#4caf50', fontWeight: 700 }}>
              {loading ? '…' : (chipBalance ?? 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Max add-on info */}
        {!loading && maxAdd > 0 && (
          <div style={{ fontSize: 11, color: '#B0B3B8', marginBottom: 12 }}>
            Max add: <strong style={{ color: '#fff' }}>{maxAdd.toLocaleString()}</strong>
            <span style={{ color: '#666' }}> (table max: {maxBuyIn.toLocaleString()})</span>
          </div>
        )}

        {insufficient ? (
          <div style={{ color: '#ef5350', fontSize: 13, fontWeight: 600, padding: '10px 0' }}>
            Insufficient chip balance to add chips.
          </div>
        ) : maxAdd <= 0 && !loading ? (
          <div style={{ color: '#f59e0b', fontSize: 13, fontWeight: 600, padding: '10px 0' }}>
            Stack is already at maximum buy-in ({maxBuyIn.toLocaleString()}).
          </div>
        ) : !loading && (
          <>
            {/* Quick select */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {quickOptions.map(o => (
                <button key={o.label} onClick={() => setAmount(o.value)} style={{
                  flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 700,
                  background: amount === o.value ? 'rgba(35,116,225,0.3)' : 'rgba(255,255,255,0.05)',
                  color: amount === o.value ? '#4FC3F7' : '#B0B3B8',
                  border: `1px solid ${amount === o.value ? 'rgba(35,116,225,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6, cursor: 'pointer',
                }}>
                  {o.label}<br />
                  <span style={{ fontSize: 10, opacity: 0.8 }}>{o.value.toLocaleString()}</span>
                </button>
              ))}
            </div>

            {/* Input */}
            <input
              type="number" min={minAdd} max={maxAdd} value={amount}
              onChange={e => setAmount(Math.min(maxAdd, Math.max(minAdd, parseInt(e.target.value) || 0)))}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 14,
                background: 'rgba(255,255,255,0.05)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.15)', outline: 'none',
                boxSizing: 'border-box', marginBottom: 12,
              }}
            />
          </>
        )}

        {error && <div style={{ color: '#ef5350', fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: 'rgba(255,255,255,0.05)', color: '#B0B3B8',
            border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
          }}>Cancel</button>
          {!insufficient && maxAdd > 0 && !loading && (
            <button onClick={() => onConfirm(amount)} disabled={amount < minAdd || amount > maxAdd} style={{
              flex: 2, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: 'rgba(35,116,225,0.8)', color: '#fff',
              border: 'none', cursor: 'pointer', opacity: (amount < minAdd || amount > maxAdd) ? 0.5 : 1,
            }}>Add {amount.toLocaleString()} Chips</button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BUY-IN DIALOG
// ═══════════════════════════════════════════════════════════════════════════

function BuyInDialog({ minBuyIn, maxBuyIn, bigBlind, chipBalance, isClubTable, onConfirm, onCancel }) {
  const effectiveMax = maxBuyIn < minBuyIn ? minBuyIn : maxBuyIn;
  const [amount, setAmount] = useState(Math.floor((minBuyIn + effectiveMax) / 2));
  const insufficientChips = isClubTable && chipBalance !== null && chipBalance < minBuyIn;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bgPanel,
          borderRadius: 16,
          padding: 32,
          border: `1px solid ${T.accentDim}`,
          maxWidth: 360,
          width: '90%',
          textAlign: 'center',
        }}
      >
        <h3 style={{ color: T.accent, fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          Take a Seat
        </h3>
        <p style={{ color: T.textSecondary, fontSize: 13, marginBottom: isClubTable ? 4 : 20 }}>
          Buy-in: {minBuyIn.toLocaleString()} – {effectiveMax.toLocaleString()} chips
        </p>
        {isClubTable && chipBalance !== null && (
          <p style={{ color: insufficientChips ? '#FA383E' : '#31A24C', fontSize: 12, marginBottom: 16 }}>
            {insufficientChips
              ? `Insufficient chips (${chipBalance.toLocaleString()} available, need ${minBuyIn.toLocaleString()})`
              : `Balance: ${chipBalance.toLocaleString()} chips`
            }
          </p>
        )}

        <div style={{ fontSize: 28, fontWeight: 800, color: T.textPrimary, marginBottom: 12, fontVariantNumeric: 'tabular-nums' }}>
          {amount.toLocaleString()}
        </div>

        <input
          type="range"
          min={minBuyIn}
          max={effectiveMax}
          step={bigBlind}
          value={Math.min(amount, effectiveMax)}
          onChange={(e) => setAmount(parseInt(e.target.value))}
          style={{ width: '100%', accentColor: T.accent, marginBottom: 20 }}
        />

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          {[minBuyIn, Math.floor((minBuyIn + effectiveMax) / 2), effectiveMax].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              style={{
                background: amount === v ? T.accent : 'rgba(255,255,255,0.05)',
                color: amount === v ? T.bgDark : T.textSecondary,
                border: `1px solid ${amount === v ? T.accent : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 8,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {v === minBuyIn ? 'Min' : v === effectiveMax ? 'Max' : 'Mid'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              background: 'transparent',
              color: T.textSecondary,
              border: `1px solid rgba(255,255,255,0.1)`,
              borderRadius: 10,
              padding: '10px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => !insufficientChips && onConfirm(Math.min(amount, effectiveMax))}
            disabled={insufficientChips}
            style={{
              flex: 1,
              background: insufficientChips
                ? 'rgba(255,255,255,0.1)'
                : `linear-gradient(135deg, ${T.callGreen}, #15803d)`,
              color: insufficientChips ? T.textSecondary : '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '10px',
              fontSize: 14,
              fontWeight: 800,
              cursor: insufficientChips ? 'not-allowed' : 'pointer',
              boxShadow: insufficientChips ? 'none' : `0 4px 15px ${T.callGreen}40`,
              opacity: insufficientChips ? 0.5 : 1,
            }}
          >
            {insufficientChips ? 'Need More Chips' : 'Sit Down'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAT OVERLAY
// ═══════════════════════════════════════════════════════════════════════════

function ChatOverlay({ messages, onSend }) {
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const listRef = useRef(null);

  const QUICK_EMOJIS = ['😀', '😂', '😎', '🤔', '👍', '👎', '🔥', '❤️', '💀', '🃏', '♠️', '♦️', '♣️', '♥️', '🏆', '💰', '🤑', '😱', '🤷', 'GG'];

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: 10,
        width: 240,
        zIndex: 25,
      }}
    >
      {/* Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'rgba(0,0,0,0.6)',
          color: T.textSecondary,
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 11,
          cursor: 'pointer',
          marginBottom: 4,
        }}
      >
        💬 {expanded ? 'Hide' : 'Chat'}
        {!expanded && messages.length > 0 && (
          <span style={{ color: T.accent, marginLeft: 4 }}>{messages.length}</span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 180 }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              background: 'rgba(0,0,0,0.75)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              backdropFilter: 'blur(10px)',
            }}
          >
            <div
              ref={listRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 8,
                fontSize: 11,
              }}
            >
              {messages.map((m, i) => (
                <div key={i} style={{ marginBottom: 3 }}>
                  {m.type === 'dealer' ? (
                    <span style={{ color: '#F5A623', fontWeight: 600, fontSize: 10, fontStyle: 'italic' }}>🂠 {m.text}</span>
                  ) : m.type === 'emoji' ? (
                    <span style={{ color: T.textSecondary, fontSize: 10 }}>{m.senderName || 'Player'} threw {m.emoji}</span>
                  ) : (
                    <>
                      <span style={{ color: T.accent, fontWeight: 700 }}>{m.displayName}: </span>
                      <span style={{ color: T.textPrimary }}>{m.message}</span>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && text.trim()) {
                    onSend(text.trim());
                    setText('');
                  }
                }}
                placeholder="Type..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  color: T.textPrimary,
                  border: 'none',
                  padding: '6px 8px',
                  fontSize: 11,
                  outline: 'none',
                }}
              />
              <button
                onClick={() => setShowEmoji(!showEmoji)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, padding: '4px 6px', opacity: showEmoji ? 1 : 0.5,
                }}
              >😀</button>
            </div>

            {/* Emoji quick picker */}
            <AnimatePresence>
              {showEmoji && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{
                    display: 'flex', flexWrap: 'wrap', gap: 2, padding: '4px 6px',
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(0,0,0,0.3)',
                  }}
                >
                  {QUICK_EMOJIS.map((em) => (
                    <button
                      key={em}
                      onClick={() => { onSend(em); setShowEmoji(false); }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: em.length > 2 ? 9 : 14, padding: '2px 3px',
                        borderRadius: 4, color: em.length > 2 ? '#FFD700' : undefined,
                        fontWeight: em.length > 2 ? 800 : undefined,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >{em}</button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE INFO BAR
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TOURNAMENT HUD — Blind clock, level, players, prize pool
// ═══════════════════════════════════════════════════════════════════════════

function TournamentHUD({ tournamentId, userId }) {
  const [state, setState] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [breakCountdown, setBreakCountdown] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [prevRemaining, setPrevRemaining] = useState(null);
  const [elimFlash, setElimFlash] = useState(false);

  // [HARDENING: PRO PHASE 10] Master Audit Trail for Mystery Bounties
  const [remainingEnvelopes, setRemainingEnvelopes] = useState(null);

  // Listen to the EventBus for mystery bounty announcements
  useEffect(() => {
    if (!eventBus) return;
    const handleReveal = (e) => {
      // The reveal payload includes { amount, label, remainingEnvelopes }
      if (e.payload?.remainingEnvelopes) {
        setRemainingEnvelopes(e.payload.remainingEnvelopes);
      }
    };
    const unsub = eventBus.on(EventType.MYSTERY_BOUNTY_REVEALED, handleReveal);
    return () => unsub();
  }, []);

  // Poll tournament state every 5s
  useEffect(() => {
    if (!tournamentId) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/poker/engine/tournament', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'state', tournamentId }),
        });
        const d = await res.json();
        if (d.success && active) {
          // Detect eliminations since last poll
          if (prevRemaining !== null && d.playersRemaining < prevRemaining) {
            setElimFlash(true);
            setTimeout(() => setElimFlash(false), 2000);
          }
          setPrevRemaining(d.playersRemaining);
          setState(d);
          if (d.status === 'break' && d.breakTimeRemaining > 0) {
            setBreakCountdown(d.breakTimeRemaining);
            setCountdown(0);
          } else if (d.levelTimeRemaining > 0) {
            setCountdown(d.levelTimeRemaining);
            setBreakCountdown(0);
          }
        }
      } catch (_) { }
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => { active = false; clearInterval(iv); };
  }, [tournamentId]);

  // Level countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const iv = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(iv);
  }, [countdown > 0]);

  // Break countdown
  useEffect(() => {
    if (breakCountdown <= 0) return;
    const iv = setInterval(() => setBreakCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(iv);
  }, [breakCountdown > 0]);

  if (!state) return null;

  const isBreak = state.status === 'break';
  const fmtTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const activeCountdown = isBreak ? breakCountdown : countdown;
  const isLow = !isBreak && activeCountdown > 0 && activeCountdown < 60;
  const blinds = state.blinds || {};

  // ITM — in the money
  const paidPlaces = state.paidPlaces || 0;
  const remaining = state.playersRemaining || 0;
  const isITM = paidPlaces > 0 && remaining <= paidPlaces;
  const bubblePlayer = paidPlaces > 0 && remaining === paidPlaces + 1;

  return (
    <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 200 }}>
      {/* ── [HARDENING: PRO PHASE 10] THE BOUNTY BOARD ── */}
      {/* Displays glowing envelope summary alongside the blind structure */}
      <AnimatePresence>
        {remainingEnvelopes && remainingEnvelopes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: 'absolute', right: '105%', top: 0,
              background: 'linear-gradient(135deg, rgba(20,20,20,0.95), rgba(40,30,0,0.95))',
              border: '1px solid #FFD700', borderRadius: 10, padding: '8px 12px',
              minWidth: 160, backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 20px rgba(255,215,0,0.2)',
            }}
          >
            <div style={{ color: '#FFD700', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 1, borderBottom: '1px solid rgba(255,215,0,0.4)', paddingBottom: 4 }}>
              Mystery Bounties Left
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {remainingEnvelopes.map((env, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#E4E6EB', fontSize: 12, fontWeight: 700 }}>{env.label}</span>
                  <span style={{
                    background: env.exampleAmount >= 1000 ? '#FFD700' : 'rgba(255,255,255,0.1)',
                    color: env.exampleAmount >= 1000 ? '#000' : '#fff',
                    padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 900
                  }}>
                    {env.count}x
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          background: isITM ? 'rgba(20,40,20,0.97)' : 'rgba(24,25,26,0.95)',
          border: `1px solid ${isITM ? 'rgba(76,175,80,0.5)' : bubblePlayer ? 'rgba(251,191,36,0.6)' : 'rgba(255,215,0,0.3)'}`,
          borderRadius: 10, padding: '6px 14px', cursor: 'pointer',
          backdropFilter: 'blur(10px)', boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 10, minWidth: 220,
        }}
      >
        {isBreak ? (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#4ECDC4', textTransform: 'uppercase' }}>☕ BREAK</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
              Next: {state.nextBlinds ? `${state.nextBlinds.smallBlind}/${state.nextBlinds.bigBlind}` : '—'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#4ECDC4', marginLeft: 'auto' }}>
              {breakCountdown > 0 ? fmtTime(breakCountdown) : '--:--'}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: isITM ? '#4caf50' : '#FFD700', textTransform: 'uppercase' }}>
              {isITM ? '💰 ITM' : `🏆 LVL ${state.currentLevel}`}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{blinds.smallBlind || '?'}/{blinds.bigBlind || '?'}</div>
            {blinds.ante > 0 && <div style={{ fontSize: 11, color: '#B0B3B8' }}>A:{blinds.ante}</div>}
            <div style={{
              fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginLeft: 'auto',
              color: isLow ? '#FF6B6B' : countdown > 0 ? '#4ECDC4' : '#666',
            }}>
              {countdown > 0 ? fmtTime(countdown) : '--:--'}
            </div>
          </>
        )}
        {/* Elimination flash */}
        {elimFlash && (
          <div style={{ fontSize: 10, fontWeight: 800, color: '#ef5350', animation: 'pulse 0.5s ease-in-out' }}>
            💀 OUT
          </div>
        )}
      </div>

      {/* Bubble warning banner */}
      {bubblePlayer && (
        <div style={{
          marginTop: 4, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800,
          background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.5)',
          color: '#fbbf24', textAlign: 'center',
        }}>
          ⚠️ BUBBLE — {remaining} players left, {paidPlaces} paid
        </div>
      )}

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            style={{
              background: 'rgba(24,25,26,0.97)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '12px 14px', overflow: 'hidden',
              backdropFilter: 'blur(10px)', minWidth: 220,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
              <div>
                <span style={{ color: '#B0B3B8' }}>Players: </span>
                <strong style={{ color: elimFlash ? '#ef5350' : '#fff' }}>
                  {state.playersRemaining}/{state.totalEntries}
                </strong>
              </div>
              <div><span style={{ color: '#B0B3B8' }}>Avg Stack: </span><strong style={{ color: '#fff' }}>{(state.averageStack || 0).toLocaleString()}</strong></div>
              <div><span style={{ color: '#B0B3B8' }}>Prize Pool: </span><strong style={{ color: '#FFD700' }}>{(state.prizePool || 0).toLocaleString()}</strong></div>
              <div><span style={{ color: '#B0B3B8' }}>Tables: </span><strong style={{ color: '#fff' }}>{state.tablesActive || 0}</strong></div>

              {/* ITM / paid places */}
              {paidPlaces > 0 && (
                <div style={{ gridColumn: '1/3' }}>
                  <span style={{ color: '#B0B3B8' }}>Paid: </span>
                  <strong style={{ color: isITM ? '#4caf50' : '#B0B3B8' }}>
                    Top {paidPlaces} {isITM ? '✅ You\'re in the money!' : `(${remaining - paidPlaces} eliminations to go)`}
                  </strong>
                </div>
              )}

              {/* Next blinds */}
              {state.nextBlinds && (
                <div style={{ gridColumn: '1/3' }}>
                  <span style={{ color: '#B0B3B8' }}>Next Level: </span>
                  <strong style={{ color: '#81C784' }}>
                    {state.nextBlinds.smallBlind}/{state.nextBlinds.bigBlind}
                    {state.nextBlinds.ante > 0 ? ` (A:${state.nextBlinds.ante})` : ''}
                  </strong>
                </div>
              )}

              {/* Blind schedule — next 3 levels */}
              {state.blindSchedule && state.blindSchedule.length > 0 && (
                <div style={{ gridColumn: '1/3', marginTop: 6 }}>
                  <div style={{ color: '#B0B3B8', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Upcoming Levels</div>
                  {state.blindSchedule.slice(0, 3).map((lvl, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', fontSize: 11,
                      padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                      color: i === 0 ? '#4ECDC4' : '#B0B3B8',
                    }}>
                      <span>Lvl {(state.currentLevel || 0) + i + 1}</span>
                      <span>{lvl.smallBlind}/{lvl.bigBlind}{lvl.ante > 0 ? ` A:${lvl.ante}` : ''}</span>
                      {lvl.duration && <span>{Math.floor(lvl.duration / 60)}m</span>}
                    </div>
                  ))}
                </div>
              )}

              {state.lateRegOpen && (
                <div style={{ gridColumn: '1/3', color: '#4ECDC4', fontWeight: 700 }}>
                  📝 Late Registration Open
                </div>
              )}
            </div>

            {/* Rebuy/Addon buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {state.rebuyEndLevel && state.currentLevel <= state.rebuyEndLevel && (
                <button onClick={async () => {
                  const res = await fetch('/api/poker/engine/tournament', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'rebuy', tournamentId }),
                  });
                  const d = await res.json();
                  if (!d.success) alert(d.error || 'Rebuy failed');
                }} style={{
                  flex: 1, padding: '6px 10px', background: 'rgba(35,116,225,0.2)', color: '#4FC3F7',
                  border: '1px solid rgba(35,116,225,0.4)', borderRadius: 6, fontSize: 11,
                  fontWeight: 700, cursor: 'pointer',
                }}>🔄 Rebuy</button>
              )}
              {state.addonAtBreak && state.status === 'break' && (
                <button onClick={async () => {
                  const res = await fetch('/api/poker/engine/tournament', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'addon', tournamentId }),
                  });
                  const d = await res.json();
                  if (!d.success) alert(d.error || 'Add-on failed');
                }} style={{
                  flex: 1, padding: '6px 10px', background: 'rgba(76,175,80,0.2)', color: '#81C784',
                  border: '1px solid rgba(76,175,80,0.4)', borderRadius: 6, fontSize: 11,
                  fontWeight: 700, cursor: 'pointer',
                }}>➕ Add-on</button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// SESSION STATS OVERLAY — expanded stats panel with VPIP/PFR/sparkline
// ═══════════════════════════════════════════════════════════════════════════

function SessionStatsOverlay({ sessionStats, myStack, onClose }) {
  if (!sessionStats || !sessionStats.initialBuyIn) return null;

  const pnl = myStack - sessionStats.initialBuyIn - (sessionStats.totalAdded || 0);
  const hrs = sessionStats.sessionStart ? ((Date.now() - sessionStats.sessionStart) / 3600000) : 0;
  const handsPerHour = hrs > 0 ? Math.round((sessionStats.handsPlayed || 0) / hrs) : 0;
  const vpip = sessionStats.handsPlayed > 0 ? ((sessionStats.vpipCount || 0) / sessionStats.handsPlayed * 100).toFixed(0) : '0';
  const pfr = sessionStats.handsPlayed > 0 ? ((sessionStats.pfrCount || 0) / sessionStats.handsPlayed * 100).toFixed(0) : '0';

  // Mini sparkline from P&L history
  const pnlHistory = sessionStats.pnlHistory || [];
  const sparklinePoints = pnlHistory.length > 1 ? (() => {
    const min = Math.min(...pnlHistory);
    const max = Math.max(...pnlHistory);
    const range = max - min || 1;
    const w = 120;
    const h = 28;
    return pnlHistory.map((v, i) => {
      const x = (i / (pnlHistory.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    }).join(' ');
  })() : null;

  const pnlColor = pnl > 0 ? '#4caf50' : pnl < 0 ? '#ef5350' : '#888';

  const StatBox = ({ label, value, color = '#E4E6EB' }) => (
    <div style={{ textAlign: 'center', minWidth: 55 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 8, fontWeight: 600, color: '#65676B', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      style={{
        position: 'absolute', top: 60, left: 8, right: 8,
        background: 'rgba(0,0,0,0.92)', borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '14px 16px', zIndex: 35,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#E4E6EB', fontSize: 13, fontWeight: 700 }}>📊 Session Stats</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#65676B', fontSize: 18,
          cursor: 'pointer', padding: '0 4px', lineHeight: 1,
        }}>×</button>
      </div>

      {/* Stat grid */}
      <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 12 }}>
        <StatBox label="P&L" value={`${pnl >= 0 ? '+' : ''}${pnl.toLocaleString()}`} color={pnlColor} />
        <StatBox label="Hands" value={sessionStats.handsPlayed || 0} />
        <StatBox label="VPIP" value={`${vpip}%`} color={parseInt(vpip) > 40 ? '#f59e0b' : '#4caf50'} />
        <StatBox label="PFR" value={`${pfr}%`} color={parseInt(pfr) > 30 ? '#f59e0b' : '#3b82f6'} />
        <StatBox label="H/Hr" value={handsPerHour} />
      </div>

      {/* Sparkline P&L over time */}
      {sparklinePoints && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: '#65676B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Session P&L Trend</div>
          <svg width="100%" height="32" viewBox="0 0 120 28" preserveAspectRatio="none" style={{ borderRadius: 4 }}>
            <rect width="120" height="28" fill="rgba(255,255,255,0.03)" rx="2" />
            {/* Zero line */}
            {pnlHistory.some(v => v >= 0) && pnlHistory.some(v => v < 0) && (
              <line x1="0" y1="14" x2="120" y2="14" stroke="rgba(255,255,255,0.1)" strokeDasharray="2,2" />
            )}
            <polyline
              points={sparklinePoints}
              fill="none"
              stroke={pnlColor}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}

      {/* Footer stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#65676B' }}>
        <span>Buy-in: {sessionStats.initialBuyIn?.toLocaleString()}{sessionStats.totalAdded > 0 ? ` +${sessionStats.totalAdded.toLocaleString()}` : ''}</span>
        <span>{hrs.toFixed(1)} hours</span>
        {sessionStats.biggestPot > 0 && <span>Max Pot: {sessionStats.biggestPot.toLocaleString()}</span>}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE INFO BAR
// ═══════════════════════════════════════════════════════════════════════════

function TableInfoBar({ tableState, onSitOut, onSitIn, onStandUp, onAddChips, isSitting, isSittingOut, straddleEnabled, straddleOn, onToggleStraddle, autoTopUpOn, onToggleAutoTopUp, autoMuckOn, onToggleAutoMuck, lastHandResult, onShowLastHand, sessionStats, myStack, sitOutNextBB, onToggleSitOutNextBB }) {
  const [showStats, setShowStats] = useState(false);
  const [autoRebuyOn, setAutoRebuyOn] = useState(false);
  if (!tableState) return null;

  const { game } = tableState;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        zIndex: 30,
      }}
    >
      {/* Row 1 — Table info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', flexWrap: 'wrap' }}>
        <span style={{ color: T.accent, fontWeight: 800, fontSize: 13, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tableState?.config?.tableName || tableState.tableId?.slice(0, 8)}
        </span>
        {/* Tournament badge */}
        {tableState?.config?.isTournament && (
          <span style={{
            color: '#fbbf24', fontSize: 10, fontWeight: 700,
            padding: '1px 6px', borderRadius: 4,
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.3)',
            maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {tableState.config.tournamentName || 'Tournament'}
          </span>
        )}
        <span style={{
          color: '#fff', fontSize: 10, fontWeight: 700,
          padding: '1px 6px', borderRadius: 4,
          background: ({
            holdem: '#22c55e', omaha4: '#f59e0b', omaha5: '#e67e22',
            omaha6: '#e74c3c', omaha_hilo: '#ef4444', short_deck: '#8b5cf6',
            pineapple: '#eab308', flo: '#14b8a6', mixed: '#f59e0b',
          })[tableState?.config?.variant] || '#22c55e',
        }}>
          {({
            holdem: 'NLH', omaha4: 'PLO4', omaha5: 'PLO5', omaha6: 'PLO6',
            omaha_hilo: 'PLO8', short_deck: '6+',
            pineapple: '🍍', flo: 'FLO', mixed: 'MIX',
          })[tableState?.config?.variant] || 'NLH'}
        </span>
        <span style={{ color: T.textSecondary, fontSize: 11, fontWeight: 600 }}>
          {tableState?.config?.smallBlind || 1}/{tableState?.config?.bigBlind || 2}
        </span>
        <span style={{ color: T.textMuted, fontSize: 10, fontFamily: 'monospace' }}>
          {game?.handNumber ? `#${game.handNumber}` : ''}
        </span>
        <span style={{
          color: game?.phase === 'idle' ? T.textMuted : T.callGreen,
          fontSize: 10, padding: '1px 5px', borderRadius: 4,
          background: 'rgba(255,255,255,0.05)',
        }}>
          {game?.phase?.toUpperCase() || 'WAITING'}
        </span>

        {/* Session P&L — inline on same row */}
        {isSitting && sessionStats?.initialBuyIn > 0 && (() => {
          const pnl = myStack - sessionStats.initialBuyIn - (sessionStats.totalAdded || 0);
          const color = pnl > 0 ? '#4caf50' : pnl < 0 ? '#ef5350' : T.textMuted;
          const hrs = sessionStats.sessionStart ? ((Date.now() - sessionStats.sessionStart) / 3600000).toFixed(1) : '0';
          return (
            <span style={{ color, fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', marginLeft: 'auto' }}>
              {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()} • {sessionStats.handsPlayed} hands • {hrs}hr
            </span>
          );
        })()}
      </div>

      {/* Row 2 — Action buttons (only when seated) */}
      {isSitting && (
        <div style={{ display: 'flex', gap: 5, padding: '3px 12px 6px', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <SmallButton
            label={isSittingOut ? 'Sit In' : 'Sit Out'}
            onClick={isSittingOut ? onSitIn : onSitOut}
          />
          {!isSittingOut && (
            <SmallButton
              label={sitOutNextBB ? '✓ Out@BB' : 'Out@BB'}
              onClick={onToggleSitOutNextBB}
              color={sitOutNextBB ? '#F5A623' : undefined}
            />
          )}
          {straddleEnabled && (
            <SmallButton
              label={straddleOn ? '✓ Straddle' : 'Straddle'}
              onClick={onToggleStraddle}
              color={straddleOn ? '#4ECDC4' : undefined}
            />
          )}
          <SmallButton label="Add Chips" onClick={onAddChips} />
          {lastHandResult && <SmallButton label="📋 Last Hand" onClick={onShowLastHand} />}
          <SmallButton
            label={autoTopUpOn ? '✓ Top Up' : 'Top Up'}
            onClick={onToggleAutoTopUp}
            color={autoTopUpOn ? '#34C759' : undefined}
          />
          <SmallButton
            label={autoMuckOn ? '✓ Muck' : 'Muck'}
            onClick={onToggleAutoMuck}
            color={autoMuckOn ? '#8b5cf6' : undefined}
          />
          <SmallButton
            label={autoRebuyOn ? '✓ Rebuy' : 'Rebuy'}
            onClick={() => setAutoRebuyOn(!autoRebuyOn)}
            color={autoRebuyOn ? '#f59e0b' : undefined}
          />
          {sessionStats?.initialBuyIn > 0 && (
            <SmallButton
              label={showStats ? '✓ Stats' : '📊'}
              onClick={() => setShowStats(!showStats)}
              color={showStats ? '#3b82f6' : undefined}
            />
          )}
          <SmallButton label="Leave" onClick={onStandUp} color={T.foldRed} />
        </div>
      )}

      {/* Session Stats Overlay — expandable panel */}
      <AnimatePresence>
        {showStats && isSitting && sessionStats && (
          <SessionStatsOverlay
            sessionStats={sessionStats}
            myStack={myStack}
            onClose={() => setShowStats(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SmallButton({ label, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: color ? `${color}20` : 'rgba(255,255,255,0.05)',
        color: color || T.textSecondary,
        border: `1px solid ${color ? `${color}40` : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 6,
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT OVERLAY (showdown / hand complete)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// RUN IT OFFER OVERLAY — Consent dialog for run-it-twice/thrice
// ═══════════════════════════════════════════════════════
function RunItOfferOverlay({ offer, userId, onRespond }) {
  const [responded, setResponded] = useState(false);
  const [countdown, setCountdown] = useState(offer?.deadline || 15);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  if (!offer || !offer.playerIds?.includes(userId)) return null;

  const handleChoice = (choice) => {
    if (responded) return;
    setResponded(true);
    onRespond(choice);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 900,
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        border: '2px solid #4ECDC4',
        borderRadius: 16,
        padding: '20px 28px',
        textAlign: 'center',
        minWidth: 280,
        boxShadow: '0 0 40px rgba(78,205,196,0.3)',
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 6 }}>🃏</div>
      <h3 style={{ color: '#E4E6EB', fontSize: 16, margin: '0 0 4px', fontWeight: 700 }}>
        Run It Multiple Times?
      </h3>
      <p style={{ color: '#B0B3B8', fontSize: 12, margin: '0 0 12px' }}>
        Both players must agree • {countdown}s
      </p>

      {!responded ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={() => handleChoice('twice')}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#4ECDC4', color: '#000', fontWeight: 700, fontSize: 13,
            }}
          >
            Run Twice
          </button>
          <button
            onClick={() => handleChoice('thrice')}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#FFD700', color: '#000', fontWeight: 700, fontSize: 13,
            }}
          >
            Run 3x
          </button>
          <button
            onClick={() => handleChoice('decline')}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #555', cursor: 'pointer',
              background: 'transparent', color: '#B0B3B8', fontWeight: 600, fontSize: 13,
            }}
          >
            No
          </button>
        </div>
      ) : (
        <p style={{ color: '#4ECDC4', fontSize: 13, fontWeight: 600 }}>
          ✓ Waiting for opponent...
        </p>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GTO SPOT-CHECK BADGE — Post-showdown play quality indicator
// ═══════════════════════════════════════════════════════════════════════════

function GTOCheckBadge({ result, heroAction, visible }) {
  const [showDetail, setShowDetail] = useState(false);

  if (!visible || !result || !heroAction) return null;

  // Heuristic GTO evaluation based on hero's action context
  const evaluate = () => {
    const { action, potOdds, handStrength, phase } = heroAction;

    // Simple heuristic: compare action vs. expected play
    if (!action) return { grade: 'neutral', label: '—', color: '#888', tip: 'No action recorded' };

    // Fold with strong hand = major deviation
    if (action === 'fold' && handStrength > 60) {
      return { grade: 'deviation', label: '❌ Major Deviation', color: '#ef5350', tip: 'Folded a strong hand. GTO suggests continuing with equity advantage.' };
    }
    // Call with weak hand and bad pot odds = leak
    if (action === 'call' && handStrength < 25 && potOdds > 30) {
      return { grade: 'leak', label: '⚠️ Slight Leak', color: '#f59e0b', tip: 'Called with insufficient equity. Required better pot odds or a stronger draw.' };
    }
    // Raise with premium = optimal
    if ((action === 'raise' || action === 'bet') && handStrength > 70) {
      return { grade: 'optimal', label: '✅ Optimal', color: '#4caf50', tip: 'Value bet with strong hand — well played.' };
    }
    // Fold with weak hand = optimal
    if (action === 'fold' && handStrength < 20) {
      return { grade: 'optimal', label: '✅ Optimal', color: '#4caf50', tip: 'Good fold — limited equity vs. opponent range.' };
    }
    // Default: slight leak for passive play
    if (action === 'check' && handStrength > 50 && phase === 'river') {
      return { grade: 'leak', label: '⚠️ Slight Leak', color: '#f59e0b', tip: 'Missed value bet on the river with a strong hand.' };
    }
    // Neutral/acceptable
    return { grade: 'neutral', label: '✅ Acceptable', color: '#4caf50', tip: 'Play was within acceptable GTO range.' };
  };

  const { label, color, tip } = evaluate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.5, duration: 0.4 }}
      style={{ marginTop: 8, textAlign: 'center' }}
    >
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={(e) => { e.stopPropagation(); setShowDetail(!showDetail); }}
        style={{
          background: `${color}20`,
          border: `1px solid ${color}50`,
          borderRadius: 20,
          padding: '4px 14px',
          color,
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        🧠 {label}
      </motion.button>

      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              marginTop: 6,
              padding: '6px 12px',
              background: 'rgba(0,0,0,0.6)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 10,
              color: '#B0B3B8',
              lineHeight: 1.5,
              maxWidth: 220,
              margin: '6px auto 0',
            }}
          >
            {tip}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHIP FLY ANIMATION — chips fly from pot center to winner seat
// ═══════════════════════════════════════════════════════════════════════════

function ChipFlyAnimation({ winners, seatPositions, seats }) {
  const [chips, setChips] = useState([]);

  useEffect(() => {
    if (!winners?.length || !seatPositions || !seats) return;

    const newChips = [];
    const chipColors = ['#e53935', '#1e88e5', '#43a047', '#000000', '#9c27b0', '#ff9800', '#fdd835'];

    winners.forEach((w, wi) => {
      const seat = seats.find(s => s.player && String(s.player.id) === String(w.playerId));
      if (!seat) return;
      const pos = seatPositions[seat.seatIndex];
      if (!pos) return;

      // 5-8 chips per winner
      const count = Math.min(Math.max(3, Math.ceil((w.amount || 0) / 200)), 8);
      for (let i = 0; i < count; i++) {
        newChips.push({
          id: `chip-${wi}-${i}`,
          targetX: pos.x,
          targetY: pos.y,
          color: chipColors[(wi * 3 + i) % chipColors.length],
          delay: 0.3 + wi * 0.15 + i * 0.05,
          size: 12 + Math.random() * 4,
        });
      }
    });

    setChips(newChips);
    const timer = setTimeout(() => setChips([]), 2500);
    return () => clearTimeout(timer);
  }, [winners, seatPositions, seats]);

  if (!chips.length) return null;

  return (
    <>
      {chips.map(chip => (
        <motion.div
          key={chip.id}
          initial={{
            left: '50%', top: '28%',
            scale: 1, opacity: 1,
            x: '-50%', y: '-50%',
          }}
          animate={{
            left: `${chip.targetX}%`,
            top: `${chip.targetY}%`,
            scale: [1, 1.3, 0.8],
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 0.6,
            delay: chip.delay,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          style={{
            position: 'absolute',
            width: chip.size, height: chip.size,
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, ${chip.color}dd, ${chip.color})`,
            border: '1.5px solid rgba(255,255,255,0.45)',
            boxShadow: `0 2px 6px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.3)`,
            zIndex: 55,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT OVERLAY (showdown / hand complete) + RABBIT HUNT
// ═══════════════════════════════════════════════════════════════════════════

function ResultOverlay({ result, send, userId }) {
  const [showRabbit, setShowRabbit] = useState(false);
  const [cardsShown, setCardsShown] = useState(false);

  // Reset rabbit state when result changes
  useEffect(() => { setShowRabbit(false); setCardsShown(false); }, [result]);

  if (!result) return null;

  const isFoldWin = result.type === 'fold' || result.result?.type === 'fold';
  const rabbitCards = result.rabbitCards || result.result?.rabbitCards;
  const boardAtEnd = result.boardAtEnd || result.result?.boardAtEnd || [];

  // Check if current user is the winner (for show cards option)
  const isWinner = isFoldWin && result.winners?.some(w =>
    String(w.playerId) === String(userId)
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(0,0,0,0.85)',
        border: `2px solid ${T.accent}`,
        borderRadius: 16,
        padding: '16px 32px',
        zIndex: 50,
        textAlign: 'center',
        minWidth: 200,
      }}
    >
      {result.winners?.map((w, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ color: T.accent, fontSize: 16, fontWeight: 800 }}>
            {w.displayName || w.playerId} wins {w.amount?.toLocaleString()}
          </div>
          {w.handDescription && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #FFD700, #f59e0b)',
                color: '#000',
                fontSize: 11,
                fontWeight: 900,
                padding: '3px 12px',
                borderRadius: 20,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                boxShadow: '0 0 12px rgba(255,215,0,0.4), 0 2px 6px rgba(0,0,0,0.3)',
                marginTop: 4,
              }}
            >
              {w.handDescription}
            </motion.div>
          )}
        </div>
      ))}

      {/* Rabbit Hunt — only on fold wins with remaining cards */}
      {isFoldWin && rabbitCards && rabbitCards.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {!showRabbit ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => { e.stopPropagation(); setShowRabbit(true); }}
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 20,
                padding: '6px 16px',
                color: '#B0B3B8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>🐇</span>
              Rabbit Hunt
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.3 }}
            >
              <div style={{
                fontSize: 10, color: '#65676B', marginBottom: 6,
                textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700,
              }}>
                🐇 Would have been dealt
              </div>

              {/* Show existing board + rabbit cards */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                {/* Existing board cards (dimmed) */}
                {boardAtEnd.map((card, i) => (
                  <div key={`board-${i}`} style={{ opacity: 0.45 }}>
                    <CardImg card={card} width={38} delay={0} />
                  </div>
                ))}

                {/* Rabbit cards (bright, animated reveal) */}
                {rabbitCards.map((card, i) => (
                  <motion.div
                    key={`rabbit-${i}`}
                    initial={{ rotateY: 180, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.15 + i * 0.2 }}
                    style={{
                      filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.4))',
                      border: '1px solid rgba(255,215,0,0.3)',
                      borderRadius: 4,
                    }}
                  >
                    <CardImg card={card} width={38} delay={0.15 + i * 0.2} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Show Cards — voluntary reveal after fold win */}
      {isWinner && send && !cardsShown && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { send('show_cards', {}); setCardsShown(true); }}
            style={{
              padding: '6px 14px', background: 'rgba(33,150,243,0.3)',
              border: '1px solid #2196F3', borderRadius: 8, color: '#fff',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            👁️ Show All
          </motion.button>
          {myCards && myCards.length >= 2 && myCards.map((_, idx) => (
            <motion.button
              key={idx}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { send('show_one_card', { cardIndex: idx }); setCardsShown(true); }}
              style={{
                padding: '6px 12px', background: 'rgba(255,152,0,0.2)',
                border: '1px solid #FF9800', borderRadius: 8, color: '#fff',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Show #{idx + 1}
            </motion.button>
          ))}
        </div>
      )}
      {cardsShown && (
        <div style={{ marginTop: 6, color: '#4caf50', fontSize: 11, fontWeight: 600 }}>
          Cards revealed ✓
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: LivePokerTable
// ═══════════════════════════════════════════════════════════════════════════

function LivePokerTable({
  tableId,
  supabase,
  userId,
  displayName = 'Player',
  avatarUrl = null,
  onActionRequired = null,
  onActionCleared = null,
  onLeave = null,
  tournamentId = null,
}) {
  // Connection via hook
  const {
    tableState, myCards, legalActions, timerState,
    chatMessages, result, lastHandResult, error, connected, send,
    sessionStats, tableAlert, seatOffer, spinReveal,
  } = useTableConnection({ supabase, tableId, userId });

  // Notify parent (MultiTableView) when action state changes
  useEffect(() => {
    if (legalActions && legalActions.length > 0) {
      onActionRequired?.(tableId);
    } else {
      onActionCleared?.(tableId);
    }
  }, [legalActions, tableId, onActionRequired, onActionCleared]);

  // Theme system
  const [themeId, setThemeId] = useState(() => getStoredThemeId());
  const [cardBack, setCardBack] = useState(() => getStoredCardBack());

  // Admin role detection
  const [userRole, setUserRole] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  useEffect(() => {
    if (!supabase || !userId || !tableState?.clubId) return;
    supabase.from('club_members').select('role')
      .eq('club_id', tableState.clubId).eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (data?.role) setUserRole(data.role); });
  }, [supabase, userId, tableState?.clubId]);
  const isAdmin = ['owner', 'admin', 'manager'].includes(userRole);

  // Update module-level T when theme changes so all sub-components see it
  T = TABLE_THEMES[themeId] || TABLE_THEMES.classicGreen;

  // Sound manager
  const soundRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('poker-sound-enabled') !== 'false'; } catch { return true; }
  });
  const [soundVolume, setSoundVolume] = useState(() => {
    try { return parseFloat(localStorage.getItem('poker-sound-volume') || '0.4'); } catch { return 0.4; }
  });
  const [showSoundPanel, setShowSoundPanel] = useState(false);
  if (!soundRef.current && typeof window !== 'undefined') {
    soundRef.current = new PokerSoundManager();
  }
  // Sync mute + volume state
  useEffect(() => {
    if (soundRef.current) { soundRef.current.muted = !soundEnabled; soundRef.current.setVolume(soundVolume); }
    if (typeof window !== 'undefined') {
      localStorage.setItem('poker-sound-enabled', String(soundEnabled));
      localStorage.setItem('poker-sound-volume', String(soundVolume));
    }
  }, [soundEnabled, soundVolume]);

  // Sound triggers based on game events
  const prevPhaseRef = useRef(null);
  const prevResultRef = useRef(null);
  useEffect(() => {
    const sm = soundRef.current;
    if (!sm || !tableState?.game) return;
    const phase = tableState.game.phase;
    const prev = prevPhaseRef.current;
    if (prev !== phase) {
      if (phase === 'preflop' && prev === 'idle') { sm.play('deal'); haptic('medium'); }
      if (phase === 'flop' && prev === 'preflop') { sm.play('deal'); haptic('light'); }
      if (phase === 'turn' && prev === 'flop') { sm.play('deal'); haptic('light'); }
      if (phase === 'river' && prev === 'turn') { sm.play('deal'); haptic('light'); }
      if (phase === 'showdown') sm.play('showdown');
      prevPhaseRef.current = phase;
    }
  }, [tableState?.game?.phase]);

  // Sound for results (win/lose)
  useEffect(() => {
    const sm = soundRef.current;
    if (!sm || !result || result === prevResultRef.current) return;
    prevResultRef.current = result;
    if (result.bbj) { sm.play('bbj'); return; }
    const isWinner = result.winners?.some(w => String(w.playerId) === String(userId));
    sm.play(isWinner ? 'win' : 'lose');
  }, [result, userId]);

  // Sound for your turn
  useEffect(() => {
    const sm = soundRef.current;
    if (!sm || !legalActions || legalActions.length === 0) return;
    sm.play('yourTurn');
    haptic('double');
  }, [legalActions]);

  // Sound for timer warning
  useEffect(() => {
    const sm = soundRef.current;
    if (!sm || !timerState) return;
    if (timerState.remaining <= 5 && timerState.remaining > 0 && String(timerState.playerId) === String(userId)) {
      sm.play('timer');
    }
  }, [timerState?.remaining, timerState?.playerId, userId]);

  // UI state
  const [buyInSeat, setBuyInSeat] = useState(null);
  const [showRebuy, setShowRebuy] = useState(false);
  const [rebuyBalance, setRebuyBalance] = useState(null);
  const [rebuyBalanceLoading, setRebuyBalanceLoading] = useState(false);
  const [rebuyError, setRebuyError] = useState(null);
  const [clubChipBalance, setClubChipBalance] = useState(null);

  // Mystery Bounty Reveal State
  const [bountyReveal, setBountyReveal] = useState(null);

  // EventBus Listener for Mystery Bounty Knockouts
  useEffect(() => {
    if (!eventBus) return;
    const handleBountyWon = (e) => {
      // e.payload format: { tableId, playerId, amount, eliminatorName }
      if (e.payload?.tableId === tableId && String(e.payload?.playerId) === String(userId)) {
        setBountyReveal({ amount: e.payload.amount });
      }
    };

    const unsub = eventBus.on('tournament_bounty_won', handleBountyWon);
    return () => unsub();
  }, [tableId, userId]);

  // Auto-open buy-in when waitlist seat is offered
  useEffect(() => {
    if (seatOffer && !isSitting && buyInSeat === null) {
      setBuyInSeat(seatOffer.seatIndex);
    }
  }, [seatOffer, isSitting, buyInSeat]);

  const [noteTarget, setNoteTarget] = useState(null); // { id, displayName } for notes modal
  const [quickViewTarget, setQuickViewTarget] = useState(null); // { id, displayName, avatarUrl, stack, stats }
  const [playerNotes, setPlayerNotes] = useState({}); // { targetUserId: { color_label, player_type, ... } }

  // Load player notes for all seated opponents
  useEffect(() => {
    if (!userId || !seats?.length) return;
    const opponentIds = seats
      .filter(s => s.player?.id && String(s.player.id) !== String(userId))
      .map(s => s.player.id);
    if (opponentIds.length === 0) return;

    // BUG #147 FIX: Include auth token — server requires Bearer auth
    Promise.resolve({ access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token }).then((noteSession) => {
      fetch('/api/club-arena/player-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(noteSession?.access_token ? { Authorization: `Bearer ${noteSession.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'get_bulk', targetUserIds: opponentIds }),
      })
        .then(r => r.json())
        .then(r => { if (r.notes) setPlayerNotes(r.notes); })
        .catch(() => { });
    }).catch(() => { });
  }, [userId, supabase, seats?.map(s => s.player?.id).join(',')]);

  // Fetch club chip balance when buy-in dialog opens
  useEffect(() => {
    if (buyInSeat === null || !tableState?.clubId || !userId) {
      setClubChipBalance(null);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from('club_members')
          .select('chip_balance')
          .eq('club_id', tableState.clubId)
          .eq('user_id', userId)
          .maybeSingle();
        setClubChipBalance(data?.chip_balance || 0);
      } catch (e) {
        console.warn('[LivePokerTable] Failed to fetch chip balance:', e);
        setClubChipBalance(null);
      }
    })();
  }, [buyInSeat, tableState?.clubId, userId, supabase]);

  // Derived state — use String() coercion to match engine convention
  const isSitting = tableState?.seats.some(
    s => s.player?.id != null && String(s.player.id) === String(userId) && s.status !== 'empty'
  );
  const isSittingOut = tableState?.seats.some(
    s => s.player?.id != null && String(s.player.id) === String(userId) && s.status === 'sitting_out'
  );
  const mySeat = tableState?.seats.find(s => s.player?.id != null && String(s.player.id) === String(userId));
  const isMyTurn = tableState?.game?.currentPlayerId != null
    && String(tableState.game.currentPlayerId) === String(userId);
  const maxSeats = tableState?.maxSeats || 9;
  const positions = useMemo(() => getSeatPositions(maxSeats), [maxSeats]);
  const [preAction, setPreAction] = useState(null); // 'fold' | 'check_fold' | 'check' | 'call_any' | null
  const [showLastHand, setShowLastHand] = useState(false);

  // ═══ HERO SEAT ROTATION — Always place hero at bottom center (position 0) ═══
  const heroSeatIndex = mySeat?.seatIndex ?? -1;
  const rotatedPositionMap = useMemo(() => {
    // Map each seat's array index to a visual position index
    // Hero's seat index should map to position 0 (bottom center)
    if (heroSeatIndex < 0) return null; // not seated, no rotation
    const map = new Array(maxSeats);
    for (let i = 0; i < maxSeats; i++) {
      // Rotate so heroSeatIndex -> 0, heroSeatIndex+1 -> 1, etc.
      map[i] = (i - heroSeatIndex + maxSeats) % maxSeats;
    }
    return map;
  }, [heroSeatIndex, maxSeats]);

  // Auto-execute pre-action when it's our turn
  useEffect(() => {
    if (!isMyTurn || !legalActions?.length || !preAction) return;

    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canFold = legalActions.some(a => a.type === 'fold');

    let autoAction = null;
    switch (preAction) {
      case 'fold':
        if (canFold) autoAction = { type: 'fold' };
        break;
      case 'check_fold':
        autoAction = canCheck ? { type: 'check' } : canFold ? { type: 'fold' } : null;
        break;
      case 'check':
        if (canCheck) autoAction = { type: 'check' };
        break;
      case 'call_any':
        autoAction = canCall ? { type: 'call' } : canCheck ? { type: 'check' } : null;
        break;
    }

    if (autoAction) {
      // Small delay so player sees the action happening
      const timer = setTimeout(() => {
        send('player_action', { action: autoAction });
        setPreAction(null);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      // Pre-action doesn't match — clear it, let player decide manually
      setPreAction(null);
    }
  }, [isMyTurn, legalActions, preAction, send]);

  // Clear pre-action when hand ends
  useEffect(() => {
    if (result) setPreAction(null);
  }, [result]);

  // ═══ FLOATING ACTION LABELS ═══
  const [floatingLabels, setFloatingLabels] = useState([]);
  const floatingIdRef = useRef(0);

  // Track actions from broadcasts for floating labels
  useEffect(() => {
    if (!tableState?.game?.lastAction) return;
    const la = tableState.game.lastAction;
    if (la.seatIndex == null) return;
    const seatIdx = la.seatIndex;
    const visualIdx = rotatedPositionMap ? rotatedPositionMap[seatIdx] : seatIdx;
    const pos = positions[visualIdx] || positions[0];
    const id = ++floatingIdRef.current;
    setFloatingLabels(prev => [...prev.slice(-5), { id, action: la.type, amount: la.amount, position: pos }]);
    const t = setTimeout(() => setFloatingLabels(prev => prev.filter(l => l.id !== id)), 1800);
    return () => clearTimeout(t);
  }, [tableState?.game?.lastAction?.seq, rotatedPositionMap, positions]);

  // ═══ AUTO-MUCK TOGGLE ═══
  const [autoMuck, setAutoMuck] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('poker-auto-muck') !== 'false';
    return true;
  });
  const handleToggleAutoMuck = useCallback(() => {
    setAutoMuck(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem('poker-auto-muck', String(next));
      return next;
    });
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // ACTION HANDLERS (use send from hook)
  // ═══════════════════════════════════════════════════════════════════

  const handleAction = useCallback((action) => {
    // Play action sound
    const sm = soundRef.current;
    if (sm && action?.type) {
      const soundMap = { fold: 'fold', check: 'check', call: 'call', bet: 'bet', raise: 'raise', all_in: 'allIn' };
      if (soundMap[action.type]) sm.play(soundMap[action.type]);
    }
    // Haptic feedback on mobile
    if (action?.type === 'all_in') haptic('allIn');
    else if (action?.type === 'fold') haptic('light');
    else haptic('medium');
    send('player_action', { action });
  }, [send]);

  // ═══ KEYBOARD SHORTCUTS ═══
  // F=Fold, C=Check/Call, R=Raise/Bet, A=All-In, Space=Check/Call, Esc=Cancel
  useEffect(() => {
    const onKeyDown = (e) => {
      // Don't trigger if typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (!isMyTurn || !legalActions?.length) return;

      const key = e.key.toLowerCase();
      const canFold = legalActions.some(a => a.type === 'fold');
      const canCheck = legalActions.some(a => a.type === 'check');
      const canCall = legalActions.find(a => a.type === 'call');
      const canAllIn = legalActions.some(a => a.type === 'all_in');

      switch (key) {
        case 'f':
          if (canFold) { e.preventDefault(); handleAction({ type: 'fold' }); }
          break;
        case 'c':
        case ' ':
          e.preventDefault();
          if (canCheck) handleAction({ type: 'check' });
          else if (canCall) handleAction({ type: 'call' });
          break;
        case 'a':
          if (canAllIn) { e.preventDefault(); handleAction({ type: 'all_in' }); }
          break;
        // R just focuses the bet/raise — actual amount is via slider
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMyTurn, legalActions, handleAction]);

  const handleSitDown = useCallback((amount) => {
    send('sit_down', { seatIndex: buyInSeat, buyIn: amount, displayName, avatarUrl });
    setBuyInSeat(null);
  }, [send, buyInSeat, displayName, avatarUrl]);

  const [sessionSummary, setSessionSummary] = useState(null);
  const pendingLeaveRef = useRef(false);
  const handleStandUp = useCallback(() => {
    setSitOutNextBB(false); // Clear pending sit-out flag
    // Calculate session summary before leaving
    const stats = sessionStats;
    const stack = mySeat?.stack || 0;
    if (stats && stats.initialBuyIn > 0) {
      const pnl = stack - stats.initialBuyIn - (stats.totalAdded || 0);
      const hrs = stats.sessionStart ? ((Date.now() - stats.sessionStart) / 3600000).toFixed(1) : '0';
      const sign = pnl >= 0 ? '+' : '';
      setSessionSummary({ pnl, hands: stats.handsPlayed, hrs, message: `Session: ${sign}${pnl.toLocaleString()} chips | ${stats.handsPlayed} hands | ${hrs}hr` });
      setTimeout(() => setSessionSummary(null), 8000);
    }
    pendingLeaveRef.current = true;
    send('stand_up', {});
  }, [send, sessionStats, mySeat?.stack]);

  // Auto-complete pending leave after hand ends
  // When player clicks Leave during a hand, engine returns pending: true.
  // After hand_complete, player is sitting_out but still at table.
  // This effect re-issues stand_up to complete departure.
  useEffect(() => {
    if (!pendingLeaveRef.current) return;
    if (isSittingOut && (!tableState?.game?.phase || tableState.game.phase === 'idle')) {
      pendingLeaveRef.current = false;
      send('stand_up', {});
    }
  }, [isSittingOut, tableState?.game?.phase, send]);
  const handleSitOut = useCallback(() => send('sit_out', {}), [send]);
  const handleSitIn = useCallback(() => { setSitOutNextBB(false); send('sit_in', {}); }, [send]);
  const [sitOutNextBB, setSitOutNextBB] = useState(false);

  // Sit Out Next BB: after each hand, check if we should sit out
  useEffect(() => {
    if (!sitOutNextBB || !result || isSittingOut) return;
    // Hand just completed — sit out now (the BB has passed)
    send('sit_out', {});
    setSitOutNextBB(false);
  }, [result, sitOutNextBB, isSittingOut, send]);
  const [straddleOn, setStraddleOn] = useState(false);
  const handleToggleStraddle = useCallback(() => {
    const newVal = !straddleOn;
    setStraddleOn(newVal);
    send(newVal ? 'declare_straddle' : 'cancel_straddle', {});
  }, [send, straddleOn]);
  const [autoTopUpOn, setAutoTopUpOn] = useState(false);
  const handleToggleAutoTopUp = useCallback(() => {
    const newVal = !autoTopUpOn;
    setAutoTopUpOn(newVal);
    send('set_auto_topup', { enabled: newVal });
  }, [send, autoTopUpOn]);
  const handleChat = useCallback((message) => {
    soundRef.current?.play('chat');
    send('send_chat', { message });
  }, [send]);
  const handleAddChips = useCallback(async () => {
    setRebuyError(null);
    setRebuyBalance(null);
    setShowRebuy(true);
    if (!tableState?.clubId || !userId) return;
    setRebuyBalanceLoading(true);
    try {
      const { data } = await supabase
        .from('club_members')
        .select('chip_balance')
        .eq('club_id', tableState.clubId)
        .eq('user_id', userId)
        .maybeSingle();
      setRebuyBalance(data?.chip_balance ?? 0);
    } catch (_) {
      setRebuyBalance(0);
    } finally {
      setRebuyBalanceLoading(false);
    }
  }, [supabase, tableState?.clubId, userId]);

  const handleRebuyConfirm = useCallback(async (amount) => {
    setRebuyError(null);
    try {
      // seat.js add_chips handler locks chips via ChipBridge.rebuyChips()
      // and adds to engine stack — returns { success, error }
      const result = await send('add_chips', { amount });
      if (result && !result.success) {
        setRebuyError(result.error || 'Rebuy failed');
        return;
      }
      setShowRebuy(false);
    } catch (e) {
      setRebuyError('Network error. Please try again.');
    }
  }, [send]);
  const handleDiscard = useCallback((cardIndex) => {
    send('discard', { cardIndex });
  }, [send]);

  // ═══════════════════════════════════════════════════════════════════
  // BUILD SEAT DATA (merge server state with hero cards)
  // ═══════════════════════════════════════════════════════════════════

  const seats = useMemo(() => {
    if (!tableState) return positions.map((_, i) => ({
      seatIndex: i, status: 'empty', player: null, stack: 0,
      holeCards: null, isInHand: false, isFolded: false, isCurrentActor: false, invested: 0,
    }));

    return tableState.seats.slice(0, maxSeats).map((seat) => ({
      ...seat,
      holeCards: (seat.player?.id != null && String(seat.player.id) === String(userId)) ? myCards : seat.holeCards,
    }));
  }, [tableState, myCards, userId, maxSeats, positions]);

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: T.bgDark,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Table surface — vertical layout for Club Arena mobile */}
      <div
        style={{
          position: 'absolute',
          top: '6%',
          left: '2%',
          right: '2%',
          bottom: '10%',
        }}
      >
        {/* Poker table image — vertical orientation for portrait mode */}
        <img
          src="/images/poker-table-vertical.png"
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            height: '100%',
            maxWidth: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Table content overlay — positioned over the vertical table */}
        <div
          style={{
            position: 'absolute',
            top: '18%',
            left: '15%',
            right: '15%',
            bottom: '18%',
            zIndex: 1,
          }}
        >
          {/* BBJ Ticker */}
          {tableState?.config?.bbjEnabled && tableState?.clubId && (
            <BBJTicker
              clubId={tableState.clubId}
              variant="table"
              bbjWonEvent={result?.bbj || null}
              supabase={supabase}
            />
          )}

          {/* Community cards */}
          <CommunityCards
            cards={tableState?.game?.communityCards || []}
            boards={tableState?.game?.boards}
          />

          {/* Pot */}
          <PotDisplay
            potTotal={tableState?.game?.potTotal || 0}
            pots={tableState?.game?.pots || []}
          />

          {/* Run It Twice/Thrice offer overlay */}
          <AnimatePresence>
            {result?.runItOffer && (
              <RunItOfferOverlay
                offer={result.runItOffer}
                userId={userId}
                onRespond={(choice) => send('respond_run_it', { choice })}
              />
            )}
          </AnimatePresence>

          {/* Result overlay */}
          <AnimatePresence>
            {result && <ResultOverlay result={result} send={send} userId={userId} />}
          </AnimatePresence>

          {/* Chip fly animation — chips fly from pot to winner seats */}
          {result?.winners && (
            <ChipFlyAnimation
              winners={result.winners}
              seatPositions={positions}
              seats={seats}
            />
          )}

          {/* Confetti burst on big pots (≥50× BB) */}
          <ConfettiBurst
            active={!!(result?.winners && tableState?.config?.bigBlind &&
              (result.winners.reduce((s, w) => s + (w.amount || 0), 0) >= tableState.config.bigBlind * 50))}
          />

          {/* Equity progress bar on all-in */}
          {result?.allInEquity?.players && (
            <EquityBar players={result.allInEquity.players} />
          )}

          {/* Floating action labels */}
          <AnimatePresence>
            {floatingLabels.map(fl => (
              <FloatingActionLabel
                key={fl.id}
                action={fl.action}
                amount={fl.amount}
                position={fl.position}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Seats — rotated so hero is always at bottom center */}
        {seats.map((seat, i) => {
          const pid = seat.player?.id;
          const noteData = pid && String(pid) !== String(userId) ? playerNotes[pid] : null;
          const noteColorVal = noteData?.player_type && noteData.player_type !== 'unknown'
            ? 'rgba(255, 215, 0, 0.4)' // Gold tint if tagged
            : null;
          // Poker position from game state (btn, sb, bb, utg, mp)
          const gamePlayer = tableState?.game?.players?.find(p => String(p.id) === String(pid));
          const gamePosition = gamePlayer?.position || null;
          // Button seat fallback
          const isButton = tableState?.game?.buttonSeat === i;
          // Use rotated visual position if hero is seated, otherwise raw index
          const visualIndex = rotatedPositionMap ? rotatedPositionMap[i] : i;
          return (
            <PlayerSeat
              key={i}
              seat={seat}
              position={positions[visualIndex] || positions[0]}
              isHero={pid != null && String(pid) === String(userId)}
              isCurrentActor={seat.isCurrentActor}
              timerState={seat.isCurrentActor ? timerState : null}
              onClick={() => setBuyInSeat(i)}
              onNote={pid && String(pid) !== String(userId) ? () => setQuickViewTarget({ id: pid, displayName: seat.player?.displayName, avatarUrl: seat.player?.avatarUrl, stack: seat.stack, stats: seat.player?.stats || {} }) : undefined}
              noteColor={noteColorVal}
              noteType={noteData?.player_type}
              isWinner={result?.winners?.some(w => String(w.playerId) === String(seat.player?.id))}
              equity={result?.allInEquity?.players?.find(p => String(p.id) === String(seat.player?.id))?.equity ?? null}
              gamePosition={gamePosition || (isButton ? 'btn' : null)}
              numHoleCards={
                ({ holdem: 2, omaha4: 4, omaha5: 5, omaha6: 6, omaha_hilo: 4, short_deck: 2, pineapple: 3 })[
                tableState?.config?.variant
                ] || 2
              }
            />
          );
        })}
      </div>

      {/* Tournament HUD — blind clock, level, players */}
      {(tournamentId || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tournament'))) && (
        <TournamentHUD
          tournamentId={tournamentId || new URLSearchParams(window.location.search).get('tournament')}
          userId={userId}
        />
      )}

      {/* Table alert banner (game length warning, paused, auto-removed, etc.) */}
      <AnimatePresence>
        {tableAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
              zIndex: 200, padding: '8px 20px', borderRadius: 10,
              background: tableAlert.type === 'warning' ? 'rgba(255,152,0,0.95)'
                : tableAlert.type === 'expired' ? 'rgba(244,67,54,0.95)'
                  : tableAlert.type === 'paused' ? 'rgba(33,150,243,0.95)'
                    : tableAlert.type === 'removed' ? 'rgba(244,67,54,0.95)'
                      : 'rgba(76,175,80,0.95)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {tableAlert.type === 'warning' && '⚠️ '}
            {tableAlert.type === 'expired' && '🛑 '}
            {tableAlert.type === 'paused' && '⏸️ '}
            {tableAlert.type === 'removed' && '🚪 '}
            {tableAlert.type === 'extended' && '🔄 '}
            {tableAlert.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session summary banner (shown when standing up) */}
      <AnimatePresence>
        {sessionSummary && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
              zIndex: 300, padding: '12px 24px', borderRadius: 12,
              background: sessionSummary.pnl >= 0 ? 'rgba(76,175,80,0.95)' : 'rgba(244,67,54,0.95)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)', textAlign: 'center', maxWidth: 340,
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>Session Complete</div>
            {sessionSummary.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table info bar */}
      <TableInfoBar
        tableState={tableState}
        onSitOut={handleSitOut}
        onSitIn={handleSitIn}
        onStandUp={handleStandUp}
        onAddChips={handleAddChips}
        isSitting={isSitting}
        isSittingOut={isSittingOut}
        straddleEnabled={tableState?.config?.voluntaryStraddle || tableState?.config?.straddleEnabled}
        straddleOn={straddleOn}
        onToggleStraddle={handleToggleStraddle}
        autoTopUpOn={autoTopUpOn}
        onToggleAutoTopUp={handleToggleAutoTopUp}
        autoMuckOn={autoMuck}
        onToggleAutoMuck={handleToggleAutoMuck}
        lastHandResult={lastHandResult}
        onShowLastHand={() => setShowLastHand(true)}
        sessionStats={sessionStats}
        myStack={mySeat?.stack || 0}
        sitOutNextBB={sitOutNextBB}
        onToggleSitOutNextBB={() => setSitOutNextBB(p => !p)}
      />

      {/* Hand strength indicator (hero only, during active hand) */}
      {myCards && myCards.length > 0 && isSitting && !result?.winners && (() => {
        const board = tableState?.game?.communityCards || [];
        const strength = getHandStrength(myCards, board);
        if (!strength || !strength.label) return null;
        const cat = strength.category || 0;
        const color = cat >= 7 ? '#FFD700' : cat >= 5 ? '#4ECDC4' : cat >= 3 ? '#60a5fa' : '#B0B3B8';
        return (
          <div style={{
            position: 'fixed',
            bottom: isMyTurn && legalActions ? 120 : 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            background: 'rgba(0,0,0,0.75)',
            border: `1px solid ${color}40`,
            borderRadius: 12,
            padding: '3px 14px',
            fontSize: 12,
            fontWeight: 700,
            color,
            textAlign: 'center',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
            transition: 'bottom 0.3s ease',
          }}>
            {strength.label}
          </div>
        );
      })()}

      {/* ═══ YOUR TURN INDICATOR — Pulsing banner when action is on hero ═══ */}
      <AnimatePresence>
        {isMyTurn && legalActions && legalActions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'fixed',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 210,
              background: 'linear-gradient(135deg, rgba(35,116,225,0.95), rgba(99,102,241,0.95))',
              color: '#fff',
              padding: '6px 24px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: 'uppercase',
              boxShadow: '0 4px 20px rgba(35,116,225,0.6)',
              animation: 'yourTurnPulse 1.2s ease-in-out infinite alternate',
            }}
          >
            YOUR TURN
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action panel (when it's hero's turn) — includes Raise/Bet + Slider */}
      <AnimatePresence>
        {isMyTurn && legalActions && (
          <ActionPanel
            actions={legalActions}
            onAction={handleAction}
            stack={mySeat?.stack || 0}
            currentBet={tableState?.game?.currentBet || 0}
            bigBlind={tableState?.config?.bigBlind || tableState?.bigBlind || 2}
            potTotal={tableState?.game?.potTotal || 0}
          />
        )}

        {/* Pre-action buttons: show when seated, not your turn, hand in progress */}
        {!isMyTurn && isSitting && !isSittingOut && tableState?.game?.phase && tableState.game.phase !== 'idle' && !result && (
          <PreActionBar preAction={preAction} setPreAction={setPreAction} />
        )}
      </AnimatePresence>

      {/* Pineapple discard panel */}
      <AnimatePresence>
        {tableState?.game?.phase === 'discard' && myCards && myCards.length === 3 && (
          <DiscardPanel cards={myCards} onDiscard={handleDiscard} />
        )}
      </AnimatePresence>

      {/* Chat */}
      {/* Chat — hidden when ban_chat enabled */}
      {!tableState?.config?.banChat && (
        <ChatOverlay messages={chatMessages} onSend={handleChat} />
      )}

      {/* Observer / Waitlist bar — shown when NOT seated */}
      {!isSitting && buyInSeat === null && tableState && (
        <ObserverBar
          tableState={tableState}
          userId={userId}
          send={send}
          onClickSeat={(idx) => setBuyInSeat(idx)}
          seatOffer={seatOffer}
        />
      )}

      {/* Buy-in dialog */}
      <AnimatePresence>
        {buyInSeat !== null && (
          <BuyInDialog
            minBuyIn={tableState?.config?.minBuyIn || 40}
            maxBuyIn={
              clubChipBalance !== null
                ? Math.min(tableState?.config?.maxBuyIn || 200, clubChipBalance)
                : (tableState?.config?.maxBuyIn || 200)
            }
            bigBlind={tableState?.config?.bigBlind || tableState?.bigBlind || 2}
            chipBalance={clubChipBalance}
            isClubTable={!!tableState?.clubId}
            onConfirm={handleSitDown}
            onCancel={() => setBuyInSeat(null)}
          />
        )}
      </AnimatePresence>

      {/* Rebuy / Add Chips modal */}
      <AnimatePresence>
        {showRebuy && (
          <RebuyModal
            currentStack={mySeat?.stack || 0}
            maxBuyIn={tableState?.config?.maxBuyIn || 200}
            chipBalance={rebuyBalance}
            loading={rebuyBalanceLoading}
            error={rebuyError}
            onConfirm={handleRebuyConfirm}
            onCancel={() => { setShowRebuy(false); setRebuyError(null); }}
          />
        )}
      </AnimatePresence>

      {/* ═══════════ BBJ TICKER (top of table) ═══════════ */}
      {tableState?.bbjPool > 0 && (
        <div style={{
          position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(90deg, rgba(255,215,0,0.15), rgba(255,215,0,0.25), rgba(255,215,0,0.15))',
          border: '1px solid rgba(255,215,0,0.4)',
          borderRadius: 20, padding: '3px 16px', zIndex: 55,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 12 }}>🏆</span>
          <span style={{ color: '#FFD700', fontSize: 11, fontWeight: 700 }}>
            BAD BEAT JACKPOT
          </span>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>
            {Number(tableState.bbjPool).toLocaleString()}
          </span>
        </div>
      )}

      {/* ═══════════ BBJ WIN CELEBRATION ═══════════ */}
      <AnimatePresence>
        {result?.bbj && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 100,
            }}
          >
            <div style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              border: '3px solid #FFD700', borderRadius: 16,
              padding: '32px 48px', textAlign: 'center', maxWidth: 460,
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🏆💰🏆</div>
              <h2 style={{ color: '#FFD700', fontSize: 26, margin: '0 0 8px', fontWeight: 800 }}>
                BAD BEAT JACKPOT!
              </h2>
              <p style={{ color: '#fff', fontSize: 15, margin: '4px 0' }}>
                {result.bbj.loserHand} <span style={{ color: '#FA383E' }}>loses to</span> {result.bbj.winnerHand}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, margin: '16px 0' }}>
                <div>
                  <div style={{ color: '#B0B3B8', fontSize: 11 }}>Loser Wins</div>
                  <div style={{ color: '#FFD700', fontSize: 20, fontWeight: 700 }}>
                    {Number(result.bbj.loserPayout || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#B0B3B8', fontSize: 11 }}>Winner Wins</div>
                  <div style={{ color: '#4ade80', fontSize: 20, fontWeight: 700 }}>
                    {Number(result.bbj.winnerPayout || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#B0B3B8', fontSize: 11 }}>Table Share</div>
                  <div style={{ color: '#60a5fa', fontSize: 20, fontWeight: 700 }}>
                    {Number(result.bbj.tableSharePayout || 0).toLocaleString()}
                  </div>
                </div>
              </div>
              <p style={{ color: '#B0B3B8', fontSize: 11 }}>
                Total: {Number(result.bbj.totalPayout || 0).toLocaleString()}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ ANIMATED THROWABLES (PokerBros-style) ═══════════ */}
      <ThrowableEmojis
        userId={userId}
        seats={seats}
        seatPositions={positions}
        chatMessages={chatMessages}
        onThrow={(throwable, targetId) => {
          soundRef.current?.play('chat');
          send('throw_emoji', { emoji: throwable, throwable, targetId });
        }}
      />

      {/* ═══════════ TABLE THEME PICKER ═══════════ */}
      <ThemePicker
        currentThemeId={themeId}
        onThemeChange={(id) => setThemeId(id)}
        currentCardBack={cardBack}
        onCardBackChange={(path) => setCardBack(path)}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(prev => !prev)}
      />

      {/* ═══════════ INSURANCE OFFER OVERLAY ═══════════ */}
      <AnimatePresence>
        {result?.insuranceOffer && String(result.insuranceOffer.leaderId) === String(userId) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{
              position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(36,37,38,0.97)', border: '1px solid rgba(24,119,242,0.5)',
              borderRadius: 14, padding: '16px 24px', zIndex: 85, width: 320,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 24 }}>🛡️</span>
              <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: '4px 0' }}>Insurance Available</h3>
              <p style={{ color: '#B0B3B8', fontSize: 12, margin: 0 }}>
                You&apos;re ahead! Protect against {result.insuranceOffer.trailerEquity}% equity ({result.insuranceOffer.estimatedOuts} outs)
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#65676B', fontSize: 10 }}>Pot</div>
                <div style={{ color: '#FFD700', fontSize: 16, fontWeight: 700 }}>{(result.insuranceOffer.totalPot || 0).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#65676B', fontSize: 10 }}>Max Insure</div>
                <div style={{ color: '#4ade80', fontSize: 16, fontWeight: 700 }}>{(result.insuranceOffer.maxInsurance || 0).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#65676B', fontSize: 10 }}>Premium Rate</div>
                <div style={{ color: '#60a5fa', fontSize: 16, fontWeight: 700 }}>{((result.insuranceOffer.premiumRate || 0) * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0.25, 0.5, 1].map(pct => {
                const amt = Math.floor((result.insuranceOffer.maxInsurance || 0) * pct);
                return (
                  <button key={pct} onClick={() => send('buy_insurance', { amount: amt })} style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none',
                    background: '#1877F2', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                    {amt.toLocaleString()} ({Math.round(pct * 100)}%)
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => send('decline_insurance')}
              style={{
                width: '100%', marginTop: 8, padding: '8px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
                color: '#B0B3B8', fontSize: 12, cursor: 'pointer',
              }}
            >
              No Insurance
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ RUN IT MULTIPLE OVERLAY ═══════════ */}
      <AnimatePresence>
        {result?.runItMultiple && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(36,37,38,0.95)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 14, padding: '12px 20px', zIndex: 75, minWidth: 300,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{ textAlign: 'center', marginBottom: 8 }}
            >
              <span style={{ fontSize: 14, color: '#FFD700', fontWeight: 700 }}>
                🃏 Run It {result.runItMultiple.numBoards === 2 ? 'Twice' : 'Three Times'}
              </span>
            </motion.div>
            {/* Board split divider animation */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ delay: 0.3, duration: 0.5 }}
              style={{ height: 2, background: 'linear-gradient(90deg, transparent, #FFD700, transparent)', marginBottom: 8, borderRadius: 1 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {(result.runItMultiple.boards || []).map((b, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: i === 0 ? -30 : 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.2, type: 'spring', stiffness: 200 }}
                  style={{
                    background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: '8px 12px',
                    border: `1px solid ${b.isWinner ? '#FFD700' : 'rgba(255,255,255,0.1)'}`,
                    textAlign: 'center', minWidth: 80,
                    boxShadow: b.isWinner ? '0 0 12px rgba(255,215,0,0.3)' : 'none',
                  }}
                >
                  <div style={{ color: '#B0B3B8', fontSize: 10, marginBottom: 4 }}>Board {b.boardIndex}</div>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 4 }}>
                    {(b.cards || []).slice(-5).map((card, ci) => (
                      <motion.span
                        key={ci}
                        initial={{ opacity: 0, rotateY: 180 }}
                        animate={{ opacity: 1, rotateY: 0 }}
                        transition={{ delay: 0.7 + i * 0.2 + ci * 0.1 }}
                        style={{
                          display: 'inline-block', background: '#fff', color: (typeof card === 'string' && (card.includes('h') || card.includes('d'))) ? '#e53935' : '#000',
                          borderRadius: 3, padding: '1px 3px', fontSize: 10, fontWeight: 700,
                          border: '1px solid #ddd',
                        }}
                      >
                        {typeof card === 'string' ? card : card?.display || '?'}
                      </motion.span>
                    ))}
                  </div>
                  <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 700 }}>
                    {(b.payout || 0).toLocaleString()}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ ALL-IN EQUITY DISPLAY ═══════════ */}
      {result?.allInEquity && Array.isArray(result.allInEquity) && result.allInEquity.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '18%', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 6, zIndex: 70, padding: '6px 12px',
          background: 'rgba(0,0,0,0.85)', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {result.allInEquity.map((eq, i) => {
            const pct = typeof eq === 'object' ? (eq.equity || eq.winPct || 0) : eq;
            const pid = typeof eq === 'object' ? eq.playerId : null;
            const colors = ['#4ade80', '#60a5fa', '#f472b6', '#facc15', '#a78bfa', '#fb923c', '#34d399', '#f87171', '#38bdf8'];
            return (
              <div key={i} style={{ textAlign: 'center', minWidth: 50 }}>
                <div style={{ fontSize: 9, color: '#B0B3B8', marginBottom: 2 }}>
                  {pid ? (tableState?.seats?.find(s => s?.player?.id === pid)?.player?.displayName?.slice(0, 8) || `P${i + 1}`) : `P${i + 1}`}
                </div>
                <div style={{
                  width: 50, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden',
                }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: colors[i % colors.length], borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors[i % colors.length], marginTop: 2 }}>
                  {(pct || 0).toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════ SEVEN-DEUCE BONUS ═══════════ */}
      <AnimatePresence>
        {result?.sevenDeuceBonus && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            style={{
              position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, rgba(36,37,38,0.97), rgba(60,40,0,0.97))',
              border: '2px solid #FFD700', borderRadius: 16, padding: '16px 28px',
              zIndex: 80, textAlign: 'center', boxShadow: '0 0 40px rgba(255,215,0,0.3)',
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 4 }}>🃏💰</div>
            <div style={{ color: '#FFD700', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              7-2 BONUS!
            </div>
            <div style={{ color: '#E4E6EB', fontSize: 13 }}>
              {result.sevenDeuceBonus.winnerName || 'Player'} wins{' '}
              <span style={{ color: '#4ade80', fontWeight: 700 }}>
                {(result.sevenDeuceBonus.bonus || 0).toLocaleString()}
              </span>
              {' '}with 7-2 offsuit!
            </div>
            {result.sevenDeuceBonus.payers?.length > 0 && (
              <div style={{ color: '#B0B3B8', fontSize: 11, marginTop: 4 }}>
                {result.sevenDeuceBonus.perPlayer?.toLocaleString()} each from {result.sevenDeuceBonus.payers.length} player{result.sevenDeuceBonus.payers.length > 1 ? 's' : ''}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ BOMB POT OVERLAY ═══════════ */}
      <AnimatePresence>
        {tableState?.bombPot && (
          <motion.div
            initial={{ opacity: 0, scale: 2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, type: 'spring' }}
            style={{
              position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)',
              zIndex: 85, textAlign: 'center', pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 48 }}>💣</div>
            <div style={{
              color: '#FF6B35', fontSize: 22, fontWeight: 900, textShadow: '0 2px 10px rgba(255,107,53,0.5)',
              letterSpacing: 3,
            }}>
              BOMB POT
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => {
          if (soundRef.current) {
            soundRef.current.setEnabled(!soundRef.current.enabled);
          }
        }}
        style={{
          position: 'absolute', bottom: 8, right: 8, zIndex: 55,
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff', borderRadius: 20, padding: '4px 10px',
          fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        {soundRef.current?.enabled !== false ? '🔊' : '🔇'} Sound
      </button>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'absolute',
              top: 50,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(220,38,38,0.9)',
              color: '#fff',
              padding: '8px 20px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              zIndex: 60,
            }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiting state */}
      {!tableState && !connected && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: T.textSecondary,
            fontSize: 16,
          }}
        >
          Connecting to table...
        </div>
      )}

      {/* Mid-game reconnection banner */}
      {tableState && !connected && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(250, 56, 62, 0.9)',
            color: '#fff',
            padding: '8px 20px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          Reconnecting...
        </div>
      )}

      {/* ═══════════ LAST HAND REVIEW POPUP ═══════════ */}
      <AnimatePresence>
        {showLastHand && lastHandResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLastHand(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              zIndex: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: '#242526', borderRadius: 16, padding: 20,
                width: 360, border: '1px solid #3a3b3c',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: '#e4e6eb', fontSize: 16, fontWeight: 700 }}>📋 Last Hand</span>
                <button onClick={() => setShowLastHand(false)} style={{ background: 'none', border: 'none', color: '#b0b3b8', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Hand number */}
              {lastHandResult.handNumber && (
                <div style={{ color: '#b0b3b8', fontSize: 11, marginBottom: 8 }}>Hand #{lastHandResult.handNumber}</div>
              )}

              {/* Winners */}
              {(lastHandResult.winners || []).map((w, i) => (
                <div key={i} style={{ marginBottom: 8, padding: '8px 12px', background: '#3a3b3c', borderRadius: 8 }}>
                  <div style={{ color: '#FFD700', fontWeight: 700, fontSize: 14 }}>
                    🏆 {w.displayName || w.playerId} won {w.amount?.toLocaleString()}
                  </div>
                  {w.handDescription && <div style={{ color: '#b0b3b8', fontSize: 12 }}>{w.handDescription}</div>}
                  {w.holeCards && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {w.holeCards.map((c, j) => <CardImg key={j} card={c} width={32} />)}
                    </div>
                  )}
                </div>
              ))}

              {/* Board */}
              {lastHandResult.board?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: '#b0b3b8', fontSize: 11, marginBottom: 4 }}>Board</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {lastHandResult.board.map((c, i) => <CardImg key={i} card={c} width={36} />)}
                  </div>
                </div>
              )}

              {/* Pot */}
              {lastHandResult.potTotal > 0 && (
                <div style={{ color: '#b0b3b8', fontSize: 12, marginTop: 8 }}>
                  Pot: <span style={{ color: '#e4e6eb', fontWeight: 600 }}>{lastHandResult.potTotal.toLocaleString()}</span>
                  {lastHandResult.rake > 0 && <span> (rake: {lastHandResult.rake})</span>}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ SPIN MULTIPLIER REVEAL ═══════════ */}
      <AnimatePresence>
        {spinReveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.9) 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
            }}
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 10, stiffness: 100, delay: 0.3 }}
              style={{
                width: 160, height: 160, borderRadius: '50%',
                background: 'radial-gradient(circle, #FFD700 0%, #FF8C00 50%, #B8860B 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 60px rgba(255,215,0,0.6), 0 0 120px rgba(255,215,0,0.3)',
                border: '4px solid rgba(255,255,255,0.3)',
              }}
            >
              <motion.span
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8, type: 'spring', stiffness: 200 }}
                style={{ fontSize: 48, fontWeight: 900, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
              >
                {spinReveal.multiplier}x
              </motion.span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              style={{ marginTop: 20, fontSize: 18, fontWeight: 700, color: '#FFD700', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
            >
              🎰 SPIN & GO
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ SOUND CONTROLS ═══════════ */}
      <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 250 }}>
        <button
          onClick={() => setSoundEnabled(prev => !prev)}
          onContextMenu={(e) => { e.preventDefault(); setShowSoundPanel(p => !p); }}
          onDoubleClick={() => setShowSoundPanel(p => !p)}
          style={{
            background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '6px 10px', fontSize: 14, cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
          title="Tap: mute/unmute • Double-tap: volume"
        >
          {soundEnabled ? '🔊' : '🔇'}
        </button>
        {showSoundPanel && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '12px 14px', width: 180,
            backdropFilter: 'blur(20px)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#B0B3B8', marginBottom: 8, textTransform: 'uppercase' }}>Volume</div>
            <input
              type="range" min="0" max="100" step="5"
              value={Math.round(soundVolume * 100)}
              onChange={(e) => setSoundVolume(parseInt(e.target.value) / 100)}
              style={{ width: '100%', accentColor: '#2374E1', marginBottom: 6 }}
            />
            <div style={{ fontSize: 11, color: '#E4E6EB', textAlign: 'center' }}>{Math.round(soundVolume * 100)}%</div>
            <button
              onClick={() => setShowSoundPanel(false)}
              style={{ width: '100%', marginTop: 8, background: '#3E4042', color: '#E4E6EB', border: 'none', borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* ═══════════ ADMIN TABLE PANEL ═══════════ */}
      {isAdmin && (
        <button onClick={() => setShowAdminPanel(!showAdminPanel)} style={{
          position: 'fixed', top: 8, right: 52, zIndex: 250,
          background: showAdminPanel ? '#FA383E' : 'rgba(35,116,225,0.85)',
          color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          backdropFilter: 'blur(8px)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {showAdminPanel ? '✕ Close' : '⚙️ Admin'}
        </button>
      )}
      <AnimatePresence>
        {showAdminPanel && isAdmin && (
          <AdminTablePanel
            tableId={tableId}
            clubId={tableState?.clubId}
            tableState={tableState}
            seats={seats}
            userId={userId}
            userRole={userRole}
            send={send}
            onClose={() => setShowAdminPanel(false)}
            supabase={supabase}
          />
        )}
      </AnimatePresence>

      {/* ═══════════ PLAYER QUICK-VIEW STAT CARD ═══════════ */}
      <PlayerQuickView
        player={quickViewTarget}
        isOpen={!!quickViewTarget}
        onClose={() => setQuickViewTarget(null)}
        onOpenNotes={() => {
          const target = quickViewTarget;
          setQuickViewTarget(null);
          setNoteTarget({ id: target.id, displayName: target.displayName });
        }}
        note={quickViewTarget ? playerNotes[quickViewTarget.id] : null}
      />

      {/* ═══════════ PLAYER NOTES MODAL ═══════════ */}
      <PlayerNoteModal
        isOpen={!!noteTarget}
        onClose={() => {
          setNoteTarget(null);
          // Refresh notes after close
          if (userId && seats?.length) {
            const opIds = seats.filter(s => s.player?.id && String(s.player.id) !== String(userId)).map(s => s.player.id);
            if (opIds.length) {
              Promise.resolve({ access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token }).then((noteSession) => {
                fetch('/api/club-arena/player-notes', {
                  method: 'POST', headers: {
                    'Content-Type': 'application/json',
                    ...(noteSession?.access_token ? { Authorization: `Bearer ${noteSession.access_token}` } : {}),
                  },
                  body: JSON.stringify({ action: 'get_bulk', targetUserIds: opIds }),
                }).then(r => r.json()).then(r => { if (r.notes) setPlayerNotes(r.notes); }).catch(() => { });
              }).catch(() => { });
            }
          }
        }}
        player={noteTarget}
        initialNote={noteTarget ? playerNotes[noteTarget.id] : null}
      />

      {/* MYSTERY BOUNTY OVERLAY */}
      <AnimatePresence>
        {bountyReveal && (
          <MysteryBountyOverlay
            amount={bountyReveal.amount}
            onComplete={() => setBountyReveal(null)}
          />
        )}
      </AnimatePresence>

      {/* Global keyframes for table animations */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }
        @keyframes winGlow { 0% { filter: drop-shadow(0 0 8px #FFD700); } 100% { filter: drop-shadow(0 0 20px #FFD700) drop-shadow(0 0 40px rgba(255,215,0,0.4)); } }
        @keyframes yourTurnPulse { 0% { box-shadow: 0 4px 20px rgba(35,116,225,0.6); transform: translateX(-50%) scale(1); } 100% { box-shadow: 0 4px 30px rgba(99,102,241,0.9); transform: translateX(-50%) scale(1.05); } }
        @keyframes seatPulse { 0%, 100% { box-shadow: 0 0 12px rgba(35,116,225,0.3); } 50% { box-shadow: 0 0 28px rgba(35,116,225,0.7), 0 0 48px rgba(35,116,225,0.3); } }
        @keyframes cardSpotlight { 0% { filter: brightness(1); } 50% { filter: brightness(1.3) drop-shadow(0 0 12px rgba(255,215,0,0.6)); } 100% { filter: brightness(1); } }
      `}</style>
    </div>
  );
}

export default memo(LivePokerTable);
