/**
 * FavoriteHandPicker — Visual card selector for profile "Favorite Hand"
 * Uses the custom PNG deck from /public/cards/ (same as Club Arena)
 *
 * Props:
 *   value       — comma-separated card codes (e.g. "hearts_a,spades_k")
 *   gameType    — 'holdem' | 'plo' (fixed — determines max cards)
 *   label       — optional custom label (defaults to "Favorite Hold'em Hand" / "Favorite PLO Hand")
 *   onChangeValue(v) — callback when selected cards change
 */

import { useState, useMemo } from 'react';

// ── Card data ──
const SUITS = [
  { key: 'spades',   label: '♠', color: '#1a1a2e' },
  { key: 'hearts',   label: '♥', color: '#c0392b' },
  { key: 'diamonds', label: '♦', color: '#2980b9' },
  { key: 'clubs',    label: '♣', color: '#27ae60' },
];

const RANKS = ['a', 'k', 'q', 'j', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

const MAX_CARDS = { holdem: 2, plo: 4 };

// Blue accent matching the profile avatar border (#1877F2)
const ACCENT = '#1877F2';

export default function FavoriteHandPicker({ value = '', gameType = 'holdem', label, onChangeValue }) {
  const [hoveredCard, setHoveredCard] = useState(null);

  // Parse selected cards from comma-separated string
  const selectedCards = useMemo(() => {
    if (!value) return [];
    return value.split(',').filter(Boolean);
  }, [value]);

  const maxCards = MAX_CARDS[gameType] || 2;
  const defaultLabel = gameType === 'plo' ? 'Favorite PLO Hand' : "Favorite Hold'em Hand";

  // Toggle a card on/off
  const toggleCard = (cardCode) => {
    const isSelected = selectedCards.includes(cardCode);
    let next;
    if (isSelected) {
      next = selectedCards.filter(c => c !== cardCode);
    } else {
      if (selectedCards.length >= maxCards) return; // already full
      next = [...selectedCards, cardCode];
    }
    onChangeValue(next.join(','));
  };

  const getCardPath = (code) => `/cards/${code}.png`;

  // Rank sorting for display
  const RANK_ORDER = { a: 14, k: 13, q: 12, j: 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
  const getRank = (code) => { const r = code.split('_')[1]; return RANK_ORDER[r] || 0; };
  const sorted = [...selectedCards].sort((a, b) => getRank(b) - getRank(a));
  const tiltAngles = maxCards === 4 ? [-6, -2, 2, 6] : [-5, 5];

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#65676B' }}>
          {label || defaultLabel}
        </label>
      </div>

      {/* Selected cards preview */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 16, padding: 16,
        background: 'linear-gradient(135deg, #0a0e1a, #1a1a3e)',
        borderRadius: 12, minHeight: 90, alignItems: 'center', justifyContent: 'center',
        border: `1px solid rgba(24, 119, 242, 0.3)`,
        boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.4)',
      }}>
        {Array.from({ length: maxCards }).map((_, i) => {
          const card = sorted[i];
          return (
            <div
              key={i}
              onClick={() => card && toggleCard(card)}
              style={{
                width: 60, height: 84,
                borderRadius: 6,
                background: card ? 'transparent' : 'rgba(255,255,255,0.06)',
                border: card
                  ? `2px solid ${ACCENT}`
                  : '2px dashed rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: card ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                boxShadow: card ? `0 0 12px rgba(24, 119, 242, 0.4)` : 'none',
                position: 'relative',
                overflow: 'hidden',
                transform: card ? `rotate(${tiltAngles[i] || 0}deg)` : 'none',
                marginLeft: i > 0 ? -8 : 0,
                zIndex: i,
              }}
              title={card ? 'Click to remove' : `Select card ${i + 1}`}
            >
              {card ? (
                <>
                  <img
                    src={getCardPath(card)}
                    alt={card}
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      borderRadius: 4,
                    }}
                  />
                  {/* Remove indicator on hover */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(220,38,38,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: 'opacity 0.2s ease',
                    borderRadius: 4, fontSize: 18, color: 'white', fontWeight: 700,
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
                  >
                    ✕
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 24, color: 'rgba(255,255,255,0.15)' }}>+</span>
              )}
            </div>
          );
        })}
      </div>
      {/* Instruction + Clear button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '0 0 12px' }}>
        <p style={{ fontSize: 12, color: '#65676B', margin: 0, textAlign: 'center' }}>
          {selectedCards.length < maxCards
            ? `Tap ${maxCards - selectedCards.length} more card${maxCards - selectedCards.length > 1 ? 's' : ''} below`
            : 'Hand complete — tap a selected card above to change it'}
        </p>
        {selectedCards.length > 0 && (
          <button
            onClick={() => onChangeValue('')}
            style={{
              padding: '3px 10px', fontSize: 11, fontWeight: 600,
              background: '#e4e6eb', border: 'none', borderRadius: 6,
              color: '#65676B', cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >Clear</button>
        )}
      </div>

      {/* Card Grid — Organized by Suit */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        background: '#ffffff', borderRadius: 12, padding: 10,
        border: '1px solid #DADDE1',
      }}>
        {SUITS.map(suit => (
          <div key={suit.key} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {/* Suit label */}
            <div style={{
              width: 20, height: 20, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 16, flexShrink: 0,
              color: suit.color, fontWeight: 700,
            }}>
              {suit.label}
            </div>

            {/* Cards in this suit */}
            <div style={{ display: 'flex', gap: 2, flex: 1, flexWrap: 'wrap' }}>
              {RANKS.map(rank => {
                const code = `${suit.key}_${rank}`;
                const isSelected = selectedCards.includes(code);
                const isFull = selectedCards.length >= maxCards && !isSelected;
                const isHovered = hoveredCard === code;

                return (
                  <div
                    key={code}
                    onClick={() => !isFull && toggleCard(code)}
                    onMouseEnter={() => setHoveredCard(code)}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={{
                      width: 'calc((100% - 24px) / 13)',
                      minWidth: 32,
                      aspectRatio: '150 / 210',
                      borderRadius: 4,
                      overflow: 'hidden',
                      cursor: isFull ? 'not-allowed' : 'pointer',
                      border: isSelected
                        ? `2px solid ${ACCENT}`
                        : isHovered && !isFull
                          ? `2px solid ${ACCENT}`
                          : '2px solid transparent',
                      opacity: isFull ? 0.35 : isSelected ? 1 : 0.85,
                      transform: isSelected ? 'scale(1.05)' : isHovered && !isFull ? 'scale(1.03)' : 'scale(1)',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected
                        ? `0 0 8px rgba(24, 119, 242, 0.5)`
                        : 'none',
                      position: 'relative',
                    }}
                    title={`${rank.toUpperCase()} of ${suit.key}`}
                  >
                    <img
                      src={getCardPath(code)}
                      alt={`${rank.toUpperCase()} of ${suit.key}`}
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        display: 'block',
                      }}
                      loading="lazy"
                    />
                    {/* Blue checkmark overlay for selected */}
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: 1, right: 1,
                        width: 14, height: 14, borderRadius: '50%',
                        background: ACCENT, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: '#fff', fontWeight: 700,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }}>
                        ✓
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
