/**
 * Virtual Sandbox · Native Poker Scenario Lab (Restored & Hardened)
 * ═══════════════════════════════════════════════════════════════════════════
 * Restores the September 5 Virtual Sandbox workspace with:
 *   1. Native poker table, card/board setup, hero & multi-villain seats
 *   2. Opponent ranges, archetype presets & live 13x13 heat grid
 *   3. Heads-up action builder, street timeline & hand replay
 *   4. Multiway/heads-up Monte Carlo equity & runout engine
 *   5. Saved studies, custom folders & account bookmarks
 *   6. Scenario templates, hand-history import & native solver import
 *   7. Session tools, HiDPI image export & internal study sharing
 *
 * Authority & Honesty Boundary:
 *   - `data-training-authority="authored-sandbox-ungraded"`
 *   - Authored scenarios NEVER manufacture GTO grades, EV, accuracy scores,
 *     streaks, or training progress, and NEVER call retired analysis endpoints
 *     or admin override panels.
 *   - Verified solver-backed grading routes honestly to Training / Audited
 *     Spot Study / Hand History Upload / Leak Finder.
 */

import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import toast, { Toaster } from 'react-hot-toast';
import {
  SlidersHorizontal, Shuffle, RotateCcw, Undo2, Plus, X as XIcon,
  Layers, Users, LayoutGrid, Flame, Bookmark, FolderOpen, Upload, FileCode,
  Film, Share2, ClipboardList, BarChart3, ShieldAlert, Check,
  PlayCircle, Trash2, Loader2, RefreshCw, ExternalLink, Volume2, VolumeX,
} from 'lucide-react';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import HubPageShell from '../../../src/components/ui/HubPageShell';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { getFreshAccessToken } from '../../../src/lib/authUtils';
import { useBookmarks } from '../../../src/hooks/useAssistant';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { useModalHistory } from '../../../src/hooks/useModalHistory';
import useSandboxSounds from '../../../src/hooks/useSandboxSounds';
import PersonalAssistantCopyPolicy from '../../../src/components/personal-assistant/PersonalAssistantCopyPolicy';
import {
  readPersistenceResponse, persistenceMessage,
} from '../../../src/lib/personal-assistant/persistenceContract';
import {
  calculateEquityAsync, simulateRunoutsAsync, expandRangeToCombos,
} from '../../../src/lib/sandbox/EquityEngine';
import {
  useEquityWorker, DEFAULT_PREVIEW_TRIALS, DEFAULT_FULL_TRIALS,
} from '../../../src/hooks/useEquityWorker';
import { getRangeGrid, getRangePercentage } from '../../../src/lib/sandbox/PreflopCharts';
import {
  getArchetypeRangeString, getArchetypeVPIP, ARCHETYPE_CONFIG,
} from '../../../src/lib/sandbox/VillainArchetypeRanges';
import {
  getClubArenaTheme, onClubArenaThemeChange,
} from '../../../src/lib/clubArenaTheme';
import SandboxPokerTable, { TableCard } from '../../../src/components/sandbox/SandboxPokerTable';
import { handleSpatialGridKeyDown } from '../../../src/components/sandbox/spatialNavigation.mjs';
import {
  consumeReviewHandoffFromStorage, parseReviewHandoffPayload,
} from '../../../src/components/sandbox/reviewHandoff.mjs';
import { replayScenarioFromEntry } from '../../../src/components/sandbox/replayScenario.mjs';
import {
  T, F, S, R, btn, iconBtn, pill, cardCompact, sectionTitle, numeric as NUM,
} from '../../../src/components/sandbox/paTokens';
import {
  PAStyles as SharedPAStyles, BottomSheet, EmptyState, ErrorState,
  Skeleton, useAbortableFetch, isAbortError,
} from '../../../src/components/sandbox/paKit';
import {
  computeHandState, classifyBoardTexture,
  pruneAndRemapActionsOnVillainRemoval, pruneActionsToMaxVillains,
  ActionHistoryBuilder, StreetTimeline, ActionReplayBar,
  PreflopChartOverlay, RunoutChart, VillainReadCard,
} from '../../../src/components/sandbox/SandboxComponents';

// ═══════════════════════════════════════════════════════════════════════════
// CODE-SPLIT WORKSPACE PANELS (loaded on demand with accessible fallbacks)
// ═══════════════════════════════════════════════════════════════════════════
function ModalLoadingFallback({ label = 'Loading Panel…', height = 96 }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        display: 'flex', flexDirection: 'column', gap: S.xs,
        padding: S.sm, borderRadius: R.sm, background: T.surface2,
        border: `1px solid ${T.border}`,
      }}
    >
      <span style={{ fontSize: F.caption, fontWeight: 700, color: T.textMuted }}>{label}</span>
      <Skeleton h={height} />
    </div>
  );
}

const RangeHeatGrid = dynamic(
  () => import('../../../src/components/sandbox/RangeHeatGrid'),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Range Heat Grid…" height={180} /> },
);
const ExportCard = dynamic(
  () => import('../../../src/components/sandbox/ExportCard').then((m) => m.ExportCard),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Export Card…" height={72} /> },
);
const RangeExplorer = dynamic(
  () => import('../../../src/components/sandbox/RangeExplorer'),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Range Explorer…" height={180} /> },
);
const VillainPresetPicker = dynamic(
  () => import('../../../src/components/sandbox/VillainPresetPicker'),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Villain Presets…" height={140} /> },
);
const EquityHeatmapOverlay = dynamic(
  () => import('../../../src/components/sandbox/EquityHeatmapOverlay'),
  { ssr: false, loading: () => null },
);
const HandReplay = dynamic(
  () => import('../../../src/components/sandbox/HandReplay'),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Hand Replay…" height={140} /> },
);
const StudyFolders = dynamic(
  () => import('../../../src/components/sandbox/StudyFolders'),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Study Folders…" height={140} /> },
);
const SaveHandModal = dynamic(
  () => import('../../../src/components/sandbox/SaveHandModal'),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Save Hand…" height={140} /> },
);
const ShareScenarioModal = dynamic(
  () => import('../../../src/components/sandbox/ShareScenarioModal'),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Share Scenario…" height={140} /> },
);
const ImportHHModal = dynamic(
  () => import('../../../src/components/sandbox/ImportHHModal'),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Hand History Import…" height={140} /> },
);
const ExternalSolverImport = dynamic(
  () => import('../../../src/components/sandbox/ExternalSolverImport'),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Solver Import…" height={140} /> },
);
const SessionReport = dynamic(
  () => import('../../../src/components/sandbox/SessionReport'),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Session Report…" height={140} /> },
);
const SessionAnalytics = dynamic(
  () => import('../../../src/components/sandbox/SessionAnalytics'),
  { ssr: false, loading: () => <ModalLoadingFallback label="Loading Historical Stats…" height={140} /> },
);

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS & PURE HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
  { code: 's', symbol: '♠', label: 'Spades', color: '#F1F5FC' },
  { code: 'h', symbol: '♥', label: 'Hearts', color: '#FF6B7A' },
  { code: 'd', symbol: '♦', label: 'Diamonds', color: '#56D8FF' },
  { code: 'c', symbol: '♣', label: 'Clubs', color: '#4DE0A5' },
];
const GAME_TYPES = [
  { id: 'cash', label: 'Cash Game' },
  { id: 'tournament', label: 'Tournament' },
];
const FELT_COLORS = [
  { id: 'default', label: 'Obsidian', filter: 'none', swatch: '#040D18' },
  { id: 'green', label: 'Emerald', filter: 'hue-rotate(100deg) saturate(1.4)', swatch: '#166534' },
  { id: 'blue', label: 'Cobalt', filter: 'hue-rotate(200deg) saturate(1.3)', swatch: '#1E3A5F' },
  { id: 'red', label: 'Crimson', filter: 'hue-rotate(340deg) saturate(1.4)', swatch: '#7F1D1D' },
];
const MAX_VILLAINS = 5;
const DEFAULT_VILLAINS = [
  { id: 0, position: 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: 100, range: '' },
];

const DISCLOSED_LIMITS = [
  'Multiway Equity And Multiway Action Builder (2-6 Seats) Are Supported.',
  'Exact Historical Wager Sizes Are Parsed For Supported PokerStars, GGPoker, And Club Arena Formats (Malformed Or Unrecognized Formats Fall Back To Estimates).',
  'Authored Scenarios Remain Strictly Ungraded And Never Produce GTO Grades, Solver EV, Accuracy Scores, Streaks, Or Training Progress.',
];

const VERIFIED_DESTINATIONS = [
  {
    title: 'Open Verified Training Hub',
    description: 'Start A Signed Training Attempt With Server-Delivered Questions And Verified Grading.',
    href: '/hub/training?source=personal-assistant-sandbox',
    primary: true,
  },
  {
    title: 'Open Audited Spot Study',
    description: 'Inspect Answer-Revealed Solver Artifacts In An Explicitly Ungraded Study Utility.',
    href: '/hub/training/spot-trainer?source=personal-assistant-sandbox',
    primary: false,
  },
  {
    title: 'Open Hand History Audit',
    description: 'Upload Real Hands For Solver-Backed Verification That Preserves Its Evidence Boundary.',
    href: '/hub/training/hand-history-upload?source=personal-assistant-sandbox',
    primary: false,
  },
  {
    title: 'Open Leak Finder',
    description: 'Audit Persisted Club Arena Hands Against Verified Solver Evidence And Track Active Leaks.',
    href: '/hub/personal-assistant/leaks?source=personal-assistant-sandbox',
    primary: false,
  },
];

const FULL_DECK = RANKS.flatMap((r) => SUITS.map((s) => `${r}${s.code}`));

function makeAbortHandle() {
  if (typeof AbortController === 'undefined') return { signal: undefined, abort: () => {} };
  const ctrl = new AbortController();
  return {
    signal: ctrl.signal,
    abort: () => {
      try { ctrl.abort(); } catch (_e) { /* already aborted */ }
    },
  };
}

function withVillainIds(list) {
  return (Array.isArray(list) ? list : []).map((v, idx) => ({
    ...v,
    id: v?.id ?? idx,
    position: v?.position || 'BB',
    stack: Number.isFinite(Number(v?.stack)) ? Number(v.stack) : 100,
    archetype: v?.archetype || { id: 'gto_neutral', name: 'GTO Neutral' },
    range: typeof v?.range === 'string' ? v.range : '',
  }));
}

function boardToArray(board) {
  if (!board) return [];
  if (Array.isArray(board)) return board.filter(Boolean);
  return [...(board.flop || []), board.turn, board.river].filter(Boolean);
}

function streetOfBoard(board) {
  const cards = boardToArray(board);
  if (cards.length >= 5) return 'river';
  if (cards.length === 4) return 'turn';
  if (cards.length >= 3) return 'flop';
  return 'preflop';
}

