import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, Bell, BookOpen, CalendarDays, Check, ChevronRight, ClipboardCheck,
  Crosshair, Flag, Gauge, ListChecks, MessageSquareWarning, RefreshCw, Search,
  Target, Trophy,
} from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import { useLeakHandExamples } from '../../hooks/useAssistant';
import { buildEvidenceChain } from '../../lib/personal-assistant/coachingIntelligence.mjs';
import styles from './CoachingWorkspace.module.css';

const VIEWS = [
  { id: 'coach', label: 'Coach', Icon: Crosshair },
  { id: 'evidence', label: 'Evidence', Icon: Gauge },
  { id: 'timeline', label: 'Timeline', Icon: CalendarDays },
  { id: 'goals', label: 'Goals', Icon: Flag },
  { id: 'report', label: 'Report', Icon: ClipboardCheck },
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

function findLeak(leaks, id) {
  return (Array.isArray(leaks) ? leaks : []).find(leak => String(leak?.id ?? '') === String(id ?? '')) || null;
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
  onPractice,
  onPracticeExample,
  onTrain,
}) {
  const [workspace, setWorkspace] = useState(null);
  const [view, setView] = useState('coach');
  const [query, setQuery] = useState('');
  const [selectedLeakId, setSelectedLeakId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [goal, setGoal] = useState({ title: '', metric: 'Accuracy Percent', targetValue: '90', dueAt: '' });
  const [feedbackType, setFeedbackType] = useState('confusing');
  const [feedbackNote, setFeedbackNote] = useState('');

  const apiRequest = useCallback(async (method = 'GET', body = null) => {
    const token = getAccessToken();
    if (!token) throw new Error('Sign In To Load Your Coaching Workspace');
    const response = await fetch('/api/assistant/coaching', {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) throw new Error(payload?.error || `Coaching Request Failed With HTTP ${response.status}`);
    return payload;
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setWorkspace(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await apiRequest();
      setWorkspace(payload);
      const saved = payload.preferences?.saved_view;
      if (VIEWS.some(item => item.id === saved)) setView(saved);
      const first = payload.snapshot?.priorities?.[0]?.id;
      setSelectedLeakId(current => current || first || null);
    } catch (requestError) {
      setError(requestError?.message || 'Coaching Workspace Could Not Be Loaded');
    } finally {
      setLoading(false);
    }
  }, [apiRequest, userId]);

  useEffect(() => { load(); }, [load]);

  const write = useCallback(async (body, successText, { reload = true } = {}) => {
    setSaving(true);
    setStatus(null);
    try {
      await apiRequest('POST', body);
      setStatus({ tone: 'success', text: successText });
      if (reload) await load();
      return true;
    } catch (requestError) {
      setStatus({ tone: 'danger', text: requestError?.message || 'The Change Could Not Be Saved' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [apiRequest, load]);

  const selectView = useCallback((nextView) => {
    setView(nextView);
    if (!userId) return;
    write({
      action: 'save_preferences',
      preferences: {
        savedView: nextView,
        analysisDepth: workspace?.preferences?.analysis_depth || 'guided',
        panelLayout: workspace?.preferences?.panel_layout || {},
      },
    }, 'Saved View Updated', { reload: false });
  }, [userId, workspace, write]);

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
  const alerts = useMemo(() => {
    const rows = [];
    if (workspace?.snapshot?.summary?.due > 0) rows.push(`${workspace.snapshot.summary.due} Corrective Review${workspace.snapshot.summary.due === 1 ? ' Is' : 's Are'} Due`);
    if (coverage.unpriced > 0) rows.push(`${coverage.unpriced} Decisions Remain Explicitly Unpriced`);
    const overdueGoals = (workspace?.goals || []).filter(item => item.status === 'active' && item.due_at && new Date(item.due_at).getTime() < Date.now());
    if (overdueGoals.length) rows.push(`${overdueGoals.length} Coaching Goal${overdueGoals.length === 1 ? ' Needs' : 's Need'} Attention`);
    if (!rows.length) rows.push('No Coaching Alert Needs Immediate Action');
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

  if (loading) {
    return <section className={styles.statePanel} aria-busy="true"><Activity className={styles.spin} aria-hidden="true" /><h2>Building Your Coaching Plan</h2></section>;
  }

  if (error) {
    return (
      <section className={styles.statePanel} role="alert">
        <AlertCircle size={28} aria-hidden="true" />
        <h2>Coaching Workspace Unavailable</h2>
        <p>{error}</p>
        <button type="button" className={styles.primaryButton} onClick={load}><RefreshCw size={17} aria-hidden="true" />Retry</button>
      </section>
    );
  }

  const snapshot = workspace?.snapshot;
  return (
    <section className={styles.workspace} aria-label="Personal Coaching Workspace">
      <header className={styles.commandHeader}>
        <div>
          <span className={styles.eyebrow}>Personal Coaching Command Center</span>
          <h2>Your Evidence-Backed Improvement Plan</h2>
          <p>Every Priority Links Back To Club Arena Evidence, Deterministic Grading, And Corrective Training.</p>
        </div>
        <div className={styles.receipt} aria-label="Reproducible Coaching Receipt">
          <span>Analysis Receipt</span>
          <strong data-pa-verbatim="true">{snapshot?.receipt || 'Unavailable'}</strong>
        </div>
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
                  <button type="button" className={styles.primaryButton} onClick={() => onPractice?.(findLeak(leaks, snapshot.nextBestAction.leakId))}>Open Corrective Review</button>
                  <button type="button" className={styles.secondaryButton} onClick={() => onOpenLeak?.(snapshot.nextBestAction.leakId)}>Inspect Evidence</button>
                </div>
              </>
            ) : (
              <><h3>Run A Fresh Deterministic Audit</h3><p>No Active Leak Is Currently Proven.</p></>
            )}
          </article>

          <article className={styles.panel}>
            <span className={styles.eyebrow}><Bell size={14} aria-hidden="true" />Coaching Alerts</span>
            <ul className={styles.alertList}>{alerts.map(alert => <li key={alert}>{alert}</li>)}</ul>
          </article>

          <div className={styles.metricGrid} aria-label="Coaching Summary">
            <div><span>Active Leaks</span><strong>{snapshot?.summary?.active || 0}</strong></div>
            <div><span>Reviews Due</span><strong>{snapshot?.summary?.due || 0}</strong></div>
            <div><span>Resolved Leaks</span><strong>{snapshot?.summary?.resolved || 0}</strong></div>
            <div><span>Measured Loss</span><strong>{number(snapshot?.summary?.measuredEvLoss).toFixed(2)} BB</strong></div>
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

          <article className={`${styles.panel} ${styles.fullWidth}`}>
            <span className={styles.eyebrow}>Latest Session Debrief</span>
            <h3>{snapshot?.sessionDebrief?.headline}</h3>
            <div className={styles.debriefGrid}>
              <div><span>Strongest Signal</span><strong>{snapshot?.sessionDebrief?.strongestSignal}</strong></div>
              <div><span>Most Expensive Mistake</span><strong>{snapshot?.sessionDebrief?.expensiveMistake}</strong></div>
              <div><span>Evidence Coverage</span><strong>{snapshot?.sessionDebrief?.coverageNote}</strong></div>
            </div>
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
                <ul className={styles.reasonList}>{selectedPriority.confidence.reasons.map(reason => <li key={reason}><Check size={15} aria-hidden="true" />{reason}</li>)}</ul>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.primaryButton} disabled={examplesLoading} onClick={() => exactExample ? onPracticeExample?.(selectedLeak, exactExample) : onPractice?.(selectedLeak)}>
                    {examplesLoading ? 'Loading Exact Hand' : exactExample ? 'Open Exact Sandbox Spot' : 'Open Corrective Sandbox'}
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={() => onTrain?.(selectedLeak)}>Open Training Game</button>
                  <button type="button" className={styles.secondaryButton} onClick={() => onOpenLeak?.(selectedPriority.id)}>Open Leak Details</button>
                </div>
                {examplesError && <div className={styles.inlineNotice} role="status">Exact Hand Evidence Could Not Be Loaded. <button type="button" onClick={refetchExamples}>Retry</button></div>}
                {!examplesLoading && !examplesError && !exactExample && <div className={styles.inlineNotice}>No Persisted Example Hand Is Attached. The Sandbox Will Open With The Leak Target Only.</div>}
              </>
            ) : <p>No Evidence Is Available Yet.</p>}
          </div>
          <article className={`${styles.panel} ${styles.fullWidth}`}>
            <span className={styles.eyebrow}>Source-To-Training Trace</span>
            <div className={styles.evidenceChain}>
              {evidence.map((entry, index) => (
                <div key={`${entry.stage}-${index}`} data-state={entry.state}>
                  <span>{index + 1}</span><div><strong>{entry.stage}</strong><small data-pa-verbatim={entry.stage.includes('Decision') || entry.stage.includes('Hand') ? 'true' : undefined}>{entry.detail}</small></div>
                </div>
              ))}
            </div>
          </article>
          <article className={styles.panel}>
            <span className={styles.eyebrow}>Coverage Dashboard</span>
            <h3>{coverage.verified || 0} Solver-Verified Decisions</h3>
            <Progress value={coverage.verifiedPercent} label="Verified Decision Coverage" />
            <dl className={styles.coverageList}>
              <div><dt>Decisions</dt><dd>{coverage.decisions || 0}</dd></div>
              <div><dt>Partially Matched</dt><dd>{coverage.partiallyMatched || 0}</dd></div>
              <div><dt>Explicitly Unpriced</dt><dd>{coverage.unpriced || 0}</dd></div>
              <div><dt>Rejected Before Audit</dt><dd>{coverage.rejected || 0}</dd></div>
            </dl>
          </article>
          <article className={styles.panel}>
            <span className={styles.eyebrow}><MessageSquareWarning size={14} aria-hidden="true" />Coach Feedback</span>
            <h3>Flag This Analysis For Review</h3>
            <select value={feedbackType} onChange={event => setFeedbackType(event.target.value)} aria-label="Feedback Type">
              <option value="confusing">Confusing</option><option value="incorrect">Incorrect</option><option value="mismatched">Mismatched</option><option value="helpful">Helpful</option>
            </select>
            <textarea value={feedbackNote} onChange={event => setFeedbackNote(event.target.value)} maxLength={2000} placeholder="Explain What Needs Review" aria-label="Feedback Note" />
            <button type="button" className={styles.primaryButton} disabled={saving || !selectedPriority} onClick={async () => {
              const decisionKey = evidence[1]?.state === 'verified' ? evidence[1].detail : null;
              const saved = await write({ action: 'submit_feedback', feedback: { leakId: selectedPriority?.id, feedbackType, note: feedbackNote, decisionKey } }, 'Coach Feedback Sent For Review');
              if (saved) setFeedbackNote('');
            }}>Submit Feedback</button>
          </article>
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
            <span className={styles.eyebrow}>Active Goals</span><h3>Your Measured Targets</h3>
            {(workspace?.goals || []).length ? <ul className={styles.goalList}>{workspace.goals.map(item => <li key={item.id}><div><strong>{item.title}</strong><small>{item.metric}: {item.current_value ?? 'Not Measured'} Of {item.target_value} By {formatDate(item.due_at)}</small></div><button type="button" disabled={saving || item.status === 'completed'} onClick={() => write({ action: 'save_goal', goal: { id: item.id, leakId: item.leak_id, title: item.title, metric: item.metric, targetValue: item.target_value, currentValue: item.target_value, status: 'completed', dueAt: item.due_at } }, 'Goal Marked Complete')}>{item.status === 'completed' ? 'Completed' : 'Mark Complete'}</button></li>)}</ul> : <p>No Coaching Goal Has Been Saved Yet.</p>}
          </article>
        </div>
      )}

      {view === 'report' && (
        <article className={styles.panel}>
          <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Weekly Coaching Report</span><h3>Your Next Seven Days</h3></div><Trophy size={26} aria-hidden="true" /></div>
          <div className={styles.reportMetrics}>
            <div><span>Verified Coverage</span><strong>{snapshot?.weeklyReport?.verifiedCoverage || 0}%</strong></div>
            <div><span>Review Load</span><strong>{snapshot?.weeklyReport?.reviewLoad || 0}</strong></div>
            <div><span>Measured EV Loss</span><strong>{number(snapshot?.weeklyReport?.measuredEvLoss).toFixed(2)} BB</strong></div>
          </div>
          <ol className={styles.reportList}>{(snapshot?.weeklyReport?.focus || []).map(item => <li key={item.id}><span>Priority {item.rank}</span><strong>{item.title}</strong><small>{item.targetReviews} Corrective Reviews, Then Reassess With Fresh Club Arena Hands</small><button type="button" className={styles.secondaryButton} onClick={() => onPractice?.(findLeak(leaks, item.id))}>Start Review</button></li>)}</ol>
          {!snapshot?.weeklyReport?.focus?.length && <p>Run A Fresh Deterministic Audit To Build This Week's Plan.</p>}
          <footer className={styles.reportFooter}><BookOpen size={17} aria-hidden="true" /><span>Corrective Mastery Never Resolves A Real-Play Leak By Itself. Fresh Club Arena Evidence Must Confirm Improvement.</span></footer>
        </article>
      )}
    </section>
  );
}
