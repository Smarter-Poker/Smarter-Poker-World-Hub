/**
 * LEAK FINDER — Post-Session Analysis
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
  Clock, Dumbbell, Flame, GraduationCap, Inbox, Link2, Lock, RefreshCw, RotateCcw, Search,
  Sparkles, Target, TrendingDown, TrendingUp, X, Zap,
} from 'lucide-react';

import SEOHead from '../../../src/components/seo/SEOHead';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { useLeaks, useAssistantStats, useLeakDetection, useLeakHandExamples } from '../../../src/hooks/useAssistant';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import {
  T, F, S, R, Z, FONT, card, cardCompact, btn, iconBtn, pill, numeric,
} from '../../../src/components/sandbox/paTokens';
import {
  PAStyles, BottomSheet, Skeleton, EmptyState, ErrorState, Segmented,
  safeStorage, usePrefersReducedMotion,
} from '../../../src/components/sandbox/paKit';
import {
  dueQueueAll, reviewStats, leakToDrill, migrateRecord, resolutionProgress,
  MAX_QUEUE as REVIEW_MAX_QUEUE, SCHEMA_VERSION as REVIEW_SCHEMA_VERSION,
  MAX_INTERVAL_DAYS as REVIEW_MAX_INTERVAL_DAYS,
  RETIRE_AFTER_STRONG as REVIEW_RETIRE_AFTER_STRONG,
} from '../../../src/lib/sandbox/leakReview';

// ═══════════════════════════════════════════════════════════════════════════
// CODE-SPLIT ANALYTICS (Insights tab only — keeps them off the critical path)
// ═══════════════════════════════════════════════════════════════════════════

const SessionAnalytics = dynamic(
  () => import('../../../src/components/sandbox/SessionAnalytics'),
  { ssr: false, loading: () => <PanelSkeleton label="Loading session analytics" /> },
);
const CoachLeaderboard = dynamic(
  () => import('../../../src/components/sandbox/CoachLeaderboard'),
  { ssr: false, loading: () => <PanelSkeleton label="Loading leaderboard" /> },
);
const MacroLeakDetector = dynamic(
  () => import('../../../src/components/sandbox/MacroLeakDetector'),
  { ssr: false, loading: () => <PanelSkeleton label="Loading macro leak detector" /> },
);
const LeakHeatmap = dynamic(
  () => import('../../../src/components/sandbox/LeakHeatmap'),
  { ssr: false, loading: () => <PanelSkeleton label="Loading leak heatmap" /> },
);

// The review drill is the existing sandbox drill loop — never a second drill UI.
// It is only ever mounted after a tap, so it stays off the first paint.
const QuickSpotDrill = dynamic(
  () => import('../../../src/components/sandbox/QuickSpotDrill'),
  { ssr: false, loading: () => <DrillSheetSkeleton /> },
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

function fmtCards(cards) {
  if (Array.isArray(cards)) return cards.filter(Boolean).join(' ') || '—';
  if (typeof cards === 'string' && cards.trim()) return cards.trim();
  return '—';
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** formatLeakTitle() is lossy, but reversible enough to recover the slug. */
function slugFromTitle(title) {
  if (!title || typeof title !== 'string') return null;
  return title.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Total BB bled by a leak = per-occurrence EV loss x occurrences. */
function totalBleed(leak) {
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
  return s || '—';
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
  if (/not logged in|unauthor|401|expired|invalid token/i.test(msg)) return 'Your session expired — sign in again to run detection.';
  if (/failed to fetch|network|offline/i.test(msg)) return 'You appear to be offline. Reconnect and try again.';
  return msg;
}

function friendlyLoadError(err) {
  const msg = String(err || '').trim();
  if (/401|unauthor|expired|invalid token/i.test(msg)) return 'Your session expired — sign in again to see your leaks.';
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
// ERROR BOUNDARY — a recoverable panel instead of a blank route
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
    <div style={{ ...card, borderColor: 'rgba(239,68,68,0.4)', background: T.dangerSoft }} role="alert">
      <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginBottom: S.sm }}>
        <AlertTriangle size={18} strokeWidth={2} color={T.danger} aria-hidden="true" />
        <span style={{ fontSize: F.bodySm, fontWeight: 700, color: T.danger }}>
          {label || 'This panel'} could not be displayed
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
    <div style={styles.drillLoadingBackdrop} role="status" aria-live="polite" aria-label="Loading review drill">
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
//   • the server (GET/POST /api/assistant/leaks/review) — authoritative, but
//     answers persisted:false until the leak_review_state table is migrated;
//   • localStorage, written by QuickSpotDrill after a review run.
// Read-through merges the two with the SERVER WINNING, so a device copy can
// never resurrect a schedule the account has already moved on from.

const REVIEW_STORE_KEY = `pa-leak-review-v${REVIEW_SCHEMA_VERSION}`;

/** Local records as an array. Never throws; a corrupt blob reads as empty. */
function readLocalReviewRecords() {
  try {
    const raw = safeStorage.get(REVIEW_STORE_KEY, null);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const map = (parsed.records && typeof parsed.records === 'object' && !Array.isArray(parsed.records))
      ? parsed.records
      : parsed;
    if (!map || typeof map !== 'object' || Array.isArray(map)) return [];
    return Object.keys(map)
      .map((key) => {
        const value = map[key];
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        return value.leakId ? value : { ...value, leakId: key };
      })
      .filter(Boolean);
  } catch (e) {
    console.warn('[LeakFinder] local review store unreadable:', e?.message || e);
    return [];
  }
}

/**
 * Copy of `obj` without undefined/null values, so spreading a server row over a
 * local record cannot blank a field the row never mentioned.
 * (`{ ...a, ...{ x: undefined } }` sets x to undefined — silently losing a.x.)
 */
function definedOnly(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  try {
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (value !== undefined && value !== null) out[key] = value;
    }
  } catch (e) {
    return out;
  }
  return out;
}

/**
 * The API row shape uses updatedAt where the scheduler expects lastReviewedAt.
 * Mapping it keeps the streak and re-detection logic honest for server rows.
 */
function fromServerReviewRecord(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    ...row,
    lastReviewedAt: row.updatedAt || row.createdAt || null,
  };
}

