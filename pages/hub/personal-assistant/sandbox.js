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

  // ━━━ EQUITY — range-aware and progressive ━━━
  // A fast 250-sim pass paints a number immediately (cheap enough to stay on
  // the main thread); the 2000-sim refinement goes to a Web Worker so a
  // mid-range phone never blocks on it. No worker available (SSR, CSP, ancient
  // webview) => the old requestIdleCallback path, unchanged.
  const [equity, setEquity] = useState(null);
  const [equityVsRange, setEquityVsRange] = useState(true);

  useEffect(() => {
    if (!heroHand.card1 || !heroHand.card2) { setEquity(null); return undefined; }
    const heroCards = [heroHand.card1, heroHand.card2];
    const boardCards = boardToArray(board);
    const range = equityVsRange ? villainRangeStr : null;

    let cancelled = false;
    let idleId = null;
    const abort = makeEquityAbort();
    const idle = (cb) => {
      if (typeof window !== 'undefined' && window.requestIdleCallback) return window.requestIdleCallback(cb, { timeout: 900 });
      return setTimeout(cb, 80);
    };
    const cancelIdle = (id) => {
      if (id == null) return;
      if (typeof window !== 'undefined' && window.cancelIdleCallback) window.cancelIdleCallback(id);
      else clearTimeout(id);
    };

    const t = setTimeout(() => {
      try {
        const fast = calculateEquity(heroCards, boardCards, 250, range);
        if (!cancelled) setEquity({ ...fast, refining: true });
      } catch (e) { if (!cancelled) setEquity(null); }

      if (isEquityWorkerAvailable()) {
        // Off-thread: no reason to wait for an idle slice, it never touches
        // this thread. `cancelled` is the last line of defence against a slow
        // reply from a previous hand overwriting the current one.
        calculateEquityAsync(heroCards, boardCards, 2000, range, { signal: abort.signal })
          .then((full) => {
            if (!cancelled && full) setEquity({ ...full, refining: false });
          })
          .catch(() => { /* keep the fast estimate */ });
        return;
      }

      idleId = idle(() => {
        try {
          const full = calculateEquity(heroCards, boardCards, 2000, range);
          if (!cancelled) setEquity({ ...full, refining: false });
        } catch (e) { /* keep the fast estimate */ }
      });
    }, 90);

    return () => { cancelled = true; clearTimeout(t); cancelIdle(idleId); abort.abort(); };
  }, [heroHand.card1, heroHand.card2, board, equityVsRange, villainRangeStr]);

  const equityLabel = useMemo(() => (
    equityVsRange ? `vs ${villains[0]?.archetype?.name || 'villain'} range` : 'vs random hand'
  ), [equityVsRange, villains]);

  // ━━━ RUNOUTS ━━━
  const [runoutData, setRunoutData] = useState(null);
  useEffect(() => {
    if (!heroHand.card1 || !heroHand.card2 || board.flop.length < 3 || board.river) {
      setRunoutData(null); return undefined;
    }
    const heroCards = [heroHand.card1, heroHand.card2];
    const boardCards = [...board.flop];
    if (board.turn) boardCards.push(board.turn);
    const range = equityVsRange ? villainRangeStr : null;

    // ~46 candidate cards x 200 sims each — by far the heaviest thing on this
    // page. Straight to the worker; the synchronous call is the fallback.
    let cancelled = false;
    const abort = makeEquityAbort();
    const t = setTimeout(() => {
      if (isEquityWorkerAvailable()) {
        simulateRunoutsAsync(heroCards, boardCards, 200, range, { signal: abort.signal })
          .then((data) => {
            if (!cancelled) setRunoutData(data || null);
          })
          .catch(() => { if (!cancelled) setRunoutData(null); });
        return;
      }
      try { setRunoutData(simulateRunouts(heroCards, boardCards, 200, range)); }
      catch (e) { setRunoutData(null); }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); abort.abort(); };
  }, [heroHand.card1, heroHand.card2, board, equityVsRange, villainRangeStr]);

  // The worker is shared across both effects, so it is torn down once, on
  // unmount — never per input change (that is what abort() above is for).
  useEffect(() => () => terminateEquityWorker(), []);

  // ━━━ PREFLOP CHARTS ━━━
  const [preflopScenario, setPreflopScenario] = useState('rfi');
  const rangeGrid = useMemo(() => (currentStreet === 'preflop' ? getRangeGrid(heroPosition, preflopScenario) : null), [heroPosition, preflopScenario, currentStreet]);
  const rangePercent = useMemo(() => (currentStreet === 'preflop' ? getRangePercentage(heroPosition, preflopScenario) : 0), [heroPosition, preflopScenario, currentStreet]);

  // ━━━ EXPLOIT / ICM ━━━
  const [exploitMode, setExploitMode] = useState('gto');
  const [bubbleFactor, setBubbleFactor] = useState(1.0);
  const exploitTip = useMemo(() => {
    if (exploitMode !== 'exploit' || !villains[0]) return null;
    const tips = {
      calling_station: 'Bet thinner for value, skip bluffs',
      nit: 'Steal more pots, respect raises',
      lag: 'Tighten up, let them hang themselves',
      tag: 'Stay balanced, mix your frequencies',
      maniac: 'Widen value range, reduce bluff frequency',
      fish: 'Bet bigger with strong hands, simplify decisions',
      gto_neutral: 'No exploit adjustment needed',
    };
    return tips[villains[0].archetype?.id || 'gto_neutral'] || 'Adjust based on villain tendencies';
  }, [exploitMode, villains]);

  // ━━━ SOUNDS / FEATURE MODALS ━━━
  const { soundEnabled, toggleSound, playCardDeal, playChipClick, playAnalysisDing } = useSandboxSounds();
  const [showHHImport, setShowHHImport] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesStatus, setTemplatesStatus] = useState('idle');
  const [templatesError, setTemplatesError] = useState(null);
  const [showRangeGrid, setShowRangeGrid] = useState(false);
  // Hydration-safe (React #418): constant initial value, hydrate after mount.
  // tableFelt drives a rendered inline `filter` style, so a storage read in the
  // useState initializer would make the SSR HTML and first client render disagree.
  const [tableFelt, setTableFelt] = useState('default');
  useEffect(() => {
    const saved = safeLocal.get('sandbox-felt', null);
    if (saved) setTableFelt(saved);
  }, []);
  const [leakStats, setLeakStats] = useState(null);
  const [leakStatsStatus, setLeakStatsStatus] = useState('loading');
  const [leakStatsError, setLeakStatsError] = useState(null);
  const [showLeakStats, setShowLeakStats] = useState(false);
  const [sessionLog, setSessionLog] = useState([]);
  // Marker for "hands played in THIS sitting". Every locally-created entry now
  // carries `createdAt` (and the server returns one too), so the absence of
  // `createdAt` is NOT a usable signal — entries are stamped explicitly.
  const sessionStartedAtRef = useRef(Date.now());
  const [showSessionLog, setShowSessionLog] = useState(false);
  const [showRangeExplorer, setShowRangeExplorer] = useState(false);
  const [showQuickDrill, setShowQuickDrill] = useState(false);
  const [showSessionReport, setShowSessionReport] = useState(false);
  const [showVillainPresets, setShowVillainPresets] = useState(false);
  const [showHandReplay, setShowHandReplay] = useState(false);
  const [showStudyFolders, setShowStudyFolders] = useState(false);
  const [showSaveHand, setShowSaveHand] = useState(false);
  const [showShareScenario, setShowShareScenario] = useState(false);
  const [showCustomDrill, setShowCustomDrill] = useState(false);
  const [showGodMode, setShowGodMode] = useState(false);
  const [drillParams, setDrillParams] = useState(null);
  const [recentResults, setRecentResults] = useState([]);
  const [showSolverImport, setShowSolverImport] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showNodeLocks, setShowNodeLocks] = useState(false);
  // Before/after hero EV around a node-lock change, so the exploit panel can
  // show what the lock actually bought. `after` fills in on the next analysis.
  const [lockEvPreview, setLockEvPreview] = useState(null);
  const [showShareHand, setShowShareHand] = useState(false);
  const [showVillainRange, setShowVillainRange] = useState(false);
  const [showShortcutLegend, setShowShortcutLegend] = useState(false);
  const [showDue, setShowDue] = useState(false);
  const [practiceFocus, setPracticeFocus] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [ttsOverlay, setTtsOverlay] = useState(null);
  const exportCardRef = useRef(null);

  // ━━━ QUIZ / COACH ━━━
  const [quizMode, setQuizMode] = useState(false);
  const [userGuess, setUserGuess] = useState(null);
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0, streak: 0 });
  const [weeklySpot, setWeeklySpot] = useState(null);
  const [activeSpot, setActiveSpot] = useState(null); // the curated spot being quizzed
  // Hydration-safe (React #418): coachMode changes rendered button copy, so the
  // stored value is applied in an effect rather than the useState initializer.
  const [coachMode, setCoachMode] = useState(false);
  useEffect(() => {
    if (safeLocal.get('sandbox-coach-mode', null) === 'true') setCoachMode(true);
  }, []);
  const [showCoachPicker, setShowCoachPicker] = useState(false);
  const [coachUserPick, setCoachUserPick] = useState(null);
  const [coachEvDelta, setCoachEvDelta] = useState(null);
  const [coachEvEstimated, setCoachEvEstimated] = useState(false);
  const [coachStreak, setCoachStreak] = useState(0);
  const [pendingBoard, setPendingBoard] = useState(null);
  const coachStreakRef = useRef(0);
  const coachUserPickRef = useRef(null);
  const suppressCoachEffectRef = useRef(false);
  useEffect(() => { coachUserPickRef.current = coachUserPick; }, [coachUserPick]);

  // ━━━ SPACED REPETITION ━━━
  const [srs, setSrs] = useState([]);
  useEffect(() => { setSrs(srsLoad()); }, []);
  const dueItems = useMemo(() => srsDue(srs), [srs]);
  const scheduleReview = useCallback((item, correct) => {
    setSrs(prev => {
      const next = srsUpsert(prev, item, correct);
      srsSave(next);
      return next;
    });
  }, []);

  // ━━━ REPLAY ━━━
  const [replayIndex, setReplayIndex] = useState(null);
  const replayState = useMemo(() => {
    if (replayIndex == null) return null;
    const slice = actionHistory.slice(0, replayIndex + 1);
    const st = computeHandState({
      basePot: Number(potBase) || 1.5, actions: slice, heroPosition,
      heroStack: Number(heroStack) || 100, villainStack: Number(villains[0]?.stack) || 100,
      street: currentStreet,
    });
    // Trim any card dealt after the replayed action's street
    const order = ['preflop', 'flop', 'turn', 'river'];
    const target = order.indexOf(String(slice[slice.length - 1]?.street || currentStreet));
    const b = { flop: [...board.flop], turn: board.turn, river: board.river };
    if (target >= 0 && target < 3) b.river = null;
    if (target >= 0 && target < 2) b.turn = null;
    if (target === 0) b.flop = [];
    return { handState: st, board: b, cards: boardToArray(b) };
  }, [replayIndex, actionHistory, potBase, heroPosition, heroStack, villains, currentStreet, board]);

  const onReplayTo = useCallback((i) => {
    try { navigator.vibrate?.(i === null ? 20 : 10); } catch (e) { /* unsupported */ }
    setReplayIndex(i);
  }, []);

  // ━━━ VOICE ━━━
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const speechRef = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setVoiceSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);
  useEffect(() => () => { try { speechRef.current?.abort?.(); } catch (e) { /* noop */ } }, []);

  const parseVoiceCommand = useCallback((text) => {
    const rankWords = { ace: 'A', king: 'K', queen: 'Q', jack: 'J', ten: 'T', nine: '9', eight: '8', seven: '7', six: '6', five: '5', four: '4', three: '3', two: '2', deuce: '2' };
    const suitWords = { spade: 's', spades: 's', heart: 'h', hearts: 'h', diamond: 'd', diamonds: 'd', club: 'c', clubs: 'c' };
    const posWords = { 'under the gun': 'UTG', utg: 'UTG', middle: 'MP', cutoff: 'CO', 'cut off': 'CO', button: 'BTN', 'small blind': 'SB', 'big blind': 'BB' };
    const words = text.split(/\s+/);
    const cards = [];
    let suit = null;
    words.forEach(w => {
      if (rankWords[w]) cards.push(rankWords[w]);
      if (suitWords[w]) suit = suitWords[w];
    });
    if (cards.length >= 2) {
      const s1 = suit || 's';
      const s2 = suit ? (suit === 's' ? 'h' : 's') : 'h';
      pushUndo();
      setHeroHand({ card1: `${cards[0]}${s1}`, card2: `${cards[1]}${text.includes('suited') ? s1 : s2}` });
      toast.success('Hand set from voice');
    }
    Object.entries(posWords).some(([key, val]) => {
      if (text.includes(key)) { setHeroPosition(val); return true; }
      return false;
    });
    const stackMatch = text.match(/(\d+)\s*(bb|big blind)/i);
    if (stackMatch) setHeroStack(parseInt(stackMatch[1], 10));
    if (/tournament|mtt/.test(text)) setGameType('tournament');
    else if (text.includes('cash')) setGameType('cash');
  }, [pushUndo]);

  const startVoiceInput = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Voice input is not supported in this browser'); return; }
    try { navigator.vibrate?.(10); } catch (e) { /* unsupported */ }
    try {
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        parseVoiceCommand(String(event.results[0][0].transcript || '').toLowerCase());
        setIsListening(false);
      };
      recognition.onerror = () => { setIsListening(false); toast.error('Could not hear that'); };
      recognition.onend = () => setIsListening(false);
      recognition.start();
      setIsListening(true);
      speechRef.current = recognition;
    } catch (e) {
      setIsListening(false);
      toast.error('Voice input failed to start');
    }
  }, [parseVoiceCommand]);

  // ═══════════════════════════════════════════════════════════
  // SCENARIO RESTORE — one code path for share links, templates, sessions,
  // saved folders, imports and the weekly spot.
  // ═══════════════════════════════════════════════════════════
  const restoreScenario = useCallback((s) => {
    if (!s) return;
    pushUndo();
    if (s.heroHand) setHeroHand({ card1: s.heroHand.card1 || null, card2: s.heroHand.card2 || null });
    if (s.heroPosition && POSITIONS.includes(s.heroPosition)) setHeroPosition(s.heroPosition);
    if (s.heroStack != null || s.effStack != null) setHeroStack(Number(s.heroStack ?? s.effStack) || 100);
    if (s.gameType) setGameType(s.gameType);
    if (s.board) {
      setBoard(Array.isArray(s.board)
        ? { flop: s.board.slice(0, 3), turn: s.board[3] || null, river: s.board[4] || null }
        : { flop: [...(s.board.flop || [])], turn: s.board.turn || null, river: s.board.river || null });
    }
    if (Array.isArray(s.villains) && s.villains.length) {
      setVillains(withVillainIds(s.villains.map(v => ({ ...v, stack: Number(v.stack) || 100 }))));
    }
    const actions = Array.isArray(s.actionHistory) ? s.actionHistory : [];
    setActionHistory(actions);
    // A stored pot ALREADY contains the stored action line — replaying the line
    // on top of it would double-count, so the base resets when actions exist.
    setPotBase(actions.length > 0 ? 1.5 : (Number(s.potSize) || 1.5));
    setReplayIndex(null);
    clearResults();
    setResultsOverride(null);
    streetHistoryRef.current = [];
    setStreetHistory([]);
    setActiveStreet(0);
  }, [pushUndo, clearResults]);

  // ═══════════════════════════════════════════════════════════
  // HYDRATION — lz-string payload, legacy query params, leak hand-off
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;

    if (q.leak || q.leakType || q.drill) {
      setPracticeFocus({ leakId: q.leak || null, leakType: q.leakType || null, drill: q.drill || null });
      setCoachMode(true);
      safeLocal.set('sandbox-coach-mode', 'true');
    }

    // 1. Full-fidelity lz-string snapshot (villains + action line survive)
    let restoredRich = false;
    const packed = typeof q.s === 'string' && !/^\d+(\.\d+)?$/.test(q.s) ? q.s : null;
    if (packed) {
      try {
        const json = LZString.decompressFromEncodedURIComponent(packed);
        const state = json ? JSON.parse(json) : null;
        if (state && typeof state === 'object') { restoreScenario(state); restoredRich = true; }
      } catch (e) { console.warn('[Sandbox] share payload could not be read:', e?.message || e); }
    }

    // 2. Legacy query params
    if (!restoredRich && (q.h || q.p || q.b)) {
      const hand = String(q.h || '');
      if (hand.length >= 4) setHeroHand({ card1: hand.substring(0, 2), card2: hand.substring(2, 4) });
      if (q.p && POSITIONS.includes(q.p)) setHeroPosition(q.p);
      const stackParam = q.s_bb ?? (/^\d+(\.\d+)?$/.test(String(q.s || '')) ? q.s : null);
      if (stackParam != null) setHeroStack(Number(stackParam) || 100);
      if (q.g) setGameType(q.g);
      if (q.pot != null) setPotBase(Number(q.pot) || 1.5);
      if (q.b) {
        const cards = String(q.b).includes(',') ? String(q.b).split(',').filter(Boolean) : (String(q.b).match(/.{1,2}/g) || []);
        setBoard({ flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null });
      }
      if (q.partial === '1') toast('Partial scenario restored — opponents and betting line were not in the link', { duration: 4000 });
    }

    if (typeof window !== 'undefined' && (q.h || q.b || q.s || q.leak || q.leakType || q.drill)) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Shared-scenario hydration via sessionStorage (the /sandbox/<id> hand-off)
  useEffect(() => {
    if (typeof window === 'undefined' || router.query.loadShared !== 'true') return;
    try {
      const payload = sessionStorage.getItem('shared-sandbox-state');
      if (payload) {
        restoreScenario(JSON.parse(payload));
        sessionStorage.removeItem('shared-sandbox-state');
        toast.success('Shared scenario loaded');
      }
    } catch (err) {
      console.warn('Failed to parse shared state payload', err);
      toast.error('That shared scenario could not be read');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.loadShared]);

  // ═══════════════════════════════════════════════════════════
  // WEEKLY SPOT
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    let cancelled = false;
    fetch('/api/assistant/sandbox/weekly-spot')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data?.spot) setWeeklySpot(data.spot); })
      .catch(e => console.warn('[Sandbox] weekly spot unavailable:', e?.message || e));
    return () => { cancelled = true; };
  }, []);

  const loadWeeklySpot = useCallback((spot) => {
    if (!spot?.scenario_json) return;
    restoreScenario(spot.scenario_json);
    setActiveSpot(spot);
    setQuizMode(true);
    setQuizRevealed(false);
    setUserGuess(null);
    toast('Weekly spot loaded — tap Analyze to start the quiz');
  }, [restoreScenario]);

  // ═══════════════════════════════════════════════════════════
  // SESSION LOG — persisted locally on EVERY change (the old code only wrote
  // after a successful server fetch, so offline journals were lost on reload)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const t = setTimeout(() => {
      try { Promise.resolve(idbSaveSessionLog(sessionLog)).catch(() => {}); }
      catch (e) { console.warn('[Sandbox] session log persist failed:', e?.message || e); }
    }, 500);
    return () => clearTimeout(t);
  }, [sessionLog]);

  // `origin` explicitly labels where a row came from. Downstream components
  // (HandReplay, SessionReport) branch on `source`, never on the presence of a
  // timestamp — every row has one.
  const mergeSessions = useCallback((incoming, origin = 'server') => {
    setSessionLog(prev => {
      const ts = (e) => Number(new Date(e?.createdAt || e?.created_at || 0)) || Number(e?.id) || 0;
      const byId = new Map();
      (incoming || []).forEach(s => {
        if (!s) return;
        byId.set(String(s.id), { ...s, source: s.source || origin });
      });
      (prev || []).forEach(p => { if (!byId.has(String(p.id))) byId.set(String(p.id), p); });
      return Array.from(byId.values()).sort((a, b) => ts(a) - ts(b));
    });
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const user = getAuthUser();
      if (!user) {
        const offline = await idbLoadSessionLog();
        if (Array.isArray(offline) && offline.length) mergeSessions(offline, 'local');
        return;
      }
      const token = getAccessToken();
      const res = await fetch('/api/sandbox/sessions', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success && Array.isArray(json.sessions)) mergeSessions(json.sessions, 'server');
    } catch (err) {
      console.warn('[Sandbox] session fetch error (falling back to IDB):', err?.message || err);
      try {
        const offline = (await idbLoadSessionLog()) || [];
        if (offline.length) mergeSessions(offline, 'local');
      } catch (idbErr) { console.warn('[Sandbox] IDB fallback error:', idbErr?.message || idbErr); }
    }
  }, [mergeSessions]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // ═══════════════════════════════════════════════════════════
  // TEMPLATES + ANALYTICS (explicit status machines, never a dead spinner)
  // ═══════════════════════════════════════════════════════════
  const loadTemplates = useCallback(async () => {
    setTemplatesError(null);
    try {
      if (!getAuthUser()) { setTemplatesStatus('signed-out'); return; }
      setTemplatesStatus('loading');
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/assistant/sandbox/sandbox-templates', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      const json = await r.json();
      setTemplates(json.templates || []);
      setTemplatesStatus('ready');
    } catch (e) {
      console.warn('[Templates] Load error:', e?.message || e);
      setTemplatesError(e?.message || 'Unknown error');
      setTemplatesStatus('error');
    }
  }, []);

  const saveAsTemplate = useCallback(async (name) => {
    const label = String(name || '').trim()
      || `${heroPosition} ${heroHand.card1 || '?'}${heroHand.card2 || '?'} ${board.flop.length ? `on ${board.flop.join('')}` : 'preflop'}`;
    try {
      if (!getAuthUser()) { toast.error('Sign in to save templates'); return; }
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/assistant/sandbox/sandbox-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          name: label,
          scenario: { heroHand, heroPosition, heroStack, gameType, board, villains, actionHistory, potSize },
        }),
      });
      // The API really does return 409/413 — the old code toasted success blindly.
      if (r.status === 409) { toast.error('Template limit reached (30) — delete one first'); return; }
      if (r.status === 413) { toast.error('Scenario too large to save as a template'); return; }
      if (!r.ok) { toast.error(`Could not save template (${r.status})`); return; }
      toast.success('Template saved');
      loadTemplates();
    } catch (e) {
      console.warn('[Templates] Save error:', e?.message || e);
      toast.error('Could not save template');
    }
  }, [heroHand, heroPosition, heroStack, gameType, board, villains, actionHistory, potSize, loadTemplates]);

  const deleteTemplate = useCallback(async (id) => {
    const prev = templates;
    setTemplates(list => list.filter(t => t.id !== id)); // optimistic
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/assistant/sandbox/sandbox-templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      toast.success('Template deleted');
    } catch (e) {
      console.warn('[Templates] Delete error:', e?.message || e);
      setTemplates(prev); // roll back
      toast.error('Could not delete that template');
    }
  }, [templates]);

  const loadLeakStats = useCallback(async () => {
    setLeakStatsError(null);
    try {
      if (!getAuthUser()) { setLeakStatsStatus('signed-out'); return; }
      setLeakStatsStatus('loading');
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/assistant/sandbox/sandbox-analytics', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      setLeakStats(await r.json());
      setLeakStatsStatus('ready');
    } catch (e) {
      console.warn('[LeakStats] Load error:', e?.message || e);
      setLeakStatsError(e?.message || 'Unknown error');
      setLeakStatsStatus('error');
    }
  }, []);

  const openAnalytics = useCallback(() => { setShowLeakStats(true); setLeakStatsStatus('loading'); loadLeakStats(); }, [loadLeakStats]);

  const logAnalytics = useCallback(async (freshData, pickedAction, streetOverride) => {
    try {
      if (!getAuthUser()) return;
      const optimalLabel = freshData?.optimalAction?.label || null;
      const { data: { session } } = await supabase.auth.getSession();
      fetch('/api/assistant/sandbox/sandbox-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          position: heroPosition,
          street: streetOverride || currentStreet,
          gameType,
          action: optimalLabel,
          isCorrect: pickedAction && optimalLabel ? gradeAction(pickedAction, optimalLabel) : null,
          handStrength: handStrength?.label || null,
        }),
      }).catch(e => console.warn('[Sandbox] analytics post failed:', e?.message || e));
    } catch (e) { console.warn('[Sandbox] analytics error:', e?.message || e); }
  }, [heroPosition, currentStreet, gameType, handStrength]);

  // ═══════════════════════════════════════════════════════════
  // CARD SELECTION / BOARD
  // ═══════════════════════════════════════════════════════════
  const openHeroPicker = useCallback(() => {
    setDeckTarget('hero');
    setHeroPickStep(heroHand.card1 && !heroHand.card2 ? 2 : 1);
    setShowDeck(true);
  }, [heroHand.card1, heroHand.card2]);

  const openBoardPicker = useCallback(() => { setDeckTarget('board'); setShowDeck(true); }, []);

  const handleDeckSelect = useCallback((cardStr) => {
    try { navigator.vibrate?.(10); } catch (e) { /* unsupported */ }
    playCardDeal();
    if (deckTarget === 'hero') {
      if (!heroHand.card1 || heroPickStep === 1) {
        setHeroHand(h => ({ ...h, card1: cardStr }));
        setHeroPickStep(2);
      } else {
        setHeroHand(h => ({ ...h, card2: cardStr }));
        setHeroPickStep(0);
        setShowDeck(false);
        setDeckTarget(null);
      }
      return;
    }
    if (deckTarget !== 'board') return;
    setBoard(prev => {
      if (prev.flop.length < 3) {
        const newFlop = [...prev.flop, cardStr];
        if (newFlop.length >= 3) setTimeout(() => { setShowDeck(false); setDeckTarget(null); }, 150);
        return { ...prev, flop: newFlop };
      }
      if (!prev.turn) { setShowDeck(false); setDeckTarget(null); return { ...prev, turn: cardStr }; }
      if (!prev.river) { setShowDeck(false); setDeckTarget(null); return { ...prev, river: cardStr }; }
      return prev;
    });
  }, [deckTarget, heroHand.card1, heroPickStep, playCardDeal]);

  const freeDeck = useCallback((exclude = []) => {
    const blocked = new Set([...allUsedCards, ...exclude]);
    const deck = [];
    RANKS.forEach(r => SUITS.forEach(s => { const c = `${r}${s.code}`; if (!blocked.has(c)) deck.push(c); }));
    return deck;
  }, [allUsedCards]);

  const randomCard = useCallback(() => {
    const deck = freeDeck();
    if (!deck.length) { toast.error('No cards left in the deck'); return; }
    handleDeckSelect(deck[Math.floor(Math.random() * deck.length)]);
  }, [freeDeck, handleDeckSelect]);

  const randomBoard = useCallback(() => {
    pushUndo();
    const heroOnly = [heroHand.card1, heroHand.card2].filter(Boolean);
    const deck = [];
    RANKS.forEach(r => SUITS.forEach(s => { const c = `${r}${s.code}`; if (!heroOnly.includes(c)) deck.push(c); }));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    setBoard({ flop: deck.slice(0, 3), turn: null, river: null });
    setShowDeck(false);
    setDeckTarget(null);
    playCardDeal();
  }, [heroHand.card1, heroHand.card2, pushUndo, playCardDeal]);

  /** Deals the next street. Returns the NEW board (state updates are async). */
  const dealNextStreet = useCallback(() => {
    const deck = freeDeck();
    if (!deck.length) return null;
    const cardStr = deck[Math.floor(Math.random() * deck.length)];
    let newBoard = null;
    if (board.flop.length === 3 && !board.turn) newBoard = { ...board, turn: cardStr };
    else if (board.turn && !board.river) newBoard = { ...board, river: cardStr };
    if (!newBoard) return null;
    pushUndo();
    setBoard(newBoard);
    playCardDeal();
    toast((t) => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: F.bodySm }}>
        Dealt {cardStr}
        <button
          type="button" className="pa-btn"
          onClick={() => { popUndo(); toast.dismiss(t.id); }}
          style={{ ...btn('secondary'), padding: '0 14px', fontSize: F.label, flexShrink: 0 }}
        >Undo</button>
      </span>
    ), { duration: 3200 });
    return newBoard;
  }, [board, freeDeck, pushUndo, popUndo, playCardDeal]);

  /**
   * Archive the current street's analysis, deal the next card, and let the
   * villain lead/check into the new street.
   * Texture is recomputed from the NEW board — the old code passed the stale
   * pre-deal memo, so the villain modelled the wrong texture every time.
   */
  const dealAndAnalyze = useCallback(() => {
    if (handOver) { toast('The hand is over — start the next one'); return null; }
    if (results || resultsOverride) {
      const archived = {
        street: currentStreet,
        board: { ...board, flop: [...board.flop] },
        results: resultsOverride || results,
        equity: equity?.heroEquity ?? null,
        isCorrect: coachUserPickRef.current
          ? gradeAction(coachUserPickRef.current, (resultsOverride || results)?.optimalAction?.label)
          : null,
      };
      const nextHistory = [...streetHistoryRef.current, archived];
      streetHistoryRef.current = nextHistory;
      setStreetHistory(nextHistory);
      setActiveStreet(nextHistory.length);
    }
    const newBoard = dealNextStreet();
    if (newBoard && villains[0]) {
      const newTexture = classifyBoardTexture(newBoard);
      const lead = simulateVillainAction(villains[0], null, newTexture, streetOfBoard(newBoard));
      if (lead) {
        setActionHistory(prev => [...prev, lead]);
        toast(`${lead.position} ${lead.label}`, { duration: 1800 });
      }
    }
    return newBoard;
  }, [handOver, results, resultsOverride, currentStreet, board, equity, dealNextStreet, villains]);

  // ═══════════════════════════════════════════════════════════
  // ACTION LINE — the villain now answers EVERY hero action (the old code only
  // fired when the builder's position dropdown happened to equal heroPosition)
  // ═══════════════════════════════════════════════════════════
  const addAction = useCallback((a) => {
    if (handOver) return;
    playChipClick();
    const entry = { ...a, street: a?.street || currentStreet };
    const withEntry = [...actionHistory, entry];
    let final = withEntry;

    if (entry.isHero && villains[0]) {
      const after = computeHandState({
        basePot: Number(potBase) || 1.5, actions: withEntry, heroPosition,
        heroStack: Number(heroStack) || 100, villainStack: Number(villains[0]?.stack) || 100,
        street: currentStreet,
      });
      if (!after.terminal && after.toAct === 'villain') {
        const response = simulateVillainAction(villains[0], entry, boardTexture, currentStreet);
        if (response) {
          final = [...withEntry, response];
          playCardDeal();
          try { navigator.vibrate?.(12); } catch (e) { /* unsupported */ }
          toast(`${response.position} ${response.label}`, { duration: 1800 });
        }
      }
    }
    setActionHistory(final);
  }, [handOver, actionHistory, currentStreet, villains, potBase, heroPosition, heroStack, boardTexture, playChipClick, playCardDeal]);

  const removeAction = useCallback((i) => {
    setActionHistory(prev => prev.filter((_, j) => j !== i));
  }, []);

  // ═══════════════════════════════════════════════════════════
  // VILLAIN CONTROLS (multiway)
  // ═══════════════════════════════════════════════════════════
  const patchVillain = useCallback((idx, patch, recomputeRange = false) => {
    setVillains(prev => prev.map((v, i) => {
      if (i !== idx) return v;
      const next = { ...v, ...patch };
      if (recomputeRange) {
        const archId = next.archetype?.id || 'gto_neutral';
        next.range = getArchetypeRangeString(archId, next.position || 'BB');
        next.vpip = getArchetypeVPIP(archId, next.position || 'BB');
        next.customRange = false;
      }
      return next;
    }));
  }, []);

  const handleVillainArchetypeChange = useCallback((idx, archetypeId) => {
    const info = getArchetypeInfo(archetypeId) || {};
    setVillains(prev => prev.map((v, i) => {
      if (i !== idx) return v;
      const pos = v.position || 'BB';
      return {
        ...v,
        archetype: { id: archetypeId, name: info.name || archetypeId },
        range: getArchetypeRangeString(archetypeId, pos),
        vpip: getArchetypeVPIP(archetypeId, pos),
        customRange: false,
      };
    }));
  }, []);

  const addVillain = useCallback(() => {
    setVillains(prev => {
      if (prev.length >= MAX_VILLAINS) return prev;
      const taken = new Set([heroPosition, ...prev.map(v => v.position)]);
      const seat = POSITIONS.find(p => !taken.has(p)) || 'BB';
      const nextId = prev.reduce((m, v) => Math.max(m, Number(v.id) || 0), -1) + 1;
      return [...prev, {
        id: nextId, position: seat,
        archetype: { id: 'gto_neutral', name: 'GTO Neutral' },
        stack: Number(heroStack) || 100,
        range: getArchetypeRangeString('gto_neutral', seat),
        vpip: getArchetypeVPIP('gto_neutral', seat),
      }];
    });
  }, [heroPosition, heroStack]);

  const removeVillain = useCallback((idx) => {
    setVillains(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  const changeFeltColor = useCallback((color) => {
    setTableFelt(color);
    safeLocal.set('sandbox-felt', color);
    saveAppSetting('sandbox_felt', color, 'sandbox-felt');
  }, []);

  const toggleCoachMode = useCallback(() => {
    setCoachMode(prev => {
      const next = !prev;
      safeLocal.set('sandbox-coach-mode', String(next));
      saveAppSetting('sandbox_coach_mode', next, 'sandbox-coach-mode');
      return next;
    });
  }, []);

  // ═══════════════════════════════════════════════════════════
  // ANALYSIS
  // ═══════════════════════════════════════════════════════════
  const sandboxSnapshot = useMemo(() => ({
    board, heroHand, heroPosition,
    heroStack: Number(heroStack) || 100,
    effStack: Number(heroStack) || 100,
    gameType, villains,
    potSize: Number(potSize) || 1.5,
    actionHistory,
  }), [board, heroHand, heroPosition, heroStack, gameType, villains, potSize, actionHistory]);

  const buildAnalyzePayload = useCallback((positionOverride = null, boardOverride = null, resolvedPick = null) => {
    const effBoard = boardOverride || board;
    const effActions = liveStateRef.current?.actionHistory || actionHistory;
    const villainArcId = villains[0]?.archetype?.id || 'gto_neutral';
    const villainPos = villains[0]?.position || 'BB';
    const nodeLock = villains[0]?.nodeLock && villains[0].nodeLock !== 'None' ? villains[0].nodeLock : undefined;
    return {
      heroHand,
      heroPosition: positionOverride || heroPosition,
      heroStack: Number(heroStack) || 100,
      gameType, villains,
      board: effBoard,
      potSize: Number(potSize) || 1.5,
      actionHistory: effActions,
      betSizing: 'standard',
      exploitMode,
      villainArchetype: villainArcId,
      bubbleFactor: gameType === 'tournament' ? bubbleFactor : undefined,
      villainRange: villains[0]?.range || getArchetypeRangeString(villainArcId, villainPos),
      nodeLock,
      socratic: coachMode && resolvedPick ? { userPick: resolvedPick } : undefined,
    };
  }, [board, actionHistory, villains, heroHand, heroPosition, heroStack, gameType, potSize, exploitMode, bubbleFactor, coachMode]);

  const runAnalysis = useCallback(async (skipCoach = false, pickedAction = null, boardOverride = null) => {
    if (!guardAction(() => { })) return;
    if (!heroHand.card1 || !heroHand.card2) { toast('Pick your two hole cards first'); return; }
    if (handOver) { toast('This hand is complete — deal the next one'); return; }

    if (coachMode && !skipCoach && !coachUserPick && !pickedAction) {
      try { navigator.vibrate?.(20); } catch (e) { /* unsupported */ }
      setShowResults(false); // the picker must never open behind the results sheet
      setShowCoachPicker(true);
      return;
    }
    try { navigator.vibrate?.(10); } catch (e) { /* unsupported */ }

    const resolvedPick = pickedAction || coachUserPick;
    const effBoard = boardOverride || pendingBoard || board;
    setPendingBoard(null);
    setResultsOverride(null);

    const data = await analyze(buildAnalyzePayload(null, effBoard, resolvedPick));

    // Offline / server-error fallback — a badged local estimate instead of a
    // red box, so the tool still teaches something with no connection.
    if (!data?.success) {
      const fallback = localSolve({
        heroHand, heroPosition, board: effBoard, handState,
        texture: classifyBoardTexture(effBoard),
        equityPct: equity?.heroEquity, preflopScenario,
      });
      setResultsOverride(fallback);
      toast('Offline estimate — reconnect for solver data', { duration: 3200 });
    }

    setShowResults(true);
    setActiveStreet(streetHistoryRef.current.length);
    playAnalysisDing();

    const snapStreet = streetOfBoard(effBoard);
    if (data?.success) logAnalytics(data, resolvedPick, snapStreet);

    const snapEquity = equity?.heroEquity ?? null;
    const snapHand = `${heroHand.card1}${heroHand.card2}`;
    const snapBoard = boardToArray(effBoard).join(' ');

    setSessionLog(prev => {
      const next = [...prev, {
        id: Date.now(),
        createdAt: new Date().toISOString(),
        // Explicit provenance — SessionReport scopes "this session" on
        // sessionStartedAt and HandReplay labels rows on `source`.
        source: 'live',
        sessionStartedAt: sessionStartedAtRef.current,
        hand: snapHand,
        position: heroPosition,
        street: snapStreet,
        board: snapBoard,
        equity: snapEquity,
        optimalAction: null,
        isCorrect: null,
        evDelta: null,
        userPick: resolvedPick || null,
      }];
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sandbox-session-log-updated', { detail: { count: next.length } }));
        window.dispatchEvent(new CustomEvent('pa-sandbox-updated', { detail: { type: 'analysis' } }));
      }
      return next;
    });

    (async () => {
      try {
        const accessToken = getAccessToken();
        if (accessToken && snapEquity !== null) {
          await fetch('/api/sandbox/equity-snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              heroHand: snapHand,
              villainRange: villainRangeStr || null,
              street: snapStreet,
              equityPct: typeof snapEquity === 'number' ? snapEquity : null,
              boardCards: snapBoard || null,
            }),
          });
        }
      } catch (e) { console.warn('[Sandbox] equity snapshot failed:', e?.message || e); }
    })();
  }, [guardAction, heroHand, handOver, coachMode, coachUserPick, pendingBoard, board, analyze,
    buildAnalyzePayload, handState, equity, preflopScenario, heroPosition, playAnalysisDing,
    logAnalytics, villainRangeStr]);

  // ── Coach verdict: fills the session-log entry, streak, tilt feed and SRS ──
  // Shared by the solver path AND the offline-estimate path so coaching never
  // silently stops working when the network does.
  const gradeAnalysis = useCallback((res) => {
    if (!res?.optimalAction?.label) return;
    const gtoLabel = res.optimalAction.label;
    const currentPick = coachUserPickRef.current;
    const hasPick = !!currentPick;
    const isCorrect = hasPick ? gradeAction(currentPick, gtoLabel) : null;

    // Real per-action EV when the solver exposes one. When it does not, we do
    // NOT invent a number — the UI says the impact is unavailable instead.
    const gtoEV = Number(res.ev?.hero) || 0;
    const picked = hasPick ? (res.actions || []).find(a => gradeAction(a.label || a.id, currentPick)) : null;
    const pickedEV = picked && typeof picked.ev === 'number' ? picked.ev : null;
    let delta = null;
    let estimated = false;
    if (hasPick) {
      if (pickedEV != null && gtoEV !== 0) delta = parseFloat((pickedEV - gtoEV).toFixed(3));
      else estimated = true;
    }

    setSessionLog(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && !last.optimalAction) {
        updated[updated.length - 1] = {
          ...last,
          optimalAction: gtoLabel,
          isCorrect: hasPick ? isCorrect : (last.isCorrect ?? null),
          evDelta: hasPick ? delta : (last.evDelta ?? null),
          evDeltaEstimated: hasPick ? estimated : false,
          userPick: hasPick ? currentPick : (last.userPick ?? null),
        };
      }
      return updated;
    });

    if (!hasPick) return;

    setCoachEvDelta(delta);
    setCoachEvEstimated(estimated);

    if (isCorrect) {
      const newStreak = coachStreakRef.current + 1;
      coachStreakRef.current = newStreak;
      setCoachStreak(newStreak);
      if ([5, 10, 25].includes(newStreak)) {
        try { navigator.vibrate?.([50, 30, 50, 30, 100]); } catch (e) { /* unsupported */ }
        if (!reduceMotion) {
          import('canvas-confetti')
            .then(mod => mod.default?.({ particleCount: 90, spread: 70, origin: { y: 0.7 }, disableForReducedMotion: true }))
            .catch(() => { });
        }
        toast.success(`${newStreak} in a row`);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sandbox-coach-streak-milestone', { detail: { streak: newStreak } }));
        }
      }
    } else {
      coachStreakRef.current = 0;
      setCoachStreak(0);
    }

    const snapBoardFull = boardToArray(board).join(' ');
    const handLabel = `${heroHand?.card1 || ''}${heroHand?.card2 || ''}`;
    setRecentResults(prev => [...prev.slice(-9), {
      isCorrect, evDelta: delta, evDeltaEstimated: estimated, hand: handLabel,
      position: heroPosition, street: currentStreet, userPick: currentPick,
      optimalAction: gtoLabel, board: snapBoardFull,
    }]);

    // Spaced repetition: a miss schedules the exact spot for review.
    scheduleReview({
      key: `${handKeyOf(heroHand) || handLabel}|${heroPosition}|${currentStreet}|${snapBoardFull}`,
      hand: handLabel, position: heroPosition, street: currentStreet,
      board: snapBoardFull, gtoAction: gtoLabel,
      heroHand: { ...heroHand },
    }, !!isCorrect);

    // Offline estimates are never worth a server row.
    if (res.offline) return;
    (async () => {
      try {
        const accessToken = getAccessToken();
        if (!accessToken) return;
        // Exact verdict↔hand link for the archived Hand Replay. This must be the
        // sandbox_sessions row id that /api/assistant/sandbox/analyze created for
        // THIS analysis and nothing else — a stand-in id would make the server
        // attribute this verdict to someone else's hand, which is worse than the
        // "not coached" it replaces. analyze returns it as `sessionId`; it is
        // null for guests, cached responses and failed writes, in which case the
        // key is omitted and the server keeps using its spot+time fallback.
        const claimedSessionId = res?.sessionId;
        const normalizedSessionId = typeof claimedSessionId === 'number' && Number.isSafeInteger(claimedSessionId) && claimedSessionId > 0
          ? String(claimedSessionId)
          : (typeof claimedSessionId === 'string' ? claimedSessionId.trim() : '');
        const sessionId = /^[A-Za-z0-9_-]{1,64}$/.test(normalizedSessionId)
          ? normalizedSessionId
          : null;
        await fetch('/api/sandbox/coach-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            hand: handLabel, position: heroPosition, street: currentStreet, board: snapBoardFull,
            userPick: currentPick, gtoAction: gtoLabel, isCorrect, evDelta: delta,
            evDeltaEstimated: estimated,
            ...(sessionId ? { sessionId } : {}),
          }),
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sandbox-coach-result-saved', { detail: { isCorrect, evDelta: delta } }));
        }
      } catch (e) { console.warn('[Sandbox] coach result post failed:', e?.message || e); }
    })();
  }, [board, heroHand, heroPosition, currentStreet, reduceMotion, scheduleReview]);

  const gradeAnalysisRef = useRef(gradeAnalysis);
  useEffect(() => { gradeAnalysisRef.current = gradeAnalysis; }, [gradeAnalysis]);

  // Solver results. A position comparison must NOT re-grade (it used to
  // double-count the streak and POST a duplicate coach-result row).
  useEffect(() => {
    if (!results) return;
    if (suppressCoachEffectRef.current) { suppressCoachEffectRef.current = false; return; }
    gradeAnalysisRef.current?.(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  // Close the node-lock EV comparison once a fresh solve lands.
  useEffect(() => {
    const evNow = Number(results?.ev?.hero);
    if (!Number.isFinite(evNow)) return;
    setLockEvPreview(prev => (prev && prev.after == null ? { ...prev, after: evNow } : prev));
  }, [results]);

  // Offline-estimate results
  const gradedOverrideRef = useRef(null);
  useEffect(() => {
    if (!resultsOverride?.offline) return;
    if (gradedOverrideRef.current === resultsOverride) return;
    gradedOverrideRef.current = resultsOverride;
    gradeAnalysisRef.current?.(resultsOverride);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsOverride]);
  // Broadcast to other PA pages when a NEW analysis lands
  const busSnapshotRef = useRef({});
  useEffect(() => { busSnapshotRef.current = { heroPosition, heroHand, equity, quizScore }; });
  useEffect(() => {
    if (!results || typeof window === 'undefined') return;
    const snap = busSnapshotRef.current;
    window.dispatchEvent(new CustomEvent('pa-sandbox-updated', {
      detail: {
        heroPosition: snap.heroPosition,
        heroHand: `${snap.heroHand?.card1 || ''}${snap.heroHand?.card2 || ''}`,
        results: true,
        equity: snap.equity?.heroEquity || null,
        quizAccuracy: snap.quizScore?.total > 0 ? Math.round(snap.quizScore.correct / snap.quizScore.total * 100) : null,
      },
    }));
  }, [results]);

  const handleCoachPick = useCallback((action) => {
    setCoachUserPick(action);
    coachUserPickRef.current = action;
    setShowCoachPicker(false);
    runAnalysis(true, action, pendingBoard);
  }, [runAnalysis, pendingBoard]);

  const handleCoachSkip = useCallback(() => {
    setCoachUserPick(null);
    coachUserPickRef.current = null;
    setShowCoachPicker(false);
    runAnalysis(true, null, pendingBoard);
  }, [runAnalysis, pendingBoard]);

  // Deal the next street and ASK FOR A DECISION on it. The old code passed
  // skipCoach=true, so coaching silently stopped after the flop.
  const dealAndCoach = useCallback(() => {
    const newBoard = dealAndAnalyze();
    if (!newBoard) return;
    setCoachUserPick(null);
    coachUserPickRef.current = null;
    setPendingBoard(newBoard);
    setShowResults(false);
    if (coachMode) setShowCoachPicker(true);
    else setTimeout(() => runAnalysis(true, null, newBoard), 200);
  }, [dealAndAnalyze, coachMode, runAnalysis]);

  useEffect(() => {
    setCoachUserPick(null);
    setCoachEvDelta(null);
    setCoachEvEstimated(false);
  }, [heroHand.card1, heroHand.card2, heroPosition, board.flop.length]);

  // ═══════════════════════════════════════════════════════════
  // QUIZ — graded against the curated answer when a weekly spot is loaded
  // ═══════════════════════════════════════════════════════════
  const handleQuizGuess = useCallback((guess) => {
    setUserGuess(guess);
    setQuizRevealed(true);
    const displayed = resultsOverride || results;
    const correctLabel = activeSpot?.correct_action || displayed?.optimalAction?.label || '';
    const isCorrect = correctLabel.length > 0 && gradeAction(guess, correctLabel);
    setQuizScore(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));

    const boardStr = boardToArray(board).join(' ');
    scheduleReview({
      key: `${handKeyOf(heroHand) || 'hand'}|${heroPosition}|${currentStreet}|${boardStr}`,
      hand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
      position: heroPosition, street: currentStreet, board: boardStr,
      gtoAction: correctLabel, heroHand: { ...heroHand },
    }, isCorrect);

    try {
      const token = getAccessToken();
      if (!token) return;
      const hash = activeSpot?.id
        || `${heroHand.card1}${heroHand.card2}_${heroPosition}_${board.flop.join('')}${board.turn || ''}${board.river || ''}`;
      fetch('/api/assistant/sandbox/sandbox-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scenarioHash: hash, userAction: guess, correctAction: correctLabel, isCorrect, spotId: activeSpot?.id || null }),
      }).catch(e => console.warn('[Sandbox] quiz post failed:', e?.message || e));
    } catch (e) { console.warn('[Sandbox] quiz error:', e?.message || e); }
  }, [resultsOverride, results, activeSpot, board, heroHand, heroPosition, currentStreet, scheduleReview]);

  // ═══════════════════════════════════════════════════════════
  // POSITION COMPARISON — must not re-fire the coach effect (it used to
  // double-count the streak and POST a duplicate coach-result row)
  // ═══════════════════════════════════════════════════════════

  // The suppression flag is consumed by the `results` effect, which only runs
  // when `analyze` actually succeeds. A failed request leaves `results`
  // untouched, so the flag has to be released here or it silently swallows the
  // coach grading of the user's NEXT successful analysis.
  const analyzeWithoutCoach = useCallback(async (payload) => {
    suppressCoachEffectRef.current = true;
    let ok = false;
    try {
      const data = await analyze(payload);
      ok = !!data?.success;
      return data;
    } finally {
      if (!ok) suppressCoachEffectRef.current = false;
    }
  }, [analyze]);

  const runPositionComparison = useCallback(async (pos) => {
    if (!comparePosition) primaryResultsRef.current = resultsOverride || results;
    setComparePosition(pos);
    setResultsOverride(null);
    const data = await analyzeWithoutCoach(buildAnalyzePayload(pos));
    if (!data?.success) toast.error('Could not compare that position — try again');
  }, [comparePosition, resultsOverride, results, analyzeWithoutCoach, buildAnalyzePayload]);

  const restorePrimaryResults = useCallback(async () => {
    setComparePosition(null);
    if (primaryResultsRef.current) {
      setResultsOverride(primaryResultsRef.current);
      primaryResultsRef.current = null;
      return;
    }
    await analyzeWithoutCoach(buildAnalyzePayload());
  }, [analyzeWithoutCoach, buildAnalyzePayload]);

  // ═══════════════════════════════════════════════════════════
  // HAND PLAYOUT — terminal states, a result banner, and Next Hand
  // ═══════════════════════════════════════════════════════════
  const handResult = useMemo(() => {
    if (!handState.terminal) return null;
    const invested = handState.invested?.hero || 0;
    if (handState.terminal === 'fold') {
      const heroWon = handState.winner === 'hero';
      return {
        heroWon,
        bb: heroWon ? (handState.pot - invested) : -invested,
        headline: heroWon ? 'Villain folded' : 'You folded',
        detail: heroWon
          ? `You take ${handState.pot.toFixed(1)} BB without showdown.`
          : `You give up ${invested.toFixed(1)} BB already invested.`,
        exact: true,
      };
    }
    const eq = Number(equity?.heroEquity);
    if (!Number.isFinite(eq)) {
      return { heroWon: null, bb: null, headline: 'All-in', detail: 'Set both hole cards to see the expected result.', exact: false };
    }
    const ev = (handState.pot * (eq / 100)) - invested;
    return {
      heroWon: ev >= 0,
      bb: ev,
      headline: 'All-in',
      detail: `${eq.toFixed(1)}% equity ${equityLabel} in a ${handState.pot.toFixed(1)} BB pot.`,
      exact: boardToArray(board).length === 5,
    };
  }, [handState, equity, equityLabel, board]);

  const runItOut = useCallback(() => {
    if (board.flop.length < 3) { randomBoard(); return; }
    const deck = freeDeck();
    let i = 0;
    const next = { ...board, flop: [...board.flop] };
    if (!next.turn && deck[i]) next.turn = deck[i++];
    if (!next.river && deck[i]) next.river = deck[i++];
    if (next.turn === board.turn && next.river === board.river) return;
    pushUndo();
    setBoard(next);
    playCardDeal();
  }, [board, freeDeck, pushUndo, playCardDeal, randomBoard]);

  const nextHand = useCallback((dealRandom = false) => {
    // The session log, quiz score and streak deliberately survive.
    if (handResult && handResult.bb != null) {
      setSessionLog(prev => {
        if (prev.length === 0) return prev;
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          resultBB: Math.round(handResult.bb * 10) / 10,
          resultExact: handResult.exact,
        };
        return updated;
      });
      if (handResult.heroWon && !reduceMotion) {
        import('canvas-confetti')
          .then(mod => mod.default?.({ particleCount: 60, spread: 60, origin: { y: 0.75 }, disableForReducedMotion: true }))
          .catch(() => { });
      }
    }
    pushUndo();
    setActionHistory([]);
    setPotBase(1.5);
    setBoard({ flop: [], turn: null, river: null });
    setHeroHand({ card1: null, card2: null });
    setReplayIndex(null);
    setCoachUserPick(null);
    coachUserPickRef.current = null;
    setQuizRevealed(false);
    setUserGuess(null);
    setActiveSpot(null);
    clearResults();
    setResultsOverride(null);
    setShowResults(false);
    streetHistoryRef.current = [];
    setStreetHistory([]);
    setActiveStreet(0);
    if (dealRandom) {
      const deck = [];
      RANKS.forEach(r => SUITS.forEach(s => deck.push(`${r}${s.code}`)));
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      setHeroHand({ card1: deck[0], card2: deck[1] });
      setBoard({ flop: deck.slice(2, 5), turn: null, river: null });
      playCardDeal();
    }
  }, [handResult, reduceMotion, pushUndo, clearResults, playCardDeal]);

  // ═══════════════════════════════════════════════════════════
  // RESET — two-tap confirm in-page (window.confirm is blocked in several
  // in-app browsers, and the felt button used to reset with no confirmation)
  // ═══════════════════════════════════════════════════════════
  const resetAll = useCallback(() => {
    setHeroHand({ card1: null, card2: null });
    setBoard({ flop: [], turn: null, river: null });
    setActionHistory([]);
    setPotBase(1.5);
    clearResults();
    setResultsOverride(null);
    primaryResultsRef.current = null;
    setShowResults(false);
    setComparePosition(null);
    streetHistoryRef.current = [];
    setStreetHistory([]);
    setActiveStreet(0);
    setEquity(null);
    setRunoutData(null);
    undoStackRef.current = [];
    setQuizMode(false); setUserGuess(null); setQuizRevealed(false); setActiveSpot(null);
    setExploitMode('gto'); setPreflopScenario('rfi');
    setBubbleFactor(1.0);
    setReplayIndex(null);
    setCoachUserPick(null); coachUserPickRef.current = null;
    setCoachEvDelta(null); setCoachEvEstimated(false);
    setShowShareHand(false);
    setShowSessionLog(false);
  }, [clearResults]);

  useEffect(() => () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); }, []);

  const confirmReset = useCallback(() => {
    const hasWork = !!(results || resultsOverride || actionHistory.length > 0 || heroHand.card1 || board.flop.length);
    if (!hasWork) { resetAll(); return; }
    if (resetArmed) {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      setResetArmed(false);
      resetAll();
      toast.success('Scenario reset');
      return;
    }
    setResetArmed(true);
    try { navigator.vibrate?.(20); } catch (e) { /* unsupported */ }
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => { resetTimerRef.current = null; setResetArmed(false); }, 3500);
    toast('Tap reset again to clear the whole scenario', { duration: 3000 });
  }, [results, resultsOverride, actionHistory.length, heroHand.card1, board.flop.length, resetArmed, resetAll]);

  // ═══════════════════════════════════════════════════════════
  // BOOKMARKS
  // ═══════════════════════════════════════════════════════════
  const saveBookmarkLocally = useCallback((payload) => {
    if (!payload || typeof window === 'undefined') return false;
    try {
      const stored = JSON.parse(safeLocal.get('sandbox_bookmarks', '[]'));
      safeLocal.set('sandbox_bookmarks', JSON.stringify([payload, ...(Array.isArray(stored) ? stored : [])].slice(0, 100)));
      return true;
    } catch (e) { return false; }
  }, []);

  const saveBookmark = useCallback(async () => {
    let payload = null;
    try {
      const user = getAuthUser();
      setSaveStatus('saving');
      payload = {
        user_id: user?.id || null,
        hero_hand: `${heroHand.card1 || ''}${heroHand.card2 || ''}`,
        hero_position: heroPosition, hero_stack: heroStack, game_type: gameType,
        board_flop: board.flop.join(''), board_turn: board.turn, board_river: board.river,
        villains: JSON.stringify(villains), action_history: JSON.stringify(actionHistory),
        pot_size_bb: potSize,
        label: `${heroPosition} ${heroHand.card1 || '?'}${heroHand.card2 || '?'} on ${board.flop.join('') || 'preflop'}`,
        created_at: new Date().toISOString(),
      };
      if (!user) { setSaveStatus(saveBookmarkLocally(payload) ? 'saved' : 'error'); return; }
      const { error: dbError } = await supabase.from('sandbox_bookmarks').insert(payload);
      if (dbError) {
        console.warn('[Sandbox] Bookmark save error (table may not exist yet):', dbError.message);
        setSaveStatus(saveBookmarkLocally(payload) ? 'saved' : 'error');
      } else {
        setSaveStatus('saved');
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pa-data-updated'));
      }
    } catch (err) {
      console.warn('[Sandbox] Sync error (caching offline):', err?.message || err);
      setSaveStatus(payload && saveBookmarkLocally(payload) ? 'saved' : 'error');
    } finally {
      setTimeout(() => setSaveStatus(null), 2000);
    }
  }, [heroHand, heroPosition, heroStack, gameType, board, villains, actionHistory, potSize, saveBookmarkLocally]);

  const loadSessionEntry = useCallback((entry) => {
    if (!entry) return;
    const cards = String(entry.board || '').split(' ').filter(Boolean);
    restoreScenario({
      heroHand: entry.hand && entry.hand.length >= 4
        ? { card1: entry.hand.substring(0, 2), card2: entry.hand.substring(2, 4) }
        : null,
      heroPosition: entry.position,
      board: { flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null },
      actionHistory: [],
      potSize: 1.5,
    });
    try { navigator.vibrate?.(20); } catch (e) { /* unsupported */ }
  }, [restoreScenario]);

  // ═══════════════════════════════════════════════════════════
  // DERIVED VIEW STATE
  // ═══════════════════════════════════════════════════════════
  const historicResults = (activeStreet < streetHistory.length) ? streetHistory[activeStreet]?.results : null;
  const displayResults = historicResults || resultsOverride || results;
  const isHistoricView = !!historicResults;

  const sourceBadge = displayResults ? (
    displayResults.offline
      ? { bg: T.warnSoft, border: T.warn, text: T.warn, label: 'Offline estimate' }
      : displayResults.matchTier <= 2 ? { bg: T.successSoft, border: T.success, text: T.success, label: 'PIO Verified' }
        : displayResults.matchTier === 3 ? { bg: T.warnSoft, border: T.warn, text: T.warn, label: 'PIO Approximated' }
          : { bg: T.purpleSoft, border: T.purple, text: T.purple, label: 'AI Analysis' }
  ) : null;

  const anyModalOpen = showDeck || showCoachPicker || showSaveHand || showShareScenario || showGodMode
    || showSolverImport || showHHImport || showTemplates || showLeakStats || showSessionLog
    || showRangeExplorer || showQuickDrill || showCustomDrill || showSessionReport
    || showVillainPresets || showHandReplay || showStudyFolders || showShareHand || showRangeGrid
    || showSessions || showSetup || showDue || showResults;

  // Keyboard shortcuts read their callbacks from here (registered once, fresh)
  const actionsRef = useRef({});
  useEffect(() => {
    actionsRef.current = {
      runAnalysis: () => runAnalysis(),
      confirmReset, popUndo, saveBookmark, toggleCoachMode,
      modalOpen: anyModalOpen,
    };
  });

  useEffect(() => {
    const handleKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const acts = actionsRef.current;
      if (acts.modalOpen && e.key !== 'Escape' && e.key !== '?') return;
      switch (e.key.toLowerCase()) {
        case 'a': acts.runAnalysis?.(); break;
        case 'r': acts.confirmReset?.(); break;
        case 'u': acts.popUndo?.(); break;
        case 's': acts.saveBookmark?.(); break;
        case 'c': acts.toggleCoachMode?.(); break;
        case '?': setShowShortcutLegend(prev => !prev); break;
        case 'escape': setShowResults(false); setShowShortcutLegend(false); break;
        default: break;
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('keydown', handleKey);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('keydown', handleKey); };
  }, []);

  const selectResultsTab = useCallback((tab) => {
    setResultsTab(tab);
    safeLocal.set('sandbox-results-tab', tab);
  }, []);

  const startLeakDrill = useCallback(() => {
    const street = String(practiceFocus?.drill || '').toLowerCase();
    setDrillParams({
      street: ['preflop', 'flop', 'turn', 'river'].includes(street) ? street : 'flop',
      position: heroPosition,
      limit: 10,
    });
    setShowQuickDrill(true);
  }, [practiceFocus, heroPosition]);

  const copyShareLink = useCallback(() => {
    try {
      const packed = LZString.compressToEncodedURIComponent(JSON.stringify(sandboxSnapshot));
      const url = `${window.location.origin}/hub/personal-assistant/sandbox?s=${packed}`;
      navigator.clipboard?.writeText(url)
        .then(() => toast.success('Full-fidelity link copied'))
        .catch(() => toast.error('Copy failed'));
    } catch (e) {
      toast.error('Could not build a share link');
    }
  }, [sandboxSnapshot]);

  // ── View helpers ──
  const tableCards = replayState ? replayState.cards : communityCards;
  const tablePot = replayState ? replayState.handState.pot : potSize;
  const tableSpr = replayState ? replayState.handState.spr : handState.spr;
  const canDeal = board.flop.length === 3 && !board.river && !handOver;
  const analyzeDisabled = isAnalyzing || !heroHand.card1 || !heroHand.card2 || handOver;
  const textureLabel = boardTexture ? (TEXTURE_SHORT[boardTexture.label] || boardTexture.label) : null;

  return (
    <div
      className="sandbox-page"
      style={{
        width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
        background: T.bg, color: T.text,
        fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
        // clears the sticky action bar (60) + BottomNavBar (56) + safe area
        paddingBottom: 'calc(60px + 56px + 16px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {UpgradePopup}
      {/* top-right collides with the header on a 375px screen */}
      <Toaster position="top-center" containerStyle={{ top: 'calc(8px + env(safe-area-inset-top, 0px))' }} />

      <UniversalHeader pageDepth={2} onMenuClick={() => setShowMenu(true)} />

      <HamburgerMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        direction="left"
        theme="pa"
        user={null}
        showProfile={false}
        menuItems={getMenuConfig('sandbox', null, {
          quizMode, coachMode,
          hasResults: !!displayResults,
          saveStatus,
          sessionLogCount: sessionLog.length,
          showHeatmap, showNodeLocks, soundEnabled,
        }, {
          onToggleQuiz: () => { setQuizMode(q => !q); setQuizRevealed(false); setUserGuess(null); },
          onToggleCoach: () => toggleCoachMode(),
          onRanges: () => setShowRangeExplorer(true),
          onVillains: () => setShowVillainPresets(true),
          onUndo: () => popUndo(),
          onReset: () => confirmReset(),
          onReplay: () => setShowHandReplay(true),
          onResults: () => setShowResults(true),
          onShare: () => {
            // ShareHandModal captures #results-panel, so the results sheet must
            // be mounted (and on a presentable tab) when it opens.
            if (!displayResults) { setShowShare(true); return; }
            selectResultsTab('verdict');
            setShowResults(true);
            setShowShareHand(true);
          },
          onSave: () => saveBookmark(),
          onSessions: () => setShowSessions(true),
          onFolders: () => setShowStudyFolders(true),
          onLog: () => setShowSessionLog(true),
          onTemplates: () => { setShowTemplates(true); loadTemplates(); },
          onSaveTemplate: () => saveAsTemplate(),
          onSaveSpot: () => setShowSaveHand(true),
          onShareScenario: () => setShowShareScenario(true),
          onImportHH: () => setShowHHImport(true),
          onLeakStats: openAnalytics,
          onAnalytics: openAnalytics,
          onReport: () => setShowSessionReport(true),
          onGodMode: () => setShowGodMode(true),
          onProImport: () => setShowSolverImport(true),
          onCustomSpot: () => setShowCustomDrill(true),
          onDrill: () => { setDrillParams(null); setShowQuickDrill(true); },
          onToggleHeatmap: (val) => setShowHeatmap(val),
          onToggleNodeLocks: (val) => setShowNodeLocks(val),
          onToggleSound: () => toggleSound(),
          onPlayTutorial: () => { setShowTour(true); setTourStep(0); },
        }).menuItems}
        bottomLinks={getMenuConfig('sandbox', null, {}, {
          onPlayTutorial: () => { setShowTour(true); setTourStep(0); },
        }).bottomLinks}
      />

      <OnboardingTour
        isVisible={showTour}
        step={tourStep}
        onClose={() => { setShowTour(false); safeLocal.set('sandbox-tour-seen', 'true'); }}
        onNext={() => setTourStep(prevStep => {
          const next = prevStep + 1;
          // The results step spotlights #results-panel, which only exists while
          // the sheet is mounted — open it so the step is not an orphan.
          if (next === 4 && displayResults) setShowResults(true);
          return next;
        })}
      />

      <main style={{
        width: '100%', maxWidth: 560, margin: '0 auto', boxSizing: 'border-box',
        paddingTop: S.md,
        paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
        paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
        display: 'flex', flexDirection: 'column', gap: S.md,
      }}>

        {/* ── Leak practice hand-off from the Leak Finder ── */}
        {practiceFocus && (
          <div style={{
            ...cardCompact, background: T.warnSoft, border: `1px solid rgba(251,191,36,0.3)`,
            display: 'flex', alignItems: 'center', gap: S.md, marginTop: S.md,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...sectionTitle, color: T.warn }}>Practising a leak</div>
              <div style={{ fontSize: F.bodySm, color: T.text, fontWeight: 700, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {String(practiceFocus.leakType || 'Leak drill')}
                {practiceFocus.drill ? ` — ${String(practiceFocus.drill)}` : ''}
              </div>
              <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: 2, lineHeight: 1.45 }}>
                Coach mode is on — pick your action before each analysis.
              </div>
              <button type="button" className="pa-btn" onClick={startLeakDrill} style={{ ...btn('secondary'), marginTop: S.sm, color: T.warn }}>
                <Zap size={18} strokeWidth={2} aria-hidden="true" />Start drill
              </button>
            </div>
            <button
              type="button" className="pa-btn" onClick={() => setPracticeFocus(null)}
              aria-label="Dismiss leak practice banner"
              style={iconBtn({ color: T.textMuted })}
            >
              <XIcon size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* ── Always-visible progress + live numbers ── */}
        <StatusStrip
          quizScore={quizScore}
          coachStreak={coachStreak}
          equity={equity?.heroEquity}
          pot={tablePot}
          spr={tableSpr}
          handClass={handStrength?.label || null}
          dueCount={dueItems.length}
          onDue={() => setShowDue(true)}
        />

        {/* ── Board texture chip (moved OFF the felt where it never fit) ── */}
        {(textureLabel || equity?.refining) && (
          <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap', alignItems: 'center' }}>
            {textureLabel && (
              <button
                type="button" className="pa-btn"
                onClick={() => toast(boardTexture.strategy || textureLabel, { duration: 4000 })}
                aria-label={`Board texture ${textureLabel}. Tap for the strategy note.`}
                style={{ ...btn('secondary'), borderRadius: R.pill, padding: '0 14px', fontSize: F.caption, color: boardTexture.textColor || T.textMuted }}
              >
                {textureLabel}
              </button>
            )}
            {equity?.refining && (
              <span style={{ ...pill('neutral') }}>
                <Loader2 size={12} strokeWidth={2} className="pa-spin" aria-hidden="true" />
                refining equity
              </span>
            )}
          </div>
        )}

        {/* ── THE TABLE — full width, the hero element ── */}
        <div
          id="sandbox-table"
          className="sandbox-table-wrap"
          style={{ width: '100%', filter: FELT_COLORS.find(f => f.id === tableFelt)?.filter || 'none' }}
        >
          <MemoSandboxPokerTable
            heroCards={heroCardsMemo}
            communityCards={tableCards}
            pot={Number(tablePot) || 0}
            heroPosition={heroPosition}
            heroStack={Math.round(handState.remaining.hero)}
            villains={tableVillains}
            street={currentStreet}
            boardTexture={boardTexture}
            showTextureBadge={false}
            equity={equity?.heroEquity}
            equityLabel={equityLabel}
            spr={tableSpr}
            showDealHint={canDeal && !!heroHand.card1}
            onTapHeroCards={openHeroPicker}
            onTapBoard={openBoardPicker}
            onReset={confirmReset}
            onRemoveHeroCard={(idx) => {
              try { navigator.vibrate?.(15); } catch (e) { /* unsupported */ }
              pushUndo();
              if (idx === 0) setHeroHand(h => ({ ...h, card1: h.card2, card2: null }));
              else setHeroHand(h => ({ ...h, card2: null }));
            }}
            onRemoveBoardCard={(idx) => {
              try { navigator.vibrate?.(15); } catch (e) { /* unsupported */ }
              pushUndo();
              const allCards = boardToArray(board);
              allCards.splice(idx, 1);
              setBoard({ flop: allCards.slice(0, Math.min(3, allCards.length)), turn: allCards[3] || null, river: allCards[4] || null });
            }}
            onSwipeLeft={() => { if (canDeal) dealAndCoach(); }}
            onSwipeRight={() => {
              if (!board.river && !board.turn) return;
              pushUndo();
              if (board.river) setBoard(b => ({ ...b, river: null }));
              else setBoard(b => ({ ...b, turn: null }));
              toast((t) => (
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: F.bodySm }}>
                  Card removed
                  <button
                    type="button" className="pa-btn"
                    onClick={() => { popUndo(); toast.dismiss(t.id); }}
                    style={{ ...btn('secondary'), padding: '0 14px', fontSize: F.label, flexShrink: 0 }}
                  >Undo</button>
                </span>
              ), { duration: 3200 });
            }}
          />
        </div>

        {/* ── First-run: three one-tap starts instead of two dashed rectangles ── */}
        {!heroHand.card1 && !heroHand.card2 && communityCards.length === 0 && (
          <div style={{ ...cardCompact, display: 'flex', flexDirection: 'column', gap: S.sm }}>
            <h3 style={{ fontSize: F.h3, fontWeight: 700, margin: 0, color: T.text }}>Start a spot</h3>
            <p style={{ fontSize: F.bodySm, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
              Pick a hand and a board, or let the sandbox deal you one.
            </p>
            <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
              <button type="button" className="pa-btn" onClick={() => nextHand(true)} style={{ ...btn('primary'), flex: '1 1 150px' }}>
                <Shuffle size={18} strokeWidth={2} aria-hidden="true" />Deal me a spot
              </button>
              <button type="button" className="pa-btn" onClick={openHeroPicker} style={{ ...btn('secondary'), flex: '1 1 150px' }}>
                Pick my cards
              </button>
              <button type="button" className="pa-btn" onClick={() => setShowSessions(true)} style={{ ...btn('secondary'), flex: '1 1 150px' }}>
                Load a saved hand
              </button>
              {weeklySpot && (
                <button type="button" className="pa-btn" onClick={() => loadWeeklySpot(weeklySpot)} style={{ ...btn('secondary'), flex: '1 1 150px', color: T.purple }}>
                  <Trophy size={18} strokeWidth={2} aria-hidden="true" />Weekly challenge
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Hand complete ── */}
        {handOver && handResult && (
          <div style={{
            ...cardCompact,
            background: handResult.heroWon ? T.successSoft : handResult.heroWon === false ? T.dangerSoft : T.warnSoft,
            border: `1px solid ${handResult.heroWon ? 'rgba(34,197,94,0.4)' : handResult.heroWon === false ? 'rgba(239,68,68,0.4)' : 'rgba(251,191,36,0.4)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginBottom: S.xs }}>
              {handResult.heroWon
                ? <Check size={18} strokeWidth={3} style={{ color: T.success }} aria-hidden="true" />
                : <AlertTriangle size={18} strokeWidth={2} style={{ color: handResult.heroWon === false ? T.danger : T.warn }} aria-hidden="true" />}
              <span style={{ fontSize: F.h3, fontWeight: 800, color: handResult.heroWon ? T.success : handResult.heroWon === false ? T.danger : T.warn }}>
                {handResult.headline}
              </span>
              {handResult.bb != null && (
                <span style={{ marginLeft: 'auto', ...pill(handResult.bb >= 0 ? 'success' : 'danger'), ...NUM }}>
                  {handResult.bb >= 0 ? '+' : ''}{handResult.bb.toFixed(1)} BB
                </span>
              )}
            </div>
            <p style={{ fontSize: F.bodySm, color: T.textMuted, margin: 0, lineHeight: 1.45 }}>
              {handResult.detail}{!handResult.exact && handResult.bb != null ? ' Expected value, not a dealt showdown.' : ''}
            </p>
            <div style={{ display: 'flex', gap: S.sm, marginTop: S.md, flexWrap: 'wrap' }}>
              {!handResult.exact && handState.terminal === 'allin' && boardToArray(board).length < 5 && (
                <button type="button" className="pa-btn" onClick={runItOut} style={{ ...btn('secondary'), flex: '1 1 140px' }}>
                  <PlayCircle size={18} strokeWidth={2} aria-hidden="true" />Run it out
                </button>
              )}
              <button type="button" className="pa-btn" onClick={() => nextHand(true)} style={{ ...btn('primary'), flex: '1 1 140px' }}>
                Next hand
              </button>
            </div>
          </div>
        )}

        {/* ── Board strip ── */}
        <div id="board-builder" style={{ ...cardCompact }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, marginBottom: S.md }}>
            <h4 style={{ ...sectionTitle, margin: 0 }}>Board</h4>
            <div style={{ display: 'flex', gap: S.sm }}>
              <button type="button" className="pa-btn" onClick={randomBoard} style={{ ...btn('secondary'), padding: '0 12px', fontSize: F.caption }}>
                <Shuffle size={18} strokeWidth={2} aria-hidden="true" />Random
              </button>
              {communityCards.length >= 3 && (
                <button type="button" className="pa-btn" onClick={() => setShowRangeGrid(true)} style={{ ...btn('secondary'), padding: '0 12px', fontSize: F.caption, color: T.purple }}>
                  Grid
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: S.md, flexWrap: 'wrap', alignItems: 'center' }}>
            {board.flop.map((c, i) => (
              <CardSlot
                key={`f${i}`} card={c} onTap={openBoardPicker}
                onRemove={() => { pushUndo(); const f = [...board.flop]; f.splice(i, 1); setBoard({ flop: f, turn: null, river: null }); }}
              />
            ))}
            {board.flop.length < 3 && <CardSlot onTap={openBoardPicker} />}
            {board.flop.length === 3 && (
              <CardSlot card={board.turn} label="T" onTap={openBoardPicker} onRemove={board.turn ? () => { pushUndo(); setBoard(b => ({ ...b, turn: null, river: null })); } : null} />
            )}
            {board.turn && (
              <CardSlot card={board.river} label="R" onTap={openBoardPicker} onRemove={board.river ? () => { pushUndo(); setBoard(b => ({ ...b, river: null })); } : null} />
            )}
          </div>
        </div>

        {/* ── Street timeline ── */}
        <StreetTimeline
          streetHistory={streetHistory}
          activeStreet={activeStreet}
          onSelectStreet={(i) => { setActiveStreet(i); setShowResults(true); }}
        />

        {/* ── Action line — full width, no 110px rail, no 80px clamp ── */}
        <div id="action-history">
          <ActionReplayBar
            actions={actionHistory}
            replayIndex={replayIndex}
            onReplayTo={onReplayTo}
            onExitReplay={() => onReplayTo(null)}
          />
          {replayIndex != null && (
            <button
              type="button" className="pa-btn"
              onClick={() => { onReplayTo(null); runAnalysis(true, null, replayState?.board || board); }}
              style={{ ...btn('secondary', { block: true }), marginBottom: S.md, color: T.accent }}
            >
              Re-analyze from here
            </button>
          )}
          <MemoActionHistoryBuilder
            actions={actionHistory}
            onAdd={addAction}
            onRemove={removeAction}
            potSize={Number(potBase) || 1.5}
            heroPosition={heroPosition}
            villainPosition={villains[0]?.position || 'BB'}
            street={currentStreet}
            handState={replayState ? replayState.handState : handState}
            disabled={replayIndex != null || handOver}
          />
        </div>

        {/* ── Preflop chart ── */}
        {currentStreet === 'preflop' && (
          <div>
            <button
              type="button" className="pa-btn"
              onClick={() => setShowRangeChart(v => !v)}
              aria-expanded={showRangeChart}
              style={{ ...btn(showRangeChart ? 'primary' : 'secondary', { block: true }), justifyContent: 'space-between' }}
            >
              <span>{heroPosition} range chart</span>
              {showRangeChart ? <ChevronUp size={18} strokeWidth={2} aria-hidden="true" /> : <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />}
            </button>
            {showRangeChart && (
              <div style={{ marginTop: S.sm }}>
                <PreflopChartOverlay
                  position={heroPosition}
                  scenario={preflopScenario}
                  rangeGrid={rangeGrid}
                  rangePercent={rangePercent}
                  onChangeScenario={setPreflopScenario}
                  onPickHand={(handKey) => {
                    // Turn the chart into a hand picker: load a representative combo
                    if (!handKey || handKey.length < 2) return;
                    const r1 = handKey[0], r2 = handKey[1];
                    const suited = handKey.endsWith('s');
                    pushUndo();
                    setHeroHand({ card1: `${r1}s`, card2: `${r2}${suited ? 's' : 'h'}` });
                    toast.success(`${handKey} loaded`);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Runout simulator ── */}
        {board.flop.length === 3 && !board.river && runoutData && (
          <div>
            <button
              type="button" className="pa-btn"
              onClick={() => setShowRunouts(v => !v)}
              aria-expanded={showRunouts}
              style={{ ...btn(showRunouts ? 'primary' : 'secondary', { block: true }), justifyContent: 'space-between' }}
            >
              <span>Runout simulator</span>
              {showRunouts ? <ChevronUp size={18} strokeWidth={2} aria-hidden="true" /> : <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />}
            </button>
            {showRunouts && <div style={{ marginTop: S.sm }}><RunoutChart runoutData={runoutData} /></div>}
          </div>
        )}

        {/* ── Analysis error ── */}
        {error && !resultsOverride && (
          <ErrorState
            title="Analysis failed"
            body={String(error)}
            onRetry={() => runAnalysis(true, coachUserPick)}
          />
        )}

        {isAnalyzing && <AnalysisSkeleton />}
      </main>

      {/* ═══ STICKY THUMB BAR — the whole tool is one-handed from here ═══ */}
      <div
        id="run-analysis"
        style={{
          position: 'fixed', left: 0, right: 0,
          bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          zIndex: Z.sticky,
          display: 'flex', alignItems: 'center', gap: S.sm,
          paddingTop: S.sm, paddingBottom: S.sm,
          paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(12px, env(safe-area-inset-right, 0px))',
          background: 'rgba(24,25,26,0.94)',
          WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)',
          borderTop: `1px solid ${T.border}`,
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button" className="pa-btn" onClick={popUndo}
          aria-label="Undo last change"
          style={iconBtn({ color: T.textMuted })}
        >
          <Undo2 size={20} strokeWidth={2} aria-hidden="true" />
        </button>

        <button
          type="button" className="pa-btn"
          onClick={() => (canDeal ? dealAndCoach() : randomBoard())}
          aria-label={canDeal ? `Deal the ${board.turn ? 'river' : 'turn'}` : 'Deal a random flop'}
          style={iconBtn({ color: canDeal ? T.success : T.textMuted })}
        >
          {canDeal ? <PlayCircle size={20} strokeWidth={2} aria-hidden="true" /> : <Shuffle size={20} strokeWidth={2} aria-hidden="true" />}
        </button>

        <button
          type="button" className="pa-btn"
          onClick={() => runAnalysis()}
          disabled={analyzeDisabled}
          style={{
            ...btn(analyzeDisabled ? 'secondary' : 'primary', { disabled: analyzeDisabled }),
            flex: 1, minWidth: 0, minHeight: 52, fontSize: F.h3, letterSpacing: 0.3,
          }}
        >
          {isAnalyzing
            ? <><Loader2 size={20} strokeWidth={2} className="pa-spin" aria-hidden="true" />Analyzing…</>
            : coachMode
              ? <><Brain size={20} strokeWidth={2} aria-hidden="true" />What would you do?</>
              : 'Analyze'}
        </button>

        <button
          type="button" className="pa-btn" id="sandbox-setup"
          onClick={() => setShowSetup(true)}
          aria-label="Open setup"
          style={iconBtn({ color: T.textMuted })}
        >
          <SlidersHorizontal size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {/* ═══════════════════ SHEETS ═══════════════════ */}

      <CardPickerSheet
        isOpen={showDeck}
        onClose={() => { setShowDeck(false); setDeckTarget(null); setHeroPickStep(0); }}
        onSelect={handleDeckSelect}
        usedCards={allUsedCards}
        mode={deckTarget === 'hero' ? 'hero' : deckTarget === 'board' ? 'board' : 'single'}
        pickProgress={heroPickStep}
        onRandomCard={randomCard}
        onRandomFlop={randomBoard}
      />

      <SetupSheet
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
        heroPosition={heroPosition} setHeroPosition={setHeroPosition}
        gameType={gameType} setGameType={setGameType}
        heroStack={heroStack} setHeroStack={setHeroStack}
        potBase={potBase} setPotBase={setPotBase} livePot={potSize}
        villains={villains}
        onVillainPatch={patchVillain}
        onVillainArchetype={handleVillainArchetypeChange}
        onAddVillain={addVillain}
        onRemoveVillain={removeVillain}
        onOpenPresets={() => { setShowSetup(false); setShowVillainPresets(true); }}
        onOpenRanges={() => { setShowSetup(false); setShowRangeExplorer(true); }}
        bubbleFactor={bubbleFactor} setBubbleFactor={setBubbleFactor}
        tableFelt={tableFelt} onChangeFelt={changeFeltColor}
        isListening={isListening} onVoice={startVoiceInput} voiceSupported={voiceSupported}
        equityVsRange={equityVsRange} setEquityVsRange={setEquityVsRange}
        onImportHH={() => { setShowSetup(false); setShowHHImport(true); }}
        onTemplates={() => { setShowSetup(false); setShowTemplates(true); loadTemplates(); }}
      />

      <SessionsSheet
        isOpen={showSessions}
        onClose={() => setShowSessions(false)}
        leaderboardEntries={leaderboardEntries}
        onLeakStats={openAnalytics}
        onLoad={(session) => {
          const flop = session.board_flop
            ? (String(session.board_flop).includes(',') ? String(session.board_flop).split(',').filter(Boolean) : (String(session.board_flop).match(/.{1,2}/g) || []))
            : [];
          const h = String(session.hero_hand || '');
          restoreScenario({
            heroHand: h.length >= 4 ? { card1: h.substring(0, 2), card2: h.substring(2, 4) } : null,
            heroPosition: session.hero_position,
            heroStack: session.hero_stack,
            gameType: session.game_type,
            board: { flop, turn: session.board_turn || null, river: session.board_river || null },
            villains: Array.isArray(session.villain_config) && session.villain_config.length
              ? session.villain_config
              : [{ id: 0, position: session.hero_position === 'BB' ? 'SB' : 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: Number(session.hero_stack) || 100 }],
            actionHistory: Array.isArray(session.action_history) ? session.action_history : [],
            potSize: session.pot_size_bb,
          });
        }}
      />

      <TemplatesSheet
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        templates={templates}
        status={templatesStatus}
        error={templatesError}
        onReload={loadTemplates}
        onSave={saveAsTemplate}
        onLoad={(t) => { restoreScenario(t?.scenario_json); setShowTemplates(false); }}
        onDelete={deleteTemplate}
      />

      <AnalyticsSheet
        isOpen={showLeakStats}
        onClose={() => setShowLeakStats(false)}
        status={leakStatsStatus}
        stats={leakStats}
        error={leakStatsError}
        onRetry={loadLeakStats}
      />

      <DueSheet
        isOpen={showDue}
        onClose={() => setShowDue(false)}
        due={dueItems}
        onReview={(item) => {
          restoreScenario({
            heroHand: item.heroHand || null,
            heroPosition: item.position,
            board: (() => {
              const cards = String(item.board || '').split(' ').filter(Boolean);
              return { flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null };
            })(),
            actionHistory: [],
            potSize: 1.5,
          });
          setCoachMode(true);
          setShowDue(false);
          toast('Review spot loaded — tap Analyze');
        }}
        onDismiss={(item) => setSrs(prev => {
          const next = prev.filter(e => e.key !== item.key);
          srsSave(next);
          return next;
        })}
      />

      <SessionLogModal
        isOpen={showSessionLog}
        onClose={() => setShowSessionLog(false)}
        sessionLog={sessionLog}
        onClearSession={() => { setSessionLog([]); try { Promise.resolve(idbSaveSessionLog([])).catch(() => { }); } catch (e) { /* noop */ } }}
        onLoadEntry={loadSessionEntry}
      />

      <CoachActionPicker
        isOpen={showCoachPicker}
        onPick={handleCoachPick}
        onSkip={handleCoachSkip}
        heroHand={heroHand}
        board={pendingBoard || board}
        potSize={potSize}
        heroPosition={heroPosition}
        villain={villains[0]}
        handState={handState}
        street={streetOfBoard(pendingBoard || board)}
        newCard={pendingBoard ? (pendingBoard.river || pendingBoard.turn) : null}
      />

      <ShareAnalysisModal
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        results={displayResults}
        scenario={{ board: communityCards.join(' ') }}
      />

      <ShortcutLegend isOpen={showShortcutLegend} onClose={() => setShowShortcutLegend(false)} />

      <ImportHHModal
        isVisible={showHHImport}
        onClose={() => setShowHHImport(false)}
        onImport={(parsed) => {
          if (!parsed) return;
          restoreScenario(parsed);
          toast.success('Hand imported');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pa-sandbox-updated', { detail: { type: 'import_hh' } }));
          }
        }}
      />

      {showRangeExplorer && (
        <RangeExplorer
          villains={villains}
          onSelectRange={(rangeStr, villainIdx = 0) => {
            if (!rangeStr) return;
            // Flag it as custom so the simulator is honest about still using the
            // archetype's tendencies for action frequencies.
            patchVillain(Math.min(villainIdx, villains.length - 1), { range: rangeStr, customRange: true });
            toast.success('Custom range applied');
          }}
          onClose={() => setShowRangeExplorer(false)}
        />
      )}

      {showVillainPresets && (
        <VillainPresetPicker
          villains={villains}
          onSelectPreset={(preset, villainIdx = 0) => {
            if (!preset) return;
            const idx = Math.min(Math.max(0, Number(villainIdx) || 0), villains.length - 1);
            const archId = preset.archetype?.id || 'gto_neutral';
            const pos = villains[idx]?.position || 'BB';
            // The WHOLE preset is applied — the old handler kept only `range`,
            // so picking "Maniac" left the simulator behaving as GTO Neutral.
            patchVillain(idx, {
              range: preset.range,
              archetype: preset.archetype || { id: archId, name: archId },
              vpip: getArchetypeVPIP(archId, pos),
              customRange: false,
            });
            toast.success(`${preset.archetype?.name || 'Preset'} applied`);
          }}
          onClose={() => setShowVillainPresets(false)}
        />
      )}

      {showCustomDrill && (
        <CustomDrillBuilder
          onClose={() => setShowCustomDrill(false)}
          onStartDrill={(params) => { setDrillParams(params); setShowCustomDrill(false); setShowQuickDrill(true); }}
        />
      )}

      {showQuickDrill && (
        <QuickSpotDrill customParams={drillParams} onClose={() => { setShowQuickDrill(false); setDrillParams(null); }} />
      )}

      {showSessionReport && (
        <SessionReport
          sessionLog={sessionLog}
          coachStreak={coachStreak}
          sessionStartedAt={sessionStartedAtRef.current}
          onClose={() => setShowSessionReport(false)}
        />
      )}

      {showHandReplay && (
        <HandReplay
          sessionLog={sessionLog}
          onLoadScenario={(entry) => { loadSessionEntry(entry); setShowHandReplay(false); }}
          onClose={() => setShowHandReplay(false)}
        />
      )}

      {showStudyFolders && (
        <StudyFolders onLoadTarget={(state) => restoreScenario(state)} onClose={() => setShowStudyFolders(false)} />
      )}

      {showSaveHand && (
        <SaveHandModal sandboxState={sandboxSnapshot} onSaveComplete={() => setShowSaveHand(false)} onClose={() => setShowSaveHand(false)} />
      )}

      {showShareScenario && (
        <ShareScenarioModal sandboxState={sandboxSnapshot} onClose={() => setShowShareScenario(false)} />
      )}

      {showGodMode && (
        <GodModePanel
          onClose={() => setShowGodMode(false)}
          sandboxState={sandboxSnapshot}
          setResults={(mock) => {
            if (!mock) return;
            const freqs = mock.frequencies || {};
            const ev = Number(mock.evDelta) || 0;
            setResultsOverride({
              optimalAction: { id: String(mock.optimalAction || '').toLowerCase(), label: mock.optimalAction, frequency: 100, color: T.success },
              actions: Object.entries(freqs).map(([label, f]) => ({
                id: label.toLowerCase(), label, frequency: Number(f) || 0, isOptimal: label === mock.optimalAction,
              })),
              isMixed: false,
              ev: { hero: ev, heroDisplay: `${ev >= 0 ? '+' : ''}${ev.toFixed(2)} BB`, max: ev, min: ev, avg: ev, evLoss: 0 },
              matchTier: 4,
              source: 'God Mode Override',
              explanation: `Forced override: ${mock.optimalAction} at 100% (sizing ${mock.gtoSizing || 'N/A'}).`,
            });
            setShowResults(true);
            toast('God Mode result injected');
          }}
        />
      )}

      {showSolverImport && (
        <ExternalSolverImport
          onClose={() => setShowSolverImport(false)}
          onImport={(state) => {
            if (!state) return;
            restoreScenario({ ...state, heroStack: state.effStack ?? state.heroStack });
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus(null), 2000);
          }}
        />
      )}

      <RangeHeatGrid
        boardCards={communityCards}
        isOpen={showRangeGrid}
        onClose={() => setShowRangeGrid(false)}
        villainRange={villainRangeStr}
        villainLabel={villains[0]?.position || 'Villain'}
      />

      {/* ═══════════════════ RESULTS SHEET (tabbed) ═══════════════════ */}
      <BottomSheet
        isOpen={!!displayResults && showResults}
        onClose={() => setShowResults(false)}
        title={`Analysis${comparePosition ? ` (${comparePosition})` : ''}`}
        subtitle={isHistoricView ? `${streetHistory[activeStreet]?.street || 'Past street'} — archived` : `${currentStreet} · ${potSize.toFixed(1)} BB pot`}
        labelledBy="pa-results-title"
        maxWidth={640}
        footer={canDeal ? (
          <button type="button" className="pa-btn" onClick={dealAndCoach} style={btn('success', { block: true })}>
            <PlayCircle size={18} strokeWidth={2} aria-hidden="true" />
            Deal {board.turn ? 'river' : 'turn'} &amp; re-analyze
          </button>
        ) : null}
      >
        {displayResults && (
          <div id="results-panel" ref={exportCardRef}>
            {/* Sticky tab bar */}
            <div
              role="tablist" aria-label="Analysis sections"
              style={{
                position: 'sticky', top: -S.lg, zIndex: 2, background: T.surface,
                marginTop: -S.lg, paddingTop: S.lg, paddingBottom: S.sm,
                display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: S.sm,
              }}
            >
              {[['verdict', 'Verdict'], ['deep', 'Deep dive'], ['share', 'Share']].map(([id, label]) => (
                <button
                  key={id} type="button" className="pa-btn" role="tab" aria-selected={resultsTab === id}
                  onClick={() => selectResultsTab(id)}
                  style={{ ...btn(resultsTab === id ? 'primary' : 'secondary'), padding: '0 8px', fontSize: F.label }}
                >{label}</button>
              ))}
            </div>

            {isHistoricView && (
              <button
                type="button" className="pa-btn"
                onClick={() => setActiveStreet(streetHistory.length)}
                style={{ ...btn('secondary', { block: true }), marginBottom: S.md, color: T.accent }}
              >
                Back to the current street
              </button>
            )}

            {/* ─────────── VERDICT ─────────── */}
            {resultsTab === 'verdict' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                {sourceBadge && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: S.sm }}>
                    <span style={{
                      padding: '5px 12px', borderRadius: R.pill, fontSize: F.caption, fontWeight: 700,
                      background: sourceBadge.bg, border: `1px solid ${sourceBadge.border}`, color: sourceBadge.text,
                    }}>{sourceBadge.label}</span>
                    <span style={{ fontSize: F.caption, color: T.textMuted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {displayResults.source}
                    </span>
                  </div>
                )}

                {quizMode && (
                  <QuizPanel
                    onGuess={handleQuizGuess}
                    correctAction={activeSpot?.correct_action || displayResults.optimalAction?.label}
                    revealed={quizRevealed}
                    userGuess={userGuess}
                    score={quizScore}
                    prompt={activeSpot?.description || null}
                  />
                )}

                {coachMode && coachUserPick && (
                  <CoachVerdict
                    userPick={coachUserPick}
                    gtoAction={displayResults.optimalAction?.label}
                    evDelta={coachEvDelta}
                    evDeltaEstimated={coachEvEstimated}
                  />
                )}

                {coachMode && coachUserPick && (
                  <CoachFeedback
                    results={displayResults}
                    heroHand={heroHand}
                    heroPosition={heroPosition}
                    coachUserPick={coachUserPick}
                    isCorrect={gradeAction(coachUserPick, displayResults.optimalAction?.label)}
                    board={board}
                    villain={villains[0] || null}
                    onDrill={(spot) => {
                      const street = String(spot?.street || currentStreet || 'flop').toLowerCase();
                      setDrillParams({
                        street: ['preflop', 'flop', 'turn', 'river'].includes(street) ? street : 'flop',
                        position: spot?.position || heroPosition,
                        limit: 10,
                      });
                      setShowResults(false);
                      setShowQuickDrill(true);
                    }}
                  />
                )}

                {coachMode && recentResults.length >= 3 && <TiltMonitor recentResults={recentResults} />}

                {displayResults.optimalAction && (
                  <div style={{
                    background: T.successSoft, border: `1px solid rgba(34,197,94,0.3)`,
                    borderRadius: R.md, padding: S.lg, textAlign: 'center',
                  }}>
                    <div style={{ ...sectionTitle, marginBottom: S.xs }}>
                      {displayResults.isMixed ? 'Primary (mixed)' : 'Optimal (pure)'}
                    </div>
                    <div style={{ fontSize: F.h1, fontWeight: 800, color: displayResults.optimalAction.color || T.success, lineHeight: 1.2 }}>
                      {displayResults.optimalAction.label}
                    </div>
                    <div style={{ fontSize: F.h3, fontWeight: 700, color: T.text, ...NUM }}>
                      {displayResults.optimalAction.frequency}%
                    </div>
                  </div>
                )}

                {getResultsSummary(displayResults) && (
                  <p style={{
                    ...cardCompact, background: T.accentSoft, border: `1px solid rgba(69,153,255,0.25)`,
                    fontSize: F.bodySm, lineHeight: 1.45, color: T.text, margin: 0, textTransform: 'none',
                  }}>
                    {getResultsSummary(displayResults)}
                  </p>
                )}

                {displayResults.ev?.heroDisplay && displayResults.ev.heroDisplay !== '—' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: S.sm }}>
                    {[
                      { l: 'Hand EV', v: displayResults.ev.heroDisplay, c: displayResults.ev.hero >= 0 ? T.success : T.danger },
                      { l: 'EV loss', v: displayResults.ev.evLoss > 0 ? `-${displayResults.ev.evLoss.toFixed(2)}` : '0.00', c: displayResults.ev.evLoss > 0 ? T.danger : T.success },
                      { l: 'Avg EV', v: `${displayResults.ev.avg >= 0 ? '+' : ''}${displayResults.ev.avg.toFixed(2)}`, c: T.textMuted },
                    ].map(item => (
                      <div key={item.l} style={{ background: T.surface2, borderRadius: R.sm, padding: S.md, textAlign: 'center' }}>
                        <div style={{ fontSize: F.caption, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{item.l}</div>
                        <div style={{ fontSize: F.h3, fontWeight: 700, color: item.c, marginTop: 2, ...NUM }}>{item.v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {gameType === 'tournament' && displayResults.icmAdjusted && displayResults.icmEV && (
                  <div style={{ ...cardCompact, background: T.warnSoft, border: `1px solid rgba(251,191,36,0.25)`, display: 'flex', alignItems: 'center', gap: S.sm }}>
                    <span style={{ fontSize: F.caption, color: T.warn, fontWeight: 700, textTransform: 'uppercase' }}>
                      ICM EV ({Number(displayResults.bubbleFactor || bubbleFactor).toFixed(1)}x)
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: F.h3, fontWeight: 700, color: displayResults.icmEV.hero >= 0 ? T.success : T.danger, ...NUM }}>
                      {displayResults.icmEV.heroDisplay}
                    </span>
                  </div>
                )}

                <div style={{ ...cardCompact, background: T.surface2 }}>
                  <h4 style={{ ...sectionTitle, marginBottom: S.md }}>GTO frequencies</h4>
                  {displayResults.actions?.map(a => <FrequencyBar key={a.id} action={a} isOptimal={a.isOptimal} />)}
                </div>

                {displayResults.explanation && (
                  <div style={{ ...cardCompact, background: T.accentSoft, border: `1px solid rgba(69,153,255,0.2)` }}>
                    <h4 style={{ ...sectionTitle, marginBottom: S.xs }}>Analysis</h4>
                    <p style={{ color: T.text, fontSize: F.bodySm, lineHeight: 1.45, margin: 0, textTransform: 'none' }}>
                      {displayResults.explanation}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ─────────── DEEP DIVE ─────────── */}
            {resultsTab === 'deep' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                <ExploitToggle mode={exploitMode} onToggle={setExploitMode} exploitTip={exploitTip} />

                <NodeLockExploits
                  isVisible={showNodeLocks}
                  villains={villains}
                  updateVillainLock={(vid, lockType) => {
                    setVillains(v => v.map((villain, idx) => ((villain.id ?? idx) === vid ? { ...villain, nodeLock: lockType } : villain)));
                    const evNow = Number(displayResults?.ev?.hero);
                    setLockEvPreview(Number.isFinite(evNow) ? { before: evNow, after: null } : null);
                  }}
                  evPreview={lockEvPreview}
                  onReanalyze={async () => {
                    // Deliberately NOT runAnalysis(): that appends a second
                    // session-log row and re-grades the SAME coach decision,
                    // double-counting the streak and POSTing a duplicate
                    // coach-result row. A node-lock re-run is a pure re-solve.
                    setResultsOverride(null);
                    const data = await analyzeWithoutCoach(buildAnalyzePayload());
                    if (data?.success) {
                      playAnalysisDing();
                      toast.success('Re-solved with your node locks');
                    } else {
                      toast.error('Could not re-run the analysis');
                    }
                  }}
                />

                {showHeatmap && communityCards.length >= 3 && (
                  <div style={{ position: 'relative', height: 220, borderRadius: R.md, overflow: 'hidden', background: T.bg, border: `1px solid ${T.border}` }}>
                    <EquityHeatmapOverlay
                      isVisible={showHeatmap}
                      board={communityCards}
                      heroPosition={heroPosition}
                      villains={villains}
                      equity={equity}
                    />
                  </div>
                )}

                <EquityGraph
                  streetHistory={streetHistory}
                  currentEquity={equity?.heroEquity}
                  currentStreet={currentStreet}
                  onSelectStreet={(i) => setActiveStreet(Math.min(i, streetHistory.length))}
                  verdicts={streetHistory.map(s => s.isCorrect)}
                />

                <TreeVisualization
                  actions={displayResults.actions}
                  archetypeId={villains[0]?.archetype?.id || 'gto_neutral'}
                  potSize={potSize}
                  heroEquity={equity?.heroEquity}
                  boardTexture={boardTexture}
                  onAppendLine={(heroAction, villainResponse) => {
                    addAction({
                      position: heroPosition, action: heroAction.id || 'bet_66',
                      label: heroAction.label, street: currentStreet, isHero: true,
                    });
                    setShowResults(false);
                    toast(`Line added: ${heroAction.label} → ${villainResponse.label}`);
                  }}
                />

                <SizingSensitivity results={displayResults} />

                {displayResults.rangeHeatmap && (
                  <div style={{ ...cardCompact, background: T.surface2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: S.sm, marginBottom: S.md, flexWrap: 'wrap' }}>
                      <h4 style={{ ...sectionTitle, margin: 0 }}>
                        Range heatmap ({displayResults.rangeHeatmap.totalHands})
                      </h4>
                      <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                        {displayResults.rangeHeatmap.actions?.slice(0, 4).map(a => {
                          const on = (selectedHeatmapAction || displayResults.rangeHeatmap.actions[0]?.id) === a.id;
                          return (
                            <button
                              key={a.id} type="button" className="pa-btn"
                              onClick={() => setSelectedHeatmapAction(a.id)}
                              aria-pressed={on}
                              style={{ ...btn(on ? 'primary' : 'secondary'), padding: '0 12px', fontSize: F.caption }}
                            >{a.label}</button>
                          );
                        })}
                      </div>
                    </div>
                    <RangeMatrix
                      rangeHeatmap={displayResults.rangeHeatmap}
                      selectedAction={selectedHeatmapAction}
                      onPickHand={(handKey) => {
                        if (!handKey || handKey.length < 2) return;
                        const suited = handKey.endsWith('s');
                        pushUndo();
                        setHeroHand({ card1: `${handKey[0]}s`, card2: `${handKey[1]}${suited ? 's' : 'h'}` });
                        toast.success(`${handKey} loaded`);
                      }}
                    />
                  </div>
                )}

                {villains?.[0] && <VillainReadCard villain={villains[0]} />}

                {villains?.[0]?.range && (
                  <div>
                    <button
                      type="button" className="pa-btn"
                      onClick={() => setShowVillainRange(v => !v)}
                      aria-expanded={showVillainRange}
                      style={{ ...btn(showVillainRange ? 'primary' : 'secondary', { block: true }), justifyContent: 'space-between' }}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Villain range ({villains[0].archetype?.name || 'Unknown'})
                      </span>
                      {showVillainRange ? <ChevronUp size={18} strokeWidth={2} aria-hidden="true" /> : <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />}
                    </button>
                    {showVillainRange && (
                      <div style={{ ...cardCompact, marginTop: S.sm, background: T.bg }}>
                        <div style={{ ...sectionTitle, marginBottom: S.xs }}>
                          VPIP {villains[0].vpip ?? '—'}% · opening range
                        </div>
                        <p style={{ fontSize: F.caption, color: T.textMuted, fontFamily: 'monospace', lineHeight: 1.6, wordBreak: 'break-all', margin: 0, textTransform: 'none' }}>
                          {villains[0].range}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Compare position — lives here so it is never full-bleed */}
                <div style={{ ...cardCompact, background: T.surface2 }}>
                  <h4 style={{ ...sectionTitle, marginBottom: S.md }}>Compare position</h4>
                  <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                    {POSITIONS.map(p => {
                      const on = comparePosition ? comparePosition === p : heroPosition === p;
                      return (
                        <button
                          key={p} type="button" className="pa-btn"
                          onClick={() => (p === heroPosition ? restorePrimaryResults() : runPositionComparison(p))}
                          disabled={isAnalyzing}
                          aria-pressed={on}
                          style={{ ...btn(on ? 'primary' : 'secondary', { disabled: isAnalyzing }), flex: '1 0 72px', padding: '0 10px' }}
                        >{p}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ─────────── SHARE & TRAIN ─────────── */}
            {resultsTab === 'share' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                <ExportCard
                  results={displayResults}
                  scenario={{
                    position: heroPosition,
                    hand: `${heroHand.card1 || '?'}${heroHand.card2 || '?'}`,
                    board: communityCards.join(' ') || 'Preflop',
                  }}
                  equity={equity}
                  villainRange={villainRangeStr}
                />

                <button type="button" className="pa-btn" onClick={() => setShowShareHand(true)} style={btn('primary', { block: true })}>
                  <Camera size={18} strokeWidth={2} aria-hidden="true" />Share hand
                </button>

                <button type="button" className="pa-btn" onClick={copyShareLink} style={btn('secondary', { block: true })}>
                  <Share2 size={18} strokeWidth={2} aria-hidden="true" />Copy share link
                </button>

                <button type="button" className="pa-btn" onClick={() => { setShowResults(false); setShowShareScenario(true); }} style={btn('secondary', { block: true })}>
                  Share scenario (short link)
                </button>

                <button
                  type="button" className="pa-btn"
                  onClick={() => {
                    const hand = `${heroHand.card1 || ''}${heroHand.card2 || ''}`;
                    const boardStr = communityCards.filter(Boolean).join(' ');
                    const street = streetOfBoard(board);
                    const tags = [
                      heroPosition?.toLowerCase(), street, gameType?.toLowerCase(),
                      Number(heroStack) < 20 ? 'short stack' : null,
                      Number(heroStack) < 20 ? 'push fold' : null,
                    ].filter(Boolean);
                    const ctx = {
                      ref: 'sandbox', vid: hand || 'sandbox',
                      title: `${heroPosition || 'Hero'} vs ${boardStr || 'Preflop'} — ${gameType || 'NLH'}`.slice(0, 80),
                      source: 'Sandbox', tags,
                    };
                    let games = [];
                    let gameIds = [];
                    try {
                      gameIds = findBestGames(ctx) || [];
                      // Lazy require avoids a Webpack circular initialisation
                      const { getGameById: lookupGame } = require('../../../src/data/TRAINING_LIBRARY');
                      games = gameIds.map(id => lookupGame(id)).filter(Boolean).slice(0, 3);
                    } catch (e) { console.warn('[Sandbox] training match failed:', e?.message || e); }
                    setTtsOverlay({ ctx, games, hand, board: boardStr, street });
                    fetch('/api/training/log-request', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ref: 'sandbox', vid: ctx.vid, title: ctx.title, source: 'Sandbox', tags, matchedGameIds: gameIds.slice(0, 3) }),
                    }).catch(() => { });
                  }}
                  style={{ ...btn('success', { block: true }) }}
                >
                  <Layers size={18} strokeWidth={2} aria-hidden="true" />Train this spot
                </button>

                <button type="button" className="pa-btn" onClick={() => { setShowResults(false); setShowSessionReport(true); }} style={btn('secondary', { block: true })}>
                  <BookOpen size={18} strokeWidth={2} aria-hidden="true" />Session report
                </button>

                {studySessions.length > 0 && (
                  <StudyReplayCard
                    session={studySessions[studyIndex]}
                    index={studyIndex}
                    total={studySessions.length}
                    onNext={() => setStudyIndex(i => Math.min(i + 1, studySessions.length - 1))}
                    onPrev={() => setStudyIndex(i => Math.max(i - 1, 0))}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <ShareHandModal
        isOpen={showShareHand}
        onClose={() => setShowShareHand(false)}
        results={displayResults}
        heroHand={heroHand}
        board={board}
        scenario={{ position: heroPosition }}
        cardRef={exportCardRef}
      />

      {/* ═══ Train This Spot ═══ */}
      <BottomSheet
        isOpen={!!ttsOverlay}
        onClose={() => setTtsOverlay(null)}
        title="Train this spot"
        subtitle="Drills matched to your hand"
        labelledBy="pa-tts-title"
        footer={(
          <button type="button" className="pa-btn" onClick={() => { setTtsOverlay(null); router.push('/hub/training'); }} style={btn('secondary', { block: true })}>
            Browse all training games
          </button>
        )}
      >
        {ttsOverlay && (
          <>
            <div style={{ ...cardCompact, background: T.surface2, marginBottom: S.lg, display: 'flex', alignItems: 'center', gap: S.md, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: S.xs }}>
                {ttsOverlay.hand
                  ? (ttsOverlay.hand.match(/.{2}/g) || []).map((c, i) => <TableCard key={i} card={c} style={{ width: 34, height: 48 }} />)
                  : <span style={{ fontSize: F.caption, color: T.textDim }}>No hand set</span>}
              </div>
              <div style={{ fontSize: F.caption, color: T.textMuted, minWidth: 0 }}>
                <span style={{ textTransform: 'capitalize', fontWeight: 700, color: T.accent }}>{ttsOverlay.street}</span>
                {ttsOverlay.board ? ` · ${ttsOverlay.board}` : ''}
              </div>
            </div>

            {ttsOverlay.games.length === 0 ? (
              <EmptyState
                icon={<Target size={24} strokeWidth={2} aria-hidden="true" />}
                title="No matching drill yet"
                body="We could not match this spot to a training game. Browse the full library instead."
              />
            ) : ttsOverlay.games.map((game, idx) => (
              <button
                key={game.id} type="button" className="pa-btn"
                onClick={() => { setTtsOverlay(null); router.push(`/hub/training?autoLaunch=${game.id}`); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: S.md, width: '100%', minHeight: 60,
                  padding: S.md, marginBottom: S.sm, borderRadius: R.sm, textAlign: 'left', cursor: 'pointer',
                  background: idx === 0 ? T.successSoft : T.surface2,
                  border: `1px solid ${idx === 0 ? 'rgba(34,197,94,0.35)' : T.borderHi}`,
                }}
              >
                <span style={{
                  width: 40, height: 40, borderRadius: R.sm, flexShrink: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: idx === 0 ? 'rgba(34,197,94,0.18)' : T.surface,
                  color: idx === 0 ? T.success : T.textMuted,
                }}>
                  <Target size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: F.bodySm, fontWeight: 700, color: idx === 0 ? T.success : T.text }}>{game.name}</span>
                    {idx === 0 && <span style={pill('success')}>Best match</span>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: F.caption, color: T.textMuted, marginTop: 2 }}>
                    {game.focus}
                    <span style={{ display: 'inline-flex', gap: 1, marginLeft: 4 }} aria-label={`Difficulty ${Math.min(game.difficulty || 1, 5)} of 5`}>
                      {Array.from({ length: Math.min(game.difficulty || 1, 5) }).map((_, si) => (
                        <Star key={si} size={12} strokeWidth={2} fill="currentColor" style={{ color: T.warn }} aria-hidden="true" />
                      ))}
                    </span>
                  </span>
                </span>
                <ChevronRight size={18} strokeWidth={2} style={{ color: T.textDim, flexShrink: 0 }} aria-hidden="true" />
              </button>
            ))}
          </>
        )}
      </BottomSheet>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .sandbox-page { min-height: 100vh; min-height: 100dvh; }

        /* Touch feedback is mandatory and must not rely on hover */
        .pa-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .pa-btn:active:not(:disabled) { transform: scale(0.97); filter: brightness(1.12); }
        .pa-btn:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 2px; }

        .pa-skel { animation: paSkel 1.4s ease-in-out infinite; }
        @keyframes paSkel { 0%, 100% { opacity: .35 } 50% { opacity: .7 } }
        .pa-spin { animation: paSpin 1s linear infinite; }
        @keyframes paSpin { to { transform: rotate(360deg) } }

        /* Nothing on this page may be smaller than the 16px iOS zoom floor */
        .sandbox-page input,
        .sandbox-page select,
        .sandbox-page textarea { font-size: 16px; }

        /* Two-step picker on phones, classic 4x13 grid on wide screens */
        .deck-grid-only { display: none; }
        @media (min-width: 769px) {
          .deck-grid-only { display: block; }
          .deck-steps-only { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .pa-skel { animation: none; opacity: .5 }
          .pa-spin { animation: none }
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      <BottomNavBar />
    </div>
  );
}
