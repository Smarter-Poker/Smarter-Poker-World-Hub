import { createHash } from 'node:crypto';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { openDeletionChallenge, retentionDays, sealDeletionChallenge } from '../../../src/lib/personal-assistant/dataLifecycle.mjs';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';

export const config = { maxDuration: 60, api: { responseLimit: '8mb' } };

const DELETE_CONFIRMATION = 'DELETE MY PERSONAL ASSISTANT DATA';
const PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS_PER_SOURCE = 50_000;
let _supabase = null;

function db() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Data Lifecycle Service Is Not Configured.');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

async function readAll(buildQuery, label) {
  const rows = [];
  for (let offset = 0; offset < MAX_EXPORT_ROWS_PER_SOURCE; offset += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
  throw new RangeError(`${label} Exceeds The Safe Export Limit. Contact Support For A Full Archive.`);
}

async function ownerRows(table, userId, select = '*', orderColumn = 'id') {
  return readAll(() => db().from(table).select(select).eq('user_id', userId).order(orderColumn, { ascending: true }), table);
}

async function linkedRows(table, column, ids) {
  if (!ids.length) return [];
  const rows = [];
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    const { data, error } = await db().from(table).select('*').in(column, batch);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

async function clubArenaHands(userId) {
  const [modern, legacy] = await Promise.all([
    readAll(() => db().from('hand_history').select('*')
      .contains('players', JSON.stringify([{ userId }])).order('created_at', { ascending: true }), 'Club Arena Hands'),
    readAll(() => db().from('hand_history').select('*')
      .contains('players', JSON.stringify([{ id: userId }])).order('created_at', { ascending: true }), 'Club Arena Hands'),
  ]);
  return [...new Map([...modern, ...legacy].map(row => [String(row.id), row])).values()]
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

async function buildExport(userId) {
  const [
    leaks, decisions, reviews, auditJobs, drillSessions, drillAnswers, drillAttempts,
    goals, feedback, preferences, lifecycleReceipts, sandboxSessions, savedHands,
    sandboxAnalytics, sandboxQuizResults, coachResults, bookmarks, equityHistory,
    templates, sharedScenarios, solutionBookmarks, sourceHands, privateHandFacts,
  ] = await Promise.all([
    ownerRows('user_leaks', userId),
    ownerRows('hand_audit_decisions', userId),
    ownerRows('leak_review_state', userId),
    ownerRows('pa_leak_audit_jobs', userId),
    ownerRows('leak_drill_sessions', userId, '*', 'batch_id'),
    ownerRows('leak_drill_answers', userId),
    ownerRows('leak_drill_attempts', userId),
    ownerRows('pa_coaching_goals', userId),
    ownerRows('pa_coach_feedback', userId),
    db().from('pa_coaching_preferences').select('*').eq('user_id', userId).maybeSingle(),
    ownerRows('pa_data_lifecycle_receipts', userId),
    ownerRows('sandbox_sessions', userId),
    ownerRows('sandbox_saved_hands', userId),
    ownerRows('sandbox_analytics', userId),
    ownerRows('sandbox_quiz_results', userId),
    ownerRows('sandbox_coach_results', userId),
    ownerRows('sandbox_bookmarks', userId),
    ownerRows('sandbox_equity_history', userId),
    ownerRows('sandbox_templates', userId),
    readAll(() => db().from('sandbox_shared_scenarios').select('*').eq('creator_id', userId).order('id', { ascending: true }), 'Shared Sandbox Scenarios'),
    ownerRows('solution_bookmarks', userId),
    clubArenaHands(userId),
    ownerRows('ca_hand_facts', userId, '*', 'hand_id'),
  ]);
  if (preferences.error) throw preferences.error;
  const [handExamples, sandboxResults] = await Promise.all([
    linkedRows('leak_hand_examples', 'leak_id', leaks.map(row => row.id)),
    linkedRows('sandbox_results', 'session_id', sandboxSessions.map(row => row.id)),
  ]);
  const data = {
    coaching: { goals, feedback, preferences: preferences.data || null },
    analysis: { leaks, decisions, reviews, auditJobs, drillSessions, drillAnswers, drillAttempts, handExamples },
    sandbox: {
      sessions: sandboxSessions,
      results: sandboxResults,
      savedHands,
      analytics: sandboxAnalytics,
      quizResults: sandboxQuizResults,
      coachResults,
      bookmarks,
      equityHistory,
      templates,
      sharedScenarios,
      solutionBookmarks,
    },
    clubArena: { hands: sourceHands, privateHandFacts },
    lifecycleReceipts,
  };
  const counts = Object.fromEntries(Object.entries(data).flatMap(([group, value]) => (
    Array.isArray(value)
      ? [[group, value.length]]
      : Object.entries(value || {}).filter(([, rows]) => Array.isArray(rows)).map(([name, rows]) => [`${group}.${name}`, rows.length])
  )));
  const generatedAt = new Date().toISOString();
  const fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const receipt = await db().from('pa_data_lifecycle_receipts').insert({
    user_id: userId,
    action: 'export',
    scope: 'all',
    item_counts: counts,
    receipt_fingerprint: fingerprint.slice(0, 32),
  }).select('id, receipt_fingerprint, created_at').maybeSingle();
  if (receipt.error || !receipt.data) throw receipt.error || new Error('Export Receipt Could Not Be Recorded.');
  return {
    schemaVersion: 'pa-data-export-v1',
    generatedAt,
    fingerprint,
    receipt: receipt.data,
    counts,
    data,
  };
}

async function countOwnerRows(table, userId) {
  const { count, error } = await db().from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) throw error;
  return count || 0;
}

async function summary(userId) {
  const [
    leaks, decisions, reviews, goals, feedback, sandboxSessions, savedHands,
    coachResults, bookmarks, equityHistory, templates, sharedScenarios,
    solutionBookmarks, preference, receipts,
  ] = await Promise.all([
    countOwnerRows('user_leaks', userId),
    countOwnerRows('hand_audit_decisions', userId),
    countOwnerRows('leak_review_state', userId),
    countOwnerRows('pa_coaching_goals', userId),
    countOwnerRows('pa_coach_feedback', userId),
    countOwnerRows('sandbox_sessions', userId),
    countOwnerRows('sandbox_saved_hands', userId),
    countOwnerRows('sandbox_coach_results', userId),
    countOwnerRows('sandbox_bookmarks', userId),
    countOwnerRows('sandbox_equity_history', userId),
    countOwnerRows('sandbox_templates', userId),
    db().from('sandbox_shared_scenarios').select('id', { count: 'exact', head: true }).eq('creator_id', userId),
    countOwnerRows('solution_bookmarks', userId),
    db().from('pa_coaching_preferences').select('retention_days, last_retention_run_at').eq('user_id', userId).maybeSingle(),
    db().from('pa_data_lifecycle_receipts').select('id, action, scope, item_counts, receipt_fingerprint, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
  ]);
  if (sharedScenarios.error || preference.error || receipts.error) throw sharedScenarios.error || preference.error || receipts.error;
  return {
    counts: {
      leaks, decisions, reviews, goals, feedback, sandboxSessions, savedHands,
      coachResults, bookmarks, equityHistory, templates,
      sharedScenarios: sharedScenarios.count || 0,
      solutionBookmarks,
    },
    retentionDays: preference.data?.retention_days ?? null,
    lastRetentionRunAt: preference.data?.last_retention_run_at || null,
    receipts: receipts.data || [],
    sourceHandsIncludedInDeletion: false,
  };
}

async function saveRetention(userId, value) {
  const days = retentionDays(value);
  const current = await db().from('pa_coaching_preferences').select('saved_view, analysis_depth, panel_layout')
    .eq('user_id', userId).maybeSingle();
  if (current.error) throw current.error;
  const { data, error } = await db().from('pa_coaching_preferences').upsert({
    user_id: userId,
    saved_view: current.data?.saved_view || 'data',
    analysis_depth: current.data?.analysis_depth || 'guided',
    panel_layout: current.data?.panel_layout || {},
    retention_days: days,
    last_retention_run_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).select('retention_days, last_retention_run_at').maybeSingle();
  if (error || !data) throw error || new Error('Retention Preference Could Not Be Saved.');
  return data;
}

export default async function handler(req, res) {
  const limit = req.method === 'GET' ? (LIMITS.read || { max: 60, windowMs: 60_000 }) : LIMITS.write;
  if (!applyRateLimit(req, res, limit)) return;
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const { user, error } = await getServerUserWithFallback(req, db());
    if (error || !user) return res.status(401).json({ success: false, error: 'Authentication Required' });

    if (req.method === 'GET') return res.status(200).json({ success: true, ...(await summary(user.id)) });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (req.method === 'POST' && body.action === 'export') {
      const archive = await buildExport(user.id);
      res.setHeader('Content-Disposition', `attachment; filename="smarter-poker-personal-assistant-${new Date().toISOString().slice(0, 10)}.json"`);
      return res.status(200).json(archive);
    }
    if (req.method === 'POST' && body.action === 'save_retention') {
      const preference = await saveRetention(user.id, body.retentionDays);
      const retention = await db().rpc('apply_personal_assistant_retention', { p_user_id: user.id });
      if (retention.error) throw retention.error;
      return res.status(200).json({ success: true, preference, retention: retention.data });
    }
    if (req.method === 'POST' && body.action === 'request_deletion') {
      const scope = String(body.scope || '').toLowerCase();
      const challenge = sealDeletionChallenge({ userId: user.id, scope });
      return res.status(200).json({ success: true, scope, challenge, confirmation: DELETE_CONFIRMATION, expiresInSeconds: 600 });
    }
    if (req.method === 'DELETE') {
      const scope = String(body.scope || '').toLowerCase();
      if (body.confirmation !== DELETE_CONFIRMATION) {
        return res.status(400).json({ success: false, error: 'Deletion Confirmation Does Not Match.' });
      }
      openDeletionChallenge(body.challenge, { userId: user.id, scope });
      const result = await db().rpc('purge_personal_assistant_data', { p_user_id: user.id, p_scope: scope });
      if (result.error) throw result.error;
      return res.status(200).json({ success: true, scope, receipt: result.data, sourceHandsDeleted: false });
    }
    return res.status(400).json({ success: false, error: 'Unsupported Data Control Action.' });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.warn('[assistant/data-controls] request failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'Personal Assistant Data Controls Are Temporarily Unavailable.' });
  }
}
