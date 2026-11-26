import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { buildCoachingSnapshot, receiptFingerprint } from '../../../src/lib/personal-assistant/coachingIntelligence.mjs';
import { normalizeUserLeakRow } from '../../../src/lib/personal-assistant/leakRecord';
import { ACCESS_LEVELS, checkSandboxAccess } from '../../../src/lib/personal-assistant/contextAuthority';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';

let _supabase = null;
export function _setSupabaseForTesting(client) {
  _supabase = client;
}

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Coaching Workspace Service Is Not Configured.');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEAK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,159}$/;
const GOAL_STATUSES = new Set(['active', 'completed', 'paused']);
const FEEDBACK_TYPES = new Set(['confusing', 'incorrect', 'mismatched', 'helpful']);
const SAVED_VIEWS = new Set(['coach', 'evidence', 'timeline', 'goals', 'report', 'data']);
const DEPTHS = new Set(['guided', 'detailed', 'expert']);
const DECISION_WINDOW_LIMIT = 5000;
const HAND_TIME_CHUNK = 150;
const HAND_TIME_MAX_IDS = 1800;
const SESSION_FALLBACK_MS = 4 * 60 * 60_000;
const CLUB_HAND_PREFIX = 'club-arena:';
const MISTAKE_CLASSES = new Set(['best', 'correct', 'unpriced', '']);

function boundedText(value, max, { required = false } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) throw new TypeError('Required text is missing');
  if (text.length > max) throw new RangeError('Text is too long');
  return text || null;
}

function boundedNumber(value, { required = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new TypeError('Required number is missing');
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1_000_000) throw new TypeError('Number is invalid');
  return number;
}

function validDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const endOfDay = new Date(`${value}T23:59:59.999Z`);
    if (!Number.isFinite(endOfDay.getTime()) || endOfDay.toISOString().slice(0, 10) !== value) {
      throw new TypeError('Date is invalid');
    }
    return endOfDay.toISOString();
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Date is invalid');
  return date.toISOString();
}

function optionalLeakId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = String(value);
  if (!LEAK_ID_RE.test(id)) throw new TypeError('Leak id is invalid');
  return id;
}

function isMissingSchema(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code)
    || message.includes('does not exist') || message.includes('schema cache');
}

async function ownerRead(supabase, table, select, userId, configure = query => query) {
  const result = await configure(supabase.from(table).select(select).eq('user_id', userId));
  if (result.error && !isMissingSchema(result.error)) throw result.error;
  return result.error ? [] : (result.data || []);
}

async function readReviewsWithBaseline(supabase, userId) {
  const modernSelect = 'leak_id, due_at, interval_days, reps, lapses, strong_streak, retired, last_score, history, last_outcome, schema_version, remediation_baseline_at, updated_at';
  const legacySelect = 'leak_id, due_at, interval_days, reps, lapses, strong_streak, retired, last_score, history, last_outcome, schema_version, updated_at';
  const res = await supabase
    .from('leak_review_state')
    .select(modernSelect)
    .eq('user_id', userId)
    .order('due_at', { ascending: true })
    .limit(500);
  if (!res.error) return res.data || [];
  if (!isMissingSchema(res.error)) throw res.error;
  return ownerRead(supabase, 'leak_review_state', legacySelect, userId, query => query.order('due_at', { ascending: true }).limit(500));
}

