/**
 * LEAK FINDER · Post-Session Analysis
 * /hub/personal-assistant/leaks
 *
 * Identifies statistical leaks over time, NOT single-hand mistakes.
 * A leak requires: repetition + same situation class + measurable EV loss.
 *
 * INTEGRITY BADGE: Not Live Play - Post-Session Review Only
 *
 * PA_DESIGN_SPEC v1 ("Neon Slate"), mobile-first at 375x667:
 *  - single column, full-width cards, everything reachable one-handed
 *  - leak detail is a BOTTOM SHEET (paKit <BottomSheet/>), never a side rail
 *  - heavy analytics live behind an "Insights" tab and are code-split
 *  - every render path is wrapped in an error boundary (this route white-screened
 *    in production when trend_data arrived as a JSON string)
 */

import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import {
  Activity, AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Dumbbell, Flame, GraduationCap, Inbox, Link2, Lock, MoreHorizontal, Plus, RefreshCw,
  RotateCcw, Search, Settings, SlidersHorizontal, Sparkles, Target, TrendingDown, TrendingUp, X, Zap,
} from 'lucide-react';

import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import {
  useLeaks,
  useAssistantStats,
  useLeakDetection,
  useLeakHandExamples,
  readAssistantCache,
  writeAssistantCache,
  clearAssistantClientCache,
} from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import { getFreshAccessToken } from '../../../src/lib/authUtils';
import {
  T, F, S, R, Z, FONT, DISPLAY_FONT, DATA_FONT, card, cardCompact, btn, iconBtn, pill, numeric,
} from '../../../src/components/sandbox/paTokens';
import {
  PAStyles, BottomSheet, Skeleton, EmptyState, ErrorState, Segmented,
  safeStorage, usePrefersReducedMotion, useAbortableFetch, isAbortError,
} from '../../../src/components/sandbox/paKit';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { useOnlineStatus, OFFLINE_TOAST } from '../../../src/hooks/useOnlineStatus';
import { useModalHistory } from '../../../src/hooks/useModalHistory';
import toolStyles from '../../../src/styles/worlds/PersonalAssistantTools.module.css';
import PersonalAssistantCopyPolicy from '../../../src/components/personal-assistant/PersonalAssistantCopyPolicy';
import InlineHandReplay from '../../../src/components/personal-assistant/InlineHandReplay';
import { TRAINING_LIBRARY } from '../../../src/data/TRAINING_LIBRARY';
import {
  dueQueueAll, reviewStats, leakToDrill, leakToTrainingGame, migrateRecord, resolutionProgress,
  MAX_QUEUE as REVIEW_MAX_QUEUE,
  MAX_INTERVAL_DAYS as REVIEW_MAX_INTERVAL_DAYS,
  RETIRE_AFTER_STRONG as REVIEW_RETIRE_AFTER_STRONG,
} from '../../../src/lib/sandbox/leakReview';
import {
  definedOnly, dueInLabel, fromServerReviewRecord, queueReason, readLocalReviewRecords,
} from '../../../src/lib/personal-assistant/reviewQueuePresentation.mjs';
import {
  PA_ANALYSIS_DEFAULTS,
  classifyFindingHonesty,
  countActivePreferenceOverrides,
  describeAnalysisScope,
  getSafeLocalStorage,
  loadAssistantPreferences,
  resetAssistantPreferences,
  saveAssistantPreferences,
} from '../../../src/lib/personal-assistant/assistantDefaults.mjs';
import {
  buildHandReviewShareUrl,
  buildTableVerificationIndex,
  describeTableVerification,
} from '../../../src/lib/personal-assistant/liveVerificationPresentation.mjs';
import {
  buildAdviceExplanation,
} from '../../../src/lib/personal-assistant/coachingIntelligence.mjs';
import {
  buildLeakTakeaway,
  classifyEvidenceBasis,
} from '../../../src/lib/personal-assistant/leakRecord.js';

const TRAINING_GAME_IDS = TRAINING_LIBRARY.map(game => game.id);

// ═══════════════════════════════════════════════════════════════════════════
// VERIFIED REVIEW DRILL (loaded only after an explicit user action)
// ═══════════════════════════════════════════════════════════════════════════

// The review drill is the existing sandbox drill loop · never a second drill UI.
// It is only ever mounted after a tap, so it stays off the first paint.
const QuickSpotDrill = dynamic(
  () => import('../../../src/components/sandbox/QuickSpotDrill'),
  { ssr: false, loading: () => <DrillSheetSkeleton /> },
);

// Live spot logger + external hand-history import. Mounted only after a tap or ?quickspot=1.
const LiveSpotQuickEntry = dynamic(
  () => import('../../../src/components/personal-assistant/LiveSpotQuickEntry'),
  { ssr: false },
);

const CoachingWorkspace = dynamic(
  () => import('../../../src/components/personal-assistant/CoachingWorkspace'),
  { ssr: false, loading: () => <PanelSkeleton label="Loading Coaching Workspace" /> },
);

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// Demo/simulated leaks come back from the API with string ids like 'demo-1' / 'sim-2'.
// They are not real user_leaks rows, so status updates and hand-example lookups
// must be skipped for them.
function isDemoLeakId(id) {
  return typeof id === 'string' && (id.startsWith('demo-') || id.startsWith('sim-'));
}

/**
 * 2026-08-16: this used to be `cards.filter(Boolean).join(' ')`, which renders
 * "[object Object] [object Object]" the moment an entry is a `{rank, suit}`
 * pair · exactly the shape the engine stores hole cards in · and "6spades
 * Ahearts" when the entry is a long-suit board string.
 *
 * Writes are normalised at the source now (see toCardCode() in
 * pages/api/assistant/leaks/detect.js), so this is defence in depth for the
 * other card sources that feed this page, and for any row written before that
 * fix. Unparseable entries are dropped rather than shown as noise.
 */
const CARD_SUIT_LETTER = { clubs: 'c', diamonds: 'd', hearts: 'h', spades: 's' };

function cardText(card) {
  if (!card) return null;
  if (typeof card === 'object') {
    const rank = String(card.rank ?? '').trim().toUpperCase();
    const suit = CARD_SUIT_LETTER[String(card.suit ?? '').trim().toLowerCase()];
    return rank && suit ? `${rank}${suit}` : null;
  }
  if (typeof card !== 'string') return null;
  const raw = card.trim();
  if (!raw) return null;
  const m = /^([2-9TJQKA]|10)(clubs|diamonds|hearts|spades|[cdhs])$/i.exec(raw);
  if (!m) return raw; // Unknown but non-empty · show it rather than hide it.
  const rank = m[1].toUpperCase() === '10' ? 'T' : m[1].toUpperCase();
  const suitRaw = m[2].toLowerCase();
  return `${rank}${CARD_SUIT_LETTER[suitRaw] || suitRaw}`;
}

function fmtCards(cards) {
  if (Array.isArray(cards)) return cards.map(cardText).filter(Boolean).join(' ') || 'Not Available';
  if (typeof cards === 'string' && cards.trim()) return cards.trim();
  return 'Not Available';
}

const MINI_CARD_SUIT_COLORS = {
  c: '#4DE0A5',
  d: '#56D8FF',
  h: '#FF6B7A',
  s: '#F1F5FC',
};

const MINI_CARD_SUIT_SYMBOLS = {
  c: '♣',
  d: '♦',
  h: '♥',
  s: '♠',
};

function parseMiniCards(cards) {
  const rawTokens = Array.isArray(cards)
    ? cards.map(cardText).filter(Boolean)
    : typeof cards === 'string' && cards.trim()
      ? cards.trim().split(/[\s,]+/).map(cardText).filter(Boolean)
      : [];
  const parsed = [];
  for (const token of rawTokens) {
    const m = /^([2-9TJQKA])([cdhs])$/i.exec(String(token).trim());
    if (!m) continue;
    const rank = m[1].toUpperCase();
    const suit = m[2].toLowerCase();
    parsed.push({ code: `${rank}${suit}`, rank, suit });
  }
  return parsed;
}

function renderMiniCardChips(cards) {
  const parsed = parseMiniCards(cards);
  if (parsed.length === 0) return fmtCards(cards);
  return (
    <span style={styles.miniCardRow} data-pa-verbatim="true">
      {parsed.map((c, idx) => {
        const suitColor = MINI_CARD_SUIT_COLORS[c.suit] || '#F1F5FC';
        const suitSymbol = MINI_CARD_SUIT_SYMBOLS[c.suit] || '';
        return (
          <span
            key={`${c.code}-${idx}`}
            data-mini-card={c.code}
            data-pa-verbatim="true"
            style={{
              ...styles.miniCardChip,
              color: suitColor,
              borderColor: `${suitColor}55`,
            }}
          >
            {`${c.rank}${suitSymbol}`}
          </span>
        );
      })}
    </span>
  );
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function hasPricedEv(leak) {
  if (leak?.evLossBB === null || leak?.evLossBB === undefined) return false;
  const value = Number(leak.evLossBB);
  if (!Number.isFinite(value)) return false;
  // Solver leaks created before matcher v2 stored 0 when the source exposed
  // frequencies but no measured per-action EV. Treat that legacy sentinel as
  // unpriced; a zero must never be presented as a measured loss claim.
  const solverEvidence = ['solver_engine', 'training_solver'].includes(String(leak?.sourceSystem || '').toLowerCase());
  if (solverEvidence && value === 0 && leak?.evLossMeasured !== true) return false;
  return true;
}

/** formatLeakTitle() is lossy, but reversible enough to recover the slug. */
function slugFromTitle(title) {
  if (!title || typeof title !== 'string') return null;
  return title.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Total BB bled by a leak = per-occurrence EV loss x occurrences (priced leaks only). */
function totalBleed(leak) {
  if (!hasPricedEv(leak)) return 0;
  return Math.abs(num(leak?.evLossBB)) * Math.max(0, num(leak?.occurrenceCount));
}

function relativeDate(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM' (the format detect.js writes) -> 'May' ; anything else passes through. */
function shortPointLabel(raw) {
  const s = String(raw ?? '');
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const idx = Number(m[2]) - 1;
    return MONTHS[idx] || s;
  }
  if (s.length > 7) return s.slice(0, 7);
  return s || 'Not Available';
}

/**
 * trend_data can arrive as an array, as a JSON string (text column / proxy
 * serialization) or as junk. Anything that is not a finite {value} row is
 * dropped. This is the guard whose absence white-screened the route.
 */
function coerceTrendPoints(data) {
  let raw = data;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(d => d && typeof d === 'object' && Number.isFinite(Number(d.value)))
    .map((d, i) => ({ date: String(d.date ?? d.label ?? `#${i + 1}`), value: Number(d.value) }));
}

function friendlyDetectionError(err) {
  const msg = String(err || '').trim();
  if (!msg) return 'Leak detection failed. Please try again.';
  if (/unexpected token|<!doctype|json|syntaxerror/i.test(msg)) return 'The server is busy right now. Please try again in a moment.';
  if (/429|too many|rate.?limit/i.test(msg)) return 'You have run detection too many times. Try again in a few minutes.';
  if (/not logged in|unauthor|401|expired|invalid token/i.test(msg)) return 'Your session expired · sign in again to run detection.';
  if (/failed to fetch|network|offline/i.test(msg)) return 'You appear to be offline. Reconnect and try again.';
  return msg;
}

function friendlyLoadError(err) {
  const msg = String(err || '').trim();
  if (/401|unauthor|expired|invalid token/i.test(msg)) return 'Your session expired · sign in again to see your leaks.';
  if (/failed to fetch|network|offline/i.test(msg)) return 'No connection. Check your network and retry.';
  return msg || 'Unknown error';
}

const STATUS_META = {
  persistent: { label: 'Persistent', color: T.danger, soft: T.dangerSoft, Icon: AlertTriangle, tone: 'danger' },
  emerging: { label: 'Emerging', color: T.warn, soft: T.warnSoft, Icon: TrendingUp, tone: 'warn' },
  improving: { label: 'Improving', color: T.success, soft: T.successSoft, Icon: TrendingDown, tone: 'success' },
  resolved: { label: 'Resolved', color: T.textMuted, soft: 'rgba(176,179,184,0.14)', Icon: CheckCircle2, tone: 'neutral' },
};

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.emerging;
}

const CONFIDENCE_META = {
  high: { label: 'High', color: T.accent, level: 3 },
  medium: { label: 'Medium', color: T.warn, level: 2 },
  low: { label: 'Low', color: T.danger, level: 1 },
};

function confidenceMeta(confidence) {
  return CONFIDENCE_META[confidence] || CONFIDENCE_META.medium;
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR BOUNDARY · a recoverable panel instead of a blank route
// ═══════════════════════════════════════════════════════════════════════════

class LeakErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    console.warn('[LeakFinder] render error', err, info);
  }

  reset() {
    this.setState({ err: null });
  }

  render() {
    if (!this.state.err) return this.props.children;
    if (typeof this.props.fallback === 'function') return this.props.fallback(this.state.err, this.reset);
    return <PanelCrash label={this.props.label} error={this.state.err} onRetry={this.reset} />;
  }
}

function PanelCrash({ label, error, onRetry }) {
  return (
    <div style={{ ...card, borderColor: 'rgba(255,107,122,0.4)', background: T.dangerSoft }} role="alert">
      <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginBottom: S.sm }}>
        <AlertTriangle size={18} strokeWidth={2} color={T.danger} aria-hidden="true" />
        <span style={{ fontSize: F.bodySm, fontWeight: 700, color: T.danger }}>
          {label || 'This panel'} Could Not Be Displayed
        </span>
      </div>
      <p style={{ fontSize: F.caption, color: T.textMuted, margin: `0 0 ${S.md}px`, lineHeight: 1.45 }}>
        {String(error?.message || error || 'Unexpected error')}
      </p>
      <button type="button" className="pa-btn" style={btn('secondary')} onClick={onRetry}>
        <RefreshCw size={18} strokeWidth={2} aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

/** Stable loading surface for lazily mounted evidence-backed workspaces. */
function PanelSkeleton({ label = 'Loading' }) {
  return (
    <div style={card} aria-busy="true" aria-label={label}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
        <Skeleton h={16} w="45%" />
        <Skeleton h={44} />
        <Skeleton h={32} w="78%" />
      </div>
    </div>
  );
}

