/**
 * FavoriteHandPicker — Visual card selector for profile "Favorite Hand"
 * Uses the custom PNG deck from /public/cards/ (same as Club Arena)
 *
 * Props:
 *   value       — comma-separated card codes (e.g. "hearts_a,spades_k")
 *   type        — 'holdem' | 'plo'
 *   onChangeValue(v) — callback when selected cards change
 *   onChangeType(t)  — callback when hand type changes
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

export default function FavoriteHandPicker({ value = '', type = 'holdem', onChangeValue, onChangeType }) {
  const [hoveredCard, setHoveredCard] = useState(null);

  // Parse selected cards from comma-separated string
  const selectedCards = useMemo(() => {
    if (!value) return [];
    return value.split(',').filter(Boolean);
  }, [value]);

  const maxCards = MAX_CARDS[type] || 2;

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

  // When switching type, trim cards if necessary
  const handleTypeChange = (newType) => {
    onChangeType(newType);
    const newMax = MAX_CARDS[newType] || 2;
    if (selectedCards.length > newMax) {
      onChangeValue(selectedCards.slice(0, newMax).join(','));
    }
  };

  const getCardPath = (code) => `/cards/${code}.png`;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Label */}
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#65676B', marginBottom: 8 }}>
        Favorite Hand
      </label>

      {/* Hold'em / PLO Toggle */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 16, borderRadius: 10,
        overflow: 'hidden', border: '2px solid #DADDE1', width: 'fit-content',
      }}>
        {['holdem', 'plo'].map(t => (
          <button
            key={t}
            onClick={() => handleTypeChange(t)}
            style={{
              padding: '10px 28px',
              background: type === t
                ? 'linear-gradient(135deg, #1877F2, #0d47a1)'
                : '#ffffff',
              color: type === t ? '#ffffff' : '#050505',
              border: 'none',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              transition: 'all 0.2s ease',
            }}
          >
            {t === 'holdem' ? "Hold'em" : 'PLO'}
          </button>
        ))}
      </div>

      {/* Selected Cards Display */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, padding: 16,
        background: 'linear-gradient(135deg, #0a0e1a, #1a1a3e)',
        borderRadius: 12, minHeight: 90, alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(255,215,0,0.2)',
        boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.4)',
      }}>
        {Array.from({ length: maxCards }).map((_, i) => {
          const card = selectedCards[i];
          return (
            <div
              key={i}
              onClick={() => card && toggleCard(card)}
              style={{
                width: 60, height: 84,
                borderRadius: 6,
                background: card ? 'transparent' : 'rgba(255,255,255,0.06)',
                border: card
                  ? '2px solid #FFD700'
                  : '2px dashed rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: card ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                boxShadow: card ? '0 0 12px rgba(255,215,0,0.3)' : 'none',
                position: 'relative',
                overflow: 'hidden',
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

      {/* Instruction */}
      <p style={{ fontSize: 12, color: '#65676B', margin: '0 0 12px', textAlign: 'center' }}>
        {selectedCards.length < maxCards
          ? `Tap ${maxCards - selectedCards.length} more card${maxCards - selectedCards.length > 1 ? 's' : ''} below`
          : 'Hand complete — tap a selected card above to change it'}
      </p>

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
                        ? '2px solid #FFD700'
                        : isHovered && !isFull
                          ? '2px solid #1877F2'
                          : '2px solid transparent',
                      opacity: isFull ? 0.35 : isSelected ? 1 : 0.85,
                      transform: isSelected ? 'scale(1.05)' : isHovered && !isFull ? 'scale(1.03)' : 'scale(1)',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected
                        ? '0 0 8px rgba(255,215,0,0.5)'
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
                    {/* Gold checkmark overlay for selected */}
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: 1, right: 1,
                        width: 14, height: 14, borderRadius: '50%',
                        background: '#FFD700', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: '#000', fontWeight: 700,
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
