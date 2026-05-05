/**
 * POST /api/trivia/report-question
 *
 * Phase 54 #6 — user "report this question" endpoint.
 *
 * Body: { question_id: uuid, reason: enum, note?: string }
 * Auth: requires Bearer token (authenticated user). Reports are inserted
 *       under the user's auth.uid() via RLS-friendly policy.
 *
 * Side effect: if a question accumulates ≥3 unresolved reports, automatically
 * demote quality_score to 3 (excluded by gameplay floor of 6) so it stops
 * being shown while admin reviews.
 */
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const REASONS = ['wrong_answer', 'unclear', 'duplicate', 'offensive', 'broken', 'other'];

export default async function handler(req, res) {
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
  const { data: userData, error: uErr } = await sb.auth.getUser(auth.slice(7));
  if (uErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const userId = userData.user.id;

  const { question_id, reason, note } = req.body || {};
  if (!question_id || typeof question_id !== 'string') {
    return res.status(400).json({ error: 'question_id required' });
  }
  if (!reason || !REASONS.includes(reason)) {
    return res.status(400).json({ error: `reason must be one of: ${REASONS.join(', ')}` });
  }
  if (note && (typeof note !== 'string' || note.length > 500)) {
    return res.status(400).json({ error: 'note must be ≤ 500 chars' });
  }

  // Use service-role to write — RLS policy allows users to insert with their uid
  const adm = createClient(url, srKey, { auth: { persistSession: false } });

  // Reject duplicate report from same user for same question
  const { data: existing } = await adm
    .from('trivia_question_reports')
    .select('id')
    .eq('question_id', question_id)
    .eq('user_id', userId)
    .is('resolved_at', null)
    .maybeSingle();
  if (existing) {
    return res.status(200).json({ ok: true, deduped: true, message: 'You already reported this question' });
  }

  const { error: insErr } = await adm
    .from('trivia_question_reports')
    .insert({ question_id, user_id: userId, reason, note: note?.trim() || null });
  if (insErr) {
    console.warn('[report-question] insert failed:', insErr.message);
    return res.status(500).json({ error: 'Could not record report' });
  }

  // Phase 54: 3-strike auto-demotion. Once 3 unresolved reports exist for a
  // question, drop its quality_score below the gameplay floor so it stops
  // being served while admin investigates.
  const { count: unresolvedCount } = await adm
    .from('trivia_question_reports')
    .select('*', { count: 'exact', head: true })
    .eq('question_id', question_id)
    .is('resolved_at', null);

  if ((unresolvedCount || 0) >= 3) {
    await adm
      .from('trivia_questions')
      .update({ quality_score: 3 })
      .eq('id', question_id);
  }

  return res.status(200).json({
    ok: true,
    auto_demoted: (unresolvedCount || 0) >= 3,
    unresolved_reports: unresolvedCount || 1,
  });
}