/** Bottom-sheet shaped placeholder while the drill chunk downloads. */
function DrillSheetSkeleton() {
  return (
    <div style={styles.drillLoadingBackdrop} role="status" aria-live="polite" aria-label="Loading Review Drill">
      <div style={styles.drillLoadingSheet}>
        <Skeleton h={16} w="45%" />
        <Skeleton h={6} />
        {[0, 1, 2, 3].map(i => <Skeleton key={i} h={48} />)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REVIEW QUEUE (spaced repetition)
// ═══════════════════════════════════════════════════════════════════════════
// The schedule lives in two places and both can be absent:
//   • the server (GET/POST /api/assistant/leaks/review) · authoritative, but
//     answers persisted:false until the leak_review_state table is migrated;
//   • localStorage, written by QuickSpotDrill after a review run.
// Read-through merges the two with the SERVER WINNING, so a device copy can
// never resurrect a schedule the account has already moved on from.

function ReviewSkeletonCard() {
  return (
    <section className={toolStyles.instrumentPanel} style={{ ...card, marginBottom: S.md }} aria-busy="true" aria-label="Loading Your Review Queue">
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
        <Skeleton h={14} w="40%" />
        <Skeleton h={22} w="70%" />
        <Skeleton h={48} />
      </div>
    </section>
  );
}

/**
 * "Due for review" · the top of the Leaks tab.
 * Every state here is real: a count only appears when something is genuinely
 * due, and an empty queue says when the next one lands instead of inventing a
 * badge to drag the user back.
 */
function ReviewQueueCard({
  loading, error, onRetry, queue, queueTotal, stats, nowMs,
  hasLeaks, isDemo, isDetecting, onStart, onOpenLeak,
}) {
  if (loading) return <ReviewSkeletonCard />;

  const heading = (
    <div style={styles.reviewHeader}>
      <span style={styles.reviewEyebrow}>
        <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
        Due For Review
      </span>
      {num(stats?.streak) > 0 && (
        <span style={{ ...pill('warn'), ...numeric }}>
          <Flame size={12} strokeWidth={2.5} aria-hidden="true" />
          {num(stats.streak)}-Day Streak
        </span>
      )}
    </div>
  );

  const errorNote = error ? (
    <div style={styles.reviewErrorRow} role="status">
      <span style={{ flex: 1, minWidth: 0 }}>
        Your Saved Schedule Could Not Be Loaded · Showing What Is On This Device.
      </span>
      {onRetry && (
        <button type="button" className="pa-btn" style={{ ...btn('ghost'), color: T.accent, padding: '0 10px' }} onClick={onRetry}>
          <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  ) : null;

  // ── nothing to review because there is nothing to review FROM ──────────
  if (!hasLeaks) {
    return (
      <section className={toolStyles.instrumentPanel} style={{ ...card, marginBottom: S.md }} aria-label="Review Queue">
        {heading}
        {/* No button here on purpose: the detection control sits immediately
            below, and two identical buttons a thumb apart reads as a bug. */}
        <p style={{ ...styles.reviewBody, marginBottom: 0 }}>
          {isDetecting
            ? 'Detection is running · anything it finds will be waiting here as a scheduled review.'
            : isDemo
              ? 'Reviews Start On Your Own Hands. Run Leak Detection Above And Each Leak Found Becomes A Scheduled, Repeating Drill.'
              : 'No Review Queue Yet. Run Leak Detection Above And Each Leak Found Becomes A Scheduled, Repeating Drill.'}
        </p>
        {errorNote}
      </section>
    );
  }

  const list = Array.isArray(queue) ? queue : [];
  const top = list.find(e => e && e.drill) || list[0] || null;

  // ── caught up ────────────────────────────────────────────────────────────
  if (!top) {
    const nextLabel = dueInLabel(stats?.nextDueAt, nowMs);
    return (
      <section className={toolStyles.instrumentPanel} style={{ ...card, marginBottom: S.md }} aria-label="Review Queue">
        {heading}
        <p style={styles.reviewCaughtUp}>
          <CheckCircle2 size={18} strokeWidth={2} color={T.success} aria-hidden="true" />
          <span>Nothing Due Right Now.</span>
        </p>
        <p style={styles.reviewBody}>
          {nextLabel
            ? `Your next review is ${nextLabel}. Drilling early is fine · tap any leak below.`
            : 'Practise any leak below and it will start a spaced-repetition schedule.'}
        </p>
        {errorNote}
      </section>
    );
  }

  const leak = top.leak || {};
  const impact = num(top.evImpact);
  const startable = !!top.drill;
  // The unsliced total when the page supplies one; otherwise what we can see.
  const total = Math.max(list.length, Math.floor(num(queueTotal)) || 0);

  return (
    <section className={toolStyles.instrumentPanel} style={{ ...card, marginBottom: S.md }} aria-label="Review Queue">
      {heading}

      {/* `queue` is capped at MAX_QUEUE for the session, but the count states
          the REAL total · exactly ten due leaks must not read as "10+". */}
      <p style={styles.reviewCount}>
        <span style={{ ...numeric, color: T.accent, fontWeight: 800 }}>{total}</span>
        {` ${total === 1 ? 'Leak' : 'Leaks'} Ready To Drill`}
      </p>

      <div style={styles.reviewTop}>
        <button
          type="button"
          className="leak-card pa-btn"
          onClick={() => onOpenLeak && onOpenLeak(leak)}
          style={styles.reviewTopBtn}
          aria-label={`First up: ${leak.title || 'this leak'}. Open details.`}
        >
          <span style={styles.reviewTopLabel}>First Up</span>
          <span style={styles.reviewTopTitle}>{leak.title || 'Your top leak'}</span>
          <span style={styles.reviewTopMeta}>
            <span style={pill(top.isNew ? 'accent' : 'warn')}>
              <Clock size={12} strokeWidth={2} aria-hidden="true" />
              {queueReason(top)}
            </span>
            {impact > 0 && (
              <span style={{ ...styles.reviewTopEv, ...numeric }}>~{impact.toFixed(1)} BB Bled</span>
            )}
          </span>
        </button>
      </div>

      <button
        type="button"
        className="pa-btn"
        style={{ ...btn('primary', { block: true }), minHeight: 48 }}
        onClick={() => onStart && onStart(top)}
      >
        <Target size={18} strokeWidth={2} aria-hidden="true" />
        {startable ? 'Start review' : 'Open hand review'}
      </button>

      <p style={styles.reviewFoot}>
        {startable
          ? (total > 1
            ? `A timed drill on this leak. ${total - 1} more waiting after it.`
            : 'A timed drill on this leak · your score sets the next review date.')
          : 'This leak has no exact drill identity, so this opens the provenance-audited hand-history review instead.'}
      </p>

      {errorNote}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BADGES
// ═══════════════════════════════════════════════════════════════════════════

function LeakStatusBadge({ status }) {
  const meta = statusMeta(status);
  const Icon = meta.Icon;
  return (
    <span style={pill(meta.tone)}>
      <Icon size={12} strokeWidth={2} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function ConfidenceBadge({ confidence }) {
  const meta = confidenceMeta(confidence);
  return (
    <span
      style={{ ...pill('neutral'), color: meta.color, border: `1px solid ${meta.color}55`, background: 'rgba(255,255,255,0.05)' }}
      aria-label={`${meta.label} confidence`}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: i < meta.level ? meta.color : 'rgba(255,255,255,0.18)',
            }}
          />
        ))}
      </span>
      {meta.label} Confidence
    </span>
  );
}

function SourceBadge({ source }) {
  const isTraining = source === 'training_arena' || source === 'training_accountant';
  const isSolver = source === 'solver_engine' || source === 'training_solver';
  return (
    <span style={pill(isTraining || isSolver ? 'accent' : 'purple')}>
      {isTraining || isSolver
        ? <GraduationCap size={12} strokeWidth={2} aria-hidden="true" />
        : <Zap size={12} strokeWidth={2} aria-hidden="true" />}
      {isSolver ? 'Verified Solver' : isTraining ? 'Training Arena' : 'Live Play'}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TREND CHART · responsive SVG, no fixed pixel width, tap-to-read points
// ═══════════════════════════════════════════════════════════════════════════

function isRatioMetricLeak(leakType) {
  const slug = String(leakType || '').trim().toLowerCase();
  return (
    slug === 'passive_postflop'
    || slug === 'over_aggressive_postflop'
    || slug.endsWith('_passive_postflop_facts')
    || slug.endsWith('_over_aggressive_postflop_facts')
  );
}

function TrendStatTiles({ current, optimal, color, isRatio = false }) {
  const fmtStat = (v) => {
    if (!Number.isFinite(v)) return 'Not Available';
    return isRatio ? v.toFixed(2) : `${v.toFixed(0)}%`;
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: S.sm }}>
      <div style={styles.miniTile}>
        <span style={styles.miniTileLabel}>You</span>
        <span style={{ ...styles.miniTileValue, color }}>{fmtStat(current)}</span>
      </div>
      <div style={styles.miniTile}>
        <span style={styles.miniTileLabel}>Optimal</span>
        <span style={{ ...styles.miniTileValue, color: T.success }}>{fmtStat(optimal)}</span>
      </div>
    </div>
  );
}

function TrendChart({ data, optimal, current, status, leakType = null, isRatio: isRatioProp = false }) {
  const points = useMemo(() => coerceTrendPoints(data), [data]);
  const [activeIdx, setActiveIdx] = useState(null);
  const isRatio = Boolean(isRatioProp || isRatioMetricLeak(leakType));

  const meta = statusMeta(status);
  const lineColor = meta.color;
  const optimalVal = Number.isFinite(Number(optimal)) ? Number(optimal) : null;
  const currentVal = Number.isFinite(Number(current)) ? Number(current) : null;

  const deltaPts = (currentVal !== null && optimalVal !== null) ? currentVal - optimalVal : null;

  const header = (
    <div style={styles.trendHeader}>
      <span style={styles.trendHeaderLabel}>{isRatio ? 'Aggression Factor Vs Optimal' : 'Frequency Vs Optimal'}</span>
      {deltaPts !== null && (
        <span style={{ ...pill(meta.tone), ...numeric }}>
          {isRatio
            ? `${Math.abs(deltaPts).toFixed(2)} ${deltaPts >= 0 ? 'above' : 'below'} Optimal`
            : `${Math.abs(deltaPts).toFixed(1)} Pts ${deltaPts >= 0 ? 'above' : 'below'} Optimal`}
        </span>
      )}
    </div>
  );

  if (points.length === 0) {
    return (
      <div>
        {header}
        <div style={styles.trendEmpty}>
          <p style={styles.trendEmptyText}>
            Not Enough History Yet · This Leak Needs At Least Two Detection Runs To Plot A Trend.
          </p>
          <TrendStatTiles current={currentVal} optimal={optimalVal} color={lineColor} isRatio={isRatio} />
        </div>
      </div>
    );
  }

  // ── geometry (viewBox units; the SVG itself is fluid width) ──────────────
  const width = 320;
  const height = 130;
  const padding = { top: 16, right: 14, bottom: 16, left: 14 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const values = points.map(p => p.value);
  const bounds = optimalVal === null ? values : values.concat([optimalVal]);
  const minVal = isRatio
    ? Math.max(0, Math.min(...bounds) - 0.5)
    : Math.max(0, Math.min(...bounds) - 5);
  const maxVal = isRatio
    ? Math.max(minVal + 1, Math.max(...bounds) + 0.5)
    : Math.max(minVal + 5, Math.max(...bounds) + 5);
  const range = (maxVal - minVal) || 1;

  const getY = (val) => padding.top + chartHeight - ((num(val) - minVal) / range) * chartHeight;
  const getX = (index) => (points.length < 2
    ? padding.left + chartWidth / 2
    : padding.left + (index / (points.length - 1)) * chartWidth);

  const coords = points.map((p, i) => `${getX(i).toFixed(2)},${getY(p.value).toFixed(2)}`);
  const linePath = points.length >= 2 ? `M ${coords.join(' L ')}` : null;
  const areaPath = points.length >= 2
    ? `M ${getX(0).toFixed(2)},${(height - padding.bottom).toFixed(2)} L ${coords.join(' L ')} L ${getX(points.length - 1).toFixed(2)},${(height - padding.bottom).toFixed(2)} Z`
    : null;

  const active = activeIdx !== null && points[activeIdx] ? points[activeIdx] : null;

  return (
    <div className="pa-chart-panel" style={{ padding: S.md }}>
      {header}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', width: '100%', height: 'auto', maxWidth: '100%' }}
        role="img"
        aria-label={isRatio
          ? `Aggression factor trend from ${points[0].date} to ${points[points.length - 1].date}. Latest ${points[points.length - 1].value.toFixed(2)}.`
          : `Frequency trend from ${points[0].date} to ${points[points.length - 1].date}. Latest ${points[points.length - 1].value.toFixed(1)} percent.`}
      >
        <defs>
          <linearGradient id={`trend-area-grad-${status || 'emerging'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.34" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map(pct => {
          const y = padding.top + (pct / 100) * chartHeight;
          return (
            <line
              key={pct}
              x1={padding.left} y1={y} x2={width - padding.right} y2={y}
              stroke="rgba(255,255,255,0.08)" strokeDasharray="2,3"
            />
          );
        })}

        {optimalVal !== null && (
          <line
            x1={padding.left} y1={getY(optimalVal)} x2={width - padding.right} y2={getY(optimalVal)}
            stroke={T.success} strokeWidth="2" strokeDasharray="6,4"
          />
        )}

        {areaPath && <path d={areaPath} fill={`url(#trend-area-grad-${status || 'emerging'})`} />}
        {linePath && (
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {points.map((p, i) => {
          const cx = getX(i);
          const cy = getY(p.value);
          const isPointActive = activeIdx === i;
          return (
            <g
              key={`${p.date}-${i}`}
              onClick={() => setActiveIdx(isPointActive ? null : i)}
              style={{ cursor: 'pointer' }}
            >
              {isPointActive && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={11}
                  fill="none"
                  stroke={lineColor}
                  strokeOpacity="0.36"
                  strokeWidth="3"
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isPointActive ? 7 : 5}
                fill={isPointActive ? '#FFFFFF' : lineColor}
                stroke={lineColor}
                strokeWidth="2"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIdx(isPointActive ? null : i);
                }}
                style={{ cursor: 'pointer' }}
              />
            </g>
          );
        })}
      </svg>

      {/* Axis + scale info as HTML so font sizes stay in CSS pixels */}
      <div style={styles.trendScaleRow}>
        <span style={styles.trendScaleText}>
          {isRatio
            ? `Range ${minVal.toFixed(1)}-${maxVal.toFixed(1)}`
            : `Range ${minVal.toFixed(0)}%-${maxVal.toFixed(0)}%`}
        </span>
        {optimalVal !== null && (
          <span style={styles.trendScaleText}>
            <span aria-hidden="true" style={{ display: 'inline-block', width: 14, borderTop: `2px dashed ${T.success}`, marginRight: 6, verticalAlign: 'middle' }} />
            {isRatio ? `Optimal ${optimalVal.toFixed(2)}` : `Optimal ${optimalVal.toFixed(0)}%`}
          </span>
        )}
      </div>

      {/* Tap-to-read points (no hover-only information) */}
      <div style={styles.trendPointRow} data-hscroll="true" role="group" aria-label="Trend Data Points">
        {points.map((p, i) => (
          <button
            key={`btn-${p.date}-${i}`}
            type="button"
            className="pa-btn"
            aria-pressed={activeIdx === i}
            onClick={() => setActiveIdx(activeIdx === i ? null : i)}
            style={{
              ...styles.trendPointBtn,
              borderColor: activeIdx === i ? lineColor : T.border,
              background: activeIdx === i ? `${lineColor}22` : T.surface2,
            }}
          >
            <span style={styles.trendPointValue}>{isRatio ? p.value.toFixed(2) : `${p.value.toFixed(0)}%`}</span>
            <span style={styles.trendPointDate}>{shortPointLabel(p.date)}</span>
          </button>
        ))}
      </div>

      <p style={styles.trendCaption} aria-live="polite">
        {active
          ? (isRatio
              ? `${active.date}: your aggression factor was ${active.value.toFixed(2)}${optimalVal !== null ? ` (optimal ${optimalVal.toFixed(2)})` : ''}.`
              : `${active.date}: you played this spot at ${active.value.toFixed(1)}%${optimalVal !== null ? ` (optimal ${optimalVal.toFixed(0)}%)` : ''}.`)
          : points.length < 2
            ? 'Only one detection run so far · run detection again to see a trend line.'
            : 'Tap a point to read that period.'}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BLEED SUMMARY · EV-ranked headline + stacked attribution bar
// ═══════════════════════════════════════════════════════════════════════════

function BleedSummary({ leaks, isDemo }) {
  const items = useMemo(() => (
    leaks
      .map(l => ({ id: l.id, title: l.title, bb: totalBleed(l), status: l.status }))
      .filter(i => i.bb > 0)
      .sort((a, b) => b.bb - a.bb)
  ), [leaks]);

  const total = items.reduce((s, i) => s + i.bb, 0);
  if (!total) return null;

  const top = items.slice(0, 4);
  const restBb = total - top.reduce((s, i) => s + i.bb, 0);

  return (
    <section className={toolStyles.instrumentPanel} style={{ ...card, marginBottom: S.md }} aria-label="EV Bleed Summary">
      <h2 style={styles.bleedHeadline}>
        {isDemo ? 'Sample Data: ' : 'You Are Bleeding '}
        <span style={{ ...numeric, color: T.danger, fontWeight: 800 }}>~{total.toFixed(1)} BB</span>
        {` Across ${leaks.length} Active ${leaks.length === 1 ? 'Leak' : 'Leaks'}`}
      </h2>
      <p style={styles.bleedSub}>Ranked By Total EV Lost (Per-Occurrence Loss X Occurrences).</p>

      <div style={styles.bleedBar} aria-hidden="true">
        {top.map(i => (
          <div
            key={i.id}
            style={{
              width: `${Math.max(4, (i.bb / total) * 100)}%`,
              background: statusMeta(i.status).color,
              height: '100%',
            }}
          />
        ))}
        {restBb > 0.001 && (
          <div style={{ flex: 1, background: T.surface3, height: '100%' }} />
        )}
      </div>

      <ul style={styles.bleedLegend}>
        {top.slice(0, 3).map(i => (
          <li key={i.id} style={styles.bleedLegendRow}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: statusMeta(i.status).color, flexShrink: 0 }} />
            <span style={styles.bleedLegendTitle}>{i.title}</span>
            <span style={styles.bleedLegendValue}>{((i.bb / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// A scan receipt is deliberately separate from the success toast. It gives the
// player durable proof of what the engine imported and what the shared solver
// could actually verify without turning unpriced spots into invented EV.
function AuditReceipt({ result }) {
  if (!result) return null;
  const sync = result.clubArenaSync || {};
  const progress = result.auditProgress || {};
  const coverage = result.evidenceCoverage || {};
  const job = result.auditJob || {};
  const reconciliation = result.reconciliation || job.reconciliation || {};
  const sources = result.evidenceSources || {};
  const audited = num(progress.decisionsAnalyzed ?? coverage.auditedThisRun);
  const verified = num(progress.solverVerified ?? coverage.verifiedThisRun);
  const verificationLabel = audited > 0
    ? `${verified} / ${audited}`
    : `${num(coverage.verifiedDecisions).toLocaleString()} Total`;
  const cells = [
    ['Club Hands Scanned', num(progress.handsScanned ?? sync.handsFound).toLocaleString()],
    ['Eligible Hands', num(progress.handsEligible ?? sync.handsEligible).toLocaleString()],
    ['Private Hands Recovered', num(progress.privateCardsRecovered ?? sync.privateCardsRecovered).toLocaleString()],
    ['Missing Private Cards', num(progress.handsMissingPrivateCards ?? sync.handsMissingPrivateCards).toLocaleString()],
    ['Unsupported Or Incomplete Hands', num(progress.handsRejectedBeforeAudit ?? sync.handsRejectedBeforeAudit).toLocaleString()],
    ['No Hero Decision', num(progress.handsSkippedNoHeroDecisions ?? sync.handsSkippedNoHeroDecisions).toLocaleString()],
    ['Audited This Run', num(progress.handsAudited ?? sync.handsAudited).toLocaleString()],
    ['Already Current', num(progress.handsAlreadyCurrent ?? sync.handsAlreadyCurrent).toLocaleString()],
    ['Retried For Coverage', num(progress.handsQueuedForRetry ?? sync.handsQueuedForRetry).toLocaleString()],
    ['Verified Decisions', verificationLabel],
    ['Unpriced Decisions', num(progress.unpriced ?? coverage.unpricedThisRun).toLocaleString()],
    ['Leaks Found', num(result.leaksDetected).toLocaleString()],
    ['Batches Saved', num(progress.batchesCompleted).toLocaleString()],
    ['Server Processing', progress.totalProcessingMs ? `${(num(progress.totalProcessingMs) / 1000).toFixed(1)}s` : 'Not Available'],
  ];

  return (
    <section className={toolStyles.auditReceipt} aria-labelledby="audit-receipt-title">
      <div className={toolStyles.auditReceiptHeader}>
        <span className={toolStyles.auditReceiptSeal} aria-hidden="true">
          {sync.available === false || sync.persisted === false || result.persisted === false
            ? <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
            : <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" />}
        </span>
        <span>
          <strong id="audit-receipt-title">Deterministic Audit Receipt</strong>
          <span>
            {job.status === 'queued' || job.status === 'running'
              ? `Server Audit ${String(job.stage || 'running').replaceAll('_', ' ')}. This Checkpoint Is Safe Across Reloads And Devices.`
              : job.status === 'failed'
                ? 'The Audit Stopped Safely. Restarting Will Resume From Its Saved Checkpoint.'
              : sync.available === false
              ? 'Club Arena Could Not Be Read During This Scan.'
              : sync.persisted === false
                ? 'The Hand Audit Completed, But Its Decision Evidence Could Not Be Saved.'
              : result.persisted === false
                ? 'The Scan Completed, But Its Findings Could Not Be Saved.'
                : 'Club Arena Import, Shared Solver Matching, And Leak Persistence Completed.'}
          </span>
        </span>
      </div>

      <dl className={toolStyles.auditReceiptGrid}>
        {cells.map(([label, value]) => (
          <div key={label} className={toolStyles.auditReceiptCell}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className={toolStyles.auditSourceRail} aria-label="Evidence Source Status">
        <span data-ready={sources.livePlay === true}>Live Hand Statistics</span>
        <span data-ready={sources.trainingSolver === true}>Training Solver</span>
        <span data-ready={sources.handAudit === true}>Hand Audit Store</span>
        <span data-ready={sources.clubArena === true}>Club Arena</span>
      </div>
      {progress.coverage && (
        <p className={toolStyles.auditReceiptNote}>
          Coverage Funnel · {num(progress.coverage.scanned).toLocaleString()} Scanned → {num(progress.coverage.eligible).toLocaleString()} Eligible → {num(progress.coverage.privateCardsAvailable).toLocaleString()} Private Cards Available → {num(progress.coverage.heroDecisions).toLocaleString()} Hero Decisions → {num(progress.coverage.exactSolverMatches).toLocaleString()} Exact Solver Matches → {num(progress.coverage.unpriced).toLocaleString()} Unpriced → {num(progress.coverage.leaks).toLocaleString()} Leaks
        </p>
      )}
      {(result.caHandFactsSummary || progress.caHandFactsSummary) && (() => {
        const facts = result.caHandFactsSummary || progress.caHandFactsSummary;
        const stacks = facts.tournamentByStack || {};
        return (
          <p className={toolStyles.auditReceiptNote}>
            Format Coverage · {num(facts.cashHands).toLocaleString()} Cash NLH Hands · {num(facts.tournamentHands).toLocaleString()} Tournament NLH Hands ({num(stacks.short).toLocaleString()} Short, {num(stacks.mid).toLocaleString()} Mid, {num(stacks.deep).toLocaleString()} Deep)
            {num(facts.excludedUnsupportedHands) > 0 ? ` · ${num(facts.excludedUnsupportedHands).toLocaleString()} Non-NLH Excluded` : ''}
          </p>
        );
      })()}
      {(sync.incrementalStop === true || progress.incrementalStop === true) && (
        <p className={toolStyles.auditReceiptNote} data-tone="success">
          Incremental Watermark Sync · Stopped At Previously Audited Hands. Use Full Re-Audit To Re-Check Older History.
        </p>
      )}
      {result.evidencePartial && (
        <p className={toolStyles.auditReceiptNote} data-tone="warn">
          Historical Evidence Coverage Is Partial. Unverified Or Missing Canonical Training Rows Were Excluded; Club Arena Findings And Saved Leak Records Still Reconciled Independently.
        </p>
      )}
      {reconciliation.checkedAt && (
        <p className={toolStyles.auditReceiptNote} data-tone={reconciliation.consistent ? 'success' : 'warn'}>
          Reconciliation {reconciliation.consistent ? 'Passed' : 'Needs Review'} · {num(reconciliation.persistedDecisions).toLocaleString()} Persisted Decisions · Last Checked {new Date(reconciliation.checkedAt).toLocaleString()}
        </p>
      )}
      {num(coverage.unpricedThisRun) > 0 && (
        <p className={toolStyles.auditReceiptNote}>
          Unpriced Decisions Stay Excluded From EV Claims And Will Be Retried After The Solver Cache Refresh Window.
        </p>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAK CARD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compact fix-progress row shared by the card list. Derived entirely from
 * graded drill sessions (resolutionProgress) · renders nothing until the leak
 * has actually been drilled, so a bar can never claim progress that was not
 * earned.
 */
function progressTone(progress) {
  if (!progress) return T.accent;
  if (progress.retired) return T.success;
  if (progress.trend === 'slipping') return T.warn;
  return T.accent;
}

function progressLabel(progress) {
  if (!progress || !progress.started) return null;
  if (progress.retired) return 'Mastered';
  const trendWord = progress.trend === 'improving' ? ' · improving'
    : progress.trend === 'slipping' ? ' · slipping'
      : progress.trend === 'steady' ? ' · holding'
        : '';
  return `Fix progress ${progress.percent}%${trendWord}`;
}

function LeakCardProgress({ progress }) {
  if (!progress || !progress.started) return null;
  const tone = progressTone(progress);
  const ratio = Math.max(0, Math.min(100, num(progress.percent))) / 100;
  return (
    <span style={styles.leakCardProgress}>
      <span
        style={styles.progressTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label={`Fix progress ${progress.percent} percent`}
      >
        <span
          className="leak-progress-fill"
          style={{ ...styles.progressFill, transform: `scaleX(${ratio})`, background: tone }}
        />
      </span>
      <span style={{ ...styles.leakCardProgressLabel, color: progress.retired ? T.success : T.textMuted }}>
        {progressLabel(progress)}
      </span>
    </span>
  );
}

/**
 * Live-play proof badge. "Verified Fixed Live" renders ONLY for confirmed_fixed_at_tables;
 * drill mastery alone never produces it. Spans only, so it is valid inside a <button>.
 */
function TableVerificationBadges({ verification, showDelta = true }) {
  const view = describeTableVerification(verification);
  if (!view) return null;
  return (
    <>
      <span style={pill(view.tone)} data-table-verification={view.kind}>{view.label}</span>
      {showDelta && view.delta && (
        <span style={{ ...pill('neutral'), fontVariantNumeric: 'tabular-nums' }}>{view.delta}</span>
      )}
    </>
  );
}

const shareCheckRow = {
  display: 'flex',
  alignItems: 'center',
  gap: S.sm,
  minHeight: 44,
  color: T.text,
  fontSize: F.bodySm,
  cursor: 'pointer',
};

/**
 * Read-only hand review link. Villain names are never placed in the URL, hole cards only when
 * the player ticks the box, and the link never points at the retired /sandbox/[id] route.
 */
function ShareReviewControl({ hand }) {
  const [anonymize, setAnonymize] = useState(true);
  const [includeHole, setIncludeHole] = useState(false);

  const share = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const url = buildHandReviewShareUrl({
      origin: window.location.origin,
      ...hand,
      anonymize,
      includeHoleCards: includeHole,
    });
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success('Review Link Copied');
        return;
      }
    } catch (e) {
      /* fall through to the share sheet */
    }
    try {
      if (navigator?.share) {
        await navigator.share({ title: 'Poker Hand Review', url });
        return;
      }
    } catch (e) {
      return; // dismissed
    }
    toast(
      <span>
        Copy This Link: <span data-pa-verbatim="true">{url}</span>
      </span>,
    );
  }, [hand, anonymize, includeHole]);

  return (
    <details className="pa-disclosure" data-share-review="true">
      <summary>
        <span>Share Review</span>
        <small style={{ fontSize: 12 }}>Read-Only Link</small>
      </summary>
      <div className="pa-disclosure-body" style={{ display: 'grid', gap: S.xs }}>
        <label style={shareCheckRow}>
          <input
            type="checkbox"
            checked={anonymize}
            onChange={(event) => setAnonymize(event.target.checked)}
            style={{ width: 22, height: 22, flex: '0 0 22px', accentColor: '#087cfa' }}
          />
          <span>Anonymize Villain Names</span>
        </label>
        <label style={shareCheckRow}>
          <input
            type="checkbox"
            checked={includeHole}
            onChange={(event) => setIncludeHole(event.target.checked)}
            style={{ width: 22, height: 22, flex: '0 0 22px', accentColor: '#087cfa' }}
          />
          <span>Include My Hole Cards</span>
        </label>
        {includeHole && (
          <p style={{ margin: 0, color: T.warn, fontSize: F.caption, lineHeight: 1.45 }}>
            Anyone With This Link Will See Your Hole Cards.
          </p>
        )}
        <button type="button" className="pa-btn" style={btn('secondary', { block: true })} onClick={share}>
          Copy Review Link
        </button>
      </div>
    </details>
  );
}

const EVIDENCE_BASIS_META = {
  exact_solver_match: { label: 'Exact Solver Match', tone: 'accent' },
  chart: { label: 'Chart', tone: 'purple' },
  deterministic_rule: { label: 'Deterministic Rule', tone: 'warn' },
  general_coaching: { label: 'General Coaching', tone: 'neutral' },
};

function evidenceBasisMeta(basis) {
  const key = String(basis || '').trim().toLowerCase();
  return {
    key: EVIDENCE_BASIS_META[key] ? key : 'general_coaching',
    ...(EVIDENCE_BASIS_META[key] || EVIDENCE_BASIS_META.general_coaching),
  };
}

function titleCaseTokens(value) {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

function LeakCard({
  leak,
  onOpen,
  onReview,
  onPractice,
  onOpenOverflow,
  onClaimReward,
  rewardClaimed = false,
  claimingReward = false,
  isDue = false,
  selected,
  demo,
  progress,
}) {
  const priced = hasPricedEv(leak);
  const ev = priced ? Math.abs(Number(leak.evLossBB)) : 0;
  const occ = Math.max(0, num(leak.occurrenceCount));
  const total = ev * occ;
  const lowConfidence = leak.confidence === 'low';
  const honesty = classifyFindingHonesty(leak, progress);
  const advice = useMemo(
    () => leak?.adviceExplanation || buildAdviceExplanation(leak, [], TRAINING_GAME_IDS),
    [leak],
  );
  const takeaway = leak?.takeaway || advice?.takeaway || buildLeakTakeaway(leak);
  const basis = evidenceBasisMeta(leak?.evidenceBasis || advice?.evidenceBasis || classifyEvidenceBasis(leak));
  const repHand = leak?.representativeHand || advice?.representativeHand || {};
  const sampleCounts = leak?.sampleCounts || advice?.sampleCounts || {};
  const opportunities = Math.max(occ, num(sampleCounts.opportunities || leak?.totalSamples));
  const mistakes = num(sampleCounts.mistakes || occ);
  const isVerifiedFixed = leak?.tableVerification?.status === 'confirmed_fixed_at_tables';

  const repNoteParts = [
    repHand.street ? titleCaseTokens(repHand.street) : null,
    repHand.heroPosition || null,
    repHand.playerAction ? `You: ${titleCaseTokens(repHand.playerAction)}` : null,
    repHand.solverVerified && repHand.solverAction ? `Solver: ${titleCaseTokens(repHand.solverAction)}` : null,
    repHand.priceOrSizing ? titleCaseTokens(repHand.priceOrSizing) : null,
    repHand.handId ? `Hand ${String(repHand.handId).slice(0, 8)}` : null,
  ].filter(Boolean);

  const primaryLabel = (isVerifiedFixed && !rewardClaimed && onClaimReward)
    ? (claimingReward ? 'Claiming…' : 'Claim 25 Diamonds')
    : isDue
      ? 'Drill Now'
      : onPractice
        ? 'Practice This'
        : 'Review Hand';

  const handlePrimaryClick = () => {
    if (isVerifiedFixed && !rewardClaimed && onClaimReward) {
      onClaimReward(leak);
      return;
    }
    if (onPractice) {
      onPractice(leak);
      return;
    }
    if (onReview) {
      onReview(leak);
      return;
    }
    onOpen?.(leak);
  };

  return (
    <li
      role="listitem"
      style={{
        ...styles.leakCard,
        ...(selected ? styles.leakCardSelected : null),
        ...(demo ? styles.leakCardDemo : null),
      }}
    >
      <button
        type="button"
        className="leak-card pa-btn"
        onClick={() => onOpen(leak)}
        aria-label={`${leak.title}. ${basis.label}. ${honesty.label}. ${priced ? `${ev.toFixed(2)} BB lost per occurrence` : 'EV unpriced'} over ${occ} spots. Open details.`}
        style={styles.leakCardBody}
      >
        <span style={styles.leakCardHeader}>
          <span style={styles.leakCardTitle}>{leak.title}</span>
          <span style={pill(basis.tone)} data-evidence-basis={basis.key}>{basis.label}</span>
        </span>

        {/* Rule of 1+1: plain-English finding first */}
        <span style={styles.leakCardFinding}>
          {takeaway?.whatYouAreDoing || leak.explanation || leak.situationClass || honesty.detail}
        </span>

        {/* Representative hand & context note */}
        <span style={styles.leakCardSituation}>
          {repNoteParts.length > 0
            ? `Representative Spot: ${repNoteParts.join(' · ')}`
            : (leak.situationClass || honesty.detail)}
        </span>

        <span style={styles.leakCardMetrics}>
          <span style={styles.leakCardEv}>{priced ? `-${ev.toFixed(2)} BB` : 'Unpriced'}</span>
          <span style={styles.leakCardMetricDim}>{priced ? 'Per Spot' : 'No EV Claim'}</span>
          <span style={styles.leakCardMetricDim}>
            {`${mistakes} ${mistakes === 1 ? 'Mistake' : 'Mistakes'} / ${opportunities} ${opportunities === 1 ? 'Spot' : 'Spots'}`}
          </span>
          <span style={styles.leakCardMetricStrong}>{priced ? `~${total.toFixed(1)} BB Total` : 'Training Signal'}</span>
        </span>

        <LeakCardProgress progress={progress} />

        <span style={styles.leakCardBadges}>
          <span style={pill(honesty.tone)}>{honesty.label}</span>
          <TableVerificationBadges verification={leak.tableVerification} />
          <LeakStatusBadge status={leak.status} />
          {leak.sourceSystem && <SourceBadge source={leak.sourceSystem} />}
          <ConfidenceBadge confidence={leak.confidence} />
        </span>

        {lowConfidence && (
          <span style={styles.leakCardHint}>
            <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
            Small Sample · Needs More Hands Before This Is Conclusive.
          </span>
        )}
      </button>

      {(onPractice || onReview || onOpenOverflow) && (
        <div style={styles.onePlusOneBar}>
          <button
            type="button"
            className="pa-btn"
            disabled={claimingReward}
            onClick={handlePrimaryClick}
            style={{ ...btn('primary'), flex: '1 1 auto', minWidth: 0, minHeight: 44 }}
          >
            <Target size={16} strokeWidth={2} aria-hidden="true" />
            <span>{primaryLabel}</span>
          </button>
          {onOpenOverflow && (
            <button
              type="button"
              className="pa-btn"
              aria-label={`More Actions For ${leak.title}`}
              onClick={() => onOpenOverflow(leak)}
              style={styles.overflowIconBtn}
            >
              <MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAK DETAIL (rendered inside the bottom sheet)
// ═══════════════════════════════════════════════════════════════════════════

function StatTile({ label, value, tone }) {
  return (
    <div style={styles.statTile}>
      <span style={styles.statTileLabel}>{label}</span>
      <span style={{ ...styles.statTileValue, color: tone || T.text }}>{value}</span>
    </div>
  );
}

function AutoGuidanceToggle({ value, onChange }) {
  return (
    <button
      type="button"
      className="pa-btn"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={styles.guidanceRow}
    >
      <span style={{ minWidth: 0, textAlign: 'left', flex: 1 }}>
        <span style={styles.guidanceTitle}>Auto Guidance {value ? 'ON' : 'OFF'}</span>
        <span style={styles.guidanceBody}>
          {value ? 'Highlighting the top suggested fix automatically.' : 'Suggesting one fix at a time.'}
        </span>
      </span>
      <span aria-hidden="true" className="leak-switch-track" style={{ ...styles.switchTrack, background: value ? T.accent : T.surface3 }}>
        <span className="leak-switch-knob" style={{ ...styles.switchKnob, transform: value ? 'translateX(18px)' : 'translateX(0)' }} />
      </span>
    </button>
  );
}

const BAND_COLOR = {
  strong: T.success,
  pass: T.accent,
  shaky: T.warn,
  fail: T.danger,
};

const STAGE_COPY = {
  'not-started': 'No drills yet. Your first review sets the baseline.',
  early: 'Early days · each passed drill pushes the next review further out.',
  'on-track': 'On track. Keep passing reviews and the gap between them keeps growing.',
  'nearly-there': 'Nearly there · a few more strong sessions at the long interval retires this leak.',
  mastered: 'Mastered. This leak stays quiet unless detection sees it again in your real hands.',
};

/**
 * "Progress to resolution" · the leak visibly closing as it gets drilled.
 * Everything shown is read from the graded review record (session history,
 * interval, strong streak); nothing is estimated.
 */
function ResolutionProgressSection({ record }) {
  const progress = resolutionProgress(record);
  const rec = record ? migrateRecord(record) : null;
  const tone = progressTone(progress);

  const history = rec && Array.isArray(rec.history) ? rec.history : [];
  const lastDrill = rec && rec.lastReviewedAt ? relativeDate(rec.lastReviewedAt) : null;

  let nextDue = null;
  if (rec && !progress.retired && rec.dueAt) {
    const dueMs = new Date(rec.dueAt).getTime();
    if (!Number.isNaN(dueMs)) {
      nextDue = dueMs <= Date.now()
        ? 'due now'
        : new Date(dueMs).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }
  }

  return (
    <section style={styles.detailSection} aria-label="Progress To Resolution">
      <h3 style={styles.detailSectionTitle}>Progress To Resolution</h3>

      <div style={styles.progressHeaderRow}>
        <span style={{ ...styles.progressPercent, ...numeric, color: tone }}>
          {progress.retired ? 'Mastered' : `${progress.percent}%`}
        </span>
        {progress.trend && !progress.retired && (
          <span style={{ ...styles.progressTrend, color: progress.trend === 'slipping' ? T.warn : T.textMuted }}>
            {progress.trend === 'improving' ? 'Improving' : progress.trend === 'slipping' ? 'Slipping' : 'Holding steady'}
          </span>
        )}
      </div>

      <span
        style={{ ...styles.progressTrack, height: 8 }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label={`Progress to resolution: ${progress.percent} percent`}
      >
        <span
          className="leak-progress-fill"
          style={{
            ...styles.progressFill,
            transform: `scaleX(${Math.max(0, Math.min(100, num(progress.percent))) / 100})`,
            background: tone,
          }}
        />
      </span>

      <p style={styles.progressStageCopy}>{STAGE_COPY[progress.stage] || STAGE_COPY['not-started']}</p>

      {progress.started && rec && (
        <>
          <div style={styles.statTileGrid}>
            <StatTile label="Drills done" value={String(progress.sessions)} />
            <StatTile
              label="Strong streak"
              value={`${Math.min(rec.strongStreak, REVIEW_RETIRE_AFTER_STRONG)}/${REVIEW_RETIRE_AFTER_STRONG}`}
              tone={rec.strongStreak > 0 ? T.success : undefined}
            />
            <StatTile
              label="Review gap"
              value={`${rec.intervalDays}d / ${REVIEW_MAX_INTERVAL_DAYS}d`}
            />
          </div>

          {history.length > 0 && (
            <div style={styles.progressHistoryWrap} aria-label={`Last ${history.length} drill sessions`}>
              <div style={styles.progressHistoryStrip}>
                {history.map((h, i) => {
                  const score = Math.max(0, Math.min(1, Number(h?.score) || 0));
                  return (
                    <span
                      key={`${h?.at || 'session'}-${i}`}
                      title={`${Math.round(score * 100)}% ${h?.band || ''}`.trim()}
                      style={{
                        ...styles.progressHistoryBar,
                        height: `${Math.max(12, Math.round(score * 100))}%`,
                        background: BAND_COLOR[h?.band] || T.surface3,
                      }}
                    />
                  );
                })}
              </div>
              <span style={styles.progressHistoryCaption}>
                Session Accuracy, Oldest To Newest
                {rec.lapses > 0 ? ` · ${rec.lapses} reset${rec.lapses === 1 ? '' : 's'}` : ''}
              </span>
            </div>
          )}

          {(lastDrill || nextDue) && (
            <p style={styles.progressMetaLine}>
              {lastDrill ? `Last drill ${lastDrill}` : null}
              {lastDrill && nextDue ? ' · ' : null}
              {nextDue ? `Next review ${nextDue}` : null}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function LeakDetail({
  leak, onOpenHandReview, onReviewExample, onStartReview, onTrainDrills,
  onMarkResolved, onReopen, isResolving, reviewRecord,
}) {
  const isDemoLeak = isDemoLeakId(leak?.id);
  const {
    examples: rawExamples,
    isLoading: examplesLoading,
    error: examplesError,
    refetch: refetchExamples,
  } = useLeakHandExamples(leak && !isDemoLeak ? leak.id : null);

  const examples = Array.isArray(rawExamples) ? rawExamples : [];

  const [autoGuidance, setAutoGuidance] = useState(false);
  useEffect(() => {
    setAutoGuidance(safeStorage.get('pa-auto-guidance') === 'true');
  }, []);
  const toggleAutoGuidance = useCallback((next) => {
    setAutoGuidance(next);
    safeStorage.set('pa-auto-guidance', String(next));
  }, []);

  if (!leak) return null;

  const drill = leak.recommendedDrill || null;
  const exactTrainingGame = leakToTrainingGame(leak, TRAINING_GAME_IDS);
  const situation = leak.situationClass || 'these';
  const priced = hasPricedEv(leak);
  const ev = priced ? Math.abs(Number(leak.evLossBB)) : 0;
  const occ = Math.max(0, num(leak.occurrenceCount));

  const handReviewCopy = `Upload The Original Hand History To Reconstruct ${situation} With Its Real Action, Stacks, And Board. No Query-Authored Scenario Or Unsealed Grade Is Created.`;
  const trainingCopy = drill
    ? exactTrainingGame
      ? `Open The Exact ${exactTrainingGame} Training Game That Produced This Solver Signal.`
      : `Browse Training Games Related To ${situation} Without Pretending An Exact Game Match Exists.`
    : `Browse Training Games Related To ${situation} Without Pretending An Exact Game Match Exists.`;

  const resolvedWhen = relativeDate(leak.resolvedAt);
  const trackingSince = relativeDate(leak.firstDetected);
  const detailHonesty = classifyFindingHonesty(leak, {
    retired: Boolean(
      reviewRecord?.retired
      || reviewRecord?.lastOutcome?.remediationMastered
      || reviewRecord?.remediationMastered
      || leak.remediationMastered,
    ),
  });
  const detailAdvice = leak.adviceExplanation || buildAdviceExplanation(leak, [], TRAINING_GAME_IDS);
  const detailTakeaway = leak.takeaway || detailAdvice?.takeaway || buildLeakTakeaway(leak);
  const detailBasis = evidenceBasisMeta(leak.evidenceBasis || detailAdvice?.evidenceBasis || classifyEvidenceBasis(leak));
  const detailRepHand = leak.representativeHand || detailAdvice?.representativeHand || {};
  const detailSamples = leak.sampleCounts || detailAdvice?.sampleCounts || {};
  const detailOpportunities = Math.max(occ, num(detailSamples.opportunities || leak.totalSamples));
  const detailMistakes = num(detailSamples.mistakes || occ);

  return (
    <div>
      {/* Badges */}
      <div style={styles.detailBadges}>
        <span style={pill(detailBasis.tone)} data-evidence-basis={detailBasis.key}>
          {detailBasis.label}
        </span>
        <LeakStatusBadge status={leak.status} />
        {leak.sourceSystem && <SourceBadge source={leak.sourceSystem} />}
        <ConfidenceBadge confidence={leak.confidence} />
        <span style={pill(detailHonesty.tone)} title={detailHonesty.detail}>
          {detailHonesty.label}
        </span>
        <TableVerificationBadges verification={leak.tableVerification} />
      </div>

      {(trackingSince || resolvedWhen) && (
        <p style={styles.detailMetaLine}>
          {leak.status === 'resolved' && resolvedWhen ? `Resolved ${resolvedWhen}` : null}
          {leak.status === 'resolved' && resolvedWhen && trackingSince ? ' · ' : null}
          {trackingSince ? `Tracking since ${trackingSince}` : null}
        </p>
      )}

      {/* Inspectable Finding & Evidence Basis Summary */}
      <section style={styles.detailSection} aria-label="Finding And Evidence Basis" data-testid="leak-detail-evidence-summary">
        <h3 style={styles.detailSectionTitle}>Finding &amp; Evidence Basis</h3>
        <p style={{ ...styles.detailBody, color: T.text, fontWeight: 600, marginBottom: S.xs }}>
          {detailTakeaway?.whatYouAreDoing || leak.explanation || 'Recurring strategic deviation detected.'}
        </p>
        {detailTakeaway?.whatToDoNextTime && (
          <p style={{ ...styles.detailBody, marginBottom: S.sm }}>
            Next Time: {detailTakeaway.whatToDoNextTime}
          </p>
        )}
        <dl style={styles.evidenceSummaryGrid}>
          <div style={styles.evidenceSummaryRow}>
            <dt style={styles.evidenceSummaryLabel}>Evidence Basis</dt>
            <dd style={styles.evidenceSummaryValue}>
              {detailBasis.label} (<span data-pa-verbatim="true">{detailBasis.key}</span>)
            </dd>
          </div>
          <div style={styles.evidenceSummaryRow}>
            <dt style={styles.evidenceSummaryLabel}>Street &amp; Position</dt>
            <dd style={styles.evidenceSummaryValue}>
              {titleCaseTokens(detailRepHand.street || (['preflop', 'flop', 'turn', 'river'].includes(String(leak.leakCategory || '').toLowerCase()) ? leak.leakCategory : 'All Streets'))} · {detailRepHand.heroPosition || 'All Positions'}
            </dd>
          </div>
          <div style={styles.evidenceSummaryRow}>
            <dt style={styles.evidenceSummaryLabel}>Decision</dt>
            <dd style={styles.evidenceSummaryValue}>
              {detailRepHand.playerAction ? `Played ${titleCaseTokens(detailRepHand.playerAction)}` : 'Pattern Aggregate'}
              {detailRepHand.solverVerified && detailRepHand.solverAction ? ` · Optimal ${titleCaseTokens(detailRepHand.solverAction)}` : ''}
            </dd>
          </div>
          <div style={styles.evidenceSummaryRow}>
            <dt style={styles.evidenceSummaryLabel}>Price Or Sizing</dt>
            <dd style={styles.evidenceSummaryValue}>
              {titleCaseTokens(detailRepHand.priceOrSizing || detailRepHand.spotType || 'General')}
            </dd>
          </div>
          <div style={styles.evidenceSummaryRow}>
            <dt style={styles.evidenceSummaryLabel}>Sample &amp; Opportunities</dt>
            <dd style={styles.evidenceSummaryValue}>
              {`${detailMistakes} ${detailMistakes === 1 ? 'Mistake' : 'Mistakes'} / ${detailOpportunities} Eligible ${detailOpportunities === 1 ? 'Spot' : 'Spots'}${detailSamples.minRequiredSamples ? ` (Min ${detailSamples.minRequiredSamples})` : ''}`}
            </dd>
          </div>
          {detailRepHand.handId && (
            <div style={styles.evidenceSummaryRow}>
              <dt style={styles.evidenceSummaryLabel}>Representative Hand</dt>
              <dd style={styles.evidenceSummaryValue} data-pa-verbatim="true">{detailRepHand.handId}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Stat tiles */}
      <div style={styles.statTileGrid}>
        <StatTile label="EV / spot" value={priced ? `-${ev.toFixed(2)}` : 'Unpriced'} tone={priced ? T.danger : T.textMuted} />
        <StatTile label="Occurrences" value={String(occ)} />
        <StatTile label="Total BB lost" value={priced ? `~${(ev * occ).toFixed(1)}` : 'Unpriced'} tone={priced ? T.danger : T.textMuted} />
      </div>

      {/* Progress to resolution · real leaks only; a demo leak has no record */}
      {!isDemoLeak && leak.status !== 'resolved' && (
        <LeakErrorBoundary label="The progress tracker">
          <ResolutionProgressSection record={reviewRecord} />
        </LeakErrorBoundary>
      )}

      {/* Trend */}
      <section style={styles.detailSection} aria-label="Trend">
        <h3 style={styles.detailSectionTitle}>Trend</h3>
        <LeakErrorBoundary label="The trend chart">
          <TrendChart
            data={leak.trendData}
            optimal={leak.optimalFrequency}
            current={leak.currentFrequency}
            status={leak.status}
            leakType={leak.leakType}
          />
        </LeakErrorBoundary>
        {leak.frequencyIsEstimated && (
          <p style={styles.detailNote}>Frequency Is Estimated From Training Repetitions, Not A Measured Sample.</p>
        )}
      </section>

      {/* How to fix it · the Grok-generated suggestion detect.js persists */}
      <section style={styles.detailSection} aria-label="How To Fix It">
        <h3 style={styles.detailSectionTitle}>
          <Sparkles size={16} strokeWidth={2} aria-hidden="true" style={{ color: T.purple, marginRight: 6, verticalAlign: '-2px' }} />
          How To Fix It
        </h3>
        <p style={styles.detailBody}>
          {leak.suggestedFix
            || 'No personalised fix has been generated for this leak yet. Run detection again · the engine writes tailored fixes for your highest-impact leaks.'}
        </p>
      </section>

      {/* Why it's leaking EV */}
      <section style={styles.detailSection} aria-label="Why It Is Leaking EV">
        <h3 style={styles.detailSectionTitle}>Why It{"'"}s Leaking EV</h3>
        <p style={styles.detailBody}>{leak.whyLeakingEv || leak.explanation || 'No explanation recorded for this leak.'}</p>
        {leak.explanation && leak.whyLeakingEv && leak.explanation !== leak.whyLeakingEv && (
          <p style={{ ...styles.detailBody, color: T.textMuted, marginTop: S.sm }}>{leak.explanation}</p>
        )}
      </section>

      {/* Example hands · one tap into the exact spot */}
      {!isDemoLeak && (
        <section style={styles.detailSection} aria-label="Recent Example Hands">
          <h3 style={styles.detailSectionTitle}>Recent Example Hands</h3>
          {examplesLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }} aria-busy="true">
              <Skeleton h={56} />
              <Skeleton h={56} />
            </div>
          ) : examplesError ? (
            <ErrorState
              title="Could Not Load Example Hands"
              body={String(examplesError)}
              onRetry={refetchExamples}
            />
          ) : examples.length === 0 ? (
            <p style={styles.detailBody}>
              No Example Hands Recorded For This Leak Yet. Run Leak Detection After Your Next Sessions To Collect Concrete Examples.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
              {examples.map((ex) => {
                const snap = ex?.snapshot || {};
                return (
                  <div key={ex.id} style={{ display: 'flex', flexDirection: 'column', gap: S.xs }}>
                  <button
                    type="button"
                    className="leak-card pa-btn"
                    onClick={() => onReviewExample(leak, ex)}
                    style={styles.exampleRow}
                    aria-label={`Review this hand: ${fmtCards(snap.hero_cards)} on ${fmtCards(snap.board)}`}
                  >
                    <span style={styles.exampleLine1}>
                      <span style={styles.exampleCards}>{renderMiniCardChips(snap.hero_cards)}</span>
                      <span style={styles.exampleEv}>
                        {Number.isFinite(Number(ex.evLoss)) ? `-${Math.abs(Number(ex.evLoss)).toFixed(2)} BB` : 'Not Available'}
                      </span>
                    </span>
                    <span style={styles.exampleLine2}>
                      <span style={styles.exampleBoard}>Board: {renderMiniCardChips(snap.board)}</span>
                      <span style={pill('accent')}>{String(snap.street || '?').toUpperCase()}</span>
                      <ChevronRight size={16} strokeWidth={2} aria-hidden="true" style={{ color: T.textMuted, marginLeft: 'auto' }} />
                    </span>
                  </button>
                  <ShareReviewControl
                    hand={{
                      street: snap.street,
                      position: snap.hero_position || snap.position,
                      board: snap.board,
                      heroCards: snap.hero_cards,
                      title: leak.title,
                    }}
                  />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Suggested fixes */}
      <section aria-label="Suggested Fixes">
        <h3 style={styles.detailSectionTitle}>Suggested Fixes</h3>
        <div style={styles.fixGrid}>
          <div style={styles.fixCard}>
            <div style={styles.fixHead}>
              <Target size={18} strokeWidth={2} aria-hidden="true" style={{ color: T.success }} />
              <h4 style={styles.fixTitle}>Corrective Review</h4>
              {exactTrainingGame && <span style={pill('success')}>Exact Training Game</span>}
            </div>
            <p style={styles.fixText}>
              Run A Focused Batch. Eligible Solver Leaks Lock Every Answer On The Server; Other Signals Stay Clearly Practice-Only.
            </p>
            <button
              type="button"
              className="pa-btn"
              style={btn('success', { block: true })}
              disabled={isDemoLeakId(leak.id)}
              title={isDemoLeakId(leak.id) ? 'Sign In And Run A Leak Audit To Start Verified Reviews.' : undefined}
              onClick={() => onStartReview?.(leak)}
            >
              {isDemoLeakId(leak.id) ? 'Run Audit To Unlock Review' : 'Start Corrective Review'}
            </button>
          </div>

          <div style={{ ...styles.fixCard, ...(autoGuidance ? styles.fixCardRecommended : null) }}>
            <div style={styles.fixHead}>
              <Target size={18} strokeWidth={2} aria-hidden="true" style={{ color: T.accent }} />
              <h4 style={styles.fixTitle}>Audited Hand Review</h4>
              {autoGuidance && <span style={pill('accent')}>Recommended</span>}
            </div>
            <p style={styles.fixText}>{handReviewCopy}</p>
            <button type="button" className="pa-btn" style={btn('primary', { block: true })} onClick={() => onOpenHandReview(leak)}>
              Open Hand History Review
            </button>
          </div>

          <div style={styles.fixCard}>
            <div style={styles.fixHead}>
              <Dumbbell size={18} strokeWidth={2} aria-hidden="true" style={{ color: T.warn }} />
              <h4 style={styles.fixTitle}>Specialised Training</h4>
            </div>
            <p style={styles.fixText}>{trainingCopy}</p>
            <button
              type="button"
              className="pa-btn"
              style={{ ...btn('secondary', { block: true }), color: T.warn, borderColor: 'rgba(255,198,109,0.45)' }}
              onClick={() => onTrainDrills(leak)}
            >
              {exactTrainingGame ? 'Open Exact Training Game' : 'Browse Related Training'}
            </button>
          </div>
        </div>

        <AutoGuidanceToggle value={autoGuidance} onChange={toggleAutoGuidance} />
      </section>

      {/* Resolve / reopen */}
      <section style={{ marginTop: S.lg }} aria-label="Leak Status">
        {leak.status === 'resolved' ? (
          <>
            <button
              type="button"
              className="pa-btn"
              style={btn('secondary', { block: true, disabled: isResolving || isDemoLeak })}
              onClick={() => onReopen(leak)}
              disabled={isResolving || isDemoLeak}
              aria-describedby={isDemoLeak ? 'leak-resolve-help' : undefined}
            >
              <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
              {isResolving ? 'Saving…' : 'Reopen Leak'}
            </button>
            {isDemoLeak && (
              <p id="leak-resolve-help" style={styles.helperText}>
                Sample Leaks Cannot Be Changed · Run Detection On Your Own Hands First.
              </p>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="pa-btn"
              style={btn('success', { block: true, disabled: isResolving || isDemoLeak })}
              onClick={() => onMarkResolved(leak)}
              disabled={isResolving || isDemoLeak}
              aria-describedby={isDemoLeak ? 'leak-resolve-help' : undefined}
            >
              <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" />
              {isResolving ? 'Saving…' : 'Mark Resolved'}
            </button>
            {isDemoLeak && (
              <p id="leak-resolve-help" style={styles.helperText}>
                Sample Leaks Cannot Be Resolved · Run Detection On Your Own Hands First.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAK NORMALISATION
// ═══════════════════════════════════════════════════════════════════════════
// The enrichment columns (leak_type, leak_category, recommended_drill,
// suggested_fix, resolved_at, last_detected_at, frequency_is_estimated) now
// come straight out of formatLeak() in useAssistant.js. This page used to issue
// a SECOND GET /api/assistant/leaks on mount and again on every
// `pa-data-updated` event just to recover them · the same request useLeaks()
// already makes and already re-issues on that same event.
//
// This only fills the derived defaults the UI needs; a column missing from the
// database simply stays null.

function normaliseLeak(leak) {
  return {
    ...leak,
    leakType: leak.leakType || slugFromTitle(leak.title),
    leakCategory: leak.leakCategory || null,
    recommendedDrill: leak.recommendedDrill || leak.recommended_drill || null,
    suggestedFix: leak.suggestedFix || null,
    resolvedAt: leak.resolvedAt || null,
    lastDetected: leak.lastDetected || leak.firstDetected || null,
    frequencyIsEstimated: !!leak.frequencyIsEstimated,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LEAK FINDER PAGE
// ═══════════════════════════════════════════════════════════════════════════

const DETECT_STEPS = [
  'Reading your hand history…',
  'Matching leak patterns…',
  'Scoring EV impact…',
  'Generating personalised fixes…',
];

const PAGE_SIZE = 15;

export default function LeakFinderPage() {
  const router = useRouter();
  const reduceMotion = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  const { user, initializing: authInitializing } = useAvatar();
  const userId = user?.id || null;

  // Mobile phase 4 foundation (docs/mobile-standard/ROLLOUT-PLAN.md).
  const haptic = useHaptics();
  const online = useOnlineStatus();
  // Leak detection reads hand history and writes user_leaks. Offline it would
  // spin for the whole timeout and then report a generic failure, so the
  // button explains instead of firing. OfflineBar in _app.js is the banner.
  const requireOnline = useCallback(() => {
    if (online) return true;
    toast.error(OFFLINE_TOAST);
    return false;
  }, [online]);

  useEffect(() => { setMounted(true); }, []);

  // ═══ ACTION GATE: exploring leaks is free, practice/training is gated ═══
  const { guardAction, hasAccess: paHasAccess, UpgradePopup } = useFeatureGate('personal_assistant');

  const [tab, setTab] = useState('leaks');
  const [progressSubsection, setProgressSubsection] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addHandsOpen, setAddHandsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [overflowLeakId, setOverflowLeakId] = useState(null);
  const [quickChip, setQuickChip] = useState('all');
  const [claimedLeakRewards, setClaimedLeakRewards] = useState({});
  const [claimingLeakRewardId, setClaimingLeakRewardId] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [liveSpotOpen, setLiveSpotOpen] = useState(false);
  const [liveSpotTab, setLiveSpotTab] = useState('spot');
  const closeLiveSpot = useCallback(() => setLiveSpotOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeAddHands = useCallback(() => setAddHandsOpen(false), []);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const closeOverflowLeak = useCallback(() => setOverflowLeakId(null), []);
  useModalHistory(liveSpotOpen, closeLiveSpot);
  useModalHistory(settingsOpen, closeSettings);
  useModalHistory(addHandsOpen, closeAddHands);
  useModalHistory(filtersOpen, closeFilters);
  useModalHistory(Boolean(overflowLeakId), closeOverflowLeak);
  const openLiveSpot = useCallback((nextTab = 'spot') => {
    if (!guardAction()) return;
    setLiveSpotTab(nextTab === 'paste' ? 'paste' : 'spot');
    setLiveSpotOpen(true);
  }, [guardAction]);
  const [selectedLeakId, setSelectedLeakId] = useState(null);

  // Back closes the menu, then the leak sheet, before it leaves the route.
  const closeMenu = useCallback(() => setShowMenu(false), []);
  const closeLeakSheet = useCallback(() => setSelectedLeakId(null), []);
  useModalHistory(showMenu, closeMenu);
  useModalHistory(Boolean(selectedLeakId), closeLeakSheet);
  const [resolvingLeakId, setResolvingLeakId] = useState(null);
  const [detectionSummary, setDetectionSummary] = useState(null);
  const [detectStep, setDetectStep] = useState(0);
  const [detectSlow, setDetectSlow] = useState(false);

  const [sortMode, setSortMode] = useState(PA_ANALYSIS_DEFAULTS.sortMode);
  const [statusFilter, setStatusFilter] = useState(PA_ANALYSIS_DEFAULTS.statusFilter);
  const [formatFilter, setFormatFilter] = useState(PA_ANALYSIS_DEFAULTS.format);
  const [practiceLength, setPracticeLength] = useState(PA_ANALYSIS_DEFAULTS.practiceLength);
  const [practiceDifficulty, setPracticeDifficulty] = useState(PA_ANALYSIS_DEFAULTS.practiceDifficulty);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pastOpen, setPastOpen] = useState(false);

  const prevQueryHydrationRef = useRef({ format: null, status: null, tab: null, view: null, settings: null, searchTerm: null });

  // Account-scoped saved analysis preferences (wait for auth hydration; preserve explicit URL ?format= and ?status=).
  useEffect(() => {
    if (authInitializing) return;
    const saved = loadAssistantPreferences(getSafeLocalStorage(), userId);
    setSortMode(saved.sortMode);
    const rawUrlStatus = Array.isArray(router.query?.status) ? router.query.status[0] : router.query?.status;
    const urlStatus = String(rawUrlStatus || '').trim().toLowerCase();
    const hasExplicitUrlStatus = router.isReady && ['persistent', 'emerging', 'improving', 'all', 'fixed', 'resolved', 'due'].includes(urlStatus);
    if (!hasExplicitUrlStatus) {
      setStatusFilter(saved.statusFilter);
    }
    setPracticeLength(saved.practiceLength);
    setPracticeDifficulty(saved.practiceDifficulty);
    const rawUrlFmt = Array.isArray(router.query?.format) ? router.query.format[0] : router.query?.format;
    const urlFmt = String(rawUrlFmt || '').trim().toLowerCase();
    const hasExplicitUrlFmt = router.isReady && (urlFmt === 'cash' || urlFmt === 'tournament' || urlFmt === 'mtt' || urlFmt === 'all');
    if (!hasExplicitUrlFmt) {
      setFormatFilter(saved.format);
    }
  }, [authInitializing, userId, router.isReady]);

  const persistPrefs = useCallback((patch) => {
    const storage = getSafeLocalStorage();
    if (!storage) return;
    saveAssistantPreferences(storage, userId, {
      format: formatFilter,
      sortMode,
      statusFilter,
      practiceLength,
      practiceDifficulty,
      ...patch,
    });
  }, [userId, formatFilter, sortMode, statusFilter, practiceLength, practiceDifficulty]);

  const updateSortMode = useCallback((nextSort) => {
    setSortMode(nextSort);
    persistPrefs({ sortMode: nextSort });
  }, [persistPrefs]);

  const updateFormatFilter = useCallback((nextFormat) => {
    setFormatFilter(nextFormat);
    persistPrefs({ format: nextFormat });
    if (router.isReady && router.query?.format) {
      prevQueryHydrationRef.current.format = null;
      const { format: _removed, ...restQuery } = router.query;
      router.replace({ pathname: router.pathname, query: restQuery }, undefined, { shallow: true });
    }
  }, [persistPrefs, router]);

  const updateStatusFilter = useCallback((nextStatus) => {
    setStatusFilter(nextStatus);
    persistPrefs({ statusFilter: nextStatus });
  }, [persistPrefs]);

  const updatePracticeLength = useCallback((nextLengthRaw) => {
    const nextLength = Number(nextLengthRaw) || PA_ANALYSIS_DEFAULTS.practiceLength;
    setPracticeLength(nextLength);
    persistPrefs({ practiceLength: nextLength });
  }, [persistPrefs]);

  const updatePracticeDifficulty = useCallback((nextDifficulty) => {
    setPracticeDifficulty(nextDifficulty);
    persistPrefs({ practiceDifficulty: nextDifficulty });
  }, [persistPrefs]);

  const handleResetAnalysisSettings = useCallback(() => {
    const storage = getSafeLocalStorage();
    const defaults = storage
      ? resetAssistantPreferences(storage, userId)
      : PA_ANALYSIS_DEFAULTS;
    setSortMode(defaults.sortMode);
    setFormatFilter(defaults.format);
    setStatusFilter(defaults.statusFilter);
    setPracticeLength(defaults.practiceLength);
    setPracticeDifficulty(defaults.practiceDifficulty);
    setQuickChip('all');
    setQuery('');
    if (router.isReady && (router.query?.format || router.query?.street || router.query?.position || router.query?.leakType)) {
      prevQueryHydrationRef.current.format = null;
      prevQueryHydrationRef.current.searchTerm = null;
      const { format: _f, street: _s, position: _p, leakType: _l, ...restQuery } = router.query;
      router.replace({ pathname: router.pathname, query: restQuery }, undefined, { shallow: true });
    }
    toast.success('Analysis Settings Reset To Defaults');
  }, [userId, router]);

  const activeSettingsOverrides = countActivePreferenceOverrides({
    format: formatFilter,
    sortMode,
    statusFilter,
    practiceLength,
    practiceDifficulty,
  });
  const activeScopeSummary = describeAnalysisScope({
    format: formatFilter,
    sortMode,
    statusFilter,
  });

  const {
    leaks: fetchedLeaks,
    demoLeaks: onboardingLeaks,
    isLoading: leaksLoading,
    error: leaksError,
    partial: leaksPartial,
    refetch: refetchLeaks,
    updateLeakStatus,
    isDemo: leaksDemoFlag,
  } = useLeaks(null, { userId, ready: !authInitializing });
  const {
    stats: fetchedStats,
    isLoading: statsLoading,
    isDemo: statsDemoFlag,
    error: statsError,
    refetch: refetchStats,
  } = useAssistantStats({
    userId,
    ready: !authInitializing,
  });
  const { runDetection, isDetecting, detectionResult, detectionProgress, auditJob, error: detectionError } = useLeakDetection({
    userId,
    ready: !authInitializing,
  });

  // Live-play verification lives on the coaching snapshot, not on the leaks list. It is optional
  // enrichment: when it is missing or fails, no badge renders (never a guessed claim).
  const [coachingSnapshot, setCoachingSnapshot] = useState(null);
  const [coachingPayload, setCoachingPayload] = useState(null);
  const [initialEvidenceLeakId, setInitialEvidenceLeakId] = useState(null);
  const requestCoachingSnapshot = useAbortableFetch();
  const coachingSnapshotRequestIdRef = useRef(0);
  useEffect(() => () => { coachingSnapshotRequestIdRef.current += 1; }, []);

  const fetchCoachingSnapshot = useCallback(async () => {
    const requestId = ++coachingSnapshotRequestIdRef.current;
    if (authInitializing) return;
    if (!userId) {
      clearAssistantClientCache();
      setCoachingSnapshot(null);
      setCoachingPayload(null);
      return;
    }
    const cached = readAssistantCache(userId, 'coaching');
    if (cached) {
      setCoachingPayload(cached);
      if (cached?.snapshot) setCoachingSnapshot(cached.snapshot);
    }
    try {
      const accessToken = await getFreshAccessToken();
      if (!accessToken) {
        if (requestId === coachingSnapshotRequestIdRef.current) {
          clearAssistantClientCache(userId);
          setCoachingSnapshot(null);
          setCoachingPayload(null);
        }
        return;
      }
      const res = await requestCoachingSnapshot('/api/assistant/coaching', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (requestId !== coachingSnapshotRequestIdRef.current) return;
      const json = await res.json().catch(() => null);
      if (requestId !== coachingSnapshotRequestIdRef.current) return;
      if (res.ok && json?.success) {
        writeAssistantCache(userId, 'coaching', json);
        setCoachingPayload(json);
        if (json?.snapshot) setCoachingSnapshot(json.snapshot);
      }
    } catch (e) {
      if (isAbortError(e)) return;
      console.warn('[LeakFinder] coaching snapshot unavailable:', e?.message || e);
    }
  }, [authInitializing, userId, requestCoachingSnapshot]);

  useEffect(() => {
    fetchCoachingSnapshot();
    if (typeof window === 'undefined') return undefined;
    const handleInvalidateAndRefresh = () => {
      clearAssistantClientCache(userId);
      fetchCoachingSnapshot();
    };
    window.addEventListener('pa-data-updated', handleInvalidateAndRefresh);
    window.addEventListener('pa-leak-review-updated', handleInvalidateAndRefresh);
    return () => {
      window.removeEventListener('pa-data-updated', handleInvalidateAndRefresh);
      window.removeEventListener('pa-leak-review-updated', handleInvalidateAndRefresh);
    };
  }, [fetchCoachingSnapshot, userId]);

  const tableVerificationIndex = useMemo(
    () => buildTableVerificationIndex(coachingSnapshot),
    [coachingSnapshot],
  );

  const coachingAdviceIndex = useMemo(() => {
    const map = new Map();
    const snapLeaks = Array.isArray(coachingSnapshot?.leaks) ? coachingSnapshot.leaks : [];
    const snapPriorities = Array.isArray(coachingSnapshot?.priorities) ? coachingSnapshot.priorities : [];
    for (const item of [...snapPriorities, ...snapLeaks]) {
      const id = String(item?.id ?? item?.leakId ?? '').trim();
      if (!id) continue;
      map.set(id, item);
    }
    return map;
  }, [coachingSnapshot]);

  const safeLeaks = useMemo(() => (Array.isArray(fetchedLeaks) ? fetchedLeaks : []), [fetchedLeaks]);
  const leaks = useMemo(
    () => safeLeaks.filter(Boolean).map((raw) => {
      const normalized = normaliseLeak(raw);
      if (isDemoLeakId(normalized.id)) return normalized;
      const verification = normalized.tableVerification || tableVerificationIndex.get(String(normalized.id)) || null;
      const coachingItem = coachingAdviceIndex.get(String(normalized.id)) || null;
      return {
        ...normalized,
        ...(verification ? { tableVerification: verification } : {}),
        ...(coachingItem?.evidenceBasis ? { evidenceBasis: coachingItem.evidenceBasis } : {}),
        ...(coachingItem?.takeaway ? { takeaway: coachingItem.takeaway } : {}),
        ...(coachingItem?.representativeHand ? { representativeHand: coachingItem.representativeHand } : {}),
        ...(coachingItem?.sampleCounts ? { sampleCounts: coachingItem.sampleCounts } : {}),
        ...(coachingItem?.practiceTarget ? { practiceTarget: coachingItem.practiceTarget } : {}),
      };
    }),
    [safeLeaks, tableVerificationIndex, coachingAdviceIndex],
  );

  const activeLeaks = useMemo(() => leaks.filter(l => l.status !== 'resolved'), [leaks]);
  const pastLeaks = useMemo(() => leaks.filter(l => l.status === 'resolved'), [leaks]);

  // Demo detection scoped to what is actually demo (a missing stats row must not
  // stamp "Sample Data" over genuinely detected leaks and vice versa)
  const leaksAreDemo = !!leaksDemoFlag || (leaks.length > 0 && leaks.every(l => isDemoLeakId(l.id)));
  const statsAreDemo = !!statsDemoFlag || !!fetchedStats?.isDemo;

  const avgEvLoss = useMemo(() => {
    if (typeof fetchedStats?.avgEvLoss === 'number' && fetchedStats.avgEvLoss !== 0 && !statsAreDemo) {
      return fetchedStats.avgEvLoss;
    }
    const measuredLeaks = activeLeaks.filter(l => l.evLossMeasured === true && hasPricedEv(l));
    if (measuredLeaks.length > 0) {
      return -(measuredLeaks.reduce((s, l) => s + Math.abs(num(l.evLossBB)), 0) / measuredLeaks.length);
    }
    return 0;
  }, [fetchedStats, statsAreDemo, activeLeaks]);

  const stats = {
    sessionsReviewed: Number.isFinite(fetchedStats?.sessionsReviewed) ? fetchedStats.sessionsReviewed : null,
    handsAnalyzed: Number.isFinite(fetchedStats?.handsAnalyzed) ? fetchedStats.handsAnalyzed : null,
    leaksFound: activeLeaks.length,
    avgEvLoss,
  };

  // ─── Archived coach records (legacy rows are not provenance-sealed grades) ─
  const [coachAccuracy, setCoachAccuracy] = useState(null);
  const [coachLoading, setCoachLoading] = useState(true);
  const [coachError, setCoachError] = useState(null);
  const requestCoachAccuracy = useAbortableFetch();
  const requestReviewSchedule = useAbortableFetch();
  const coachRequestIdRef = useRef(0);
  const reviewRequestIdRef = useRef(0);

  useEffect(() => () => {
    coachRequestIdRef.current += 1;
    reviewRequestIdRef.current += 1;
  }, []);

  const fetchCoachAccuracy = useCallback(async () => {
    const requestId = ++coachRequestIdRef.current;
    if (authInitializing) return;
    if (!userId) {
      setCoachAccuracy(null);
      setCoachError(null);
      setCoachLoading(false);
      return;
    }
    setCoachLoading(true);
    setCoachError(null);
    try {
      const accessToken = await getFreshAccessToken();
      if (!accessToken) {
        setCoachAccuracy(null);
        return;
      }
      const res = await requestCoachAccuracy('/api/sandbox/coach-accuracy', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (requestId !== coachRequestIdRef.current) return;
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        setCoachError(`Coach stats unavailable (HTTP ${res.status})`);
        return;
      }
      const json = await res.json();
      if (requestId !== coachRequestIdRef.current) return;
      if (json?.success) {
        setCoachAccuracy({ ...(json.accuracy || {}), topLeaks: Array.isArray(json.topLeaks) ? json.topLeaks : [] });
      } else {
        setCoachError(json?.error || 'Coach stats unavailable');
      }
    } catch (e) {
      if (isAbortError(e) || requestId !== coachRequestIdRef.current) return;
      console.warn('[LeakFinder] coach accuracy failed:', e?.message || e);
      setCoachError('Coach stats unavailable');
    } finally {
      if (requestId === coachRequestIdRef.current) setCoachLoading(false);
    }
  }, [authInitializing, userId, requestCoachAccuracy]);

  useEffect(() => {
    fetchCoachAccuracy();
    if (typeof window === 'undefined') return undefined;
    const onUpdate = () => fetchCoachAccuracy();
    window.addEventListener('pa-data-updated', onUpdate);
    return () => window.removeEventListener('pa-data-updated', onUpdate);
  }, [fetchCoachAccuracy, userId]);

  // ─── Selection (id-based so a refetch can never leave a phantom) ─────────
  // The pool includes the onboarding samples so an example card can open too.
  const selectablePool = useMemo(() => {
    const onboarding = Array.isArray(onboardingLeaks) ? onboardingLeaks : [];
    return leaks.concat(onboarding.filter(Boolean).map(normaliseLeak));
  }, [leaks, onboardingLeaks]);

  const selectedLeak = useMemo(
    () => (selectedLeakId == null
      ? null
      : selectablePool.find(l => String(l.id) === String(selectedLeakId)) || null),
    [selectablePool, selectedLeakId],
  );

  const overflowLeak = useMemo(
    () => (overflowLeakId == null
      ? null
      : selectablePool.find(l => String(l.id) === String(overflowLeakId)) || null),
    [selectablePool, overflowLeakId],
  );

  useEffect(() => {
    if (selectedLeakId == null || leaksLoading) return;
    if (!selectablePool.some(l => String(l.id) === String(selectedLeakId))) setSelectedLeakId(null);
  }, [selectedLeakId, selectablePool, leaksLoading]);

  useEffect(() => {
    if (overflowLeakId == null || leaksLoading) return;
    if (!selectablePool.some(l => String(l.id) === String(overflowLeakId))) setOverflowLeakId(null);
  }, [overflowLeakId, selectablePool, leaksLoading]);

  // Deep link: /hub/personal-assistant/leaks?hand=<uuid> (or legacy /hub/jarvis JSON summary)
  const [linkedClubHand, setLinkedClubHand] = useState(null);
  const [linkedHandAudit, setLinkedHandAudit] = useState(null);
  const [linkedHandLoading, setLinkedHandLoading] = useState(false);
  const [linkedHandError, setLinkedHandError] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query?.hand ?? router.query?.handId;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) {
      setLinkedClubHand(null);
      setLinkedHandAudit(null);
      setLinkedHandError(null);
      return;
    }
    const trimmed = String(value).trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      setLinkedClubHand({ id: trimmed, label: `Hand ${trimmed.slice(0, 8)}` });
      setTab('leaks');
      return;
    }
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const candidateId = parsed && typeof parsed.id === 'string' ? parsed.id.trim() : '';
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId)) {
          const tableLabel = parsed.table ? `${parsed.table}` : `Hand ${candidateId.slice(0, 8)}`;
          const stakesLabel = parsed.stakes ? ` (${parsed.stakes})` : '';
          setLinkedClubHand({ id: candidateId, label: `${tableLabel}${stakesLabel}` });
          setTab('leaks');
          return;
        }
      } catch (_) {
        // Ignore malformed legacy payload.
      }
    }
    setLinkedClubHand(null);
    setLinkedHandAudit(null);
    setLinkedHandError(null);
  }, [router.isReady, router.query?.hand, router.query?.handId]);

  useEffect(() => {
    if (!router.isReady) return;
    const rawFmt = Array.isArray(router.query?.format) ? router.query.format[0] : router.query?.format;
    const fmt = String(rawFmt || '').trim().toLowerCase();
    const normalizedFmt = fmt === 'mtt' ? 'tournament' : fmt;
    const rawStatus = Array.isArray(router.query?.status) ? router.query.status[0] : router.query?.status;
    const nextStatus = String(rawStatus || '').trim().toLowerCase();
    const rawTab = Array.isArray(router.query?.tab) ? router.query.tab[0] : router.query?.tab;
    const nextTab = String(rawTab || '').trim().toLowerCase();
    const rawView = Array.isArray(router.query?.view) ? router.query.view[0] : router.query?.view;
    const nextView = String(rawView || '').trim().toLowerCase();
    const rawSettings = Array.isArray(router.query?.settings) ? router.query.settings[0] : router.query?.settings;
    const nextSettings = String(rawSettings || '').trim().toLowerCase();
    const rawStreet = Array.isArray(router.query?.street) ? router.query.street[0] : router.query?.street;
    const rawPos = Array.isArray(router.query?.position) ? router.query.position[0] : router.query?.position;
    const rawLeakType = Array.isArray(router.query?.leakType) ? router.query.leakType[0] : router.query?.leakType;
    const searchTerm = [rawLeakType, rawPos, rawStreet]
      .map(v => String(v || '').trim().replace(/_/g, ' '))
      .filter(Boolean)
      .join(' ');
    const prev = prevQueryHydrationRef.current;

    if ((normalizedFmt === 'cash' || normalizedFmt === 'tournament' || normalizedFmt === 'all') && normalizedFmt !== prev.format) {
      setFormatFilter(normalizedFmt);
    } else if (!normalizedFmt && prev.format) {
      setFormatFilter('all');
    }

    if (nextStatus !== prev.status) {
      if (nextStatus === 'fixed' || nextStatus === 'resolved') {
        setQuickChip('fixed');
      } else if (nextStatus === 'due') {
        setQuickChip('due');
      } else if (['persistent', 'emerging', 'improving', 'all'].includes(nextStatus)) {
        setQuickChip('all');
        setStatusFilter(nextStatus);
      } else if (!nextStatus && prev.status) {
        setQuickChip('all');
      }
    }

    if ((nextSettings === '1' || nextSettings === 'true' || nextView === 'data') && (nextSettings !== prev.settings || nextView !== prev.view)) {
      setSettingsOpen(true);
      const nextQuery = { ...router.query };
      delete nextQuery.settings;
      if (nextView === 'data') delete nextQuery.view;
      router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
    }

    if (['evidence', 'timeline', 'goals', 'report'].includes(nextView) && nextView !== prev.view) {
      setTab('progress');
      setProgressSubsection(nextView);
    } else if (nextView === 'coach' && nextView !== prev.view) {
      setTab('plan');
    } else if ((nextTab === 'plan' || nextTab === 'coaching') && nextTab !== prev.tab) {
      setTab('plan');
    } else if ((nextTab === 'progress' || nextTab === 'insights') && nextTab !== prev.tab) {
      setTab('progress');
    } else if (nextTab === 'leaks' && nextTab !== prev.tab) {
      setTab('leaks');
    } else if (!nextTab && !nextView && (prev.tab || prev.view)) {
      setTab('leaks');
    }

    if (searchTerm && searchTerm !== prev.searchTerm) {
      setQuery(searchTerm);
    } else if (!searchTerm && prev.searchTerm) {
      setQuery('');
    }
    prevQueryHydrationRef.current = {
      format: normalizedFmt || null,
      status: nextStatus || null,
      tab: nextTab || null,
      view: nextView || null,
      settings: nextSettings || null,
      searchTerm: searchTerm || null,
    };
  }, [router.isReady, router.query?.format, router.query?.status, router.query?.tab, router.query?.view, router.query?.settings, router.query?.street, router.query?.position, router.query?.leakType]);

  const fetchLinkedHandAudit = useCallback(async (handId, { method = 'GET', signal } = {}) => {
    const token = await getFreshAccessToken();
    if (!token) throw new Error('Sign In To Audit This Club Arena Hand.');
    const url = method === 'POST'
      ? '/api/assistant/leaks/hand-audit'
      : `/api/assistant/leaks/hand-audit?hand=${encodeURIComponent(handId)}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify({ handId }) } : {}),
      signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      const err = new Error(payload?.error || `Hand Audit Failed With HTTP ${response.status}.`);
      err.status = response.status;
      err.code = payload?.code || null;
      throw err;
    }
    return payload;
  }, []);

  // Automatically load and audit the exact linked Club Arena hand whenever the
  // URL's ?hand=<uuid> changes (including switching between two linked hands in
  // an already-open Personal Assistant tab). Aborts stale in-flight requests.
  useEffect(() => {
    const handId = linkedClubHand?.id;
    if (!handId || !userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handId)) {
      setLinkedHandAudit(null);
      setLinkedHandError(null);
      setLinkedHandLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLinkedHandAudit(null);
    setLinkedHandError(null);
    setLinkedHandLoading(true);
    fetchLinkedHandAudit(handId, { method: 'GET', signal: controller.signal })
      .then((payload) => {
        if (!controller.signal.aborted) setLinkedHandAudit(payload);
      })
      .catch((err) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        setLinkedHandError(err?.message || 'Could Not Audit This Club Arena Hand.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLinkedHandLoading(false);
      });
    return () => controller.abort();
  }, [fetchLinkedHandAudit, linkedClubHand?.id, userId]);

  const linkedPostAbortRef = useRef(null);
  const linkedPostSeqRef = useRef(0);

  useEffect(() => () => {
    try { linkedPostAbortRef.current?.abort(); } catch (_) { /* noop */ }
  }, [linkedClubHand?.id]);

  const handleAuditLinkedHand = useCallback(async () => {
    const handId = linkedClubHand?.id;
    if (!handId || !userId) return;
    if (!requireOnline()) return;
    try { linkedPostAbortRef.current?.abort(); } catch (_) { /* noop */ }
    const controller = new AbortController();
    linkedPostAbortRef.current = controller;
    const seq = ++linkedPostSeqRef.current;
    setLinkedHandLoading(true);
    setLinkedHandError(null);
    try {
      const payload = await fetchLinkedHandAudit(handId, { method: 'POST', signal: controller.signal });
      if (controller.signal.aborted || seq !== linkedPostSeqRef.current) return;
      setLinkedHandAudit(payload);
      if (payload.persisted) {
        refetchLeaks();
        refetchStats?.();
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('pa-data-updated'));
      } else if (payload.supported !== false && payload.audited !== false) {
        const warnMsg = payload.persistenceWarning || 'Hand Audit Completed, But Decision Evidence Could Not Be Saved. Retry To Persist.';
        setLinkedHandError(warnMsg);
        toast.error(warnMsg);
      }
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err) || seq !== linkedPostSeqRef.current) return;
      setLinkedHandError(err?.message || 'Could Not Persist Hand Audit.');
    } finally {
      if (!controller.signal.aborted && seq === linkedPostSeqRef.current) setLinkedHandLoading(false);
    }
  }, [fetchLinkedHandAudit, linkedClubHand?.id, refetchLeaks, refetchStats, requireOnline, userId]);

  // Deep link: /hub/personal-assistant/leaks?leak=<id> or ?leakId=<id>
  const deepLinkedTargetRef = useRef(null);
  useEffect(() => {
    if (!router.isReady || leaksLoading) return;
    const raw = router.query?.leak ?? router.query?.leakId;
    const target = Array.isArray(raw) ? raw[0] : raw;
    if (!target) { deepLinkedTargetRef.current = null; return; }
    if (deepLinkedTargetRef.current === String(target)) return;
    const match = selectablePool.find(l => String(l.id) === String(target));
    if (match) {
      setSelectedLeakId(match.id);
      deepLinkedTargetRef.current = String(target);
    } else if (selectablePool.length > 0) {
      deepLinkedTargetRef.current = String(target);
    }
  }, [router.isReady, router.query, selectablePool, leaksLoading]);

  // ─── Detection progress copy ─────────────────────────────────────────────
  useEffect(() => {
    if (!isDetecting) { setDetectStep(0); setDetectSlow(false); return undefined; }
    const stepTimer = setInterval(() => setDetectStep(s => (s + 1) % DETECT_STEPS.length), 3500);
    const slowTimer = setTimeout(() => setDetectSlow(true), 25000);
    return () => { clearInterval(stepTimer); clearTimeout(slowTimer); };
  }, [isDetecting]);

  // Auto-clear non-error banners so a stale result cannot outlive its context
  useEffect(() => {
    if (!detectionSummary || detectionSummary.type === 'error') return undefined;
    const t = setTimeout(() => setDetectionSummary(null), 12000);
    return () => clearTimeout(t);
  }, [detectionSummary]);

  const executeDetection = useCallback(async ({ fullRescan = false } = {}) => {
    if (!requireOnline()) return;
    if (!userId) {
      setDetectionSummary({
        type: 'info',
        text: 'Sign In To Audit Your Club Arena Hands And Detect Leaks.',
      });
      return;
    }
    haptic('medium');
    setDetectionSummary(null);
    let result;
    try {
      result = await runDetection({ fullRescan });
    } catch (e) {
      setDetectionSummary({ type: 'error', text: friendlyDetectionError(e?.message || e) });
      return;
    }
    if (result?.superseded) return;
    if (result?.success) {
      if (result.message) {
        setDetectionSummary({ type: 'info', text: result.message });
        return;
      }
      const found = result.leaksDetected ?? 0;
      if (result.persisted === false) {
        setDetectionSummary({
          type: 'error',
          text: `Found ${found} leak${found === 1 ? '' : 's'} but could not save them. Please try again.`,
        });
        return;
      }
      setDetectionSummary({
        type: result.partial ? 'info' : 'success',
        text: `Analyzed ${num(result.handsAnalyzed).toLocaleString()} Hands · Scanned ${num(result.auditProgress?.handsScanned ?? result.clubArenaSync?.handsFound).toLocaleString()} Club Arena Hands · Re-Audited ${num(result.auditProgress?.handsAudited ?? result.clubArenaSync?.handsAudited).toLocaleString()} · Graded ${num(result.solverDecisionsAnalyzed).toLocaleString()} Solver Decisions · ${found} Leak${found === 1 ? '' : 's'} Found.${result.partial ? ' Some follow-up evidence could not be synchronized and will be retried.' : ''}`,
      });
    } else {
      setDetectionSummary({ type: 'error', text: friendlyDetectionError(result?.error) });
    }
  }, [runDetection, requireOnline, haptic, userId]);

  const handleRunDetection = useCallback(async () => {
    if (!requireOnline()) return;
    return executeDetection({ fullRescan: false });
  }, [requireOnline, executeDetection]);

  const handleFullRescan = useCallback(async () => {
    if (!requireOnline()) return;
    return executeDetection({ fullRescan: true });
  }, [requireOnline, executeDetection]);

  // One-click Analyze My Play handoff from Personal Assistant Home (?autorun=1).
  // Waits for auth hydration, respects ?hand= & active jobs, checks entitlement,
  // coordinates with autoDetectRef, and clears the query param so reload never duplicates.
  const autorunTriggeredRef = useRef(false);
  useEffect(() => {
    if (!router.isReady || authInitializing || autorunTriggeredRef.current) return;
    const rawAuto = Array.isArray(router.query?.autorun) ? router.query.autorun[0] : router.query?.autorun;
    if (String(rawAuto || '') !== '1') return;
    autorunTriggeredRef.current = true;
    const { autorun: _removed, ...restQuery } = router.query;
    router.replace({ pathname: router.pathname, query: restQuery }, undefined, { shallow: true });
    if (!userId) return;
    if (router.query?.hand || router.query?.handId) return;
    if (isDetecting || auditJob?.status === 'queued' || auditJob?.status === 'running') return;
    if (!guardAction()) return;
    autoDetectRef.current = userId;
    handleRunDetection();
  }, [router, authInitializing, userId, isDetecting, auditJob?.status, guardAction, handleRunDetection]);

  const announcedAuditRef = useRef(null);
  useEffect(() => {
    if (!auditJob?.id || announcedAuditRef.current === `${auditJob.id}:${auditJob.status}`) return;
    if (auditJob.status === 'completed' && detectionResult) {
      announcedAuditRef.current = `${auditJob.id}:${auditJob.status}`;
      const found = num(detectionResult.leaksDetected);
      setDetectionSummary({
        type: detectionResult.partial ? 'info' : 'success',
        text: `Durable Audit Complete · ${num(auditJob.progress?.handsScanned).toLocaleString()} Hands Scanned · ${num(auditJob.progress?.decisionsAnalyzed).toLocaleString()} Decisions Checked · ${found} Leak${found === 1 ? '' : 's'} Found.`,
      });
    } else if (auditJob.status === 'failed') {
      announcedAuditRef.current = `${auditJob.id}:${auditJob.status}`;
      setDetectionSummary({ type: 'error', text: friendlyDetectionError(auditJob.error?.message || detectionError) });
    }
  }, [auditJob, detectionError, detectionResult]);

  // ─── First-visit auto-detection ──────────────────────────────────────────
  //
  // WHY THIS EXISTS: detection only ever ran on a manual tap, so `user_leaks`
  // was empty for effectively everyone · 1,132 accounts hold 100+ hands and
  // qualify, while the table carried 3 rows, all from the retired clinic
  // system. The Leak Finder was architecturally complete and permanently
  // empty, because nothing told a player to press a button they could not see
  // the value of yet.
  //
  // It is a client-side trigger rather than a cron on purpose: RULE 11 sends
  // every new scheduled job to Open Claw and CI fails on net-new
  // pages/api/cron/ files, and RULE 12 forbids standing up new infrastructure.
  // This needs neither.
  //
  // Guard rails, because detection is not free (it queries hand history and
  // asks Grok for fix suggestions on the top 3 leaks):
  //   • signed in AND already entitled · `hasAccess`, never `guardAction`, so
  //     a background action can never pop the upgrade modal at someone;
  //   • only when the leak list has loaded and is genuinely empty (sample
  //     leaks do not count as content);
  //   • once per browser per COOLDOWN_MS, so a clean player who legitimately
  //     has zero leaks does not re-run it on every visit;
  //   • once per mount, and never while a manual run is in flight;
  //   • silent on failure · a background action the user did not ask for must
  //     not raise an error banner. The manual button remains the loud path.
  const autoDetectRef = useRef(false);
  const [autoDetecting, setAutoDetecting] = useState(false);

  useEffect(() => {
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    if (!paHasAccess || !userId) return;                // entitled + signed in
    const KEY = `pa-auto-detect-last:${userId}`;

    if (autoDetectRef.current === userId) return;       // once per mount per account
    if (leaksLoading || leaksError || isDetecting) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (auditJob?.status === 'queued' || auditJob?.status === 'running') return;
    if (leaksAreDemo) return;                           // sample data is not "no leaks"
    if (leaks.length > 0) return;                       // already has real leaks

    const last = Number(safeStorage.get(KEY, '0'));
    if (Number.isFinite(last) && last > 0 && Date.now() - last < COOLDOWN_MS) return;

    autoDetectRef.current = userId;
    setAutoDetecting(true);
    (async () => {
      try {
        const result = await runDetection();
        if (result?.success === true) safeStorage.set(KEY, String(Date.now()));
      } catch (e) {
        console.warn('[LeakFinder] auto-detection failed:', e?.message || e);
      } finally {
        setAutoDetecting(false);
      }
    })();
  }, [paHasAccess, userId, leaksLoading, leaksError, isDetecting, auditJob?.status, leaksAreDemo, leaks.length, runDetection]);

  const celebrate = useCallback(async () => {
    if (reduceMotion) return;
    try {
      const mod = await import('canvas-confetti');
      const confetti = mod?.default || mod;
      confetti({ particleCount: 60, spread: 65, startVelocity: 32, origin: { y: 0.75 }, disableForReducedMotion: true });
    } catch (e) {
      /* confetti is decorative · never fatal */
    }
  }, [reduceMotion]);

  const handleMarkResolved = useCallback(async (leak) => {
    if (!leak || isDemoLeakId(leak.id)) return;
    setResolvingLeakId(leak.id);
    try {
      const result = await updateLeakStatus(leak.id, 'resolved');
      if (result?.success) {
        toast.success('Leak marked as resolved');
        celebrate();
        setSelectedLeakId(null);
      } else {
        toast.error(result?.error || 'Could not update leak status');
      }
    } catch (e) {
      toast.error('Could not update leak status');
    } finally {
      setResolvingLeakId(null);
    }
  }, [updateLeakStatus, celebrate]);

  const handleReopen = useCallback(async (leak) => {
    if (!leak || isDemoLeakId(leak.id)) return;
    setResolvingLeakId(leak.id);
    try {
      const result = await updateLeakStatus(leak.id, 'persistent');
      if (result?.success) {
        toast.success('Leak reopened');
      } else {
        toast.error(result?.error || 'Could not reopen this leak');
      }
    } catch (e) {
      toast.error('Could not reopen this leak');
    } finally {
      setResolvingLeakId(null);
    }
  }, [updateLeakStatus]);

  const handleOpenHandReview = useCallback((leak = undefined) => {
    if (!guardAction()) return;
    const target = leak === undefined ? selectedLeak : leak;
    const leakParam = target?.id ? `&leak=${encodeURIComponent(String(target.id))}` : '';
    router.push(`/hub/training/hand-history-upload?source=personal-assistant-leaks${leakParam}`);
  }, [guardAction, router, selectedLeak]);

  /**
   * Open the real persisted Club Arena hand when this example points at a
   * Club Arena hand UUID (Club Arena Hand History enforces owner RLS). For
   * external or non-UUID hands, send the player to the audited importer
   * instead of serializing a browser-authored hand into a retired route.
   */
  const handleReviewExample = useCallback((_leak, example) => {
    if (!guardAction()) return;
    const rawHandId = String(example?.handId ?? example?.hand_history_id ?? '')
      .replace(/^club-arena:/, '')
      .trim();
    const leakId = _leak?.id ?? selectedLeak?.id ?? null;
    const leakParam = leakId ? `&leak=${encodeURIComponent(String(leakId))}` : '';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawHandId)) {
      const targetUrl = `/hub/club-arena/hand-history?hand=${encodeURIComponent(rawHandId)}&source=personal-assistant${leakParam}`;
      // /hub/club-arena/* is a reverse-proxy rewrite to Club Arena's static app,
      // not a Next.js page bundle - use full document navigation.
      if (typeof window !== 'undefined') window.location.assign(targetUrl);
      else router.push(targetUrl);
      return;
    }
    router.push(`/hub/training/hand-history-upload?source=personal-assistant-leak-example${leakParam}`);
  }, [guardAction, router, selectedLeak?.id]);

  const handleTrainDrills = useCallback((leak) => {
    if (!guardAction()) return;
    const target = leak === null ? null : (leak || selectedLeak);
    if (!target) {
      router.push({ pathname: '/hub/training', query: { from: 'leak-finder', returnTo: '/hub/personal-assistant/leaks' } });
      return;
    }
    const exactGame = leakToTrainingGame(target, TRAINING_GAME_IDS);
    const drillParams = leakToDrill(target) || {};
    const repHand = target?.representativeHand || target?.adviceExplanation?.representativeHand || {};
    const q = { from: 'leak-finder' };
    const focus = exactGame || target?.recommendedDrill || target?.leakType || slugFromTitle(target?.title);
    if (exactGame) q.autoLaunch = exactGame;
    else if (focus) q.focus = focus;

    const rawCat = String(target?.leakCategory || '').trim().toLowerCase();
    const streetCandidate = String(
      repHand.street
      || drillParams.street
      || target?.street
      || (['preflop', 'flop', 'turn', 'river'].includes(rawCat) ? rawCat : '')
      || '',
    ).trim().toLowerCase();
    if (['preflop', 'flop', 'turn', 'river'].includes(streetCandidate)) {
      q.street = streetCandidate;
    } else if (target?.leakCategory && !['live_play', 'training'].includes(rawCat)) {
      q.category = target.leakCategory;
    }

    const posCandidate = String(
      repHand.heroPosition
      || repHand.position
      || drillParams.position
      || target?.heroPosition
      || target?.position
      || '',
    ).trim().toUpperCase();
    if (['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'].includes(posCandidate)) {
      q.position = posCandidate;
    }

    const rawFormat = String(
      target?.formatScope
      || drillParams.gameType
      || (formatFilter !== 'all' ? formatFilter : '')
      || '',
    ).trim().toLowerCase();
    if (rawFormat === 'tournament' || rawFormat === 'mtt' || rawFormat === 'tournament_nlh') {
      q.format = 'mtt';
    } else if (rawFormat === 'cash' || rawFormat === 'cash_game' || rawFormat === 'cash_nlh') {
      q.format = 'cash';
    }

    if (target?.id != null) {
      q.leak = String(target.id);
      q.returnTo = `/hub/personal-assistant/leaks?leak=${encodeURIComponent(String(target.id))}`;
    } else {
      q.returnTo = '/hub/personal-assistant/leaks';
    }
    router.push({ pathname: '/hub/training', query: q });
  }, [formatFilter, guardAction, router, selectedLeak]);

  const handleShareLeak = useCallback(async (leak) => {
    if (!leak || typeof window === 'undefined') return;
    const rep = leak.representativeHand || leak.adviceExplanation?.representativeHand || {};
    const rawCat = String(leak.leakCategory || '').trim().toLowerCase();
    const resolvedFormatLabel = leak.formatScope === 'tournament'
      ? 'Tournament NLH'
      : leak.formatScope === 'cash'
        ? 'Cash NLH'
        : 'Smarter.Poker Leak Review';
    const url = buildHandReviewShareUrl({
      origin: window.location.origin,
      street: rep.street || (['preflop', 'flop', 'turn', 'river'].includes(rawCat) ? rawCat : null),
      position: rep.heroPosition || rep.position || null,
      board: rep.board || null,
      heroCards: rep.heroCards || null,
      stakes: rep.stakes || null,
      formatLabel: resolvedFormatLabel,
      title: leak.title || leak.situationClass || 'Poker Leak Review',
      anonymize: true,
      includeHoleCards: false,
    });
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success('Read-Only Review Link Copied');
        return;
      }
    } catch (e) {
      /* fall through to the share sheet */
    }
    try {
      if (navigator?.share) {
        await navigator.share({ title: leak.title, url });
        return;
      }
    } catch (e) {
      /* user dismissed */
    }
    toast(
      <span>
        Copy This Link: <span data-pa-verbatim="true">{url}</span>
      </span>,
    );
  }, []);

  // ─── Spaced-repetition review queue ──────────────────────────────────────
  // Sources: the server schedule (authoritative) merged over the localStorage
  // fallback QuickSpotDrill writes when the API cannot persist. The queue and
  // the ordering come from src/lib/sandbox/leakReview · this page only renders.
  const [reviewNowMs, setReviewNowMs] = useState(0);
  const [reviewServerRecords, setReviewServerRecords] = useState([]);
  const [reviewLocalRecords, setReviewLocalRecords] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  // First load only · a background refresh after a drill must not flash the
  // whole card back to a skeleton.
  const [reviewLoaded, setReviewLoaded] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [reviewSession, setReviewSession] = useState(null);
  const [reviewReceipt, setReviewReceipt] = useState(null);

  // A pinned clock: "due" must not be recomputed on every keystroke, but it
  // must not go stale on a phone left open either.
  useEffect(() => {
    setReviewNowMs(Date.now());
    const id = setInterval(() => setReviewNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const refreshLocalReviews = useCallback(() => {
    setReviewLocalRecords(readLocalReviewRecords());
  }, []);

  useEffect(() => { refreshLocalReviews(); }, [refreshLocalReviews]);

  const fetchReviewSchedule = useCallback(async () => {
    const requestId = ++reviewRequestIdRef.current;
    if (authInitializing) return;
    if (!userId) {
      setReviewServerRecords([]);
      setReviewError(null);
      setReviewLoading(false);
      setReviewLoaded(true);
      return;
    }
    setReviewLoading(true);
    setReviewError(null);
    try {
      const accessToken = await getFreshAccessToken();
      if (!accessToken) {
        // Signed out: the local fallback is the whole schedule. Not an error.
        setReviewServerRecords([]);
        return;
      }
      const res = await requestReviewSchedule('/api/assistant/leaks/review', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (requestId !== reviewRequestIdRef.current) return;
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        setReviewError(`Review schedule unavailable (HTTP ${res.status})`);
        return;
      }
      const json = await res.json();
      if (requestId !== reviewRequestIdRef.current) return;
      if (json?.success) {
        setReviewServerRecords(Array.isArray(json.records) ? json.records : []);
        if (json.persisted === false && json.reason !== 'guest') {
          setReviewError('Account sync is unavailable; showing the schedule saved on this device.');
        }
      } else {
        setReviewError(json?.error || 'Review schedule unavailable');
      }
    } catch (e) {
      if (isAbortError(e) || requestId !== reviewRequestIdRef.current) return;
      console.warn('[LeakFinder] review schedule failed:', e?.message || e);
      setReviewError('Review schedule unavailable');
    } finally {
      if (requestId === reviewRequestIdRef.current) {
        setReviewLoading(false);
        setReviewLoaded(true);
      }
    }
  }, [authInitializing, userId, requestReviewSchedule]);

  useEffect(() => { fetchReviewSchedule(); }, [fetchReviewSchedule, userId]);

  const refresh = useCallback(() => {
    clearAssistantClientCache(userId);
    refreshLocalReviews();
    setReviewNowMs(Date.now());
    refetchLeaks?.();
    refetchStats?.();
    fetchCoachingSnapshot();
  }, [userId, refreshLocalReviews, refetchLeaks, refetchStats, fetchCoachingSnapshot]);

  // Consume short-lived Training Arena mastery sync receipt written before returning to Leak Finder.
  useEffect(() => {
    if (authInitializing || typeof window === 'undefined') return;
    let raw = null;
    try {
      raw = window.sessionStorage?.getItem('pa_arena_review_receipt_v1') || null;
      if (raw) window.sessionStorage.removeItem('pa_arena_review_receipt_v1');
    } catch (_) {
      return;
    }
    if (!raw) return;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const savedAt = Number(parsed.savedAt);
    const MAX_RECEIPT_AGE_MS = 10 * 60 * 1000;
    if (!Number.isFinite(savedAt) || (Date.now() - savedAt) > MAX_RECEIPT_AGE_MS || (Date.now() - savedAt) < -60000) {
      return;
    }

    // Force-bypass stale SWR cache and refresh review schedule, leaks, stats, and coaching snapshot.
    clearAssistantClientCache(userId);
    fetchReviewSchedule();
    refresh();

    let intervalDays = parsed.intervalDays;
    if ((intervalDays === undefined || intervalDays === null) && parsed.nextReviewAt) {
      const nextMs = new Date(parsed.nextReviewAt).getTime();
      if (Number.isFinite(nextMs)) {
        intervalDays = Math.max(0, Math.round((nextMs - Date.now()) / 86400000));
      }
    }

    setReviewReceipt({
      status: 'done',
      source: 'arena',
      verified: true,
      masterySynced: parsed.masterySynced !== false,
      leakId: parsed.leakId || null,
      gameId: parsed.gameId || null,
      accuracy: Number.isFinite(Number(parsed.accuracy)) ? Number(parsed.accuracy) : null,
      correct: Number.isFinite(Number(parsed.correct)) ? Number(parsed.correct) : null,
      total: Number.isFinite(Number(parsed.total)) ? Number(parsed.total) : null,
      newStatus: parsed.newStatus || null,
      nextReviewAt: parsed.nextReviewAt || null,
      intervalDays: Number.isFinite(Number(intervalDays)) ? Number(intervalDays) : 1,
      remediationMastered: parsed.remediationMastered === true || parsed.newStatus === 'mastered',
    });
    toast.success('Training Mastery Synced');
  }, [authInitializing, router.asPath, userId, fetchReviewSchedule, refresh]);

  // A finished review updates both stores; re-read them rather than guessing.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onUpdated = () => {
      refreshLocalReviews();
      setReviewNowMs(Date.now());
      fetchReviewSchedule();
    };
    window.addEventListener('pa-leak-review-updated', onUpdated);
    return () => window.removeEventListener('pa-leak-review-updated', onUpdated);
  }, [refreshLocalReviews, fetchReviewSchedule]);

  // Server wins on every field it STATES; a local field survives only where the
  // account row is silent about it (the mastery columns are omitted entirely
  // until the migration lands, and adopting a zeroed streak from a row that
  // simply cannot hold one would reset mastery on every page load).
  const reviewRecords = useMemo(() => {
    const rawById = new Map();
    for (const raw of reviewLocalRecords) {
      const rec = migrateRecord(raw);
      if (rec && rec.leakId) rawById.set(String(rec.leakId), rec);
    }
    for (const raw of reviewServerRecords) {
      const mapped = fromServerReviewRecord(raw);
      if (!mapped) continue;
      const id = String(mapped.leakId ?? '');
      const rec = migrateRecord({ ...(rawById.get(id) || {}), ...definedOnly(mapped) });
      if (rec && rec.leakId) rawById.set(String(rec.leakId), rec);
    }
    return Array.from(rawById.values());
  }, [reviewLocalRecords, reviewServerRecords]);

  // Per-leak lookup for the progress-to-resolution surfaces (cards + detail).
  // Keyed by String(leakId) · the same normalisation the queue uses.
  const reviewRecordById = useMemo(() => {
    const map = new Map();
    for (const rec of reviewRecords) {
      if (rec && rec.leakId) map.set(String(rec.leakId), rec);
    }
    return map;
  }, [reviewRecords]);

  // Sample leaks are excluded: their schedule cannot be stored against an
  // account, and counting them would be a fake badge over data that is not yours.
  const reviewableLeaks = useMemo(
    () => (leaksAreDemo ? [] : activeLeaks.filter(l => !isDemoLeakId(l.id))),
    [activeLeaks, leaksAreDemo],
  );

  // The FULL ordered queue. The card renders a session's worth (MAX_QUEUE) but
  // needs the real total to say how much work exists without overstating it.
  const reviewQueueAll = useMemo(() => {
    if (!reviewNowMs) return [];
    try {
      return dueQueueAll(reviewRecords, reviewableLeaks, reviewNowMs) || [];
    } catch (e) {
      console.warn('[LeakFinder] review queue failed:', e?.message || e);
      return [];
    }
  }, [reviewRecords, reviewableLeaks, reviewNowMs]);

  const reviewQueue = useMemo(
    () => reviewQueueAll.slice(0, REVIEW_MAX_QUEUE),
    [reviewQueueAll],
  );

  // Stats are fed the SAME records the queue is fed. A row for a leak the user
  // has since resolved (or that is filtered out) would otherwise become
  // nextDueAt, and the caught-up card would promise a review for a leak that
  // can never appear in the queue.
  const reviewSummary = useMemo(() => {
    if (!reviewNowMs) return null;
    try {
      const ids = new Set(reviewableLeaks.map(l => String(l?.id ?? '')));
      const scoped = reviewRecords.filter(r => r && ids.has(String(r.leakId ?? '')));
      return reviewStats(scoped, reviewNowMs);
    } catch (e) {
      console.warn('[LeakFinder] review stats failed:', e?.message || e);
      return null;
    }
  }, [reviewRecords, reviewableLeaks, reviewNowMs]);

  const reviewTriggerRef = useRef(null);
  const [reviewAnnouncement, setReviewAnnouncement] = useState('');

  const handleStartReview = useCallback((entry) => {
    if (!guardAction()) return;
    const target = entry || reviewQueue[0];
    const targetLeak = target?.leak || (target?.id != null ? target : null);
    if (!targetLeak) return;
    if (targetLeak.id && isDemoLeakId(targetLeak.id)) {
      toast.error('Sign In And Run A Leak Audit To Start Verified Reviews.');
      return;
    }
    const params = target.drill || leakToDrill(targetLeak);
    if (!params) {
      // No street can be inferred, so a drill would serve unrelated spots.
      // Require the original hand history instead of inventing a drill spot.
      handleOpenHandReview(targetLeak);
      return;
    }
    reviewTriggerRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    setReviewAnnouncement('Corrective Review Session Opened');
    setReviewReceipt(null);
    const resolvedLeakId = target.practiceOnly
      ? null
      : (target.leakId !== undefined ? target.leakId : targetLeak.id);
    setReviewSession({
      leakId: resolvedLeakId != null && String(resolvedLeakId).trim() !== '' ? String(resolvedLeakId) : null,
      params: { ...params, limit: String(practiceLength) },
    });
  }, [guardAction, reviewQueue, handleOpenHandReview, practiceLength]);

  const handleReviewComplete = useCallback((receipt) => {
    if (!receipt || receipt.status !== 'done') return;
    setReviewReceipt(receipt);
    toast.success(receipt.verified
      ? 'Verified Corrective Review Saved'
      : 'Corrective Review Completed');
  }, []);

  const closeReviewSession = useCallback(() => {
    setReviewSession(null);
    setReviewAnnouncement('Corrective Review Session Closed');
    refreshLocalReviews();
    setReviewNowMs(Date.now());
    fetchReviewSchedule();
    try {
      reviewTriggerRef.current?.focus?.();
    } catch (_) {}
  }, [refreshLocalReviews, fetchReviewSchedule]);
  useModalHistory(Boolean(reviewSession), closeReviewSession);

  // Start the corrective drill for an audited linked hand (shared by the Drill This Spot button
  // and the ?hand=<id>&drill=1 deep link used by the Last Session Recap).
  const launchLinkedHandDrill = useCallback((audit) => {
    const action = audit?.trainingAction;
    if (!action) return;
    const matched = action.leakId
      ? selectablePool.find(l => String(l.id) === String(action.leakId))
      : null;
    if (matched) {
      handleStartReview({ leak: matched, drill: action.drillParams });
    } else if (action.leakId) {
      handleStartReview({
        leakId: action.leakId,
        leak: {
          id: action.leakId,
          title: action.title,
          leakType: audit.matchedLeaks?.[0]?.leakType || 'spot_review',
          leakCategory: audit.matchedLeaks?.[0]?.category || 'flop',
          recommendedDrill: action.drillParams?.game || null,
        },
        drill: action.drillParams,
      });
    } else {
      // No persisted user_leaks row matched yet - launch spot-matched practice drill
      // without sending a synthetic `hand:<uuid>` leak ID to /api/sandbox/custom-drill.
      handleStartReview({
        practiceOnly: true,
        leakId: null,
        leak: {
          id: null,
          title: action.title,
          leakType: 'spot_review',
          leakCategory: action.street || 'flop',
          recommendedDrill: action.drillParams?.game || null,
        },
        drill: action.drillParams,
      });
    }
  }, [selectablePool, handleStartReview]);

  const autoDrillHandledRef = useRef(null);
  useEffect(() => {
    if (!router.isReady || !linkedClubHand?.id || !linkedHandAudit?.trainingAction) return;
    const raw = Array.isArray(router.query?.drill) ? router.query.drill[0] : router.query?.drill;
    if (String(raw || '') !== '1') return;
    if (autoDrillHandledRef.current === linkedClubHand.id) return;
    autoDrillHandledRef.current = linkedClubHand.id;
    const { drill: _removed, ...restQuery } = router.query;
    router.replace({ pathname: router.pathname, query: restQuery }, undefined, { shallow: true });
    launchLinkedHandDrill(linkedHandAudit);
  }, [router, linkedClubHand?.id, linkedHandAudit, launchLinkedHandDrill]);

  // ?quickspot=1 (or paste) opens the live spot logger once, then clears the param so a reload
  // never reopens it.
  const quickSpotHandledRef = useRef(false);
  useEffect(() => {
    if (!router.isReady || quickSpotHandledRef.current) return;
    const raw = Array.isArray(router.query?.quickspot) ? router.query.quickspot[0] : router.query?.quickspot;
    if (!raw) return;
    quickSpotHandledRef.current = true;
    const { quickspot: _removed, ...restQuery } = router.query;
    router.replace({ pathname: router.pathname, query: restQuery }, undefined, { shallow: true });
    if (['1', 'spot', 'paste'].includes(String(raw))) openLiveSpot(String(raw) === 'paste' ? 'paste' : 'spot');
  }, [router, openLiveSpot]);

  // Last Session Recap handoff from the Coaching Workspace: open the audited hand (optionally
  // straight into its drill).
  const openSessionHand = useCallback((handId, drill = false) => {
    if (!handId) return;
    setTab('leaks');
    router.push(
      { pathname: router.pathname, query: { tab: 'leaks', hand: String(handId), ...(drill ? { drill: '1' } : {}) } },
      undefined,
      { shallow: true },
    );
  }, [router]);

  // ─── Filter / sort / paginate ────────────────────────────────────────────
  const resolveLeakFormat = (l) => {
    if (l?.formatScope === 'cash' || l?.formatScope === 'tournament' || l?.formatScope === 'cross_format') {
      return l.formatScope;
    }
    const hay = `${l?.leakType || ''} ${l?.recommendedDrill || ''} ${l?.title || ''} ${l?.situationClass || ''} ${l?.gameFormat || ''} ${l?.format || ''}`.toLowerCase();
    const isTournament = hay.includes('mtt_') || hay.includes('mtt-') || hay.includes('tournament');
    const isCash = hay.includes('cash_') || hay.includes('cash-') || hay.includes('cash nlh') || hay.includes('cash_game');
    if (isTournament && !isCash) return 'tournament';
    if (isCash && !isTournament) return 'cash';
    return 'cross_format';
  };

  const dueLeakIdSet = useMemo(() => {
    const ids = new Set();
    for (const item of reviewQueueAll) {
      const id = item?.leakId ?? item?.leak?.id;
      if (id != null) ids.add(String(id));
    }
    return ids;
  }, [reviewQueueAll]);

  const handleClaimLiveFixFromCard = useCallback(async (leak) => {
    const leakId = leak?.id;
    if (!leakId || isDemoLeakId(leakId)) return;
    setClaimingLeakRewardId(leakId);
    try {
      const token = await getFreshAccessToken();
      if (!token) throw new Error('Sign In Required');
      const response = await fetch('/api/assistant/leaks/claim-live-fix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ leakId }),
      });
      const data = await response.json().catch(() => null);
      const isAlreadyAwarded = Boolean(data?.alreadyAwarded || data?.code === 'already_awarded');
      const isAwarded = Boolean(data?.awarded);

      if (
        data?.code === 'REWARDS_UNAVAILABLE'
        || data?.code === 'REWARD_LIMIT_REACHED'
        || (data?.awarded === false && !isAlreadyAwarded)
      ) {
        toast.error(data?.error || 'Diamond Reward Could Not Be Claimed Right Now.');
        return;
      }
      if (!(response.ok && data?.success === true && (isAwarded || isAlreadyAwarded))) {
        throw new Error(data?.error || `Claim Failed (HTTP ${response.status})`);
      }
      setClaimedLeakRewards(prev => ({ ...prev, [leakId]: isAlreadyAwarded ? 'already_awarded' : 'claimed' }));
      toast.success(isAlreadyAwarded ? 'Reward Already Claimed For Verified Live Fix' : `${data?.diamonds || 25} Diamonds Claimed For Verified Live Fix`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pa-diamonds-updated'));
        window.dispatchEvent(new CustomEvent('pa-data-updated'));
      }
    } catch (err) {
      toast.error(err?.message || 'Could Not Claim Diamonds');
    } finally {
      setClaimingLeakRewardId(null);
    }
  }, []);

  const hiddenCrossFormatCount = useMemo(() => {
    if (formatFilter === 'all') return 0;
    return activeLeaks.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      return resolveLeakFormat(l) === 'cross_format';
    }).length;
  }, [activeLeaks, formatFilter, statusFilter]);

  const visibleLeaks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = quickChip === 'fixed'
      ? leaks.filter(l => l.status === 'resolved' || l.tableVerification?.status === 'confirmed_fixed_at_tables')
      : activeLeaks;
    if (quickChip === 'due') {
      list = list.filter(l => dueLeakIdSet.has(String(l.id)));
    }
    if (statusFilter !== 'all' && quickChip !== 'fixed') {
      list = list.filter(l => l.status === statusFilter);
    }
    if (formatFilter !== 'all') {
      list = list.filter((l) => resolveLeakFormat(l) === formatFilter);
    }
    if (needle) {
      list = list.filter(l =>
        String(l.title || '').toLowerCase().includes(needle)
        || String(l.situationClass || '').toLowerCase().includes(needle));
    }
    const confRank = { high: 3, medium: 2, low: 1 };
    const sorted = [...list];
    if (sortMode === 'impact') {
      sorted.sort((a, b) => totalBleed(b) - totalBleed(a));
    } else if (sortMode === 'recent') {
      sorted.sort((a, b) => new Date(b.lastDetected || b.firstDetected || 0) - new Date(a.lastDetected || a.firstDetected || 0));
    } else {
      sorted.sort((a, b) => (confRank[b.confidence] || 0) - (confRank[a.confidence] || 0) || totalBleed(b) - totalBleed(a));
    }
    return sorted;
  }, [activeLeaks, leaks, quickChip, dueLeakIdSet, statusFilter, formatFilter, query, sortMode]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [statusFilter, formatFilter, query, sortMode, quickChip]);

  const shownLeaks = visibleLeaks.slice(0, visibleCount);
  const remaining = Math.max(0, visibleLeaks.length - shownLeaks.length);

  // ═══ HAMBURGER MENU ═══
  // Single-page surface, so the menu's "Views" rows switch tab and scroll to a
  // section. Every handler below has a real implementation · the config omits
  // any row whose handler is absent, so no dead rows can render.
  // The drawer closes on activation and locks body scroll while open, so the
  // scroll has to run after React has committed the close AND the tab switch.
  const jumpTo = useCallback((id) => {
    if (typeof window === 'undefined') return;
    const behavior = reduceMotion ? 'auto' : 'smooth';
    setTimeout(() => {
      const node = id ? document.getElementById(id) : null;
      if (node) node.scrollIntoView({ behavior, block: 'start' });
      else window.scrollTo({ top: 0, behavior });
    }, 160);
  }, [reduceMotion]);

  const menuHandlers = useMemo(() => ({
    onViewOverview: () => { setTab('plan'); jumpTo(null); },
    onViewLeaks: () => { setTab('leaks'); jumpTo('leak-list'); },
    onViewAnalytics: () => { setTab('progress'); jumpTo('leak-progress'); },
    onRescan: () => { if (!isDetecting) handleRunDetection(); },
    onPracticeWorst: () => {
      const worst = visibleLeaks[0] || activeLeaks[0];
      if (!worst) { setTab('leaks'); jumpTo('leak-list'); return; }
      if (leakToDrill(worst)) handleStartReview({ leak: worst });
      else handleTrainDrills(worst);
    },
    // Toggles keep the drawer open, so this only changes state · no scroll.
    onToggleResolved: (next) => { setTab('leaks'); setPastOpen(!!next); },
  }), [jumpTo, isDetecting, handleRunDetection, visibleLeaks, activeLeaks, handleStartReview, handleTrainDrills]);

  const menuConfig = useMemo(() => getMenuConfig('leaks', user, {
    leakCount: activeLeaks.length,
    isDetecting,
    showResolved: pastOpen,
  }, menuHandlers), [user, activeLeaks.length, isDetecting, pastOpen, menuHandlers]);

  const rawNavSource = Array.isArray(router.query?.source) ? router.query.source[0] : router.query?.source;
  const navSource = router.isReady ? String(rawNavSource || '').trim().toLowerCase() : '';
  const isFromClubArenaStats = navSource === 'club-arena-stats';
  const isFromClubArena = navSource === 'club-arena';

  // ═══ PRE-MOUNT: real chrome + skeletons, never a bare flash ═══
  if (!mounted) {
    return (
      <div style={styles.page}>
        <SEOHead
          title="Leak Finder · Fix Your Game"
          description="Identify And Fix Repeated Expected Value Leaks In Your Poker Game With Deterministic Solver Audits And Spaced-Repetition Drills On Smarter.Poker."
          canonical="/hub/personal-assistant/leaks"
        />
        <PAStyles />
        <div style={styles.shell} aria-busy="true">
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
            <Skeleton h={28} w="55%" />
            <div style={styles.statGrid}>
              {[0, 1, 2, 3].map(i => <Skeleton key={i} h={70} />)}
            </div>
            <Skeleton h={44} />
            {[0, 1, 2].map(i => <Skeleton key={i} h={132} />)}
          </div>
          <HubPageSummary page="personal-assistant-leaks" />
        </div>
      </div>
    );
  }

  const normalizedTab = (tab === 'coaching' || tab === 'plan')
    ? 'plan'
    : (tab === 'insights' || tab === 'progress')
      ? 'progress'
      : 'leaks';

  const analysisSettingsDisclosureNode = (
    <details className="pa-disclosure" style={{ marginBottom: S.sm }}>
      <summary>
        <span>Analysis Settings</span>
        <small style={{ fontSize: 12 }}>{activeSettingsOverrides > 0 ? `${activeSettingsOverrides} Custom` : 'Defaults Active'}</small>
      </summary>
      <div className="pa-disclosure-body" style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
        <Segmented
          idPrefix="leak-format"
          label="Format (Cash And Tournament Never Mixed)"
          value={formatFilter}
          onChange={updateFormatFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'cash', label: 'Cash NLH' },
            { value: 'tournament', label: 'Tournament NLH' },
          ]}
        />
        <Segmented
          idPrefix="leak-sort"
          label="Sort By"
          value={sortMode}
          onChange={updateSortMode}
          options={[
            { value: 'impact', label: 'Impact' },
            { value: 'recent', label: 'Recent' },
            { value: 'confidence', label: 'Confidence' },
          ]}
        />
        <Segmented
          idPrefix="leak-status"
          label="Status"
          tone={statusFilter === 'persistent' ? 'warn' : 'accent'}
          columns={2}
          value={statusFilter}
          onChange={updateStatusFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'persistent', label: 'Persistent' },
            { value: 'emerging', label: 'Emerging' },
            { value: 'improving', label: 'Improving' },
          ]}
        />
        <Segmented
          idPrefix="practice-length"
          label="Practice Session Length"
          value={String(practiceLength)}
          onChange={updatePracticeLength}
          options={[
            { value: '5', label: '5 Spots' },
            { value: '10', label: '10 Spots' },
            { value: '20', label: '20 Spots' },
          ]}
        />
        <Segmented
          idPrefix="practice-pacing"
          label="Drill Pacing"
          value={practiceDifficulty}
          onChange={updatePracticeDifficulty}
          options={[
            { value: 'fundamentals', label: '25s' },
            { value: 'adaptive', label: '15s' },
            { value: 'pressure', label: '10s' },
          ]}
        />
        <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="pa-btn"
            style={btn('secondary')}
            onClick={() => openLiveSpot('spot')}
            data-live-spot-trigger="analysis-settings"
          >
            Log A Live Spot
          </button>
          {!isDetecting && userId && (
            <button
              type="button"
              className="pa-btn"
              style={btn('secondary')}
              onClick={handleFullRescan}
            >
              <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
              Full Re-Audit
            </button>
          )}
          <button
            type="button"
            className="pa-btn"
            style={btn('secondary')}
            onClick={handleResetAnalysisSettings}
          >
            Reset To Defaults
          </button>
        </div>
      </div>
    </details>
  );

  return (
    <PageTransition>
      <PersonalAssistantCopyPolicy />
      <SEOHead
        title="Leak Finder · Fix Your Game"
        description="Identify And Fix Repeated Expected Value Leaks In Your Poker Game With Deterministic Solver Audits And Spaced-Repetition Drills On Smarter.Poker."
        canonical="/hub/personal-assistant/leaks"
      />

      <div className={`leaks-page ${toolStyles.toolPage}`} style={styles.page}>
        <PAStyles />
        <UniversalHeader pageDepth={2} onMenuClick={() => setShowMenu(true)} />

        <HamburgerMenu
          isOpen={showMenu}
          onClose={closeMenu}
          direction="left"
          theme="pa"
          user={user}
          showProfile={Boolean(user)}
          menuItems={menuConfig.menuItems}
          bottomLinks={menuConfig.bottomLinks}
        />

        <main id="leak-finder-main" className="leaks-shell" style={styles.shell}>
          {(isFromClubArenaStats || (isFromClubArena && !linkedClubHand)) && (
            <div style={{ marginBottom: S.sm, display: 'flex', alignItems: 'center' }}>
              <a
                href={isFromClubArenaStats ? '/hub/club-arena/stats' : '/hub/club-arena'}
                className="pa-btn"
                data-testid={isFromClubArenaStats ? 'return-club-arena-stats' : 'return-club-arena'}
                style={{
                  ...btn('secondary'),
                  minHeight: 44,
                  textDecoration: 'none',
                  borderColor: 'rgba(86, 216, 255, 0.36)',
                  borderTopColor: '#aec0d0',
                  color: '#f1f5fc',
                }}
              >
                <span>{isFromClubArenaStats ? '← Return To Club Arena Stats' : '← Return To Club Arena'}</span>
              </a>
            </div>
          )}
          {/* Compact MTT lobby header plaque with top-right Settings gear button */}
          <section className={`${toolStyles.machineHero} ${toolStyles.leakHero}`} aria-labelledby="leak-machine-title">
            <div className={toolStyles.machineHeroInner}>
              <div className={toolStyles.machineHeroCopy}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span className={toolStyles.machineEyebrow}>Deterministic Hand Audit</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.integrityBadge}>
                      <Lock size={12} strokeWidth={2} aria-hidden="true" />
                      Not Live Play · Post-Session Review Only
                    </span>
                    <button
                      type="button"
                      className="pa-btn"
                      aria-label="Open Assistant Settings"
                      onClick={() => setSettingsOpen(true)}
                      style={styles.overflowIconBtn}
                    >
                      <Settings size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <h1 id="leak-machine-title" className={toolStyles.machineTitle}>Leak Finder</h1>
                <p className={toolStyles.machineDescription}>
                  Analyze Your Completed Club Arena Hands With Verified Defaults And Focus On The Top EV Leaks First.
                </p>
              </div>
            </div>
          </section>

          {/* ── ONE Flat 3-Tab Navigation Bar (Today / Plan | Leaks | Progress) ── */}
          <div style={{ marginTop: 6, marginBottom: S.sm }} data-tutorial="leak-views">
            <Segmented
              idPrefix="leaks-tab"
              label="View"
              columns={3}
              value={normalizedTab}
              onChange={(next) => {
                setTab(next);
                setProgressSubsection(null);
              }}
              options={[
                { value: 'plan', label: 'Today / Plan' },
                { value: 'leaks', label: reviewQueueAll.length > 0 ? `Leaks (${reviewQueueAll.length})` : 'Leaks' },
                { value: 'progress', label: 'Progress' },
              ]}
            />
          </div>

          {reviewReceipt && (
            <section
              role="status"
              aria-live="polite"
              data-testid="review-receipt-banner"
              style={{ ...card, marginBottom: S.md, background: T.successSoft, borderColor: 'rgba(77,224,165,0.45)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: S.sm }}>
                <CheckCircle2 size={20} strokeWidth={2} color={T.success} aria-hidden="true" style={{ marginTop: 2, flex: '0 0 auto' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', color: T.success, fontSize: F.body }}>
                    {reviewReceipt.source === 'arena'
                      ? 'Training Mastery Synced'
                      : (reviewReceipt.verified ? 'Verified Corrective Review Complete' : 'Corrective Review Complete')}
                  </strong>
                  <span style={{ display: 'block', color: T.textMuted, fontSize: F.bodySm, lineHeight: 1.45, marginTop: S.xs }}>
                    {reviewReceipt.source === 'arena' ? (
                      <>
                        {Number.isFinite(Number(reviewReceipt.accuracy))
                          ? `Accuracy ${Math.round(Number(reviewReceipt.accuracy))}%. `
                          : ''}
                        {reviewReceipt.newStatus
                          ? `Leak Status Updated To ${String(reviewReceipt.newStatus).replace(/_/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase())}. `
                          : 'Your Training Review Schedule Has Been Refreshed. '}
                        {reviewReceipt.nextReviewAt && Number.isFinite(new Date(reviewReceipt.nextReviewAt).getTime())
                          ? `Next Review Scheduled For ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(reviewReceipt.nextReviewAt))}.`
                          : `The Next Review Is Scheduled In ${Math.max(0, Math.round(num(reviewReceipt.intervalDays)))} Day${Math.round(num(reviewReceipt.intervalDays)) === 1 ? '' : 's'}.`}
                      </>
                    ) : (
                      <>
                        {reviewReceipt.correct} Of {reviewReceipt.total} Correct. The Next Review Is Scheduled In {Math.max(0, Math.round(num(reviewReceipt.intervalDays)))} Day{Math.round(num(reviewReceipt.intervalDays)) === 1 ? '' : 's'}.
                        {reviewReceipt.remediationMastered
                          ? ' Corrective Mastery Is Recorded; Fresh Club Arena Evidence Must Still Confirm The Leak Is Fixed.'
                          : ''}
                      </>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  className="pa-btn"
                  aria-label="Dismiss Corrective Review Receipt"
                  onClick={() => setReviewReceipt(null)}
                  style={iconBtn({ color: T.textMuted })}
                >
                  <X size={18} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            </section>
          )}

          {/* ── Sample-data disclosure (only when signed-in user is viewing demo/onboarding leaks) ── */}
          {userId && leaksAreDemo && !leaksLoading && (
            <section style={styles.demoBanner} aria-label="Sample Data Notice">
              <p style={styles.demoBannerText}>
                You Are Viewing Sample Data. Run Detection To Analyze Your Own Hands.
              </p>
            </section>
          )}

          {statsError && !statsLoading && (
            <div style={{ marginBottom: S.sm }}>
              <ErrorState
                title="Assistant Stats Unavailable"
                body="Your leak history is still available, but its summary totals could not be verified."
                onRetry={refetchStats}
              />
            </div>
          )}

          {normalizedTab === 'leaks' ? (
            <section id="leak-list" aria-label="Your Leaks" data-tutorial="leak-list">
              {/* Unified + Add / Audit Hands command deck */}
              <div className={toolStyles.scanDeck} data-tutorial="detect">
                <div className={toolStyles.scanDeckInner}>
                  <div className={toolStyles.scanDeckCopy}>
                    <span className={toolStyles.scanDisc} aria-hidden="true"><Activity size={20} strokeWidth={1.8} aria-hidden="true" /></span>
                    <span className={toolStyles.scanText}>
                      <strong>Analyze My Play</strong>
                      <span>{activeScopeSummary}</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: S.xs, flexWrap: 'wrap' }}>
                    {(!authInitializing && !userId) ? (
                      <a
                        href="/auth/login"
                        className={`pa-btn ${toolStyles.scanButton}`}
                        style={{ ...btn('primary', { block: true }), textDecoration: 'none' }}
                      >
                        Sign In To Analyze
                      </a>
                    ) : isDetecting ? (
                      <button
                        type="button"
                        className="pa-btn"
                        style={btn('primary', { disabled: true })}
                        disabled
                      >
                        <Activity size={18} strokeWidth={2} aria-hidden="true" />
                        <span>{`Auditing${detectionProgress?.batchesCompleted ? ` · ${detectionProgress.batchesCompleted} Batches Saved` : '…'}`}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="pa-btn"
                        data-testid="add-audit-hands-trigger"
                        style={btn('primary')}
                        onClick={() => setAddHandsOpen(true)}
                      >
                        <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
                        <span>Add / Audit Hands</span>
                      </button>
                    )}
                  </div>
                </div>
                {isDetecting && (
                  <div style={{ padding: `0 ${S.md}px ${S.md}px` }} aria-live="polite">
                    <div className="leak-progress"><span /></div>
                    <p style={styles.detectStepText}>
                      {detectionProgress?.handsScanned > 0
                        ? `${num(detectionProgress.handsScanned).toLocaleString()} Hands Scanned · ${num(detectionProgress.handsAudited).toLocaleString()} Re-Audited · ${num(detectionProgress.decisionsAnalyzed).toLocaleString()} Decisions Checked`
                        : detectSlow
                        ? 'The Server Audit Is Still Working. You Can Safely Leave This Page And Return Later.'
                        : DETECT_STEPS[detectStep]}
                    </p>
                  </div>
                )}
                {detectionSummary && (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      ...styles.detectionBanner,
                      margin: `0 ${S.md}px ${S.md}px`,
                      borderColor: detectionSummary.type === 'error'
                        ? 'rgba(255,107,122,0.5)'
                        : detectionSummary.type === 'success' ? 'rgba(77,224,165,0.5)' : 'rgba(255,198,109,0.5)',
                      color: detectionSummary.type === 'error'
                        ? T.danger
                        : detectionSummary.type === 'success' ? T.success : T.warn,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>{detectionSummary.text}</span>
                    <button
                      type="button"
                      className="pa-btn"
                      aria-label="Dismiss Detection Message"
                      onClick={() => setDetectionSummary(null)}
                      style={iconBtn({ transparent: true, color: T.textMuted })}
                    >
                      <X size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              {/* Compact Single-Row Filter Chip Strip (All, Due, Cash, MTT, Fixed) + Filters Pill */}
              <div className={toolStyles.filterStripWrap} role="group" aria-label="Quick Leak Filters">
                <div className={toolStyles.filterChipRow}>
                  <button
                    type="button"
                    className={`pa-btn ${toolStyles.filterChip}`}
                    aria-pressed={quickChip === 'all' && formatFilter === 'all' && statusFilter === 'all'}
                    onClick={() => {
                      setQuickChip('all');
                      setFormatFilter('all');
                      setStatusFilter('all');
                      persistPrefs({ format: 'all', statusFilter: 'all' });
                      if (router.isReady && (router.query?.format || router.query?.status)) {
                        prevQueryHydrationRef.current.format = null;
                        prevQueryHydrationRef.current.status = null;
                        const { format: _removedFmt, status: _removedStatus, ...restQuery } = router.query;
                        router.replace({ pathname: router.pathname, query: restQuery }, undefined, { shallow: true });
                      }
                    }}
                  >
                    <span>All</span>
                  </button>
                  <button
                    type="button"
                    className={`pa-btn ${toolStyles.filterChip}`}
                    aria-pressed={quickChip === 'due'}
                    onClick={() => setQuickChip(prev => (prev === 'due' ? 'all' : 'due'))}
                  >
                    <span>{reviewQueueAll.length > 0 ? `Due (${reviewQueueAll.length})` : 'Due'}</span>
                  </button>
                  <button
                    type="button"
                    className={`pa-btn ${toolStyles.filterChip}`}
                    aria-pressed={formatFilter === 'cash'}
                    onClick={() => {
                      setQuickChip('all');
                      updateFormatFilter(formatFilter === 'cash' ? 'all' : 'cash');
                    }}
                  >
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    className={`pa-btn ${toolStyles.filterChip}`}
                    aria-pressed={formatFilter === 'tournament'}
                    onClick={() => {
                      setQuickChip('all');
                      updateFormatFilter(formatFilter === 'tournament' ? 'all' : 'tournament');
                    }}
                  >
                    <span>MTT</span>
                  </button>
                  <button
                    type="button"
                    className={`pa-btn ${toolStyles.filterChip}`}
                    aria-pressed={quickChip === 'fixed'}
                    onClick={() => setQuickChip(prev => (prev === 'fixed' ? 'all' : 'fixed'))}
                  >
                    <span>Fixed</span>
                  </button>
                </div>
                <button
                  type="button"
                  className={`pa-btn ${toolStyles.filterMoreBtn}`}
                  aria-label="Open Advanced Filters"
                  onClick={() => setFiltersOpen(true)}
                >
                  <SlidersHorizontal size={15} strokeWidth={2} aria-hidden="true" />
                  <span>{activeSettingsOverrides > 0 ? `Filters (${activeSettingsOverrides})` : 'Filters'}</span>
                </button>
              </div>

              {/* Due for review · the spaced-repetition entry point */}
              {(authInitializing || Boolean(userId)) && (
              <LeakErrorBoundary label="The review queue">
                <ReviewQueueCard
                  loading={leaksLoading || !reviewNowMs || (reviewLoading && !reviewLoaded)}
                  error={reviewError}
                  onRetry={fetchReviewSchedule}
                  queue={reviewQueue}
                  queueTotal={reviewQueueAll.length}
                  stats={reviewSummary}
                  nowMs={reviewNowMs}
                  hasLeaks={reviewableLeaks.length > 0}
                  isDemo={leaksAreDemo}
                  isDetecting={isDetecting}
                  onStart={handleStartReview}
                  onOpenLeak={(l) => l && setSelectedLeakId(l.id)}
                />
              </LeakErrorBoundary>
              )}

              {linkedClubHand && (
                <section
                  role="region"
                  aria-label="Linked Club Arena Hand Audit"
                  data-testid="linked-hand-audit-panel"
                  className={toolStyles.instrumentPanel}
                  style={{
                    ...cardCompact,
                    marginBottom: S.md,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: S.sm,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: S.sm, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: S.xs, flexWrap: 'wrap' }}>
                        <span style={pill('accent')}>Club Arena Hand Linked</span>
                        {linkedHandAudit?.hand?.formatLabel && (
                          <span style={pill('neutral')}>{linkedHandAudit.hand.formatLabel}</span>
                        )}
                        {linkedHandAudit?.hand?.variant && (
                          <span style={pill('neutral')} data-pa-verbatim="true">{String(linkedHandAudit.hand.variant).toUpperCase()}</span>
                        )}
                        {linkedHandAudit?.supported === false && (
                          <span style={pill('warn')}>Unsupported Format · Unmeasured</span>
                        )}
                        {linkedHandAudit?.supported === true && linkedHandAudit?.audited === false && (
                          <span style={pill('warn')}>
                            {linkedHandAudit?.reason === 'cooldown_active' || linkedHandAudit?.contextState?.cooldownActive
                              ? 'Solver Grading Paused During Cooldown'
                              : 'Unmeasured Under Retention Policy'}
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: S.xs, fontSize: F.bodySm, color: T.text }}>
                        <strong data-pa-verbatim="true">{linkedClubHand.label}</strong>
                        {linkedHandAudit?.hand?.stakes ? ` · ${linkedHandAudit.hand.stakes}` : ''}
                        {Array.isArray(linkedHandAudit?.hand?.heroCards) && linkedHandAudit.hand.heroCards.length >= 2 && (
                          <> · Hero <span data-pa-verbatim="true">{renderMiniCardChips(linkedHandAudit.hand.heroCards)}</span></>
                        )}
                        {Array.isArray(linkedHandAudit?.hand?.board) && linkedHandAudit.hand.board.length > 0 && (
                          <> · Board <span data-pa-verbatim="true">{renderMiniCardChips(linkedHandAudit.hand.board)}</span></>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: S.xs, flexWrap: 'wrap' }}>
                      {userId && linkedHandAudit?.strategySupported !== false && linkedHandAudit?.supported !== false && (
                        <button
                          type="button"
                          className="pa-btn"
                          style={btn('primary')}
                          disabled={linkedHandLoading}
                          onClick={handleAuditLinkedHand}
                        >
                          {linkedHandLoading ? 'Auditing Hand…' : 'Audit This Hand'}
                        </button>
                      )}
                      {linkedHandAudit?.trainingAction && (
                        <button
                          type="button"
                          className="pa-btn"
                          style={btn('primary')}
                          onClick={() => launchLinkedHandDrill(linkedHandAudit)}
                        >
                          Drill This Spot
                        </button>
                      )}
                      <button
                        type="button"
                        className="pa-btn"
                        style={btn('secondary')}
                        onClick={() => {
                          const targetUrl = linkedHandAudit?.returnToClubArenaHref
                            || `/hub/club-arena/hand-history?hand=${encodeURIComponent(linkedClubHand.id)}&source=personal-assistant`;
                          if (typeof window !== 'undefined') window.location.assign(targetUrl);
                          else router.push(targetUrl);
                        }}
                      >
                        Return To Hand In Club Arena
                      </button>
                      <button
                        type="button"
                        className="pa-btn"
                        aria-label="Dismiss Linked Hand Audit"
                        onClick={() => {
                          setLinkedClubHand(null);
                          setLinkedHandAudit(null);
                          setLinkedHandError(null);
                          if (router.query?.hand || router.query?.handId) {
                            const { hand: _removed, handId: _removedId, ...restQuery } = router.query;
                            router.replace({ pathname: router.pathname, query: restQuery }, undefined, { shallow: true });
                          }
                        }}
                        style={iconBtn({ transparent: true, color: T.textMuted })}
                      >
                        <X size={18} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {linkedHandAudit?.hand && (
                    <ShareReviewControl
                      hand={{
                        street: linkedHandAudit.hand.street || linkedHandAudit.trainingAction?.street,
                        position: linkedHandAudit.hand.heroPosition || linkedHandAudit.hand.position,
                        board: linkedHandAudit.hand.board,
                        heroCards: linkedHandAudit.hand.heroCards,
                        stakes: linkedHandAudit.hand.stakes,
                        formatLabel: linkedHandAudit.hand.formatLabel,
                        title: 'Club Arena Hand Review',
                      }}
                    />
                  )}

                  {!userId && (
                    <div style={{ fontSize: F.bodySm, color: T.textMuted }}>
                      Sign In To Load Verified Solver Decisions For This Club Arena Hand.
                    </div>
                  )}

                  {linkedHandLoading && (
                    <div style={{ fontSize: F.bodySm, color: T.textMuted }} aria-busy="true">
                      Loading Verified Audit For <span data-pa-verbatim="true">{linkedClubHand.label}</span>…
                    </div>
                  )}

                  {linkedHandError && !linkedHandLoading && (
                    <div role="alert" style={{ fontSize: F.bodySm, color: T.danger }}>
                      {linkedHandError}
                    </div>
                  )}

                  {linkedHandAudit?.limitation && !linkedHandLoading && (
                    <div style={{ fontSize: F.bodySm, color: T.textMuted }}>
                      {linkedHandAudit.limitation}
                    </div>
                  )}

                  {!linkedHandLoading && (linkedHandAudit?.hand || (Array.isArray(linkedHandAudit?.streetTimeline) && linkedHandAudit.streetTimeline.length > 0)) && (
                    <InlineHandReplay audit={linkedHandAudit} />
                  )}

                  {!linkedHandLoading && Array.isArray(linkedHandAudit?.decisions) && linkedHandAudit.decisions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: S.xs }}>
                      <div style={{ fontSize: F.caption, color: T.textMuted }}>
                        {linkedHandAudit.solverVerifiedCount} Solver Verified · {linkedHandAudit.unpricedCount} Explicitly Unmeasured
                      </div>
                      {linkedHandAudit.decisions.map((decision, idx) => {
                        const selPct = decision.selectedFrequency != null && Number.isFinite(Number(decision.selectedFrequency))
                          ? Math.max(0, Math.min(100, Math.round(Number(decision.selectedFrequency))))
                          : null;
                        const optPct = decision.optimalFrequency != null && Number.isFinite(Number(decision.optimalFrequency))
                          ? Math.max(0, Math.min(100, Math.round(Number(decision.optimalFrequency))))
                          : null;
                        return (
                          <div
                            key={decision.decisionKey || `${decision.street}-${idx}`}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              padding: `${S.xs}px ${S.sm}px`,
                              borderRadius: R.sm,
                              background: T.surface2,
                              fontSize: F.bodySm,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.xs, flexWrap: 'wrap' }}>
                              <span>
                                <strong style={{ textTransform: 'capitalize' }}>{decision.street}</strong>
                                {decision.heroPosition ? ` · ${decision.heroPosition}` : ''}
                                {decision.playerAction ? ` · Played ${decision.playerAction}` : ''}
                                {decision.solverVerified && decision.solverAction ? ` · Solver ${decision.solverAction}` : ''}
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: S.xs }}>
                                <span style={pill(decision.solverVerified ? (decision.classification === 'correct' ? 'success' : 'warn') : 'neutral')}>
                                  {decision.solverVerified ? decision.classification : 'Unmeasured'}
                                </span>
                                {decision.evLossMeasured && decision.evLoss != null && (
                                  <span style={numeric}>{Number(decision.evLoss).toFixed(2)} BB</span>
                                )}
                              </span>
                            </div>
                            {decision.solverVerified && selPct !== null && optPct !== null && (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: S.sm, fontSize: F.caption, color: T.textMuted }}>
                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                    <span>Your Action Frequency</span>
                                    <strong style={{ ...numeric, color: T.text }}>{selPct}%</strong>
                                  </div>
                                  <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                    <div
                                      className="leak-progress-fill"
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        transformOrigin: 'left center',
                                        transform: `scaleX(${selPct / 100})`,
                                        background: decision.classification === 'correct' ? T.success : T.warn,
                                      }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                    <span>Solver Optimal Frequency</span>
                                    <strong style={{ ...numeric, color: T.success }}>{optPct}%</strong>
                                  </div>
                                  <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                    <div
                                      className="leak-progress-fill"
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        transformOrigin: 'left center',
                                        transform: `scaleX(${optPct / 100})`,
                                        background: T.success,
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!linkedHandLoading && Array.isArray(linkedHandAudit?.matchedLeaks) && linkedHandAudit.matchedLeaks.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: S.xs, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: F.caption, color: T.textMuted }}>Connected Leaks:</span>
                      {linkedHandAudit.matchedLeaks.map((ml) => (
                        <button
                          key={ml.id}
                          type="button"
                          className="pa-btn"
                          style={btn('secondary')}
                          onClick={() => setSelectedLeakId(ml.id)}
                        >
                          {ml.title}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Collapsible Stats & Audit Details (keeps main flow focused on leaks) */}
              <details className="pa-disclosure" style={{ marginBottom: S.md }}>
                <summary>
                  <span>Stats &amp; Audit Details</span>
                  <small style={{ fontSize: 12 }}>
                    {(!authInitializing && !userId)
                      ? 'Sign In Required'
                      : (leaksLoading || statsLoading)
                        ? 'Loading…'
                        : (leaksError || statsError)
                          ? 'Not Available'
                          : leaksAreDemo
                            ? 'Sample Mode'
                            : `${stats.leaksFound} Active · ${stats.handsAnalyzed === null ? 'Not Available' : `${stats.handsAnalyzed} Hands`}`}
                  </small>
                </summary>
                <div className="pa-disclosure-body" style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
                  <div className={toolStyles.machineTelemetry} aria-label="Leak Finder Data Telemetry">
                    <span className={toolStyles.telemetryCell}>
                      <span className={toolStyles.telemetryLabel}>Club Arena Link</span>
                      <strong className={toolStyles.telemetryValue} data-tone="live">
                        {isDetecting ? 'Server Audit Active' : !detectionResult ? 'Ready To Sync' : detectionResult?.clubArenaSync?.available === false ? 'Check Required' : 'Connected'}
                      </strong>
                    </span>
                    <span className={toolStyles.telemetryCell}>
                      <span className={toolStyles.telemetryLabel}>Club Hands Found</span>
                      <strong className={toolStyles.telemetryValue}>
                        {detectionResult || detectionProgress
                          ? num(detectionResult?.auditProgress?.handsScanned ?? detectionProgress?.handsScanned ?? detectionResult?.clubArenaSync?.handsFound).toLocaleString()
                          : 'Not Available'}
                      </strong>
                    </span>
                    <span className={toolStyles.telemetryCell}>
                      <span className={toolStyles.telemetryLabel}>Solver Decisions</span>
                      <strong className={toolStyles.telemetryValue} data-tone="gold">
                        {detectionResult || detectionProgress ? num(detectionResult?.solverDecisionsAnalyzed ?? detectionProgress?.decisionsAnalyzed).toLocaleString() : 'Not Available'}
                      </strong>
                    </span>
                  </div>

                  <section className="leak-stat-grid" style={styles.statGrid} aria-label="Summary Statistics">
                    <StatCell
                      label="Sessions reviewed"
                      value={statsLoading ? null : (statsError || statsAreDemo || stats.sessionsReviewed === null ? 'Not Available' : String(stats.sessionsReviewed))}
                    />
                    <StatCell
                      label="Hands analyzed"
                      value={statsLoading ? null : (statsError || statsAreDemo || stats.handsAnalyzed === null ? 'Not Available' : stats.handsAnalyzed.toLocaleString())}
                    />
                    <StatCell
                      label="Active leaks"
                      value={leaksLoading ? null : (leaksError || leaksAreDemo ? 'Not Available' : String(stats.leaksFound))}
                    />
                    <StatCell
                      label="Avg EV loss"
                      tone={T.danger}
                      value={leaksLoading || statsLoading ? null : (stats.avgEvLoss && !statsError && !statsAreDemo ? `${stats.avgEvLoss.toFixed(2)} BB` : 'Not Available')}
                    />
                    <StatCell
                      label="Archived coach records"
                      icon={<GraduationCap size={14} strokeWidth={2} aria-hidden="true" />}
                      value={coachLoading
                        ? null
                        : coachError
                          ? 'Not Available'
                          : (coachAccuracy && num(coachAccuracy.total_hands) > 0 ? String(num(coachAccuracy.total_hands)) : 'Not Available')}
                      tone={T.text}
                      hint={coachError ? 'Coach records unavailable' : (coachAccuracy && num(coachAccuracy.total_hands) > 0 ? 'Historical choices only · no provenance-sealed grade' : 'No coach records yet')}
                      onRetry={coachError ? fetchCoachAccuracy : null}
                    />
                    {statsAreDemo && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span style={pill('warn')}>Sample Stats · Not Your Own Data</span>
                      </div>
                    )}
                    {!statsError && fetchedStats?.partial && !statsLoading && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span style={pill('warn')}>Some Summary Sources Are Temporarily Unavailable</span>
                      </div>
                    )}
                  </section>

                  <AuditReceipt result={detectionResult || (auditJob ? {
                    auditJob,
                    auditProgress: auditJob.progress,
                    reconciliation: auditJob.reconciliation,
                    leaksDetected: auditJob.progress?.coverage?.leaks || 0,
                    persisted: auditJob.status !== 'failed',
                  } : null)} />
                </div>
              </details>

              {/* Signed-out calm gate vs signed-in load error */}
              {(!authInitializing && !userId) ? (
                <section
                  className={toolStyles.instrumentPanel}
                  style={{ ...card, marginBottom: S.md, textAlign: 'center', display: 'grid', justifyItems: 'center', gap: S.sm }}
                  aria-label="Leak Finder Sign In"
                >
                  <strong style={{ fontSize: F.h3, color: T.text }}>Sign In To View Your Club Arena Leaks</strong>
                  <p style={{ margin: 0, fontSize: F.bodySm, color: T.textMuted, maxWidth: '42ch', lineHeight: 1.45 }}>
                    Sign In With Your Smarter.Poker Account To Audit Your Completed Cash And Tournament Hands Automatically.
                  </p>
                  <a
                    href="/auth/login"
                    className="pa-btn"
                    style={{ ...btn('primary'), textDecoration: 'none' }}
                  >
                    Sign In
                  </a>
                </section>
              ) : (
              <>
              {leaksError && !leaksLoading && (
                <div style={{ marginBottom: S.md }}>
                  <ErrorState
                    title="Could Not Load Your Leaks"
                    body={friendlyLoadError(leaksError)}
                    onRetry={() => refetchLeaks()}
                  />
                </div>
              )}
              {!leaksError && leaksPartial && !leaksLoading && (
                <div role="status" style={{ marginBottom: S.md, display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' }}>
                  <span style={pill('warn')}>Leak History Is Partially Loaded · Retry To Verify Every Source</span>
                  <button type="button" className="pa-btn" style={btn('secondary')} onClick={() => refetchLeaks()}>
                    Retry
                  </button>
                </div>
              )}

              {leaksLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }} aria-busy="true">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="leak-skeleton" style={styles.skeletonCard} />
                  ))}
                </div>
              ) : leaksError ? null : (activeLeaks.length === 0 && pastLeaks.length === 0) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                  <EmptyState
                    compact
                    icon={<Inbox size={22} strokeWidth={2} aria-hidden="true" />}
                    title={(autoDetecting || isDetecting) ? 'Checking your recent hands…' : 'No leaks detected yet'}
                    body={(autoDetecting || isDetecting)
                      ? 'Scanning your hand history for repeated, measurable EV mistakes. This takes a few seconds.'
                      : 'Use Analyze My Play above to scan your completed Club Arena hands with verified defaults.'}
                  />
                  {(onboardingLeaks || []).length > 0 && (
                    <div>
                      <h2 style={styles.sectionHeading}>Example Leaks (Not Yours)</h2>
                      <ul className="leak-list-grid" style={styles.leakList} role="list">
                        {onboardingLeaks.slice(0, 3).map(leak => (
                          <LeakCard
                            key={`demo-${leak.id}`}
                            leak={normaliseLeak(leak)}
                            demo
                            selected={String(selectedLeakId) === String(leak.id)}
                            onOpen={(l) => setSelectedLeakId(l.id)}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {quickChip !== 'fixed' && (
                    <LeakErrorBoundary label="The bleed summary">
                      <BleedSummary leaks={visibleLeaks} isDemo={leaksAreDemo} />
                    </LeakErrorBoundary>
                  )}

                  {quickChip !== 'fixed' && shownLeaks[0] && (
                    <div
                      data-pa-leak-training-bridge="true"
                      style={{
                        marginBottom: S.md,
                        padding: '12px 14px',
                        borderRadius: 7,
                        border: '1px solid #688299',
                        borderTopColor: '#aec0d0',
                        background: 'linear-gradient(180deg, #13253a 0%, #091727 55%, #060e18 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#83deff', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                          1-Tap Training Arena Corrective Drill
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#f4fbff', marginTop: 2 }}>
                          {shownLeaks[0].title}
                        </div>
                        <div style={{ fontSize: 12, color: '#b7cede', marginTop: 2 }}>
                          {shownLeaks[0].situationClass || 'Targeted 10-Hand Spot Remediation'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="pa-btn"
                        data-drill-similar-spot-cta="true"
                        onClick={() => handleTrainDrills(shownLeaks[0])}
                        style={{
                          minHeight: 44,
                          padding: '8px 14px',
                          borderRadius: 7,
                          border: '1px solid #56d8ff',
                          borderTopColor: '#b3eaff',
                          background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 58%, #002b68 100%)',
                          color: '#f4fbff',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        Train Top Detected Leak In Training Arena →
                      </button>
                    </div>
                  )}

                  {hiddenCrossFormatCount > 0 && (
                    <div
                      role="status"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: S.sm,
                        flexWrap: 'wrap',
                        marginBottom: S.md,
                        padding: `${S.sm}px ${S.md}px`,
                        border: `1px solid ${T.border}`,
                        borderRadius: R.sm,
                        background: T.surface,
                      }}
                    >
                      <span style={{ fontSize: F.caption, color: T.textMuted }}>
                        {`${hiddenCrossFormatCount} Cross-Format Or Aggregate ${hiddenCrossFormatCount === 1 ? 'Leak' : 'Leaks'} Hidden By Format Filter.`}
                      </span>
                      <button
                        type="button"
                        className="pa-btn"
                        style={btn('secondary')}
                        onClick={() => updateFormatFilter('all')}
                      >
                        Show All Formats
                      </button>
                    </div>
                  )}

                  {/* Compact single-row search bar (Sort/Format/Status live in Analysis Settings above) */}
                  <div className={toolStyles.instrumentPanel} style={{ ...cardCompact, marginBottom: S.md }}>
                    <div className="leak-search-wrap" style={styles.searchWrap}>
                      <Search size={18} strokeWidth={2} aria-hidden="true" style={{ color: T.textDim, flexShrink: 0 }} />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search Leaks Or Situations"
                        aria-label="Search Leaks"
                        style={styles.searchInput}
                      />
                      {query && (
                        <button
                          type="button"
                          className="pa-btn"
                          aria-label="Clear Search"
                          onClick={() => setQuery('')}
                          style={iconBtn({ transparent: true, color: T.textMuted })}
                        >
                          <X size={18} strokeWidth={2} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  {shownLeaks.length === 0 ? (
                    <EmptyState
                      compact
                      icon={<Search size={22} strokeWidth={2} aria-hidden="true" />}
                      title="No Matching Leaks"
                      body="No leak matches this filter. Clear the search or switch back to All."
                      action={(
                        <button
                          type="button"
                          className="pa-btn"
                          style={btn('secondary')}
                          onClick={handleResetAnalysisSettings}
                        >
                          Reset Filters
                        </button>
                      )}
                    />
                  ) : (
                    <>
                      <ul className="leak-list-grid" style={styles.leakList} role="list">
                        {shownLeaks.map(leak => {
                          const isDemoRow = leaksAreDemo || isDemoLeakId(leak.id);
                          const isDueRow = !isDemoRow && dueLeakIdSet.has(String(leak.id));
                          const isRewardClaimed = Boolean(claimedLeakRewards[leak.id] || leak.tableVerification?.rewardClaimed);
                          return (
                            <LeakCard
                              key={leak.id}
                              leak={leak}
                              demo={isDemoRow}
                              selected={String(selectedLeakId) === String(leak.id)}
                              isDue={isDueRow}
                              rewardClaimed={isRewardClaimed}
                              claimingReward={String(claimingLeakRewardId) === String(leak.id)}
                              onOpen={(l) => setSelectedLeakId(l.id)}
                              onReview={handleOpenHandReview}
                              onPractice={(l) => (isDueRow ? handleStartReview({ leak: l }) : handleTrainDrills(l))}
                              onOpenOverflow={(l) => setOverflowLeakId(l.id)}
                              onClaimReward={handleClaimLiveFixFromCard}
                              progress={isDemoRow
                                ? null
                                : resolutionProgress(reviewRecordById.get(String(leak.id)) || null)}
                            />
                          );
                        })}
                      </ul>
                      {remaining > 0 && (
                        <button
                          type="button"
                          className="pa-btn"
                          style={{ ...btn('secondary', { block: true }), marginTop: S.md }}
                          onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                        >
                          Show {Math.min(PAGE_SIZE, remaining)} More ({remaining} Left)
                        </button>
                      )}
                    </>
                  )}

                  {/* Past leaks · collapsed by default */}
                  {pastLeaks.length > 0 && (
                    <div style={{ marginTop: S.lg }}>
                      <button
                        type="button"
                        className="pa-btn"
                        aria-expanded={pastOpen}
                        onClick={() => setPastOpen(o => !o)}
                        style={styles.disclosureBtn}
                      >
                        <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>Past Leaks ({pastLeaks.length})</span>
                        {pastOpen
                          ? <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
                          : <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />}
                      </button>
                      {pastOpen && (
                        <ul className="leak-list-grid" style={{ ...styles.leakList, marginTop: S.md }} role="list">
                          {pastLeaks.map(leak => (
                            <li key={leak.id} role="listitem" style={{ ...styles.leakCard, opacity: 0.86 }}>
                              <button
                                type="button"
                                className="leak-card pa-btn"
                                onClick={() => setSelectedLeakId(leak.id)}
                                style={styles.leakCardBody}
                                aria-label={`${leak.title}, resolved. Open details.`}
                              >
                                <span style={styles.leakCardHeader}>
                                  <span style={styles.leakCardTitle}>{leak.title}</span>
                                  <ChevronRight size={18} strokeWidth={2} aria-hidden="true" style={{ color: T.textMuted, flexShrink: 0 }} />
                                </span>
                                <span style={styles.leakCardBadges}>
                                  <LeakStatusBadge status="resolved" />
                                  <TableVerificationBadges verification={leak.tableVerification} />
                                  {leak.sourceSystem && <SourceBadge source={leak.sourceSystem} />}
                                </span>
                                <span style={styles.leakCardSituation}>
                                  Situation: {leak.situationClass || 'Not specified'}
                                  {relativeDate(leak.resolvedAt) ? ` · Resolved ${relativeDate(leak.resolvedAt)}` : ''}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
              </>
              )}

              {/* Settings sheet remains accessible while viewing Leaks */}
              {settingsOpen && (
                <LeakErrorBoundary label="Assistant Settings">
                  <CoachingWorkspace
                    userId={userId}
                    leaks={leaks}
                    sharedPayload={coachingPayload}
                    onPayloadUpdated={(nextPayload) => {
                      setCoachingPayload(nextPayload);
                      if (nextPayload?.snapshot) setCoachingSnapshot(nextPayload.snapshot);
                    }}
                    settingsOnly
                    settingsOpen={settingsOpen}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onCloseSettings={() => setSettingsOpen(false)}
                    extraSettingsContent={analysisSettingsDisclosureNode}
                    onOpenLeak={(id) => { setSelectedLeakId(id); setTab('leaks'); }}
                    onOpenHandReview={handleOpenHandReview}
                    onReviewExample={handleReviewExample}
                    onTrain={handleTrainDrills}
                    onStartReview={handleStartReview}
                    onJumpToLeaks={() => { setTab('leaks'); jumpTo('leak-list'); }}
                    onInspectHand={(handId) => openSessionHand(handId, false)}
                    onDrillHand={(handId) => openSessionHand(handId, true)}
                  />
                </LeakErrorBoundary>
              )}
            </section>
          ) : (
            <section id={normalizedTab === 'progress' ? 'leak-progress' : 'leak-coaching'} aria-label={normalizedTab === 'progress' ? 'Progress' : 'Today / Plan'}>
              <LeakErrorBoundary label="The Coaching Workspace">
                <CoachingWorkspace
                  userId={userId}
                  leaks={leaks}
                  section={normalizedTab}
                  initialSection={progressSubsection}
                  initialLeakId={initialEvidenceLeakId}
                  sharedPayload={coachingPayload}
                  onPayloadUpdated={(nextPayload) => {
                    if (userId && nextPayload) writeAssistantCache(userId, 'coaching', nextPayload);
                    setCoachingPayload(nextPayload);
                    if (nextPayload?.snapshot) setCoachingSnapshot(nextPayload.snapshot);
                  }}
                  settingsOpen={settingsOpen}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onCloseSettings={() => setSettingsOpen(false)}
                  extraSettingsContent={analysisSettingsDisclosureNode}
                  onSwitchSection={(nextSection, subView) => {
                    setTab(nextSection);
                    if (subView) setProgressSubsection(subView);
                  }}
                  onOpenLeak={(id) => { setSelectedLeakId(id); setTab('leaks'); }}
                  onOpenHandReview={handleOpenHandReview}
                  onReviewExample={handleReviewExample}
                  onTrain={handleTrainDrills}
                  onStartReview={handleStartReview}
                  onJumpToLeaks={() => { setTab('leaks'); jumpTo('leak-list'); }}
                  onInspectHand={(handId) => openSessionHand(handId, false)}
                  onDrillHand={(handId) => openSessionHand(handId, true)}
                />
              </LeakErrorBoundary>

              {normalizedTab === 'progress' && (
                <div className="leak-insights-grid" style={{ display: 'flex', flexDirection: 'column', gap: S.md, marginTop: S.md }}>
                  <div
                    data-pa-insights-authority="verified-destinations-only"
                    className={toolStyles.instrumentPanel}
                    style={card}
                  >
                    <h3 style={styles.cardHeading}>Open A Verified Report</h3>
                    <p style={styles.detailBody}>
                      The Retired Coach Analytics Used Historical Sandbox Rows That Were Not Sealed
                      Training Attempts. They Are Not Used For Accuracy, Leaderboards, Solver EV,
                      Position Grades, Or Macro-Leak Claims. Choose An Evidence-Backed Destination.
                    </p>
                    <div style={{ display: 'grid', gap: S.sm, marginTop: S.md }}>
                      <button
                        type="button"
                        className="pa-btn"
                        style={btn('primary', { block: true })}
                        onClick={() => router.push('/hub/training/gto-reports?source=personal-assistant-leaks')}
                      >
                        Open Verified Training Reports
                      </button>
                      <button
                        type="button"
                        className="pa-btn"
                        style={btn('secondary', { block: true })}
                        onClick={() => router.push('/hub/training/hand-history-upload?source=personal-assistant-leaks')}
                      >
                        Open Audited Hand Review
                      </button>
                    </div>
                  </div>

                  {/* Archived coach-mode rows are shown without the legacy client grade. */}
                  <div className={toolStyles.instrumentPanel} style={card}>
                    <h3 style={styles.cardHeading}>Archived Coach-Mode Records</h3>
                    {coachLoading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }} aria-busy="true">
                        <Skeleton h={56} />
                        <Skeleton h={56} />
                      </div>
                    ) : coachError ? (
                      <ErrorState title="Coach Stats Unavailable" body={coachError} onRetry={fetchCoachAccuracy} />
                    ) : !Array.isArray(coachAccuracy?.topLeaks) || coachAccuracy.topLeaks.length === 0 ? (
                      <p style={styles.detailBody}>
                        No Archived Coach-Mode Records Are Available. Use Verified Training Or Upload A Hand History For An Audited Review.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
                        {coachAccuracy.topLeaks.map((spot, i) => (
                          <button
                            key={`${spot?.street || 'x'}-${i}`}
                            type="button"
                            className="leak-card pa-btn"
                            style={styles.exampleRow}
                            onClick={() => handleReviewExample()}
                            aria-label={`Open audited hand review for the archived coach record on ${fmtCards(spot?.board)}`}
                          >
                            <span style={styles.exampleLine1}>
                              <span style={styles.exampleCards}>{renderMiniCardChips(spot?.board)}</span>
                              <span style={{ ...styles.exampleEv, ...numeric }}>Ungraded Archive</span>
                            </span>
                            <span style={styles.exampleLine2}>
                              <span style={pill('accent')}>{String(spot?.street || '?').toUpperCase()}</span>
                              <span style={styles.exampleBoard}>
                                Recorded Choice: {spot?.user_pick || 'Not Available'} · Reference Not Verified
                              </span>
                              <ChevronRight size={16} strokeWidth={2} aria-hidden="true" style={{ color: T.textMuted, marginLeft: 'auto' }} />
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
          <HubPageSummary page="personal-assistant-leaks" />
        </main>

        {/* ── Unified + Add / Audit Hands 2-Option BottomSheet ── */}
        <BottomSheet
          open={addHandsOpen}
          onClose={closeAddHands}
          title="Add Or Audit Hands"
          subtitle="Sync Completed Club Arena Hands Or Upload Live Hands"
        >
          <div style={{ display: 'grid', gap: S.md }}>
            {/* Option 1: Sync Club Arena Hands (Obvious Primary Top Option for Arena Players) */}
            <div style={styles.sheetOptionCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.xs }}>
                <span style={pill('accent')}>Primary · Club Arena</span>
                <span style={{ fontSize: F.caption, color: T.textMuted }}>Automatic Watermark Sync</span>
              </div>
              <strong style={{ fontSize: F.h3, color: T.text }}>Sync Club Arena Hands</strong>
              <p style={styles.detailBody}>
                Import And Grade Your Completed Cash And Tournament Hands Played In Club Arena With Verified Solver Matching.
              </p>
              <button
                type="button"
                className="pa-btn"
                style={btn('primary', { block: true, disabled: isDetecting })}
                disabled={isDetecting}
                onClick={() => {
                  closeAddHands();
                  handleRunDetection();
                }}
              >
                <Activity size={18} strokeWidth={2} aria-hidden="true" />
                <span>{auditJob?.status === 'failed' && auditJob?.resumable ? 'Resume Saved Audit' : 'Sync Club Arena Hands'}</span>
              </button>
              {!isDetecting && userId && (
                <button
                  type="button"
                  className="pa-btn"
                  style={btn('secondary', { block: true })}
                  onClick={() => {
                    closeAddHands();
                    handleFullRescan();
                  }}
                >
                  <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
                  <span>Full Re-Audit (Re-Check Older History)</span>
                </button>
              )}
            </div>

            {/* Option 2: Log Or Upload Live Hands (Right Below It) */}
            <div style={styles.sheetOptionCard} data-live-spot-card="insights">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.xs }}>
                <span style={pill('neutral')}>Live &amp; External</span>
                <span style={{ fontSize: F.caption, color: T.textMuted }}>Isolated From Live Rewards</span>
              </div>
              <strong style={{ fontSize: F.h3, color: T.text }}>Log Or Upload Live Hands</strong>
              <p style={styles.detailBody}>
                Log A Live Poker Spot In Seconds Or Upload Hand History Files From PokerStars, GGPoker, ACR, ClubGG, Or 888Poker.
              </p>
              <button
                type="button"
                className="pa-btn"
                style={btn('secondary', { block: true })}
                data-live-spot-trigger="insights"
                onClick={() => {
                  closeAddHands();
                  openLiveSpot('spot');
                }}
              >
                <span>Log Or Upload Live Hands</span>
              </button>
              <button
                type="button"
                className="pa-btn"
                style={btn('ghost', { block: true })}
                onClick={() => {
                  closeAddHands();
                  openLiveSpot('paste');
                }}
              >
                <span>Upload Or Paste .Txt Hand History File</span>
              </button>
            </div>
          </div>
        </BottomSheet>

        {/* ── Advanced Filters & Practice Presets BottomSheet ── */}
        <BottomSheet
          open={filtersOpen}
          onClose={closeFilters}
          title="Filters & Practice Presets"
          subtitle={activeScopeSummary}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
            <Segmented
              idPrefix="sheet-leak-format"
              label="Format (Cash And Tournament Never Mixed)"
              value={formatFilter}
              onChange={(val) => {
                setQuickChip('all');
                updateFormatFilter(val);
              }}
              options={[
                { value: 'all', label: 'All' },
                { value: 'cash', label: 'Cash NLH' },
                { value: 'tournament', label: 'Tournament NLH' },
              ]}
            />
            <Segmented
              idPrefix="sheet-leak-sort"
              label="Sort By"
              value={sortMode}
              onChange={updateSortMode}
              options={[
                { value: 'impact', label: 'Impact' },
                { value: 'recent', label: 'Recent' },
                { value: 'confidence', label: 'Confidence' },
              ]}
            />
            <Segmented
              idPrefix="sheet-leak-status"
              label="Status"
              tone={statusFilter === 'persistent' ? 'warn' : 'accent'}
              columns={2}
              value={statusFilter}
              onChange={(val) => {
                setQuickChip('all');
                updateStatusFilter(val);
              }}
              options={[
                { value: 'all', label: 'All' },
                { value: 'persistent', label: 'Persistent' },
                { value: 'emerging', label: 'Emerging' },
                { value: 'improving', label: 'Improving' },
              ]}
            />
            <Segmented
              idPrefix="sheet-practice-length"
              label="Practice Session Length"
              value={String(practiceLength)}
              onChange={updatePracticeLength}
              options={[
                { value: '5', label: '5 Spots' },
                { value: '10', label: '10 Spots' },
                { value: '20', label: '20 Spots' },
              ]}
            />
            <Segmented
              idPrefix="sheet-practice-pacing"
              label="Drill Pacing"
              value={practiceDifficulty}
              onChange={updatePracticeDifficulty}
              options={[
                { value: 'fundamentals', label: '25s' },
                { value: 'adaptive', label: '15s' },
                { value: 'pressure', label: '10s' },
              ]}
            />
            <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap', marginTop: S.xs }}>
              <button
                type="button"
                className="pa-btn"
                style={{ ...btn('secondary'), flex: 1 }}
                onClick={() => {
                  handleResetAnalysisSettings();
                  closeFilters();
                }}
              >
                <span>Reset Filters</span>
              </button>
              <button
                type="button"
                className="pa-btn"
                style={{ ...btn('primary'), flex: 1 }}
                onClick={closeFilters}
              >
                <span>Apply Filters</span>
              </button>
            </div>
          </div>
        </BottomSheet>

        {/* ── Leak Card 1+1 Secondary Actions Overflow BottomSheet ── */}
        <BottomSheet
          open={Boolean(overflowLeak)}
          onClose={closeOverflowLeak}
          title={overflowLeak?.title || 'Leak Actions'}
          subtitle={overflowLeak?.situationClass || 'Secondary Actions'}
        >
          {overflowLeak && (
            <div style={{ display: 'grid', gap: S.sm }}>
              <button
                type="button"
                className="pa-btn"
                style={styles.sheetActionBtn}
                onClick={() => {
                  const target = overflowLeak;
                  closeOverflowLeak();
                  handleOpenHandReview(target);
                }}
              >
                <span>Review Audited Hand</span>
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="pa-btn"
                style={styles.sheetActionBtn}
                onClick={() => {
                  const target = overflowLeak;
                  closeOverflowLeak();
                  if (target?.id) setInitialEvidenceLeakId(target.id);
                  setTab('progress');
                  setProgressSubsection('evidence');
                }}
              >
                <span>Inspect Evidence</span>
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="pa-btn"
                style={styles.sheetActionBtn}
                onClick={() => {
                  const target = overflowLeak;
                  closeOverflowLeak();
                  handleShareLeak(target);
                }}
              >
                <span>Share Read-Only Link</span>
                <Link2 size={16} strokeWidth={2} aria-hidden="true" />
              </button>
              {!isDemoLeakId(overflowLeak.id) && (
                <button
                  type="button"
                  className="pa-btn"
                  style={styles.sheetActionBtn}
                  disabled={String(resolvingLeakId) === String(overflowLeak.id)}
                  onClick={() => {
                    const target = overflowLeak;
                    closeOverflowLeak();
                    if (target.status === 'resolved') handleReopen(target);
                    else handleMarkResolved(target);
                  }}
                >
                  <span>{overflowLeak.status === 'resolved' ? 'Reopen Leak' : 'Mark Resolved'}</span>
                  <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="pa-btn"
                style={styles.sheetActionBtn}
                onClick={() => {
                  const id = overflowLeak.id;
                  closeOverflowLeak();
                  setSelectedLeakId(id);
                }}
              >
                <span>Details</span>
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          )}
        </BottomSheet>

        {/* ── Live spot logger + external hand-history import ── */}
        {liveSpotOpen && (
          <LeakErrorBoundary label="The live spot logger">
            <LiveSpotQuickEntry
              open
              initialTab={liveSpotTab}
              onClose={closeLiveSpot}
              onAnalyzed={() => { refetchLeaks?.(); refetchStats?.(); }}
            />
          </LeakErrorBoundary>
        )}

        {/* ── Live announcement region for review session ── */}
        <span className="pa-vh" role="status" aria-live="polite">
          {reviewAnnouncement}
        </span>

        {/* ── Review drill (the existing sandbox drill loop, not a second one) ── */}
        {reviewSession && (
          <LeakErrorBoundary
            label="The review drill"
            fallback={(err, reset) => (
              <PanelCrash label="The review drill" error={err} onRetry={() => { reset(); setReviewSession(null); }} />
            )}
          >
            <QuickSpotDrill
              customParams={reviewSession.params}
              reviewLeakId={reviewSession.leakId}
              practiceDifficulty={practiceDifficulty}
              onReviewComplete={handleReviewComplete}
              onClose={closeReviewSession}
            />
          </LeakErrorBoundary>
        )}

        {/* ── Detail sheet ── */}
        <BottomSheet
          open={!!selectedLeak}
          onClose={closeLeakSheet}
          title={selectedLeak?.title || 'Leak'}
          subtitle={selectedLeak?.situationClass || undefined}
          closeLabel="Close leak details"
          ariaLabel={`Leak details: ${selectedLeak?.title || ''}`}
          headerRight={selectedLeak ? (
            <button
              type="button"
              className="pa-btn"
              aria-label="Copy Link To This Leak"
              onClick={() => handleShareLeak(selectedLeak)}
              style={iconBtn({ color: T.textMuted })}
            >
              <Link2 size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        >
          <LeakErrorBoundary label="Leak details">
            {selectedLeak && (
              <LeakDetail
                leak={selectedLeak}
                onOpenHandReview={handleOpenHandReview}
                onReviewExample={handleReviewExample}
                onStartReview={handleStartReview}
                onTrainDrills={handleTrainDrills}
                onMarkResolved={handleMarkResolved}
                onReopen={handleReopen}
                isResolving={resolvingLeakId != null && String(resolvingLeakId) === String(selectedLeak.id)}
                reviewRecord={reviewRecordById.get(String(selectedLeak.id)) || null}
              />
            )}
          </LeakErrorBoundary>
        </BottomSheet>

        <style dangerouslySetInnerHTML={{ __html: `
          .leak-card {
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
          }
          .leak-card:active {
            background: rgba(255, 255, 255, 0.06);
          }
          .leak-card:focus-visible {
            outline: 2px solid ${T.accent};
            outline-offset: 2px;
          }
          .leak-search-wrap:focus-within {
            border-color: #56d8ff;
            outline: 2px solid #83deff;
            outline-offset: 1px;
          }
          .leaks-page {
            background-color: #040D18;
          }
          .leak-skeleton {
            opacity: 0.5;
          }
          @keyframes leakSkeletonPulse {
            0%, 100% { opacity: 0.35; }
            50% { opacity: 0.7; }
          }
          .leak-progress {
            position: relative;
            overflow: hidden;
            height: 6px;
            border-radius: ${R.pill}px;
            background: ${T.surface2};
          }
          .leak-progress > span {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: 100%;
            opacity: 0.6;
            border-radius: ${R.pill}px;
            background: linear-gradient(90deg, ${T.accent}, ${T.accentPress});
          }
          @keyframes leakProgressSlide {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(300%); }
          }
          @media (prefers-reduced-motion: no-preference) {
            .leak-card {
              transition: transform .12s ease, background .12s ease, border-color .12s ease;
            }
            .leak-card:active {
              transform: scale(0.985);
            }
            .leak-skeleton {
              animation: leakSkeletonPulse 1.4s ease-in-out infinite;
            }
            .leak-progress > span {
              width: 40%;
              opacity: 1;
              animation: leakProgressSlide 1.2s ease-in-out infinite;
            }
            .leak-progress-fill {
              transition: transform .24s cubic-bezier(0.22, 1, 0.36, 1);
            }
            .leak-switch-track {
              transition: background .14s ease;
            }
            .leak-switch-knob {
              transition: transform .14s cubic-bezier(0.22, 1, 0.36, 1);
            }
          }
          /* The shell carries its padding as an inline style, which a plain
             rule cannot override · hence !important on this one declaration. */
          @media (min-width: 769px) {
            .leaks-shell {
              max-width: 820px !important;
              padding-left: max(20px, env(safe-area-inset-left, 0px)) !important;
              padding-right: max(20px, env(safe-area-inset-right, 0px)) !important;
            }
            .leak-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
            .leak-list-grid { display: grid !important; grid-template-columns: minmax(0, 1fr); gap: 12px !important; }
            .leak-insights-grid { display: grid !important; grid-template-columns: minmax(0, 1fr); align-items: start; }
          }
        ` }} />
      </div>

      {UpgradePopup}
      <Toaster
        position="top-center"
        containerStyle={{ top: 'calc(env(safe-area-inset-top, 0px) + 72px)', zIndex: Z.toast }}
        toastOptions={{
          style: {
            maxWidth: 'calc(100vw - 32px)',
            fontSize: F.bodySm,
            background: T.surface,
            color: T.text,
            border: `1px solid ${T.border}`,
          },
          duration: 3500,
        }}
      />
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT CELL
// ═══════════════════════════════════════════════════════════════════════════

function StatCell({ label, value, tone, icon, hint, onRetry }) {
  return (
    <div style={styles.statCell}>
      <span style={styles.statCellLabel}>
        {icon}
        {label}
      </span>
      {value === null ? (
        <span className="leak-skeleton" style={{ ...styles.statSkeleton }} aria-label={`${label} loading`} />
      ) : (
        <span style={{ ...styles.statCellValue, color: tone || T.text }}>{value}</span>
      )}
      {hint && <span style={styles.statCellHint}>{hint}</span>}
      {onRetry && (
        <button type="button" className="pa-btn" onClick={onRetry} style={styles.statRetry}>
          <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES (PA_DESIGN_SPEC tokens only)
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
  page: {
    minHeight: '100dvh',
    width: '100%',
    maxWidth: '100vw',
    // `clip`, never `hidden`: a bare `overflow-x: hidden` makes this element a
    // scroll container on WebKit and re-parents every `position: fixed`
    // descendant to it, which is what unsticks the footer and the bottom nav.
    // `clip` gives the same horizontal containment with no scroll container.
    overflowX: 'clip',
    boxSizing: 'border-box',
    background: T.bg,
    fontFamily: FONT,
    color: T.text,
    position: 'relative',
  },
  shell: {
    width: '100%',
    maxWidth: 620,
    margin: '0 auto',
    boxSizing: 'border-box',
    padding: `10px max(8px, env(safe-area-inset-left, 0px))`,
    paddingBottom: 'max(18px, env(safe-area-inset-bottom, 0px))',
  },
  integrityBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: S.sm,
    alignSelf: 'flex-start',
    padding: '6px 12px',
    borderRadius: R.pill,
    background: T.surface2,
    border: `1px solid ${T.borderHi}`,
    fontSize: F.caption,
    fontWeight: 700,
    color: T.textMuted,
    maxWidth: '100%',
  },

  // ── Review queue ──────────────────────────────────────────────────────
  reviewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.sm,
    flexWrap: 'wrap',
    marginBottom: S.sm,
  },
  reviewEyebrow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: S.xs,
    fontSize: F.caption,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: T.textMuted,
  },
  reviewCount: {
    margin: `0 0 ${S.md}px`,
    fontSize: F.h3,
    fontWeight: 700,
    color: T.text,
    lineHeight: 1.35,
  },
  reviewBody: {
    margin: `0 0 ${S.md}px`,
    fontSize: F.bodySm,
    color: T.textMuted,
    lineHeight: 1.45,
  },
  reviewCaughtUp: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    margin: `0 0 ${S.xs}px`,
    fontSize: F.bodySm,
    fontWeight: 700,
    color: T.text,
  },
  reviewTop: {
    marginBottom: S.md,
  },
  reviewTopBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: S.xs,
    width: '100%',
    minHeight: 44,
    padding: S.md,
    boxSizing: 'border-box',
    background: 'linear-gradient(180deg, #1d3249, #0e1e30 45%, #071320 82%, #102438)',
    border: '3px solid transparent',
    borderImage: "url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch",
    borderRadius: R.sm,
    cursor: 'pointer',
    font: 'inherit',
    color: T.text,
    textAlign: 'left',
  },
  reviewTopLabel: {
    fontSize: F.caption,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: T.textDim,
  },
  reviewTopTitle: {
    fontSize: F.body,
    fontWeight: 800,
    color: T.text,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  },
  reviewTopMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    flexWrap: 'wrap',
  },
  reviewTopEv: {
    fontSize: F.caption,
    fontWeight: 700,
    color: T.danger,
  },
  reviewFoot: {
    margin: `${S.sm}px 0 0`,
    fontSize: F.caption,
    color: T.textDim,
    lineHeight: 1.45,
  },
  reviewErrorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    marginTop: S.md,
    padding: S.sm,
    borderRadius: R.sm,
    background: T.warnSoft,
    border: '1px solid rgba(86,216,255,0.45)',
    fontSize: F.caption,
    color: T.warn,
    lineHeight: 1.45,
  },

  // ── Drill chunk placeholder ───────────────────────────────────────────
  drillLoadingBackdrop: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: Z.sheet,
    background: T.scrim,
    display: 'flex',
    alignItems: 'flex-end',
  },
  drillLoadingSheet: {
    width: '100%',
    maxWidth: 760,
    margin: '0 auto',
    boxSizing: 'border-box',
    background: T.surface,
    borderRadius: R.sheet,
    padding: S.lg,
    paddingBottom: `calc(${S.lg}px + env(safe-area-inset-bottom, 0px))`,
    display: 'flex',
    flexDirection: 'column',
    gap: S.sm,
  },

  demoBanner: {
    ...card,
    background: T.warnSoft,
    borderColor: 'rgba(86,216,255,0.48)',
    marginBottom: S.md,
    display: 'flex',
    flexDirection: 'column',
    gap: S.md,
  },
  demoBannerText: {
    margin: 0,
    fontSize: F.bodySm,
    fontWeight: 700,
    color: T.warn,
    lineHeight: 1.45,
  },

  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: S.sm,
    marginBottom: S.md,
  },
  statCell: {
    ...cardCompact,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  statCellLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: S.xs,
    fontSize: F.caption,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: T.textMuted,
  },
  statCellValue: {
    ...numeric,
    fontSize: 20,
    fontWeight: 800,
    color: T.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statCellHint: {
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.4,
  },
  statSkeleton: {
    display: 'block',
    height: 20,
    width: '60%',
    borderRadius: R.sm,
    background: T.surface2,
  },
  statRetry: {
    ...btn('ghost'),
    minHeight: 44,
    padding: '0 8px',
    marginTop: S.xs,
    alignSelf: 'flex-start',
    fontSize: F.caption,
    color: T.accent,
  },

  sectionHeading: {
    fontSize: F.label,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: T.textMuted,
    fontFamily: DATA_FONT,
    margin: `0 0 ${S.md}px`,
  },
  cardHeading: {
    fontSize: F.h2,
    fontWeight: 700,
    fontFamily: DISPLAY_FONT,
    color: T.text,
    margin: `0 0 ${S.md}px`,
  },

  detectStepText: {
    margin: `${S.sm}px 0 0`,
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
  },
  detectionBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    marginTop: S.md,
    padding: `${S.sm}px ${S.sm}px ${S.sm}px ${S.md}px`,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid',
    borderRadius: R.sm,
    fontSize: F.bodySm,
    fontWeight: 600,
    lineHeight: 1.45,
  },

  skeletonCard: {
    height: 132,
    background: T.surface2,
    border: `1px solid ${T.border}`,
    borderRadius: R.md,
  },

  // Bleed summary
  bleedHeadline: {
    fontSize: F.h3,
    fontWeight: 700,
    color: T.text,
    margin: 0,
    lineHeight: 1.35,
  },
  bleedSub: {
    fontSize: F.caption,
    color: T.textMuted,
    margin: `${S.xs}px 0 ${S.md}px`,
    lineHeight: 1.45,
  },
  bleedBar: {
    display: 'flex',
    width: '100%',
    height: 10,
    borderRadius: R.pill,
    overflow: 'hidden',
    background: T.surface2,
  },
  bleedLegend: {
    listStyle: 'none',
    margin: `${S.md}px 0 0`,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: S.sm,
  },
  bleedLegendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    minWidth: 0,
  },
  bleedLegendTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: F.caption,
    color: T.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  bleedLegendValue: {
    ...numeric,
    fontSize: F.caption,
    fontWeight: 700,
    color: T.text,
    flexShrink: 0,
  },

  // Search / filters
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    padding: `0 ${S.sm}px 0 ${S.md}px`,
    minHeight: 48,
    background: T.surface2,
    border: `1px solid ${T.borderHi}`,
    borderRadius: R.sm,
    boxSizing: 'border-box',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: T.text,
    fontSize: F.input,
    fontFamily: 'inherit',
    minHeight: 44,
    padding: 0,
  },

  // Leak list
  leakList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: S.md,
  },
  leakCard: {
    ...card,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: S.md,
    padding: S.md,
  },
  leakCardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: S.sm,
    width: '100%',
    minWidth: 0,
    minHeight: 44,
    padding: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: R.sm,
    textAlign: 'left',
    cursor: 'pointer',
    font: 'inherit',
    color: T.text,
  },
  leakCardSelected: {
    borderColor: T.accent,
    background: T.accentSoft,
  },
  leakCardDemo: {
    borderStyle: 'dashed',
    borderColor: 'rgba(86,216,255,0.48)',
  },
  leakCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: S.sm,
    width: '100%',
    minWidth: 0,
  },
  leakCardTitle: {
    flex: '1 1 180px',
    minWidth: 0,
    fontSize: F.h3,
    fontWeight: 700,
    fontFamily: DISPLAY_FONT,
    color: T.text,
    lineHeight: 1.3,
  },
  leakCardFinding: {
    fontSize: F.bodySm,
    fontWeight: 600,
    color: '#F1F5FC',
    lineHeight: 1.45,
  },
  leakCardMetrics: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: S.sm,
    minWidth: 0,
  },
  leakCardEv: {
    ...numeric,
    fontSize: F.body,
    fontWeight: 700,
    color: T.danger,
  },
  leakCardMetricDim: {
    fontSize: F.caption,
    color: T.textMuted,
  },
  leakCardMetricStrong: {
    ...numeric,
    fontSize: F.caption,
    fontWeight: 700,
    color: T.textMuted,
  },
  leakCardBadges: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: S.sm,
  },
  leakCardSituation: {
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
  },
  leakCardHint: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: S.xs,
    fontSize: F.caption,
    fontWeight: 700,
    color: T.warn,
    lineHeight: 1.4,
  },
  onePlusOneBar: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    width: '100%',
    paddingTop: S.xs,
    borderTop: '1px solid rgba(140, 161, 180, 0.16)',
  },
  overflowIconBtn: {
    minWidth: 44,
    minHeight: 44,
    width: 44,
    height: 44,
    padding: 0,
    borderRadius: R.sm,
    border: '3px solid transparent',
    borderImage: "url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch",
    background: 'linear-gradient(180deg, #263F58, #112338 39%, #071420 77%, #12283C)',
    color: '#E4EEF7',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  sheetOptionCard: {
    ...cardCompact,
    display: 'flex',
    flexDirection: 'column',
    gap: S.sm,
    padding: S.md,
  },
  sheetActionBtn: {
    ...btn('secondary', { block: true }),
    minHeight: 48,
    justifyContent: 'space-between',
    borderColor: 'rgba(140, 161, 180, 0.24)',
    background: '#08101A',
  },
  evidenceSummaryGrid: {
    margin: `${S.sm}px 0 0`,
    padding: 0,
    display: 'grid',
    gap: 6,
  },
  evidenceSummaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: S.sm,
    paddingBottom: 6,
    borderBottom: '1px solid rgba(140, 161, 180, 0.16)',
  },
  evidenceSummaryLabel: {
    fontSize: F.caption,
    fontWeight: 700,
    color: T.textMuted,
  },
  evidenceSummaryValue: {
    margin: 0,
    fontSize: F.caption,
    fontWeight: 700,
    color: T.text,
    textAlign: 'right',
  },

  disclosureBtn: {
    ...btn('secondary', { block: true }),
    justifyContent: 'space-between',
    fontSize: F.bodySm,
  },

  // Detail sheet
  detailBadges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: S.sm,
    marginBottom: S.md,
  },
  detailMetaLine: {
    fontSize: F.caption,
    color: T.textMuted,
    margin: `0 0 ${S.md}px`,
  },
  // ── progress to resolution ────────────────────────────────────────────────
  leakCardProgress: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    minWidth: 0,
  },
  leakCardProgressLabel: {
    fontSize: F.caption,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  progressTrack: {
    display: 'block',
    flex: 1,
    minWidth: 0,
    height: 6,
    borderRadius: 999,
    background: T.surface3,
    overflow: 'hidden',
  },
  progressFill: {
    display: 'block',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    transformOrigin: 'left center',
  },
  progressHeaderRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: S.sm,
    marginBottom: S.xs,
  },
  progressPercent: {
    fontSize: F.h2,
    fontWeight: 700,
  },
  progressTrend: {
    fontSize: F.caption,
    fontWeight: 600,
  },
  progressStageCopy: {
    fontSize: F.bodySm,
    color: T.textMuted,
    margin: `${S.sm}px 0 ${S.md}px`,
    lineHeight: 1.5,
  },
  progressHistoryWrap: {
    marginBottom: S.md,
  },
  progressHistoryStrip: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 4,
    height: 44,
    padding: `0 2px`,
  },
  progressHistoryBar: {
    display: 'block',
    flex: 1,
    maxWidth: 22,
    minWidth: 6,
    borderRadius: 3,
  },
  progressHistoryCaption: {
    display: 'block',
    fontSize: F.caption,
    color: T.textDim,
    marginTop: S.xs,
  },
  progressMetaLine: {
    fontSize: F.caption,
    color: T.textMuted,
    margin: 0,
  },

  statTileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: S.sm,
    marginBottom: S.lg,
  },
  statTile: {
    ...cardCompact,
    background: T.surface2,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  statTileLabel: {
    fontSize: F.caption,
    fontWeight: 700,
    color: T.textMuted,
    lineHeight: 1.3,
  },
  statTileValue: {
    ...numeric,
    fontSize: 18,
    fontWeight: 800,
  },
  detailSection: {
    marginBottom: S.lg,
  },
  detailSectionTitle: {
    fontSize: F.h2,
    fontWeight: 700,
    fontFamily: DISPLAY_FONT,
    color: T.text,
    margin: `0 0 ${S.sm}px`,
  },
  detailBody: {
    fontSize: F.bodySm,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: 0,
  },
  detailNote: {
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: `${S.sm}px 0 0`,
  },
  helperText: {
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: `${S.sm}px 0 0`,
  },

  // Trend
  trendHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.sm,
    flexWrap: 'wrap',
    marginBottom: S.sm,
  },
  trendHeaderLabel: {
    fontSize: F.caption,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: T.textMuted,
  },
  trendEmpty: {
    ...cardCompact,
    background: 'transparent',
    borderStyle: 'dashed',
    borderColor: T.borderHi,
    display: 'flex',
    flexDirection: 'column',
    gap: S.md,
  },
  trendEmptyText: {
    fontSize: F.bodySm,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: 0,
  },
  miniTile: {
    ...cardCompact,
    background: T.surface2,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  miniTileLabel: {
    fontSize: F.caption,
    fontWeight: 700,
    color: T.textMuted,
  },
  miniTileValue: {
    ...numeric,
    fontSize: 20,
    fontWeight: 800,
  },
  trendScaleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: S.sm,
    flexWrap: 'wrap',
    marginTop: S.xs,
  },
  trendScaleText: {
    fontSize: F.caption,
    color: T.textMuted,
  },
  /* MOBILE PHASE 4. This was a deliberate horizontal snap carousel, and the
     reasoning behind it was sound: one auto-column per point with no minimum
     squeezed 7 runs to ~36px and 12 runs to ~21px at 375, breaking the 44x44
     tap target and clipping the % / date labels. But a carousel solves that by
     hiding points off the right edge, which is the "slide to see" Dan banned
     outright, and the trend is only readable when you can see the whole run.
     A WRAPPING row keeps the 44px targets AND shows every point: five per row
     at 375, as many as fit above it. */
  trendPointRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: S.sm,
    marginTop: S.md,
    paddingBottom: S.xs,
  },
  trendPointBtn: {
    display: 'flex',
    flex: '1 0 auto',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 44,
    minWidth: 60,
    padding: '4px 8px',
    borderRadius: R.sm,
    border: `1px solid ${T.border}`,
    background: T.surface2,
    color: T.text,
    cursor: 'pointer',
    font: 'inherit',
  },
  trendPointValue: {
    ...numeric,
    fontSize: F.caption,
    fontWeight: 800,
    color: T.text,
  },
  trendPointDate: {
    fontSize: F.caption,
    color: T.textMuted,
  },
  trendCaption: {
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: `${S.sm}px 0 0`,
  },

  // Example rows
  exampleRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: S.xs,
    width: '100%',
    minHeight: 56,
    padding: `${S.md}px`,
    background: T.surface2,
    border: `1px solid ${T.border}`,
    borderRadius: R.sm,
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    color: T.text,
  },
  exampleLine1: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.sm,
    width: '100%',
    minWidth: 0,
  },
  exampleLine2: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    width: '100%',
    minWidth: 0,
  },
  exampleCards: {
    fontSize: F.bodySm,
    fontWeight: 700,
    color: T.text,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  exampleBoard: {
    fontSize: F.caption,
    color: T.textMuted,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  exampleEv: {
    ...numeric,
    fontSize: F.caption,
    fontWeight: 700,
    color: T.danger,
    flexShrink: 0,
  },
  miniCardRow: {
    display: 'inline-flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    verticalAlign: 'middle',
  },
  miniCardChip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1px 6px',
    borderRadius: 5,
    border: '1px solid rgba(140, 161, 180, 0.35)',
    background: '#060E18',
    fontFamily: DATA_FONT,
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.25,
    letterSpacing: '0.01em',
  },

  // Fix cards
  fixGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: S.md,
    marginBottom: S.md,
  },
  fixCard: {
    ...cardCompact,
    background: T.surface2,
    display: 'flex',
    flexDirection: 'column',
    gap: S.sm,
  },
  fixCardRecommended: {
    borderColor: T.accent,
    background: T.accentSoft,
  },
  fixHead: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    flexWrap: 'wrap',
  },
  fixTitle: {
    fontSize: F.h3,
    fontWeight: 700,
    color: T.text,
    margin: 0,
    minWidth: 0,
  },
  fixText: {
    fontSize: F.bodySm,
    color: T.textMuted,
    lineHeight: 1.45,
    margin: 0,
  },

  // Auto-guidance switch
  guidanceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: S.md,
    width: '100%',
    minHeight: 56,
    padding: S.md,
    background: T.surface2,
    border: `1px solid ${T.border}`,
    borderRadius: R.sm,
    cursor: 'pointer',
    font: 'inherit',
    color: T.text,
    textAlign: 'left',
  },
  guidanceTitle: {
    display: 'block',
    fontSize: F.bodySm,
    fontWeight: 700,
    color: T.text,
  },
  guidanceBody: {
    display: 'block',
    fontSize: F.caption,
    color: T.textMuted,
    lineHeight: 1.45,
    marginTop: 2,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: R.pill,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    padding: 3,
    boxSizing: 'border-box',
  },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#FFFFFF',
  },
};