export async function readHandAuditDecisions(supabase, userId) {
  const modernSelect = 'hand_external_id, decision_key, question_id, game_id, street, hero_position, villain_position, spot_type, hero_hand, board_cards, player_action, solver_action, selected_frequency, optimal_frequency, classification, ev_loss, ev_loss_measured, solver_verified, solver_source, match_tier, audited_at, stack_depth_bb, evidence_scope';
  const legacySelect = 'hand_external_id, decision_key, question_id, game_id, street, hero_position, villain_position, spot_type, hero_hand, board_cards, player_action, solver_action, selected_frequency, optimal_frequency, classification, ev_loss, ev_loss_measured, solver_verified, solver_source, match_tier, audited_at';
  const res = await supabase
    .from('hand_audit_decisions')
    .select(modernSelect)
    .eq('user_id', userId)
    .like('solver_source', '%hand-audit-v3%')
    .order('audited_at', { ascending: false })
    .limit(DECISION_WINDOW_LIMIT);
  if (!res.error) return res.data || [];
  if (!isMissingSchema(res.error)) throw res.error;
  return ownerRead(supabase, 'hand_audit_decisions', legacySelect, userId, query => query.like('solver_source', '%hand-audit-v3%').order('audited_at', { ascending: false }).limit(DECISION_WINDOW_LIMIT));
}

export async function readClaimedLiveFixReferenceIds(supabase, userId) {
  try {
    const { data, error } = await supabase
      .from('diamond_transactions')
      .select('reference_id, transaction_type')
      .eq('user_id', userId)
      .eq('transaction_type', 'pa_leak_verified_fixed')
      .limit(500);
    if (error || !Array.isArray(data)) return new Set();
    return new Set(
      data
        .map(row => (typeof row?.reference_id === 'string' ? row.reference_id.trim() : ''))
        .filter(Boolean),
    );
  } catch (_) {
    return new Set();
  }
}

async function readPreferences(supabase, userId) {
  const modernSelect = 'saved_view, analysis_depth, panel_layout, retention_days, last_retention_run_at, weekly_digest_opt_in, updated_at';
  const legacySelect = 'saved_view, analysis_depth, panel_layout, retention_days, last_retention_run_at, updated_at';
  const res = await supabase.from('pa_coaching_preferences').select(modernSelect).eq('user_id', userId).maybeSingle();
  if (!res.error) return res;
  if (!isMissingSchema(res.error)) throw res.error;
  return supabase.from('pa_coaching_preferences').select(legacySelect).eq('user_id', userId).maybeSingle();
}


async function readLiveTableState(supabase, userId) {
  try {
    const access = await checkSandboxAccess(supabase, userId);
    // HARD_BLOCK covers an open session, a seated Club Arena table, an active
    // Arena match and an unreadable session state (fail closed).
    return {
      active: access?.allowed !== true,
      cooldown: access?.accessLevel === ACCESS_LEVELS.LIMITED_REVIEW,
    };
  } catch (error) {
    console.warn('[assistant/coaching] live table check failed closed:', error?.message || error);
    return { active: true, cooldown: false };
  }
}

// The latest COMPLETED session window, from whichever source ended last:
// poker_sessions, or a vacated Club Arena table seat. Missing schema or a read
// error yields null (no recap), never a guessed window.
async function readLatestSessionWindow(supabase, userId) {
  const windows = [];
  try {
    const { data, error } = await supabase.from('poker_sessions')
      .select('started_at, ended_at')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(1);
    if (!error && Array.isArray(data) && data[0]) {
      const endMs = new Date(data[0].ended_at).getTime();
      const startMs = data[0].started_at ? new Date(data[0].started_at).getTime() : NaN;
      if (Number.isFinite(endMs)) {
        windows.push({ endMs, startMs: Number.isFinite(startMs) ? startMs : endMs - SESSION_FALLBACK_MS, source: 'poker_sessions' });
      }
    }
  } catch (_) { /* optional source */ }
  try {
    const { data, error } = await supabase.from('table_seats')
      .select('joined_at, left_at')
      .eq('user_id', userId)
      .not('left_at', 'is', null)
      .order('left_at', { ascending: false })
      .limit(1);
    if (!error && Array.isArray(data) && data[0]) {
      const endMs = new Date(data[0].left_at).getTime();
      const startMs = data[0].joined_at ? new Date(data[0].joined_at).getTime() : NaN;
      if (Number.isFinite(endMs)) {
        windows.push({ endMs, startMs: Number.isFinite(startMs) && startMs <= endMs ? startMs : endMs - SESSION_FALLBACK_MS, source: 'club_arena_seat' });
      }
    }
  } catch (_) { /* optional source */ }
  return windows.sort((a, b) => b.endMs - a.endMs)[0] || null;
}

