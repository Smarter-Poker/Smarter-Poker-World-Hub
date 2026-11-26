import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, Bell, BookOpen, CalendarDays, Check, ChevronRight, ClipboardCheck,
  Crosshair, Database, Download, Flag, Gauge, ListChecks, MessageSquareWarning, RefreshCw,
  Search, ShieldCheck, Target, Trash2, Trophy,
} from 'lucide-react';
import { getFreshAccessToken } from '../../lib/authUtils';
import { useLeakHandExamples } from '../../hooks/useAssistant';
import { buildEvidenceChain } from '../../lib/personal-assistant/coachingIntelligence.mjs';
import { normalizeCoverageGapsRanked, normalizeFunnelMetrics } from '../../lib/personal-assistant/liveVerificationPresentation.mjs';
import styles from './CoachingWorkspace.module.css';

const VIEWS = [
  { id: 'coach', label: 'Coach', Icon: Crosshair },
  { id: 'evidence', label: 'Evidence', Icon: Gauge },
  { id: 'timeline', label: 'Timeline', Icon: CalendarDays },
  { id: 'goals', label: 'Goals', Icon: Flag },
  { id: 'report', label: 'Report', Icon: ClipboardCheck },
  { id: 'data', label: 'Data', Icon: Database },
];

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

export default function CoachingWorkspace({
  userId,
  leaks = [],
  onOpenLeak,
  onOpenHandReview,
  onReviewExample,
  onTrain,
  onJumpToLeaks,
  onInspectHand,
  onDrillHand,
}) {
  const [workspace, setWorkspace] = useState(null);
  const [view, setView] = useState('coach');
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
  const [showExportTray, setShowExportTray] = useState(false);
  const [exportingPlan, setExportingPlan] = useState(false);
  const [claimedRewardLeaks, setClaimedRewardLeaks] = useState({});
  const [claimingRewardLeakId, setClaimingRewardLeakId] = useState(null);

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
    setClaimedRewardLeaks({});
    setClaimingRewardLeakId(null);
    setWorkspace(null);
    workspaceRef.current = null;
    setError(null);
    hydratedPrefsForUserRef.current = null;
  }, [userId]);

  useEffect(() => () => {
    loadAbortRef.current?.abort();
    lifecycleAbortRef.current?.abort();
  }, []);

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
      setWorkspace(payload);
      workspaceRef.current = payload;
      if (hydratedPrefsForUserRef.current !== userId) {
        hydratedPrefsForUserRef.current = userId;
        const urlView = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('view')
          : null;
        const saved = payload.preferences?.saved_view;
        if (urlView && VIEWS.some(item => item.id === urlView)) {
          setView(urlView);
        } else if (VIEWS.some(item => item.id === saved)) {
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
      setSelectedLeakId(current => current || first || null);
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
  }, [apiRequest, userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined' || !userId) return undefined;
    const onRefresh = () => { load({ background: true }); };
    window.addEventListener('pa-data-updated', onRefresh);
    window.addEventListener('pa-leak-review-updated', onRefresh);
    return () => {
      window.removeEventListener('pa-data-updated', onRefresh);
      window.removeEventListener('pa-leak-review-updated', onRefresh);
    };
  }, [load, userId]);

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
    if (view === 'data' && userId && !lifecycle) loadLifecycle();
  }, [lifecycle, loadLifecycle, userId, view]);

  const selectView = useCallback((nextView) => {
    setView(nextView);
    if (!userId) return;
    write({
      action: 'save_preferences',
      preferences: {
        savedView: nextView,
        analysisDepth,
        panelLayout: workspace?.preferences?.panel_layout || {},
        weeklyDigestOptIn: Boolean(weeklyDigestOptIn),
      },
    }, 'Saved View Updated', { reload: false });
  }, [analysisDepth, userId, weeklyDigestOptIn, workspace, write]);

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
    if (!saved) setAnalysisDepth(previousDepth);
  }, [analysisDepth, view, weeklyDigestOptIn, workspace, write]);

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
    }
  }, [analysisDepth, view, weeklyDigestOptIn, workspace, write]);

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
  const needle = query.trim().toLowerCase();
  const visiblePriorities = useMemo(() => !needle ? priorities : priorities.filter(item => (
    `${item.title} ${item.category} ${item.reason}`.toLowerCase().includes(needle)
  )), [needle, priorities]);
  const selectedPriority = priorities.find(item => String(item.id) === String(selectedLeakId)) || priorities[0] || null;
  const selectedLeak = findLeak(leaks, selectedPriority?.id);
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

  if (!userId) {
    return (
      <section className={styles.statePanel} aria-label="Coaching Workspace Sign In">
        <Target size={28} aria-hidden="true" />
        <h2>Build Your Personal Coaching Plan</h2>
        <p>Sign In To Turn Your Club Arena Evidence Into Goals, Reviews, And A Weekly Plan.</p>
        <a href="/auth/login" className={styles.primaryButton}>Sign In</a>
      </section>
    );
  }

  if (loading && !workspace?.snapshot) {
    return <section className={styles.statePanel} aria-busy="true"><Activity className={styles.spin} aria-hidden="true" /><h2>Building Your Coaching Plan</h2></section>;
  }

  if (error && !workspace?.snapshot) {
    return (
      <section className={styles.statePanel} role="alert">
        <AlertCircle size={28} aria-hidden="true" />
        <h2>Coaching Workspace Unavailable</h2>
        <p>{error}</p>
        <button type="button" className={styles.primaryButton} onClick={() => load()}><RefreshCw size={17} aria-hidden="true" />Retry</button>
      </section>
    );
  }

  const snapshot = workspace?.snapshot;
  return (
    <section className={styles.workspace} aria-label="Personal Coaching Workspace">
      <header className={styles.commandHeader}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <span className={styles.eyebrow}>Coaching Plan</span>
            <h2>Your Evidence-Backed Improvement Plan</h2>
            <p>Priorities Link Directly To Your Club Arena Hands And Verified Corrective Drills.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
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
            {showExportTray && (
              <div className={styles.exportTray} role="region" aria-label="Export Study Plan Actions">
                <button
                  type="button"
                  className={styles.secondaryButton}
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
          </div>
        </div>
        <details className="pa-disclosure">
          <summary>
            <span>Analysis Settings &amp; Receipt</span>
            <small>{analysisDepth}</small>
          </summary>
          <div className="pa-disclosure-body">
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
          </div>
        </details>
      </header>

      <div className={styles.searchBar}>
        <Search size={18} aria-hidden="true" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search Hands, Leaks, Goals, Or Evidence" aria-label="Search Coaching Workspace" />
      </div>

      <nav className={styles.viewNav} aria-label="Coaching Views">
        {VIEWS.map(({ id, label, Icon }) => (
          <button key={id} type="button" aria-current={view === id ? 'page' : undefined} className={view === id ? styles.activeView : ''} onClick={() => selectView(id)} disabled={saving}>
            <Icon size={17} aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </nav>

      {status && <div className={styles.status} data-tone={status.tone} role="status">{status.text}</div>}

      {view === 'coach' && (
        <div className={styles.coachGrid}>
          <article className={`${styles.panel} ${styles.nextAction}`}>
            <span className={styles.eyebrow}>Next Best Action</span>
            {snapshot?.nextBestAction ? (
              <>
                <h3>{snapshot.nextBestAction.action}</h3>
                <strong>{snapshot.nextBestAction.title}</strong>
                <p>{snapshot.nextBestAction.reason}</p>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.primaryButton} onClick={() => onOpenHandReview?.(findLeak(leaks, snapshot.nextBestAction.leakId))}>Open Audited Hand Review</button>
                  <button type="button" className={styles.secondaryButton} onClick={() => onOpenLeak?.(snapshot.nextBestAction.leakId)}>Inspect Evidence</button>
                </div>
              </>
            ) : (
              <><h3>Run A Fresh Deterministic Audit</h3><p>No Active Leak Is Currently Proven.</p></>
            )}
          </article>

          <article className={styles.panel}>
            <span className={styles.eyebrow}><Bell size={14} aria-hidden="true" />Coaching Alerts</span>
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

          <article className={`${styles.panel} ${styles.fullWidth}`}>
            <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Ranked Weekly Program</span><h3>Focus In This Order</h3></div><ListChecks size={24} aria-hidden="true" /></div>
            {visiblePriorities.length ? (
              <ol className={styles.priorityList}>
                {visiblePriorities.map((priority, index) => (
                  <li key={priority.id}>
                    <button type="button" onClick={() => { setSelectedLeakId(priority.id); setView('evidence'); }}>
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

          {Array.isArray(snapshot?.trainingPlan?.modules) && snapshot.trainingPlan.modules.length > 0 && (
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
                  const rateOrNull = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));
                  const postRate = rateOrNull(mod.tableVerification?.postMistakeRate ?? mod.tableVerification?.postBaselineErrorRate);
                  const preRate = rateOrNull(mod.tableVerification?.preMistakeRate ?? mod.tableVerification?.preBaselineErrorRate);
                  return (
                    <li key={`plan-${mod.leakId}`}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <strong>{mod.rank}. {mod.title}</strong>
                          <small>{mod.formatScope} · {mod.cadence}</small>
                        </div>
                        {mod.tableVerification && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span
                              className={styles.confidence}
                              data-level={mod.tableVerification.status === 'confirmed_fixed_at_tables' ? 'high' : mod.tableVerification.status === 'relapsed_at_tables' ? 'low' : 'medium'}
                            >
                              {mod.tableVerification.label}
                            </span>
                            {postRate !== null && (
                              <small>
                                Post-Drill Mistake Rate {postRate}% ({mod.tableVerification.postSampleCount ?? mod.tableVerification.postBaselineSamples ?? 0} Spots)
                                {preRate !== null ? ` · Pre-Drill ${preRate}%` : ''}
                              </small>
                            )}
                          </div>
                        )}
                        {mod.tableVerification?.status === 'confirmed_fixed_at_tables' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            {claimedRewardLeaks[mod.leakId] || mod.tableVerification?.rewardClaimed ? (
                              <span className={styles.claimedBadge}>
                                {claimedRewardLeaks[mod.leakId] === 'already_awarded' ? 'Reward Already Claimed' : 'Reward Claimed'}
                              </span>
                            ) : (
                              <button
                                type="button"
                                className={styles.claimButton}
                                disabled={claimingRewardLeakId === mod.leakId}
                                onClick={() => handleClaimLiveFix(mod.leakId)}
                                aria-label={`Claim 25 Diamonds For ${mod.title}`}
                              >
                                <span>{claimingRewardLeakId === mod.leakId ? 'Claiming…' : 'Claim 25 Diamonds'}</span>
                              </button>
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
                        <small>{mod.objective}</small>
                        <Progress
                          value={mod.mastery?.percent || 0}
                          label={`Mastery Progress (${mod.mastery?.currentStreak || 0}/${mod.mastery?.targetStreak || 4} Strong Sessions)`}
                        />
                        <div className={styles.actionRow}>
                          <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={() => onTrain?.(matchedLeak || {
                              id: mod.leakId,
                              title: mod.title,
                              leakCategory: mod.category,
                              recommendedDrill: mod.trainingGameId,
                              sourceSystem: 'solver_engine',
                            })}
                          >
                            Launch Targeted Drill
                          </button>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => { setSelectedLeakId(mod.leakId); setView('evidence'); }}
                          >
                            Inspect Evidence
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
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

      {view === 'evidence' && (
        <div className={styles.evidenceGrid}>
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
                <ul className={styles.reasonList}>{selectedPriority.confidence.reasons.slice(0, analysisDepth === 'guided' ? 1 : analysisDepth === 'detailed' ? 2 : undefined).map(reason => <li key={reason}><Check size={15} aria-hidden="true" />{reason}</li>)}</ul>
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
                    <span>{index + 1}</span><div><strong>{entry.stage}</strong><small data-pa-verbatim={entry.stage.includes('Decision') || entry.stage.includes('Hand') ? 'true' : undefined}>{entry.detail}</small></div>
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
          <article className={styles.panel}>
            <span className={styles.eyebrow}>Coverage Dashboard</span>
            <h3>{coverage.verified || 0} Solver-Verified Decisions</h3>
            {(coverage.decisions || 0) + (coverage.rejected || 0) > 0 ? (
              <Progress value={coverage.verifiedPercent} label="Verified Decision Coverage" />
            ) : (
              <p className={styles.mutedCopy}>Verified Decision Coverage: Not Available (No Audited Decisions Yet)</p>
            )}
            {coverage.windowLimited && <div className={styles.inlineNotice}>Coverage Uses The Latest {coverage.windowLimit} Audited Decisions. Older Evidence Remains Stored But Is Outside This Coaching Snapshot.</div>}
            <dl className={styles.coverageList}>
              <div><dt>Decisions</dt><dd>{coverage.decisions || 0}</dd></div>
              <div><dt>Partially Matched</dt><dd>{coverage.partiallyMatched || 0}</dd></div>
              <div><dt>Explicitly Unpriced</dt><dd>{coverage.unpriced || 0}</dd></div>
              <div><dt>Rejected Before Audit</dt><dd>{coverage.rejected || 0}</dd></div>
            </dl>
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
            {((Array.isArray(snapshot?.solverCoverageGaps?.topGaps) && snapshot.solverCoverageGaps.topGaps.length > 0) || rankedGaps.rows.length > 0) && (
              <details className="pa-disclosure" style={{ marginTop: 10 }}>
                <summary>
                  <span>Top Unmeasured Solver Buckets</span>
                  <small>{rankedGaps.rows.length > 0 ? rankedGaps.rows.length : snapshot.solverCoverageGaps.topGaps.length} Buckets</small>
                </summary>
                <div className="pa-disclosure-body" role="region" aria-label="Solver Coverage Gaps">
                  {rankedGaps.rows.length > 0 && (
                    <>
                      <span className={styles.eyebrow}>
                        Most Requested Coverage Gaps{rankedGaps.total !== null ? ` · ${rankedGaps.total.toLocaleString()} Unpriced Decisions` : ''}
                      </span>
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
                    </>
                  )}
                  {Array.isArray(snapshot?.solverCoverageGaps?.topGaps) && snapshot.solverCoverageGaps.topGaps.length > 0 && (
                    <ul className={styles.alertList}>
                      {snapshot.solverCoverageGaps.topGaps.slice(0, 5).map(gap => (
                        <li key={`${gap.format}-${gap.street}-${gap.heroPosition}-${gap.spotType}`}>
                          <strong>{gap.format} · {gap.street.toUpperCase()} · {gap.heroPosition}</strong> ({gap.spotType}): {gap.count} Spots ({gap.sharePercent}% Of Unmeasured)
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            )}
          </article>
          <details className={`pa-disclosure ${styles.fullWidth}`}>
            <summary>
              <span><MessageSquareWarning size={14} aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />Coach Feedback · Flag This Analysis</span>
              <small>Optional</small>
            </summary>
            <div className="pa-disclosure-body">
              <div className={styles.panel} style={{ border: 0, padding: 0, background: 'transparent' }}>
                <select value={feedbackType} onChange={event => setFeedbackType(event.target.value)} aria-label="Feedback Type">
                  <option value="confusing">Confusing</option><option value="incorrect">Incorrect</option><option value="mismatched">Mismatched</option><option value="helpful">Helpful</option>
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
      )}

      {view === 'timeline' && (
        <article className={styles.panel}>
          <span className={styles.eyebrow}>Progress Timeline</span><h3>From Detection To Real-Play Confirmation</h3>
          {snapshot?.timeline?.length ? <ol className={styles.timelineList}>{snapshot.timeline.map((event, index) => <li key={`${event.at}-${event.leakId}-${index}`}><time>{formatDate(event.at)}</time><div><strong>{event.title}</strong><small>{event.type === 'review' ? `Review Score ${Math.round(number(event.score) * 100)}%` : 'Measured From Persisted Evidence'}</small></div></li>)}</ol> : <p>No Timeline Evidence Is Available Yet.</p>}
        </article>
      )}

      {view === 'goals' && (
        <div className={styles.goalsGrid}>
          <form className={styles.panel} onSubmit={async event => {
            event.preventDefault();
            const saved = await write({ action: 'save_goal', goal: { ...goal, leakId: selectedPriority?.id || null } }, 'Coaching Goal Saved');
            if (saved) setGoal({ title: '', metric: 'Accuracy Percent', targetValue: '90', dueAt: '' });
          }}>
            <span className={styles.eyebrow}>Create A Verified Goal</span><h3>Tie Progress To Measured Evidence</h3>
            <label>Goal Title<input required maxLength={160} value={goal.title} onChange={event => setGoal(current => ({ ...current, title: event.target.value }))} placeholder="Reduce River Overfolding" /></label>
            <label>Metric<input required maxLength={80} value={goal.metric} onChange={event => setGoal(current => ({ ...current, metric: event.target.value }))} /></label>
            <label>Target Value<input required type="number" step="0.1" value={goal.targetValue} onChange={event => setGoal(current => ({ ...current, targetValue: event.target.value }))} /></label>
            <label>Target Date<input type="date" value={goal.dueAt} onChange={event => setGoal(current => ({ ...current, dueAt: event.target.value }))} /></label>
            <button type="submit" className={styles.primaryButton} disabled={saving}>Save Goal</button>
          </form>
          <article className={styles.panel}>
            <span className={styles.eyebrow}>Saved Goals</span><h3>Your Measured Targets</h3>
            {(workspace?.goals || []).length ? <ul className={styles.goalList}>{workspace.goals.map(item => <li key={item.id}><div><strong>{item.title}</strong><small>{item.metric}: {item.current_value ?? 'Not Measured'} Of {item.target_value} By {formatGoalDate(item.due_at)}</small></div><div className={styles.goalActions}><button type="button" disabled={saving || item.status === 'completed'} aria-label={`Mark ${item.title} Complete`} onClick={() => write({ action: 'save_goal', goal: goalPayload(item, { currentValue: item.target_value, status: 'completed' }) }, 'Goal Marked Complete')}>{item.status === 'completed' ? 'Completed' : 'Mark Complete'}</button><button type="button" disabled={saving || item.status === 'completed'} aria-label={`${item.status === 'paused' ? 'Resume' : 'Pause'} ${item.title}`} onClick={() => write({ action: 'save_goal', goal: goalPayload(item, { status: item.status === 'paused' ? 'active' : 'paused' }) }, item.status === 'paused' ? 'Goal Resumed' : 'Goal Paused')}>{item.status === 'paused' ? 'Resume' : 'Pause'}</button><button type="button" className={styles.removeGoal} disabled={saving} aria-label={`${confirmGoalId === item.id ? 'Confirm Removal Of' : 'Remove'} ${item.title}`} onClick={async () => {
              if (confirmGoalId !== item.id) {
                setConfirmGoalId(item.id);
                return;
              }
              const removed = await write({ action: 'delete_goal', goal: { id: item.id } }, 'Coaching Goal Removed');
              if (removed) setConfirmGoalId(null);
            }}>{confirmGoalId === item.id ? 'Confirm Remove' : 'Remove'}</button>{confirmGoalId === item.id && <button type="button" disabled={saving} aria-label={`Cancel Removal Of ${item.title}`} onClick={() => setConfirmGoalId(null)}>Cancel</button>}</div></li>)}</ul> : <p>No Coaching Goal Has Been Saved Yet.</p>}
          </article>
        </div>
      )}

      {view === 'report' && (
        <article className={styles.panel}>
          <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Weekly Coaching Report</span><h3>Your Next Seven Days</h3></div><Trophy size={26} aria-hidden="true" /></div>
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
          <ol className={styles.reportList}>{(snapshot?.weeklyReport?.focus || []).map(item => <li key={item.id}><span>Priority {item.rank}</span><strong>{item.title}</strong><small>{item.targetReviews} Corrective Reviews, Then Reassess With Fresh Club Arena Hands</small><button type="button" className={styles.secondaryButton} onClick={() => onOpenHandReview?.(findLeak(leaks, item.id))}>Open Audited Review</button></li>)}</ol>
          {!snapshot?.weeklyReport?.focus?.length && <p>Run A Fresh Deterministic Audit To Build This Week's Plan.</p>}
          <footer className={styles.reportFooter}><BookOpen size={17} aria-hidden="true" /><span>Corrective Mastery Never Resolves A Real-Play Leak By Itself. Fresh Club Arena Evidence Must Confirm Improvement.</span></footer>
        </article>
      )}

      {view === 'data' && (
        <div className={styles.dataGrid}>
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
        </div>
      )}
    </section>
  );
}
