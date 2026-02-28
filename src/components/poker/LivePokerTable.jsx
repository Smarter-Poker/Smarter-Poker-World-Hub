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
  seat, position, isHero, isCurrentActor, timerState, onClick, numHoleCards = 2,
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
              : isCurrentActor
                ? `3px solid ${T.accent}`
                : `2px solid ${T.railGoldDark}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: isCurrentActor ? `0 0 20px ${T.accent}40` : 'none',
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
        <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
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
      <motion.div
        key={potTotal}
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
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
            <div
              key={i}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION PANEL — Fold / Check / Call / Bet / Raise / All-In
// ═══════════════════════════════════════════════════════════════════════════

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

function BuyInDialog({ minBuyIn, maxBuyIn, bigBlind, onConfirm, onCancel }) {
  const [amount, setAmount] = useState(Math.floor((minBuyIn + maxBuyIn) / 2));

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
        <p style={{ color: T.textSecondary, fontSize: 13, marginBottom: 20 }}>
          Buy-in: {minBuyIn.toLocaleString()} – {maxBuyIn.toLocaleString()} chips
        </p>

        <div style={{ fontSize: 28, fontWeight: 800, color: T.textPrimary, marginBottom: 12, fontVariantNumeric: 'tabular-nums' }}>
          {amount.toLocaleString()}
        </div>

        <input
          type="range"
          min={minBuyIn}
          max={maxBuyIn}
          step={bigBlind}
          value={amount}
          onChange={(e) => setAmount(parseInt(e.target.value))}
          style={{ width: '100%', accentColor: T.accent, marginBottom: 20 }}
        />

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          {[minBuyIn, Math.floor((minBuyIn + maxBuyIn) / 2), maxBuyIn].map((v) => (
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
              {v === minBuyIn ? 'Min' : v === maxBuyIn ? 'Max' : 'Mid'}
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
            onClick={() => onConfirm(amount)}
            style={{
              flex: 1,
              background: `linear-gradient(135deg, ${T.callGreen}, #15803d)`,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '10px',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: `0 4px 15px ${T.callGreen}40`,
            }}
          >
            Sit Down
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

function TableInfoBar({ tableState, onSitOut, onSitIn, onStandUp, onAddChips, isSitting, isSittingOut }) {
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
          {tableState.tableId}
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

  // UI state
  const [buyInSeat, setBuyInSeat] = useState(null);

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
    send('player_action', { action });
  }, [send]);

  const handleSitDown = useCallback((amount) => {
    send('sit_down', { seatIndex: buyInSeat, buyIn: amount, displayName, avatarUrl });
    setBuyInSeat(null);
  }, [send, buyInSeat, displayName, avatarUrl]);

  const handleStandUp = useCallback(() => send('stand_up', {}), [send]);
  const handleSitOut = useCallback(() => send('sit_out', {}), [send]);
  const handleSitIn = useCallback(() => send('sit_in', {}), [send]);
  const handleChat = useCallback((message) => send('send_chat', { message }), [send]);
  const handleAddChips = useCallback(() => {
    const amount = prompt('Amount to add:');
    if (amount) send('add_chips', { amount: parseInt(amount) });
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
            numHoleCards={
              ({ holdem: 2, omaha4: 4, omaha5: 5, omaha6: 6, omaha_hilo: 4, short_deck: 2 })[
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

      {/* Chat */}
      <ChatOverlay messages={chatMessages} onSend={handleChat} />

      {/* Buy-in dialog */}
      <AnimatePresence>
        {buyInSeat !== null && (
          <BuyInDialog
            minBuyIn={tableState?.config?.minBuyIn || 40}
            maxBuyIn={tableState?.config?.maxBuyIn || 200}
            bigBlind={tableState?.config?.bigBlind || tableState?.bigBlind || 2}
            onConfirm={handleSitDown}
            onCancel={() => setBuyInSeat(null)}
          />
        )}
      </AnimatePresence>

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