function handUuid(externalId) {
  const raw = String(externalId || '');
  const id = raw.startsWith(CLUB_HAND_PREFIX) ? raw.slice(CLUB_HAND_PREFIX.length) : raw;
  return UUID_RE.test(id) ? id : null;
}

// `hand_audit_decisions` has no hand-played time, and a re-audit rewrites
// audited_at, so audit time alone cannot split a leak into before/after the
// remediation baseline. Read the real hand times for the decisions that need
// them. Best effort: on any failure rows simply keep no hand_played_at.
async function attachHandPlayTimes(supabase, decisions, { reviews, sessionWindow }) {
  try {
    const baselines = reviews
      .map(row => (row?.remediation_baseline_at ? new Date(row.remediation_baseline_at).getTime() : NaN))
      .filter(Number.isFinite);
    const earliestBaselineMs = baselines.length ? Math.min(...baselines) : null;
    const sessionFloorMs = sessionWindow ? sessionWindow.startMs - 5 * 60_000 : null;
    const wanted = new Map();
    const lossOf = row => (row.ev_loss_measured === true ? Math.abs(Number(row.ev_loss) || 0) : 0);
    const candidates = decisions
      .filter(row => row.solver_verified === true)
      .filter(row => {
        const audited = new Date(row.audited_at).getTime();
        const afterBaseline = earliestBaselineMs !== null && audited >= earliestBaselineMs;
        const sessionMistake = sessionFloorMs !== null && audited >= sessionFloorMs
          && !MISTAKE_CLASSES.has(String(row.classification || '').toLowerCase());
        return afterBaseline || sessionMistake;
      })
      .sort((a, b) => lossOf(b) - lossOf(a));
    for (const row of candidates) {
      const id = handUuid(row.hand_external_id);
      if (id && !wanted.has(id)) wanted.set(id, null);
      if (wanted.size >= HAND_TIME_MAX_IDS) break;
    }
    const ids = [...wanted.keys()];
    const chunks = [];
    for (let i = 0; i < ids.length; i += HAND_TIME_CHUNK) chunks.push(ids.slice(i, i + HAND_TIME_CHUNK));
    const results = await Promise.all(chunks.map(chunk => supabase.from('hand_history')
      .select('id, created_at').in('id', chunk)));
    for (const result of results) {
      if (result.error) continue;
      for (const row of result.data || []) wanted.set(String(row.id), row.created_at);
    }
    return decisions.map(row => {
      const id = handUuid(row.hand_external_id);
      const playedAt = id ? wanted.get(id) : null;
      return playedAt ? { ...row, hand_played_at: playedAt } : row;
    });
  } catch (error) {
    console.warn('[assistant/coaching] hand time lookup skipped:', error?.message || error);
    return decisions;
  }
}

