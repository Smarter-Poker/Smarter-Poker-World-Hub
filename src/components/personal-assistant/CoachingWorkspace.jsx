import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, Bell, BookOpen, CalendarDays, Check, ChevronRight, ClipboardCheck,
  Crosshair, Database, Download, Flag, Gauge, ListChecks, MessageSquareWarning, MoreHorizontal,
  RefreshCw, Search, Settings, ShieldCheck, Target, Trash2, Trophy,
} from 'lucide-react';
import { BottomSheet } from '../sandbox/paKit';
import { getFreshAccessToken } from '../../lib/authUtils';
import { useLeakHandExamples } from '../../hooks/useAssistant';
import { useModalHistory } from '../../hooks/useModalHistory';
import {
  buildAdviceExplanation,
  buildEvidenceChain,
} from '../../lib/personal-assistant/coachingIntelligence.mjs';
import {
  normalizeCoverageGapsRanked,
  normalizeFunnelMetrics,
} from '../../lib/personal-assistant/liveVerificationPresentation.mjs';
import styles from './CoachingWorkspace.module.css';

const VIEWS = [
  { id: 'coach', label: 'Today / Plan', Icon: Crosshair },
  { id: 'evidence', label: 'Evidence', Icon: Gauge },
  { id: 'timeline', label: 'Timeline', Icon: CalendarDays },
  { id: 'goals', label: 'Goals', Icon: Flag },
  { id: 'report', label: 'Report', Icon: ClipboardCheck },
  { id: 'data', label: 'Settings', Icon: Database },
];

const EVIDENCE_BASIS_LABELS = {
  exact_solver_match: 'Exact Solver Match',
  chart: 'Chart',
  deterministic_rule: 'Deterministic Rule',
  general_coaching: 'General Coaching',
};

function formatEvidenceBasis(basis) {
  const key = String(basis || '').trim().toLowerCase();
  return EVIDENCE_BASIS_LABELS[key] || 'General Coaching';
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDate(value) {
  if (!value) return 'Not Scheduled';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
    : 'Not Available';
}

function formatGoalDate(value) {
  if (!value) return 'Not Scheduled';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
    : 'Not Available';
}

function titleWords(value) {
  return String(value ?? '').replace(/[_-]+/g, ' ').trim().replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

function countOrUnavailable(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : 'Not Available';
}

function findLeak(leaks, id) {
  return (Array.isArray(leaks) ? leaks : []).find(leak => String(leak?.id ?? '') === String(id ?? '')) || null;
}

function goalPayload(item, changes = {}) {
  return {
    id: item.id,
    leakId: item.leak_id,
    title: item.title,
    metric: item.metric,
    targetValue: item.target_value,
    currentValue: item.current_value,
    status: item.status,
    dueAt: item.due_at,
    ...changes,
  };
}

function Progress({ value, label }) {
  const bounded = Math.max(0, Math.min(100, number(value)));
  return (
    <div className={styles.progressWrap}>
      <div className={styles.progressMeta}><span>{label}</span><strong>{bounded}%</strong></div>
      <div className={styles.progressTrack} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}>
        <span style={{ width: `${bounded}%` }} />
      </div>
    </div>
  );
}

/**
 * Build a clean, deterministic JSON export payload for unmeasured solver coverage gaps
 * (`{ schemaVersion: 1, exportedAt, totalUnmeasured, buckets }`).
 * Returns null when no non-empty coverage gap buckets are present.
 */
export function buildCoverageGapsHarvestPayload(snapshot, rankedGaps = null, nowIso = null) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const rawCoverageGaps = snapshot.coverageGaps || snapshot.solverCoverageGaps || null;
  const candidateBuckets =
    (Array.isArray(snapshot.coverageGaps?.buckets) && snapshot.coverageGaps.buckets.length > 0 && snapshot.coverageGaps.buckets)
    || (Array.isArray(snapshot.coverageGaps?.topGaps) && snapshot.coverageGaps.topGaps.length > 0 && snapshot.coverageGaps.topGaps)
    || (Array.isArray(snapshot.solverCoverageGaps?.buckets) && snapshot.solverCoverageGaps.buckets.length > 0 && snapshot.solverCoverageGaps.buckets)
    || (Array.isArray(snapshot.solverCoverageGaps?.topGaps) && snapshot.solverCoverageGaps.topGaps.length > 0 && snapshot.solverCoverageGaps.topGaps)
    || (Array.isArray(rankedGaps?.rows) && rankedGaps.rows.length > 0 && rankedGaps.rows)
    || (Array.isArray(snapshot.coverageGapsRanked) && snapshot.coverageGapsRanked.length > 0 && snapshot.coverageGapsRanked)
    || (Array.isArray(snapshot.coverageGapsRanked?.rows) && snapshot.coverageGapsRanked.rows.length > 0 && snapshot.coverageGapsRanked.rows)
    || [];

  const buckets = candidateBuckets
    .filter((item) => item && typeof item === 'object' && Number(item.count ?? item.frequency ?? item.unpricedCount ?? 1) > 0)
    .map((bucket) => ({
      format: bucket.format || 'Unknown Format',
      street: String(bucket.street || 'unknown').toLowerCase(),
      position: bucket.position || bucket.heroPosition || 'ANY',
      spotType: bucket.spotType || 'general',
      ...(bucket.stackBucket ? { stackBucket: bucket.stackBucket } : {}),
      ...(bucket.reason ? { reason: bucket.reason } : {}),
      count: Math.max(0, Math.round(Number(bucket.count ?? bucket.frequency ?? bucket.unpricedCount) || 0)),
      ...(Number.isFinite(Number(bucket.sharePercent)) ? { sharePercent: Number(bucket.sharePercent) } : {}),
    }));

  if (buckets.length === 0) return null;

  const rawTotalCandidates = [
    rawCoverageGaps?.totalUnmeasured,
    rawCoverageGaps?.totalUnpriced,
    snapshot.solverCoverageGaps?.totalUnmeasured,
    snapshot.coverageGapsSummary?.totalUnpriced,
    rankedGaps?.total,
    snapshot.coverage?.unpriced,
  ];
  let totalUnmeasured = null;
  for (const candidate of rawTotalCandidates) {
    if (candidate !== null && candidate !== undefined && candidate !== '' && Number.isFinite(Number(candidate))) {
      totalUnmeasured = Math.max(0, Math.round(Number(candidate)));
      break;
    }
  }
  if (totalUnmeasured === null) {
    totalUnmeasured = buckets.reduce((sum, item) => sum + item.count, 0);
  }

  return {
    schemaVersion: 1,
    exportedAt: nowIso || new Date().toISOString(),
    totalUnmeasured,
    buckets,
  };
}

