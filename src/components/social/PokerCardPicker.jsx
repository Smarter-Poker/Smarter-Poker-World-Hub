import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PokerCardImage } from './PokerCardText';
import { formatPokerCards, parsePokerCards } from '../../lib/pokerCardMarkup';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const QUICK_RANKS = RANKS.map((rank) => ({ rank, key: rank === 'T' ? '1' : rank }));
const LONG_PRESS_MS = 420;
// How long a finished long press waits for the click that ends it. Some
// browsers never send that click, and a press after this is a new press.
const LONG_PRESS_CLICK_MS = 400;
const SUITS = [
  { id: 's', name: 'Spades' },
  { id: 'h', name: 'Hearts' },
  { id: 'd', name: 'Diamonds' },
  { id: 'c', name: 'Clubs' },
];
// Labels are spoken, so ranks are words: a screen reader reads "A" as a letter
// and "T" as "tee". Ten is written 10, which is read as "ten".
const RANK_NAMES = { A: 'ace', K: 'king', Q: 'queen', J: 'jack', T: '10' };
const ZONE_NAMES = { hand: 'your hand', board: 'the board' };
const BOARD_STREETS = ['flop', 'flop', 'flop', 'turn', 'river'];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const sameCard = (a, b) => a.rank === b.rank && a.suit === b.suit;
const rankName = (rank) => RANK_NAMES[rank] || rank;
const capitalized = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const cardName = (card) => `${rankName(card.rank)} of ${SUITS.find((suit) => suit.id === card.suit).name.toLowerCase()}`;

// Taking a card off the board leaves its slot empty while a later street is
// still there, so the turn and river never slide down into the flop. With no
// later street the flop just closes up, because flop order does not matter.
const withoutBoardCard = (cards, index) => {
  const next = cards.map((card, i) => (i === index ? null : card));
  while (next.length && !next[next.length - 1]) next.pop();
  return next.length > 3 ? next : next.filter(Boolean);
};