function pickRandomCards(count, exclude = []) {
  const used = new Set(exclude.filter(Boolean));
  const pool = FULL_DECK.filter((c) => !used.has(c));
  const out = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function describeHeroHand(heroHand) {
  if (!heroHand?.card1 || !heroHand?.card2) return null;
  const r1 = heroHand.card1[0]?.toUpperCase();
  const r2 = heroHand.card2[0]?.toUpperCase();
  if (!r1 || !r2) return null;
  const suited = heroHand.card1[1]?.toLowerCase() === heroHand.card2[1]?.toLowerCase();
  const i1 = RANKS.indexOf(r1);
  const i2 = RANKS.indexOf(r2);
  if (i1 < 0 || i2 < 0) return null;
  const [hi, lo] = i1 <= i2 ? [r1, r2] : [r2, r1];
  if (hi === lo) return `${hi}${lo} Pocket Pair`;
  return `${hi}${lo}${suited ? 's Suited' : 'o Offsuit'}`;
}

const MemoSandboxPokerTable = memo(SandboxPokerTable);

// ═══════════════════════════════════════════════════════════════════════════
// CARD SLOT HELPER (Single persistent <button> ref preserves focus return)
// ═══════════════════════════════════════════════════════════════════════════
function CardSlot({ card, label, onTap, onRemove }) {
  const buttonRef = useRef(null);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        ref={buttonRef}
        type="button"
        className="pa-btn"
        onClick={onTap}
        aria-label={card ? `Change ${card}` : (label ? `Pick ${label} Card` : 'Pick Board Card')}
        style={card ? {
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          width: 52, height: 72, borderRadius: R.sm,
        } : {
          width: 52, height: 72, borderRadius: R.sm, cursor: 'pointer', flexShrink: 0,
          background: T.accentSoft, border: '2px dashed rgba(99,231,255,0.42)',
          color: T.accent, fontSize: F.caption, fontWeight: 700,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 2, boxSizing: 'border-box',
        }}
      >
        {card ? (
          <TableCard card={card} style={{ width: 52, height: 72 }} />
        ) : (
          <>
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            <span>{label || 'Card'}</span>
          </>
        )}
      </button>
      {card && onRemove && (
        <button
          type="button"
          className="pa-btn"
          onClick={onRemove}
          aria-label={`Remove ${card}`}
          style={{
            position: 'absolute', top: -14, right: -14, width: 36, height: 36, minWidth: 36, minHeight: 36,
            borderRadius: '50%', background: 'transparent', border: 'none',
            color: '#F1F5FC', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', padding: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 24, height: 24, borderRadius: '50%',
              background: T.danger, border: '2px solid #040D18',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <XIcon size={12} strokeWidth={3} aria-hidden="true" />
          </span>
        </button>
      )}
    </span>
  );
}

const MOBILE_RANK_ROWS = [
  RANKS.slice(0, 5),
  RANKS.slice(5, 10),
  RANKS.slice(10),
];
const MOBILE_SUIT_ROWS = [
  SUITS.slice(0, 2),
  SUITS.slice(2, 4),
];

// ═══════════════════════════════════════════════════════════════════════════
// CARD PICKER SHEET (CSS-only responsive + Spatial Keyboard Navigation)
// Composite role="grid"/role="gridcell", roving tabindex, edge-based
// getBoundingClientRect() arrow movement, scrollIntoView, Esc focus restore.
// ═══════════════════════════════════════════════════════════════════════════
function CardPickerSheet({
  isOpen, onClose, onSelect, usedCards = [], mode, pickProgress, onRandomCard, onRandomFlop,
}) {
  const [rank, setRank] = useState(null);
  const [activeDesktopCard, setActiveDesktopCard] = useState(null);
  const [activeMobileRank, setActiveMobileRank] = useState(null);
  const [activeMobileSuit, setActiveMobileSuit] = useState(null);
  const desktopGridRef = useRef(null);
  const mobileRankGridRef = useRef(null);
  const mobileSuitGridRef = useRef(null);
  const returnFocusElRef = useRef(null);
  const prevRankRef = useRef(null);

  const used = useMemo(() => new Set(usedCards || []), [usedCards]);
  const freeCountFor = useCallback((r) => SUITS.filter((s) => !used.has(`${r}${s.code}`)).length, [used]);

  const firstFreeCard = useMemo(() => {
    for (const s of SUITS) {
      for (const r of RANKS) {
        const code = `${r}${s.code}`;
        if (!used.has(code)) return code;
      }
    }
    return null;
  }, [used]);

  const firstFreeRank = useMemo(() => RANKS.find((r) => freeCountFor(r) > 0) || null, [freeCountFor]);

  const firstFreeSuitForRank = useMemo(() => {
    if (!rank) return null;
    const found = SUITS.find((s) => !used.has(`${rank}${s.code}`));
    return found ? `${rank}${found.code}` : null;
  }, [rank, used]);

  useEffect(() => {
    if (isOpen && typeof document !== 'undefined') {
      returnFocusElRef.current = document.activeElement;
    }
    if (!isOpen) {
      setRank(null);
      prevRankRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    const prevRank = prevRankRef.current;
    prevRankRef.current = rank;
    if (!isOpen || prevRank === rank) return;
    if (rank) {
      const target = mobileSuitGridRef.current?.querySelector('button[role="gridcell"][tabindex="0"]:not([disabled])')
        || mobileSuitGridRef.current?.querySelector('button[role="gridcell"]:not([disabled])');
      target?.focus?.({ preventScroll: true });
    } else if (prevRank) {
      const target = mobileRankGridRef.current?.querySelector(`button[data-rank-code="${prevRank}"]:not([disabled])`)
        || mobileRankGridRef.current?.querySelector('button[role="gridcell"][tabindex="0"]:not([disabled])')
        || mobileRankGridRef.current?.querySelector('button[role="gridcell"]:not([disabled])');
      target?.focus?.({ preventScroll: true });
    }
  }, [isOpen, rank]);

  useEffect(() => {
    if (!activeDesktopCard || used.has(activeDesktopCard)) {
      setActiveDesktopCard(firstFreeCard);
    }
  }, [activeDesktopCard, used, firstFreeCard]);

  useEffect(() => {
    if (!activeMobileRank || freeCountFor(activeMobileRank) === 0) {
      setActiveMobileRank(firstFreeRank);
    }
  }, [activeMobileRank, freeCountFor, firstFreeRank]);

  useEffect(() => {
    if (rank && (!activeMobileSuit || !activeMobileSuit.startsWith(rank) || used.has(activeMobileSuit))) {
      setActiveMobileSuit(firstFreeSuitForRank);
    }
  }, [rank, activeMobileSuit, used, firstFreeSuitForRank]);

  const handleCloseWithRestore = useCallback(() => {
    const prevEl = returnFocusElRef.current;
    onClose?.();
    if (prevEl && typeof prevEl.focus === 'function') {
      setTimeout(() => {
        try { prevEl.focus({ preventScroll: true }); } catch (_e) { /* detached */ }
      }, 0);
    }
  }, [onClose]);

  const pick = (cardStr) => {
    if (used.has(cardStr)) return;
    setRank(null);
    onSelect(cardStr);
  };

  const onDesktopGridKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCloseWithRestore();
      return;
    }
    handleSpatialGridKeyDown(e, {
      container: desktopGridRef.current,
      itemSelector: 'button[role="gridcell"]:not([disabled])',
      onMove: (el) => {
        const code = el?.getAttribute?.('data-card-code');
        if (code) setActiveDesktopCard(code);
      },
    });
  }, [handleCloseWithRestore]);

  const onMobileRankKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCloseWithRestore();
      return;
    }
    handleSpatialGridKeyDown(e, {
      container: mobileRankGridRef.current,
      itemSelector: 'button[role="gridcell"]:not([disabled])',
      onMove: (el) => {
        const r = el?.getAttribute?.('data-rank-code');
        if (r) setActiveMobileRank(r);
      },
    });
  }, [handleCloseWithRestore]);

  const onMobileSuitKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setRank(null);
      return;
    }
    handleSpatialGridKeyDown(e, {
      container: mobileSuitGridRef.current,
      itemSelector: 'button[role="gridcell"]:not([disabled])',
      onMove: (el) => {
        const code = el?.getAttribute?.('data-card-code');
        if (code) setActiveMobileSuit(code);
      },
    });
  }, []);

  const isHero = mode === 'hero';
  const title = isHero
    ? `Pick Hero Card ${pickProgress || 1} Of 2`
    : mode === 'board'
      ? 'Select Board Card'
      : 'Select Card';

  return (
    <BottomSheet
      open={isOpen}
      onClose={handleCloseWithRestore}
      onBeforeEscape={() => {
        if (rank != null) {
          setRank(null);
          return true;
        }
        return false;
      }}
      title={title}
      subtitle={rank ? `Choose A Suit For ${rank}` : 'Choose Rank And Suit (Arrow Keys Navigate Grid)'}
      ariaLabel={title}
      maxWidth={680}
      footer={(
        <>
          {onRandomCard && (
            <button type="button" className="pa-btn" onClick={onRandomCard} style={{ ...btn('secondary'), flex: 1 }}>
              <Shuffle size={16} strokeWidth={2} aria-hidden="true" /> Random Card
            </button>
          )}
          {onRandomFlop && mode === 'board' && (
            <button type="button" className="pa-btn" onClick={onRandomFlop} style={{ ...btn('secondary'), flex: 1 }}>
              Random Flop
            </button>
          )}
          <button type="button" className="pa-btn" onClick={handleCloseWithRestore} style={{ ...btn('primary'), flex: 1 }}>
            Done
          </button>
        </>
      )}
    >
      {/* Mobile two-step rank -> suit */}
      <div className="deck-mobile-only">
        {!rank ? (
          <div
            ref={mobileRankGridRef}
            role="grid"
            aria-label="Select Card Rank"
            onKeyDown={onMobileRankKeyDown}
            style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}
          >
            {MOBILE_RANK_ROWS.map((rowRanks, rowIdx) => (
              <div
                key={`rank-row-${rowIdx}`}
                role="row"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: S.sm }}
              >
                {rowRanks.map((r) => {
                  const free = freeCountFor(r);
                  const isRovingActive = activeMobileRank === r && free > 0;
                  return (
                    <button
                      key={r}
                      type="button"
                      role="gridcell"
                      data-rank-code={r}
                      tabIndex={isRovingActive ? 0 : -1}
                      className="pa-btn"
                      disabled={free === 0}
                      onFocus={() => setActiveMobileRank(r)}
                      onClick={() => setRank(r)}
                      aria-label={`Rank ${r}, ${free} Suits Available`}
                      style={{
                        ...btn('secondary', { disabled: free === 0 }),
                        minHeight: 52, minWidth: 44, padding: 0, flexDirection: 'column', gap: 2,
                        fontSize: 18, fontWeight: 800,
                      }}
                    >
                      <span>{r}</span>
                      <span style={{ fontSize: F.caption, color: T.textDim }}>{free}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
            <button
              type="button"
              className="pa-btn"
              onClick={() => setRank(null)}
              style={{ ...btn('ghost'), alignSelf: 'flex-start', color: T.accent }}
            >
              Back To Ranks
            </button>
            <div
              ref={mobileSuitGridRef}
              role="grid"
              aria-label={`Select Suit For ${rank}`}
              onKeyDown={onMobileSuitKeyDown}
              style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}
            >
              {MOBILE_SUIT_ROWS.map((rowSuits, rowIdx) => (
                <div
                  key={`suit-row-${rowIdx}`}
                  role="row"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: S.sm }}
                >
                  {rowSuits.map((s) => {
                    const code = `${rank}${s.code}`;
                    const taken = used.has(code);
                    const isRovingActive = activeMobileSuit === code && !taken;
                    return (
                      <button
                        key={s.code}
                        type="button"
                        role="gridcell"
                        data-card-code={code}
                        tabIndex={isRovingActive ? 0 : -1}
                        className="pa-btn"
                        disabled={taken}
                        onFocus={() => setActiveMobileSuit(code)}
                        onClick={() => pick(code)}
                        aria-label={`${rank} Of ${s.label}`}
                        style={{
                          ...btn('secondary', { disabled: taken }),
                          minHeight: 56, minWidth: 44, fontSize: 18, fontWeight: 800, color: taken ? T.textDim : s.color,
                        }}
                      >
                        <span>{rank}{s.symbol} {s.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Desktop full 4x13 grid with roving tabindex + spatial arrow navigation */}
      <div className="deck-desktop-only" style={{ overflowX: 'auto' }}>
        <div
          ref={desktopGridRef}
          role="grid"
          aria-label="52-Card Deck Grid"
          onKeyDown={onDesktopGridKeyDown}
          style={{ display: 'flex', flexDirection: 'column', gap: S.xs, minWidth: 520 }}
        >
          {SUITS.map((s) => (
            <div
              key={s.code}
              role="row"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(13, minmax(36px, 1fr))', gap: 4 }}
            >
              {RANKS.map((r) => {
                const code = `${r}${s.code}`;
                const taken = used.has(code);
                const isRovingActive = activeDesktopCard === code && !taken;
                return (
                  <button
                    key={code}
                    type="button"
                    role="gridcell"
                    data-card-code={code}
                    tabIndex={isRovingActive ? 0 : -1}
                    className="pa-btn"
                    disabled={taken}
                    onFocus={() => setActiveDesktopCard(code)}
                    onClick={() => pick(code)}
                    aria-label={`${r} Of ${s.label}`}
                    style={{
                      ...btn('secondary', { disabled: taken }),
                      minWidth: 36, minHeight: 44, padding: 0,
                      fontSize: F.label, fontWeight: 800,
                      color: taken ? T.textDim : s.color,
                      opacity: taken ? 0.35 : 1,
                    }}
                  >
                    <span>{r}{s.symbol}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE SETUP SHEET (Positions, Stacks, Multi-Villain Seats, Felt)
// ═══════════════════════════════════════════════════════════════════════════
function SetupSheet({
  isOpen, onClose,
  heroPosition, setHeroPosition,
  gameType, setGameType,
  heroStack, setHeroStack,
  potBase, setPotBase,
  villains, onVillainPatch, onVillainArchetype, onAddVillain, onRemoveVillain,
  onOpenPresets, onOpenRanges,
  tableFelt, onChangeFelt, arenaThemeActive,
  equityVsRange, setEquityVsRange,
}) {
  const archetypes = useMemo(
    () => Object.entries(ARCHETYPE_CONFIG || {}).map(([id, cfg]) => ({ id, name: cfg?.name || id })),
    [],
  );

  return (
    <BottomSheet
      open={isOpen}
      onClose={onClose}
      title="Table Setup"
      titleIcon={<SlidersHorizontal size={18} strokeWidth={2} color={T.accent} />}
      subtitle="Configure Game Format, Stacks, Positions And Multiway Villains."
      ariaLabel="Table setup"
      maxWidth={680}
      footer={(
        <button type="button" className="pa-btn" onClick={onClose} style={btn('primary', { block: true })}>
          Apply To Table
        </button>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.lg }}>
        {/* Game Type */}
        <div>
          <div style={sectionTitle}>Format</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: S.sm }}>
            {GAME_TYPES.map((g) => {
              const active = gameType === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  className="pa-btn"
                  aria-pressed={active}
                  onClick={() => setGameType(g.id)}
                  style={{
                    ...btn(active ? 'primary' : 'secondary'),
                    width: '100%',
                  }}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hero Position */}
        <div>
          <div style={sectionTitle}>Hero Position</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: S.xs }}>
            {POSITIONS.map((pos) => {
              const active = heroPosition === pos;
              return (
                <button
                  key={pos}
                  type="button"
                  className="pa-btn"
                  aria-pressed={active}
                  onClick={() => setHeroPosition(pos)}
                  style={{
                    ...btn(active ? 'primary' : 'secondary'),
                    minWidth: 0, padding: '0 6px', fontSize: F.label,
                  }}
                >
                  {pos}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hero Stack & Base Pot */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: S.md }}>
          <div>
            <label htmlFor="setup-hero-stack" style={{ ...sectionTitle, display: 'block' }}>Hero Stack (BB)</label>
            <input
              id="setup-hero-stack"
              type="number"
              min={5}
              max={1000}
              value={heroStack}
              onChange={(e) => setHeroStack(Math.max(5, Math.min(1000, Number(e.target.value) || 100)))}
              style={{
                width: '100%', minHeight: 44, padding: '8px 12px', boxSizing: 'border-box',
                background: T.surface2, border: `1px solid ${T.borderHi}`, borderRadius: R.sm,
                color: T.text, fontSize: F.input, ...NUM,
              }}
            />
          </div>
          <div>
            <label htmlFor="setup-pot-base" style={{ ...sectionTitle, display: 'block' }}>Starting Pot (BB)</label>
            <input
              id="setup-pot-base"
              type="number"
              min={1}
              max={500}
              step={0.5}
              value={potBase}
              onChange={(e) => setPotBase(Math.max(1, Math.min(500, Number(e.target.value) || 6.5)))}
              style={{
                width: '100%', minHeight: 44, padding: '8px 12px', boxSizing: 'border-box',
                background: T.surface2, border: `1px solid ${T.borderHi}`, borderRadius: R.sm,
                color: T.text, fontSize: F.input, ...NUM,
              }}
            />
          </div>
        </div>

        {/* Equity Calculation Mode */}
        <div style={{ ...cardCompact, background: T.surface2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: F.bodySm, fontWeight: 700, color: T.text }}>Equity Versus Villain Ranges</div>
              <div style={{ fontSize: F.caption, color: T.textMuted }}>
                Multiway Equity Runs Against Every Seated Villain Range.
              </div>
            </div>
            <button
              type="button"
              className="pa-btn"
              aria-pressed={equityVsRange}
              onClick={() => setEquityVsRange((v) => !v)}
              style={{
                ...btn(equityVsRange ? 'primary' : 'secondary'),
                padding: '0 14px', fontSize: F.label,
              }}
            >
              {equityVsRange ? 'Ranges On' : 'Random Hands'}
            </button>
          </div>
        </div>

        {/* Multi-Villain Seats */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, marginBottom: S.sm }}>
            <span style={{ ...sectionTitle, marginBottom: 0 }}>Villain Seats ({villains.length}/{MAX_VILLAINS})</span>
            {villains.length < MAX_VILLAINS && (
              <button type="button" className="pa-btn" onClick={onAddVillain} style={{ ...btn('secondary'), padding: '0 12px', fontSize: F.caption }}>
                <Plus size={14} strokeWidth={2.5} aria-hidden="true" /> Add Villain
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
            {villains.map((v, idx) => (
              <div key={v.id ?? idx} style={{ ...cardCompact, background: T.surface2, display: 'flex', flexDirection: 'column', gap: S.sm }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm }}>
                  <span style={{ fontSize: F.bodySm, fontWeight: 800, color: T.text }}>
                    Villain {idx + 1} · {v.position}
                  </span>
                  {villains.length > 1 && (
                    <button
                      type="button"
                      className="pa-btn"
                      onClick={() => onRemoveVillain(idx)}
                      aria-label={`Remove Villain ${idx + 1}`}
                      style={{ ...btn('danger'), minHeight: 36, padding: '0 10px', fontSize: F.caption }}
                    >
                      <Trash2 size={14} strokeWidth={2} aria-hidden="true" /> Remove
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: S.sm }}>
                  <div>
                    <label htmlFor={`v-pos-${idx}`} style={{ fontSize: F.caption, color: T.textDim, display: 'block', marginBottom: 4 }}>Position</label>
                    <select
                      id={`v-pos-${idx}`}
                      value={v.position}
                      onChange={(e) => onVillainPatch(idx, { position: e.target.value })}
                      style={{
                        width: '100%', minHeight: 44, padding: '0 8px',
                        background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: R.sm,
                        color: T.text, fontSize: F.label,
                      }}
                    >
                      {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`v-arch-${idx}`} style={{ fontSize: F.caption, color: T.textDim, display: 'block', marginBottom: 4 }}>Archetype</label>
                    <select
                      id={`v-arch-${idx}`}
                      value={v.archetype?.id || 'gto_neutral'}
                      onChange={(e) => onVillainArchetype(idx, e.target.value)}
                      style={{
                        width: '100%', minHeight: 44, padding: '0 8px',
                        background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: R.sm,
                        color: T.text, fontSize: F.label,
                      }}
                    >
                      {archetypes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`v-stack-${idx}`} style={{ fontSize: F.caption, color: T.textDim, display: 'block', marginBottom: 4 }}>Stack (BB)</label>
                    <input
                      id={`v-stack-${idx}`}
                      type="number"
                      min={5}
                      max={1000}
                      value={v.stack ?? 100}
                      onChange={(e) => onVillainPatch(idx, { stack: Math.max(5, Math.min(1000, Number(e.target.value) || 100)) })}
                      style={{
                        width: '100%', minHeight: 44, padding: '0 8px', boxSizing: 'border-box',
                        background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: R.sm,
                        color: T.text, fontSize: F.input, ...NUM,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap', marginTop: S.sm }}>
            <button type="button" className="pa-btn" onClick={onOpenPresets} style={{ ...btn('secondary'), flex: '1 1 140px' }}>
              <Users size={16} strokeWidth={2} aria-hidden="true" /> Villain Presets
            </button>
            <button type="button" className="pa-btn" onClick={onOpenRanges} style={{ ...btn('secondary'), flex: '1 1 140px' }}>
              <LayoutGrid size={16} strokeWidth={2} aria-hidden="true" /> Edit 13x13 Ranges
            </button>
          </div>
        </div>

        {/* Table Felt Tint */}
        <div>
          <div style={sectionTitle}>
            Table Felt {arenaThemeActive ? '(Club Arena Theme Active)' : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: S.sm }}>
            {FELT_COLORS.map((f) => {
              const active = tableFelt === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  className="pa-btn"
                  disabled={arenaThemeActive}
                  aria-pressed={active}
                  onClick={() => onChangeFelt(f.id)}
                  style={{
                    ...btn('secondary', { disabled: arenaThemeActive }),
                    padding: '0 8px', fontSize: F.caption,
                    borderColor: active ? T.accent : T.borderHi,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: f.swatch, border: `1px solid ${T.borderHi}`, flexShrink: 0,
                    }}
                  />
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES SHEET (Backed by /api/assistant/sandbox/sandbox-templates)
// ═══════════════════════════════════════════════════════════════════════════
function TemplatesSheet({
  isOpen, onClose, templates, status, error, saving, onReload, onSave, onLoad, onDelete,
}) {
  const [name, setName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    onSave(clean, () => setName(''));
  };

  return (
    <BottomSheet
      open={isOpen}
      onClose={onClose}
      title="Scenario Templates"
      titleIcon={<Bookmark size={18} strokeWidth={2} color={T.accent} />}
      subtitle="Save Reusable Table Setups And Reload Them Anytime."
      ariaLabel="Scenario templates"
      maxWidth={640}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
          <label htmlFor="tpl-name-input" className="pa-vh">Template Name</label>
          <input
            id="tpl-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BTN vs BB 3-Bet Flop"
            style={{
              flex: '1 1 180px', minHeight: 44, padding: '8px 12px', boxSizing: 'border-box',
              background: T.surface2, border: `1px solid ${T.borderHi}`, borderRadius: R.sm,
              color: T.text, fontSize: F.input,
            }}
          />
          <button
            type="submit"
            className="pa-btn"
            disabled={saving || !name.trim()}
            style={btn('primary', { disabled: saving || !name.trim() })}
          >
            {saving ? 'Saving…' : 'Save Current'}
          </button>
        </form>

        {status === 'loading' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
            <Skeleton h={56} />
            <Skeleton h={56} />
          </div>
        ) : status === 'auth' ? (
          <EmptyState
            icon={<Bookmark size={20} strokeWidth={2} />}
            title="Sign In To Use Templates"
            body="Templates Sync To Your Account Across Devices."
          />
        ) : status === 'error' ? (
          <ErrorState title="Templates Unavailable" body={error || 'Could Not Load Templates.'} onRetry={onReload} />
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<Bookmark size={20} strokeWidth={2} />}
            title="No Templates Saved Yet"
            body="Name Your Current Table Setup Above To Save Your First Template."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
            {templates.map((tpl) => {
              const confirming = confirmDeleteId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  style={{
                    ...cardCompact, background: T.surface2,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontSize: F.bodySm, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tpl.name}
                    </div>
                    <div style={{ fontSize: F.caption, color: T.textDim }}>
                      {tpl.scenario_json?.heroPosition || 'BTN'} · {tpl.scenario_json?.gameType === 'tournament' ? 'Tournament' : 'Cash'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: S.xs }}>
                    <button type="button" className="pa-btn" onClick={() => onLoad(tpl)} style={{ ...btn('secondary'), padding: '0 12px', fontSize: F.label }}>
                      Load
                    </button>
                    {confirming ? (
                      <button
                        type="button"
                        className="pa-btn"
                        onClick={() => { setConfirmDeleteId(null); onDelete(tpl.id); }}
                        style={{ ...btn('danger'), padding: '0 12px', fontSize: F.label }}
                      >
                        Confirm
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="pa-btn"
                        onClick={() => setConfirmDeleteId(tpl.id)}
                        aria-label={`Delete ${tpl.name}`}
                        style={{ ...btn('danger'), width: 44, padding: 0 }}
                      >
                        <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VIRTUAL SANDBOX PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function VirtualSandboxPage() {
  const router = useRouter();
  const { user, initializing: authInitializing } = useAvatar();
  const userId = user?.id || null;
  const haptic = useHaptics();
  const { soundEnabled, toggleSound, playCardDeal, playChipClick } = useSandboxSounds();
  const playSound = useCallback((kind) => {
    if (kind === 'card' || kind === 'cardDeal') playCardDeal?.();
    else playChipClick?.();
  }, [playCardDeal, playChipClick]);

  // ── Navigation & Active-Play Gate State ──
  const [showMenu, setShowMenu] = useState(false);
  const [activePlayBlock, setActivePlayBlock] = useState(null);
  const [accessStatus, setAccessStatus] = useState('idle'); // idle | checking | open | blocked | unknown
  const accessReqIdRef = useRef(0);
  const requestAccessCheck = useAbortableFetch(12000);
  const requestReviewHandoff = useAbortableFetch(12000);
  const consumedReviewIdRef = useRef(null);
  const [reviewHandoffSource, setReviewHandoffSource] = useState(null);

  // ── Core Poker Table & Scenario State ──
  const [gameType, setGameType] = useState('cash');
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [heroStack, setHeroStack] = useState(100);
  const [potBase, setPotBase] = useState(6.5);
  const [heroHand, setHeroHand] = useState({ card1: 'Ah', card2: 'Kd' });
  const [board, setBoard] = useState({ flop: ['Kh', '7c', '2d'], turn: null, river: null });
  const [villains, setVillains] = useState(() => withVillainIds(DEFAULT_VILLAINS));
  const [activeVillainIdx, setActiveVillainIdx] = useState(0);
  const [actionHistory, setActionHistory] = useState([]);
  const [preflopPosts, setPreflopPosts] = useState([]);
  const [replayIndex, setReplayIndex] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [tableFelt, setTableFelt] = useState('default');
  const [arenaTheme, setArenaTheme] = useState(null);

  // ── Equity & Runout Engine State ──
  const [equityVsRange, setEquityVsRange] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [runouts, setRunouts] = useState(null);
  const [runoutsComputing, setRunoutsComputing] = useState(false);
  const [preflopScenario, setPreflopScenario] = useState('rfi');
  const equityReqIdRef = useRef(0);
  const runoutReqIdRef = useRef(0);

  // ── Sitting Exploration Log (Ungraded Snapshots Only) ──
  const sessionStartedAtRef = useRef(Date.now());
  const [sessionLog, setSessionLog] = useState([]);

  // ── Sheet & Modal Toggles ──
  const [showDeck, setShowDeck] = useState(false);
  const [deckTarget, setDeckTarget] = useState(null); // 'hero' | 'board' | { kind:'flop', idx } | 'turn' | 'river'
  const [heroPickStep, setHeroPickStep] = useState(1);
  const [showSetup, setShowSetup] = useState(false);
  const [showRangeExplorer, setShowRangeExplorer] = useState(false);
  const [showRangeHeatGrid, setShowRangeHeatGrid] = useState(false);
  const [showVillainPresets, setShowVillainPresets] = useState(false);
  const [showSaveHand, setShowSaveHand] = useState(false);
  const [showStudyFolders, setShowStudyFolders] = useState(false);
  const [showImportHH, setShowImportHH] = useState(false);
  const [showSolverImport, setShowSolverImport] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showHandReplay, setShowHandReplay] = useState(false);
  const [showShareScenario, setShowShareScenario] = useState(false);
  const [showSessionReport, setShowSessionReport] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // ── Templates State ──
  const [templates, setTemplates] = useState([]);
  const [templatesStatus, setTemplatesStatus] = useState('idle');
  const [templatesError, setTemplatesError] = useState(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const templatesReqIdRef = useRef(0);
  const requestTemplates = useAbortableFetch(12000);
  const requestTemplateWrite = useAbortableFetch(12000);

  // ── Canonical Account Bookmarks (waits for !authInitializing) ──
  const {
    bookmarks,
    isLoading: bookmarksLoading,
    error: bookmarksError,
    refetch: refetchBookmarks,
  } = useBookmarks(15, { userId, ready: !authInitializing });

  // ── Back-button history for overlays ──
  const closeMenu = useCallback(() => setShowMenu(false), []);
  const closeSetup = useCallback(() => setShowSetup(false), []);
  const closeDeck = useCallback(() => { setShowDeck(false); setDeckTarget(null); }, []);
  const closeRangeHeatGrid = useCallback(() => setShowRangeHeatGrid(false), []);
  useModalHistory(showMenu, closeMenu);
  useModalHistory(showSetup, closeSetup);
  useModalHistory(showDeck, closeDeck);
  useModalHistory(showRangeHeatGrid, closeRangeHeatGrid);

  // ── Club Arena Table Theme Sync ──
  useEffect(() => {
    setArenaTheme(getClubArenaTheme());
    const unsub = onClubArenaThemeChange((next) => setArenaTheme(next));
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // ── Server-Enforced Active-Play Gate Check (waits for !authInitializing) ──
  const checkLivePlayGate = useCallback(async () => {
    if (authInitializing) return;
    if (!userId) {
      setActivePlayBlock(null);
      setAccessStatus('open');
      return;
    }
    const reqId = ++accessReqIdRef.current;
    setAccessStatus('checking');
    try {
      const token = await getFreshAccessToken();
      if (reqId !== accessReqIdRef.current) return;
      if (!token) {
        setActivePlayBlock(null);
        setAccessStatus('open');
        return;
      }
      const res = await requestAccessCheck('/api/sandbox/saved-hands', {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 12000,
      });
      if (reqId !== accessReqIdRef.current) return;
      const json = await res.json().catch(() => null);
      if (reqId !== accessReqIdRef.current) return;

      if (res.status === 403 && json?.blocked) {
        setActivePlayBlock({
          contextState: json.contextState || 'live_play',
          message: json.error || 'Sandbox Is Unavailable During Active Play.',
        });
        setAccessStatus('blocked');
        return;
      }
      setActivePlayBlock(null);
      setAccessStatus(res.ok ? 'open' : 'unknown');
    } catch (err) {
      if (isAbortError(err) || reqId !== accessReqIdRef.current) return;
      setAccessStatus('unknown');
    }
  }, [authInitializing, userId, requestAccessCheck]);

  useEffect(() => {
    checkLivePlayGate();
  }, [checkLivePlayGate]);

  // ── Derived Table Values ──
  const communityCards = useMemo(() => boardToArray(board), [board]);
  const currentStreet = useMemo(() => streetOfBoard(board), [board]);
  const heroCardsMemo = useMemo(
    () => [heroHand?.card1, heroHand?.card2].filter(Boolean),
    [heroHand],
  );
  const allUsedCards = useMemo(
    () => [...heroCardsMemo, ...communityCards],
    [heroCardsMemo, communityCards],
  );
  const boardTexture = useMemo(
    () => (communityCards.length >= 3 ? classifyBoardTexture(communityCards) : null),
    [communityCards],
  );

  const safeVillainIdx = Math.min(activeVillainIdx, Math.max(0, villains.length - 1));
  const primaryVillain = villains[safeVillainIdx] || villains[0] || DEFAULT_VILLAINS[0];

  const resolvedVillainRanges = useMemo(() => villains.map((v) => {
    if (v?.range && v.range.trim()) return v.range.trim();
    const archId = v?.archetype?.id || 'gto_neutral';
    return getArchetypeRangeString(archId, v?.position || 'BB', 'open') || '';
  }), [villains]);

  const activeVillainRange = resolvedVillainRanges[safeVillainIdx] || '';

  const handState = useMemo(() => computeHandState({
    basePot: Number(potBase) || 6.5,
    heroPosition,
    villainPosition: primaryVillain?.position || 'BB',
    heroStack: Number(heroStack) || 100,
    villainStack: Number(primaryVillain?.stack) || 100,
    villains,
    street: currentStreet,
    actions: actionHistory,
    preflopPosts,
  }), [potBase, heroPosition, heroStack, primaryVillain, villains, currentStreet, actionHistory, preflopPosts]);

  const replayState = useMemo(() => {
    if (replayIndex == null || replayIndex < 0 || replayIndex >= actionHistory.length) return null;
    const sliced = actionHistory.slice(0, replayIndex + 1);
    const st = computeHandState({
      basePot: Number(potBase) || 6.5,
      heroPosition,
      villainPosition: primaryVillain?.position || 'BB',
      heroStack: Number(heroStack) || 100,
      villainStack: Number(primaryVillain?.stack) || 100,
      villains,
      street: currentStreet,
      actions: sliced,
      preflopPosts,
    });
    const lastStreet = sliced[sliced.length - 1]?.street || 'preflop';
    const cards = lastStreet === 'preflop'
      ? []
      : lastStreet === 'flop'
        ? communityCards.slice(0, 3)
        : lastStreet === 'turn'
          ? communityCards.slice(0, 4)
          : communityCards;
    return { handState: st, cards, street: lastStreet };
  }, [replayIndex, actionHistory, potBase, heroPosition, heroStack, primaryVillain, villains, currentStreet, communityCards, preflopPosts]);

  const streetHistory = useMemo(() => {
    const order = ['preflop', 'flop', 'turn', 'river'];
    const grouped = { preflop: [], flop: [], turn: [], river: [] };
    actionHistory.forEach((a, idx) => {
      const key = String(a?.street || 'preflop').toLowerCase();
      if (grouped[key]) grouped[key].push({ ...a, index: idx });
    });
    return order
      .filter((key) => grouped[key].length > 0)
      .map((key) => ({ street: key, actions: grouped[key] }));
  }, [actionHistory]);

  const preflopRangeGrid = useMemo(
    () => getRangeGrid(heroPosition, preflopScenario),
    [heroPosition, preflopScenario],
  );
  const preflopRangePercent = useMemo(
    () => getRangePercentage(heroPosition, preflopScenario),
    [heroPosition, preflopScenario],
  );

  const tableVillains = useMemo(() => {
    const activeState = replayState ? replayState.handState : handState;
    return villains.map((v, i) => {
      const seatKey = villains.length >= 2 ? `villain_${i}` : 'villain';
      const seat = activeState?.players?.find((p) => p.key === seatKey);
      return {
        ...v,
        id: v.id ?? i,
        stack: seat ? Math.round(seat.remaining) : (Number(v.stack) || 100),
        folded: Boolean(seat?.folded),
        archetypeName: v.archetype?.name || 'GTO Neutral',
        vpip: getArchetypeVPIP(v.archetype?.id || 'gto_neutral', v.position || 'BB'),
      };
    });
  }, [villains, handState, replayState]);

  const heroClassLabel = useMemo(() => describeHeroHand(heroHand), [heroHand]);

  // ── Progressive Worker Equity + Instant Cancellation (500 preview -> 10,000 convergence) ──
  const equityRangeArg = useMemo(() => (
    !equityVsRange
      ? (villains.length >= 2 ? { villains: villains.map(() => null) } : null)
      : villains.length >= 2
        ? { villains: resolvedVillainRanges }
        : (resolvedVillainRanges[0] || null)
  ), [equityVsRange, villains.length, resolvedVillainRanges]);

  const {
    equity,
    computing: equityComputing,
    refining: equityRefining,
    workerReady,
  } = useEquityWorker({
    heroCards: heroCardsMemo,
    boardCards: communityCards,
    rangeArg: equityRangeArg,
    enabled: !activePlayBlock,
    previewTrials: DEFAULT_PREVIEW_TRIALS,
    fullTrials: DEFAULT_FULL_TRIALS,
    tokenRef: equityReqIdRef,
    calculateFn: calculateEquityAsync,
  });

  // ── Async Runout Simulation (Flop/Turn) ──
  useEffect(() => {
    if (activePlayBlock) return undefined;
    if (heroCardsMemo.length < 2 || communityCards.length < 3 || communityCards.length >= 5) {
      setRunouts(null);
      setRunoutsComputing(false);
      return undefined;
    }
    const reqId = ++runoutReqIdRef.current;
    const abortHandle = makeAbortHandle();
    setRunoutsComputing(true);

    simulateRunoutsAsync(heroCardsMemo, communityCards, 250, equityRangeArg, {
      signal: abortHandle.signal,
    })
      .then((res) => {
        if (reqId !== runoutReqIdRef.current) return;
        setRunouts(res || null);
      })
      .catch((err) => {
        if (isAbortError(err) || reqId !== runoutReqIdRef.current) return;
        setRunouts(null);
      })
      .finally(() => {
        if (reqId === runoutReqIdRef.current) setRunoutsComputing(false);
      });

    return () => { abortHandle.abort(); };
  }, [heroCardsMemo, communityCards, equityRangeArg, activePlayBlock]);

  // ── Snapshot & Undo Helpers ──
  const sandboxSnapshot = useMemo(() => ({
    gameType,
    heroPosition,
    heroStack,
    potSize: handState.pot,
    potBase,
    heroHand,
    board,
    villains,
    actionHistory,
    preflopPosts,
    authority: 'authored-sandbox-ungraded',
  }), [gameType, heroPosition, heroStack, handState.pot, potBase, heroHand, board, villains, actionHistory, preflopPosts]);

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-19), sandboxSnapshot]);
  }, [sandboxSnapshot]);

  const restoreScenario = useCallback((raw) => {
    if (!raw || typeof raw !== 'object') return;
    pushUndo();
    if (raw.gameType) setGameType(raw.gameType);
    if (raw.heroPosition && POSITIONS.includes(String(raw.heroPosition).toUpperCase())) {
      setHeroPosition(String(raw.heroPosition).toUpperCase());
    }
    if (Number.isFinite(Number(raw.heroStack))) setHeroStack(Number(raw.heroStack));
    if (Number.isFinite(Number(raw.effStack))) setHeroStack(Number(raw.effStack));
    if (Number.isFinite(Number(raw.potBase))) {
      setPotBase(Number(raw.potBase));
    } else if (Number.isFinite(Number(raw.potSize))) {
      setPotBase(Number(raw.potSize));
    } else if (Number.isFinite(Number(raw.pot)) && (!Array.isArray(raw.actionHistory) || raw.actionHistory.length === 0)) {
      setPotBase(Number(raw.pot));
    }
    if (raw.heroHand && (raw.heroHand.card1 || raw.heroHand.card2)) {
      setHeroHand({ card1: raw.heroHand.card1 || null, card2: raw.heroHand.card2 || null });
    } else if (typeof raw.hand === 'string' && raw.hand.replace(/\s+/g, '').length >= 4) {
      const compact = raw.hand.replace(/\s+/g, '');
      setHeroHand({ card1: compact.slice(0, 2), card2: compact.slice(2, 4) });
    } else if (Object.prototype.hasOwnProperty.call(raw, 'heroHand') && raw.heroHand === null) {
      setHeroHand({ card1: null, card2: null });
    }
    if (raw.board) {
      const cards = boardToArray(raw.board);
      setBoard({
        flop: cards.slice(0, 3),
        turn: cards[3] || null,
        river: cards[4] || null,
      });
    }
    let nextVillainLimit = MAX_VILLAINS;
    if (Array.isArray(raw.villains) && raw.villains.length > 0) {
      const clampedVillains = withVillainIds(raw.villains.slice(0, MAX_VILLAINS));
      nextVillainLimit = clampedVillains.length;
      setVillains(clampedVillains);
      setActiveVillainIdx(0);
    } else if (Object.prototype.hasOwnProperty.call(raw, 'villains')) {
      const fallbackPos = String(raw.heroPosition || '').toUpperCase() === 'BB' ? 'BTN' : 'BB';
      setVillains(withVillainIds([{ ...DEFAULT_VILLAINS[0], position: fallbackPos }]));
      nextVillainLimit = 1;
      setActiveVillainIdx(0);
    }
    if (Array.isArray(raw.actionHistory)) {
      const shouldClamp = (Array.isArray(raw.villains) && raw.villains.length > MAX_VILLAINS)
        || nextVillainLimit < MAX_VILLAINS;
      setActionHistory(
        shouldClamp
          ? pruneActionsToMaxVillains(raw.actionHistory, nextVillainLimit)
          : raw.actionHistory,
      );
    }
    setPreflopPosts(Array.isArray(raw.preflopPosts) ? raw.preflopPosts : []);
    setReplayIndex(null);
  }, [pushUndo]);

  const restoreScenarioRef = useRef(restoreScenario);
  restoreScenarioRef.current = restoreScenario;

  // ── Preload Hand From Review My Play (?fromReview=<savedRowId>) ──
  useEffect(() => {
    if (!router.isReady || activePlayBlock) return undefined;
    const rawParam = router.query?.fromReview;
    const fromReviewId = Array.isArray(rawParam) ? rawParam[0] : rawParam;
    if (!fromReviewId || typeof fromReviewId !== 'string') return undefined;
    if (consumedReviewIdRef.current === fromReviewId) return undefined;

    const applyHandoff = (handoff) => {
      if (!handoff) return;
      consumedReviewIdRef.current = fromReviewId;
      restoreScenarioRef.current({
        gameType: handoff.gameType,
        heroPosition: handoff.heroPosition,
        heroStack: handoff.heroStack,
        potBase: handoff.potBase,
        heroHand: handoff.heroHand,
        board: handoff.board,
        villains: Array.isArray(handoff.villains) && handoff.villains.length > 0 ? handoff.villains : null,
        actionHistory: [],
        preflopPosts: [],
      });
      setReviewHandoffSource(handoff.sourceRowId || fromReviewId);
      toast.success(
        handoff.nonNlhHeroCardCount
          ? 'Loaded Review Hand (First Two Hero Cards · Ungraded Exploration)'
          : 'Loaded Hand From Review My Play (Ungraded Exploration)',
      );
    };

    const fromStorage = consumeReviewHandoffFromStorage(fromReviewId);
    if (fromStorage) {
      applyHandoff(fromStorage);
      return undefined;
    }

    if (authInitializing || !userId) return undefined;

    let active = true;
    (async () => {
      try {
        const token = await getFreshAccessToken();
        if (!active || !token) return;
        const res = await requestReviewHandoff(`/api/poker/saved-hands?id=${encodeURIComponent(fromReviewId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 12000,
        });
        if (!active || !res.ok) return;
        const json = await res.json().catch(() => null);
        if (!active || !json) return;
        const row = json.hand
          || (Array.isArray(json.hands) ? json.hands.find((h) => String(h.id) === String(fromReviewId)) : null)
          || (json.id ? json : null);
        const handoff = parseReviewHandoffPayload(row, fromReviewId);
        if (handoff) applyHandoff(handoff);
      } catch (err) {
        if (!isAbortError(err)) {
          console.warn('[VirtualSandbox] fromReview fetch skipped:', err?.message || err);
        }
      }
    })();

    return () => { active = false; };
  }, [router.isReady, router.query?.fromReview, activePlayBlock, authInitializing, userId, requestReviewHandoff]);

  const popUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setGameType(last.gameType || 'cash');
      setHeroPosition(last.heroPosition || 'BTN');
      setHeroStack(last.heroStack || 100);
      setPotBase(last.potBase || 6.5);
      setHeroHand(last.heroHand || { card1: null, card2: null });
      setBoard(last.board || { flop: [], turn: null, river: null });
      setVillains(withVillainIds(last.villains || DEFAULT_VILLAINS));
      setActionHistory(Array.isArray(last.actionHistory) ? last.actionHistory : []);
      setPreflopPosts(Array.isArray(last.preflopPosts) ? last.preflopPosts : []);
      setReplayIndex(null);
      return prev.slice(0, -1);
    });
    haptic('light');
    toast.success('Reverted Last Change');
  }, [haptic]);

  const recordExplorationSnapshot = useCallback((label = 'Explored Spot', overrideScenario = null) => {
    const hasOverride = Boolean(overrideScenario && typeof overrideScenario === 'object');
    const replayScenario = replayScenarioFromEntry(hasOverride ? overrideScenario : { scenario: sandboxSnapshot });
    if (!replayScenario) return;
    let snapHero = heroHand;
    if (hasOverride) {
      if (overrideScenario.heroHand && (overrideScenario.heroHand.card1 || overrideScenario.heroHand.card2)) {
        snapHero = overrideScenario.heroHand;
      } else if (typeof overrideScenario.hand === 'string' && overrideScenario.hand.replace(/\s+/g, '').length >= 4) {
        const compact = overrideScenario.hand.replace(/\s+/g, '');
        snapHero = { card1: compact.slice(0, 2), card2: compact.slice(2, 4) };
      } else if (Object.prototype.hasOwnProperty.call(overrideScenario, 'heroHand') && overrideScenario.heroHand === null) {
        snapHero = { card1: null, card2: null };
      }
    }
    if (!snapHero?.card1 || !snapHero?.card2) return;

    const snapBoardCards = hasOverride && overrideScenario.board
      ? boardToArray(overrideScenario.board)
      : communityCards;
    const snapStreet = hasOverride && overrideScenario.board
      ? streetOfBoard(overrideScenario.board)
      : currentStreet;
    const snapPos = hasOverride && overrideScenario.heroPosition
      ? String(overrideScenario.heroPosition).toUpperCase()
      : heroPosition;
    const snapStack = hasOverride && Number.isFinite(Number(overrideScenario.heroStack ?? overrideScenario.effStack))
      ? Number(overrideScenario.heroStack ?? overrideScenario.effStack)
      : heroStack;
    const snapActions = hasOverride && Array.isArray(overrideScenario.actionHistory)
      ? overrideScenario.actionHistory
      : actionHistory;
    const snapPot = hasOverride
      ? (Number.isFinite(Number(overrideScenario.pot))
        ? Number(overrideScenario.pot)
        : Number.isFinite(Number(overrideScenario.potSize))
          ? Number(overrideScenario.potSize)
          : Number.isFinite(Number(overrideScenario.potBase))
            ? Number(overrideScenario.potBase)
            : handState.pot)
      : handState.pot;
    const snapEquity = hasOverride
      ? null
      : (equity?.heroEquity != null && Number.isFinite(Number(equity.heroEquity))
        ? Number(Number(equity.heroEquity).toFixed(1))
        : null);

    setSessionLog((prev) => [
      ...prev.slice(-49),
      {
        id: `spot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        hand: `${snapHero.card1}${snapHero.card2}`,
        position: snapPos,
        street: snapStreet,
        board: snapBoardCards.join(' '),
        equity: snapEquity,
        stackDepth: snapStack,
        potSize: snapPot,
        actionLine: snapActions.map((a) => `${a.isHero || a.actor === 'hero' ? 'H' : (a.position || 'V')}:${a.label || a.action || ''}`).join(' -> '),
        scenario: replayScenario,
        source: 'live',
        note: label,
        sessionStartedAt: sessionStartedAtRef.current,
        createdAt: new Date().toISOString(),
        // Explicitly ungraded: never fabricate correctness, EV deltas, or solver picks
        isCorrect: null,
        evDelta: null,
      },
    ]);
  }, [heroHand, heroPosition, currentStreet, communityCards, equity, heroStack, handState.pot, actionHistory, sandboxSnapshot]);

  // ── Table Card & Deal Interactions ──
  const openHeroPicker = useCallback(() => {
    if (activePlayBlock) return;
    setDeckTarget('hero');
    setHeroPickStep(heroHand.card1 && !heroHand.card2 ? 2 : 1);
    setShowDeck(true);
  }, [heroHand, activePlayBlock]);

  const openBoardPicker = useCallback(() => {
    if (activePlayBlock) return;
    setDeckTarget('board');
    setShowDeck(true);
  }, [activePlayBlock]);

  const handleDeckSelect = useCallback((cardStr) => {
    pushUndo();
    playSound?.('card');
    if (deckTarget === 'hero') {
      if (heroPickStep === 1) {
        setHeroHand((h) => ({ card1: cardStr, card2: h.card2 === cardStr ? null : h.card2 }));
        setHeroPickStep(2);
      } else {
        setHeroHand((h) => ({ ...h, card2: cardStr }));
        setShowDeck(false);
        setDeckTarget(null);
      }
      return;
    }
    if (deckTarget === 'board') {
      setBoard((prev) => {
        if ((prev.flop || []).length < 3) return { ...prev, flop: [...(prev.flop || []), cardStr] };
        if (!prev.turn) return { ...prev, turn: cardStr };
        if (!prev.river) return { ...prev, river: cardStr };
        return prev;
      });
      return;
    }
    if (deckTarget?.kind === 'flop') {
      setBoard((prev) => {
        const nextFlop = [...(prev.flop || [])];
        nextFlop[deckTarget.idx] = cardStr;
        return { ...prev, flop: nextFlop.filter(Boolean) };
      });
      setShowDeck(false);
      setDeckTarget(null);
      return;
    }
    if (deckTarget === 'turn') {
      setBoard((prev) => ({ ...prev, turn: cardStr }));
      setShowDeck(false);
      setDeckTarget(null);
      return;
    }
    if (deckTarget === 'river') {
      setBoard((prev) => ({ ...prev, river: cardStr }));
      setShowDeck(false);
      setDeckTarget(null);
    }
  }, [deckTarget, heroPickStep, pushUndo, playSound]);

  const dealRandomSpot = useCallback(() => {
    if (activePlayBlock) return;
    pushUndo();
    const cards = pickRandomCards(5, []);
    setHeroHand({ card1: cards[0], card2: cards[1] });
    setBoard({ flop: cards.slice(2, 5), turn: null, river: null });
    setActionHistory([]);
    setPreflopPosts([]);
    setReplayIndex(null);
    playSound?.('card');
    haptic('light');
  }, [pushUndo, playSound, haptic, activePlayBlock]);

  const dealNextStreet = useCallback(() => {
    if (activePlayBlock) return;
    if (board.flop.length < 3) {
      pushUndo();
      const needed = 3 - board.flop.length;
      const drawn = pickRandomCards(needed, allUsedCards);
      setBoard((prev) => ({ ...prev, flop: [...prev.flop, ...drawn] }));
      playSound?.('card');
      return;
    }
    if (!board.turn) {
      pushUndo();
      const [turnCard] = pickRandomCards(1, allUsedCards);
      if (turnCard) setBoard((prev) => ({ ...prev, turn: turnCard }));
      playSound?.('card');
      return;
    }
    if (!board.river) {
      pushUndo();
      const [riverCard] = pickRandomCards(1, allUsedCards);
      if (riverCard) setBoard((prev) => ({ ...prev, river: riverCard }));
      playSound?.('card');
    }
  }, [board, allUsedCards, pushUndo, playSound, activePlayBlock]);

  const dealRandomBoard = useCallback(() => {
    if (activePlayBlock) return;
    pushUndo();
    const flop = pickRandomCards(3, heroCardsMemo);
    setBoard({ flop, turn: null, river: null });
    playSound?.('card');
  }, [heroCardsMemo, pushUndo, playSound, activePlayBlock]);

  const resetTable = useCallback(() => {
    pushUndo();
    recordExplorationSnapshot('Archived Before Reset');
    setHeroHand({ card1: null, card2: null });
    setBoard({ flop: [], turn: null, river: null });
    setActionHistory([]);
    setPreflopPosts([]);
    setReplayIndex(null);
    setPotBase(6.5);
    haptic('light');
    toast.success('Table Cleared');
  }, [pushUndo, recordExplorationSnapshot, haptic]);

  // ── Villain Management ──
  const patchVillain = useCallback((idx, patch) => {
    setVillains((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }, []);

  const handleVillainArchetype = useCallback((idx, archId) => {
    const cfg = ARCHETYPE_CONFIG[archId];
    setVillains((prev) => prev.map((v, i) => {
      if (i !== idx) return v;
      const range = getArchetypeRangeString(archId, v.position || 'BB', 'open') || '';
      return {
        ...v,
        archetype: { id: archId, name: cfg?.name || archId },
        range,
      };
    }));
  }, []);

  const addVillain = useCallback(() => {
    setVillains((prev) => {
      if (prev.length >= MAX_VILLAINS) return prev;
      const taken = new Set([heroPosition, ...prev.map((v) => v.position)]);
      const nextPos = POSITIONS.find((p) => !taken.has(p)) || 'CO';
      return [
        ...prev,
        { id: Date.now(), position: nextPos, archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: 100, range: '' },
      ];
    });
  }, [heroPosition]);

  const removeVillain = useCallback((idx) => {
    if (villains.length <= 1 || idx < 0 || idx >= villains.length) return;
    const prevCount = villains.length;
    const nextLen = prevCount - 1;
    pushUndo();
    setVillains((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
    setActionHistory((prev) => pruneAndRemapActionsOnVillainRemoval(prev, idx, prevCount));
    setActiveVillainIdx((prev) => {
      if (idx < prev) return prev - 1;
      if (prev >= nextLen) return Math.max(0, nextLen - 1);
      return prev;
    });
    setReplayIndex(null);
  }, [villains.length, pushUndo]);

  // ── Templates API (Deadline + Stale-Safe + Uncertain-Write Recovery) ──
  const loadTemplates = useCallback(async () => {
    if (authInitializing) return;
    if (!userId) {
      setTemplatesStatus('auth');
      setTemplates([]);
      return;
    }
    const reqId = ++templatesReqIdRef.current;
    setTemplatesStatus('loading');
    setTemplatesError(null);
    try {
      const token = await getFreshAccessToken();
      if (reqId !== templatesReqIdRef.current) return;
      if (!token) {
        setTemplatesStatus('auth');
        return;
      }
      const res = await requestTemplates('/api/assistant/sandbox/sandbox-templates', {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 12000,
      });
      if (reqId !== templatesReqIdRef.current) return;
      if (res.status === 401) {
        setTemplatesStatus('auth');
        return;
      }
      const json = await res.json().catch(() => null);
      if (reqId !== templatesReqIdRef.current) return;
      if (!res.ok || json?.success === false) {
        setTemplatesError(json?.error || 'Templates Could Not Be Loaded.');
        setTemplatesStatus('error');
        return;
      }
      setTemplates(Array.isArray(json?.templates) ? json.templates : []);
      setTemplatesStatus('ok');
    } catch (err) {
      if (isAbortError(err) || reqId !== templatesReqIdRef.current) return;
      setTemplatesError('Could Not Reach Templates Service.');
      setTemplatesStatus('error');
    }
  }, [authInitializing, userId, requestTemplates]);

  const saveTemplate = useCallback(async (name, onDone) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    setTemplateSaving(true);
    const saveStamp = new Date().toISOString();
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        toast.error('Sign In To Save Templates');
        return;
      }
      const res = await requestTemplateWrite('/api/assistant/sandbox/sandbox-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: cleanName,
          scenario: { ...sandboxSnapshot, clientSaveStamp: saveStamp },
        }),
        timeoutMs: 12000,
      });
      const result = await readPersistenceResponse(res);
      if (result.success && result.persisted) {
        toast.success(`Template "${cleanName}" Saved`);
        onDone?.();
        loadTemplates();
        return;
      }
      toast.error(persistenceMessage(result, 'Could Not Save Template'));
    } catch (err) {
      if (isAbortError(err)) return;
      // Recovery after uncertain write: read durable server templates before asking to retry
      try {
        const token = await getFreshAccessToken();
        if (token) {
          const checkRes = await requestTemplates('/api/assistant/sandbox/sandbox-templates', {
            headers: { Authorization: `Bearer ${token}` },
            timeoutMs: 8000,
          });
          const checkJson = await checkRes.json().catch(() => null);
          const found = Array.isArray(checkJson?.templates)
            ? checkJson.templates.find((t) => t?.scenario_json?.clientSaveStamp === saveStamp)
            : null;
          if (found) {
            setTemplates(checkJson.templates);
            toast.success(`Verified Template "${cleanName}" Saved`);
            onDone?.();
            return;
          }
        }
      } catch (_verifyErr) { /* show uncertain error below */ }
      toast.error('Template Save Timed Out. Verified No Copy Yet, Please Retry.');
    } finally {
      setTemplateSaving(false);
    }
  }, [sandboxSnapshot, requestTemplateWrite, requestTemplates, loadTemplates]);

  const deleteTemplate = useCallback(async (id) => {
    if (!id) return;
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        toast.error('Sign In To Delete Templates');
        return;
      }
      const res = await requestTemplateWrite(`/api/assistant/sandbox/sandbox-templates?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 12000,
      });
      const result = await readPersistenceResponse(res);
      if (result.success && result.persisted) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        toast.success('Template Removed');
      } else {
        toast.error(persistenceMessage(result, 'Could Not Delete Template'));
      }
    } catch (err) {
      if (isAbortError(err)) return;
      toast.error('Could Not Confirm Delete. Refreshing Templates.');
      loadTemplates();
    }
  }, [requestTemplateWrite, loadTemplates]);

  // ── Menu Configuration ──
  const baseMenu = getMenuConfig('personal-assistant', user, {}, {});
  const menuConfig = useMemo(() => ({
    menuItems: [
      {
        type: 'section',
        label: 'Virtual Sandbox Tools',
      },
      {
        type: 'action',
        label: 'Table Setup & Villains',
        onClick: () => { setShowMenu(false); setShowSetup(true); },
      },
      {
        type: 'action',
        label: 'Villain Presets',
        onClick: () => { setShowMenu(false); setShowVillainPresets(true); },
      },
      {
        type: 'action',
        label: 'Range Explorer (13x13)',
        onClick: () => { setShowMenu(false); setShowRangeExplorer(true); },
      },
      {
        type: 'action',
        label: 'Range Heat Grid (13x13)',
        onClick: () => { setShowMenu(false); setShowRangeHeatGrid(true); },
      },
      {
        type: 'action',
        label: 'Save To Study Folder',
        onClick: () => { setShowMenu(false); setShowSaveHand(true); },
      },
      {
        type: 'action',
        label: 'Study Folders Archive',
        onClick: () => { setShowMenu(false); setShowStudyFolders(true); },
      },
      {
        type: 'action',
        label: 'Scenario Templates',
        onClick: () => { setShowMenu(false); setShowTemplates(true); loadTemplates(); },
      },
      {
        type: 'action',
        label: 'Import Hand History',
        onClick: () => { setShowMenu(false); setShowImportHH(true); },
      },
      {
        type: 'action',
        label: 'Import Solver Scenario',
        onClick: () => { setShowMenu(false); setShowSolverImport(true); },
      },
      {
        type: 'action',
        label: 'Hand Replay Log',
        onClick: () => { setShowMenu(false); setShowHandReplay(true); },
      },
      {
        type: 'action',
        label: 'Session Report',
        onClick: () => { setShowMenu(false); setShowSessionReport(true); },
      },
      {
        type: 'action',
        label: 'Internal Scenario Sharing',
        onClick: () => { setShowMenu(false); setShowShareScenario(true); },
      },
      ...baseMenu.menuItems,
    ],
    bottomLinks: baseMenu.bottomLinks,
  }), [baseMenu, loadTemplates]);

  // ── Display Values ──
  const tableCards = replayState ? replayState.cards : communityCards;
  const tablePot = replayState ? replayState.handState.pot : handState.pot;
  const tableSpr = replayState ? replayState.handState.spr : handState.spr;
  const tableStreet = replayState ? replayState.street : currentStreet;
  const canDealNext = !board.river && !activePlayBlock;
  const equityLabel = equity
    ? (villains.length >= 2
      ? `Multiway Vs ${villains.length} Seats`
      : equityVsRange
        ? `Vs ${primaryVillain?.archetype?.name || 'Range'}`
        : 'Vs Random Hand')
    : null;

  const exportScenarioPayload = useMemo(() => ({
    position: heroPosition,
    hand: heroCardsMemo.join(' '),
    board: communityCards.length ? communityCards.join(' ') : 'Preflop',
    pot: tablePot,
    stack: heroStack,
    street: currentStreet,
    actionLine: actionHistory.map((a) => `${a.isHero || a.actor === 'hero' ? 'Hero' : (a.player || a.position || 'Villain')} ${a.label || a.action || ''}`.trim()).join(' -> '),
  }), [heroPosition, heroCardsMemo, communityCards, tablePot, heroStack, currentStreet, actionHistory]);

  return (
    <div className="sandbox-page-root">
      <PersonalAssistantCopyPolicy />
      <SEOHead
        title="Virtual Sandbox · Poker Scenario Lab"
        description="Build Poker Scenarios, Explore Multiway Equity And Runouts, Edit 13x13 Ranges, Import Hand Histories, And Organize Study Folders In The Smarter.Poker Virtual Sandbox."
        canonical="/hub/personal-assistant/sandbox"
      />
      <SharedPAStyles />
      <Toaster position="top-center" containerStyle={{ top: 'calc(8px + env(safe-area-inset-top, 0px))' }} />

      <HamburgerMenu
        isOpen={showMenu}
        onClose={closeMenu}
        direction="left"
        theme="pa"
        user={user}
        menuItems={menuConfig.menuItems}
        bottomLinks={menuConfig.bottomLinks}
      />

      <HubPageShell
        className="sandbox"
        maxWidth={1080}
        background="linear-gradient(180deg, #05080c 0%, #040d18 52%, #020407 100%)"
        header={<UniversalHeader pageDepth={2} onMenuClick={() => setShowMenu(true)} />}
      >
        <div
          className="sandbox-workspace"
          data-training-authority="authored-sandbox-ungraded"
          aria-labelledby="sandbox-workspace-title"
        >
          {/* ── Top Title & Honesty Bar ── */}
          <header className="sandbox-header-card">
            <div className="sandbox-header-top">
              <div>
                <p className="sandbox-eyebrow">Personal Assistant · Virtual Sandbox</p>
                <h1 id="sandbox-workspace-title" className="sandbox-title">Virtual Sandbox</h1>
              </div>
              <div className="sandbox-header-actions">
                <button
                  type="button"
                  className="pa-btn"
                  onClick={toggleSound}
                  aria-label={soundEnabled ? 'Mute Sandbox Audio' : 'Enable Sandbox Audio'}
                  style={iconBtn({ color: soundEnabled ? T.accent : T.textDim })}
                >
                  {soundEnabled ? <Volume2 size={18} strokeWidth={2} /> : <VolumeX size={18} strokeWidth={2} />}
                </button>
                <button
                  type="button"
                  className="pa-btn"
                  onClick={() => setShowSetup(true)}
                  disabled={!!activePlayBlock}
                  style={btn('secondary', { disabled: !!activePlayBlock })}
                >
                  <SlidersHorizontal size={16} strokeWidth={2} aria-hidden="true" /> Setup
                </button>
              </div>
            </div>

            {/* Honesty & Disclosed Limits Panel */}
            <div
              className="honesty-banner"
              role="note"
              aria-label="Study Authority And Disclosed Limits"
              data-tutorial="evidence-gate"
            >
              <div className="honesty-pill-row">
                <span style={pill('accent')}>Ungraded Exploration Workspace</span>
                <span style={pill('neutral')}>No Fabricated GTO Grades Or EV</span>
                <span style={pill('neutral')}>
                  {workerReady ? 'Worker Equity Ready' : 'Local Equity Engine'}
                </span>
                {reviewHandoffSource && (
                  <span style={pill('success')}>Loaded From Review My Play</span>
                )}
              </div>
              <p className="honesty-copy">
                Authored Scenarios In The Virtual Sandbox Do Not Produce GTO Grades, Solver EV, Accuracy Scores,
                Streaks, Or Training Progress. For Verified Solver-Backed Grading, Use A Signed Training Or Audited
                Hand Review Destination Below.
              </p>
              <ul className="disclosed-limits-list" aria-label="Disclosed Workspace Limits">
                {DISCLOSED_LIMITS.map((limitText) => (
                  <li key={limitText}>{limitText}</li>
                ))}
              </ul>
            </div>
          </header>

          {/* ── Active-Play Fail-Closed Gate Banner (Server-Enforced via checkSandboxAccess) ── */}
          {activePlayBlock && (
            <section className="active-play-gate" role="alert" aria-live="assertive">
              <div className="active-play-gate-head">
                <ShieldAlert size={20} strokeWidth={2} color={T.danger} aria-hidden="true" />
                <strong>Active Play Restriction Enforced</strong>
              </div>
              <p>{activePlayBlock.message}</p>
              <button
                type="button"
                className="pa-btn"
                onClick={checkLivePlayGate}
                disabled={accessStatus === 'checking'}
                style={btn('secondary', { disabled: accessStatus === 'checking' })}
              >
                <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
                {accessStatus === 'checking' ? 'Checking Status…' : 'Recheck Session Status'}
              </button>
            </section>
          )}

          {/* ── Live Metrics Strip ── */}
          <section className="sandbox-metrics-strip" aria-label="Live Scenario Telemetry">
            <div className="metric-tile">
              <span className="metric-label">Hero Hand</span>
              <strong className="metric-value">
                {heroCardsMemo.length === 2 ? `${heroHand.card1} ${heroHand.card2}` : 'Pick Cards'}
              </strong>
              <span className="metric-sub">{heroClassLabel || `${heroPosition} · ${heroStack} BB`}</span>
            </div>
            <div className="metric-tile">
              <span className="metric-label">Monte Carlo Equity</span>
              <strong className="metric-value" style={{ color: equity?.heroEquity != null && Number(equity.heroEquity) >= 50 ? T.success : T.accent }}>
                {equityComputing && !equity
                  ? 'Computing…'
                  : equity?.heroEquity != null && Number.isFinite(Number(equity.heroEquity))
                    ? `${Number(equity.heroEquity).toFixed(1)}%`
                    : 'Not Available'}
              </strong>
              <span className="metric-sub">
                {equityRefining
                  ? `${equityLabel || 'Preview'} · Refining 10k…`
                  : equity?.sampleSize
                    ? `${equityLabel || 'Equity'} · ${Number(equity.sampleSize).toLocaleString()} Trials`
                    : (equityLabel || 'Select Two Hero Cards')}
              </span>
            </div>
            <div className="metric-tile">
              <span className="metric-label">Pot &amp; SPR</span>
              <strong className="metric-value">{Number(tablePot).toFixed(1)} BB</strong>
              <span className="metric-sub">
                SPR {tableSpr != null && Number.isFinite(Number(tableSpr)) ? tableSpr : 'Not Available'} · {`${villains.length} ${villains.length === 1 ? 'Villain' : 'Villains'}`}
              </span>
            </div>
            <div className="metric-tile">
              <span className="metric-label">Board Texture</span>
              <strong className="metric-value">{boardTexture?.label || 'Preflop'}</strong>
              <span className="metric-sub">{currentStreet.toUpperCase()} · {gameType === 'tournament' ? 'Tournament' : 'Cash'}</span>
            </div>
          </section>

          {/* ── Primary Two-Column Workspace (Collapses to 1 column <= 768px) ── */}
          <div className="sandbox-main-grid">
            {/* LEFT COLUMN: Native Poker Table + Board Strip + Action Builder */}
            <div className="sandbox-col">
              <section className="workspace-panel" aria-label="Poker Table">
                <div className="panel-header-row">
                  <h2 className="panel-heading">Poker Table · {heroPosition}</h2>
                  <div className="panel-btn-group">
                    <button
                      type="button"
                      className="pa-btn"
                      onClick={() => setShowHeatmap((v) => !v)}
                      aria-pressed={showHeatmap}
                      disabled={communityCards.length < 3 || !!activePlayBlock}
                      style={{
                        ...btn(showHeatmap ? 'primary' : 'secondary', { disabled: communityCards.length < 3 || !!activePlayBlock }),
                        padding: '0 12px', fontSize: F.caption,
                      }}
                    >
                      <Layers size={14} strokeWidth={2} aria-hidden="true" /> Heatmap
                    </button>
                    <button
                      type="button"
                      className="pa-btn"
                      onClick={popUndo}
                      disabled={undoStack.length === 0 || !!activePlayBlock}
                      aria-label="Undo Last Table Change"
                      style={{ ...btn('secondary', { disabled: undoStack.length === 0 || !!activePlayBlock }), padding: '0 12px', fontSize: F.caption }}
                    >
                      <Undo2 size={14} strokeWidth={2} aria-hidden="true" /> Undo
                    </button>
                  </div>
                </div>

                <div
                  className="table-stage"
                  style={{
                    position: 'relative',
                    filter: arenaTheme?.fromCache
                      ? 'none'
                      : FELT_COLORS.find((f) => f.id === tableFelt)?.filter || 'none',
                  }}
                >
                  <MemoSandboxPokerTable
                    heroCards={heroCardsMemo}
                    communityCards={tableCards}
                    pot={Number(tablePot) || 0}
                    heroPosition={heroPosition}
                    heroStack={Math.round(handState.remaining.hero)}
                    villains={tableVillains}
                    street={tableStreet}
                    boardTexture={boardTexture}
                    showTextureBadge={false}
                    equity={equity?.heroEquity}
                    equityLabel={equityLabel}
                    spr={tableSpr}
                    showDealHint={canDealNext && heroCardsMemo.length === 2}
                    onTapHeroCards={openHeroPicker}
                    onTapBoard={openBoardPicker}
                    onReset={resetTable}
                    onRemoveHeroCard={(idx) => {
                      pushUndo();
                      if (idx === 0) setHeroHand((h) => ({ card1: h.card2, card2: null }));
                      else setHeroHand((h) => ({ ...h, card2: null }));
                    }}
                    onRemoveBoardCard={(idx) => {
                      pushUndo();
                      const next = [...communityCards];
                      next.splice(idx, 1);
                      setBoard({
                        flop: next.slice(0, 3),
                        turn: next[3] || null,
                        river: next[4] || null,
                      });
                    }}
                    onSwipeLeft={dealNextStreet}
                    onSwipeRight={() => {
                      if (!board.river && !board.turn) return;
                      pushUndo();
                      if (board.river) setBoard((b) => ({ ...b, river: null }));
                      else setBoard((b) => ({ ...b, turn: null }));
                    }}
                  />

                  <EquityHeatmapOverlay
                    isVisible={showHeatmap && communityCards.length >= 3}
                    board={board}
                    heroPosition={heroPosition}
                    villains={villains}
                    equity={equity}
                  />
                </div>

                {/* Quick Table Controls */}
                <div className="quick-action-row">
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={openHeroPicker}
                    disabled={!!activePlayBlock}
                    style={{ ...btn('secondary', { disabled: !!activePlayBlock }), flex: '1 1 120px' }}
                  >
                    Pick Hero Cards
                  </button>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={dealNextStreet}
                    disabled={!canDealNext}
                    style={{ ...btn('primary', { disabled: !canDealNext }), flex: '1 1 120px' }}
                  >
                    <PlayCircle size={16} strokeWidth={2} aria-hidden="true" />
                    {board.flop.length < 3 ? 'Deal Flop' : !board.turn ? 'Deal Turn' : !board.river ? 'Deal River' : 'River Dealt'}
                  </button>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={dealRandomSpot}
                    disabled={!!activePlayBlock}
                    style={{ ...btn('secondary', { disabled: !!activePlayBlock }), flex: '1 1 120px' }}
                  >
                    <Shuffle size={16} strokeWidth={2} aria-hidden="true" /> Random Spot
                  </button>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={resetTable}
                    disabled={!!activePlayBlock}
                    style={{ ...btn('secondary', { disabled: !!activePlayBlock }), flex: '0 1 auto' }}
                  >
                    <RotateCcw size={16} strokeWidth={2} aria-hidden="true" /> Reset
                  </button>
                </div>
              </section>

              {/* Board Builder Strip */}
              <section className="workspace-panel" aria-label="Board Builder">
                <div className="panel-header-row">
                  <h2 className="panel-heading">Board Cards</h2>
                  <div className="panel-btn-group">
                    <button
                      type="button"
                      className="pa-btn"
                      onClick={dealRandomBoard}
                      disabled={!!activePlayBlock}
                      style={{ ...btn('secondary', { disabled: !!activePlayBlock }), padding: '0 12px', fontSize: F.caption }}
                    >
                      <Shuffle size={14} strokeWidth={2} aria-hidden="true" /> Random Flop
                    </button>
                    {communityCards.length > 0 && (
                      <button
                        type="button"
                        className="pa-btn"
                        onClick={() => { pushUndo(); setBoard({ flop: [], turn: null, river: null }); }}
                        disabled={!!activePlayBlock}
                        style={{ ...btn('ghost', { disabled: !!activePlayBlock }), padding: '0 10px', fontSize: F.caption, color: T.textMuted }}
                      >
                        Clear Board
                      </button>
                    )}
                  </div>
                </div>

                <div className="board-slots-row">
                  {[0, 1, 2].map((idx) => (
                    <CardSlot
                      key={`flop-${idx}`}
                      card={board.flop[idx] || null}
                      label={`Flop ${idx + 1}`}
                      onTap={() => { if (!activePlayBlock) { setDeckTarget({ kind: 'flop', idx }); setShowDeck(true); } }}
                      onRemove={board.flop[idx] ? () => {
                        pushUndo();
                        const nextFlop = [...board.flop];
                        nextFlop.splice(idx, 1);
                        setBoard((prev) => ({ ...prev, flop: nextFlop, turn: nextFlop.length < 3 ? null : prev.turn, river: nextFlop.length < 3 ? null : prev.river }));
                      } : null}
                    />
                  ))}
                  <CardSlot
                    card={board.turn}
                    label="Turn"
                    onTap={() => { if (!activePlayBlock) { setDeckTarget('turn'); setShowDeck(true); } }}
                    onRemove={board.turn ? () => { pushUndo(); setBoard((prev) => ({ ...prev, turn: null, river: null })); } : null}
                  />
                  <CardSlot
                    card={board.river}
                    label="River"
                    onTap={() => { if (!activePlayBlock) { setDeckTarget('river'); setShowDeck(true); } }}
                    onRemove={board.river ? () => { pushUndo(); setBoard((prev) => ({ ...prev, river: null })); } : null}
                  />
                </div>
              </section>

              {/* Street Timeline, Replay Bar & Multiway Action Builder (2-6 Seats) */}
              <section className="workspace-panel" aria-label="Action Builder And Replay">
                <div className="panel-header-row">
                  <h2 className="panel-heading">Action Sequence &amp; Replay</h2>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => { recordExplorationSnapshot('Logged For Replay'); setShowHandReplay(true); }}
                    style={{ ...btn('secondary'), padding: '0 12px', fontSize: F.caption }}
                  >
                    <Film size={14} strokeWidth={2} aria-hidden="true" /> Hand Replay ({sessionLog.length})
                  </button>
                </div>

                <p className="limit-callout">
                  Multiway Action Builder Supports 2-6 Seats With Running Pot, Effective Stack, And Active Players
                  Per Street. Authored Scenarios Remain Strictly Ungraded.
                </p>

                <StreetTimeline
                  streetHistory={streetHistory}
                  activeStreet={Math.max(0, streetHistory.findIndex((s) => s.street === tableStreet))}
                  onSelectStreet={(idx) => {
                    const entry = streetHistory[idx];
                    const lastAction = entry?.actions?.[entry.actions.length - 1];
                    setReplayIndex(typeof lastAction?.index === 'number' ? lastAction.index : null);
                  }}
                />

                {actionHistory.length > 0 && (
                  <ActionReplayBar
                    actions={actionHistory}
                    replayIndex={replayIndex}
                    onReplayTo={(idx) => setReplayIndex(idx)}
                    onExitReplay={() => setReplayIndex(null)}
                  />
                )}

                <ActionHistoryBuilder
                  actions={actionHistory}
                  onAdd={(entry) => {
                    if (activePlayBlock) return;
                    pushUndo();
                    setActionHistory((prev) => [...prev, { ...entry, street: entry?.street || currentStreet }]);
                    setReplayIndex(null);
                    playSound?.('chip');
                  }}
                  onRemove={(idx) => {
                    pushUndo();
                    setActionHistory((prev) => prev.filter((_, i) => i !== idx));
                    setReplayIndex(null);
                  }}
                  onClear={() => {
                    pushUndo();
                    setActionHistory([]);
                    setReplayIndex(null);
                  }}
                  street={currentStreet}
                  heroPosition={heroPosition}
                  villainPosition={primaryVillain?.position || 'BB'}
                  villains={villains}
                  potSize={potBase}
                  heroStack={heroStack}
                  villainStack={Number(primaryVillain?.stack) || 100}
                  preflopPosts={preflopPosts}
                  handState={handState}
                  disabled={!!activePlayBlock}
                />
              </section>
            </div>

            {/* RIGHT COLUMN: Opponent Ranges, Runouts, Study Library, Tools */}
            <div className="sandbox-col">
              {/* Opponent Ranges & Presets */}
              <section className="workspace-panel" aria-label="Opponent Ranges And Presets">
                <div className="panel-header-row">
                  <h2 className="panel-heading">Opponent Ranges &amp; Presets</h2>
                  <div className="panel-btn-group">
                    <button
                      type="button"
                      className="pa-btn"
                      onClick={() => setShowVillainPresets(true)}
                      disabled={!!activePlayBlock}
                      style={{ ...btn('secondary', { disabled: !!activePlayBlock }), padding: '0 12px', fontSize: F.caption }}
                    >
                      <Users size={14} strokeWidth={2} aria-hidden="true" /> Presets
                    </button>
                    <button
                      type="button"
                      className="pa-btn"
                      onClick={() => setShowRangeHeatGrid(true)}
                      disabled={!!activePlayBlock}
                      aria-label="Open 13x13 Opponent Range Heat Grid"
                      style={{ ...btn('secondary', { disabled: !!activePlayBlock }), padding: '0 12px', fontSize: F.caption }}
                    >
                      <Flame size={14} strokeWidth={2} aria-hidden="true" /> Heat Grid
                    </button>
                    <button
                      type="button"
                      className="pa-btn"
                      onClick={() => setShowRangeExplorer(true)}
                      disabled={!!activePlayBlock}
                      style={{ ...btn('primary', { disabled: !!activePlayBlock }), padding: '0 12px', fontSize: F.caption }}
                    >
                      <LayoutGrid size={14} strokeWidth={2} aria-hidden="true" /> Range Editor
                    </button>
                  </div>
                </div>

                {villains.length > 1 && (
                  <div className="seat-selector-row" role="tablist" aria-label="Active Villain Seat">
                    {villains.map((v, idx) => {
                      const active = idx === safeVillainIdx;
                      return (
                        <button
                          key={v.id ?? idx}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className="pa-btn"
                          onClick={() => setActiveVillainIdx(idx)}
                          style={{
                            ...btn(active ? 'primary' : 'secondary'),
                            minHeight: 38, padding: '0 12px', fontSize: F.caption,
                          }}
                        >
                          Seat {idx + 1}: {v.position}
                        </button>
                      );
                    })}
                  </div>
                )}

                <VillainReadCard villain={primaryVillain} />

                <div style={{ marginTop: S.md }}>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => setShowRangeHeatGrid(true)}
                    disabled={!!activePlayBlock}
                    style={btn('secondary', { block: true, disabled: !!activePlayBlock })}
                  >
                    <Flame size={16} strokeWidth={2} aria-hidden="true" />
                    Range Grid · {primaryVillain?.position || 'BB'} Vs {communityCards.length ? communityCards.join(' ') : 'Preflop'}
                  </button>
                </div>
              </section>

              {/* Runouts & Preflop Reference */}
              <section className="workspace-panel" aria-label="Runouts And Preflop Reference">
                <div className="panel-header-row">
                  <h2 className="panel-heading">Equity Runouts &amp; Preflop Reference</h2>
                  {runoutsComputing && (
                    <span style={pill('neutral')}>
                      <Loader2 size={12} strokeWidth={2} className="pa-spin" aria-hidden="true" /> Simulating
                    </span>
                  )}
                </div>

                {communityCards.length >= 3 && communityCards.length < 5 ? (
                  runouts ? (
                    <RunoutChart runoutData={runouts} />
                  ) : (
                    <p className="panel-note">
                      Pick Two Hero Cards And A Flop Or Turn Board To Compute Next-Card Runout Equity Distribution.
                    </p>
                  )
                ) : (
                  <PreflopChartOverlay
                    position={heroPosition}
                    scenario={preflopScenario}
                    rangeGrid={preflopRangeGrid}
                    rangePercent={preflopRangePercent}
                    onChangeScenario={setPreflopScenario}
                    onPickHand={(handLabel) => {
                      if (!handLabel || handLabel.length < 2 || activePlayBlock) return;
                      const combo = expandRangeToCombos(handLabel, new Set(communityCards))[0];
                      if (!combo) {
                        toast.error('No Available Cards For This Hand On The Current Board');
                        return;
                      }
                      pushUndo();
                      setHeroHand({ card1: combo[0], card2: combo[1] });
                    }}
                  />
                )}
              </section>

              {/* Saved Studies, Templates, Imports & Export Tools */}
              <section className="workspace-panel" aria-label="Study Library And Workspace Tools">
                <h2 className="panel-heading">Study Library, Imports &amp; Sharing</h2>

                <div className="tools-grid">
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => setShowSaveHand(true)}
                    disabled={!!activePlayBlock}
                    style={btn('primary', { block: true, disabled: !!activePlayBlock })}
                  >
                    <Bookmark size={16} strokeWidth={2} aria-hidden="true" /> Save To Folder
                  </button>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => setShowStudyFolders(true)}
                    disabled={!!activePlayBlock}
                    style={btn('secondary', { block: true, disabled: !!activePlayBlock })}
                  >
                    <FolderOpen size={16} strokeWidth={2} aria-hidden="true" /> Study Folders
                  </button>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => { setShowTemplates(true); loadTemplates(); }}
                    disabled={!!activePlayBlock}
                    style={btn('secondary', { block: true, disabled: !!activePlayBlock })}
                  >
                    <Bookmark size={16} strokeWidth={2} aria-hidden="true" /> Templates
                  </button>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => setShowImportHH(true)}
                    disabled={!!activePlayBlock}
                    style={btn('secondary', { block: true, disabled: !!activePlayBlock })}
                  >
                    <Upload size={16} strokeWidth={2} aria-hidden="true" /> Import Hand History
                  </button>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => setShowSolverImport(true)}
                    disabled={!!activePlayBlock}
                    style={btn('secondary', { block: true, disabled: !!activePlayBlock })}
                  >
                    <FileCode size={16} strokeWidth={2} aria-hidden="true" /> Import Solver Node
                  </button>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => setShowShareScenario(true)}
                    style={btn('secondary', { block: true })}
                  >
                    <Share2 size={16} strokeWidth={2} aria-hidden="true" /> Internal Share
                  </button>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => { recordExplorationSnapshot('Session Report Snapshot'); setShowSessionReport(true); }}
                    style={btn('secondary', { block: true })}
                  >
                    <ClipboardList size={16} strokeWidth={2} aria-hidden="true" /> Session Report
                  </button>
                  <button
                    type="button"
                    className="pa-btn"
                    onClick={() => setShowAnalytics((v) => !v)}
                    aria-expanded={showAnalytics}
                    style={btn('secondary', { block: true })}
                  >
                    <BarChart3 size={16} strokeWidth={2} aria-hidden="true" /> Historical Stats
                  </button>
                </div>

                {/* Image Export Card */}
                <div style={{ marginTop: S.md }}>
                  <ExportCard
                    results={null}
                    scenario={exportScenarioPayload}
                    equity={equity}
                    villainRange={activeVillainRange}
                  />
                </div>

                {/* Saved Account Bookmarks Preview */}
                <div className="bookmarks-block">
                  <div className="panel-header-row">
                    <span style={{ ...sectionTitle, marginBottom: 0 }}>Recent Bookmarks</span>
                    {userId && (
                      <button
                        type="button"
                        className="pa-btn"
                        onClick={refetchBookmarks}
                        style={{ ...btn('ghost'), minHeight: 36, padding: '0 8px', fontSize: F.caption, color: T.accent }}
                      >
                        Refresh
                      </button>
                    )}
                  </div>
                  {authInitializing || bookmarksLoading ? (
                    <Skeleton h={44} />
                  ) : bookmarksError ? (
                    <ErrorState title="Bookmarks Unavailable" body={bookmarksError} onRetry={refetchBookmarks} />
                  ) : !userId ? (
                    <p className="panel-note">Sign In To Sync Bookmarks And Study Folders Across Devices.</p>
                  ) : bookmarks.length === 0 ? (
                    <p className="panel-note">No Bookmarked Hands Yet. Save Any Spot To A Study Folder Above.</p>
                  ) : (
                    <div className="bookmarks-list">
                      {bookmarks.slice(0, 4).map((bm) => (
                        <button
                          key={bm.id}
                          type="button"
                          className="bookmark-row"
                          onClick={() => {
                            const raw = bm.scenario_json || bm;
                            restoreScenario({
                              heroHand: raw.heroHand || (raw.hero_hand ? { card1: String(raw.hero_hand).slice(0, 2), card2: String(raw.hero_hand).slice(2, 4) } : null),
                              heroPosition: raw.heroPosition || raw.hero_position || 'BTN',
                              heroStack: raw.heroStack || raw.hero_stack || 100,
                              board: raw.board || {
                                flop: raw.board_flop ? String(raw.board_flop).split(/[,\s]+/).filter(Boolean) : [],
                                turn: raw.board_turn || null,
                                river: raw.board_river || null,
                              },
                            });
                            toast.success('Bookmark Loaded On Table');
                          }}
                        >
                          <span className="bookmark-hand">{bm.hero_hand || bm.title || 'Saved Spot'}</span>
                          <span className="bookmark-meta">{bm.hero_position || 'BTN'} · Load</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Optional Collapsible Historical Session Analytics (Read-Only) */}
              {showAnalytics && (
                <section className="workspace-panel" aria-label="Historical Session Analytics">
                  <p className="panel-note" style={{ marginBottom: S.sm }}>
                    Read-Only Historical Archive. Ungraded Virtual Sandbox Exploration Never Modifies These Records.
                  </p>
                  <SessionAnalytics userId={userId} />
                </section>
              )}
            </div>
          </div>

          {/* ── Verified Solver Destinations Bar (Honest Routing For Graded Study) ── */}
          <section className="workspace-panel" aria-label="Verified Solver-Backed Destinations">
            <div className="panel-header-row">
              <div>
                <h2 className="panel-heading">Need Verified Solver Grading?</h2>
                <p className="panel-note">
                  Use These Signed, Solver-Backed Destinations Whenever You Want Graded Decisions, Measured EV, Or
                  Tracked Training Progress.
                </p>
              </div>
              <Check size={18} strokeWidth={2.5} color={T.success} aria-hidden="true" />
            </div>

            <div
              className="sandbox-command-bar"
              aria-label="Verified Training Destinations"
              data-tutorial="sandbox-destinations"
            >
              {VERIFIED_DESTINATIONS.map((dest) => (
                <Link
                  key={dest.href}
                  href={dest.href}
                  className={dest.primary ? 'destination primary' : 'destination'}
                  onClick={() => haptic('light')}
                >
                  <span className="dest-title">
                    {dest.title} <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <small>{dest.description}</small>
                </Link>
              ))}
            </div>

            <Link href="/hub/personal-assistant" className="back-link" onClick={() => haptic('light')}>
              Back To Personal Assistant
            </Link>
          </section>

          {/* ── Platform Reference Disclosure ── */}
          <details className="summary-disclosure">
            <summary>
              <span>About Virtual Sandbox &amp; Study Authority</span>
              <small>Platform Reference</small>
            </summary>
            <div className="summary-disclosure-body">
              <HubPageSummary page="personal-assistant-sandbox" />
            </div>
          </details>
        </div>
      </HubPageShell>

      {/* ═══════════════════ MODALS & SHEETS ═══════════════════ */}
      <CardPickerSheet
        isOpen={showDeck}
        onClose={closeDeck}
        onSelect={handleDeckSelect}
        usedCards={allUsedCards}
        mode={deckTarget === 'hero' ? 'hero' : deckTarget === 'board' ? 'board' : 'single'}
        pickProgress={heroPickStep}
        onRandomCard={() => {
          const [card] = pickRandomCards(1, allUsedCards);
          if (card) handleDeckSelect(card);
        }}
        onRandomFlop={dealRandomBoard}
      />

      <SetupSheet
        isOpen={showSetup}
        onClose={closeSetup}
        heroPosition={heroPosition}
        setHeroPosition={setHeroPosition}
        gameType={gameType}
        setGameType={setGameType}
        heroStack={heroStack}
        setHeroStack={setHeroStack}
        potBase={potBase}
        setPotBase={setPotBase}
        villains={villains}
        onVillainPatch={patchVillain}
        onVillainArchetype={handleVillainArchetype}
        onAddVillain={addVillain}
        onRemoveVillain={removeVillain}
        onOpenPresets={() => { setShowSetup(false); setShowVillainPresets(true); }}
        onOpenRanges={() => { setShowSetup(false); setShowRangeExplorer(true); }}
        tableFelt={tableFelt}
        onChangeFelt={setTableFelt}
        arenaThemeActive={!!arenaTheme?.fromCache}
        equityVsRange={equityVsRange}
        setEquityVsRange={setEquityVsRange}
      />

      <TemplatesSheet
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        templates={templates}
        status={templatesStatus}
        error={templatesError}
        saving={templateSaving}
        onReload={loadTemplates}
        onSave={saveTemplate}
        onLoad={(tpl) => {
          restoreScenario(tpl?.scenario_json);
          setShowTemplates(false);
          toast.success(`Loaded "${tpl?.name || 'Template'}"`);
        }}
        onDelete={deleteTemplate}
      />

      {showRangeHeatGrid && (
        <RangeHeatGrid
          isOpen={showRangeHeatGrid}
          onClose={closeRangeHeatGrid}
          villainRange={activeVillainRange}
          villainLabel={`${primaryVillain?.position || 'BB'} · ${primaryVillain?.archetype?.name || 'GTO Neutral'}`}
          heroHand={heroHand}
          boardCards={communityCards}
        />
      )}

      {showRangeExplorer && (
        <RangeExplorer
          initialRange={activeVillainRange}
          villains={villains}
          initialVillainIdx={safeVillainIdx}
          onSelectRange={(rangeStr, targetIdx = safeVillainIdx) => {
            patchVillain(targetIdx, { range: rangeStr });
            toast.success('Updated Villain Range');
          }}
          onClose={() => setShowRangeExplorer(false)}
        />
      )}

      {showVillainPresets && (
        <VillainPresetPicker
          villains={villains}
          initialVillainIdx={safeVillainIdx}
          onSelectPreset={(preset, targetIdx = safeVillainIdx) => {
            patchVillain(targetIdx, {
              range: preset.range || '',
              archetype: preset.archetype || { id: preset.id, name: preset.name },
            });
            toast.success(`Applied ${preset.name} Preset`);
          }}
          onClose={() => setShowVillainPresets(false)}
        />
      )}

      {showSaveHand && (
        <SaveHandModal
          sandboxState={sandboxSnapshot}
          onClose={() => setShowSaveHand(false)}
          onSaveComplete={() => refetchBookmarks()}
        />
      )}

      {showStudyFolders && (
        <StudyFolders
          onClose={() => setShowStudyFolders(false)}
          onLoadTarget={(state) => {
            restoreScenario(state);
            toast.success('Saved Scenario Loaded On Table');
          }}
        />
      )}

      {showImportHH && (
        <ImportHHModal
          isVisible={showImportHH}
          onClose={() => setShowImportHH(false)}
          onImport={(parsed) => {
            restoreScenario(parsed);
            recordExplorationSnapshot('Imported Hand History', parsed);
            toast.success(
              parsed?.wagerSizesExact
                ? 'Hand History Loaded With Exact Wager Sizes'
                : 'Hand History Loaded (Estimated Wager Sizes)',
            );
          }}
        />
      )}

      {showSolverImport && (
        <ExternalSolverImport
          onClose={() => setShowSolverImport(false)}
          onImport={(state) => {
            restoreScenario(state);
            recordExplorationSnapshot('Imported Solver Node', state);
          }}
        />
      )}

      {showHandReplay && (
        <HandReplay
          sessionLog={sessionLog}
          onLoadScenario={(entry) => {
            const replayScenario = replayScenarioFromEntry(entry);
            if (!replayScenario) {
              toast.error('This Replay Contains Incomplete Or Invalid Cards.');
              return;
            }
            restoreScenario(replayScenario);
            toast.success('Loaded Spot From Replay');
          }}
          onClose={() => setShowHandReplay(false)}
        />
      )}

      {showShareScenario && (
        <ShareScenarioModal
          sandboxState={sandboxSnapshot}
          onClose={() => setShowShareScenario(false)}
        />
      )}

      {showSessionReport && (
        <SessionReport
          sessionLog={sessionLog}
          coachStreak={0}
          sessionStartedAt={sessionStartedAtRef.current}
          onClose={() => setShowSessionReport(false)}
        />
      )}

      <style jsx>{`
        .sandbox-page-root {
          min-height: 100dvh;
          width: 100%;
          max-width: 100vw;
          overflow-x: clip;
          color: #f1f5fc;
          font-family: Arial, Inter, -apple-system, sans-serif;
        }

        .sandbox-workspace {
          width: min(100% - 16px, 1040px);
          margin: 0 auto;
          padding: 12px 0 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .sandbox-header-card,
        .workspace-panel {
          padding: 14px;
          border: 1px solid rgba(140, 161, 180, 0.28);
          border-top-color: #aec0d0;
          border-radius: 7px;
          background:
            radial-gradient(ellipse at 90% -40%, rgba(30, 56, 83, 0.45), transparent 63%),
            linear-gradient(145deg, #091727, #030b14 74%);
        }

        .sandbox-header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .sandbox-eyebrow {
          margin: 0 0 2px;
          color: #83deff;
          font: 700 12px / 1.2 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .sandbox-title {
          margin: 0;
          color: #f1f5fc;
          font: 800 clamp(22px, 4vw, 28px) / 1.1 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
        }

        .sandbox-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .honesty-banner {
          margin-top: 12px;
          padding: 12px;
          border: 1px solid rgba(99, 231, 255, 0.32);
          border-left: 3px solid #56d8ff;
          border-radius: 6px;
          background: rgba(8, 124, 250, 0.10);
        }

        .honesty-pill-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 8px;
        }

        .honesty-copy {
          margin: 0;
          color: #dce5ef;
          font-size: 13px;
          line-height: 1.45;
        }

        .disclosed-limits-list {
          margin: 8px 0 0;
          padding-left: 18px;
          color: #b6c8d6;
          font-size: 12px;
          line-height: 1.5;
        }

        .active-play-gate {
          padding: 14px;
          border: 1px solid rgba(255, 107, 122, 0.55);
          border-radius: 7px;
          background: rgba(255, 107, 122, 0.14);
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-start;
        }

        .active-play-gate-head {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #ff6b7a;
          font-size: 15px;
        }

        .active-play-gate p {
          margin: 0;
          color: #f1f5fc;
          font-size: 13px;
          line-height: 1.45;
        }

        .sandbox-metrics-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .metric-tile {
          min-width: 0;
          padding: 10px 12px;
          border: 1px solid rgba(140, 161, 180, 0.28);
          border-top-color: #aec0d0;
          border-radius: 7px;
          background: linear-gradient(155deg, #12273b, #07111c 70%);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .metric-label {
          color: #9aabba;
          font: 700 12px / 1.2 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
          text-transform: uppercase;
        }

        .metric-value {
          color: #f1f5fc;
          font-size: 16px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .metric-sub {
          color: #b6c8d6;
          font-size: 12px;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sandbox-main-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          align-items: start;
        }

        .sandbox-col {
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 0;
        }

        .panel-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .panel-heading {
          margin: 0;
          color: #f1f5fc;
          font: 700 16px / 1.2 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
        }

        .panel-btn-group {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .panel-note {
          margin: 4px 0 0;
          color: #b6c8d6;
          font-size: 12px;
          line-height: 1.45;
        }

        .limit-callout {
          margin: 0 0 10px;
          padding: 8px 10px;
          border-left: 3px solid #63e7ff;
          border-radius: 4px;
          background: rgba(8, 124, 250, 0.10);
          color: #dce5ef;
          font-size: 12px;
          line-height: 1.45;
        }

        .table-stage {
          width: 100%;
          border-radius: 9px;
          overflow: hidden;
        }

        .quick-action-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        .board-slots-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        .seat-selector-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .tools-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 10px;
        }

        .bookmarks-block {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(140, 161, 180, 0.24);
        }

        .bookmarks-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 6px;
        }

        .bookmark-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          min-height: 44px;
          padding: 8px 12px;
          border: 1px solid rgba(140, 161, 180, 0.28);
          border-radius: 6px;
          background: #13253a;
          color: #f1f5fc;
          font-size: 13px;
          cursor: pointer;
          text-align: left;
        }

        .bookmark-hand {
          font-weight: 700;
        }

        .bookmark-meta {
          color: #83deff;
          font-size: 12px;
          font-weight: 700;
        }

        .sandbox-command-bar {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 10px;
        }

        .destination,
        .sandbox-command-bar :global(a.destination) {
          display: block;
          min-height: 64px;
          padding: 11px 12px;
          border: 1px solid rgba(140, 161, 180, 0.28);
          border-top-color: #aec0d0;
          border-radius: 6px;
          color: #f1f5fc;
          background: linear-gradient(180deg, #152639 0%, #06111e 65%);
          text-align: left;
          text-decoration: none;
          cursor: pointer;
        }

        .destination.primary,
        .sandbox-command-bar :global(a.destination.primary) {
          grid-column: 1 / -1;
          border-color: #56d8ff;
          border-top-color: #b3eaff;
          background: linear-gradient(180deg, #087cfa 0%, #0044ac 55%, #002b68 100%);
        }

        .dest-title {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font: 700 14px / 1.2 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
          color: #f1f5fc;
        }

        .destination small,
        .sandbox-command-bar :global(a.destination small) {
          display: block;
          margin-top: 4px;
          color: #dce5ef;
          font-size: 12px;
          line-height: 1.35;
        }

        .back-link,
        .workspace-panel :global(a.back-link) {
          display: inline-flex;
          align-items: center;
          margin-top: 10px;
          min-height: 44px;
          color: #83deff;
          font: 700 13px 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .summary-disclosure {
          border: 1px solid rgba(140, 161, 180, 0.24);
          border-top-color: #aec0d0;
          border-radius: 7px;
          background: linear-gradient(145deg, #091727, #030b14 74%);
          overflow: clip;
        }

        .summary-disclosure > summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 44px;
          padding: 10px 14px;
          cursor: pointer;
          color: #f1f5fc;
          font: 700 13px / 1.2 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
          list-style: none;
        }

        .summary-disclosure > summary small {
          color: #9aabba;
          font: 600 12px / 1.2 Arial, sans-serif;
        }

        .summary-disclosure-body {
          border-top: 1px solid rgba(140, 161, 180, 0.24);
          padding: 8px 12px;
        }

        .deck-mobile-only {
          display: none;
        }

        .deck-desktop-only {
          display: block;
        }

        @media (max-width: 900px) {
          .sandbox-metrics-strip {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 768px) {
          .sandbox-workspace {
            width: calc(100% - 12px);
            padding-top: 8px;
          }

          .sandbox-main-grid,
          .sandbox-command-bar,
          .tools-grid {
            grid-template-columns: 1fr;
          }

          .deck-mobile-only {
            display: block;
          }

          .deck-desktop-only {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
