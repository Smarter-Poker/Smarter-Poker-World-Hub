import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { buildCoachingSnapshot, receiptFingerprint } from '../../../src/lib/personal-assistant/coachingIntelligence.mjs';
import { normalizeUserLeakRow } from '../../../src/lib/personal-assistant/leakRecord';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

async function readWorkspace(supabase, userId) {
  const [leakRows, decisions, reviews, goals, feedback, preferenceResult, auditResult] = await Promise.all([
    ownerRead(supabase, 'user_leaks', '*', userId, query => query.order('updated_at', { ascending: false }).limit(500)),
    ownerRead(supabase, 'hand_audit_decisions', 'hand_external_id, decision_key, question_id, game_id, street, hero_position, villain_position, spot_type, hero_hand, board_cards, player_action, solver_action, selected_frequency, optimal_frequency, classification, ev_loss, ev_loss_measured, solver_verified, solver_source, match_tier, audited_at', userId, query => query.order('audited_at', { ascending: false }).limit(DECISION_WINDOW_LIMIT)),
    ownerRead(supabase, 'leak_review_state', 'leak_id, due_at, reps, lapses, strong_streak, retired, last_score, history, last_outcome, schema_version, updated_at', userId, query => query.order('due_at', { ascending: true }).limit(500)),
    ownerRead(supabase, 'pa_coaching_goals', 'id, leak_id, title, metric, target_value, current_value, status, due_at, created_at, updated_at', userId, query => query.order('created_at', { ascending: false }).limit(100)),
    ownerRead(supabase, 'pa_coach_feedback', 'id, leak_id, decision_key, feedback_type, note, status, created_at, updated_at', userId, query => query.order('created_at', { ascending: false }).limit(50)),
    supabase.from('pa_coaching_preferences').select('saved_view, analysis_depth, panel_layout, retention_days, last_retention_run_at, updated_at').eq('user_id', userId).maybeSingle(),
    supabase.from('pa_leak_audit_jobs').select('id, status, progress, result, reconciliation, completed_at, created_at').eq('user_id', userId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (preferenceResult.error && !isMissingSchema(preferenceResult.error)) throw preferenceResult.error;
  if (auditResult.error && !isMissingSchema(auditResult.error)) throw auditResult.error;
  const audit = auditResult.data || null;
  const ownedDecisions = decisions.map(row => ({ ...row, evidence_scope: 'club_arena' }));
  const rejected = audit?.progress?.coverage || audit?.progress || {};
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
  });
  snapshot.coverage.windowLimited = ownedDecisions.length >= DECISION_WINDOW_LIMIT;
  snapshot.coverage.windowLimit = DECISION_WINDOW_LIMIT;

  return {
    snapshot: { ...snapshot, receipt: receiptFingerprint(snapshot) },
    decisions: ownedDecisions,
    reviews,
    goals,
    feedback,
    preferences: preferenceResult.data || { saved_view: 'coach', analysis_depth: 'guided', panel_layout: {}, retention_days: null, last_retention_run_at: null },
    latestAudit: audit,
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

async function writePreferences(supabase, userId, body) {
  const savedView = String(body.savedView || 'coach').toLowerCase();
  const analysisDepth = String(body.analysisDepth || 'guided').toLowerCase();
  if (!SAVED_VIEWS.has(savedView) || !DEPTHS.has(analysisDepth)) throw new TypeError('Preference is invalid');
  const panelLayout = body.panelLayout && typeof body.panelLayout === 'object' && !Array.isArray(body.panelLayout)
    ? body.panelLayout : {};
  if (JSON.stringify(panelLayout).length > 4000) throw new RangeError('Panel layout is too large');
  const { data, error } = await supabase.from('pa_coaching_preferences').upsert({
    user_id: userId,
    saved_view: savedView,
    analysis_depth: analysisDepth,
    panel_layout: panelLayout,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).select('saved_view, analysis_depth, panel_layout, updated_at').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Preferences were not saved');
  return data;
}

export default async function handler(req, res) {
  const limit = req.method === 'GET' ? (LIMITS.read || { max: 60, windowMs: 60_000 }) : LIMITS.write;
  if (!applyRateLimit(req, res, limit)) return;
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const supabase = getSupabase();
    const { user, error } = await getServerUserWithFallback(req, supabase);
    if (error || !user) return res.status(401).json({ success: false, error: 'Authentication required' });

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
