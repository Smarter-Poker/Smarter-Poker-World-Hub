import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PokerCardImage } from './PokerCardText';
import { formatPokerCards, parsePokerCards } from '../../lib/pokerCardMarkup';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const QUICK_RANKS = RANKS.map((rank) => ({ rank, key: rank === 'T' ? '1' : rank }));
const LONG_PRESS_MS = 420;
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
  const [quickRank, setQuickRank] = useState(null);
  const [pressingRank, setPressingRank] = useState(null);
  const longPressTimerRef = useRef(null);
  const suppressClickRef = useRef(false);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const allSelected = useMemo(() => [...hand, ...board], [hand, board]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (quickRank) setQuickRank(null);
      else onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, quickRank]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      previousFocusRef.current?.focus?.();
    };
  }, []);

  const choose = (card) => {
    if (allSelected.some((selected) => sameCard(selected, card))) return false;
    if (zone === 'hand') {
      if (hand.length >= 6) return false;
      setHand((cards) => [...cards, card]);
      return true;
    }
    if (board.length >= 5) return false;
    setBoard((cards) => [...cards, card]);
    return true;
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    setPressingRank(null);
  };

  const beginLongPress = (rank) => {
    cancelLongPress();
    suppressClickRef.current = false;
    setPressingRank(rank);
    longPressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      setPressingRank(null);
      setQuickRank(rank);
      longPressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  const openQuickRankFromClick = (rank) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setQuickRank((current) => current === rank ? null : rank);
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
            ref={closeButtonRef}
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

        <div style={{ padding: '0 12px 10px' }}>
          <div style={{ color: '#fbbf24', fontSize: 11, fontWeight: 800, margin: '0 6px 6px' }}>
            Quick Rank: Hold A, K, Q, J, 1, Or 9 Through 2. 1 Means 10.
          </div>
          <div
            aria-label="Quick rank card selector"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(44px, 1fr))', gap: 6, padding: '2px 5px 8px' }}
          >
            {QUICK_RANKS.map(({ rank, key }) => {
              const active = quickRank === rank;
              const pressing = pressingRank === rank;
              return (
                <button
                  type="button"
                  key={rank}
                  aria-expanded={active}
                  aria-controls="quick-rank-suits"
                  aria-label={`${rank === 'T' ? 'Ten' : rank}. Hold for suit choices`}
                  onPointerDown={() => beginLongPress(rank)}
                  onPointerUp={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={() => openQuickRankFromClick(rank)}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    padding: 0,
                    borderRadius: 10,
                    border: active ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.18)',
                    background: pressing ? 'rgba(245,158,11,0.28)' : active ? 'rgba(245,158,11,0.16)' : 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: 900,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                  }}
                >
                  {key}
                </button>
              );
            })}
          </div>
          {quickRank && (
            <div
              id="quick-rank-suits"
              role="group"
              aria-label={`${quickRank === 'T' ? 'Ten' : quickRank} suit choices`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '9px 8px',
                borderRadius: 12,
                border: '1px solid rgba(245,158,11,0.48)',
                background: 'rgba(2,6,23,0.82)',
                boxShadow: '0 12px 28px rgba(0,0,0,0.34)',
              }}
            >
              {SUITS.map((suit) => {
                const card = { rank: quickRank, suit: suit.id };
                const selected = allSelected.some((item) => sameCard(item, card));
                const full = zone === 'hand' ? hand.length >= 6 : board.length >= 5;
                return (
                  <button
                    type="button"
                    key={`${quickRank}${suit.id}`}
                    onClick={() => {
                      if (choose(card)) setQuickRank(null);
                    }}
                    disabled={selected || full}
                    aria-label={`Add ${quickRank === 'T' ? 'ten' : quickRank} of ${suit.name.toLowerCase()} to ${zone}`}
                    style={{
                      minWidth: 50,
                      minHeight: 66,
                      padding: 2,
                      border: 0,
                      borderRadius: 7,
                      background: 'transparent',
                      opacity: selected ? 0.22 : full ? 0.5 : 1,
                      cursor: selected || full ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <PokerCardImage rank={quickRank} suit={suit.id} size="picker" />
                  </button>
                );
              })}
            </div>
          )}
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
