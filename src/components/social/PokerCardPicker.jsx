import React, { useEffect, useMemo, useState } from 'react';
import { PokerCardImage } from './PokerCardText';
import { formatPokerCards, parsePokerCards } from '../../lib/pokerCardMarkup';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
  { id: 's', name: 'Spades' },
  { id: 'h', name: 'Hearts' },
  { id: 'd', name: 'Diamonds' },
  { id: 'c', name: 'Clubs' },
];

const sameCard = (a, b) => a.rank === b.rank && a.suit === b.suit;

export default function PokerCardPicker({ initialMarkup = '', onInsert, onClose }) {
  const initialCards = useMemo(() => parsePokerCards(initialMarkup), [initialMarkup]);
  const [zone, setZone] = useState('hand');
  const [hand, setHand] = useState(initialCards.hand);
  const [board, setBoard] = useState(initialCards.board);
  const allSelected = useMemo(() => [...hand, ...board], [hand, board]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const choose = (card) => {
    if (allSelected.some((selected) => sameCard(selected, card))) return;
    if (zone === 'hand') {
      if (hand.length >= 6) return;
      setHand((cards) => [...cards, card]);
      return;
    }
    if (board.length >= 5) return;
    setBoard((cards) => [...cards, card]);
  };

  const remove = (area, index) => {
    if (area === 'hand') setHand((cards) => cards.filter((_, i) => i !== index));
    else setBoard((cards) => cards.filter((_, i) => i !== index));
  };

  const insertion = formatPokerCards(hand, board);
  const boardPrompt = board.length < 3
    ? `Build The Flop · ${board.length}/3`
    : board.length === 3
      ? 'Flop Complete · Add The Turn'
      : board.length === 4
        ? 'Turn Added · Add The River'
        : 'River Complete';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Poker Cards"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        background: 'rgba(3, 8, 20, 0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <div style={{
        width: 'min(680px, 100%)',
        maxHeight: 'min(760px, calc(100vh - 24px))',
        overflowY: 'auto',
        borderRadius: 18,
        background: 'linear-gradient(160deg, #101827 0%, #07101d 100%)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 28px 80px rgba(0,0,0,0.55)',
        color: '#f8fafc',
      }}>
        <div style={{ padding: '18px 18px 12px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fbbf24', fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Poker Hand Builder
            </div>
            <h2 style={{ margin: '4px 0 2px', fontSize: 22 }}>Add Real Cards To Your Post</h2>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13, lineHeight: 1.45 }}>
              Choose Up To Six Hole Cards And Five Board Cards. Each Card Uses The Club Arena Deck.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Card Picker"
            style={{ border: 0, background: 'rgba(255,255,255,0.08)', color: '#fff', borderRadius: 999, width: 34, height: 34, fontSize: 22, cursor: 'pointer' }}
          >
            &times;
          </button>
        </div>

        <div style={{ padding: '0 18px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { id: 'hand', label: 'Your Hand', cards: hand, limit: 6 },
            { id: 'board', label: 'Board', cards: board, limit: 5 },
          ].map((area) => (
            <div
              key={area.id}
              style={{
                minHeight: 92,
                padding: 10,
                textAlign: 'left',
                borderRadius: 12,
                border: zone === area.id ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.12)',
                background: zone === area.id ? 'rgba(245,158,11,0.10)' : 'rgba(255,255,255,0.04)',
                color: '#fff',
              }}
            >
              <button
                type="button"
                aria-pressed={zone === area.id}
                aria-label={`Select ${area.label}`}
                onClick={() => setZone(area.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: 0,
                  marginBottom: 5,
                  border: 0,
                  background: 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 800,
                  textAlign: 'left',
                }}
              >
                <span>{area.label}</span>
                <span aria-live="polite" style={{ color: '#94a3b8' }}>{area.cards.length}/{area.limit}</span>
              </button>
              {area.id === 'board' && (
                <div aria-live="polite" style={{ color: '#fbbf24', fontSize: 10, fontWeight: 800, marginBottom: 5 }}>
                  {boardPrompt}
                </div>
              )}
              <div style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 1, overflowX: 'auto' }}>
                {area.cards.length ? area.cards.map((card, index) => (
                  <button
                    type="button"
                    key={`${card.rank}${card.suit}`}
                    aria-label={`Remove ${card.rank}${card.suit}`}
                    onClick={() => remove(area.id, index)}
                    style={{ cursor: 'pointer', padding: 0, border: 0, background: 'transparent' }}
                  >
                    <PokerCardImage rank={card.rank} suit={card.suit} size="preview" selected />
                  </button>
                )) : (
                  <span style={{ color: '#64748b', fontSize: 12 }}>Tap Cards Below To Add Them Here</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '2px 12px 10px' }}>
          {SUITS.map((suit) => (
            <div key={suit.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
              <span style={{ width: 54, flexShrink: 0, textAlign: 'right', paddingRight: 5, color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>
                {suit.name}
              </span>
              <div style={{ display: 'flex', gap: 3, overflowX: 'auto', padding: '4px 3px 7px' }}>
                {RANKS.map((rank) => {
                  const card = { rank, suit: suit.id };
                  const selected = allSelected.some((item) => sameCard(item, card));
                  const full = zone === 'hand' ? hand.length >= 6 : board.length >= 5;
                  return (
                    <button
                      type="button"
                      key={`${rank}${suit.id}`}
                      onClick={() => choose(card)}
                      disabled={selected || full}
                      aria-pressed={selected}
                      aria-label={`Add ${rank} of ${suit.name.toLowerCase()} to ${zone}`}
                      style={{
                        padding: 0,
                        border: 0,
                        background: 'transparent',
                        cursor: selected || full ? 'not-allowed' : 'pointer',
                        opacity: selected ? 0.22 : full ? 0.5 : 1,
                        borderRadius: 5,
                      }}
                    >
                      <PokerCardImage rank={rank} suit={suit.id} size="picker" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 18px 18px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={() => { setHand([]); setBoard([]); }}
            disabled={!insertion}
            style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: '#cbd5e1', fontWeight: 700, cursor: insertion ? 'pointer' : 'not-allowed', opacity: insertion ? 1 : 0.45 }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => insertion && onInsert(insertion)}
            disabled={!insertion}
            style={{ flex: 1, padding: '11px 18px', borderRadius: 9, border: 0, background: insertion ? 'linear-gradient(135deg, #f59e0b, #dc7b08)' : '#334155', color: '#fff', fontWeight: 800, cursor: insertion ? 'pointer' : 'not-allowed' }}
          >
            Add Cards To Post
          </button>
        </div>
      </div>
    </div>
  );
}