async function readWorkspace(supabase, userId) {
  const [leakRows, decisions, reviews, goals, feedback, preferenceResult, auditResult, activeAuditResult] = await Promise.all([
    ownerRead(supabase, 'user_leaks', '*', userId, query => query.order('updated_at', { ascending: false }).limit(500)),
    readHandAuditDecisions(supabase, userId),
    readReviewsWithBaseline(supabase, userId),
    ownerRead(supabase, 'pa_coaching_goals', 'id, leak_id, title, metric, target_value, current_value, status, due_at, created_at, updated_at', userId, query => query.order('created_at', { ascending: false }).limit(100)),
    ownerRead(supabase, 'pa_coach_feedback', 'id, leak_id, decision_key, feedback_type, note, status, created_at, updated_at', userId, query => query.order('created_at', { ascending: false }).limit(50)),
    readPreferences(supabase, userId),
    supabase.from('pa_leak_audit_jobs').select('id, status, progress, result, reconciliation, completed_at, created_at').eq('user_id', userId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('pa_leak_audit_jobs').select('id, status, progress, created_at').eq('user_id', userId).in('status', ['queued', 'running']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (preferenceResult.error && !isMissingSchema(preferenceResult.error)) throw preferenceResult.error;
  if (auditResult.error && !isMissingSchema(auditResult.error)) throw auditResult.error;
  if (activeAuditResult.error && !isMissingSchema(activeAuditResult.error)) throw activeAuditResult.error;
  const audit = auditResult.data || null;
  const activeAudit = activeAuditResult.data || null;
  const activeAuditRunning = Boolean(activeAudit && (activeAudit.status === 'queued' || activeAudit.status === 'running'));
  const activeAuditHands = Number(activeAudit?.progress?.handsScanned || 0);
  const activeAuditDecisions = Number(activeAudit?.progress?.decisionsAnalyzed || 0);
  const activeAuditProgressText = activeAuditRunning
    ? (activeAuditHands > 0
        ? `${activeAuditHands.toLocaleString()} hands scanned · ${activeAuditDecisions.toLocaleString()} decisions checked. You can safely leave and return later.`
        : 'Your hand audit is queued on the server. You can safely leave and return later.')
    : null;
  const baseDecisions = decisions.map(row => ({ ...row, evidence_scope: row.evidence_scope || 'club_arena' }));
  const [liveTable, sessionWindow, claimedReferenceIds] = await Promise.all([
    readLiveTableState(supabase, userId),
    readLatestSessionWindow(supabase, userId),
    readClaimedLiveFixReferenceIds(supabase, userId),
  ]);
  const ownedDecisions = await attachHandPlayTimes(supabase, baseDecisions, { reviews, sessionWindow });
  // Rejected hand counts live at top-level `audit.progress`, NOT `audit.progress.coverage`.
  const rejected = audit?.progress || {};
  const matcher = ownedDecisions.find(row => String(row.solver_source || '').includes('hand-audit-v'))?.solver_source?.match(/hand-audit-v\d+/)?.[0] || 'unavailable';
  const snapshot = buildCoachingSnapshot({
    leaks: leakRows.map(normalizeUserLeakRow),
    decisions: ownedDecisions,
    reviews,
    rejected: {
      missingPrivateCards: rejected.handsMissingPrivateCards,
      unsupportedOrIncomplete: rejected.handsRejectedBeforeAudit,
      noHeroDecision: rejected.handsSkippedNoHeroDecisions,
    },
    versions: {
      matcher,
      reviewSchema: reviews[0]?.schema_version || 'unavailable',
      detector: audit?.result?.detectorVersion || audit?.result?.detector_version || 'current',
      decisionWindow: `latest-${DECISION_WINDOW_LIMIT}`,
    },
    audit: audit?.progress || null,
    liveTable,
    sessionWindow,
    claimedReferenceIds,
  });
  snapshot.coverage.windowLimited = ownedDecisions.length >= DECISION_WINDOW_LIMIT;
  snapshot.coverage.windowLimit = DECISION_WINDOW_LIMIT;

  const rawPrefs = preferenceResult.data || null;
  const preferences = {
    saved_view: rawPrefs?.saved_view || 'coach',
    analysis_depth: rawPrefs?.analysis_depth || 'guided',
    panel_layout: rawPrefs?.panel_layout || {},
    retention_days: rawPrefs?.retention_days ?? null,
    last_retention_run_at: rawPrefs?.last_retention_run_at ?? null,
    weekly_digest_opt_in: Boolean(rawPrefs?.weekly_digest_opt_in),
    weeklyDigestOptIn: Boolean(rawPrefs?.weekly_digest_opt_in),
    ...(rawPrefs?.updated_at ? { updated_at: rawPrefs.updated_at } : {}),
  };

  return {
    snapshot: {
      ...snapshot,
      liveTableActive: Boolean(liveTable.active),
      cooldownActive: Boolean(liveTable.cooldown),
      preferences: {
        ...preferences,
        weeklyDigestOptIn: Boolean(rawPrefs?.weekly_digest_opt_in),
      },
      activeAuditRunning,
      activeAuditProgressText,
      receipt: receiptFingerprint(snapshot),
    },
    decisions: (liveTable.active || liveTable.cooldown) ? [] : ownedDecisions,
    reviews,
    goals,
    feedback,
    preferences,
    latestAudit: audit,
    activeAudit,
  };
}

async function writeGoal(supabase, userId, body) {
  const id = body.id && UUID_RE.test(String(body.id)) ? String(body.id) : null;
  const status = String(body.status || 'active').toLowerCase();
  if (!GOAL_STATUSES.has(status)) throw new TypeError('Goal status is invalid');
  const row = {
    user_id: userId,
    leak_id: optionalLeakId(body.leakId),
    title: boundedText(body.title, 160, { required: true }),
    metric: boundedText(body.metric, 80, { required: true }),
    target_value: boundedNumber(body.targetValue, { required: true }),
    current_value: boundedNumber(body.currentValue),
    status,
    due_at: validDate(body.dueAt),
    updated_at: new Date().toISOString(),
  };
  if (id) row.id = id;
  const query = id
    ? supabase.from('pa_coaching_goals').update(row).eq('id', id).eq('user_id', userId)
    : supabase.from('pa_coaching_goals').insert(row);
  const { data, error } = await query.select('id, leak_id, title, metric, target_value, current_value, status, due_at, created_at, updated_at').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Goal was not saved');
  return data;
}

async function deleteGoal(supabase, userId, body) {
  const id = String(body.id || '');
  if (!UUID_RE.test(id)) throw new TypeError('Goal id is invalid');
  const { data, error } = await supabase.from('pa_coaching_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function writeFeedback(supabase, userId, body) {
  const type = String(body.feedbackType || '').toLowerCase();
  if (!FEEDBACK_TYPES.has(type)) throw new TypeError('Feedback type is invalid');
  const leak = body.leakId ? String(body.leakId) : null;
  if (leak && !LEAK_ID_RE.test(leak)) throw new TypeError('Leak id is invalid');
  const { data, error } = await supabase.from('pa_coach_feedback').insert({
    user_id: userId,
    leak_id: leak,
    decision_key: boundedText(body.decisionKey, 240),
    feedback_type: type,
    note: boundedText(body.note, 2000),
  }).select('id, leak_id, decision_key, feedback_type, note, status, created_at, updated_at').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Feedback was not saved');
  return data;
}

export async function writePreferences(supabase, userId, body) {
  let existing = null;
  try {
    const existingRes = await readPreferences(supabase, userId);
    if (existingRes && !existingRes.error && existingRes.data) {
      existing = existingRes.data;
    }
  } catch (_) {
    existing = null;
  }

  const hasSavedView = body.savedView !== undefined || body.saved_view !== undefined;
  const savedView = hasSavedView
    ? String(body.savedView ?? body.saved_view).toLowerCase()
    : (SAVED_VIEWS.has(String(existing?.saved_view || '').toLowerCase())
        ? String(existing.saved_view).toLowerCase()
        : 'coach');

  const hasAnalysisDepth = body.analysisDepth !== undefined || body.analysis_depth !== undefined;
  const analysisDepth = hasAnalysisDepth
    ? String(body.analysisDepth ?? body.analysis_depth).toLowerCase()
    : (DEPTHS.has(String(existing?.analysis_depth || '').toLowerCase())
        ? String(existing.analysis_depth).toLowerCase()
        : 'guided');

  if (!SAVED_VIEWS.has(savedView) || !DEPTHS.has(analysisDepth)) {
    throw new TypeError('Preference is invalid');
  }

  const rawPanelLayout = body.panelLayout !== undefined ? body.panelLayout : body.panel_layout;
  const panelLayout = rawPanelLayout !== undefined
    ? (rawPanelLayout && typeof rawPanelLayout === 'object' && !Array.isArray(rawPanelLayout) ? rawPanelLayout : {})
    : (existing?.panel_layout && typeof existing.panel_layout === 'object' && !Array.isArray(existing.panel_layout)
        ? existing.panel_layout
        : {});
  if (JSON.stringify(panelLayout).length > 4000) throw new RangeError('Panel layout is too large');

  const weeklyDigestExplicit = body.weeklyDigestOptIn !== undefined || body.weekly_digest_opt_in !== undefined;
  const weeklyDigestOptIn = body.weeklyDigestOptIn !== undefined
    ? Boolean(body.weeklyDigestOptIn)
    : (body.weekly_digest_opt_in !== undefined
        ? Boolean(body.weekly_digest_opt_in)
        : (existing?.weekly_digest_opt_in !== undefined ? Boolean(existing.weekly_digest_opt_in) : undefined));

  const payload = {
    user_id: userId,
    saved_view: savedView,
    analysis_depth: analysisDepth,
    panel_layout: panelLayout,
    updated_at: new Date().toISOString(),
  };
  if (weeklyDigestOptIn !== undefined) {
    payload.weekly_digest_opt_in = weeklyDigestOptIn;
  }

  let query = supabase.from('pa_coaching_preferences').upsert(payload, { onConflict: 'user_id' });
  let res = await query.select('saved_view, analysis_depth, panel_layout, weekly_digest_opt_in, updated_at').maybeSingle();
  if (res.error && isMissingSchema(res.error)) {
    if (weeklyDigestExplicit) {
      throw new Error('Weekly digest preference column is not available');
    }
    delete payload.weekly_digest_opt_in;
    res = await supabase.from('pa_coaching_preferences').upsert(payload, { onConflict: 'user_id' })
      .select('saved_view, analysis_depth, panel_layout, updated_at').maybeSingle();
  }
  if (res.error) throw res.error;
  if (!res.data) throw new Error('Preferences were not saved');
  return {
    ...res.data,
    weeklyDigestOptIn: Boolean(res.data.weekly_digest_opt_in),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const limit = req.method === 'GET' ? (LIMITS.read || { max: 60, windowMs: 60_000 }) : LIMITS.write;
  if (!applyRateLimit(req, res, limit)) return;

  try {
    const supabase = getSupabase();
    const { user, error, status: authStatus } = await getServerUserWithFallback(req, supabase);
    if (error || !user) {
      return res.status(authStatus === 503 ? 503 : 401).json({
        success: false,
        error: authStatus === 503 ? 'Session verification unavailable' : 'Authentication required',
      });
    }

    if (req.method === 'GET') {
      const workspace = await readWorkspace(supabase, user.id);
      return res.status(200).json({ success: true, ...workspace });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let result;
    if (body.action === 'save_goal') result = await writeGoal(supabase, user.id, body.goal || {});
    else if (body.action === 'delete_goal') {
      result = await deleteGoal(supabase, user.id, body.goal || {});
      if (!result) return res.status(404).json({ success: false, error: 'Coaching goal was not found' });
    }
    else if (body.action === 'submit_feedback') result = await writeFeedback(supabase, user.id, body.feedback || {});
    else if (body.action === 'save_preferences') result = await writePreferences(supabase, user.id, body.preferences || {});
    else return res.status(400).json({ success: false, error: 'Unsupported coaching action' });
    return res.status(200).json({ success: true, result });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.warn('[assistant/coaching] request failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'Coaching workspace is temporarily unavailable' });
  }
}
