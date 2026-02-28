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

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTableConnection } from '../../hooks/useTableConnection';
import { PokerSoundManager } from './PokerSoundManager';
import EmojiThrower from './EmojiThrower';

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════

const T = {
  // Table
  feltDark: '#0c1a0e',
  feltGrad1: '#0a1f0d',
  feltGrad2: '#0f2912',
  railGold: '#FFD700',
  railGoldDark: '#B8860B',
  edgeGlow: 'rgba(255,215,0,0.15)',

  // UI
  bgDark: '#050505',
  bgCard: '#0e0e12',
  bgPanel: '#111116',
  accent: '#FFD700',
  accentDim: '#B8860B',
  textPrimary: '#f0f0f0',
  textSecondary: '#8a8a9a',
  textMuted: '#555566',

  // Actions
  foldRed: '#dc2626',
  checkBlue: '#2563eb',
  callGreen: '#16a34a',
  betOrange: '#ea580c',
  raiseYellow: '#eab308',
  allInPurple: '#9333ea',

  // Status
  timerWarning: '#ef4444',
  timerNormal: '#22c55e',
  disconnected: '#6b7280',
  sittingOut: '#4b5563',
};

// ═══════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS — 2 to 10 seats (percentages of table container)
// ═══════════════════════════════════════════════════════════════════════════

