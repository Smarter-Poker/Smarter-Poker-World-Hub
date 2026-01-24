/**
 * CardPicker — Reusable card selector component
 * Used in Virtual Sandbox for hero hand and board selection
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
  { symbol: 's', name: 'spades', color: '#1a1a2e' },
  { symbol: 'h', name: 'hearts', color: '#dc2626' },
  { symbol: 'd', name: 'diamonds', color: '#2563eb' },
  { symbol: 'c', name: 'clubs', color: '#16a34a' },
];

const getSuitSymbol = (suit) => {
  switch (suit) {
    case 's': return '\u2660';
    case 'h': return '\u2665';
    case 'd': return '\u2666';
    case 'c': return '\u2663';
    default: return '';
  }
};

export default function CardPicker({ value, onChange, label, usedCards = [] }) {
  const [isOpen, setIsOpen] = useState(false);

  const parseCard = (cardStr) => {
    if (!cardStr || cardStr.length < 2) return null;
    return {
      rank: cardStr[0],
      suit: cardStr[1],
    };
  };

  const card = parseCard(value);
  const suitData = card ? SUITS.find(s => s.symbol === card.suit) : null;

  const isCardUsed = (rank, suit) => {
    return usedCards.includes(`${rank}${suit}`);
  };

  return (
    <div style={styles.container}>
      {label && <span style={styles.label}>{label}</span>}
      <div
        style={{
          ...styles.cardDisplay,
          background: card ? '#fff' : 'rgba(255, 255, 255, 0.1)',
          border: card ? '2px solid #333' : '2px dashed rgba(255, 255, 255, 0.3)',
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {card ? (
          <>
            <span style={{ ...styles.cardRank, color: suitData?.color || '#000' }}>
              {card.rank}
            </span>
            <span style={{ color: suitData?.color || '#000', fontSize: 18 }}>
              {getSuitSymbol(card.suit)}
            </span>
          </>
        ) : (
          <span style={styles.placeholder}>?</span>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            style={styles.dropdown}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div style={styles.grid}>
              {RANKS.map(rank => (
                <div key={rank} style={styles.rankRow}>
                  {SUITS.map(suit => {
                    const cardValue = `${rank}${suit.symbol}`;
                    const used = isCardUsed(rank, suit.symbol);
                    return (
                      <button
                        key={cardValue}
                        style={{
                          ...styles.cardOption,
                          background: used ? 'rgba(100, 100, 100, 0.3)' : '#fff',
                          opacity: used ? 0.3 : 1,
                          cursor: used ? 'not-allowed' : 'pointer',
                        }}
                        onClick={() => {
                          if (!used) {
                            onChange(cardValue);
                            setIsOpen(false);
                          }
                        }}
                        disabled={used}
                      >
                        <span style={{ color: suit.color, fontWeight: 700 }}>{rank}</span>
                        <span style={{ color: suit.color, fontSize: 10 }}>{getSuitSymbol(suit.symbol)}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            {value && (
              <button
                style={styles.clearBtn}
                onClick={() => {
                  onChange(null);
                  setIsOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
  },
  cardDisplay: {
    width: 44,
    height: 60,
    borderRadius: 6,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
  },
  cardRank: {
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1,
  },
  placeholder: {
    fontSize: 24,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginTop: 8,
    background: '#1a2a44',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    padding: 12,
    zIndex: 1000,
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  rankRow: {
    display: 'flex',
    gap: 2,
  },
  cardOption: {
    width: 32,
    height: 36,
    borderRadius: 4,
    border: '1px solid #ddd',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    transition: 'all 0.15s ease',
  },
  clearBtn: {
    width: '100%',
    marginTop: 8,
    padding: '8px 0',
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 6,
    color: '#ef4444',
    fontSize: 12,
    cursor: 'pointer',
  },
};
