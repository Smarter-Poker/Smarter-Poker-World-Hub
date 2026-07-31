/**
 * POST /api/trivia/report-question
 *
 * Phase 54 #6 — user "report this question" endpoint.
 *
 * Body: { question_id: uuid, reason: enum, note?: string }
 * Auth: requires Bearer token (authenticated user). Reports are inserted
 *       under the user's auth.uid() via RLS-friendly policy.
 *
 * Side effect: if a question accumulates >= 3 unresolved reports from
 * established accounts, its quality_score is demoted below the gameplay floor
 * (6) and its daily_date is cleared, so it stops being served immediately
 * while an admin reviews it.
 *
 * Abuse controls: per-user daily report budget, and only accounts older than
 * 24h count toward the auto-demotion threshold — otherwise three throwaway
 * accounts could walk the pool and demote every question below the serving
 * floor, emptying the daily roster.
 */
// Repo Immutable Rule 4: API routes must use src/lib/supabaseServerClient, not
// raw '@supabase/supabase-js' (build-safety-gate CHECK 3 blocks the raw import,
// and the patched client carries the JWT-decode/GoTrue resilience fixes).
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getTodayStartCST } from '../../../src/lib/trivia/getTodayCST';

const REASONS = ['wrong_answer', 'unclear', 'duplicate', 'offensive', 'broken', 'other'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMOTION_THRESHOLD = 3;
const DEMOTED_QUALITY_SCORE = 3;
const MAX_REPORTS_PER_USER_PER_DAY = 10;
const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

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

    // Service-role client for the writes (RLS lets users insert their own rows,
    // but the demotion update and cross-user counts need elevated access).
    const adm = createClient(url, srKey, { auth: { persistSession: false } });

    // The question must exist — a valid-but-unknown UUID used to insert an
    // orphan report row.
    const { data: question, error: qErr } = await adm
      .from('trivia_questions')
      .select('id, quality_score, daily_date')
      .eq('id', question_id)
      .maybeSingle();
    if (qErr) {
      console.warn('[report-question] question lookup failed:', qErr.message);
      return res.status(500).json({ error: 'Could not record report' });
    }
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Per-user daily report budget — applyRateLimit stops bursts, not slow drip.
    const dayStart = getTodayStartCST();
    const { count: todaysReports } = await adm
      .from('trivia_question_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', dayStart);

    if ((todaysReports || 0) >= MAX_REPORTS_PER_USER_PER_DAY) {
      return res.status(429).json({
        error: `Daily report limit reached (${MAX_REPORTS_PER_USER_PER_DAY}). Try again tomorrow.`,
      });
    }

    // Reject duplicate report from same user for same question
    const { data: existing } = await adm
      .from('trivia_question_reports')
      .select('id')
      .eq('question_id', question_id)
      .eq('user_id', userId)
      .is('resolved_at', null)
      .maybeSingle();
    if (existing) {
      return res.status(200).json({
        ok: true,
        deduped: true,
        message: 'You already reported this question',
        quality_score: question.quality_score ?? null,
      });
    }

    const { error: insErr } = await adm
      .from('trivia_question_reports')
      .insert({ question_id, user_id: userId, reason, note: note?.trim() || null });
    if (insErr) {
      console.warn('[report-question] insert failed:', insErr.message);
      return res.status(500).json({ error: 'Could not record report' });
    }

    // ── Phase 54: 3-strike auto-demotion ──────────────────────────────────
    // Only reports from accounts older than 24h count, so a burst of throwaway
    // accounts cannot bury good questions.
    const { data: reporters, error: repErr } = await adm
      .from('trivia_question_reports')
      .select('user_id')
      .eq('question_id', question_id)
      .is('resolved_at', null)
      .limit(200);

    let unresolvedCount = null;
    let eligibleCount = 0;
    if (repErr) {
      console.warn('[report-question] unresolved count failed:', repErr.message);
    } else {
      const reporterIds = [...new Set((reporters || []).map(r => r.user_id).filter(Boolean))];
      unresolvedCount = reporterIds.length;

      if (reporterIds.length >= DEMOTION_THRESHOLD) {
        const cutoff = new Date(Date.now() - MIN_ACCOUNT_AGE_MS).toISOString();
        const { data: established } = await adm
          .from('profiles')
          .select('id')
          .in('id', reporterIds)
          .lt('created_at', cutoff);
        eligibleCount = (established || []).length;
      } else {
        eligibleCount = 0;
      }
    }

    const autoDemoted = eligibleCount >= DEMOTION_THRESHOLD;
    let newQualityScore = question.quality_score ?? null;
    if (autoDemoted) {
      const { error: demoteErr } = await adm
        .from('trivia_questions')
        // Clearing daily_date pulls the question out of today's roster too,
        // so clients that re-fetch stop receiving it immediately.
        .update({ quality_score: DEMOTED_QUALITY_SCORE, daily_date: null })
        .eq('id', question_id);
      if (demoteErr) console.warn('[report-question] demotion failed:', demoteErr.message);
      else newQualityScore = DEMOTED_QUALITY_SCORE;
    }

    return res.status(200).json({
      ok: true,
      auto_demoted: autoDemoted,
      // null (not a fabricated 1) when the count query failed
      unresolved_reports: unresolvedCount,
      quality_score: newQualityScore,
      still_servable: (newQualityScore ?? 10) >= 6,
    });

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