/** 'in 3 days' / 'tomorrow' / 'on 12 Sep' — never a countdown that lies. */
function dueInLabel(iso, nowMs) {
  const t = new Date(iso || '').getTime();
  if (!Number.isFinite(t) || !Number.isFinite(nowMs) || nowMs <= 0) return null;
  const days = Math.ceil((t - nowMs) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  try {
    return `on ${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  } catch (e) {
    return `in ${days} days`;
  }
}

/** Why this leak is at the top of the queue — stated plainly, never inflated. */
function queueReason(entry) {
  if (!entry) return '';
  if (entry.isNew) return 'Not drilled yet';
  if (entry.revived) return 'Detected again since your last review';
  const overdue = Math.floor(num(entry.overdueDays));
  if (overdue >= 1) return `${overdue} day${overdue === 1 ? '' : 's'} overdue`;
  return 'Due today';
}

function ReviewSkeletonCard() {
  return (
    <section style={{ ...card, marginBottom: S.md }} aria-busy="true" aria-label="Loading your review queue">
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
        <Skeleton h={14} w="40%" />
        <Skeleton h={22} w="70%" />
        <Skeleton h={48} />
      </div>
    </section>
  );
}

/**
 * "Due for review" — the top of the Leaks tab.
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
        Due for review
      </span>
      {num(stats?.streak) > 0 && (
        <span style={{ ...pill('warn'), ...numeric }}>
          <Flame size={12} strokeWidth={2.5} aria-hidden="true" />
          {num(stats.streak)}-day streak
        </span>
      )}
    </div>
  );

  const errorNote = error ? (
    <div style={styles.reviewErrorRow} role="status">
      <span style={{ flex: 1, minWidth: 0 }}>
        Your saved schedule could not be loaded — showing what is on this device.
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
      <section style={{ ...card, marginBottom: S.md }} aria-label="Review queue">
        {heading}
        {/* No button here on purpose: the detection control sits immediately
            below, and two identical buttons a thumb apart reads as a bug. */}
        <p style={{ ...styles.reviewBody, marginBottom: 0 }}>
          {isDetecting
            ? 'Detection is running — anything it finds will be waiting here as a scheduled review.'
            : isDemo
              ? 'Reviews start on your own hands. Run leak detection below and each leak found becomes a scheduled, repeating drill.'
              : 'No review queue yet. Run leak detection below and each leak found becomes a scheduled, repeating drill.'}
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
      <section style={{ ...card, marginBottom: S.md }} aria-label="Review queue">
        {heading}
        <p style={styles.reviewCaughtUp}>
          <CheckCircle2 size={18} strokeWidth={2} color={T.success} aria-hidden="true" />
          <span>Nothing due right now.</span>
        </p>
        <p style={styles.reviewBody}>
          {nextLabel
            ? `Your next review is ${nextLabel}. Drilling early is fine — tap any leak below.`
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
    <section style={{ ...card, marginBottom: S.md }} aria-label="Review queue">
      {heading}

      {/* `queue` is capped at MAX_QUEUE for the session, but the count states
          the REAL total — exactly ten due leaks must not read as "10+". */}
      <p style={styles.reviewCount}>
        <span style={{ ...numeric, color: T.accent, fontWeight: 800 }}>{total}</span>
        {' '}leak{total === 1 ? '' : 's'} ready to drill
      </p>

      <div style={styles.reviewTop}>
        <button
          type="button"
          className="leak-card pa-btn"
          onClick={() => onOpenLeak && onOpenLeak(leak)}
          style={styles.reviewTopBtn}
          aria-label={`First up: ${leak.title || 'this leak'}. Open details.`}
        >
          <span style={styles.reviewTopLabel}>First up</span>
          <span style={styles.reviewTopTitle}>{leak.title || 'Your top leak'}</span>
          <span style={styles.reviewTopMeta}>
            <span style={pill(top.isNew ? 'accent' : 'warn')}>
              <Clock size={12} strokeWidth={2} aria-hidden="true" />
              {queueReason(top)}
            </span>
            {impact > 0 && (
              <span style={{ ...styles.reviewTopEv, ...numeric }}>~{impact.toFixed(1)} BB bled</span>
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
        {startable ? 'Start review' : 'Practise this leak'}
      </button>

      <p style={styles.reviewFoot}>
        {startable
          ? (total > 1
            ? `A timed drill on this leak. ${total - 1} more waiting after it.`
            : 'A timed drill on this leak — your score sets the next review date.')
          : 'This leak has no matching drill street, so this opens the sandbox instead.'}
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
  const isTraining = source === 'training_arena';
  return (
    <span style={pill(isTraining ? 'accent' : 'purple')}>
      {isTraining
        ? <GraduationCap size={12} strokeWidth={2} aria-hidden="true" />
        : <Zap size={12} strokeWidth={2} aria-hidden="true" />}
      {isTraining ? 'Training Arena' : 'Live Play'}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TREND CHART — responsive SVG, no fixed pixel width, tap-to-read points
// ═══════════════════════════════════════════════════════════════════════════

function TrendStatTiles({ current, optimal, color }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: S.sm }}>
      <div style={styles.miniTile}>
        <span style={styles.miniTileLabel}>You</span>
        <span style={{ ...styles.miniTileValue, color }}>{Number.isFinite(current) ? `${current.toFixed(0)}%` : '—'}</span>
      </div>
      <div style={styles.miniTile}>
        <span style={styles.miniTileLabel}>Optimal</span>
        <span style={{ ...styles.miniTileValue, color: T.success }}>{Number.isFinite(optimal) ? `${optimal.toFixed(0)}%` : '—'}</span>
      </div>
    </div>
  );
}

function TrendChart({ data, optimal, current, status }) {
  const points = useMemo(() => coerceTrendPoints(data), [data]);
  const [activeIdx, setActiveIdx] = useState(null);

  const meta = statusMeta(status);
  const lineColor = meta.color;
  const optimalVal = Number.isFinite(Number(optimal)) ? Number(optimal) : null;
  const currentVal = Number.isFinite(Number(current)) ? Number(current) : null;

  const deltaPts = (currentVal !== null && optimalVal !== null) ? currentVal - optimalVal : null;

  const header = (
    <div style={styles.trendHeader}>
      <span style={styles.trendHeaderLabel}>Frequency vs optimal</span>
      {deltaPts !== null && (
        <span style={{ ...pill(meta.tone), ...numeric }}>
          {Math.abs(deltaPts).toFixed(1)} pts {deltaPts >= 0 ? 'above' : 'below'} optimal
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
            Not enough history yet — this leak needs at least two detection runs to plot a trend.
          </p>
          <TrendStatTiles current={currentVal} optimal={optimalVal} color={lineColor} />
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
  const minVal = Math.min(...bounds) - 5;
  const maxVal = Math.max(...bounds) + 5;
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
    <div>
      {header}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', width: '100%', height: 'auto', maxWidth: '100%' }}
        role="img"
        aria-label={`Frequency trend from ${points[0].date} to ${points[points.length - 1].date}. Latest ${points[points.length - 1].value} percent.`}
      >
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

        {areaPath && <path d={areaPath} fill={`${lineColor}22`} />}
        {linePath && (
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {points.map((p, i) => (
          <circle
            key={`${p.date}-${i}`}
            cx={getX(i)} cy={getY(p.value)}
            r={activeIdx === i ? 7 : 5}
            fill={activeIdx === i ? '#FFFFFF' : lineColor}
            stroke={lineColor}
            strokeWidth="2"
          />
        ))}
      </svg>

      {/* Axis + scale info as HTML so font sizes stay in CSS pixels */}
      <div style={styles.trendScaleRow}>
        <span style={styles.trendScaleText}>
          Range {minVal.toFixed(0)}%–{maxVal.toFixed(0)}%
        </span>
        {optimalVal !== null && (
          <span style={styles.trendScaleText}>
            <span aria-hidden="true" style={{ display: 'inline-block', width: 14, borderTop: `2px dashed ${T.success}`, marginRight: 6, verticalAlign: 'middle' }} />
            Optimal {optimalVal.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Tap-to-read points (no hover-only information) */}
      <div style={styles.trendPointRow} data-hscroll="true" role="group" aria-label="Trend data points">
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
            <span style={styles.trendPointValue}>{p.value.toFixed(0)}%</span>
            <span style={styles.trendPointDate}>{shortPointLabel(p.date)}</span>
          </button>
        ))}
      </div>

      <p style={styles.trendCaption} aria-live="polite">
        {active
          ? `${active.date}: you played this spot at ${active.value.toFixed(1)}%${optimalVal !== null ? ` (optimal ${optimalVal.toFixed(0)}%)` : ''}.`
          : points.length < 2
            ? 'Only one detection run so far — run detection again to see a trend line.'
            : 'Tap a point to read that period.'}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BLEED SUMMARY — EV-ranked headline + stacked attribution bar
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
    <section style={{ ...card, marginBottom: S.md }} aria-label="EV bleed summary">
      <h2 style={styles.bleedHeadline}>
        {isDemo ? 'Sample data: ' : 'You are bleeding '}
        <span style={{ ...numeric, color: T.danger, fontWeight: 800 }}>~{total.toFixed(1)} BB</span>
        {' '}across {leaks.length} active leak{leaks.length === 1 ? '' : 's'}
      </h2>
      <p style={styles.bleedSub}>Ranked by total EV lost (per-occurrence loss x occurrences).</p>

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

// ═══════════════════════════════════════════════════════════════════════════
// LEAK CARD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compact fix-progress row shared by the card list. Derived entirely from
 * graded drill sessions (resolutionProgress) — renders nothing until the leak
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
        <span style={{ ...styles.progressFill, width: `${progress.percent}%`, background: tone }} />
      </span>
      <span style={{ ...styles.leakCardProgressLabel, color: progress.retired ? T.success : T.textMuted }}>
        {progressLabel(progress)}
      </span>
    </span>
  );
}

function LeakCard({ leak, onOpen, onPractice, selected, demo, progress }) {
  const ev = Math.abs(num(leak.evLossBB));
  const occ = Math.max(0, num(leak.occurrenceCount));
  const total = ev * occ;
  const meta = statusMeta(leak.status);
  const lowConfidence = leak.confidence === 'low';

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
        aria-label={`${leak.title}. ${meta.label}. ${ev.toFixed(2)} BB lost per occurrence over ${occ} spots. Open details.`}
        style={styles.leakCardBody}
      >
        <span style={styles.leakCardHeader}>
          <span style={styles.leakCardTitle}>{leak.title}</span>
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" style={{ color: T.textMuted, flexShrink: 0 }} />
        </span>

        <span style={styles.leakCardMetrics}>
          <span style={styles.leakCardEv}>-{ev.toFixed(2)} BB</span>
          <span style={styles.leakCardMetricDim}>per spot</span>
          <span style={styles.leakCardMetricDim}>{occ} spot{occ === 1 ? '' : 's'}</span>
          <span style={styles.leakCardMetricStrong}>~{total.toFixed(1)} BB total</span>
        </span>

        <LeakCardProgress progress={progress} />

        <span style={styles.leakCardBadges}>
          <LeakStatusBadge status={leak.status} />
          {leak.sourceSystem && <SourceBadge source={leak.sourceSystem} />}
          <ConfidenceBadge confidence={leak.confidence} />
        </span>

        <span style={styles.leakCardSituation}>
          Situation: {leak.situationClass || 'Not specified'}
        </span>

        {lowConfidence && (
          <span style={styles.leakCardHint}>
            <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
            Small sample — needs more hands before this is conclusive.
          </span>
        )}
      </button>

      {onPractice && (
        <button
          type="button"
          className="pa-btn"
          onClick={() => onPractice(leak)}
          style={{ ...btn('secondary', { block: true }), color: T.accent, borderColor: 'rgba(69,153,255,0.45)' }}
        >
          <Target size={18} strokeWidth={2} aria-hidden="true" />
          Practise this leak
        </button>
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
        <span style={styles.guidanceTitle}>Auto guidance {value ? 'ON' : 'OFF'}</span>
        <span style={styles.guidanceBody}>
          {value ? 'Highlighting the top suggested fix automatically.' : 'Suggesting one fix at a time.'}
        </span>
      </span>
      <span aria-hidden="true" style={{ ...styles.switchTrack, background: value ? T.accent : T.surface3 }}>
        <span style={{ ...styles.switchKnob, transform: value ? 'translateX(18px)' : 'translateX(0)' }} />
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
  early: 'Early days — each passed drill pushes the next review further out.',
  'on-track': 'On track. Keep passing reviews and the gap between them keeps growing.',
  'nearly-there': 'Nearly there — a few more strong sessions at the long interval retires this leak.',
  mastered: 'Mastered. This leak stays quiet unless detection sees it again in your real hands.',
};

/**
 * "Progress to resolution" — the leak visibly closing as it gets drilled.
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
    <section style={styles.detailSection} aria-label="Progress to resolution">
      <h3 style={styles.detailSectionTitle}>Progress to resolution</h3>

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
        <span style={{ ...styles.progressFill, width: `${progress.percent}%`, background: tone }} />
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
                Session accuracy, oldest to newest
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
  leak, onPracticeSandbox, onPracticeExample, onTrainDrills,
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
  const situation = leak.situationClass || 'these';
  const ev = Math.abs(num(leak.evLossBB));
  const occ = Math.max(0, num(leak.occurrenceCount));

  const sandboxCopy = drill
    ? `Practice ${situation} spots in a controlled environment. The sandbox opens on the "${drill}" drill targeting this exact leak.`
    : `Practice ${situation} spots in a controlled environment with coach mode focused on this leak.`;
  const trainingCopy = drill
    ? `Focus on fixing "${leak.title}" with targeted exercises. The "${drill}" drill emphasises the key decisions behind ${situation} spots.`
    : `Open the Training Arena filtered to ${situation} spots so you can drill the decision repeatedly.`;

  const resolvedWhen = relativeDate(leak.resolvedAt);
  const trackingSince = relativeDate(leak.firstDetected);

  return (
    <div>
      {/* Badges */}
      <div style={styles.detailBadges}>
        <LeakStatusBadge status={leak.status} />
        {leak.sourceSystem && <SourceBadge source={leak.sourceSystem} />}
        <ConfidenceBadge confidence={leak.confidence} />
      </div>

      {(trackingSince || resolvedWhen) && (
        <p style={styles.detailMetaLine}>
          {leak.status === 'resolved' && resolvedWhen ? `Resolved ${resolvedWhen}` : null}
          {leak.status === 'resolved' && resolvedWhen && trackingSince ? ' · ' : null}
          {trackingSince ? `Tracking since ${trackingSince}` : null}
        </p>
      )}

      {/* Stat tiles */}
      <div style={styles.statTileGrid}>
        <StatTile label="EV / spot" value={`-${ev.toFixed(2)}`} tone={T.danger} />
        <StatTile label="Occurrences" value={String(occ)} />
        <StatTile label="Total BB lost" value={`~${(ev * occ).toFixed(1)}`} tone={T.danger} />
      </div>

      {/* Progress to resolution — real leaks only; a demo leak has no record */}
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
          />
        </LeakErrorBoundary>
        {leak.frequencyIsEstimated && (
          <p style={styles.detailNote}>Frequency is estimated from training repetitions, not a measured sample.</p>
        )}
      </section>

      {/* How to fix it — the Grok-generated suggestion detect.js persists */}
      <section style={styles.detailSection} aria-label="How to fix it">
        <h3 style={styles.detailSectionTitle}>
          <Sparkles size={16} strokeWidth={2} aria-hidden="true" style={{ color: T.purple, marginRight: 6, verticalAlign: '-2px' }} />
          How To Fix It
        </h3>
        <p style={styles.detailBody}>
          {leak.suggestedFix
            || 'No personalised fix has been generated for this leak yet. Run detection again — the engine writes tailored fixes for your highest-impact leaks.'}
        </p>
      </section>

      {/* Why it's leaking EV */}
      <section style={styles.detailSection} aria-label="Why it is leaking EV">
        <h3 style={styles.detailSectionTitle}>Why It{"'"}s Leaking EV</h3>
        <p style={styles.detailBody}>{leak.whyLeakingEv || leak.explanation || 'No explanation recorded for this leak.'}</p>
        {leak.explanation && leak.whyLeakingEv && leak.explanation !== leak.whyLeakingEv && (
          <p style={{ ...styles.detailBody, color: T.textMuted, marginTop: S.sm }}>{leak.explanation}</p>
        )}
      </section>

      {/* Example hands — one tap into the exact spot */}
      {!isDemoLeak && (
        <section style={styles.detailSection} aria-label="Recent example hands">
          <h3 style={styles.detailSectionTitle}>Recent Example Hands</h3>
          {examplesLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }} aria-busy="true">
              <Skeleton h={56} />
              <Skeleton h={56} />
            </div>
          ) : examplesError ? (
            <ErrorState
              title="Could not load example hands"
              body={String(examplesError)}
              onRetry={refetchExamples}
            />
          ) : examples.length === 0 ? (
            <p style={styles.detailBody}>
              No example hands recorded for this leak yet. Run leak detection after your next sessions to collect concrete examples.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
              {examples.map((ex) => {
                const snap = ex?.snapshot || {};
                return (
                  <button
                    key={ex.id}
                    type="button"
                    className="leak-card pa-btn"
                    onClick={() => onPracticeExample(leak, ex)}
                    style={styles.exampleRow}
                    aria-label={`Practice this hand: ${fmtCards(snap.hero_cards)} on ${fmtCards(snap.board)}`}
                  >
                    <span style={styles.exampleLine1}>
                      <span style={styles.exampleCards}>{fmtCards(snap.hero_cards)}</span>
                      <span style={styles.exampleEv}>
                        {Number.isFinite(Number(ex.evLoss)) ? `-${Math.abs(Number(ex.evLoss)).toFixed(2)} BB` : '—'}
                      </span>
                    </span>
                    <span style={styles.exampleLine2}>
                      <span style={styles.exampleBoard}>Board: {fmtCards(snap.board)}</span>
                      <span style={pill('accent')}>{String(snap.street || '?').toUpperCase()}</span>
                      <ChevronRight size={16} strokeWidth={2} aria-hidden="true" style={{ color: T.textMuted, marginLeft: 'auto' }} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Suggested fixes */}
      <section aria-label="Suggested fixes">
        <h3 style={styles.detailSectionTitle}>Suggested Fixes</h3>
        <div style={styles.fixGrid}>
          <div style={{ ...styles.fixCard, ...(autoGuidance ? styles.fixCardRecommended : null) }}>
            <div style={styles.fixHead}>
              <Target size={18} strokeWidth={2} aria-hidden="true" style={{ color: T.accent }} />
              <h4 style={styles.fixTitle}>Practice In Sandbox</h4>
              {autoGuidance && <span style={pill('accent')}>Recommended</span>}
            </div>
            <p style={styles.fixText}>{sandboxCopy}</p>
            <button type="button" className="pa-btn" style={btn('primary', { block: true })} onClick={() => onPracticeSandbox(leak)}>
              Practice Leak in Sandbox
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
              style={{ ...btn('secondary', { block: true }), color: T.warn, borderColor: 'rgba(251,191,36,0.45)' }}
              onClick={() => onTrainDrills(leak)}
            >
              {drill ? 'Train with Focused Drills' : 'Open Training Arena'}
            </button>
          </div>
        </div>

        <AutoGuidanceToggle value={autoGuidance} onChange={toggleAutoGuidance} />
      </section>

      {/* Resolve / reopen */}
      <section style={{ marginTop: S.lg }} aria-label="Leak status">
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
                Sample leaks cannot be changed — run detection on your own hands first.
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
                Sample leaks cannot be resolved — run detection on your own hands first.
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
// `pa-data-updated` event just to recover them — the same request useLeaks()
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
  const [userId, setUserId] = useState(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    try {
      const user = getAuthUser();
      if (user?.id) setUserId(user.id);
    } catch (e) {
      console.warn('[LeakFinder] auth read failed:', e?.message || e);
    }
  }, []);

  // ═══ ACTION GATE: exploring leaks is free, practice/training is gated ═══
  const { guardAction, hasAccess: paHasAccess, UpgradePopup } = useFeatureGate('personal_assistant');

  const [tab, setTab] = useState('leaks');
  const [showMenu, setShowMenu] = useState(false);
  const [selectedLeakId, setSelectedLeakId] = useState(null);
  const [resolvingLeakId, setResolvingLeakId] = useState(null);
  const [detectionSummary, setDetectionSummary] = useState(null);
  const [detectStep, setDetectStep] = useState(0);
  const [detectSlow, setDetectSlow] = useState(false);

  const [sortMode, setSortMode] = useState('impact');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pastOpen, setPastOpen] = useState(false);

  const {
    leaks: fetchedLeaks,
    demoLeaks: onboardingLeaks,
    isLoading: leaksLoading,
    error: leaksError,
    refetch: refetchLeaks,
    updateLeakStatus,
    isDemo: leaksDemoFlag,
  } = useLeaks();
  const { stats: fetchedStats, isLoading: statsLoading, isDemo: statsDemoFlag } = useAssistantStats();
  const { runDetection, isDetecting } = useLeakDetection();

  const safeLeaks = useMemo(() => (Array.isArray(fetchedLeaks) ? fetchedLeaks : []), [fetchedLeaks]);
  const leaks = useMemo(
    () => safeLeaks.filter(Boolean).map(normaliseLeak),
    [safeLeaks],
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
    if (activeLeaks.length > 0) {
      return -(activeLeaks.reduce((s, l) => s + Math.abs(num(l.evLossBB)), 0) / activeLeaks.length);
    }
    return 0;
  }, [fetchedStats, statsAreDemo, activeLeaks]);

  const stats = {
    sessionsReviewed: fetchedStats?.sessionsReviewed ?? 0,
    handsAnalyzed: fetchedStats?.handsAnalyzed ?? 0,
    leaksFound: activeLeaks.length,
    avgEvLoss,
  };

  // ─── Coach accuracy (sandbox coach mode) ─────────────────────────────────
  const [coachAccuracy, setCoachAccuracy] = useState(null);
  const [coachLoading, setCoachLoading] = useState(true);
  const [coachError, setCoachError] = useState(null);

  const fetchCoachAccuracy = useCallback(async () => {
    setCoachLoading(true);
    setCoachError(null);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        setCoachAccuracy(null);
        return;
      }
      const res = await fetch('/api/sandbox/coach-accuracy', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        setCoachError(`Coach stats unavailable (HTTP ${res.status})`);
        return;
      }
      const json = await res.json();
      if (json?.success) {
        setCoachAccuracy({ ...(json.accuracy || {}), topLeaks: Array.isArray(json.topLeaks) ? json.topLeaks : [] });
      } else {
        setCoachError(json?.error || 'Coach stats unavailable');
      }
    } catch (e) {
      console.warn('[LeakFinder] coach accuracy failed:', e?.message || e);
      setCoachError('Coach stats unavailable');
    } finally {
      setCoachLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (selectedLeakId == null || leaksLoading) return;
    if (!selectablePool.some(l => String(l.id) === String(selectedLeakId))) setSelectedLeakId(null);
  }, [selectedLeakId, selectablePool, leaksLoading]);

  // Deep link: /hub/personal-assistant/leaks?leak=<id>
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current || !router.isReady || leaksLoading) return;
    const raw = router.query?.leak;
    const target = Array.isArray(raw) ? raw[0] : raw;
    if (!target) { deepLinkedRef.current = true; return; }
    const match = selectablePool.find(l => String(l.id) === String(target));
    if (match) {
      setSelectedLeakId(match.id);
      deepLinkedRef.current = true;
    } else if (selectablePool.length > 0) {
      deepLinkedRef.current = true;
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

  const handleRunDetection = useCallback(async () => {
    setDetectionSummary(null);
    let result;
    try {
      result = await runDetection();
    } catch (e) {
      setDetectionSummary({ type: 'error', text: friendlyDetectionError(e?.message || e) });
      return;
    }
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
        type: 'success',
        text: `Analysed ${num(result.handsAnalyzed).toLocaleString()} hands · ${found} leak${found === 1 ? '' : 's'} found.`,
      });
    } else {
      setDetectionSummary({ type: 'error', text: friendlyDetectionError(result?.error) });
    }
  }, [runDetection]);

  // ─── First-visit auto-detection ──────────────────────────────────────────
  //
  // WHY THIS EXISTS: detection only ever ran on a manual tap, so `user_leaks`
  // was empty for effectively everyone — 1,132 accounts hold 100+ hands and
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
  //   • signed in AND already entitled — `hasAccess`, never `guardAction`, so
  //     a background action can never pop the upgrade modal at someone;
  //   • only when the leak list has loaded and is genuinely empty (sample
  //     leaks do not count as content);
  //   • once per browser per COOLDOWN_MS, so a clean player who legitimately
  //     has zero leaks does not re-run it on every visit;
  //   • once per mount, and never while a manual run is in flight;
  //   • silent on failure — a background action the user did not ask for must
  //     not raise an error banner. The manual button remains the loud path.
  const autoDetectRef = useRef(false);
  const [autoDetecting, setAutoDetecting] = useState(false);

  useEffect(() => {
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const KEY = 'pa-auto-detect-last';

    if (autoDetectRef.current) return;                  // once per mount
    if (!paHasAccess || !userId) return;                // entitled + signed in
    if (leaksLoading || isDetecting) return;            // let loads settle
    if (leaksAreDemo) return;                           // sample data is not "no leaks"
    if (leaks.length > 0) return;                       // already has real leaks

    const last = Number(safeStorage.get(KEY, '0'));
    if (Number.isFinite(last) && last > 0 && Date.now() - last < COOLDOWN_MS) return;

    autoDetectRef.current = true;
    safeStorage.set(KEY, String(Date.now()));   // written BEFORE the call, so a
                                                // failure cannot spin the retry
    setAutoDetecting(true);
    (async () => {
      try {
        await runDetection();
      } catch (e) {
        console.warn('[LeakFinder] auto-detection failed:', e?.message || e);
      } finally {
        setAutoDetecting(false);
      }
    })();
  }, [paHasAccess, userId, leaksLoading, isDetecting, leaksAreDemo, leaks.length, runDetection]);

  const celebrate = useCallback(async () => {
    if (reduceMotion) return;
    try {
      const mod = await import('canvas-confetti');
      const confetti = mod?.default || mod;
      confetti({ particleCount: 60, spread: 65, startVelocity: 32, origin: { y: 0.75 }, disableForReducedMotion: true });
    } catch (e) {
      /* confetti is decorative — never fatal */
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

  const buildPracticeQuery = useCallback((leak) => {
    const q = {};
    if (leak?.id != null) q.leak = leak.id;
    const slug = leak?.leakType || slugFromTitle(leak?.title);
    if (slug) q.leakType = slug;
    if (leak?.recommendedDrill) q.drill = leak.recommendedDrill;
    else if (leak?.leakCategory) q.drill = leak.leakCategory;
    return q;
  }, []);

  const handlePracticeSandbox = useCallback((leak) => {
    if (!guardAction()) return;
    const target = leak || selectedLeak;
    if (!target) return;
    router.push({ pathname: '/hub/personal-assistant/sandbox', query: buildPracticeQuery(target) });
  }, [guardAction, router, selectedLeak, buildPracticeQuery]);

  /** One-tap drill-through into the exact spot the example hand recorded. */
  const handlePracticeExample = useCallback((leak, ex) => {
    if (!guardAction()) return;
    const snap = ex?.snapshot || {};
    const q = buildPracticeQuery(leak);

    const heroRaw = Array.isArray(snap.hero_cards)
      ? snap.hero_cards.join('')
      : (typeof snap.hero_cards === 'string' ? snap.hero_cards : '');
    const hero = String(heroRaw).replace(/[\s,]/g, '');
    if (hero.length >= 4) q.h = hero.slice(0, 4);

    const board = Array.isArray(snap.board)
      ? snap.board.filter(Boolean).join(',')
      : (typeof snap.board === 'string' ? snap.board : '');
    if (board) q.b = board;

    if (Number.isFinite(Number(snap.pot_size))) q.pot = Number(snap.pot_size);
    // Only fall back to the street when the leak has no named drill
    if (!q.drill && snap.street) q.drill = String(snap.street);

    router.push({ pathname: '/hub/personal-assistant/sandbox', query: q });
  }, [guardAction, router, buildPracticeQuery]);

  const handleTrainDrills = useCallback((leak) => {
    if (!guardAction()) return;
    const target = leak || selectedLeak;
    const q = { from: 'leaks' };
    const focus = target?.recommendedDrill || target?.leakType || slugFromTitle(target?.title);
    if (focus) q.focus = focus;
    if (target?.leakCategory) q.category = target.leakCategory;
    router.push({ pathname: '/hub/training', query: q });
  }, [guardAction, router, selectedLeak]);

  const handleShareLeak = useCallback(async (leak) => {
    if (!leak || typeof window === 'undefined') return;
    const url = `${window.location.origin}/hub/personal-assistant/leaks?leak=${encodeURIComponent(leak.id)}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
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
    toast('Copy this link: ' + url);
  }, []);

  // ─── Spaced-repetition review queue ──────────────────────────────────────
  // Sources: the server schedule (authoritative) merged over the localStorage
  // fallback QuickSpotDrill writes when the API cannot persist. The queue and
  // the ordering come from src/lib/sandbox/leakReview — this page only renders.
  const [reviewNowMs, setReviewNowMs] = useState(0);
  const [reviewServerRecords, setReviewServerRecords] = useState([]);
  const [reviewLocalRecords, setReviewLocalRecords] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  // First load only — a background refresh after a drill must not flash the
  // whole card back to a skeleton.
  const [reviewLoaded, setReviewLoaded] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [reviewSession, setReviewSession] = useState(null);

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
    setReviewLoading(true);
    setReviewError(null);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        // Signed out: the local fallback is the whole schedule. Not an error.
        setReviewServerRecords([]);
        return;
      }
      const res = await fetch('/api/assistant/leaks/review', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        setReviewError(`Review schedule unavailable (HTTP ${res.status})`);
        return;
      }
      const json = await res.json();
      if (json?.success) {
        setReviewServerRecords(Array.isArray(json.records) ? json.records : []);
      } else {
        setReviewError(json?.error || 'Review schedule unavailable');
      }
    } catch (e) {
      console.warn('[LeakFinder] review schedule failed:', e?.message || e);
      setReviewError('Review schedule unavailable');
    } finally {
      setReviewLoading(false);
      setReviewLoaded(true);
    }
  }, []);

  useEffect(() => { fetchReviewSchedule(); }, [fetchReviewSchedule, userId]);

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
  // Keyed by String(leakId) — the same normalisation the queue uses.
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

  const handleStartReview = useCallback((entry) => {
    if (!guardAction()) return;
    const target = entry || reviewQueue[0];
    if (!target || !target.leak) return;
    const params = target.drill || leakToDrill(target.leak);
    if (!params) {
      // No street can be inferred, so a drill would serve unrelated spots.
      // Fall back to the existing sandbox handoff instead of a dead end.
      handlePracticeSandbox(target.leak);
      return;
    }
    // The leak's CURRENT measured EV cost rides along so the review API can
    // diff it against the measurement stored at the previous review — that
    // delta (negative = the leak is costing less in real hands) is the
    // scheduler's corroborating evDelta signal. Measured by detection, not
    // estimated here.
    const evLossBB = Math.abs(num(target.leak.evLossBB));
    setReviewSession({
      leakId: String(target.leakId),
      params,
      evLossBB: Number.isFinite(evLossBB) && evLossBB > 0 ? evLossBB : null,
    });
  }, [guardAction, reviewQueue, handlePracticeSandbox]);

  const closeReviewSession = useCallback(() => {
    setReviewSession(null);
    refreshLocalReviews();
    setReviewNowMs(Date.now());
    fetchReviewSchedule();
  }, [refreshLocalReviews, fetchReviewSchedule]);

  // ─── Filter / sort / paginate ────────────────────────────────────────────
  const visibleLeaks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = activeLeaks;
    if (statusFilter !== 'all') list = list.filter(l => l.status === statusFilter);
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
  }, [activeLeaks, statusFilter, query, sortMode]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [statusFilter, query, sortMode]);

  const shownLeaks = visibleLeaks.slice(0, visibleCount);
  const remaining = Math.max(0, visibleLeaks.length - shownLeaks.length);

  // ═══ HAMBURGER MENU ═══
  // Single-page surface, so the menu's "Views" rows switch tab and scroll to a
  // section. Every handler below has a real implementation — the config omits
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
    onViewOverview: () => { setTab('leaks'); jumpTo(null); },
    onViewLeaks: () => { setTab('leaks'); jumpTo('leak-list'); },
    onViewAnalytics: () => { setTab('insights'); jumpTo('leak-insights'); },
    onRescan: () => { if (!isDetecting) handleRunDetection(); },
    onPracticeWorst: () => {
      const worst = visibleLeaks[0] || activeLeaks[0];
      if (!worst) { setTab('leaks'); jumpTo('leak-list'); return; }
      handlePracticeSandbox(worst);
    },
    // Toggles keep the drawer open, so this only changes state — no scroll.
    onToggleResolved: (next) => { setTab('leaks'); setPastOpen(!!next); },
  }), [jumpTo, isDetecting, handleRunDetection, visibleLeaks, activeLeaks, handlePracticeSandbox]);

  const menuConfig = useMemo(() => getMenuConfig('leaks', null, {
    leakCount: activeLeaks.length,
    isDetecting,
    showResolved: pastOpen,
  }, menuHandlers), [activeLeaks.length, isDetecting, pastOpen, menuHandlers]);

  // ═══ PRE-MOUNT: real chrome + skeletons, never a bare flash ═══
  if (!mounted) {
    return (
      <div style={styles.page}>
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
        </div>
      </div>
    );
  }

  const detectButton = (block = true) => (
    <button
      type="button"
      className="pa-btn"
      style={btn('primary', { block, disabled: isDetecting })}
      onClick={handleRunDetection}
      disabled={isDetecting}
    >
      <Activity size={18} strokeWidth={2} aria-hidden="true" />
      {isDetecting ? 'Analysing…' : 'Run Leak Detection'}
    </button>
  );

  return (
    <PageTransition>
      <SEOHead
        title="Leak Finder — Fix Your Game"
        description="Identify And Fix Leaks In Your Poker Game With AI-powered Analysis From Jarvis."
        canonical="/hub/personal-assistant/leaks"
      />

      <div className="leaks-page" style={styles.page}>
        <PAStyles />
        <UniversalHeader pageDepth={2} onMenuClick={() => setShowMenu(true)} />

        <HamburgerMenu
          isOpen={showMenu}
          onClose={() => setShowMenu(false)}
          direction="left"
          theme="pa"
          user={null}
          showProfile={false}
          menuItems={menuConfig.menuItems}
          bottomLinks={menuConfig.bottomLinks}
        />

        <main id="leak-finder-main" className="leaks-shell" style={styles.shell}>
          {/* ── Page header ── */}
          <header style={styles.pageHeader}>
            <div style={{ minWidth: 0 }}>
              <h1 style={styles.pageTitle}>Leak Finder</h1>
              <p style={styles.pageSub}>Post-session analysis — repeated, measurable EV leaks.</p>
            </div>
            <span style={styles.integrityBadge}>
              <Lock size={12} strokeWidth={2} aria-hidden="true" />
              Not Live Play — Post-Session Review Only
            </span>
          </header>

          {/* ── Sample-data disclosure ── */}
          {leaksAreDemo && !leaksLoading && (
            <section style={styles.demoBanner} aria-label="Sample data notice">
              <p style={styles.demoBannerText}>
                You are viewing sample data. Sign in and run detection to analyse your own hands.
              </p>
              <a className="pa-btn" href="/auth" style={{ ...btn('primary', { block: true }), textDecoration: 'none', minHeight: 48 }}>
                Sign in to analyse my hands
              </a>
            </section>
          )}

          {/* ── Stats ── */}
          <section style={styles.statGrid} aria-label="Summary statistics">
            <StatCell
              label="Sessions reviewed"
              value={statsLoading ? null : (statsAreDemo ? '—' : String(stats.sessionsReviewed))}
            />
            <StatCell
              label="Hands analysed"
              value={statsLoading ? null : (statsAreDemo ? '—' : stats.handsAnalyzed.toLocaleString())}
            />
            <StatCell
              label="Active leaks"
              value={leaksLoading ? null : (leaksAreDemo ? '—' : String(stats.leaksFound))}
            />
            <StatCell
              label="Avg EV loss"
              tone={T.danger}
              value={leaksLoading ? null : (stats.avgEvLoss && !statsAreDemo ? `${stats.avgEvLoss.toFixed(2)} BB` : '—')}
            />
            <StatCell
              label="GTO accuracy"
              icon={<GraduationCap size={14} strokeWidth={2} aria-hidden="true" />}
              value={coachLoading
                ? null
                : coachError
                  ? '—'
                  : (coachAccuracy && num(coachAccuracy.total_hands) > 0 ? `${coachAccuracy.accuracy_pct ?? '—'}%` : '—')}
              tone={coachAccuracy && num(coachAccuracy.accuracy_pct) >= 70
                ? T.success
                : coachAccuracy && num(coachAccuracy.accuracy_pct) >= 50 ? T.warn : T.text}
              hint={coachError ? 'Coach stats unavailable' : (coachAccuracy && num(coachAccuracy.total_hands) > 0 ? `${num(coachAccuracy.correct_count)} / ${num(coachAccuracy.total_hands)} coach hands` : 'No coach hands yet')}
              onRetry={coachError ? fetchCoachAccuracy : null}
            />
            {statsAreDemo && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={pill('warn')}>Sample stats — not your own data</span>
              </div>
            )}
          </section>

          {/* ── Tabs ── */}
          <div style={{ marginBottom: S.md }}>
            <Segmented
              idPrefix="leaks-tab"
              label="View"
              columns={2}
              value={tab}
              onChange={setTab}
              options={[
                { value: 'leaks', label: 'Leaks' },
                { value: 'insights', label: 'Insights' },
              ]}
            />
          </div>

          {tab === 'leaks' ? (
            <section id="leak-list" aria-label="Your leaks">
              {/* Due for review — the spaced-repetition entry point */}
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

              {/* Detection */}
              <div style={{ ...card, marginBottom: S.md }}>
                {detectButton(true)}
                {isDetecting && (
                  <div style={{ marginTop: S.md }} aria-live="polite">
                    <div className="leak-progress"><span /></div>
                    <p style={styles.detectStepText}>
                      {detectSlow
                        ? 'Detection is taking longer than expected — it will finish in the background.'
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
                      borderColor: detectionSummary.type === 'error'
                        ? 'rgba(239,68,68,0.5)'
                        : detectionSummary.type === 'success' ? 'rgba(34,197,94,0.5)' : 'rgba(251,191,36,0.5)',
                      color: detectionSummary.type === 'error'
                        ? T.danger
                        : detectionSummary.type === 'success' ? T.success : T.warn,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>{detectionSummary.text}</span>
                    <button
                      type="button"
                      className="pa-btn"
                      aria-label="Dismiss detection message"
                      onClick={() => setDetectionSummary(null)}
                      style={iconBtn({ transparent: true, color: T.textMuted })}
                    >
                      <X size={18} strokeWidth={2} />
                    </button>
                  </div>
                )}
              </div>

              {/* Load error (never replaces the empty state / detect button) */}
              {leaksError && !leaksLoading && (
                <div style={{ marginBottom: S.md }}>
                  <ErrorState
                    title="Could not load your leaks"
                    body={friendlyLoadError(leaksError)}
                    onRetry={() => refetchLeaks()}
                  />
                </div>
              )}

              {leaksLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }} aria-busy="true">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="leak-skeleton" style={styles.skeletonCard} />
                  ))}
                </div>
              ) : activeLeaks.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                  {/* A scan the user did not start still has to be visible —
                      showing "no leaks detected" while one is running would be
                      telling them something we do not yet know. */}
                  <EmptyState
                    icon={<Inbox size={22} strokeWidth={2} />}
                    title={(autoDetecting || isDetecting) ? 'Checking your recent hands…' : 'No leaks detected yet'}
                    body={(autoDetecting || isDetecting)
                      ? 'Scanning your hand history for repeated, measurable EV mistakes. This takes a few seconds.'
                      : 'Run detection on your recent hands and the engine will rank every repeated, measurable EV leak.'}
                    action={(autoDetecting || isDetecting) ? null : detectButton(false)}
                  />
                  {(onboardingLeaks || []).length > 0 && (
                    <div>
                      <h2 style={styles.sectionHeading}>Example leaks (not yours)</h2>
                      <ul style={styles.leakList} role="list">
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
                  <LeakErrorBoundary label="The bleed summary">
                    <BleedSummary leaks={activeLeaks} isDemo={leaksAreDemo} />
                  </LeakErrorBoundary>

                  {/* Search + sort + filter */}
                  <div style={{ ...cardCompact, marginBottom: S.md, display: 'flex', flexDirection: 'column', gap: S.md }}>
                    <div style={styles.searchWrap}>
                      <Search size={18} strokeWidth={2} aria-hidden="true" style={{ color: T.textDim, flexShrink: 0 }} />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search leaks or situations"
                        aria-label="Search leaks"
                        style={styles.searchInput}
                      />
                      {query && (
                        <button
                          type="button"
                          className="pa-btn"
                          aria-label="Clear search"
                          onClick={() => setQuery('')}
                          style={iconBtn({ transparent: true, color: T.textMuted })}
                        >
                          <X size={18} strokeWidth={2} />
                        </button>
                      )}
                    </div>

                    <Segmented
                      idPrefix="leak-sort"
                      label="Sort by"
                      value={sortMode}
                      onChange={setSortMode}
                      options={[
                        { value: 'impact', label: 'Impact' },
                        { value: 'recent', label: 'Recent' },
                        { value: 'confidence', label: 'Confidence' },
                      ]}
                    />

                    <Segmented
                      idPrefix="leak-status"
                      label="Status"
                      tone="warn"
                      columns={2}
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'persistent', label: 'Persistent' },
                        { value: 'emerging', label: 'Emerging' },
                        { value: 'improving', label: 'Improving' },
                      ]}
                    />
                  </div>

                  {shownLeaks.length === 0 ? (
                    <EmptyState
                      compact
                      icon={<Search size={22} strokeWidth={2} />}
                      title="No matching leaks"
                      body="No leak matches this filter. Clear the search or switch back to All."
                      action={(
                        <button
                          type="button"
                          className="pa-btn"
                          style={btn('secondary')}
                          onClick={() => { setQuery(''); setStatusFilter('all'); }}
                        >
                          Reset filters
                        </button>
                      )}
                    />
                  ) : (
                    <>
                      <ul style={styles.leakList} role="list">
                        {shownLeaks.map(leak => (
                          <LeakCard
                            key={leak.id}
                            leak={leak}
                            demo={leaksAreDemo || isDemoLeakId(leak.id)}
                            selected={String(selectedLeakId) === String(leak.id)}
                            onOpen={(l) => setSelectedLeakId(l.id)}
                            onPractice={handlePracticeSandbox}
                            progress={(leaksAreDemo || isDemoLeakId(leak.id))
                              ? null
                              : resolutionProgress(reviewRecordById.get(String(leak.id)) || null)}
                          />
                        ))}
                      </ul>
                      {remaining > 0 && (
                        <button
                          type="button"
                          className="pa-btn"
                          style={{ ...btn('secondary', { block: true }), marginTop: S.md }}
                          onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                        >
                          Show {Math.min(PAGE_SIZE, remaining)} more ({remaining} left)
                        </button>
                      )}
                    </>
                  )}

                  {/* Past leaks — collapsed by default */}
                  {pastLeaks.length > 0 && (
                    <div style={{ marginTop: S.lg }}>
                      <button
                        type="button"
                        className="pa-btn"
                        aria-expanded={pastOpen}
                        onClick={() => setPastOpen(o => !o)}
                        style={styles.disclosureBtn}
                      >
                        <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>Past leaks ({pastLeaks.length})</span>
                        {pastOpen
                          ? <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
                          : <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />}
                      </button>
                      {pastOpen && (
                        <ul style={{ ...styles.leakList, marginTop: S.md }} role="list">
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
            </section>
          ) : (
            <section id="leak-insights" aria-label="Insights">
              <h2 style={styles.sectionHeading}>
                <BarChart3 size={14} strokeWidth={2} aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />
                Session analytics
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                <LeakErrorBoundary label="Session analytics">
                  <SessionAnalytics userId={userId} />
                </LeakErrorBoundary>

                {/* Worst coach-mode spots */}
                <div style={card}>
                  <h3 style={styles.cardHeading}>Worst coach-mode spots</h3>
                  {coachLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }} aria-busy="true">
                      <Skeleton h={56} />
                      <Skeleton h={56} />
                    </div>
                  ) : coachError ? (
                    <ErrorState title="Coach stats unavailable" body={coachError} onRetry={fetchCoachAccuracy} />
                  ) : !Array.isArray(coachAccuracy?.topLeaks) || coachAccuracy.topLeaks.length === 0 ? (
                    <p style={styles.detailBody}>
                      No coach-mode mistakes recorded yet. Turn on coach mode in the sandbox and your worst spots appear here.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
                      {coachAccuracy.topLeaks.map((spot, i) => (
                        <button
                          key={`${spot?.street || 'x'}-${i}`}
                          type="button"
                          className="leak-card pa-btn"
                          style={styles.exampleRow}
                          onClick={() => {
                            if (!guardAction()) return;
                            const q = { from: 'leaks' };
                            if (spot?.street) q.drill = String(spot.street);
                            if (spot?.board) {
                              const b = Array.isArray(spot.board) ? spot.board.filter(Boolean).join(',') : String(spot.board);
                              if (b) q.b = b;
                            }
                            router.push({ pathname: '/hub/personal-assistant/sandbox', query: q });
                          }}
                          aria-label={`Practice this coach-mode spot on ${fmtCards(spot?.board)}`}
                        >
                          <span style={styles.exampleLine1}>
                            <span style={styles.exampleCards}>{fmtCards(spot?.board)}</span>
                            <span style={{ ...styles.exampleEv, ...numeric }}>EV {num(spot?.ev_delta).toFixed(2)}</span>
                          </span>
                          <span style={styles.exampleLine2}>
                            <span style={pill('accent')}>{String(spot?.street || '?').toUpperCase()}</span>
                            <span style={styles.exampleBoard}>
                              You: {spot?.user_pick || '?'} · GTO: {spot?.gto_action || '?'}
                            </span>
                            <ChevronRight size={16} strokeWidth={2} aria-hidden="true" style={{ color: T.textMuted, marginLeft: 'auto' }} />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <LeakErrorBoundary label="The leaderboard">
                  <CoachLeaderboard userId={userId} />
                </LeakErrorBoundary>

                <LeakErrorBoundary label="The macro leak detector">
                  <MacroLeakDetector />
                </LeakErrorBoundary>

                <LeakErrorBoundary label="The leak heatmap">
                  <LeakHeatmap userId={userId} />
                </LeakErrorBoundary>
              </div>
            </section>
          )}
        </main>

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
              reviewEvLossBB={reviewSession.evLossBB ?? null}
              onClose={closeReviewSession}
            />
          </LeakErrorBoundary>
        )}

        {/* ── Detail sheet ── */}
        <BottomSheet
          open={!!selectedLeak}
          onClose={() => setSelectedLeakId(null)}
          title={selectedLeak?.title || 'Leak'}
          subtitle={selectedLeak?.situationClass || undefined}
          closeLabel="Close leak details"
          ariaLabel={`Leak details: ${selectedLeak?.title || ''}`}
          headerRight={selectedLeak ? (
            <button
              type="button"
              className="pa-btn"
              aria-label="Copy link to this leak"
              onClick={() => handleShareLeak(selectedLeak)}
              style={iconBtn({ color: T.textMuted })}
            >
              <Link2 size={18} strokeWidth={2} />
            </button>
          ) : null}
        >
          <LeakErrorBoundary label="Leak details">
            {selectedLeak && (
              <LeakDetail
                leak={selectedLeak}
                onPracticeSandbox={handlePracticeSandbox}
                onPracticeExample={handlePracticeExample}
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
            transition: transform .12s ease, background .12s ease, border-color .12s ease;
          }
          .leak-card:active {
            transform: scale(0.985);
            background: rgba(255, 255, 255, 0.06);
          }
          .leak-card:focus-visible {
            outline: 2px solid ${T.accent};
            outline-offset: 2px;
          }
          .leak-skeleton {
            animation: leakSkeletonPulse 1.4s ease-in-out infinite;
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
            width: 40%;
            border-radius: ${R.pill}px;
            background: linear-gradient(90deg, ${T.accent}, ${T.accentPress});
            animation: leakProgressSlide 1.2s ease-in-out infinite;
          }
          @keyframes leakProgressSlide {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(300%); }
          }
          @media (prefers-reduced-motion: reduce) {
            .leak-skeleton { animation: none; opacity: 0.5; }
            .leak-progress > span { animation: none; width: 100%; opacity: 0.5; }
            .leak-card:active { transform: none; }
            *, *::before, *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
              scroll-behavior: auto !important;
            }
          }
          /* The shell carries its padding as an inline style, which a plain
             rule cannot override — hence !important on this one declaration. */
          @media (min-width: 769px) {
            .leaks-shell {
              padding-left: max(24px, env(safe-area-inset-left, 0px)) !important;
              padding-right: max(24px, env(safe-area-inset-right, 0px)) !important;
            }
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
      <BottomNavBar />
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
    overflowX: 'hidden',
    boxSizing: 'border-box',
    background: T.bg,
    fontFamily: FONT,
    color: T.text,
    position: 'relative',
  },
  shell: {
    width: '100%',
    maxWidth: 760,
    margin: '0 auto',
    boxSizing: 'border-box',
    padding: `${S.lg}px max(${S.lg}px, env(safe-area-inset-left, 0px))`,
    paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
  },

  pageHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: S.sm,
    marginBottom: S.lg,
  },
  pageTitle: {
    fontSize: F.h1,
    fontWeight: 800,
    color: T.text,
    margin: 0,
    lineHeight: 1.2,
  },
  pageSub: {
    fontSize: F.bodySm,
    color: T.textMuted,
    margin: '4px 0 0',
    lineHeight: 1.45,
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
    background: T.surface2,
    border: `1px solid ${T.border}`,
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
    border: '1px solid rgba(251,191,36,0.4)',
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
    borderColor: 'rgba(251,191,36,0.45)',
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
    margin: `0 0 ${S.md}px`,
  },
  cardHeading: {
    fontSize: F.h3,
    fontWeight: 700,
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
    padding: S.lg,
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
    borderColor: 'rgba(251,191,36,0.45)',
  },
  leakCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: S.sm,
    width: '100%',
    minWidth: 0,
  },
  leakCardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: F.h3,
    fontWeight: 700,
    color: T.text,
    lineHeight: 1.3,
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
    height: '100%',
    borderRadius: 999,
    transition: 'width .3s ease',
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
    fontSize: F.h3,
    fontWeight: 700,
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
  // Deliberate horizontal snap carousel. One auto-column per point with no
  // minimum squeezed 7 runs to ~36px and 12 runs to ~21px on a 375px viewport,
  // which broke the 44x44 tap target and clipped the % / date labels.
  trendPointRow: {
    display: 'flex',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    gap: S.sm,
    marginTop: S.md,
    paddingBottom: S.xs,
  },
  trendPointBtn: {
    display: 'flex',
    flex: '0 0 auto',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    scrollSnapAlign: 'start',
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
    transition: 'background .12s ease',
  },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#FFFFFF',
    transition: 'transform .12s ease',
  },
};
