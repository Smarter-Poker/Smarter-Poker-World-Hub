/**
 * POST /api/trivia/report-question
 *
 * Phase 54 #6 — user "report this question" endpoint.
 *
 * Body: { question_id: uuid, reason: enum, note?: string }
 * Auth: requires Bearer token (authenticated user). Browsers no longer write
 *       trivia_question_reports directly (Phase 3 revoked it); intake is the
 *       database function trivia_submit_question_report_v1.
 *
 * Effect (Phase 3): a report is VALID only from an established human account
 * that was actually served the question. One valid open report removes the
 * question from paid/competitive pools immediately; the policy threshold of
 * distinct valid reporters quarantines it everywhere. Quarantine changes
 * eligibility only - the question row is never rewritten. Operations triage
 * reports through /api/admin/trivia-question-reports (open -> triaged ->
 * upheld | dismissed | duplicate). Spam is bounded by per-player daily and
 * open-report budgets and by the served-to-reporter rule.
 */
// Repo Immutable Rule 4: API routes must use src/lib/supabaseServerClient, not
// raw '@supabase/supabase-js' (build-safety-gate CHECK 3 blocks the raw import,
// and the patched client carries the JWT-decode/GoTrue resilience fixes).
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

const REASONS = ['wrong_answer', 'unclear', 'duplicate', 'offensive', 'broken', 'other'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !srKey) {
      return res.status(500).json({ error: 'Server misconfigured' });
    }

    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const sb = createClient(url, anonKey);
    const { data: userData, error: uErr } = await sb.auth.getUser(auth.slice(7).trim());
    if (uErr || !userData?.user?.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const authUser = userData.user;
    const userId = authUser.id;

    const { question_id, reason, note } = req.body || {};
    if (typeof question_id !== 'string' || !UUID_RE.test(question_id)) {
      // A non-UUID used to slip through to the insert and surface as a generic
      // 500 from a Postgres uuid-cast error.
      return res.status(400).json({ error: 'question_id must be a valid UUID' });
    }
    if (!reason || !REASONS.includes(reason)) {
      return res.status(400).json({ error: `reason must be one of: ${REASONS.join(', ')}` });
    }
    if (note != null && (typeof note !== 'string' || note.length > 500)) {
      return res.status(400).json({ error: 'note must be a string of 500 characters or fewer' });
    }

    // Phase 3: intake is one database function (trivia_submit_question_report_v1).
    // It dedups per player+question, enforces the daily and open-report budgets,
    // marks a report VALID only from an established human account that was actually
    // served the question, removes a validly reported question from paid/competitive
    // pools at once and quarantines it (eligibility only) at the policy threshold.
    // Question rows are never rewritten here any more.
    const adm = createClient(url, srKey, { auth: { persistSession: false } });
    const sessionId = typeof req.body?.session_id === 'string' && UUID_RE.test(req.body.session_id)
      ? req.body.session_id : null;
    const { data: result, error: rpcErr } = await adm.rpc('trivia_submit_question_report_v1', {
      p_user_id: userId,
      p_question_id: question_id,
      p_reason: reason,
      p_note: typeof note === 'string' ? note.trim() || null : null,
      p_session_id: sessionId,
    });
    if (rpcErr) {
      console.warn('[report-question] intake failed:', rpcErr.message);
      return res.status(500).json({ error: 'Could not record report' });
    }
    if (!result || result.success !== true) {
      const code = result?.error || 'report_rejected';
      if (code === 'question_not_found') return res.status(404).json({ error: 'Question not found' });
      if (code === 'daily_report_limit' || code === 'open_report_limit') {
        return res.status(429).json({ error: `Report limit reached (${code}). Try again tomorrow.`, code });
      }
      return res.status(400).json({ error: code });
    }
    if (result.duplicate) {
      return res.status(200).json({ ok: true, deduped: true, message: 'You already reported this question' });
    }
    return res.status(200).json({
      ok: true,
      report_id: result.report_id,
      counted: result.valid === true,
      excluded_from_paid_pools: result.excluded_from_paid_pools === true,
      quarantined: result.quarantined === true,
    });

  } catch (err) {
    try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
