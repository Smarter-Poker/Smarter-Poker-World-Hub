/**
 * Virtual Sandbox — GTO Theoretical Lab (v3.0, mobile-first)
 * ═══════════════════════════════════════════════════════════════════════════
 * PA_DESIGN_SPEC v1 "Neon Slate". Designed at 375x667 FIRST.
 *
 * Layout (<=768px, the primary target):
 *   1. status strip  (hand class, equity, live pot, SPR, accuracy, streak, due)
 *   2. poker table at FULL width  — id="sandbox-table"
 *   3. street timeline + board strip
 *   4. action-line builder        — id="action-history"
 *   5. secondary study panels (preflop chart, runouts)
 *   6. sticky thumb bar           — id="run-analysis"  [Undo][Deal][ANALYZE][Setup]
 * Everything that used to live in the two 90-110px side rails now lives in the
 * Setup bottom sheet. Every overlay on this page is a bottom sheet.
 */

import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { useRouter } from 'next/router';
import toast, { Toaster } from 'react-hot-toast';
import LZString from 'lz-string';
import {
  Brain, Mic, MicOff, Target, Star, X as XIcon, RotateCcw, Undo2, Shuffle,
  SlidersHorizontal, ChevronDown, ChevronUp, ChevronRight, Loader2, Plus,
  Trash2, Share2, Layers, PlayCircle, AlertTriangle, Check, Camera,
  BookOpen, Zap, Trophy, Upload, GraduationCap,
} from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useSandboxAnalysis, useArchetypes, useRecentSessions, useBookmarks, useStudyDeck, useQuizLeaderboard } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import {
  calculateEquity, simulateRunouts,
  calculateEquityAsync, simulateRunoutsAsync,
  isEquityWorkerAvailable, terminateEquityWorker,
} from '../../../src/lib/sandbox/EquityEngine';
import { getRangeGrid, getRangePercentage } from '../../../src/lib/sandbox/PreflopCharts';
import { getArchetypeRangeString, getArchetypeVPIP, getArchetypeInfo, ARCHETYPE_CONFIG } from '../../../src/lib/sandbox/VillainArchetypeRanges';
import SandboxPokerTable, { TableCard } from '../../../src/components/sandbox/SandboxPokerTable';
import RangeHeatGrid from '../../../src/components/sandbox/RangeHeatGrid';
import useSandboxSounds from '../../../src/hooks/useSandboxSounds';
import { saveAppSetting } from '../../../src/lib/appSettingsSync';
import {
  // design tokens + primitives (single source of truth for this surface)
  T, F, S, R, Z, btn, iconBtn, pill, cardCompact, sectionTitle, NUM,
  BottomSheet, EmptyState, ErrorState, SkeletonRows,
  usePrefersReducedMotion,
  // logic
  gradeAction, computeHandState,
  villainResponseDistribution, pickWeighted,
  // panels
  FrequencyBar, RangeMatrix, classifyBoardTexture,
  ActionHistoryBuilder, SizingSensitivity, TreeVisualization,
  OnboardingTour, ShareAnalysisModal, StreetTimeline, AnalysisSkeleton,
  PreflopChartOverlay, RunoutChart, ExploitToggle,
  QuizPanel, StudyReplayCard, LeaderboardCard, StatusStrip,
  EquityGraph, SessionLogModal, CoachActionPicker, CoachVerdict, ActionReplayBar, ShareHandModal,
  VillainReadCard, ShortcutLegend,
} from '../../../src/components/sandbox/SandboxComponents';
import { ExportCard } from '../../../src/components/sandbox/ExportCard';
import RangeExplorer from '../../../src/components/sandbox/RangeExplorer';
import QuickSpotDrill from '../../../src/components/sandbox/QuickSpotDrill';
import SessionReport from '../../../src/components/sandbox/SessionReport';
import CoachFeedback from '../../../src/components/sandbox/CoachFeedback';
import TiltMonitor from '../../../src/components/sandbox/TiltMonitor';
import VillainPresetPicker from '../../../src/components/sandbox/VillainPresetPicker';
import HandReplay from '../../../src/components/sandbox/HandReplay';
import StudyFolders from '../../../src/components/sandbox/StudyFolders';
import SaveHandModal from '../../../src/components/sandbox/SaveHandModal';
import ShareScenarioModal from '../../../src/components/sandbox/ShareScenarioModal';
import CustomDrillBuilder from '../../../src/components/sandbox/CustomDrillBuilder';
import GodModePanel from '../../../src/components/sandbox/GodModePanel';
import ExternalSolverImport from '../../../src/components/sandbox/ExternalSolverImport';
import EquityHeatmapOverlay from '../../../src/components/sandbox/EquityHeatmapOverlay';
import NodeLockExploits from '../../../src/components/sandbox/NodeLockExploits';
import ImportHHModal from '../../../src/components/sandbox/ImportHHModal';
import { idbSaveSessionLog, idbLoadSessionLog } from '../../../src/utils/indexeddb-pwa';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { findBestGames } from '../../../src/utils/videoToTrainingMapper';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
  { code: 's', symbol: '♠', label: 'Spades', color: '#E4E6EB' },
  { code: 'h', symbol: '♥', label: 'Hearts', color: '#EF4444' },
  { code: 'd', symbol: '♦', label: 'Diamonds', color: '#4599FF' },
  { code: 'c', symbol: '♣', label: 'Clubs', color: '#22C55E' },
];
const GAME_TYPES = [
  { id: 'cash', label: 'Cash Game' },
  { id: 'tournament', label: 'Tournament' },
];
const MAX_VILLAINS = 5;
const DEFAULT_VILLAINS = [{ id: 0, position: 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: 100, range: '' }];

// Abort handle for the equity worker. AbortController ships everywhere Worker
// does, but this surface has to survive old in-app webviews, so never assume:
// without it the effect's own `cancelled` flag still stops a stale result from
// landing, we just cannot interrupt the run early.
function makeEquityAbort() {
  if (typeof AbortController === 'undefined') return { signal: undefined, abort: () => {} };
  const controller = new AbortController();
  return { signal: controller.signal, abort: () => { try { controller.abort(); } catch (e) { /* already aborted */ } } };
}

const FELT_COLORS = [
  { id: 'default', label: 'Black', filter: 'none', swatch: '#18191A' },
  { id: 'green', label: 'Green', filter: 'hue-rotate(100deg) saturate(1.5)', swatch: '#166534' },
  { id: 'blue', label: 'Blue', filter: 'hue-rotate(200deg) saturate(1.3)', swatch: '#1E3A5F' },
  { id: 'red', label: 'Red', filter: 'hue-rotate(340deg) saturate(1.5)', swatch: '#7F1D1D' },
];