const SEAT_LAYOUTS = {
  2: [
    { x: 50, y: 88 },  // Hero (bottom)
    { x: 50, y: 8 },   // Opponent (top)
  ],
  3: [
    { x: 50, y: 88 },
    { x: 15, y: 30 },
    { x: 85, y: 30 },
  ],
  4: [
    { x: 50, y: 88 },
    { x: 8, y: 50 },
    { x: 50, y: 8 },
    { x: 92, y: 50 },
  ],
  5: [
    { x: 50, y: 88 },
    { x: 10, y: 60 },
    { x: 25, y: 10 },
    { x: 75, y: 10 },
    { x: 90, y: 60 },
  ],
  6: [
    { x: 50, y: 88 },  // Bottom center (hero default)
    { x: 12, y: 65 },  // Left lower
    { x: 8, y: 32 },   // Left upper
    { x: 40, y: 6 },   // Top left
    { x: 60, y: 6 },   // Top right
    { x: 88, y: 32 },  // Right upper
  ],
  7: [
    { x: 50, y: 88 },
    { x: 14, y: 72 },
    { x: 6, y: 42 },
    { x: 25, y: 8 },
    { x: 75, y: 8 },
    { x: 94, y: 42 },
    { x: 86, y: 72 },
  ],
  8: [
    { x: 50, y: 88 },
    { x: 18, y: 76 },
    { x: 6, y: 48 },
    { x: 18, y: 18 },
    { x: 50, y: 6 },
    { x: 82, y: 18 },
    { x: 94, y: 48 },
    { x: 82, y: 76 },
  ],
  9: [
    { x: 50, y: 88 },
    { x: 20, y: 76 },
    { x: 6, y: 50 },
    { x: 18, y: 22 },
    { x: 38, y: 6 },
    { x: 62, y: 6 },
    { x: 82, y: 22 },
    { x: 94, y: 50 },
    { x: 80, y: 76 },
  ],
  10: [
    { x: 50, y: 88 },
    { x: 22, y: 78 },
    { x: 6, y: 55 },
    { x: 10, y: 28 },
    { x: 30, y: 6 },
    { x: 50, y: 3 },
    { x: 70, y: 6 },
    { x: 90, y: 28 },
    { x: 94, y: 55 },
    { x: 78, y: 78 },
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

function CardImg({ card, width = 48, faceDown = false, style = {}, delay = 0 }) {
  const height = Math.round(width * 1.4);
  const src = faceDown ? '/images/card-backs/blue.jpg' : cardIntToPath(card);

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
  seat, position, isHero, isCurrentActor, timerState, onClick, numHoleCards = 2, isWinner = false, equity = null,
}) {
  const { status, player, stack, holeCards, isFolded, invested } = seat;
  const isEmpty = status === 'empty' || status === 'reserved';
  const isSittingOut = status === 'sitting_out';
  const isDisconnected = status === 'disconnected';
  const avatarSize = isHero ? 80 : 65;

  // Dynamic card width: scale down for Omaha variants
  const cardWidth = isHero
    ? (numHoleCards <= 2 ? 52 : numHoleCards <= 4 ? 40 : 34)
    : (numHoleCards <= 2 ? 36 : numHoleCards <= 4 ? 28 : 24);
  const faceDownWidth = numHoleCards <= 2 ? 28 : numHoleCards <= 4 ? 22 : 18;

  // Timer ring
  const showTimer = isCurrentActor && timerState;
  const timerPct = showTimer ? (timerState.remaining / 30) * 100 : 0;
  const timerColor = showTimer && timerState.remaining <= 10 ? T.timerWarning : T.timerNormal;

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
        gap: 3,
        cursor: isEmpty ? 'pointer' : 'default',
        zIndex: isCurrentActor ? 20 : 10,
        opacity: isFolded ? 0.4 : 1,
        transition: 'opacity 0.3s',
      }}
      onClick={() => isEmpty && onClick?.()}
    >
      {/* Invested chips */}
      {invested > 0 && !isFolded && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          style={{
            position: 'absolute',
            top: isHero ? -30 : 'auto',
            bottom: isHero ? 'auto' : -26,
            background: 'rgba(0,0,0,0.7)',
            color: T.accent,
            fontSize: 12,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
            border: `1px solid ${T.accentDim}`,
            whiteSpace: 'nowrap',
          }}
        >
          {invested}
        </motion.div>
      )}

      {/* Avatar + Timer ring */}
      <div style={{ position: 'relative' }}>
        {showTimer && (
          <svg
            width={avatarSize + 10}
            height={avatarSize + 10}
            style={{
              position: 'absolute',
              top: -5, left: -5,
              transform: 'rotate(-90deg)',
            }}
          >
            <circle
              cx={(avatarSize + 10) / 2}
              cy={(avatarSize + 10) / 2}
              r={(avatarSize + 6) / 2}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={3}
            />
            <circle
              cx={(avatarSize + 10) / 2}
              cy={(avatarSize + 10) / 2}
              r={(avatarSize + 6) / 2}
              fill="none"
              stroke={timerColor}
              strokeWidth={3}
              strokeDasharray={Math.PI * (avatarSize + 6)}
              strokeDashoffset={Math.PI * (avatarSize + 6) * (1 - timerPct / 100)}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
            />
          </svg>
        )}

        <div
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: '50%',
            background: isEmpty
              ? 'rgba(255,255,255,0.05)'
              : `linear-gradient(135deg, ${T.railGold}, ${T.railGoldDark})`,
            border: isEmpty
              ? '2px dashed rgba(255,255,255,0.2)'
              : isWinner
                ? '3px solid #FFD700'
                : isCurrentActor
                  ? `3px solid ${T.accent}`
                  : `2px solid ${T.railGoldDark}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: isWinner ? '0 0 20px rgba(255,215,0,0.6), 0 0 40px rgba(255,215,0,0.2)' : isCurrentActor ? `0 0 20px ${T.accent}40` : 'none',
            filter: isDisconnected ? 'grayscale(1)' : isSittingOut ? 'brightness(0.5)' : 'none',
          }}
        >
          {isEmpty ? (
            <span style={{ fontSize: 24, color: 'rgba(255,255,255,0.3)' }}>+</span>
          ) : player?.avatarUrl ? (
            <img
              src={player.avatarUrl}
              alt={player.displayName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: 20, fontWeight: 700, color: T.bgDark }}>
              {(player?.displayName || '?')[0].toUpperCase()}
            </span>
          )}
        </div>
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

      {/* Name + Stack badge */}
      {!isEmpty && (
        <div
          style={{
            background: isCurrentActor
              ? `linear-gradient(135deg, ${T.railGold}, ${T.railGoldDark})`
              : 'rgba(0,0,0,0.75)',
            color: isCurrentActor ? T.bgDark : T.textPrimary,
            padding: '2px 10px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 700,
            textAlign: 'center',
            minWidth: 60,
            border: `1px solid ${isCurrentActor ? T.railGold : 'rgba(255,255,255,0.1)'}`,
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontSize: 10, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80, whiteSpace: 'nowrap' }}>
            {player?.displayName || 'Player'}
            {isSittingOut && ' 💤'}
            {isDisconnected && ' 📡'}
          </div>
          <div style={{ fontSize: 13 }}>{stack.toLocaleString()}</div>
        </div>
      )}

      {/* Hole cards (hero or showdown) */}
      {holeCards && holeCards.length > 0 && (
        <div style={{
          display: 'flex', gap: 3, marginTop: 2,
          ...(isWinner ? {
            filter: 'drop-shadow(0 0 8px #FFD700) drop-shadow(0 0 16px rgba(255,215,0,0.4))',
            animation: 'winGlow 1.2s ease-in-out infinite alternate',
          } : {}),
        }}>
          {holeCards.map((card, i) => (
            <CardImg key={i} card={card} width={cardWidth} delay={i * 0.15} />
          ))}
        </div>
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

function CommunityCards({ cards = [] }) {
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
      {cards.map((card, i) => (
        <CardImg key={`cc-${i}`} card={card} width={52} delay={i * 0.12} />
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

  if (!actions || actions.length === 0) return null;

  const canFold = actions.some(a => a.type === 'fold');
  const canCheck = actions.some(a => a.type === 'check');
  const canCall = actions.find(a => a.type === 'call');
  const canBet = actions.find(a => a.type === 'bet');
  const canRaise = actions.find(a => a.type === 'raise');
  const canAllIn = actions.some(a => a.type === 'all_in');
  const betOrRaise = canBet || canRaise;

  const minBet = betOrRaise?.minAmount || bigBlind;
  const maxBet = betOrRaise?.maxAmount || stack;

  // Reset bet when actions change
  useEffect(() => {
    setBetAmount(minBet);
    setShowSlider(false);
  }, [actions, minBet]);

  const presets = betOrRaise ? [
    { label: '½ Pot', amount: Math.max(minBet, Math.floor((potTotal || bigBlind * 2) * 0.5)) },
    { label: '¾ Pot', amount: Math.max(minBet, Math.floor((potTotal || bigBlind * 2) * 0.75)) },
    { label: 'Pot', amount: Math.max(minBet, potTotal || bigBlind * 2) },
  ].filter(p => p.amount <= maxBet) : [];

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

        {canCall && (
          <ActionButton
            label={`Call ${canCall.amount?.toLocaleString() || ''}`}
            color={T.callGreen}
            onClick={() => onAction({ type: 'call' })}
          />
        )}

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

function ActionButton({ label, color, onClick }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        background: `linear-gradient(135deg, ${color}, ${color}cc)`,
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '10px 22px',
        fontSize: 14,
        fontWeight: 800,
        cursor: 'pointer',
        boxShadow: `0 4px 15px ${color}40`,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        minWidth: 80,
        textAlign: 'center',
      }}
    >
      {label}
    </motion.button>
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
  const listRef = useRef(null);

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
                  <span style={{ color: T.accent, fontWeight: 700 }}>{m.displayName}: </span>
                  <span style={{ color: T.textPrimary }}>{m.message}</span>
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE INFO BAR
// ═══════════════════════════════════════════════════════════════════════════

function TableInfoBar({ tableState, onSitOut, onSitIn, onStandUp, onAddChips, isSitting, isSittingOut, straddleEnabled, straddleOn, onToggleStraddle }) {
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
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 16px',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        zIndex: 30,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: T.accent, fontWeight: 800, fontSize: 14 }}>
          {tableState?.config?.tableName || tableState.tableId?.slice(0, 8)}
        </span>
        <span style={{
          color: '#fff', fontSize: 11, fontWeight: 700,
          padding: '2px 8px', borderRadius: 4,
          background: ({
            holdem: '#22c55e', omaha4: '#f59e0b', omaha5: '#e67e22',
            omaha6: '#e74c3c', omaha_hilo: '#ef4444', short_deck: '#8b5cf6',
          })[tableState?.config?.variant] || '#22c55e',
        }}>
          {({
            holdem: 'NLH', omaha4: 'PLO4', omaha5: 'PLO5', omaha6: 'PLO6',
            omaha_hilo: 'PLO8', short_deck: '6+',
          })[tableState?.config?.variant] || 'NLH'}
        </span>
        <span style={{ color: T.textSecondary, fontSize: 12, fontWeight: 600 }}>
          {tableState?.config?.smallBlind || 1}/{tableState?.config?.bigBlind || 2}
        </span>
        <span style={{ color: T.textMuted, fontSize: 12 }}>
          Hand #{game?.handNumber || 0}
        </span>
        <span style={{
          color: game?.phase === 'idle' ? T.textMuted : T.callGreen,
          fontSize: 11,
          padding: '2px 6px',
          borderRadius: 4,
          background: 'rgba(255,255,255,0.05)',
        }}>
          {game?.phase?.toUpperCase() || 'WAITING'}
        </span>
      </div>

      {isSitting && (
        <div style={{ display: 'flex', gap: 6 }}>
          <SmallButton
            label={isSittingOut ? 'Sit In' : 'Sit Out'}
            onClick={isSittingOut ? onSitIn : onSitOut}
          />
          {straddleEnabled && (
            <SmallButton
              label={straddleOn ? '✓ Straddle' : 'Straddle'}
              onClick={onToggleStraddle}
              color={straddleOn ? '#4ECDC4' : undefined}
            />
          )}
          <SmallButton label="Add Chips" onClick={onAddChips} />
          <SmallButton label="Leave" onClick={onStandUp} color={T.foldRed} />
        </div>
      )}
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
  if (!offer || !offer.playerIds?.includes(userId)) return null;
  const [responded, setResponded] = useState(false);
  const [countdown, setCountdown] = useState(offer.deadline || 15);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

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

function ResultOverlay({ result }) {
  if (!result) return null;

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
      }}
    >
      {result.winners?.map((w, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ color: T.accent, fontSize: 16, fontWeight: 800 }}>
            {w.displayName || w.playerId} wins {w.amount?.toLocaleString()}
          </div>
          {w.handDescription && (
            <div style={{ color: T.textSecondary, fontSize: 12 }}>{w.handDescription}</div>
          )}
        </div>
      ))}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: LivePokerTable
// ═══════════════════════════════════════════════════════════════════════════

export default function LivePokerTable({
  tableId,
  supabase,
  userId,
  displayName = 'Player',
  avatarUrl = null,
}) {
  // Connection via hook
  const {
    tableState, myCards, legalActions, timerState,
    chatMessages, result, error, connected, send,
  } = useTableConnection({ supabase, tableId, userId });

  // Sound manager
  const soundRef = useRef(null);
  if (!soundRef.current && typeof window !== 'undefined') {
    soundRef.current = new PokerSoundManager();
  }

  // Sound triggers based on game events
  const prevPhaseRef = useRef(null);
  const prevResultRef = useRef(null);
  useEffect(() => {
    const sm = soundRef.current;
    if (!sm || !tableState?.game) return;
    const phase = tableState.game.phase;
    const prev = prevPhaseRef.current;
    if (prev !== phase) {
      if (phase === 'preflop' && prev === 'idle') sm.play('deal');
      if (phase === 'flop' && prev === 'preflop') sm.play('deal');
      if (phase === 'turn' && prev === 'flop') sm.play('deal');
      if (phase === 'river' && prev === 'turn') sm.play('deal');
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
  const [clubChipBalance, setClubChipBalance] = useState(null);

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
          .single();
        setClubChipBalance(data?.chip_balance || 0);
      } catch (e) {
        console.warn('[LivePokerTable] Failed to fetch chip balance:', e);
        setClubChipBalance(null);
      }
    })();
  }, [buyInSeat, tableState?.clubId, userId, supabase]);

  // Derived state
  const isSitting = tableState?.seats.some(
    s => s.player?.id === userId && s.status !== 'empty'
  );
  const isSittingOut = tableState?.seats.some(
    s => s.player?.id === userId && s.status === 'sitting_out'
  );
  const mySeat = tableState?.seats.find(s => s.player?.id === userId);
  const isMyTurn = tableState?.game?.currentPlayerId === userId;
  const maxSeats = tableState?.maxSeats || 9;
  const positions = useMemo(() => getSeatPositions(maxSeats), [maxSeats]);

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
    send('player_action', { action });
  }, [send]);

  const handleSitDown = useCallback((amount) => {
    send('sit_down', { seatIndex: buyInSeat, buyIn: amount, displayName, avatarUrl });
    setBuyInSeat(null);
  }, [send, buyInSeat, displayName, avatarUrl]);

  const handleStandUp = useCallback(() => send('stand_up', {}), [send]);
  const handleSitOut = useCallback(() => send('sit_out', {}), [send]);
  const handleSitIn = useCallback(() => send('sit_in', {}), [send]);
  const [straddleOn, setStraddleOn] = useState(false);
  const handleToggleStraddle = useCallback(() => {
    const newVal = !straddleOn;
    setStraddleOn(newVal);
    send(newVal ? 'declare_straddle' : 'cancel_straddle', {});
  }, [send, straddleOn]);
  const handleChat = useCallback((message) => {
    soundRef.current?.play('chat');
    send('send_chat', { message });
  }, [send]);
  const handleAddChips = useCallback(() => {
    const amount = prompt('Amount to add:');
    if (amount) send('add_chips', { amount: parseInt(amount) });
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
      holeCards: seat.player?.id === userId ? myCards : seat.holeCards,
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
      {/* Table surface */}
      <div
        style={{
          position: 'absolute',
          top: '8%',
          left: '5%',
          right: '5%',
          bottom: '12%',
        }}
      >
        {/* Outer glow */}
        <div
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, transparent 60%, ${T.edgeGlow} 100%)`,
          }}
        />

        {/* Gold rail */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${T.railGold}, ${T.railGoldDark}, ${T.railGold})`,
            padding: 5,
          }}
        >
          {/* Inner rail */}
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: `linear-gradient(180deg, ${T.feltGrad1}, ${T.feltGrad2})`,
              position: 'relative',
              boxShadow: 'inset 0 0 80px rgba(0,0,0,0.5)',
            }}
          >
            {/* Community cards */}
            <CommunityCards cards={tableState?.game?.communityCards || []} />

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
              {result && <ResultOverlay result={result} />}
            </AnimatePresence>
          </div>
        </div>

        {/* Seats */}
        {seats.map((seat, i) => (
          <PlayerSeat
            key={i}
            seat={seat}
            position={positions[i] || positions[0]}
            isHero={seat.player?.id === userId}
            isCurrentActor={seat.isCurrentActor}
            timerState={seat.isCurrentActor ? timerState : null}
            onClick={() => setBuyInSeat(i)}
            isWinner={result?.winners?.some(w => String(w.playerId) === String(seat.player?.id))}
            equity={result?.allInEquity?.players?.find(p => String(p.id) === String(seat.player?.id))?.equity ?? null}
            numHoleCards={
              ({ holdem: 2, omaha4: 4, omaha5: 5, omaha6: 6, omaha_hilo: 4, short_deck: 2, pineapple: 3 })[
              tableState?.config?.variant
              ] || 2
            }
          />
        ))}
      </div>

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
      />

      {/* Action panel (when it's hero's turn) */}
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
      </AnimatePresence>

      {/* Pineapple discard panel */}
      <AnimatePresence>
        {tableState?.game?.phase === 'discard' && myCards && myCards.length === 3 && (
          <DiscardPanel cards={myCards} onDiscard={handleDiscard} />
        )}
      </AnimatePresence>

      {/* Chat */}
      <ChatOverlay messages={chatMessages} onSend={handleChat} />

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

      {/* ═══════════ BBJ TICKER (top of table) ═══════════ */}
      {tableState?.bbjPool > 0 && (
        <div style={{
          position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(90deg, rgba(255,215,0,0.15), rgba(255,215,0,0.25), rgba(255,215,0,0.15))',
          border: '1px solid rgba(255,215,0,0.4)',
          borderRadius: 20, padding: '3px 16px', zIndex: 55,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 12 }}>🎰</span>
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
              <div style={{ fontSize: 48, marginBottom: 8 }}>🎰💰🎰</div>
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

      {/* ═══════════ EMOJI THROWER ═══════════ */}
      <EmojiThrower
        userId={userId}
        seats={seats}
        seatPositions={positions}
        chatMessages={chatMessages}
        onThrow={(emoji, targetId) => {
          soundRef.current?.play('chat');
          send('throw_emoji', { emoji, targetId });
        }}
      />

      {/* ═══════════ INSURANCE OFFER OVERLAY ═══════════ */}
      <AnimatePresence>
        {result?.insuranceOffer && result.insuranceOffer.leaderId === userId && (
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
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: '#FFD700', fontWeight: 700 }}>
                🃏 Run It {result.runItMultiple.numBoards === 2 ? 'Twice' : 'Three Times'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {(result.runItMultiple.boards || []).map((b, i) => (
                <div key={i} style={{
                  background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: '8px 12px',
                  border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', minWidth: 80,
                }}>
                  <div style={{ color: '#B0B3B8', fontSize: 10, marginBottom: 4 }}>Board {b.boardIndex}</div>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 4 }}>
                    {(b.cards || []).slice(-5).map((card, ci) => (
                      <span key={ci} style={{
                        display: 'inline-block', background: '#fff', color: card?.includes('h') || card?.includes('d') ? '#e53935' : '#000',
                        borderRadius: 3, padding: '1px 3px', fontSize: 10, fontWeight: 700,
                        border: '1px solid #ddd',
                      }}>
                        {typeof card === 'string' ? card : card?.display || '?'}
                      </span>
                    ))}
                  </div>
                  <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 700 }}>
                    {(b.payout || 0).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ SOUND TOGGLE ═══════════ */}
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
    </div>
  );
}
