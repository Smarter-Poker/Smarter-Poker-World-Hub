import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES ANALYTICS API — Admin-only endpoint
   Serves the Geeves tab in the Horses admin page.
   ═══════════════════════════════════════════════════════════════════════════
   Actions:
     GET  ?action=summary       — KB hit rate, Grok call count, avg confidence this week
     GET  ?action=top_missed    — Top 20 unanswered questions by asked_count
     POST { action:'mark_resolved', id, added_to_kb }
            `id` MUST be an integer (geeves_missed_questions.id is a bigint).
            A non-integer id returns 400, not 500.
   Auth: admin or superadmin role required
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { logAdminAction } = require('../../../src/lib/antiAbuse');

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  } else if (!applyRateLimit(req, res, LIMITS.read)) {
    // GET was unlimited. The Geeves tab polls it and the summary branch fires
    // four DB round-trips per call, so it is bounded the same way writes are.
    return;
  }

  try {
      // ── Auth: only admins ──────────────────────────────────────────────
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const { data: profile } = await getSupabase()
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
          return res.status(403).json({ success: false, error: 'Admin access required' });
      }

      // ── Route by method + action ───────────────────────────────────────
      if (req.method === 'GET') {
          const { action = 'summary' } = req.query;

          if (action === 'top_missed') {
              const { data, error } = await getSupabase()
                  .from('geeves_missed_questions')
                  .select('id, question, page, asked_count, first_asked, last_asked, resolved, added_to_kb, grok_answer')
                  .eq('resolved', false)
                  .order('asked_count', { ascending: false })
                  .limit(50);

              if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
              return res.status(200).json({ success: true, questions: data || [] });
          }

          if (action === 'summary') {
              // Week ago cutoff
              const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

              // Each result is kept WHOLE rather than destructured straight to
              // { count }. The three counts previously discarded `.error`, so
              // a failed count arrived as undefined and rendered on the
              // dashboard as a confident 0 — the same class of bug as reading
              // a null as a zero.
              const [
                  missedRes,
                  resolvedRes,
                  addedToKbRes,
                  cacheRes,
              ] = await Promise.all([
                  getSupabase()
                      .from('geeves_missed_questions')
                      .select('*', { count: 'exact', head: true })
                      .gte('last_asked', weekAgo),
                  getSupabase()
                      .from('geeves_missed_questions')
                      .select('*', { count: 'exact', head: true })
                      .eq('resolved', true)
                      .gte('last_asked', weekAgo),
                  getSupabase()
                      .from('geeves_missed_questions')
                      .select('*', { count: 'exact', head: true })
                      .eq('added_to_kb', true),
                  getSupabase()
                      .from('geeves_knowledge_cache')
                      .select('times_served, avg_rating')
                      .gte('created_at', weekAgo)
                      .limit(500),
              ]);

              const named = [
                  ['geeves_missed_questions (missed this week)', missedRes],
                  ['geeves_missed_questions (resolved this week)', resolvedRes],
                  ['geeves_missed_questions (added to KB)', addedToKbRes],
                  ['geeves_knowledge_cache', cacheRes],
              ];
              const failed = named.filter(([, r]) => r?.error);
              if (failed.length > 0) {
                  failed.forEach(([label, r]) => console.warn(`[Geeves Analytics] ${label} error:`, r.error.message || r.error));
                  return res.status(500).json({
                      success: false,
                      error: 'Failed to load Geeves analytics',
                      failedSources: failed.map(([label]) => label),
                  });
              }

              const cacheData = cacheRes.data || [];
              const totalCacheServed = cacheData.reduce((s, r) => s + (r.times_served || 0), 0);
              const avgRating = cacheData.length > 0
                  ? (cacheData.reduce((s, r) => s + (r.avg_rating || 0), 0) / cacheData.length).toFixed(2)
                  : null;

              return res.status(200).json({
                  success: true,
                  summary: {
                      missedThisWeek: missedRes.count ?? 0,
                      resolvedThisWeek: resolvedRes.count ?? 0,
                      totalAddedToKB: addedToKbRes.count ?? 0,
                      cacheAnswersServedThisWeek: totalCacheServed,
                      avgCacheRating: avgRating,
                  },
              });
          }

          return res.status(400).json({ success: false, error: 'Unknown action' });
      }

      if (req.method === 'POST') {
          const { action, id, added_to_kb } = req.body || {};

          if (action === 'mark_resolved') {
              if (id === undefined || id === null || id === '') {
                  return res.status(400).json({ success: false, error: 'id required' });
              }

              // geeves_missed_questions.id is a BIGINT. The /horses UI
              // optimistically appends live rows carrying a synthetic string
              // id such as "live-1756...", and .eq('id', 'live-1756...') made
              // Postgres raise 22P02 (invalid input syntax for type bigint),
              // which surfaced as an opaque 500. A non-numeric id is a bad
              // request, not a server fault, and it now says so.
              const numericId = typeof id === 'number' ? id : Number(String(id).trim());
              if (!Number.isSafeInteger(numericId)) {
                  return res.status(400).json({
                      success: false,
                      error: 'id must be an integer - geeves_missed_questions.id is a bigint. A client-generated placeholder id (for example "live-1756...") belongs to an unsaved row and cannot be resolved.',
                  });
              }

              const { data: updated, error } = await getSupabase()
                  .from('geeves_missed_questions')
                  .update({
                      resolved: true,
                      added_to_kb: Boolean(added_to_kb),
                  })
                  .eq('id', numericId)
                  .select('id, question, resolved, added_to_kb')
                  .maybeSingle();

              if (error) {
                  console.warn('[Geeves Analytics] mark_resolved failed:', error.message || error);
                  return res.status(500).json({ success: false, error: 'Internal server error' });
              }
              if (!updated) {
                  return res.status(404).json({ success: false, error: 'No missed question with that id' });
              }

              // Audit: resolving a missed question changes what the Geeves KB
              // reports as outstanding. DELETE-class admin actions elsewhere in
              // this panel are logged; this one was not.
              await logAdminAction(getSupabase(), {
                  admin_user_id: user.id,
                  action: 'geeves_question.marked_resolved',
                  target_type: 'geeves_missed_question',
                  target_id: numericId,
                  details: { question: updated.question, added_to_kb: Boolean(added_to_kb) },
                  after: updated,
                  req,
              });

              return res.status(200).json({ success: true, question: updated });
          }

          return res.status(400).json({ success: false, error: 'Unknown action' });
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
