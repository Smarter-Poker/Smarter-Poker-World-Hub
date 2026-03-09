/**
 * EmojiThrower — Interactive emoji throwing system for live poker
 * ═══════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Quick emoji picker (tap to open, tap emoji to throw)
 * - Throw animation: emoji flies from sender to target player
 * - Floating emoji display on target player's avatar
 * - Emoji categories: reactions, objects, animals, food
 * - Cooldown to prevent spam (1 throw per 3 seconds)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════
// EMOJI CATALOG — organized by category
// ═══════════════════════════════════════════════════════════════

const EMOJI_CATALOG = {
  reactions: ['😂', '😭', '🤣', '😎', '🤔', '😡', '🥶', '🤯', '😱', '🫠', '💀', '🤡'],
  taunts: ['👋', '👎', '🖕', '💩', '🐟', '🐑', '🤏', '🫵', '👀', '🧠', '💤', '🪦'],
  praise: ['👏', '🔥', '💪', '🏆', '⭐', '💎', '🎯', '🫡', '🤝', '❤️', '👑', '🦁'],
  objects: ['💰', '💸', '🃏', '🃏', '♠️', '♥️', '♦️', '♣️', '🍀', '🎲', '🎪', '🚀'],
};

const CATEGORY_LABELS = {
  reactions: '😂 Reactions',
  taunts: '👋 Taunts',
  praise: '🔥 Praise',
  objects: '🃏 Objects',
};

// ═══════════════════════════════════════════════════════════════
// EMOJI PICKER — floating panel with categories
// ═══════════════════════════════════════════════════════════════

function EmojiPicker({ onSelect, onClose }) {
  const [category, setCategory] = useState('reactions');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'absolute',
        bottom: 50,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(36,37,38,0.97)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 14,
        padding: 10,
        zIndex: 80,
        width: 280,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, overflowX: 'auto' }}>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: 'none',
              background: category === key ? '#1877F2' : 'rgba(255,255,255,0.08)',
              color: category === key ? '#fff' : '#B0B3B8',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 4,
      }}>
        {EMOJI_CATALOG[category].map(emoji => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            style={{
              background: 'none',
              border: '1px solid transparent',
              borderRadius: 8,
              fontSize: 22,
              padding: 4,
              cursor: 'pointer',
              transition: 'all 0.1s',
            }}
            onMouseEnter={e => {
              e.target.style.background = 'rgba(255,255,255,0.1)';
              e.target.style.borderColor = 'rgba(255,255,255,0.2)';
              e.target.style.transform = 'scale(1.15)';
            }}
            onMouseLeave={e => {
              e.target.style.background = 'none';
              e.target.style.borderColor = 'transparent';
              e.target.style.transform = 'scale(1)';
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Close hint */}
      <div style={{
        textAlign: 'center', fontSize: 10, color: '#65676B',
        marginTop: 6, paddingTop: 6,
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        Tap a player to target, or throw to table
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FLYING EMOJI — animated emoji that flies from sender to target
// ═══════════════════════════════════════════════════════════════

function FlyingEmoji({ emoji, fromPos, toPos, onComplete }) {
  return (
    <motion.div
      initial={{
        x: fromPos?.x || 0,
        y: fromPos?.y || 0,
        scale: 0.5,
        opacity: 1,
      }}
      animate={{
        x: toPos?.x || 0,
        y: toPos?.y || 0,
        scale: [0.5, 1.8, 1.2],
        opacity: [1, 1, 1],
      }}
      exit={{ scale: 2.5, opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
      onAnimationComplete={onComplete}
      style={{
        position: 'absolute',
        fontSize: 36,
        zIndex: 90,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))',
      }}
    >
      {emoji}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FLOATING EMOJI — sits on target player for a few seconds
// ═══════════════════════════════════════════════════════════════

export function FloatingEmoji({ emoji }) {
  if (!emoji) return null;

  return (
    <motion.div
      initial={{ scale: 0, y: 10 }}
      animate={{ scale: 1, y: -30 }}
      exit={{ scale: 0, opacity: 0, y: -50 }}
      transition={{ type: 'spring', stiffness: 200 }}
      style={{
        position: 'absolute',
        top: -10,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 28,
        zIndex: 70,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))',
      }}
    >
      {emoji}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT — EmojiThrower manages state + integrates with table
// ═══════════════════════════════════════════════════════════════

export default function EmojiThrower({
  userId,
  seats,
  seatPositions,
  onThrow,       // (emoji, targetId) => void — calls send('throw_emoji', ...)
  chatMessages,  // to receive incoming emoji events
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(null);
  const [targetMode, setTargetMode] = useState(false);
  const [flyingEmojis, setFlyingEmojis] = useState([]);
  const [seatEmojis, setSeatEmojis] = useState({}); // { seatIndex: { emoji, timestamp } }
  const lastThrowRef = useRef(0);
  const COOLDOWN_MS = 3000;

  // Process incoming emoji events from chat messages
  useEffect(() => {
    if (!chatMessages || chatMessages.length === 0) return;
    const last = chatMessages[chatMessages.length - 1];
    if (last?.type !== 'emoji') return;

    // Find target seat
    const targetSeat = seats?.find(s => s.player?.id === last.targetId);
    const fromSeat = seats?.find(s => s.player?.id === last.fromId);

    if (targetSeat) {
      const targetIdx = targetSeat.seatIndex;
      setSeatEmojis(prev => ({
        ...prev,
        [targetIdx]: { emoji: last.emoji, timestamp: Date.now() },
      }));

      // Auto-clear after 4 seconds
      setTimeout(() => {
        setSeatEmojis(prev => {
          const next = { ...prev };
          if (next[targetIdx]?.timestamp === last.timestamp) {
            delete next[targetIdx];
          }
          return next;
        });
      }, 4000);
    }

    // Create flying animation if we have positions
    if (fromSeat && targetSeat && seatPositions) {
      const fromPos = seatPositions[fromSeat.seatIndex];
      const toPos = seatPositions[targetSeat.seatIndex];
      if (fromPos && toPos) {
        const id = `fly-${Date.now()}`;
        setFlyingEmojis(prev => [...prev, { id, emoji: last.emoji, fromPos, toPos }]);
        setTimeout(() => {
          setFlyingEmojis(prev => prev.filter(f => f.id !== id));
        }, 800);
      }
    }
  }, [chatMessages, seats, seatPositions]);

  // Handle emoji selection from picker
  const handleEmojiSelect = useCallback((emoji) => {
    const now = Date.now();
    if (now - lastThrowRef.current < COOLDOWN_MS) return; // cooldown

    setSelectedEmoji(emoji);
    setPickerOpen(false);
    setTargetMode(true);
  }, []);

  // Handle targeting a player seat
  const handleTargetSeat = useCallback((seatIndex) => {
    if (!targetMode || !selectedEmoji) return;

    const target = seats?.[seatIndex];
    if (!target?.player || target.player.id === userId) return;

    lastThrowRef.current = Date.now();
    onThrow?.(selectedEmoji, target.player.id);
    setTargetMode(false);
    setSelectedEmoji(null);
  }, [targetMode, selectedEmoji, seats, userId, onThrow]);

  // Quick throw to entire table (no specific target)
  const handleTableThrow = useCallback(() => {
    if (!selectedEmoji) return;

    const now = Date.now();
    if (now - lastThrowRef.current < COOLDOWN_MS) return;

    lastThrowRef.current = Date.now();
    onThrow?.(selectedEmoji, null);
    setTargetMode(false);
    setSelectedEmoji(null);
  }, [selectedEmoji, onThrow]);

  return (
    <>
      {/* Emoji trigger button */}
      <button
        onClick={() => {
          if (targetMode) {
            setTargetMode(false);
            setSelectedEmoji(null);
          } else {
            setPickerOpen(!pickerOpen);
          }
        }}
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          zIndex: 55,
          background: targetMode ? 'rgba(24,119,242,0.6)' : 'rgba(0,0,0,0.5)',
          border: `1px solid ${targetMode ? '#1877F2' : 'rgba(255,255,255,0.2)'}`,
          color: '#fff',
          borderRadius: 20,
          padding: '4px 10px',
          fontSize: 11,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {targetMode ? `🎯 Throw ${selectedEmoji}` : '😊 Emoji'}
      </button>

      {/* Picker */}
      <AnimatePresence>
        {pickerOpen && (
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Target mode overlay hint */}
      <AnimatePresence>
        {targetMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(24,119,242,0.9)',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              zIndex: 75,
              cursor: 'pointer',
            }}
            onClick={handleTableThrow}
          >
            🎯 Tap a player to throw {selectedEmoji} — or tap here for table
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flying emoji animations */}
      <AnimatePresence>
        {flyingEmojis.map(f => (
          <FlyingEmoji
            key={f.id}
            emoji={f.emoji}
            fromPos={f.fromPos}
            toPos={f.toPos}
            onComplete={() => setFlyingEmojis(prev => prev.filter(x => x.id !== f.id))}
          />
        ))}
      </AnimatePresence>

      {/* Floating emojis on seats — exported for LivePokerTable to use */}
      {Object.entries(seatEmojis).map(([idx, data]) => {
        const pos = seatPositions?.[idx];
        if (!pos) return null;
        return (
          <AnimatePresence key={`seat-emoji-${idx}`}>
            <motion.div
              initial={{ scale: 0, y: 10 }}
              animate={{ scale: 1, y: -35 }}
              exit={{ scale: 0, opacity: 0, y: -50 }}
              style={{
                position: 'absolute',
                left: `${pos.x || 50}%`,
                top: `${(pos.y || 50) - 5}%`,
                transform: 'translate(-50%, -50%)',
                fontSize: 32,
                zIndex: 70,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))',
              }}
            >
              {data.emoji}
            </motion.div>
          </AnimatePresence>
        );
      })}
    </>
  );
}

// Export the emoji catalog for external use
export { EMOJI_CATALOG, CATEGORY_LABELS };