const SUIT_ASSET = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_ASSET = { A: 'a', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', T: '10', J: 'j', Q: 'q', K: 'k' };

// Short, legible labels for the board-texture chip (the long solver strings are
// wider than a 375px viewport).
const TEXTURE_SHORT = {
  '3-OF-A-KIND BOARD': 'Trips',
  'MONOTONE': 'Monotone',
  'FLUSH POSSIBLE': 'Flush live',
  'WET / CONNECTED': 'Wet',
  'DRY': 'Dry',
  'PAIRED': 'Paired',
  'HIGH CARDS': 'High cards',
  'TWO-TONE': 'Two-tone',
  'RAINBOW': 'Rainbow',
};

// Ensure every villain carries a stable id (NodeLockExploits keys/calls with v.id)
const withVillainIds = (arr) => (arr || []).map((v, i) => ({ ...v, id: v.id ?? i }));

// ═══════════════════════════════════════════════════════════════
// SAFE STORAGE — localStorage throws in Safari private mode / iframes
// ═══════════════════════════════════════════════════════════════
const safeLocal = {
  get(key, fallback = null) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return fallback;
      const v = window.localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      window.localStorage.setItem(key, String(value));
      return true;
    } catch (e) { return false; }
  },
};

// ═══════════════════════════════════════════════════════════════
// HAND / BOARD HELPERS
// ═══════════════════════════════════════════════════════════════
const RANK_ORDER = 'AKQJT98765432';

/** 'Ah','Kd' -> 'AKo'.  Used by the offline solver and the SRS key. */
function handKeyOf(hand) {
  const c1 = hand?.card1, c2 = hand?.card2;
  if (!c1 || !c2 || c1.length < 2 || c2.length < 2) return null;
  const r1 = c1[0].toUpperCase(), r2 = c2[0].toUpperCase();
  const suited = c1[1].toLowerCase() === c2[1].toLowerCase();
  const i1 = RANK_ORDER.indexOf(r1), i2 = RANK_ORDER.indexOf(r2);
  if (i1 < 0 || i2 < 0) return null;
  const [hi, lo] = i1 <= i2 ? [r1, r2] : [r2, r1];
  if (hi === lo) return `${hi}${lo}`;
  return `${hi}${lo}${suited ? 's' : 'o'}`;
}

function streetOfBoard(b) {
  if (!b || (b.flop || []).length === 0) return 'preflop';
  if (!b.turn) return 'flop';
  if (!b.river) return 'turn';
  return 'river';
}

function boardToArray(b) {
  if (!b) return [];
  if (Array.isArray(b)) return b.filter(Boolean);
  return [...(b.flop || []), b.turn, b.river].filter(Boolean);
}

/**
 * Hand-strength tier. Previously computed and thrown away — now it renders as a
 * chip in the status strip, which is free teaching content.
 */
function getHandStrength(hand) {
  if (!hand?.card1 || !hand?.card2) return null;
  const r1 = hand.card1[0], r2 = hand.card2[0];
  const suited = hand.card1[1] === hand.card2[1];
  const i1 = RANK_ORDER.indexOf(r1), i2 = RANK_ORDER.indexOf(r2);
  const gap = Math.abs(i1 - i2);
  const high = 'AKQJ';

  if (r1 === r2) {
    if ('AA KK QQ'.includes(`${r1}${r2}`)) return { label: 'Premium pair', tone: 'success', strength: 5 };
    if ('JJ TT'.includes(`${r1}${r2}`)) return { label: 'Strong pair', tone: 'success', strength: 4 };
    if (i1 <= 4) return { label: 'Medium pair', tone: 'warn', strength: 3 };
    return { label: 'Small pair', tone: 'warn', strength: 2 };
  }
  if (high.includes(r1) && high.includes(r2)) {
    return { label: suited ? 'Suited broadway' : 'Broadway', tone: 'accent', strength: suited ? 4 : 3 };
  }
  if (suited && gap === 1 && i1 >= 3) return { label: 'Suited connectors', tone: 'purple', strength: 3 };
  if (suited && gap <= 2) return { label: 'Suited gapper', tone: 'purple', strength: 2 };
  if (suited && (r1 === 'A' || r2 === 'A')) return { label: 'Suited ace', tone: 'accent', strength: 3 };
  if (suited) return { label: 'Suited', tone: 'accent', strength: 2 };
  if (gap === 1 && i1 <= 5) return { label: 'Connectors', tone: 'neutral', strength: 2 };
  if (r1 === 'A' || r2 === 'A') return { label: 'Ace high', tone: 'neutral', strength: 2 };
  return { label: 'Offsuit', tone: 'neutral', strength: 1 };
}

function getResultsSummary(results) {
  if (!results?.optimalAction) return null;
  const action = results.optimalAction.label || '';
  const freq = results.optimalAction.frequency || 0;
  let advice;
  if (freq >= 90) advice = `You should ${action.toLowerCase()} here almost always.`;
  else if (freq >= 70) advice = `You should mostly ${action.toLowerCase()} here (${freq}% of the time).`;
  else if (freq >= 50) advice = `${action} is slightly preferred here, but this is a close spot.`;
  else advice = `This is a mixed spot. ${action} is most common at ${freq}%.`;
  if (results.isMixed) advice += ' Multiple actions are viable.';
  return advice;
}