export default function CoachingWorkspace({
  userId,
  leaks = [],
  section = null,
  initialSection = null,
  initialLeakId = null,
  sharedPayload = null,
  onPayloadUpdated = null,
  settingsOpen: controlledSettingsOpen,
  onOpenSettings,
  onCloseSettings,
  settingsOnly = false,
  extraSettingsContent = null,
  onSwitchSection,
  onOpenLeak,
  onOpenHandReview,
  onReviewExample,
  onTrain,
  onStartReview,
  onJumpToLeaks,
  onInspectHand,
  onDrillHand,
}) {
  const [workspace, setWorkspace] = useState(null);
  const [view, setView] = useState('coach');
  const [internalSettingsOpen, setInternalSettingsOpen] = useState(false);
  const [overflowModule, setOverflowModule] = useState(null);
  const [analysisDepth, setAnalysisDepth] = useState('guided');
  const [query, setQuery] = useState('');
  const [selectedLeakId, setSelectedLeakId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [goal, setGoal] = useState({ title: '', metric: 'Accuracy Percent', targetValue: '90', dueAt: '' });
  const [feedbackType, setFeedbackType] = useState('confusing');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [confirmGoalId, setConfirmGoalId] = useState(null);
  const [lifecycle, setLifecycle] = useState(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [deleteScope, setDeleteScope] = useState('analysis');
  const [deleteChallenge, setDeleteChallenge] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [weeklyDigestOptIn, setWeeklyDigestOptIn] = useState(false);
  const [showExportTray, setShowExportTray] = useState(true);
  const [exportingPlan, setExportingPlan] = useState(false);
  const [coverageGapsCopyState, setCoverageGapsCopyState] = useState(null);
  const [claimedRewardLeaks, setClaimedRewardLeaks] = useState({});
  const [claimingRewardLeakId, setClaimingRewardLeakId] = useState(null);

  const isSettingsOpen = controlledSettingsOpen !== undefined ? Boolean(controlledSettingsOpen) : internalSettingsOpen;
  const openSettingsSheet = useCallback(() => {
    if (onOpenSettings) onOpenSettings();
    else setInternalSettingsOpen(true);
  }, [onOpenSettings]);
  const closeSettingsSheet = useCallback(() => {
    if (onCloseSettings) onCloseSettings();
    else setInternalSettingsOpen(false);
  }, [onCloseSettings]);
  const closeOverflowModule = useCallback(() => setOverflowModule(null), []);
  useModalHistory(Boolean(overflowModule), closeOverflowModule);

  const activeMode = useMemo(() => {
    if (section === 'progress' || section === 'insights') return 'progress';
    if (section === 'plan' || section === 'coaching') return 'plan';
    if (['evidence', 'timeline', 'goals', 'report'].includes(view)) return 'progress';
    return 'plan';
  }, [section, view]);

  const apiRequest = useCallback(async (method = 'GET', body = null, { signal } = {}) => {
    const token = await getFreshAccessToken();
    if (!token) throw new Error('Sign In To Load Your Coaching Workspace');
    const response = await fetch('/api/assistant/coaching', {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) throw new Error(payload?.error || `Coaching Request Failed With HTTP ${response.status}`);
    return payload;
  }, []);

  const hydratedPrefsForUserRef = useRef(null);
  const workspaceRef = useRef(null);
  const loadRequestIdRef = useRef(0);
  const loadAbortRef = useRef(null);
  const lifecycleRequestIdRef = useRef(0);
  const lifecycleAbortRef = useRef(null);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  // Isolate all account-scoped state immediately when switching accounts or signing out.
  useEffect(() => {
    loadAbortRef.current?.abort();
    lifecycleAbortRef.current?.abort();
    setLifecycle(null);
    setDeleteChallenge(null);
    setDeleteConfirmation('');
    setSelectedLeakId(null);
    setConfirmGoalId(null);
    setStatus(null);
    setCoverageGapsCopyState(null);
    setClaimedRewardLeaks({});
    setClaimingRewardLeakId(null);
    setOverflowModule(null);
    setWorkspace(null);
    workspaceRef.current = null;
    setError(null);
    hydratedPrefsForUserRef.current = null;
  }, [userId]);

  useEffect(() => () => {
    loadAbortRef.current?.abort();
    lifecycleAbortRef.current?.abort();
  }, []);

  // Sync target leak when opened from Leak Card "Inspect Evidence"
  useEffect(() => {
    if (initialLeakId) {
      setSelectedLeakId(initialLeakId);
    }
  }, [initialLeakId]);

  const applyPayload = useCallback((payload) => {
    if (!payload) return;
    setWorkspace(payload);
    workspaceRef.current = payload;
    setLoading(false);
    if (hydratedPrefsForUserRef.current !== userId) {
      hydratedPrefsForUserRef.current = userId;
      const urlParams = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : null;
      const urlView = urlParams ? urlParams.get('view') : null;
      const urlSettings = urlParams ? urlParams.get('settings') : null;
      const saved = payload.preferences?.saved_view;
      if ((urlView === 'data' || urlSettings === '1') && controlledSettingsOpen === undefined) {
        openSettingsSheet();
      } else if (urlView && VIEWS.some(item => item.id === urlView) && urlView !== 'data') {
        setView(urlView);
      } else if (VIEWS.some(item => item.id === saved) && saved !== 'data') {
        setView(saved);
      }
      if (['guided', 'detailed', 'expert'].includes(payload.preferences?.analysis_depth)) {
        setAnalysisDepth(payload.preferences.analysis_depth);
      }
      if (payload.preferences?.weekly_digest_opt_in !== undefined || payload.preferences?.weeklyDigestOptIn !== undefined || payload.snapshot?.preferences?.weeklyDigestOptIn !== undefined) {
        setWeeklyDigestOptIn(Boolean(payload.preferences?.weekly_digest_opt_in ?? payload.preferences?.weeklyDigestOptIn ?? payload.snapshot?.preferences?.weeklyDigestOptIn));
      }
    }
    const first = payload.snapshot?.priorities?.[0]?.id;
    setSelectedLeakId(current => current || initialLeakId || first || null);
  }, [initialLeakId, openSettingsSheet, userId]);

  useEffect(() => {
    if (sharedPayload) {
      applyPayload(sharedPayload);
    }
  }, [applyPayload, sharedPayload]);

  const load = useCallback(async ({ background = false } = {}) => {
    loadAbortRef.current?.abort();
    const requestId = ++loadRequestIdRef.current;
    if (!userId) {
      setLoading(false);
      setWorkspace(null);
      workspaceRef.current = null;
      hydratedPrefsForUserRef.current = null;
      return;
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    loadAbortRef.current = controller;
    const hasExistingSnapshot = Boolean(workspaceRef.current?.snapshot);
    if (!background && !hasExistingSnapshot) {
      setLoading(true);
    }
    setError(null);
    try {
      const payload = await apiRequest('GET', null, { signal: controller?.signal });
      if (requestId !== loadRequestIdRef.current) return;
      applyPayload(payload);
      onPayloadUpdated?.(payload);
    } catch (requestError) {
      if (requestError?.name === 'AbortError' || requestId !== loadRequestIdRef.current) return;
      if (workspaceRef.current?.snapshot) {
        setStatus({ tone: 'danger', text: requestError?.message || 'Coaching Workspace Could Not Be Refreshed' });
      } else {
        setError(requestError?.message || 'Coaching Workspace Could Not Be Loaded');
      }
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [apiRequest, applyPayload, onPayloadUpdated, userId]);

  useEffect(() => {
    if (sharedPayload) return;
    load();
  }, [load, sharedPayload]);

  useEffect(() => {
    if (typeof window === 'undefined' || !userId || sharedPayload) return undefined;
    const onRefresh = () => { load({ background: true }); };
    window.addEventListener('pa-data-updated', onRefresh);
    window.addEventListener('pa-leak-review-updated', onRefresh);
    return () => {
      window.removeEventListener('pa-data-updated', onRefresh);
      window.removeEventListener('pa-leak-review-updated', onRefresh);
    };
  }, [load, sharedPayload, userId]);

  // Scroll to deep-linked Progress subsection (?view=evidence|timeline|goals|report)
  useEffect(() => {
    if (!initialSection || activeMode !== 'progress' || typeof document === 'undefined') return undefined;
    const sectionMap = {
      evidence: 'progress-evidence',
      timeline: 'progress-timeline',
      goals: 'progress-goals',
      report: 'progress-report',
    };
    const targetId = sectionMap[initialSection];
    if (!targetId) return undefined;
    const timer = setTimeout(() => {
      const node = document.getElementById(targetId);
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [initialSection, activeMode]);

  const write = useCallback(async (body, successText, { reload = true } = {}) => {
    setSaving(true);
    setStatus(null);
    try {
      const payload = await apiRequest('POST', body);
      setStatus({ tone: 'success', text: successText });
      if (reload) await load({ background: true });
      return payload || true;
    } catch (requestError) {
      setStatus({ tone: 'danger', text: requestError?.message || 'The Change Could Not Be Saved' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [apiRequest, load]);

  const lifecycleRequest = useCallback(async (method = 'GET', body = null, { signal } = {}) => {
    const token = await getFreshAccessToken();
    if (!token) throw new Error('Sign In To Manage Your Personal Assistant Data');
    const response = await fetch('/api/assistant/data-controls', {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || `Data Control Request Failed With HTTP ${response.status}`);
    }
    return payload;
  }, []);

  const loadLifecycle = useCallback(async () => {
    if (!userId) return;
    lifecycleAbortRef.current?.abort();
    const requestId = ++lifecycleRequestIdRef.current;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    lifecycleAbortRef.current = controller;
    setLifecycleLoading(true);
    try {
      const result = await lifecycleRequest('GET', null, { signal: controller?.signal });
      if (requestId !== lifecycleRequestIdRef.current) return;
      setLifecycle(result);
    } catch (requestError) {
      if (requestError?.name === 'AbortError' || requestId !== lifecycleRequestIdRef.current) return;
      setStatus({ tone: 'danger', text: requestError?.message || 'Data Controls Could Not Be Loaded' });
    } finally {
      if (requestId === lifecycleRequestIdRef.current) {
        setLifecycleLoading(false);
      }
    }
  }, [lifecycleRequest, userId]);

  const downloadExport = useCallback(async () => {
    setLifecycleLoading(true);
    setStatus(null);
    try {
      const archive = await lifecycleRequest('POST', { action: 'export' });
      const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `smarter-poker-personal-assistant-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ tone: 'success', text: 'Verified Personal Assistant Export Downloaded' });
      await loadLifecycle();
    } catch (requestError) {
      setStatus({ tone: 'danger', text: requestError?.message || 'Verified Export Could Not Be Downloaded' });
    } finally {
      setLifecycleLoading(false);
    }
  }, [lifecycleRequest, loadLifecycle]);

  useEffect(() => {
    if ((view === 'data' || isSettingsOpen) && userId && !lifecycle) loadLifecycle();
  }, [isSettingsOpen, lifecycle, loadLifecycle, userId, view]);

  const syncSavedPreferences = useCallback((patch) => {
    setWorkspace((current) => {
      if (!current) return current;
      const nextPreferences = {
        ...(current.preferences || {}),
        ...patch,
      };
      const nextSnapshot = current.snapshot
        ? {
            ...current.snapshot,
            preferences: {
              ...(current.snapshot.preferences || {}),
              ...(patch.weekly_digest_opt_in !== undefined
                ? { weeklyDigestOptIn: Boolean(patch.weekly_digest_opt_in) }
                : {}),
              ...(patch.analysis_depth !== undefined
                ? { analysisDepth: patch.analysis_depth }
                : {}),
            },
          }
        : current.snapshot;
      const next = {
        ...current,
        preferences: nextPreferences,
        snapshot: nextSnapshot,
      };
      workspaceRef.current = next;
      onPayloadUpdated?.(next);
      return next;
    });
  }, [onPayloadUpdated]);

  const selectView = useCallback(async (nextView) => {
    if (nextView === 'data') {
      openSettingsSheet();
      return;
    }
    setView(nextView);
    if (onSwitchSection) {
      onSwitchSection(['evidence', 'timeline', 'goals', 'report'].includes(nextView) ? 'progress' : 'plan', nextView);
    }
    if (!userId) return;
    const saved = await write({
      action: 'save_preferences',
      preferences: {
        savedView: nextView,
        analysisDepth,
        panelLayout: workspace?.preferences?.panel_layout || {},
        weeklyDigestOptIn: Boolean(weeklyDigestOptIn),
      },
    }, 'Saved View Updated', { reload: false });
    if (saved) {
      syncSavedPreferences({ saved_view: nextView, savedView: nextView });
    }
  }, [analysisDepth, onSwitchSection, openSettingsSheet, syncSavedPreferences, userId, weeklyDigestOptIn, workspace, write]);

  const selectAnalysisDepth = useCallback(async (nextDepth) => {
    const previousDepth = analysisDepth;
    setAnalysisDepth(nextDepth);
    const saved = await write({
      action: 'save_preferences',
      preferences: {
        savedView: view,
        analysisDepth: nextDepth,
        panelLayout: workspace?.preferences?.panel_layout || {},
        weeklyDigestOptIn: Boolean(weeklyDigestOptIn),
      },
    }, 'Analysis Depth Updated', { reload: false });
    if (!saved) {
      setAnalysisDepth(previousDepth);
      return;
    }
    syncSavedPreferences({ analysis_depth: nextDepth, analysisDepth: nextDepth });
  }, [analysisDepth, syncSavedPreferences, view, weeklyDigestOptIn, workspace, write]);

  const toggleWeeklyDigest = useCallback(async (enabled) => {
    const previousOptIn = Boolean(weeklyDigestOptIn);
    const nextEnabled = Boolean(enabled);
    setWeeklyDigestOptIn(nextEnabled);
    const saved = await write({
      action: 'save_preferences',
      preferences: {
        savedView: view,
        analysisDepth,
        panelLayout: workspace?.preferences?.panel_layout || {},
        weeklyDigestOptIn: nextEnabled,
      },
    }, nextEnabled ? 'Weekly Coaching Digest Enabled' : 'Weekly Coaching Digest Disabled', { reload: false });
    if (!saved) {
      setWeeklyDigestOptIn(previousOptIn);
      return;
    }
    const serverPref = saved?.result ?? saved?.preferences ?? null;
    const serverOptIn = serverPref?.weeklyDigestOptIn ?? serverPref?.weekly_digest_opt_in;
    if (serverOptIn !== undefined && Boolean(serverOptIn) !== nextEnabled) {
      setWeeklyDigestOptIn(previousOptIn);
      setStatus({ tone: 'danger', text: 'Weekly Coaching Digest Preference Could Not Be Saved' });
      return;
    }
    syncSavedPreferences({ weekly_digest_opt_in: nextEnabled, weeklyDigestOptIn: nextEnabled });
  }, [analysisDepth, syncSavedPreferences, view, weeklyDigestOptIn, workspace, write]);

  const getStudyPlanMarkdown = useCallback(async () => {
    try {
      const mod = await import('../../lib/personal-assistant/studyPlanExport.mjs');
      if (typeof mod.buildStudyPlanMarkdown === 'function') {
        return mod.buildStudyPlanMarkdown(workspace?.snapshot);
      }
    } catch (_) {}
    const snap = workspace?.snapshot;
    const lines = [
      '# Coach-Ready Study Plan',
      `Generated: ${new Date().toISOString().slice(0, 10)}`,
      '',
      '## Priorities',
      ...(snap?.priorities || []).map((p, i) => {
        const score = Number.isFinite(Number(p?.confidence?.score))
          ? `${Math.round(Number(p.confidence.score))}% Confidence`
          : 'Unscored Confidence';
        return `${i + 1}. **${p?.title || 'Priority'}** (${score}) - ${p?.reason || 'Measured From Evidence'}`;
      }),
    ];
    return lines.join('\n');
  }, [workspace?.snapshot]);

  const handleCopyStudyPlan = useCallback(async () => {
    setExportingPlan(true);
    try {
      if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
        throw new Error('Clipboard Is Not Available');
      }
      const md = await getStudyPlanMarkdown();
      await navigator.clipboard.writeText(md);
      setStatus({ tone: 'success', text: 'Study Plan Copied To Clipboard' });
    } catch (_) {
      setStatus({ tone: 'danger', text: 'Could Not Copy Study Plan' });
    } finally {
      setExportingPlan(false);
    }
  }, [getStudyPlanMarkdown]);

  const handleDownloadStudyPlan = useCallback(async () => {
    setExportingPlan(true);
    try {
      const md = await getStudyPlanMarkdown();
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smarter-poker-study-plan-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ tone: 'success', text: 'Study Plan Downloaded As Markdown' });
    } catch (_) {
      setStatus({ tone: 'danger', text: 'Could Not Download Study Plan' });
    } finally {
      setExportingPlan(false);
    }
  }, [getStudyPlanMarkdown]);

  const handleClaimLiveFix = useCallback(async (leakId) => {
    setClaimingRewardLeakId(leakId);
    setStatus(null);
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
        const limitOrUnavailableMsg = data?.code === 'REWARDS_UNAVAILABLE'
          ? (data?.error || 'Diamond Rewards Are Temporarily Unavailable. Try Again Later.')
          : data?.code === 'REWARD_LIMIT_REACHED'
            ? (data?.error || 'Daily Or Monthly Diamond Reward Limit Reached. Try Again Later.')
            : (data?.error || 'Diamond Reward Could Not Be Claimed Right Now.');
        setStatus({ tone: 'warn', text: limitOrUnavailableMsg });
        return;
      }

      if (!(response.ok && data?.success === true && (isAwarded || isAlreadyAwarded))) {
        throw new Error(data?.error || `Claim Failed (HTTP ${response.status})`);
      }

      const state = isAlreadyAwarded ? 'already_awarded' : 'claimed';
      setClaimedRewardLeaks(prev => ({ ...prev, [leakId]: state }));
      const diamondsAwarded = data?.diamonds || 25;
      setStatus({
        tone: 'success',
        text: isAlreadyAwarded
          ? 'Reward Already Claimed For Verified Live Fix'
          : `${diamondsAwarded} Diamonds Claimed For Verified Live Fix`,
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pa-diamonds-updated'));
        window.dispatchEvent(new CustomEvent('pa-data-updated'));
      }
    } catch (err) {
      setStatus({ tone: 'danger', text: err?.message || 'Could Not Claim Diamonds' });
    } finally {
      setClaimingRewardLeakId(null);
    }
  }, []);

  const priorities = workspace?.snapshot?.priorities || [];
  const fallbackSelectedPriority = useMemo(() => {
    if (!selectedLeakId) return null;
    const snapLeak = findLeak(workspace?.snapshot?.leaks, selectedLeakId);
    const propLeak = findLeak(leaks, selectedLeakId);
    const raw = snapLeak || propLeak;
    if (!raw) return null;
    const rawConf = raw.confidence;
    const normalizedConfidence = rawConf && typeof rawConf === 'object' && Number.isFinite(Number(rawConf.score))
      ? {
          score: Number(rawConf.score),
          level: rawConf.level || 'medium',
          reasons: Array.isArray(rawConf.reasons) && rawConf.reasons.length > 0
            ? rawConf.reasons
            : ['Measured From Persisted Hand Evidence'],
        }
      : {
          score: rawConf === 'high' ? 85 : rawConf === 'low' ? 45 : 68,
          level: typeof rawConf === 'string' ? rawConf : 'medium',
          reasons: [
            raw.status === 'resolved'
              ? 'Resolved Leak Preserved For Historical Evidence Inspection'
              : 'Measured From Persisted Hand Evidence',
          ],
        };
    return {
      id: raw.id,
      title: raw.title || raw.situationClass || 'Detected Leak',
      category: raw.category || raw.leakCategory || 'preflop',
      status: raw.status || 'resolved',
      reason: raw.reason || raw.explanation || raw.situationClass || 'Measured From Persisted Evidence',
      recommendedDrill: raw.recommendedDrill || null,
      confidence: normalizedConfidence,
    };
  }, [leaks, selectedLeakId, workspace?.snapshot?.leaks]);
  const allInspectablePriorities = useMemo(() => {
    if (fallbackSelectedPriority && !priorities.some(item => String(item.id) === String(fallbackSelectedPriority.id))) {
      return [fallbackSelectedPriority, ...priorities];
    }
    return priorities;
  }, [fallbackSelectedPriority, priorities]);
  const needle = query.trim().toLowerCase();
  const visiblePriorities = useMemo(() => !needle ? allInspectablePriorities : allInspectablePriorities.filter(item => (
    `${item.title} ${item.category} ${item.reason}`.toLowerCase().includes(needle)
  )), [allInspectablePriorities, needle]);
  const selectedPriority = priorities.find(item => String(item.id) === String(selectedLeakId))
    || fallbackSelectedPriority
    || priorities[0]
    || null;
  const selectedLeak = findLeak(leaks, selectedPriority?.id) || findLeak(workspace?.snapshot?.leaks, selectedPriority?.id);
  const exampleLeakId = selectedLeak && /^[0-9a-f-]{36}$/i.test(String(selectedLeak.id)) ? selectedLeak.id : null;
  const { examples, isLoading: examplesLoading, error: examplesError, refetch: refetchExamples } = useLeakHandExamples(exampleLeakId);
  const evidence = selectedLeak
    ? buildEvidenceChain(selectedLeak, workspace?.decisions || [], workspace?.reviews || [], workspace?.snapshot?.versions || {}, examples)
    : [];
  const exactExample = examples?.[0] || null;
  const coverage = workspace?.snapshot?.coverage || {};
  const debriefHands = Array.isArray(workspace?.snapshot?.sessionDebrief?.topLeakedHands) && !workspace?.snapshot?.liveTableActive
    ? workspace.snapshot.sessionDebrief.topLeakedHands.filter(Boolean).slice(0, 2)
    : [];
  const rankedGaps = normalizeCoverageGapsRanked(workspace?.snapshot?.coverageGapsRanked, workspace?.snapshot?.coverageGapsSummary?.totalUnpriced ?? coverage.unpriced);
  const funnelSteps = normalizeFunnelMetrics(workspace?.snapshot?.funnelMetrics);
  const alerts = useMemo(() => {
    const rows = [];
    if (workspace?.snapshot?.summary?.due > 0) rows.push({ key: 'due', kind: 'due', text: `${workspace.snapshot.summary.due} Corrective Review${workspace.snapshot.summary.due === 1 ? ' Is' : 's Are'} Due` });
    if (coverage.unpriced > 0) rows.push({ key: 'unpriced', kind: 'info', text: `${coverage.unpriced} Decisions Remain Explicitly Unpriced` });
    const overdueGoals = (workspace?.goals || []).filter(item => item.status === 'active' && item.due_at && new Date(item.due_at).getTime() < Date.now());
    if (overdueGoals.length) rows.push({ key: 'goals', kind: 'info', text: `${overdueGoals.length} Coaching Goal${overdueGoals.length === 1 ? ' Needs' : 's Need'} Attention` });
    if (!rows.length) rows.push({ key: 'none', kind: 'info', text: 'No Coaching Alert Needs Immediate Action' });
    return rows;
  }, [coverage.unpriced, workspace]);

  const snapshot = workspace?.snapshot;
  const harvestQueuePayload = useMemo(
    () => buildCoverageGapsHarvestPayload(snapshot, rankedGaps),
    [snapshot, rankedGaps],
  );

  const handleCopyCoverageGaps = useCallback(async () => {
    const payload = buildCoverageGapsHarvestPayload(snapshot, rankedGaps);
    if (!payload) return false;
    try {
      if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
        throw new Error('Clipboard Is Not Available');
      }
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCoverageGapsCopyState('copied');
      setStatus({ tone: 'success', text: 'Copied Harvest Queue' });
      return true;
    } catch (_) {
      setCoverageGapsCopyState('failed');
      setStatus({ tone: 'danger', text: 'Copy Failed' });
      return false;
    }
  }, [snapshot, rankedGaps]);

  const settingsSheetNode = (
    <BottomSheet
      open={isSettingsOpen}
      onClose={closeSettingsSheet}
      title="Settings"
      subtitle="Analysis Depth, Study Plan Export, And Data Controls"
    >
      <div className={styles.dataGrid}>
        {status && <div className={styles.status} data-tone={status.tone} role="status">{status.text}</div>}

        {userId ? (
          <>
            <article className={styles.panel}>
              <span className={styles.eyebrow}>Coaching Preferences</span>
              <h3>Analysis Depth &amp; Weekly Digest</h3>
              <div className={styles.commandControls}>
                <label className={styles.depthControl}>
                  <span>Analysis Depth</span>
                  <select value={analysisDepth} disabled={saving} onChange={event => selectAnalysisDepth(event.target.value)} aria-label="Analysis Depth">
                    <option value="guided">Guided</option>
                    <option value="detailed">Detailed</option>
                    <option value="expert">Expert</option>
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer', marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(weeklyDigestOptIn)}
                    disabled={saving}
                    onChange={(event) => toggleWeeklyDigest(event.target.checked)}
                    aria-label="Weekly Coaching Digest"
                    style={{ width: 20, height: 20, minHeight: 20, margin: 0, cursor: 'pointer' }}
                  />
                  <span style={{ color: '#f1f5fc', fontSize: 13, fontWeight: 700 }}>
                    Weekly Coaching Digest
                  </span>
                </label>
                <div className={styles.receipt} aria-label="Reproducible Coaching Receipt">
                  <span>Analysis Receipt</span>
                  <strong data-pa-verbatim="true">{snapshot?.receipt || 'Unavailable'}</strong>
                </div>
              </div>
            </article>

            <article className={styles.panel}>
              <span className={styles.eyebrow}>Coach-Ready Study Plan</span>
              <h3>Export Study Plan</h3>
              <p>Copy Or Download Your Ranked Improvement Plan With Zero Personal Account Identifiers.</p>
              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setShowExportTray(prev => !prev)}
                  aria-expanded={showExportTray}
                  disabled={exportingPlan}
                >
                  <Download size={16} aria-hidden="true" />
                  <span>Export Study Plan</span>
                </button>
              </div>
              {showExportTray && (
                <div className={styles.exportTray} role="region" aria-label="Export Study Plan Actions">
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleCopyStudyPlan}
                    disabled={exportingPlan}
                  >
                    Copy Markdown
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleDownloadStudyPlan}
                    disabled={exportingPlan}
                  >
                    Download .Md File
                  </button>
                </div>
              )}
            </article>
          </>
        ) : (
          <article className={styles.panel} data-testid="settings-signin-gate">
            <span className={styles.eyebrow}>Account Coaching &amp; Data Controls</span>
            <h3>Sign In To Sync Preferences &amp; Export Your Study Plan</h3>
            <p>Local Filter And Practice Presets Below Apply Immediately On This Device. Sign In To Save Coaching Depth, Weekly Digests, Study Plan Exports, And Data Retention Controls To Your Account.</p>
            <div className={styles.actionRow}>
              <a href="/auth/login" className={styles.primaryButton}>Sign In</a>
            </div>
          </article>
        )}

        {extraSettingsContent}

        {userId && (
          <>
            <article className={`${styles.panel} ${styles.fullWidth}`}>
              <div className={styles.panelHeading}>
                <div><span className={styles.eyebrow}>Data And Privacy</span><h3>Your Personal Assistant Data Controls</h3></div>
                <ShieldCheck size={26} aria-hidden="true" />
              </div>
              <p>Download A Verified Archive, Choose How Long Completed Coaching Data Is Retained, Or Permanently Remove Personal Assistant Records. Club Arena Source Hands Are Never Removed By These Controls.</p>
              <div className={styles.actionRow}>
                <button type="button" className={styles.primaryButton} disabled={lifecycleLoading} onClick={downloadExport}>
                  <Download size={17} aria-hidden="true" />{lifecycleLoading ? 'Preparing Verified Export' : 'Download Verified Export'}
                </button>
                <button type="button" className={styles.secondaryButton} disabled={lifecycleLoading} onClick={loadLifecycle}>
                  <RefreshCw size={17} aria-hidden="true" />Refresh Data Inventory
                </button>
              </div>
            </article>

            <details className={`pa-disclosure ${styles.fullWidth}`}>
              <summary>
                <span>Data Inventory · Records In Your Workspace</span>
                <small>
                  {lifecycleLoading && !lifecycle
                    ? 'Loading…'
                    : !lifecycle
                      ? 'Not Available'
                      : `${(lifecycle?.counts?.leaks || 0) + (lifecycle?.counts?.decisions || 0)} Core Records`}
                </small>
              </summary>
              <div className="pa-disclosure-body">
                {lifecycleLoading && !lifecycle ? <p aria-busy="true">Loading Your Data Inventory</p> : !lifecycle ? (
                  <p>Data Inventory Is Currently Unavailable. Select Refresh Data Inventory To Retry.</p>
                ) : (
                  <dl className={styles.coverageList}>
                    <div><dt>Detected Leaks</dt><dd>{lifecycle.counts?.leaks ?? 0}</dd></div>
                    <div><dt>Audited Decisions</dt><dd>{lifecycle.counts?.decisions ?? 0}</dd></div>
                    <div><dt>Corrective Reviews</dt><dd>{lifecycle.counts?.reviews ?? 0}</dd></div>
                    <div><dt>Coaching Goals</dt><dd>{lifecycle.counts?.goals ?? 0}</dd></div>
                    <div><dt>Sandbox Sessions</dt><dd>{lifecycle.counts?.sandboxSessions ?? 0}</dd></div>
                    <div><dt>Saved Sandbox Hands</dt><dd>{lifecycle.counts?.savedHands ?? 0}</dd></div>
                    <div><dt>Coach Decisions</dt><dd>{lifecycle.counts?.coachResults ?? 0}</dd></div>
                    <div><dt>Sandbox Bookmarks</dt><dd>{lifecycle.counts?.bookmarks ?? 0}</dd></div>
                    <div><dt>Equity Snapshots</dt><dd>{lifecycle.counts?.equityHistory ?? 0}</dd></div>
                    <div><dt>Scenario Templates</dt><dd>{lifecycle.counts?.templates ?? 0}</dd></div>
                    <div><dt>Shared Scenarios</dt><dd>{lifecycle.counts?.sharedScenarios ?? 0}</dd></div>
                    <div><dt>Solution Bookmarks</dt><dd>{lifecycle.counts?.solutionBookmarks ?? 0}</dd></div>
                  </dl>
                )}
              </div>
            </details>

            <article className={styles.panel}>
              <span className={styles.eyebrow}>Retention Policy</span><h3>Control Completed Data Retention</h3>
              <p>Active Leaks, Active Goals, And Club Arena Source Hands Remain Available. The Selected Policy Removes Only Expired Completed Or Derived Personal Assistant Records.</p>
              <label>Retention Period
                <select value={lifecycle?.retentionDays ?? 'forever'} disabled={lifecycleLoading} onChange={async event => {
                  setLifecycleLoading(true);
                  setStatus(null);
                  try {
                    await lifecycleRequest('POST', { action: 'save_retention', retentionDays: event.target.value });
                    setStatus({ tone: 'success', text: 'Personal Assistant Retention Policy Saved' });
                    await loadLifecycle();
                    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pa-data-updated'));
                  } catch (requestError) {
                    setStatus({ tone: 'danger', text: requestError?.message || 'Retention Policy Could Not Be Saved' });
                  } finally {
                    setLifecycleLoading(false);
                  }
                }}>
                  <option value="forever">Keep Until I Delete It</option>
                  <option value="365">Keep Completed Data For 365 Days</option>
                  <option value="180">Keep Completed Data For 180 Days</option>
                  <option value="90">Keep Completed Data For 90 Days</option>
                  <option value="30">Keep Completed Data For 30 Days</option>
                </select>
              </label>
              <small className={styles.mutedCopy}>Last Retention Review: {formatDate(lifecycle?.lastRetentionRunAt)}</small>
            </article>

            <article className={`${styles.panel} ${styles.dangerPanel}`}>
              <span className={styles.eyebrow}><Trash2 size={14} aria-hidden="true" />Permanent Deletion</span><h3>Remove Personal Assistant Records</h3>
              <p>This Cannot Be Undone. Download A Verified Export First. Club Arena Source Hands Are Excluded.</p>
              <label>Records To Remove
                <select value={deleteScope} disabled={lifecycleLoading || Boolean(deleteChallenge)} onChange={event => setDeleteScope(event.target.value)}>
                  <option value="analysis">Leak Analysis And Corrective Reviews</option>
                  <option value="coaching">Coaching Goals, Feedback, And Preferences</option>
                  <option value="sandbox">Sandbox Sessions, Results, And Saved Hands</option>
                  <option value="all">All Personal Assistant Records</option>
                </select>
              </label>
              {!deleteChallenge ? (
                <button type="button" className={styles.removeDataButton} disabled={lifecycleLoading} onClick={async () => {
                  setLifecycleLoading(true);
                  setStatus(null);
                  try {
                    const payload = await lifecycleRequest('POST', { action: 'request_deletion', scope: deleteScope });
                    setDeleteChallenge(payload);
                    setDeleteConfirmation('');
                  } catch (requestError) {
                    setStatus({ tone: 'danger', text: requestError?.message || 'Deletion Confirmation Could Not Be Started' });
                  } finally {
                    setLifecycleLoading(false);
                  }
                }}>Review Permanent Deletion</button>
              ) : (
                <div className={styles.confirmDeletion}>
                  <p>Type <strong data-pa-verbatim="true">{deleteChallenge.confirmation}</strong> To Confirm Permanent Deletion.</p>
                  <label>Exact Confirmation
                    <input data-pa-verbatim="true" autoComplete="off" value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} />
                  </label>
                  <div className={styles.actionRow}>
                    <button type="button" className={styles.removeDataButton} disabled={lifecycleLoading || deleteConfirmation !== deleteChallenge.confirmation} onClick={async () => {
                      setLifecycleLoading(true);
                      setStatus(null);
                      try {
                        await lifecycleRequest('DELETE', { scope: deleteChallenge.scope, challenge: deleteChallenge.challenge, confirmation: deleteConfirmation });
                        setDeleteChallenge(null);
                        setDeleteConfirmation('');
                        setStatus({ tone: 'success', text: 'Personal Assistant Data Removed And Lifecycle Receipt Recorded' });
                        await load();
                        await loadLifecycle();
                        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pa-data-updated'));
                      } catch (requestError) {
                        setStatus({ tone: 'danger', text: requestError?.message || 'Personal Assistant Data Could Not Be Removed' });
                      } finally {
                        setLifecycleLoading(false);
                      }
                    }}>Permanently Remove Selected Records</button>
                    <button type="button" className={styles.secondaryButton} disabled={lifecycleLoading} onClick={() => { setDeleteChallenge(null); setDeleteConfirmation(''); }}>Cancel</button>
                  </div>
                </div>
              )}
            </article>

            <article className={styles.panel}>
              <span className={styles.eyebrow}>Lifecycle Receipts</span><h3>Recent Verified Data Actions</h3>
              {lifecycle?.receipts?.length ? (
                <ol className={styles.timelineList}>{lifecycle.receipts.map(receipt => (
                  <li key={receipt.id}><time>{formatDate(receipt.created_at)}</time><div><strong className={styles.titleValue}>{String(receipt.action || 'Data Action').replace(/_/g, ' ')}</strong><small>Scope: <span className={styles.titleValue}>{String(receipt.scope || 'all').replace(/_/g, ' ')}</span> · Receipt <span data-pa-verbatim="true">{receipt.receipt_fingerprint}</span></small></div></li>
                ))}</ol>
              ) : <p>No Lifecycle Receipt Has Been Recorded Yet.</p>}
            </article>
          </>
        )}
      </div>
    </BottomSheet>
  );

  if (settingsOnly) {
    return settingsSheetNode;
  }

  if (!userId) {
    return (
      <section className={styles.statePanel} aria-label="Coaching Workspace Sign In">
        <Target size={28} aria-hidden="true" />
        <h2>Build Your Personal Coaching Plan</h2>
        <p>Sign In To Turn Your Club Arena Evidence Into Goals, Reviews, And A Weekly Plan.</p>
        <a href="/auth/login" className={styles.primaryButton}>Sign In</a>
        {settingsSheetNode}
      </section>
    );
  }

  if (loading && !workspace?.snapshot) {
    return (
      <section className={styles.statePanel} aria-busy="true">
        <Activity className={styles.spin} aria-hidden="true" />
        <h2>Building Your Coaching Plan</h2>
        {settingsSheetNode}
      </section>
    );
  }

  if (error && !workspace?.snapshot) {
    return (
      <section className={styles.statePanel} role="alert">
        <AlertCircle size={28} aria-hidden="true" />
        <h2>Coaching Workspace Unavailable</h2>
        <p>{error}</p>
        <button type="button" className={styles.primaryButton} onClick={() => load()}><RefreshCw size={17} aria-hidden="true" />Retry</button>
        {settingsSheetNode}
      </section>
    );
  }

  return (
    <section className={styles.workspace} aria-label="Personal Coaching Workspace">
      <header className={styles.commandHeader}>
        <div className={styles.commandHeaderTop}>
          <div>
            <span className={styles.eyebrow}>{activeMode === 'progress' ? 'Progress & Evidence' : 'Today / Plan'}</span>
            <h2>{activeMode === 'progress' ? 'Verified Progress, Goals & Coverage' : 'Your Evidence-Backed Improvement Plan'}</h2>
            <p>Priorities Link Directly To Your Club Arena Hands And Verified Corrective Drills.</p>
          </div>
          <button
            type="button"
            className={styles.settingsGearBtn}
            aria-label="Open Assistant Settings"
            onClick={openSettingsSheet}
          >
            <Settings size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {status && <div className={styles.status} data-tone={status.tone} role="status">{status.text}</div>}

      {activeMode === 'plan' && (
        <div className={styles.coachGrid}>
          <article className={`${styles.panel} ${styles.nextAction}`}>
            <span className={styles.eyebrow}>Next Best Action</span>
            {snapshot?.nextBestAction ? (
              <>
                <h3>{snapshot.nextBestAction.action}</h3>
                <strong>{snapshot.nextBestAction.title}</strong>
                <p>{snapshot.nextBestAction.reason}</p>
                <div className={styles.onePlusOneRow}>
                  <button
                    type="button"
                    className={`${styles.primaryButton} ${styles.onePlusOnePrimary}`}
                    onClick={() => {
                      const targetLeak = findLeak(leaks, snapshot.nextBestAction.leakId);
                      if (onStartReview && targetLeak) onStartReview(targetLeak);
                      else onOpenHandReview?.(targetLeak);
                    }}
                  >
                    Practice This
                  </button>
                  <button
                    type="button"
                    className={styles.overflowBtn}
                    aria-label={`More Actions For ${snapshot.nextBestAction.title}`}
                    onClick={() => setOverflowModule({
                      leakId: snapshot.nextBestAction.leakId,
                      title: snapshot.nextBestAction.title,
                      reason: snapshot.nextBestAction.reason,
                    })}
                  >
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : (
              <><h3>Run A Fresh Deterministic Audit</h3><p>No Active Leak Is Currently Proven.</p></>
            )}
          </article>

          <article className={styles.panel}>
            <span className={styles.eyebrow}><Bell size={14} aria-hidden="true" />Due Drills &amp; Coaching Alerts</span>
            <ul className={styles.alertList}>
              {alerts.map(alert => (
                <li key={alert.key}>
                  {alert.kind === 'due' ? (
                    onJumpToLeaks ? (
                      <button type="button" className={styles.alertAction} onClick={() => onJumpToLeaks()} data-alert-action="due-reviews">
                        <span>{alert.text}</span><ChevronRight size={16} aria-hidden="true" />
                      </button>
                    ) : (
                      <a className={styles.alertAction} href="/hub/personal-assistant/leaks?tab=leaks" data-alert-action="due-reviews">
                        <span>{alert.text}</span><ChevronRight size={16} aria-hidden="true" />
                      </a>
                    )
                  ) : alert.text}
                </li>
              ))}
            </ul>
          </article>

          <div className={styles.metricGrid} aria-label="Coaching Summary">
            <div><span>Active Leaks</span><strong>{snapshot?.summary?.active || 0}</strong></div>
            <div><span>Reviews Due</span><strong>{snapshot?.summary?.due || 0}</strong></div>
            <div><span>Resolved Leaks</span><strong>{snapshot?.summary?.resolved || 0}</strong></div>
            <div>
              <span>Measured Loss</span>
              <strong>
                {typeof snapshot?.summary?.measuredEvLoss === 'number' && Number.isFinite(snapshot.summary.measuredEvLoss)
                  ? `${snapshot.summary.measuredEvLoss.toFixed(2)} BB`
                  : 'Unpriced'}
              </strong>
            </div>
          </div>

          {Array.isArray(snapshot?.trainingPlan?.modules) && snapshot.trainingPlan.modules.length > 0 ? (
            <article className={`${styles.panel} ${styles.fullWidth}`} aria-label="Deterministic Training Plan">
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.eyebrow}>Deterministic Training Plan</span>
                  <h3>{snapshot.trainingPlan.headline}</h3>
                </div>
                <Target size={22} aria-hidden="true" />
              </div>
              <ol className={styles.priorityList}>
                {snapshot.trainingPlan.modules.map((mod) => {
                  const matchedLeak = findLeak(leaks, mod.leakId);
                  const advice = mod.takeaway && mod.evidenceBasis
                    ? mod
                    : buildAdviceExplanation(matchedLeak || { id: mod.leakId, title: mod.title, leakCategory: mod.category });
                  const takeawayText = advice.takeaway?.whatYouAreDoing || mod.objective;
                  const basisKey = advice.evidenceBasis || 'general_coaching';
                  const rep = advice.representativeHand || {};
                  const samples = advice.sampleCounts || {};
                  const rateOrNull = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));
                  const postRate = rateOrNull(mod.tableVerification?.postMistakeRate ?? mod.tableVerification?.postBaselineErrorRate);
                  const preRate = rateOrNull(mod.tableVerification?.preMistakeRate ?? mod.tableVerification?.preBaselineErrorRate);
                  const isVerifiedFixed = mod.tableVerification?.status === 'confirmed_fixed_at_tables';
                  const isRewardClaimed = Boolean(claimedRewardLeaks[mod.leakId] || mod.tableVerification?.rewardClaimed);

                  return (
                    <li key={`plan-${mod.leakId}`}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{mod.rank}. {mod.title}</strong>
                          <span className={styles.basisPill} data-basis={basisKey}>
                            {formatEvidenceBasis(basisKey)}
                          </span>
                        </div>

                        <p className={styles.findingTakeaway}>{takeawayText}</p>

                        <span className={styles.repHandNote}>
                          {[
                            mod.formatScope,
                            rep.street ? titleWords(rep.street) : null,
                            rep.heroPosition || null,
                            rep.priceOrSizing ? titleWords(rep.priceOrSizing) : null,
                            samples.opportunities ? `${samples.mistakes || 0}/${samples.opportunities} Spots` : null,
                          ].filter(Boolean).join(' · ')}
                        </span>

                        {mod.tableVerification && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                            <span
                              className={styles.confidence}
                              data-level={isVerifiedFixed ? 'high' : mod.tableVerification.status === 'relapsed_at_tables' ? 'low' : 'medium'}
                            >
                              {mod.tableVerification.label}
                            </span>
                            {postRate !== null && (
                              <small>
                                Post-Drill Mistake Rate {postRate}% ({mod.tableVerification.postSampleCount ?? mod.tableVerification.postBaselineSamples ?? 0} Spots)
                                {preRate !== null ? ` · Pre-Drill ${preRate}%` : ''}
                              </small>
                            )}
                            {isVerifiedFixed && isRewardClaimed && (
                              <span className={styles.claimedBadge}>
                                {claimedRewardLeaks[mod.leakId] === 'already_awarded' ? 'Reward Already Claimed' : 'Reward Claimed'}
                              </span>
                            )}
                          </div>
                        )}

                        {mod.stakePoolContext && !snapshot?.sessionDebrief?.liveTableActive && !snapshot?.sessionDebrief?.cooldownActive && !snapshot?.liveTableActive && (
                          <div className={styles.stakePoolNote} role="note">
                            <span>
                              {mod.stakePoolContext.label || 'Stake Pool Benchmark'}: {mod.stakePoolContext.poolMetricLabel || ''}{mod.stakePoolContext.stakeLabel ? ` (${mod.stakePoolContext.stakeLabel})` : ''} · GTO: {mod.stakePoolContext.gtoBaselineLabel || 'Optimal'}{mod.stakePoolContext.sampleHands ? ` · ${mod.stakePoolContext.sampleHands.toLocaleString()} Hands` : ''}
                            </span>
                          </div>
                        )}

                        <Progress
                          value={mod.mastery?.percent || 0}
                          label={`Mastery Progress (${mod.mastery?.currentStreak || 0}/${mod.mastery?.targetStreak || 4} Strong Sessions)`}
                        />

                        <div className={styles.onePlusOneRow}>
                          {isVerifiedFixed && !isRewardClaimed ? (
                            <button
                              type="button"
                              className={`${styles.claimButton} ${styles.onePlusOnePrimary}`}
                              disabled={claimingRewardLeakId === mod.leakId}
                              onClick={() => handleClaimLiveFix(mod.leakId)}
                              aria-label={`Claim 25 Diamonds For ${mod.title}`}
                            >
                              <span>{claimingRewardLeakId === mod.leakId ? 'Claiming…' : 'Claim 25 Diamonds'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={`${styles.primaryButton} ${styles.onePlusOnePrimary}`}
                              onClick={() => {
                                const leakTarget = matchedLeak || {
                                  id: mod.leakId,
                                  title: mod.title,
                                  leakCategory: mod.category,
                                  recommendedDrill: mod.trainingGameId,
                                  sourceSystem: 'solver_engine',
                                };
                                if (mod.due && onStartReview) onStartReview(leakTarget);
                                else if (onTrain) onTrain(leakTarget);
                                else onStartReview?.(leakTarget);
                              }}
                            >
                              {mod.due ? 'Drill Now' : 'Practice This'}
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.overflowBtn}
                            aria-label={`More Actions For ${mod.title}`}
                            onClick={() => setOverflowModule({
                              ...mod,
                              evidenceBasis: basisKey,
                              takeaway: advice.takeaway,
                              representativeHand: rep,
                              sampleCounts: samples,
                              matchedLeak,
                            })}
                          >
                            <MoreHorizontal size={18} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </article>
          ) : (
            <article className={`${styles.panel} ${styles.fullWidth}`}>
              <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Ranked Weekly Program</span><h3>Focus In This Order</h3></div><ListChecks size={24} aria-hidden="true" /></div>
              {visiblePriorities.length ? (
                <ol className={styles.priorityList}>
                  {visiblePriorities.map((priority, index) => (
                    <li key={priority.id}>
                      <button type="button" onClick={() => { setSelectedLeakId(priority.id); selectView('evidence'); }}>
                        <span className={styles.rank}>{index + 1}</span>
                        <span className={styles.priorityCopy}><strong>{priority.title}</strong><small>{priority.reason}</small></span>
                        <span className={styles.confidence} data-level={priority.confidence.level}>{priority.confidence.score}% Confidence</span>
                        <ChevronRight size={18} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <p>No Priority Matches Your Search.</p>}
            </article>
          )}

          <article className={`${styles.panel} ${styles.fullWidth}`}>
            <span className={styles.eyebrow}>Latest Session Debrief</span>
            <h3>{snapshot?.sessionDebrief?.headline}</h3>
            <div className={styles.debriefGrid}>
              <div><span>Strongest Signal</span><strong>{snapshot?.sessionDebrief?.strongestSignal}</strong></div>
              <div><span>Most Expensive Mistake</span><strong>{snapshot?.sessionDebrief?.expensiveMistake}</strong></div>
              <div><span>Evidence Coverage</span><strong>{snapshot?.sessionDebrief?.coverageNote}</strong></div>
            </div>
            {snapshot?.liveTableActive ? (
              <div className={styles.inlineNotice} role="status">Hand-Level Review Is Paused While You Are Seated At A Live Table.</div>
            ) : debriefHands.length > 0 && (
              <ul className={styles.debriefHands} aria-label="Most Expensive Hands">
                {debriefHands.map((hand, index) => (
                  <li key={`${hand.handId || 'hand'}-${index}`}>
                    <span className={styles.debriefHandCopy}>
                      <strong>{[titleWords(hand.street), hand.position].filter(Boolean).join(' · ') || 'Hand'}{hand.heroHand ? ` · ${hand.heroHand}` : ''}</strong>
                      <small>
                        {hand.playerAction ? `You: ${titleWords(hand.playerAction)}` : 'Your Action Not Recorded'}
                        {hand.solverAction ? ` · Solver: ${titleWords(hand.solverAction)}` : ''}
                        {typeof hand.evLossBB === 'number' && Number.isFinite(hand.evLossBB) ? ` · ${Math.abs(hand.evLossBB).toFixed(2)} BB Lost` : ''}
                      </small>
                    </span>
                    {hand.handId && (onInspectHand || onDrillHand) && (
                      <span className={styles.debriefHandActions}>
                        {onInspectHand && <button type="button" className={styles.secondaryButton} onClick={() => onInspectHand(hand.handId)}>Inspect Hand</button>}
                        {(onDrillHand || onInspectHand) && <button type="button" className={styles.primaryButton} onClick={() => (onDrillHand || onInspectHand)(hand.handId)}>Drill Spot</button>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      )}

      {activeMode === 'progress' && (
        <div className={styles.progressReport}>
          {/* 1. Coaching Funnel & Weekly Report Summary */}
          <article id="progress-report" className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>Weekly Coaching Report</span>
                <h3>{coverage.verified || 0} Solver-Verified Decisions</h3>
              </div>
              <Trophy size={24} aria-hidden="true" />
            </div>

            {funnelSteps && (
              <div className={styles.funnel} role="group" aria-label="Coaching Funnel">
                <span className={styles.eyebrow}>Coaching Funnel</span>
                <ol className={styles.funnelSteps}>
                  {funnelSteps.map(step => (
                    <li key={step.key}>
                      <span>{step.label}</span>
                      <strong>{countOrUnavailable(step.value)}</strong>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {(coverage.decisions || 0) + (coverage.rejected || 0) > 0 ? (
              <Progress value={coverage.verifiedPercent} label="Verified Decision Coverage" />
            ) : (
              <p className={styles.mutedCopy}>Verified Decision Coverage: Not Available (No Audited Decisions Yet)</p>
            )}
            {coverage.windowLimited && <div className={styles.inlineNotice}>Coverage Uses The Latest {coverage.windowLimit} Audited Decisions. Older Evidence Remains Stored But Is Outside This Coaching Snapshot.</div>}

            <div className={styles.reportMetrics}>
              <div>
                <span>Verified Coverage</span>
                <strong>
                  {(coverage.decisions || 0) + (coverage.rejected || 0) > 0
                    ? `${snapshot?.weeklyReport?.verifiedCoverage || 0}%`
                    : 'Not Available'}
                </strong>
              </div>
              <div><span>Review Load</span><strong>{snapshot?.weeklyReport?.reviewLoad || 0}</strong></div>
              <div>
                <span>Measured EV Loss</span>
                <strong>
                  {typeof snapshot?.weeklyReport?.measuredEvLoss === 'number' && Number.isFinite(snapshot.weeklyReport.measuredEvLoss)
                    ? `${snapshot.weeklyReport.measuredEvLoss.toFixed(2)} BB`
                    : 'Unpriced'}
                </strong>
              </div>
            </div>

            <dl className={styles.coverageList}>
              <div><dt>Decisions</dt><dd>{coverage.decisions || 0}</dd></div>
              <div><dt>Partially Matched</dt><dd>{coverage.partiallyMatched || 0}</dd></div>
              <div><dt>Explicitly Unpriced</dt><dd>{coverage.unpriced || 0}</dd></div>
              <div><dt>Rejected Before Audit</dt><dd>{coverage.rejected || 0}</dd></div>
            </dl>

            {(snapshot?.weeklyReport?.focus || []).length > 0 ? (
              <ol className={styles.reportList}>
                {snapshot.weeklyReport.focus.map(item => (
                  <li key={item.id}>
                    <span>Priority {item.rank}</span>
                    <strong>{item.title}</strong>
                    <small>{item.targetReviews} Corrective Reviews, Then Reassess With Fresh Club Arena Hands</small>
                    <button type="button" className={styles.secondaryButton} onClick={() => onOpenHandReview?.(findLeak(leaks, item.id))}>Open Audited Review</button>
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ marginTop: 10 }}>Run A Fresh Deterministic Audit To Build This Week's Plan.</p>
            )}
            <footer className={styles.reportFooter}><BookOpen size={17} aria-hidden="true" /><span>Corrective Mastery Never Resolves A Real-Play Leak By Itself. Fresh Club Arena Evidence Must Confirm Improvement.</span></footer>
          </article>

          {/* 2. Progress Timeline */}
          <article id="progress-timeline" className={styles.panel}>
            <span className={styles.eyebrow}>Progress Timeline</span>
            <h3>From Detection To Real-Play Confirmation</h3>
            {snapshot?.timeline?.length ? (
              <ol className={styles.timelineList}>
                {snapshot.timeline.map((event, index) => (
                  <li key={`${event.at}-${event.leakId}-${index}`}>
                    <time>{formatDate(event.at)}</time>
                    <div>
                      <strong>{event.title}</strong>
                      <small>{event.type === 'review' ? `Review Score ${Math.round(number(event.score) * 100)}%` : 'Measured From Persisted Evidence'}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p>No Timeline Evidence Is Available Yet.</p>}
          </article>

          {/* 3. Coaching Goals */}
          <div id="progress-goals" className={styles.goalsGrid}>
            <article className={styles.panel}>
              <span className={styles.eyebrow}>Saved Goals</span>
              <h3>Your Measured Targets</h3>
              {(workspace?.goals || []).length ? (
                <ul className={styles.goalList}>
                  {workspace.goals.map(item => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.metric}: {item.current_value ?? 'Not Measured'} Of {item.target_value} By {formatGoalDate(item.due_at)}</small>
                      </div>
                      <div className={styles.goalActions}>
                        <button type="button" disabled={saving || item.status === 'completed'} aria-label={`Mark ${item.title} Complete`} onClick={() => write({ action: 'save_goal', goal: goalPayload(item, { currentValue: item.target_value, status: 'completed' }) }, 'Goal Marked Complete')}>
                          {item.status === 'completed' ? 'Completed' : 'Mark Complete'}
                        </button>
                        <button type="button" disabled={saving || item.status === 'completed'} aria-label={`${item.status === 'paused' ? 'Resume' : 'Pause'} ${item.title}`} onClick={() => write({ action: 'save_goal', goal: goalPayload(item, { status: item.status === 'paused' ? 'active' : 'paused' }) }, item.status === 'paused' ? 'Goal Resumed' : 'Goal Paused')}>
                          {item.status === 'paused' ? 'Resume' : 'Pause'}
                        </button>
                        <button type="button" className={styles.removeGoal} disabled={saving} aria-label={`${confirmGoalId === item.id ? 'Confirm Removal Of' : 'Remove'} ${item.title}`} onClick={async () => {
                          if (confirmGoalId !== item.id) {
                            setConfirmGoalId(item.id);
                            return;
                          }
                          const removed = await write({ action: 'delete_goal', goal: { id: item.id } }, 'Coaching Goal Removed');
                          if (removed) setConfirmGoalId(null);
                        }}>
                          {confirmGoalId === item.id ? 'Confirm Remove' : 'Remove'}
                        </button>
                        {confirmGoalId === item.id && (
                          <button type="button" disabled={saving} aria-label={`Cancel Removal Of ${item.title}`} onClick={() => setConfirmGoalId(null)}>Cancel</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p>No Coaching Goal Has Been Saved Yet.</p>}
            </article>

            <form className={styles.panel} onSubmit={async event => {
              event.preventDefault();
              const saved = await write({ action: 'save_goal', goal: { ...goal, leakId: selectedPriority?.id || null } }, 'Coaching Goal Saved');
              if (saved) setGoal({ title: '', metric: 'Accuracy Percent', targetValue: '90', dueAt: '' });
            }}>
              <span className={styles.eyebrow}>Create A Verified Goal</span>
              <h3>Tie Progress To Measured Evidence</h3>
              <label>Goal Title<input required maxLength={160} value={goal.title} onChange={event => setGoal(current => ({ ...current, title: event.target.value }))} placeholder="Reduce River Overfolding" /></label>
              <label>Metric<input required maxLength={80} value={goal.metric} onChange={event => setGoal(current => ({ ...current, metric: event.target.value }))} /></label>
              <label>Target Value<input required type="number" step="0.1" value={goal.targetValue} onChange={event => setGoal(current => ({ ...current, targetValue: event.target.value }))} /></label>
              <label>Target Date<input type="date" value={goal.dueAt} onChange={event => setGoal(current => ({ ...current, dueAt: event.target.value }))} /></label>
              <button type="submit" className={styles.primaryButton} disabled={saving}>Save Goal</button>
            </form>
          </div>

          {/* 4. Solver Coverage Gaps */}
          <article id="progress-gaps" className={styles.panel} role="region" aria-label="Solver Coverage Gaps">
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>
                  Most Requested Coverage Gaps{(rankedGaps.total ?? harvestQueuePayload?.totalUnmeasured ?? null) !== null ? ` · ${(rankedGaps.total ?? harvestQueuePayload?.totalUnmeasured).toLocaleString()} Unpriced Decisions` : ''}
                </span>
                <h3>Top Unmeasured Solver Buckets</h3>
              </div>
              {harvestQueuePayload && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    data-testid="copy-coverage-gaps-btn"
                    className={styles.secondaryButton}
                    style={{ minHeight: 44 }}
                    onClick={handleCopyCoverageGaps}
                    aria-label="Copy Harvest Queue JSON"
                  >
                    <span>
                      {coverageGapsCopyState === 'copied'
                        ? 'Copied Harvest Queue'
                        : coverageGapsCopyState === 'failed'
                          ? 'Copy Failed'
                          : 'Copy Harvest Queue JSON'}
                    </span>
                  </button>
                  {coverageGapsCopyState && (
                    <span
                      role="status"
                      aria-live="polite"
                      data-testid="copy-coverage-gaps-status"
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: coverageGapsCopyState === 'copied' ? '#4de0a5' : '#ff8290',
                      }}
                    >
                      {coverageGapsCopyState === 'copied' ? 'Copied Harvest Queue' : 'Copy Failed'}
                    </span>
                  )}
                </div>
              )}
            </div>
            {rankedGaps.rows.length > 0 ? (
              <ol className={styles.gapDemandList} aria-label="Coverage Gap Demand">
                {rankedGaps.rows.map((gap, index) => (
                  <li key={`${gap.format}-${gap.street}-${gap.position}-${gap.stackBucket}-${gap.reason}-${index}`}>
                    <span className={styles.gapRank}>{index + 1}</span>
                    <span className={styles.gapCopy}>
                      <strong>{[gap.format, gap.street, gap.position].filter(Boolean).join(' · ')}</strong>
                      <small>{[gap.stackBucket, gap.reason].filter(Boolean).join(' · ') || 'No Reason Recorded'}</small>
                      {gap.hintLabel && (
                        <small data-coverage-tier={gap.hintTier || undefined}>
                          {gap.hintLabel}{gap.studyGuidance ? ` · ${gap.studyGuidance}` : ''}
                        </small>
                      )}
                    </span>
                    <span className={styles.gapCount}>{gap.count.toLocaleString()} Spots</span>
                  </li>
                ))}
              </ol>
            ) : harvestQueuePayload ? (
              <ul className={styles.alertList}>
                {harvestQueuePayload.buckets.slice(0, 5).map((gap, index) => (
                  <li key={`${gap.format}-${gap.street}-${gap.position}-${gap.spotType}-${index}`}>
                    <strong>{gap.format} · {String(gap.street || '').toUpperCase()} · {gap.position}</strong> ({gap.spotType}): {gap.count} Spots{Number.isFinite(Number(gap.sharePercent)) ? ` (${gap.sharePercent}% Of Unmeasured)` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p>All Audited Decisions Matched Known Solver Or Chart Nodes.</p>
            )}
          </article>

          {/* 5. Evidence Inspector & Provenance */}
          <div id="progress-evidence" className={styles.evidenceGrid}>
            <div className={styles.searchBar}>
              <Search size={18} aria-hidden="true" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search Hands, Leaks, Goals, Or Evidence" aria-label="Search Coaching Workspace" />
            </div>

            <aside className={styles.panel}>
              <span className={styles.eyebrow}>Evidence Inspector</span>
              <h3>Select A Leak</h3>
              <div className={styles.leakPicker}>
                {visiblePriorities.map(priority => (
                  <button key={priority.id} type="button" className={String(selectedPriority?.id) === String(priority.id) ? styles.selectedLeak : ''} onClick={() => setSelectedLeakId(priority.id)}>
                    <span>{priority.title}</span><small>{priority.status}</small>
                  </button>
                ))}
              </div>
            </aside>

            <div className={styles.panel}>
              {selectedPriority ? (
                <>
                  <span className={styles.eyebrow}>Confidence Breakdown</span>
                  <h3>{selectedPriority.title}</h3>
                  <Progress value={selectedPriority.confidence.score} label="Measured Confidence" />
                  <ul className={styles.reasonList}>
                    {selectedPriority.confidence.reasons.slice(0, analysisDepth === 'guided' ? 1 : analysisDepth === 'detailed' ? 2 : undefined).map(reason => (
                      <li key={reason}><Check size={15} aria-hidden="true" />{reason}</li>
                    ))}
                  </ul>
                  <div className={styles.actionRow}>
                    <button type="button" className={styles.primaryButton} disabled={examplesLoading} onClick={() => exactExample ? onReviewExample?.(selectedLeak, exactExample) : onOpenHandReview?.(selectedLeak)}>
                      {examplesLoading ? 'Loading Hand Evidence' : 'Open Audited Hand Review'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => onTrain?.(selectedLeak || {
                        id: selectedPriority.id,
                        title: selectedPriority.title,
                        leakCategory: selectedPriority.category,
                        recommendedDrill: selectedPriority.recommendedDrill,
                        sourceSystem: 'solver_engine',
                      })}
                    >
                      Open Training Game
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={() => onOpenLeak?.(selectedPriority.id)}>Open Leak Details</button>
                  </div>
                  {examplesError && <div className={styles.inlineNotice} role="status">Exact Hand Evidence Could Not Be Loaded. <button type="button" onClick={refetchExamples}>Retry</button></div>}
                  {!examplesLoading && !examplesError && !exactExample && <div className={styles.inlineNotice}>No Persisted Example Hand Is Attached. Upload The Original Hand History For An Audited Review.</div>}
                </>
              ) : <p>No Evidence Is Available Yet.</p>}
            </div>

            <details className={`pa-disclosure ${styles.fullWidth}`}>
              <summary>
                <span>Source-To-Training Trace &amp; Provenance</span>
                <small>{evidence.length} Steps</small>
              </summary>
              <div className="pa-disclosure-body">
                <div className={styles.evidenceChain}>
                  {evidence.map((entry, index) => (
                    <div key={`${entry.stage}-${index}`} data-state={entry.state}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{entry.stage}</strong>
                        <small data-pa-verbatim={entry.stage.includes('Decision') || entry.stage.includes('Hand') ? 'true' : undefined}>{entry.detail}</small>
                      </div>
                    </div>
                  ))}
                </div>
                {analysisDepth === 'expert' && (
                  <dl className={styles.provenanceGrid} aria-label="Expert Analysis Provenance">
                    <div><dt>Evidence Fingerprint</dt><dd data-pa-verbatim="true">{snapshot?.evidenceFingerprint || 'Unavailable'}</dd></div>
                    <div><dt>Matcher</dt><dd data-pa-verbatim="true">{snapshot?.versions?.matcher || 'Unavailable'}</dd></div>
                    <div><dt>Detector</dt><dd data-pa-verbatim="true">{snapshot?.versions?.detector || 'Unavailable'}</dd></div>
                    <div><dt>Review Schema</dt><dd data-pa-verbatim="true">{snapshot?.versions?.reviewSchema || 'Unavailable'}</dd></div>
                  </dl>
                )}
              </div>
            </details>

            <details className={`pa-disclosure ${styles.fullWidth}`}>
              <summary>
                <span><MessageSquareWarning size={14} aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />Coach Feedback · Flag This Analysis</span>
                <small>Optional</small>
              </summary>
              <div className="pa-disclosure-body">
                <div className={styles.panel} style={{ border: 0, padding: 0, background: 'transparent' }}>
                  <select value={feedbackType} onChange={event => setFeedbackType(event.target.value)} aria-label="Feedback Type">
                    <option value="confusing">Confusing</option>
                    <option value="incorrect">Incorrect</option>
                    <option value="mismatched">Mismatched</option>
                    <option value="helpful">Helpful</option>
                  </select>
                  <textarea value={feedbackNote} onChange={event => setFeedbackNote(event.target.value)} maxLength={2000} placeholder="Explain What Needs Review" aria-label="Feedback Note" />
                  <button type="button" className={styles.primaryButton} disabled={saving || !selectedPriority} onClick={async () => {
                    const decisionKey = evidence[1]?.state === 'verified' ? evidence[1].detail : null;
                    const saved = await write({ action: 'submit_feedback', feedback: { leakId: selectedPriority?.id, feedbackType, note: feedbackNote, decisionKey } }, 'Coach Feedback Sent For Review');
                    if (saved) setFeedbackNote('');
                  }}>Submit Feedback</button>
                </div>
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Overflow 1+1 Action Sheet for Training Plan Modules */}
      <BottomSheet
        open={Boolean(overflowModule)}
        onClose={closeOverflowModule}
        title={overflowModule?.title || 'Leak Actions'}
        subtitle="Secondary Actions & Evidence Summary"
      >
        {overflowModule && (
          <div style={{ display: 'grid', gap: 12 }}>
            {overflowModule.takeaway && (
              <div className={styles.panel}>
                <span className={styles.eyebrow}>Finding Details</span>
                <p className={styles.findingTakeaway}>{overflowModule.takeaway.whatYouAreDoing}</p>
                {overflowModule.takeaway.whatToDoNextTime && (
                  <p style={{ marginTop: 6 }}>{overflowModule.takeaway.whatToDoNextTime}</p>
                )}
                <dl className={styles.coverageList}>
                  <div>
                    <dt>Evidence Basis</dt>
                    <dd>
                      {formatEvidenceBasis(overflowModule.evidenceBasis)}{' '}
                      (<span data-pa-verbatim="true">{overflowModule.evidenceBasis || 'general_coaching'}</span>)
                    </dd>
                  </div>
                  <div>
                    <dt>Street &amp; Position</dt>
                    <dd>{titleWords(overflowModule.representativeHand?.street || (['preflop', 'flop', 'turn', 'river'].includes(String(overflowModule.category || '').toLowerCase()) ? overflowModule.category : 'All Streets'))} · {overflowModule.representativeHand?.heroPosition || 'All Positions'}</dd>
                  </div>
                  <div>
                    <dt>Price Or Sizing</dt>
                    <dd>{titleWords(overflowModule.representativeHand?.priceOrSizing || 'General')}</dd>
                  </div>
                  <div>
                    <dt>Sample &amp; Opportunities</dt>
                    <dd>{overflowModule.sampleCounts?.mistakes ?? overflowModule.mistakes ?? 0} Mistakes / {overflowModule.sampleCounts?.opportunities ?? overflowModule.samples ?? 0} Opportunities</dd>
                  </div>
                </dl>
              </div>
            )}

            <div className={styles.sheetActionList}>
              <button
                type="button"
                className={styles.sheetActionBtn}
                onClick={() => {
                  const target = overflowModule.matchedLeak || findLeak(leaks, overflowModule.leakId) || {
                    id: overflowModule.leakId,
                    title: overflowModule.title,
                    leakCategory: overflowModule.category,
                    recommendedDrill: overflowModule.trainingGameId,
                    sourceSystem: 'solver_engine',
                  };
                  setOverflowModule(null);
                  onTrain?.(target);
                }}
              >
                <span>Launch Targeted Drill</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.sheetActionBtn}
                onClick={() => {
                  const target = overflowModule.matchedLeak || findLeak(leaks, overflowModule.leakId);
                  setOverflowModule(null);
                  onOpenHandReview?.(target);
                }}
              >
                <span>Review Audited Hand</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.sheetActionBtn}
                onClick={() => {
                  const id = overflowModule.leakId;
                  setOverflowModule(null);
                  setSelectedLeakId(id);
                  selectView('evidence');
                }}
              >
                <span>Inspect Evidence</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.sheetActionBtn}
                onClick={() => {
                  const id = overflowModule.leakId;
                  setOverflowModule(null);
                  onOpenLeak?.(id);
                }}
              >
                <span>Details</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {settingsSheetNode}
    </section>
  );
}
