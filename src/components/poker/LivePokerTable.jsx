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
import ThrowableEmojis from './ThrowableEmojis';
import BBJTicker from './BBJTicker';
import { getHandStrength } from '../../lib/handStrength';

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════

import {
  TABLE_THEMES, getStoredThemeId, getStoredCardBack,
  getActiveTheme, setStoredThemeId, setStoredCardBack,
} from './TableThemes';
import ThemePicker from './ThemePicker';
import PlayerNoteModal, { COLOR_LABELS } from './PlayerNoteModal';

// Dynamic theme — updated when user changes theme, read by all sub-components
let T = getActiveTheme();

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
  const avatarSize = isHero ? 80 : 65;

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
        gap: 3,
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
          {isTimebank && (
            <div style={{
              position: 'absolute', top: -6, right: -6, background: '#FF9800',
              color: '#000', fontSize: 8, fontWeight: 900, padding: '1px 4px',
              borderRadius: 4, zIndex: 3, lineHeight: 1.2,
            }}>TB</div>
          )}
        )}

        <div
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: '50%',
            background: isEmpty
              ? 'rgba(255,255,255,0.05)'
              : `linear-gradient(135deg, ${T.railColor}, ${T.railColorDark})`,
            border: isEmpty
              ? '2px dashed rgba(255,255,255,0.2)'
              : isWinner
                ? '3px solid #FFD700'
                : isCurrentActor
                  ? `3px solid ${T.accent}`
                  : `2px solid ${T.railColorDark}`,
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

        {/* Note color dot indicator */}
        {noteColor && (
          <div style={{
            position: 'absolute', top: 0, left: 0, width: 10, height: 10,
            borderRadius: '50%', background: noteColor, border: '1px solid rgba(0,0,0,0.3)',
            zIndex: 5,
          }} />
        )}

        {/* Position badge (D / SB / BB / UTG) */}
        {posBadge && (
          <div style={{
            position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
            background: posBadge.bg, color: posBadge.color,
            fontSize: 8, fontWeight: 900, padding: '1px 5px', borderRadius: 6,
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

      {/* Name + Stack badge */}
      {!isEmpty && (
        <div
          style={{
            background: isCurrentActor
              ? `linear-gradient(135deg, ${T.railColor}, ${T.railColorDark})`
              : 'rgba(0,0,0,0.75)',
            color: isCurrentActor ? T.bgDark : T.textPrimary,
            padding: '2px 10px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 700,
            textAlign: 'center',
            minWidth: 60,
            border: `1px solid ${isCurrentActor ? T.railColor : 'rgba(255,255,255,0.1)'}`,
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
            <CardImg key={i} card={card} width={cardWidth} delay={i * 0.15} showdown={!isHero} />
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

function CommunityCards({ cards = [], boards }) {
  // Multi-board mode (double/triple board)
  if (boards && boards.length > 1 && boards.some(b => b.length > 0)) {
    return (
      <div style={{
        position: 'absolute', top: '35%', left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', gap: 8, zIndex: 15,
        alignItems: 'center',
      }}>
        {boards.map((board, bi) => (
          board.length > 0 && (
            <div key={`board-${bi}`} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{
                fontSize: 10, color: bi === 0 ? '#FFD700' : bi === 1 ? '#4fc3f7' : '#ce93d8',
                fontWeight: 700, marginRight: 4, minWidth: 12, textAlign: 'center',
              }}>{bi + 1}</span>
              {board.map((card, ci) => (
                <CardImg key={`b${bi}-c${ci}`} card={card} width={42} delay={ci * 0.1} />
              ))}
            </div>
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

function TableInfoBar({ tableState, onSitOut, onSitIn, onStandUp, onAddChips, isSitting, isSittingOut, straddleEnabled, straddleOn, onToggleStraddle, autoTopUpOn, onToggleAutoTopUp, lastHandResult, onShowLastHand, sessionStats, myStack }) {
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

        {/* Mixed game rotation indicator */}
        {tableState?.config?.mixedGame && tableState?.config?.variantRotation && (
          <span style={{ color: '#e1bee7', fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(156,39,176,0.2)', border: '1px solid rgba(156,39,176,0.3)' }}>
            🔄 {(tableState.config.currentVariantIndex || 0) + 1}/{tableState.config.variantRotation.length}
          </span>
        )}

        {/* Session P&L */}
        {isSitting && sessionStats?.initialBuyIn > 0 && (() => {
          const pnl = myStack - sessionStats.initialBuyIn - (sessionStats.totalAdded || 0);
          const color = pnl > 0 ? '#4caf50' : pnl < 0 ? '#ef5350' : T.textMuted;
          const hrs = sessionStats.sessionStart ? ((Date.now() - sessionStats.sessionStart) / 3600000).toFixed(1) : '0';
          return (
            <span style={{ color, fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.05)' }}>
              {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()} • {sessionStats.handsPlayed}h • {hrs}hr
            </span>
          );
        })()}

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
          {lastHandResult && <SmallButton label="📋 Last Hand" onClick={onShowLastHand} />}
          <SmallButton
            label={autoTopUpOn ? '✓ Top Up' : 'Top Up'}
            onClick={onToggleAutoTopUp}
            color={autoTopUpOn ? '#34C759' : undefined}
          />
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
            <div style={{ color: T.textSecondary, fontSize: 12 }}>{w.handDescription}</div>
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
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { send('show_cards', {}); setCardsShown(true); }}
          style={{
            marginTop: 8, padding: '6px 16px', background: 'rgba(33,150,243,0.3)',
            border: '1px solid #2196F3', borderRadius: 8, color: '#fff',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          👁️ Show Cards
        </motion.button>
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
    chatMessages, result, lastHandResult, error, connected, send,
    sessionStats, tableAlert,
  } = useTableConnection({ supabase, tableId, userId });

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
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('poker-sound-enabled');
      return stored !== 'false'; // default true
    }
    return true;
  });
  if (!soundRef.current && typeof window !== 'undefined') {
    soundRef.current = new PokerSoundManager();
  }
  // Sync mute state
  useEffect(() => {
    if (soundRef.current) soundRef.current.muted = !soundEnabled;
    if (typeof window !== 'undefined') localStorage.setItem('poker-sound-enabled', String(soundEnabled));
  }, [soundEnabled]);

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
  const [noteTarget, setNoteTarget] = useState(null); // { id, displayName } for notes modal
  const [playerNotes, setPlayerNotes] = useState({}); // { targetUserId: { color_label, player_type, ... } }

  // Load player notes for all seated opponents
  useEffect(() => {
    if (!userId || !seats?.length) return;
    const opponentIds = seats
      .filter(s => s.player?.id && String(s.player.id) !== String(userId))
      .map(s => s.player.id);
    if (opponentIds.length === 0) return;

    fetch('/api/club-arena/player-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_bulk', userId, targetUserIds: opponentIds }),
    })
      .then(r => r.json())
      .then(r => { if (r.notes) setPlayerNotes(r.notes); })
      .catch(() => {});
  }, [userId, seats?.map(s => s.player?.id).join(',')]);

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
  const [preAction, setPreAction] = useState(null); // 'fold' | 'check_fold' | 'check' | 'call_any' | null
  const [showLastHand, setShowLastHand] = useState(false);

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

  const handleStandUp = useCallback(() => send('stand_up', {}), [send]);
  const handleSitOut = useCallback(() => send('sit_out', {}), [send]);
  const handleSitIn = useCallback(() => send('sit_in', {}), [send]);
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
            background: `linear-gradient(135deg, ${T.railColor}, ${T.railColorDark}, ${T.railColor})`,
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
            {/* BBJ Ticker */}
            {tableState?.config?.bbjEnabled && tableState?.clubId && (
              <BBJTicker
                clubId={tableState.clubId}
                variant="table"
                bbjWonEvent={result?.bbj || null}
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
          </div>
        </div>

        {/* Seats */}
        {seats.map((seat, i) => {
          const pid = seat.player?.id;
          const noteData = pid && String(pid) !== String(userId) ? playerNotes[pid] : null;
          const noteColorVal = noteData?.color_label && noteData.color_label !== 'none'
            ? COLOR_LABELS.find(c => c.value === noteData.color_label)?.color
            : null;
          // Poker position from game state (btn, sb, bb, utg, mp)
          const gamePlayer = tableState?.game?.players?.find(p => String(p.id) === String(pid));
          const gamePosition = gamePlayer?.position || null;
          // Button seat fallback
          const isButton = tableState?.game?.buttonSeat === i;
          return (
          <PlayerSeat
            key={i}
            seat={seat}
            position={positions[i] || positions[0]}
            isHero={seat.player?.id === userId}
            isCurrentActor={seat.isCurrentActor}
            timerState={seat.isCurrentActor ? timerState : null}
            onClick={() => setBuyInSeat(i)}
            onNote={pid && String(pid) !== String(userId) ? () => setNoteTarget({ id: pid, displayName: seat.player?.displayName }) : undefined}
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
        lastHandResult={lastHandResult}
        onShowLastHand={() => setShowLastHand(true)}
        sessionStats={sessionStats}
        myStack={mySeat?.stack || 0}
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

      {/* ═══════════ ADMIN TABLE PANEL ═══════════ */}
      {isAdmin && (
        <button onClick={() => setShowAdminPanel(!showAdminPanel)} style={{
          position: 'fixed', top: 8, right: 48, zIndex: 250,
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

      {/* ═══════════ PLAYER NOTES MODAL ═══════════ */}
      <PlayerNoteModal
        isOpen={!!noteTarget}
        onClose={() => {
          setNoteTarget(null);
          // Refresh notes after close
          if (userId && seats?.length) {
            const opIds = seats.filter(s => s.player?.id && String(s.player.id) !== String(userId)).map(s => s.player.id);
            if (opIds.length) {
              fetch('/api/club-arena/player-notes', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'get_bulk', userId, targetUserIds: opIds }),
              }).then(r => r.json()).then(r => { if (r.notes) setPlayerNotes(r.notes); }).catch(() => {});
            }
          }
        }}
        userId={userId}
        targetPlayer={noteTarget}
      />
    </div>
  );
}
