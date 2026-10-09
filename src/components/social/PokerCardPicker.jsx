import React, { useEffect, useMemo, useRef, useState } from 'react';
import PokerCardText, { PokerCardImage } from './PokerCardText';
import {
  createPokerCardPreset,
  deletePokerCardPreset,
  formatPokerCards,
  loadPokerCardPresets,
  normalizePokerCardPresets,
  persistPokerCardPresets,
  parsePokerCards,
  renamePokerCardPreset,
} from '../../lib/pokerCardMarkup';
import { loadAppSettings, saveAppSetting } from '../../lib/appSettingsSync';
import { supabase } from '../../lib/supabase';
import { fetchRecentClubArenaHands } from '../../lib/clubArenaHandImport.mjs';

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

export default function PokerCardPicker({ accountId = null, initialMarkup = '', onInsert, onClose }) {
  const initialCards = useMemo(() => parsePokerCards(initialMarkup), [initialMarkup]);
  const [zone, setZone] = useState('hand');
  const [hand, setHand] = useState(initialCards.hand);
  const [board, setBoard] = useState(initialCards.board);
  const [quickRank, setQuickRank] = useState(null);
  const [pressingRank, setPressingRank] = useState(null);
  const [presets, setPresets] = useState([]);
  const [presetName, setPresetName] = useState('');
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [presetMessage, setPresetMessage] = useState('');
  const [recentHands, setRecentHands] = useState([]);
  const [recentHandsLoading, setRecentHandsLoading] = useState(false);
  const [recentHandsError, setRecentHandsError] = useState('');
  const [recentHandsRejected, setRecentHandsRejected] = useState(0);
  const [recentHandsRefresh, setRecentHandsRefresh] = useState(0);
  const [handImportMessage, setHandImportMessage] = useState('');
  const presetRevisionRef = useRef(0);
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
    presetRevisionRef.current += 1;
    const revision = presetRevisionRef.current;
    setPresetName('');
    setEditingPresetId(null);
    setPresetMessage('');
    if (!accountId || typeof window === 'undefined') {
      setPresets([]);
      return undefined;
    }

    const local = loadPokerCardPresets(window.localStorage, accountId);
    setPresets(local);
    let cancelled = false;
    loadAppSettings(accountId).then((settings) => {
      if (cancelled || presetRevisionRef.current !== revision) return;
      if (Array.isArray(settings?.poker_card_presets)) {
        const remote = normalizePokerCardPresets(settings.poker_card_presets);
        setPresets(remote);
        persistPokerCardPresets(window.localStorage, accountId, remote);
      }
    });
    return () => { cancelled = true; };
  }, [accountId]);

  useEffect(() => {
    setRecentHands([]);
    setRecentHandsError('');
    setRecentHandsRejected(0);
    setHandImportMessage('');
    if (!accountId) {
      setRecentHandsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setRecentHandsLoading(true);
    fetchRecentClubArenaHands(supabase, accountId).then(({ hands, rejected }) => {
      if (cancelled) return;
      setRecentHands(hands);
      setRecentHandsRejected(rejected);
    }).catch((error) => {
      if (!cancelled) setRecentHandsError(error?.message || 'Recent Club Arena Hands Are Temporarily Unavailable');
    }).finally(() => {
      if (!cancelled) setRecentHandsLoading(false);
    });
    return () => { cancelled = true; };
  }, [accountId, recentHandsRefresh]);

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

  const commitPresets = (next, message) => {
    const normalized = normalizePokerCardPresets(next);
    presetRevisionRef.current += 1;
    setPresets(normalized);
    persistPokerCardPresets(window.localStorage, accountId, normalized);
    saveAppSetting('poker_card_presets', normalized);
    setPresetMessage(message);
  };

  const savePreset = () => {
    try {
      const next = editingPresetId
        ? renamePokerCardPreset(presets, editingPresetId, presetName)
        : createPokerCardPreset(presets, presetName, formatPokerCards(hand, board));
      commitPresets(next, editingPresetId ? 'Preset Renamed' : 'Preset Saved');
      setPresetName('');
      setEditingPresetId(null);
    } catch (error) {
      setPresetMessage(error?.message || 'Preset Could Not Be Saved');
    }
  };

  const usePreset = (preset) => {
    const cards = parsePokerCards(preset.markup);
    setHand(cards.hand);
    setBoard(cards.board);
    setZone(cards.hand.length ? 'hand' : 'board');
    setPresetMessage(`${preset.name} Loaded`);
  };

  const importRecentHand = (recentHand) => {
    setHand(recentHand.hand);
    setBoard(recentHand.board);
    setZone(recentHand.hand.length ? 'hand' : 'board');
    setHandImportMessage(`${recentHand.label} Imported`);
  };

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

        <section aria-labelledby="club-arena-hand-import-title" style={{ margin: '0 18px 14px', padding: 12, borderRadius: 12, border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(37,99,235,0.08)' }}>
          <div id="club-arena-hand-import-title" style={{ color: '#93c5fd', fontSize: 12, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase' }}>
            Recent Club Arena Hands
          </div>
          {!accountId ? (
            <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 12 }}>Sign In To Import Your Hands.</p>
          ) : recentHandsLoading ? (
            <p role="status" style={{ margin: '8px 0 0', color: '#cbd5e1', fontSize: 12 }}>Loading Your Recent Hands...</p>
          ) : recentHandsError ? (
            <div role="alert" style={{ marginTop: 8 }}>
              <p style={{ margin: '0 0 8px', color: '#fca5a5', fontSize: 12 }}>{recentHandsError}</p>
              <button
                type="button"
                onClick={() => setRecentHandsRefresh((value) => value + 1)}
                style={{ minWidth: 96, minHeight: 44, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, background: 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Try Again
              </button>
            </div>
          ) : recentHands.length ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 9 }}>
              {recentHands.map((recentHand) => (
                <button
                  type="button"
                  key={recentHand.id}
                  onClick={() => importRecentHand(recentHand)}
                  aria-label={`Import ${recentHand.label}`}
                  style={{ width: '100%', minHeight: 52, padding: '8px 10px', border: '1px solid rgba(147,197,253,0.35)', borderRadius: 9, background: 'rgba(2,6,23,0.58)', color: '#fff', textAlign: 'left', cursor: 'pointer' }}
                >
                  <span style={{ display: 'block', marginBottom: 4, color: '#bfdbfe', fontSize: 12, fontWeight: 800 }}>{recentHand.label}</span>
                  <PokerCardText text={formatPokerCards(recentHand.hand, recentHand.board)} style={{ fontSize: 12 }} />
                </button>
              ))}
            </div>
          ) : (
            <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 12 }}>
              {recentHandsRejected ? 'Recent Hands Had No Complete Card Data To Import.' : 'No Recent Club Arena Hands To Import.'}
            </p>
          )}
          <div aria-live="polite" style={{ minHeight: 18, marginTop: 5, color: '#cbd5e1', fontSize: 12 }}>
            {handImportMessage}
          </div>
        </section>

        <section aria-labelledby="poker-card-presets-title" style={{ margin: '0 18px 14px', padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
          <div id="poker-card-presets-title" style={{ color: '#fbbf24', fontSize: 12, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase' }}>
            Saved Hands And Boards
          </div>
          {!accountId ? (
            <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 12 }}>Sign In To Save Presets To Your Account.</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 9 }}>
                <label htmlFor="poker-card-preset-name" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
                  {editingPresetId ? 'New Preset Name' : 'Preset Name'}
                </label>
                <input
                  id="poker-card-preset-name"
                  value={presetName}
                  maxLength={40}
                  onChange={(event) => { setPresetName(event.target.value); setPresetMessage(''); }}
                  placeholder={editingPresetId ? 'New Preset Name' : 'Name This Setup'}
                  style={{ flex: '1 1 180px', minWidth: 0, minHeight: 44, boxSizing: 'border-box', borderRadius: 9, border: '1px solid rgba(255,255,255,0.2)', background: '#07101d', color: '#fff', padding: '10px 12px', fontSize: 16 }}
                />
                <button
                  type="button"
                  onClick={savePreset}
                  disabled={!presetName.trim() || (!editingPresetId && !canInsert)}
                  style={{ minWidth: 96, minHeight: 44, padding: '9px 14px', border: 0, borderRadius: 9, background: presetName.trim() && (editingPresetId || canInsert) ? '#2563eb' : '#334155', color: '#fff', fontWeight: 800, cursor: presetName.trim() && (editingPresetId || canInsert) ? 'pointer' : 'not-allowed' }}
                >
                  {editingPresetId ? 'Save Name' : 'Save Preset'}
                </button>
                {editingPresetId && (
                  <button
                    type="button"
                    onClick={() => { setEditingPresetId(null); setPresetName(''); setPresetMessage(''); }}
                    style={{ minWidth: 72, minHeight: 44, padding: '9px 12px', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 9, background: 'transparent', color: '#cbd5e1', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
              <div aria-live="polite" style={{ minHeight: 18, marginTop: 5, color: '#cbd5e1', fontSize: 12 }}>
                {presetMessage}
              </div>
              {presets.length > 0 && (
                <div style={{ display: 'grid', gap: 8, marginTop: 3 }}>
                  {presets.map((preset) => (
                    <div key={preset.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: 7, borderRadius: 9, background: 'rgba(2,6,23,0.55)' }}>
                      <button
                        type="button"
                        onClick={() => usePreset(preset)}
                        aria-label={`Use ${preset.name} preset`}
                        style={{ flex: '1 1 130px', minWidth: 0, minHeight: 44, padding: '8px 10px', border: '1px solid rgba(245,158,11,0.42)', borderRadius: 8, background: 'rgba(245,158,11,0.10)', color: '#fff', fontWeight: 800, textAlign: 'left', cursor: 'pointer' }}
                      >
                        {preset.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingPresetId(preset.id); setPresetName(preset.name); setPresetMessage(''); }}
                        aria-label={`Rename ${preset.name} preset`}
                        style={{ minWidth: 70, minHeight: 44, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, background: 'transparent', color: '#cbd5e1', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          commitPresets(deletePokerCardPreset(presets, preset.id), 'Preset Deleted');
                          if (editingPresetId === preset.id) { setEditingPresetId(null); setPresetName(''); }
                        }}
                        aria-label={`Delete ${preset.name} preset`}
                        style={{ minWidth: 68, minHeight: 44, padding: '8px 10px', border: '1px solid rgba(248,113,113,0.45)', borderRadius: 8, background: 'transparent', color: '#fca5a5', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

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