// ═══════════════════════════════════════════════════════════════
// VILLAIN ACTION SIMULATION
// Frequency tables live in SandboxComponents so the decision tree, the coach
// picker and this simulator all read the SAME distribution.
// ═══════════════════════════════════════════════════════════════
function simulateVillainAction(villain, lastAction, texture, street) {
  if (!villain) return null;
  const dist = villainResponseDistribution(villain.archetype?.id || 'gto_neutral', lastAction?.action, texture);
  if (!dist || dist.length === 0) return null;
  const weights = {};
  dist.forEach(d => { weights[d.id] = d.pct; });
  const pickedId = pickWeighted(weights);
  if (!pickedId) return null;
  const chosen = dist.find(d => d.id === pickedId);
  return {
    position: villain.position || 'BB',
    action: pickedId,
    label: chosen?.label || pickedId,
    isVillain: true,
    isHero: false,
    archetype: villain.archetype?.id || 'gto_neutral',
    street: street || undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// OFFLINE SOLVER FALLBACK
// When /api/assistant/sandbox/analyze is unreachable the tool must still say
// something useful instead of showing a red box. Preflop reads the shipped
// GTO charts; postflop is an equity / pot-odds / texture heuristic. Always
// clearly badged so nobody mistakes it for solver output.
// ═══════════════════════════════════════════════════════════════
function localSolve({ heroHand, heroPosition, board, handState, texture, equityPct, preflopScenario }) {
  const street = streetOfBoard(board);
  const mk = (label, frequency) => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    label, frequency, isOptimal: false, color: T.warn,
  });
  let actions = [];
  let explanation = '';
  const eq = Number(equityPct);
  const hasEq = Number.isFinite(eq);

  if (street === 'preflop') {
    const key = handKeyOf(heroHand);
    const scenarioLabel = preflopScenario === '3bet' ? '3-bet' : 'opening';
    let cell = null;
    try {
      const grid = getRangeGrid(heroPosition, preflopScenario || 'rfi') || [];
      cell = grid.flat().find(c => c && c.hand === key) || null;
    } catch (e) { console.warn('[Sandbox] offline chart lookup failed:', e?.message || e); }

    if (cell?.inRange) {
      const label = cell.action === 'call' ? 'Call' : cell.action === 'check' ? 'Check' : 'Raise';
      actions = [mk(label, 85), mk('Fold', 15)];
      explanation = `${key || 'This hand'} is inside the ${heroPosition} ${scenarioLabel} range, so the chart plays it as a ${label.toLowerCase()}.`;
    } else {
      actions = [mk('Fold', 85), mk('Raise', 15)];
      explanation = `${key || 'This hand'} sits outside the ${heroPosition} ${scenarioLabel} range.`;
    }
  } else if (handState?.facingBet) {
    const odds = handState.potOdds != null ? handState.potOdds : 33;
    if (hasEq && eq >= odds + 18) actions = [mk('Raise', 55), mk('Call', 40), mk('Fold', 5)];
    else if (hasEq && eq >= odds) actions = [mk('Call', 70), mk('Fold', 20), mk('Raise', 10)];
    else actions = [mk('Fold', 75), mk('Call', 20), mk('Raise', 5)];
    explanation = `Facing ${handState.toCall} BB into ${handState.pot} BB you need about ${odds}% to continue`
      + (hasEq ? `, and you hold roughly ${eq.toFixed(0)}%.` : '; hero equity is unknown without cards.');
  } else {
    const dry = !!(texture?.isDry || texture?.isPaired);
    const sizeLabel = dry ? 'Bet 33%' : 'Bet 66%';
    if (hasEq && eq >= 60) actions = [mk(sizeLabel, 70), mk('Check', 30)];
    else if (hasEq && eq >= 45) actions = [mk(sizeLabel, 45), mk('Check', 55)];
    else actions = [mk('Check', 75), mk(sizeLabel, 25)];
    explanation = `${texture?.label ? texture.label.toLowerCase() : 'This texture'} favours `
      + (dry ? 'a small, high-frequency c-bet.' : 'polarised sizing with more checks.')
      + (hasEq ? ` Your equity is around ${eq.toFixed(0)}%.` : '');
  }

  actions.sort((a, b) => b.frequency - a.frequency);
  if (actions[0]) actions[0].isOptimal = true;

  return {
    actions,
    optimalAction: actions[0] ? { ...actions[0] } : null,
    isMixed: (actions[0]?.frequency || 0) < 70,
    // heroDisplay '—' suppresses the EV grid rather than printing a fake 0.00
    ev: { hero: 0, heroDisplay: '—', max: 0, min: 0, avg: 0, evLoss: 0 },
    matchTier: 5,
    source: 'Offline estimate',
    offline: true,
    explanation: `${explanation} Offline estimate — reconnect for solver data.`,
  };
}

// ═══════════════════════════════════════════════════════════════
// SPACED REPETITION (SM-2 lite)
// Every missed coach/quiz answer becomes a scheduled review. Stored locally so
// it works offline and needs no DB table.
// ═══════════════════════════════════════════════════════════════
const SRS_KEY = 'sandbox-srs-v1';
const DAY_MS = 86400000;