export default function PokerCardPicker({ initialMarkup = '', onInsert, onClose }) {
  const initialCards = useMemo(() => parsePokerCards(initialMarkup), [initialMarkup]);
  const [zone, setZone] = useState('hand');
  const [hand, setHand] = useState(initialCards.hand);
  const [board, setBoard] = useState(initialCards.board);
  const [quickRank, setQuickRank] = useState(null);
  const [pressingRank, setPressingRank] = useState(null);
  const longPressTimerRef = useRef(null);
  const suppressClickRef = useRef(false);
  const suppressResetTimerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const dialogRef = useRef(null);
  const rankButtonRefs = useRef({});
  const openRankRef = useRef(null);
  const allSelected = useMemo(() => [...hand, ...board].filter(Boolean), [hand, board]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Tab') {
        // aria-modal says the page behind is out of reach, so Tab and
        // Shift+Tab wrap around inside the picker instead of leaving it.
        const dialog = dialogRef.current;
        const items = dialog ? Array.from(dialog.querySelectorAll(FOCUSABLE)) : [];
        if (!items.length) return;
        const active = document.activeElement;
        const outside = !dialog.contains(active);
        if (event.shiftKey && (outside || active === items[0])) {
          event.preventDefault();
          items[items.length - 1].focus();
        } else if (!event.shiftKey && (outside || active === items[items.length - 1])) {
          event.preventDefault();
          items[0].focus();
        }
        return;
      }
      if (event.key !== 'Escape') return;
      if (quickRank) setQuickRank(null);
      else onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, quickRank]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      clearTimeout(suppressResetTimerRef.current);
      previousFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    // Picking a suit, or Escape, removes the suit buttons and the focus one of
    // them held. Hand it back to the rank that opened them, not the page.
    const closedRank = openRankRef.current;
    openRankRef.current = quickRank;
    if (quickRank || !closedRank) return;
    if (dialogRef.current?.contains(document.activeElement)) return;
    rankButtonRefs.current[closedRank]?.focus();
  }, [quickRank]);

  const boardFull = board.length >= 5 && !board.includes(null);

  const choose = (card) => {
    if (allSelected.some((selected) => sameCard(selected, card))) return false;
    if (zone === 'hand') {
      if (hand.length >= 6) return false;
      setHand((cards) => [...cards, card]);
      return true;
    }
    if (boardFull) return false;
    // A slot emptied on an earlier street is filled before a new one opens.
    setBoard((cards) => {
      const gap = cards.indexOf(null);
      return gap === -1 ? [...cards, card] : cards.map((item, i) => (i === gap ? card : item));
    });
    return true;
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    setPressingRank(null);
  };

  const beginLongPress = (rank) => {
    cancelLongPress();
    clearTimeout(suppressResetTimerRef.current);
    suppressClickRef.current = false;
    setPressingRank(rank);
    longPressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      setPressingRank(null);
      setQuickRank(rank);
      longPressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  // The click that ends a long press must not toggle the suits shut again,
  // but a browser may never send it (the finger slid off, or iOS kept it as a
  // hold). Stop waiting for it soon after the release.
  const releaseLongPress = () => {
    cancelLongPress();
    if (!suppressClickRef.current) return;
    clearTimeout(suppressResetTimerRef.current);
    suppressResetTimerRef.current = setTimeout(() => {
      suppressClickRef.current = false;
    }, LONG_PRESS_CLICK_MS);
  };

  // A cancelled pointer is never followed by a click.
  const abandonLongPress = () => {
    cancelLongPress();
    suppressClickRef.current = false;
  };

  const openQuickRankFromClick = (rank, event) => {
    // A keyboard press arrives as a click with detail 0. It is never the end
    // of a long press, so it always toggles the suits.
    if (suppressClickRef.current && event?.detail !== 0) {
      suppressClickRef.current = false;
      return;
    }
    suppressClickRef.current = false;
    setQuickRank((current) => current === rank ? null : rank);
  };

  const remove = (area, index) => {
    if (area === 'hand') setHand((cards) => cards.filter((_, i) => i !== index));
    else {
      setBoard((cards) => withoutBoardCard(cards, index));
      // The slot stays open on the board, so the next card picked goes there.
      if (board.length > 3 && index < board.length - 1) setZone('board');
    }
  };

  const insertion = formatPokerCards(hand, board);
  const boardCount = board.filter(Boolean).length;
  const boardGap = board.indexOf(null);
  const gapStreet = boardGap === -1 ? '' : capitalized(BOARD_STREETS[boardGap]);
  const boardPrompt = boardGap !== -1
    ? `Pick A Card To Fill The Empty ${gapStreet} Slot`
    : board.length < 3
      ? `Build The Flop · ${board.length}/3`
      : board.length === 3
        ? 'Flop Complete · Add The Turn'
        : board.length === 4
          ? 'Turn Added · Add The River'
          : 'River Complete';
  // A board goes into a post only as whole streets: none, the flop, the turn
  // or the river. The Add button says what is missing instead of guessing.
  const insertHint = !insertion
    ? 'Pick At Least One Card First'
    : boardGap !== -1
      ? `Fill The Empty ${gapStreet} Slot Before Adding These Cards`
      : board.length === 1 || board.length === 2
        ? `Add ${3 - board.length} More Board Card${board.length === 1 ? 's' : ''} To Complete The Flop`
        : '';
  const canInsert = !insertHint;

  return (
    <div
      ref={dialogRef}
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
            style={{ border: 0, background: 'rgba(255,255,255,0.08)', color: '#fff', borderRadius: 999, width: 44, height: 44, minWidth: 44, minHeight: 44, fontSize: 22, cursor: 'pointer' }}
          >
            &times;
          </button>
        </div>

        <div style={{ padding: '0 18px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { id: 'hand', label: 'Your Hand', cards: hand, count: hand.length, limit: 6 },
            { id: 'board', label: 'Board', cards: board, count: boardCount, limit: 5 },
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
                  minWidth: 44,
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
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
                <span aria-live="polite" style={{ color: '#94a3b8' }}>{area.count}/{area.limit}</span>
              </button>
              {area.id === 'board' && (
                <div aria-live="polite" style={{ color: '#fbbf24', fontSize: 10, fontWeight: 800, marginBottom: 5 }}>
                  {boardPrompt}
                </div>
              )}
              <div style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 1, overflowX: 'auto' }}>
                {area.cards.length ? area.cards.map((card, index) => card ? (
                  <button
                    type="button"
                    key={`${card.rank}${card.suit}`}
                    aria-label={`Remove ${cardName(card)} from ${ZONE_NAMES[area.id]}`}
                    onClick={() => remove(area.id, index)}
                    style={{ cursor: 'pointer', minWidth: 44, minHeight: 44, padding: 0, border: 0, background: 'transparent' }}
                  >
                    <PokerCardImage rank={card.rank} suit={card.suit} size="preview" selected />
                  </button>
                ) : (
                  <span
                    key={`empty-${index}`}
                    role="img"
                    aria-label={`Empty ${BOARD_STREETS[index]} slot`}
                    style={{ flexShrink: 0, width: 34, height: 48, margin: '0 5px', boxSizing: 'border-box', borderRadius: 4, border: '1px dashed #f59e0b' }}
                  />
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
            role="group"
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
                  ref={(node) => { rankButtonRefs.current[rank] = node; }}
                  aria-expanded={active}
                  aria-controls="quick-rank-suits"
                  aria-label={`${capitalized(rankName(rank))}. Hold for suits`}
                  onPointerDown={() => beginLongPress(rank)}
                  onPointerUp={releaseLongPress}
                  onPointerCancel={abandonLongPress}
                  onPointerLeave={releaseLongPress}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={(event) => openQuickRankFromClick(rank, event)}
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
                    WebkitTouchCallout: 'none',
                  }}
                >
                  {key}
                </button>
              );
            })}
          </div>
          <div
            id="quick-rank-suits"
            role="group"
            aria-label={quickRank ? `${capitalized(rankName(quickRank))} suit choices` : 'Suit choices'}
            hidden={!quickRank}
            style={{
              display: quickRank ? 'flex' : 'none',
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
            {quickRank && SUITS.map((suit) => {
              const card = { rank: quickRank, suit: suit.id };
              const selected = allSelected.some((item) => sameCard(item, card));
              const full = zone === 'hand' ? hand.length >= 6 : boardFull;
              return (
                <button
                  type="button"
                  key={`${quickRank}${suit.id}`}
                  onClick={() => {
                    if (choose(card)) setQuickRank(null);
                  }}
                  disabled={selected || full}
                  aria-label={`Add ${cardName(card)} to ${ZONE_NAMES[zone]}`}
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
                  const full = zone === 'hand' ? hand.length >= 6 : boardFull;
                  return (
                    <button
                      type="button"
                      key={`${rank}${suit.id}`}
                      onClick={() => choose(card)}
                      disabled={selected || full}
                      aria-pressed={selected}
                      aria-label={`Add ${cardName(card)} to ${ZONE_NAMES[zone]}`}
                      style={{
                        minWidth: 44,
                        minHeight: 44,
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

        <div style={{ padding: '12px 18px 18px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {insertHint && (
            <p id="poker-card-picker-insert-hint" style={{ flexBasis: '100%', margin: 0, color: '#fbbf24', fontSize: 12, fontWeight: 700 }}>
              {insertHint}
            </p>
          )}
          <button
            type="button"
            onClick={() => { setHand([]); setBoard([]); }}
            disabled={!insertion}
            style={{ minWidth: 44, minHeight: 44, padding: '10px 16px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: '#cbd5e1', fontWeight: 700, cursor: insertion ? 'pointer' : 'not-allowed', opacity: insertion ? 1 : 0.45 }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => canInsert && onInsert(insertion)}
            aria-disabled={!canInsert}
            aria-describedby={insertHint ? 'poker-card-picker-insert-hint' : undefined}
            style={{ flex: 1, minWidth: 44, minHeight: 44, padding: '11px 18px', borderRadius: 9, border: 0, background: canInsert ? 'linear-gradient(135deg, #f59e0b, #dc7b08)' : '#334155', color: '#fff', fontWeight: 800, cursor: canInsert ? 'pointer' : 'not-allowed' }}
          >
            Add Cards To Post
          </button>
        </div>
      </div>
    </div>
  );
}