function srsLoad() {
  try {
    const raw = safeLocal.get(SRS_KEY, '[]');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

function srsSave(list) {
  try { safeLocal.set(SRS_KEY, JSON.stringify((list || []).slice(-300))); } catch (e) { /* quota */ }
}

/** SM-2 interval update. `correct` grows the interval, a miss resets it. */
function srsUpsert(list, item, correct) {
  const next = [...(list || [])];
  const idx = next.findIndex(e => e.key === item.key);
  const prev = idx >= 0 ? next[idx] : { ease: 2.5, interval: 0, reps: 0 };
  let { ease = 2.5, interval = 0, reps = 0 } = prev;
  if (correct) {
    reps += 1;
    ease = Math.max(1.3, ease + 0.1);
    interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(Math.max(1, interval) * ease);
  } else {
    reps = 0;
    ease = Math.max(1.3, ease - 0.2);
    interval = 0; // due again in 10 minutes
  }
  const dueAt = Date.now() + (interval > 0 ? interval * DAY_MS : 10 * 60 * 1000);
  const entry = { ...prev, ...item, ease, interval, reps, dueAt, lastResult: !!correct };
  if (idx >= 0) next[idx] = entry; else next.push(entry);
  return next;
}

const srsDue = (list) => (list || []).filter(e => (Number(e.dueAt) || 0) <= Date.now());

// ═══════════════════════════════════════════════════════════════
// CARD SLOT — one board card. Sized in JS (no !important CSS overrides that
// used to crop the image inside its clipping wrapper).
// ═══════════════════════════════════════════════════════════════
function CardSlot({ card, onTap, onRemove, label, w = 52, h = 72 }) {
  if (card) {
    return (
      <span style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
        <button
          type="button" className="pa-btn" onClick={onTap}
          aria-label={`${card} — tap to change`}
          style={{ background: 'none', border: 'none', padding: 0, display: 'block', cursor: 'pointer', touchAction: 'manipulation' }}
        >
          <TableCard card={card} style={{ width: w, height: h }} />
        </button>
        {onRemove && (
          <button
            type="button" className="pa-btn" onClick={onRemove}
            aria-label={`Remove ${card}`}
            style={{
              position: 'absolute', top: -8, right: -8, width: 24, height: 24,
              borderRadius: '50%', background: T.danger, border: '2px solid #18191A',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0, touchAction: 'manipulation',
            }}
          >
            <XIcon size={12} strokeWidth={3} aria-hidden="true" />
          </button>
        )}
      </span>
    );
  }
  return (
    <button
      type="button" className="pa-btn" onClick={onTap}
      aria-label={label ? `Add ${label} card` : 'Add board card'}
      style={{
        width: w, height: h, borderRadius: R.sm, cursor: 'pointer', flexShrink: 0,
        background: T.accentSoft, border: `2px dashed rgba(69,153,255,0.35)`,
        color: T.accent, fontSize: F.caption, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'manipulation', boxSizing: 'border-box',
      }}
    >
      {label || <Plus size={18} strokeWidth={2.5} aria-hidden="true" />}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD PICKER — two-step (rank, then suit) on phones.
// The old 4x13 grid rendered 24x34px cards; the mobile override made each row
// 530px wide and pushed the ace off-screen. Every target here clears 44px.
// The classic grid is kept for >=769px via the .deck-* CSS classes.
// ═══════════════════════════════════════════════════════════════
function CardPickerSheet({ isOpen, onClose, onSelect, usedCards = [], mode, pickProgress, onRandomCard, onRandomFlop }) {
  const [rank, setRank] = useState(null);
  useEffect(() => { if (!isOpen) setRank(null); }, [isOpen]);

  const isHero = mode === 'hero';
  const title = isHero ? `Pick card ${pickProgress || 1} of 2` : mode === 'board' ? 'Select board card' : 'Select a card';
  const used = useMemo(() => new Set(usedCards || []), [usedCards]);
  const freeCountFor = (r) => SUITS.filter(s => !used.has(`${r}${s.code}`)).length;

  const pick = (cardStr) => {
    if (used.has(cardStr)) return;
    setRank(null);
    onSelect(cardStr);
  };

  return (
    <BottomSheet
      isOpen={isOpen} onClose={onClose} title={title}
      labelledBy="pa-card-picker-title"
      subtitle={rank ? `Choose a suit for ${rank}` : 'Choose a rank'}
      footer={(
        <>
          {onRandomCard && (
            <button type="button" className="pa-btn" onClick={onRandomCard} style={{ ...btn('secondary'), flex: 1, minWidth: 0 }}>
              <Shuffle size={18} strokeWidth={2} aria-hidden="true" />Random
            </button>
          )}
          {onRandomFlop && mode === 'board' && (
            <button type="button" className="pa-btn" onClick={onRandomFlop} style={{ ...btn('secondary'), flex: 1, minWidth: 0 }}>
              Random flop
            </button>
          )}
          <button type="button" className="pa-btn" onClick={onClose} style={{ ...btn('primary'), flex: 1, minWidth: 0 }}>Done</button>
        </>
      )}
    >
      {isHero && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: S.xs, marginBottom: S.md }} aria-hidden="true">
          {[1, 2].map(n => (
            <span key={n} style={{
              width: 28, height: 4, borderRadius: R.pill,
              background: (pickProgress || 1) >= n ? T.accent : T.surface2,
            }} />
          ))}
        </div>
      )}

      {/* ── Mobile: two-step rank -> suit ── */}
      <div className="deck-steps-only">
        {!rank ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: S.sm }}>
            {RANKS.map(r => {
              const free = freeCountFor(r);
              return (
                <button
                  key={r} type="button" className="pa-btn"
                  disabled={free === 0}
                  onClick={() => setRank(r)}
                  aria-label={`Rank ${r}, ${free} suits available`}
                  style={{
                    ...btn('secondary', { disabled: free === 0 }),
                    minHeight: 56, padding: 0, flexDirection: 'column', gap: 0,
                    fontSize: 20, fontWeight: 800,
                  }}
                >
                  {r}
                  <span style={{ fontSize: F.caption, fontWeight: 600, color: T.textDim }}>{free}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: S.sm }}>
              {SUITS.map(s => {
                const cardStr = `${rank}${s.code}`;
                const isUsed = used.has(cardStr);
                return (
                  <button
                    key={s.code} type="button" className="pa-btn"
                    disabled={isUsed}
                    onClick={() => pick(cardStr)}
                    aria-label={`${rank} of ${s.label}${isUsed ? ' — already used' : ''}`}
                    style={{
                      ...btn('secondary', { disabled: isUsed }),
                      minHeight: 64, gap: S.sm, fontSize: 22, fontWeight: 800, color: s.color,
                    }}
                  >
                    <span aria-hidden="true">{rank}{s.symbol}</span>
                    <span style={{ fontSize: F.caption, color: T.textDim, fontWeight: 600 }}>{s.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button" className="pa-btn" onClick={() => setRank(null)}
              style={{ ...btn('ghost', { block: true }), marginTop: S.md }}
            >
              <ChevronDown size={18} strokeWidth={2} style={{ transform: 'rotate(90deg)' }} aria-hidden="true" />
              Back to ranks
            </button>
          </>
        )}
      </div>

      {/* ── Desktop: classic 4x13 grid ── */}
      <div className="deck-grid-only">
        {SUITS.map(suit => (
          <div key={suit.code} style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 4, marginBottom: 4 }}>
            {RANKS.map(r => {
              const cardStr = `${r}${suit.code}`;
              const isUsed = used.has(cardStr);
              return (
                <button
                  key={cardStr} type="button" onClick={() => pick(cardStr)} disabled={isUsed}
                  aria-label={`${r} of ${suit.label}`}
                  style={{
                    aspectRatio: '5 / 7', padding: 0, minWidth: 0,
                    border: isUsed ? `1px solid ${T.border}` : `2px solid ${suit.color}44`,
                    borderRadius: R.sm, cursor: isUsed ? 'not-allowed' : 'pointer', overflow: 'hidden',
                    opacity: isUsed ? 0.18 : 1, background: '#fff', touchAction: 'manipulation',
                  }}
                >
                  <img
                    src={`/cards/${SUIT_ASSET[suit.code]}_${RANK_ASSET[r]}.png`}
                    alt={cardStr}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    loading="lazy" decoding="async"
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED FORM STYLES — every control clears 48px and uses 16px text so iOS
// never auto-zooms on focus. (The old COL_SELECT/COL_INPUT were 11px/22px.)
// ═══════════════════════════════════════════════════════════════
const FIELD_LABEL = {
  fontSize: F.label, color: T.textMuted, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, display: 'block',
};
const FIELD_CONTROL = {
  width: '100%', boxSizing: 'border-box', padding: '12px 12px', borderRadius: R.sm,
  fontSize: F.input, minHeight: 48, background: T.surface2,
  border: `1px solid ${T.borderHi}`, color: T.text, fontFamily: 'inherit',
};
const FIELD_ROW = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: S.md };

function Field({ label, children, htmlFor }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={FIELD_LABEL} htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETUP SHEET — everything that used to live in the two side rails.
// These are set once per session and do not deserve permanent screen space.
// ═══════════════════════════════════════════════════════════════
function SetupSheet({
  isOpen, onClose,
  heroPosition, setHeroPosition, gameType, setGameType, heroStack, setHeroStack,
  potBase, setPotBase, livePot,
  villains, onVillainPatch, onVillainArchetype, onAddVillain, onRemoveVillain,
  onOpenPresets, onOpenRanges,
  bubbleFactor, setBubbleFactor,
  tableFelt, onChangeFelt,
  isListening, onVoice, voiceSupported,
  equityVsRange, setEquityVsRange,
  onImportHH, onTemplates,
}) {
  return (
    <BottomSheet
      isOpen={isOpen} onClose={onClose} title="Setup"
      subtitle="Table, hero and opponents"
      labelledBy="pa-setup-title"
      footer={(
        <button type="button" className="pa-btn" onClick={onClose} style={btn('primary', { block: true })}>
          Done
        </button>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.lg }}>

        {/* ── Hero ── */}
        <section>
          <h4 style={{ ...sectionTitle, marginBottom: S.md }}>Hero</h4>
          <div style={FIELD_ROW}>
            <Field label="Position" htmlFor="setup-position">
              <select id="setup-position" value={heroPosition} onChange={e => setHeroPosition(e.target.value)} style={FIELD_CONTROL}>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Stack (BB)" htmlFor="setup-stack">
              <input
                id="setup-stack" type="text" inputMode="numeric" value={heroStack}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '');
                  setHeroStack(digits === '' ? '' : Math.min(500, parseInt(digits, 10)));
                }}
                onBlur={() => setHeroStack(h => Number(h) || 100)}
                style={{ ...FIELD_CONTROL, textAlign: 'center', fontWeight: 700, ...NUM }}
              />
            </Field>
          </div>
          <div style={{ ...FIELD_ROW, marginTop: S.md }}>
            <Field label="Game" htmlFor="setup-game">
              <select id="setup-game" value={gameType} onChange={e => setGameType(e.target.value)} style={FIELD_CONTROL}>
                {GAME_TYPES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </Field>
            <Field label="Starting pot (BB)" htmlFor="setup-pot">
              <input
                id="setup-pot" type="text" inputMode="decimal" value={potBase}
                onChange={e => {
                  const raw = e.target.value.replace(/[^\d.]/g, '');
                  setPotBase(raw === '' ? '' : raw);
                }}
                onBlur={() => setPotBase(p => {
                  const n = parseFloat(p);
                  return Number.isFinite(n) && n > 0 ? n : 1.5;
                })}
                style={{ ...FIELD_CONTROL, textAlign: 'center', fontWeight: 700, ...NUM }}
              />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: S.sm, marginTop: S.sm, flexWrap: 'wrap' }}>
            {[1.5, 3, 6, 10, 20].map(p => (
              <button
                key={p} type="button" className="pa-btn" onClick={() => setPotBase(p)}
                aria-pressed={Number(potBase) === p}
                style={{
                  ...btn(Number(potBase) === p ? 'primary' : 'secondary'),
                  flex: '1 0 56px', padding: '0 10px', fontSize: F.label, ...NUM,
                }}
              >{p}</button>
            ))}
          </div>
          <p style={{ fontSize: F.caption, color: T.textMuted, margin: `${S.sm}px 0 0`, lineHeight: 1.45, ...NUM }}>
            Live pot after the action line: <strong style={{ color: T.text }}>{Number(livePot || 0).toFixed(1)} BB</strong>
          </p>
        </section>

        {/* ── Tournament ICM ── */}
        {gameType === 'tournament' && (
          <section>
            <h4 style={{ ...sectionTitle, marginBottom: S.md }}>ICM pressure</h4>
            <label style={FIELD_LABEL} htmlFor="setup-bubble">Bubble factor</label>
            <input
              id="setup-bubble" type="range" min="1" max="3" step="0.1" value={bubbleFactor}
              onChange={e => setBubbleFactor(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: T.warn, height: 44 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...pill('warn'), ...NUM }}>{Number(bubbleFactor).toFixed(1)}x</span>
              <span style={{ fontSize: F.caption, color: T.textMuted }}>
                {bubbleFactor <= 1.2 ? 'Deep stacks' : bubbleFactor <= 2.0 ? 'Bubble' : 'Final table'}
              </span>
            </div>
          </section>
        )}

        {/* ── Opponents (multiway) ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, marginBottom: S.md }}>
            <h4 style={{ ...sectionTitle, margin: 0 }}>Opponents ({villains.length})</h4>
            <button
              type="button" className="pa-btn" onClick={onAddVillain}
              disabled={villains.length >= MAX_VILLAINS}
              aria-label="Add an opponent"
              style={{ ...btn('secondary', { disabled: villains.length >= MAX_VILLAINS }), padding: '0 12px', fontSize: F.caption }}
            >
              <Plus size={18} strokeWidth={2} aria-hidden="true" />Add
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
            {villains.map((v, idx) => (
              <div key={v.id ?? idx} style={{ ...cardCompact, background: T.surface2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, marginBottom: S.sm }}>
                  <span style={{ fontSize: F.bodySm, fontWeight: 700, color: T.text }}>
                    Opponent {idx + 1}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: S.sm }}>
                    {v.vpip != null && <span style={{ ...pill(v.vpip > 40 ? 'warn' : v.vpip > 25 ? 'accent' : 'success'), ...NUM }}>VPIP {v.vpip}%</span>}
                    {villains.length > 1 && (
                      <button
                        type="button" className="pa-btn" onClick={() => onRemoveVillain(idx)}
                        aria-label={`Remove opponent ${idx + 1}`}
                        style={iconBtn({ color: T.danger })}
                      >
                        <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                <div style={FIELD_ROW}>
                  <Field label="Seat" htmlFor={`v-pos-${idx}`}>
                    <select
                      id={`v-pos-${idx}`} value={v.position || 'BB'}
                      onChange={e => onVillainPatch(idx, { position: e.target.value }, true)}
                      style={FIELD_CONTROL}
                    >
                      {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label="Stack (BB)" htmlFor={`v-stack-${idx}`}>
                    <input
                      id={`v-stack-${idx}`} type="text" inputMode="numeric"
                      value={v.stack ?? 100}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, '');
                        onVillainPatch(idx, { stack: digits === '' ? '' : Math.min(500, parseInt(digits, 10)) });
                      }}
                      onBlur={() => onVillainPatch(idx, { stack: Number(v.stack) || 100 })}
                      style={{ ...FIELD_CONTROL, textAlign: 'center', fontWeight: 700, ...NUM }}
                    />
                  </Field>
                </div>

                <div style={{ marginTop: S.md }}>
                  <Field label="Style" htmlFor={`v-arch-${idx}`}>
                    <select
                      id={`v-arch-${idx}`} value={v.archetype?.id || 'gto_neutral'}
                      onChange={e => onVillainArchetype(idx, e.target.value)}
                      style={FIELD_CONTROL}
                    >
                      {Object.values(ARCHETYPE_CONFIG || {}).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </Field>
                  {ARCHETYPE_CONFIG[v.archetype?.id]?.postflopTip && (
                    <p style={{ fontSize: F.caption, color: T.textMuted, margin: `6px 0 0`, lineHeight: 1.45 }}>
                      {ARCHETYPE_CONFIG[v.archetype.id].postflopTip}
                    </p>
                  )}
                  {v.customRange && (
                    <p style={{ fontSize: F.caption, color: T.purple, margin: `6px 0 0`, fontWeight: 700 }}>
                      Custom range applied — simulation still uses the {v.archetype?.name || 'selected'} tendencies.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: S.sm, marginTop: S.md, flexWrap: 'wrap' }}>
            <button type="button" className="pa-btn" onClick={onOpenPresets} style={{ ...btn('secondary'), flex: '1 1 140px' }}>
              Villain presets
            </button>
            <button type="button" className="pa-btn" onClick={onOpenRanges} style={{ ...btn('secondary'), flex: '1 1 140px' }}>
              Range explorer
            </button>
          </div>
        </section>

        {/* ── Equity model ── */}
        <section>
          <h4 style={{ ...sectionTitle, marginBottom: S.md }}>Equity model</h4>
          <div style={{ display: 'flex', gap: S.sm }}>
            {[
              { id: true, label: "vs villain's range" },
              { id: false, label: 'vs random hand' },
            ].map(opt => (
              <button
                key={String(opt.id)} type="button" className="pa-btn"
                aria-pressed={equityVsRange === opt.id}
                onClick={() => setEquityVsRange(opt.id)}
                style={{
                  ...btn(equityVsRange === opt.id ? 'primary' : 'secondary'),
                  flex: 1, minWidth: 0, padding: '0 10px', fontSize: F.label,
                }}
              >{opt.label}</button>
            ))}
          </div>
        </section>

        {/* ── Table ── */}
        <section>
          <h4 style={{ ...sectionTitle, marginBottom: S.md }}>Felt colour</h4>
          <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
            {FELT_COLORS.map(f => (
              <button
                key={f.id} type="button" className="pa-btn"
                onClick={() => onChangeFelt(f.id)}
                aria-label={`${f.label} felt`}
                aria-pressed={tableFelt === f.id}
                style={{
                  width: 44, height: 44, borderRadius: '50%', padding: 0, cursor: 'pointer',
                  background: f.swatch, flexShrink: 0,
                  border: tableFelt === f.id ? `3px solid ${T.accent}` : `1px solid ${T.borderHi}`,
                  touchAction: 'manipulation',
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: F.caption, color: T.textMuted, margin: `${S.sm}px 0 0` }}>
            {FELT_COLORS.find(f => f.id === tableFelt)?.label || 'Black'} felt selected
          </p>
        </section>

        {/* ── Input helpers ── */}
        <section>
          <h4 style={{ ...sectionTitle, marginBottom: S.md }}>Load a scenario</h4>
          <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
            <button type="button" className="pa-btn" onClick={onImportHH} style={{ ...btn('secondary'), flex: '1 1 140px' }}>
              <Upload size={18} strokeWidth={2} aria-hidden="true" />Import hand
            </button>
            <button type="button" className="pa-btn" onClick={onTemplates} style={{ ...btn('secondary'), flex: '1 1 140px' }}>
              <BookOpen size={18} strokeWidth={2} aria-hidden="true" />Templates
            </button>
            {voiceSupported && (
              <button
                type="button" className="pa-btn" onClick={onVoice}
                aria-label="Voice input" aria-pressed={isListening}
                style={{ ...btn(isListening ? 'danger' : 'secondary'), flex: '1 1 140px' }}
              >
                {isListening
                  ? <><MicOff size={18} strokeWidth={2} aria-hidden="true" />Listening…</>
                  : <><Mic size={18} strokeWidth={2} aria-hidden="true" />Say a hand</>}
              </button>
            )}
          </div>
        </section>
      </div>
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════════════════
// SESSIONS + BOOKMARKS SHEET
// The old sidebar rendered "No recent sessions." while the fetch was still in
// flight — a false empty state on every open. isLoading is now honoured.
// ═══════════════════════════════════════════════════════════════
function SessionsSheet({ isOpen, onClose, onLoad, leaderboardEntries, onLeakStats }) {
  const { sessions, isLoading: sessionsLoading, refetch: refetchSessions } = useRecentSessions(15);
  const { bookmarks, isLoading: bookmarksLoading, refetch: refetchBookmarks } = useBookmarks(15);
  const [tab, setTab] = useState('sessions');

  const list = tab === 'sessions' ? (sessions || []) : (bookmarks || []);
  const loading = tab === 'sessions' ? sessionsLoading : bookmarksLoading;
  const refetch = tab === 'sessions' ? refetchSessions : refetchBookmarks;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="History" subtitle="Sessions and saved spots" labelledBy="pa-history-title">
      <div style={{ display: 'flex', gap: S.sm, marginBottom: S.lg }} role="tablist" aria-label="History type">
        {[['sessions', 'Sessions'], ['bookmarks', 'Bookmarks']].map(([id, label]) => (
          <button
            key={id} type="button" className="pa-btn" role="tab" aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={{ ...btn(tab === id ? 'primary' : 'secondary'), flex: 1, minWidth: 0 }}
          >{label}</button>
        ))}
      </div>

      {loading ? (
        <SkeletonRows rows={3} height={60} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Layers size={24} strokeWidth={2} aria-hidden="true" />}
          title={tab === 'sessions' ? 'No sessions yet' : 'No bookmarks yet'}
          body={tab === 'sessions'
            ? 'Analyze a hand and it is stored here so you can pick the study session back up.'
            : 'Tap Save in the menu on any spot you want to come back to.'}
          action={(
            <button type="button" className="pa-btn" onClick={() => refetch?.()} style={btn('secondary')}>
              <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />Refresh
            </button>
          )}
        />
      ) : (
        list.map((s, i) => (
          <button
            key={s.id || i} type="button" className="pa-btn"
            onClick={() => { onLoad(s); onClose(); }}
            style={{
              width: '100%', padding: S.md, marginBottom: S.sm, borderRadius: R.sm,
              textAlign: 'left', background: T.surface2, border: `1px solid ${T.borderHi}`,
              color: T.text, cursor: 'pointer', minHeight: 60, display: 'flex',
              alignItems: 'center', gap: S.md, touchAction: 'manipulation',
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: F.bodySm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title || 'Saved spot'}
              </span>
              <span style={{ display: 'block', color: T.textMuted, fontSize: F.caption, marginTop: 2 }}>
                {s.type === 'bookmark' ? `Saved · ${s.stack}` : `${s.stack} · ${s.result || '—'}`}
              </span>
            </span>
            <ChevronRight size={18} strokeWidth={2} style={{ color: T.textDim, flexShrink: 0 }} aria-hidden="true" />
          </button>
        ))
      )}

      {onLeakStats && (
        <button
          type="button" className="pa-btn" onClick={() => { onLeakStats(); onClose(); }}
          style={{ ...btn('secondary', { block: true }), color: T.purple, marginTop: S.md }}
        >
          <Trophy size={18} strokeWidth={2} aria-hidden="true" />Study analytics
        </button>
      )}

      <div style={{ marginTop: S.lg }}>
        <LeaderboardCard entries={leaderboardEntries || []} />
      </div>
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATES SHEET — two-tap delete, real API error surfacing
// ═══════════════════════════════════════════════════════════════
function TemplatesSheet({ isOpen, onClose, templates, status, error, onReload, onSave, onLoad, onDelete }) {
  const [name, setName] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  useEffect(() => { if (!isOpen) { setConfirmId(null); setName(''); } }, [isOpen]);

  const armDelete = (id) => {
    if (confirmId === id) {
      setConfirmId(null);
      if (timerRef.current) clearTimeout(timerRef.current);
      onDelete(id);
      return;
    }
    setConfirmId(id);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { timerRef.current = null; setConfirmId(null); }, 3000);
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="My templates" subtitle="Reusable scenarios" labelledBy="pa-templates-title">
      <div style={{ display: 'flex', gap: S.sm, marginBottom: S.lg, flexWrap: 'wrap' }}>
        <input
          type="text" value={name} placeholder="Template name (optional)"
          aria-label="Template name"
          onChange={e => setName(e.target.value)}
          style={{ ...FIELD_CONTROL, flex: '1 1 160px', textTransform: 'none' }}
        />
        <button
          type="button" className="pa-btn" disabled={saving}
          onClick={async () => { setSaving(true); await onSave(name); setSaving(false); setName(''); }}
          style={{ ...btn('primary', { disabled: saving }), flex: '0 0 auto' }}
        >
          {saving ? <Loader2 size={18} strokeWidth={2} className="pa-spin" aria-hidden="true" /> : null}
          {saving ? 'Saving' : 'Save current'}
        </button>
      </div>

      {status === 'loading' ? (
        <SkeletonRows rows={3} height={56} />
      ) : status === 'error' ? (
        <ErrorState title="Could not load templates" body={error || 'The request failed.'} onRetry={onReload} />
      ) : status === 'signed-out' ? (
        <EmptyState
          icon={<BookOpen size={24} strokeWidth={2} aria-hidden="true" />}
          title="Sign in to save templates"
          body="Templates are tied to your account so they follow you across devices."
          action={<a className="pa-btn" href="/auth" style={{ ...btn('primary'), textDecoration: 'none' }}>Sign in</a>}
        />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={24} strokeWidth={2} aria-hidden="true" />}
          title="No templates yet"
          body="Save the scenario you are on and it becomes a one-tap starting point."
        />
      ) : (
        templates.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: S.sm, padding: S.md, marginBottom: S.sm,
            borderRadius: R.sm, background: T.surface2, border: `1px solid ${T.borderHi}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: F.bodySm, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
              <div style={{ fontSize: F.caption, color: T.textDim }}>
                {t.created_at ? new Date(t.created_at).toLocaleDateString() : ''}
              </div>
            </div>
            <button type="button" className="pa-btn" onClick={() => onLoad(t)} style={{ ...btn('secondary'), padding: '0 14px', fontSize: F.caption }}>
              Load
            </button>
            <button
              type="button" className="pa-btn" onClick={() => armDelete(t.id)}
              aria-label={confirmId === t.id ? `Confirm delete ${t.name}` : `Delete ${t.name}`}
              style={{ ...btn('danger'), padding: '0 12px', fontSize: F.caption, minWidth: 44 }}
            >
              {confirmId === t.id ? 'Sure?' : <Trash2 size={18} strokeWidth={2} aria-hidden="true" />}
            </button>
          </div>
        ))
      )}
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUDY ANALYTICS SHEET — explicit loading / error / signed-out / empty
// (the old modal showed "Loading stats..." forever on any failure)
// ═══════════════════════════════════════════════════════════════
function AnalyticsSheet({ isOpen, onClose, status, stats, error, onRetry }) {
  const positions = stats?.positionDistribution || {};
  const maxCount = Math.max(1, ...Object.values(positions).map(n => Number(n) || 0));

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Study analytics" subtitle="Where your reps are going" labelledBy="pa-analytics-title">
      {status === 'loading' && <SkeletonRows rows={4} height={56} />}

      {status === 'error' && (
        <ErrorState title="Could not load your stats" body={error || 'The request failed.'} onRetry={onRetry} />
      )}

      {status === 'signed-out' && (
        <EmptyState
          icon={<Trophy size={24} strokeWidth={2} aria-hidden="true" />}
          title="Sign in to track your study stats"
          body="Accuracy, position distribution and insights are tied to your account."
          action={<a className="pa-btn" href="/auth" style={{ ...btn('primary'), textDecoration: 'none' }}>Sign in</a>}
        />
      )}

      {status === 'ready' && !(Number(stats?.totalAnalyses) > 0) && (
        <EmptyState
          icon={<Target size={24} strokeWidth={2} aria-hidden="true" />}
          title="No hands tracked yet"
          body="Run an analysis and your accuracy by position and street starts building here."
        />
      )}

      {status === 'ready' && Number(stats?.totalAnalyses) > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: S.sm, marginBottom: S.lg }}>
            {[
              { v: stats.totalAnalyses || 0, l: 'Hands', c: T.accent },
              { v: stats.accuracy != null ? `${stats.accuracy}%` : '--', l: 'Accuracy', c: stats.accuracy >= 70 ? T.success : stats.accuracy >= 50 ? T.warn : T.danger },
              { v: stats.mostStudied || '--', l: 'Top seat', c: T.purple },
            ].map(item => (
              <div key={item.l} style={{ textAlign: 'center', padding: S.md, borderRadius: R.sm, background: T.bg }}>
                <div style={{ fontSize: F.h2, fontWeight: 800, color: item.c, ...NUM }}>{item.v}</div>
                <div style={{ fontSize: F.caption, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{item.l}</div>
              </div>
            ))}
          </div>

          {Object.keys(positions).length > 0 && (
            <div style={{ marginBottom: S.lg }}>
              <h4 style={{ ...sectionTitle, marginBottom: S.sm }}>Position distribution</h4>
              {Object.entries(positions).sort((a, b) => b[1] - a[1]).map(([pos, count]) => (
                <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginBottom: 6 }}>
                  <span style={{ fontSize: F.label, fontWeight: 700, color: T.text, width: 38 }}>{pos}</span>
                  <span style={{ flex: 1, height: 10, borderRadius: R.sm, background: T.surface2, overflow: 'hidden' }}>
                    <span style={{
                      display: 'block', width: `${(Number(count) / maxCount) * 100}%`, height: '100%',
                      borderRadius: R.sm, background: `linear-gradient(90deg, ${T.accentPress}, ${T.accent})`,
                    }} />
                  </span>
                  <span style={{ fontSize: F.caption, color: T.textMuted, width: 26, textAlign: 'right', ...NUM }}>{count}</span>
                </div>
              ))}
            </div>
          )}

          {stats.insights?.length > 0 && (
            <div style={{ ...cardCompact, background: T.purpleSoft, border: `1px solid rgba(167,139,250,0.25)` }}>
              {stats.insights.map((insight, i) => (
                <p key={i} style={{ fontSize: F.bodySm, color: T.purple, margin: i > 0 ? `${S.sm}px 0 0` : 0, lineHeight: 1.45 }}>{insight}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════════════════
// DUE REVIEW SHEET — the spaced-repetition queue built from missed spots
// ═══════════════════════════════════════════════════════════════
function DueSheet({ isOpen, onClose, due, onReview, onDismiss }) {
  return (
    <BottomSheet
      isOpen={isOpen} onClose={onClose}
      title="Due for review"
      subtitle={`${due.length} spot${due.length === 1 ? '' : 's'} you have missed`}
      labelledBy="pa-due-title"
    >
      {due.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={24} strokeWidth={2} aria-hidden="true" />}
          title="Nothing due right now"
          body="Miss a coach question and the spot comes back here on a spaced schedule until you get it right."
        />
      ) : due.map(item => (
        <div key={item.key} style={{
          display: 'flex', alignItems: 'center', gap: S.md, padding: S.md, marginBottom: S.sm,
          borderRadius: R.sm, background: T.surface2, border: `1px solid ${T.borderHi}`,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: F.bodySm, fontWeight: 700, color: T.text }}>
              {item.hand} — {item.position}
            </div>
            <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: 2 }}>
              {item.street} · {item.board || 'Preflop'} · GTO {item.gtoAction || '—'}
            </div>
          </div>
          <button type="button" className="pa-btn" onClick={() => onReview(item)} style={{ ...btn('primary'), padding: '0 14px', fontSize: F.caption }}>
            Review
          </button>
          <button
            type="button" className="pa-btn" onClick={() => onDismiss(item)}
            aria-label={`Remove ${item.hand} from the review queue`}
            style={iconBtn({ color: T.textMuted })}
          >
            <XIcon size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ))}
    </BottomSheet>
  );
}

// Memoized heavy children — the felt and the action builder must not re-render
// on every keystroke elsewhere on the page.
const MemoSandboxPokerTable = memo(SandboxPokerTable);
const MemoActionHistoryBuilder = memo(ActionHistoryBuilder);

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function VirtualSandbox() {
  const router = useRouter();
  const reduceMotion = usePrefersReducedMotion();
  const { analyze, isAnalyzing, results, error, clearResults } = useSandboxAnalysis();
  useArchetypes();
  const { guardAction, UpgradePopup } = useFeatureGate('personal_assistant');
  const { studySessions } = useStudyDeck(20);
  const { entries: leaderboardEntries } = useQuizLeaderboard(10);
  const [studyIndex, setStudyIndex] = useState(0);

  // ━━━ SCENARIO STATE ━━━
  const [heroHand, setHeroHand] = useState({ card1: null, card2: null });
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [heroStack, setHeroStack] = useState(100);
  const [gameType, setGameType] = useState('cash');
  const [villains, setVillains] = useState(DEFAULT_VILLAINS);
  const [board, setBoard] = useState({ flop: [], turn: null, river: null });
  const [actionHistory, setActionHistory] = useState([]);
  // The pot is DERIVED from (base + action line) by the legal-action engine, so
  // the old skipPotCalcRef race and the "call with no bet adds 50% of the pot"
  // bug are both structurally impossible now.
  const [potBase, setPotBase] = useState(1.5);
  const [resultsOverride, setResultsOverride] = useState(null);
  const primaryResultsRef = useRef(null);

  // ━━━ UI STATE ━━━
  const [deckTarget, setDeckTarget] = useState(null);
  const [showDeck, setShowDeck] = useState(false);
  const [heroPickStep, setHeroPickStep] = useState(0);
  const [showSetup, setShowSetup] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [selectedHeatmapAction, setSelectedHeatmapAction] = useState(null);
  const [comparePosition, setComparePosition] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [resultsTab, setResultsTab] = useState(() => safeLocal.get('sandbox-results-tab', 'verdict'));
  const [showRangeChart, setShowRangeChart] = useState(false);
  const [showRunouts, setShowRunouts] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const resetTimerRef = useRef(null);

  // ━━━ STREET HISTORY ━━━
  const [streetHistory, setStreetHistory] = useState([]);
  const [activeStreet, setActiveStreet] = useState(0);

  const liveStateRef = useRef(null);
  const streetHistoryRef = useRef([]);
  useEffect(() => {
    liveStateRef.current = { heroHand, heroPosition, heroStack, board, actionHistory, villains, potBase };
    streetHistoryRef.current = streetHistory;
  });

  const undoStackRef = useRef([]);
  const pushUndo = useCallback(() => {
    const s = liveStateRef.current;
    if (!s) return;
    undoStackRef.current.push({
      heroHand: { ...s.heroHand }, heroPosition: s.heroPosition, heroStack: s.heroStack,
      board: { ...s.board, flop: [...(s.board?.flop || [])] },
      actionHistory: [...(s.actionHistory || [])],
      villains: (s.villains || []).map(v => ({ ...v })),
      potBase: s.potBase,
    });
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
  }, []);

  const popUndo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) { toast('Nothing to undo'); return; }
    setHeroHand(prev.heroHand);
    setHeroPosition(prev.heroPosition);
    setHeroStack(prev.heroStack);
    setBoard(prev.board);
    setActionHistory(prev.actionHistory);
    setVillains(prev.villains);
    setPotBase(prev.potBase ?? 1.5);
    try { navigator.vibrate?.(12); } catch (e) { /* unsupported */ }
  }, []);

  const currentStreet = useMemo(() => streetOfBoard(board), [board]);

  const communityCards = useMemo(() => boardToArray(board), [board]);

  const allUsedCards = useMemo(() => {
    const c = [];
    if (heroHand.card1) c.push(heroHand.card1);
    if (heroHand.card2) c.push(heroHand.card2);
    c.push(...communityCards);
    return c;
  }, [heroHand, communityCards]);

  const boardTexture = useMemo(() => classifyBoardTexture(board), [board]);
  const heroCardsMemo = useMemo(() => [heroHand.card1, heroHand.card2].filter(Boolean), [heroHand.card1, heroHand.card2]);
  const handStrength = useMemo(() => getHandStrength(heroHand), [heroHand]);

  // ── Legal-action engine: pot, stacks, SPR, pot odds, MDF, terminal state ──
  const handState = useMemo(() => computeHandState({
    basePot: Number(potBase) || 1.5,
    actions: actionHistory,
    heroPosition,
    heroStack: Number(heroStack) || 100,
    villainStack: Number(villains[0]?.stack) || 100,
    street: currentStreet,
  }), [potBase, actionHistory, heroPosition, heroStack, villains, currentStreet]);

  const potSize = handState.pot;
  const handOver = !!handState.terminal;

  // Seat badges show what is actually BEHIND, not the starting stack.
  const tableVillains = useMemo(() => villains.map((v, i) => (
    i === 0 ? { ...v, stack: Math.round(handState.remaining.villain) } : v
  )), [villains, handState.remaining.villain]);

  const villainRangeStr = useMemo(() => (
    villains[0]?.range || getArchetypeRangeString(villains[0]?.archetype?.id || 'gto_neutral', villains[0]?.position || 'BB')
  ), [villains]);

  // MULTIWAY equity input. With one opponent this IS villainRangeStr (the
  // heads-up path stays byte-identical); with 2+ it becomes the
  // { villains: [...] } shape EquityEngine dispatches on, one archetype/custom
  // range per seat. Single-villain consumers (analyze, range explorer,
  // heatmap) intentionally keep reading villainRangeStr — the solver models
  // the primary opponent; equity and runouts model the whole table.
  const equityRangeInput = useMemo(() => {
    if (villains.length <= 1) return villainRangeStr;
    return {
      villains: villains.map(v => v?.range
        || getArchetypeRangeString(v?.archetype?.id || 'gto_neutral', v?.position || 'BB')),
    };
  }, [villains, villainRangeStr]);

  // ━━━ EQUITY — range-aware and progressive ━━━
  // A fast 250-sim pass paints a number immediately (cheap enough to stay on
  // the main thread); the 2000-sim refinement goes to a Web Worker so a
  // mid-range phone never blocks on it. No worker available (SSR, CSP, ancient
  // webview) => the old requestIdleCallback path, unchanged.
// __PUBLISH_PLACEHOLDER_B__
    const cards = String(entry.board || '').split(' ').filter(Boolean);
    restoreScenario({
// __PUBLISH_PLACEHOLDER_C__
