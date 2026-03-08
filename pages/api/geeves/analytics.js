/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES ANALYTICS API — Admin-only endpoint
   Serves the Geeves tab in the Horses admin page.
   ═══════════════════════════════════════════════════════════════════════════
   Actions:
     GET  ?action=summary       — KB hit rate, Grok call count, avg confidence this week
     GET  ?action=top_missed    — Top 20 unanswered questions by asked_count
     POST { action:'mark_resolved', id, added_to_kb }
   Auth: admin or superadmin role required
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // ── Auth: only admins ──────────────────────────────────────────────
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    // ── Route by method + action ───────────────────────────────────────
    if (req.method === 'GET') {
        const { action = 'summary' } = req.query;

        if (action === 'top_missed') {
            const { data, error } = await supabaseAdmin
                .from('geeves_missed_questions')
                .select('id, question, page, asked_count, first_asked, last_asked, resolved, added_to_kb, grok_answer')
                .eq('resolved', false)
                .order('asked_count', { ascending: false })
                .limit(50);

            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({ success: true, questions: data || [] });
        }

        if (action === 'summary') {
            // Week ago cutoff
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

            const [
                { count: totalMissed },
                { count: totalResolved },
                { count: totalAddedToKB },
                cacheRes,
            ] = await Promise.all([
                supabaseAdmin
                    .from('geeves_missed_questions')
                    .select('*', { count: 'exact', head: true })
                    .gte('last_asked', weekAgo),
                supabaseAdmin
                    .from('geeves_missed_questions')
                    .select('*', { count: 'exact', head: true })
                    .eq('resolved', true)
                    .gte('last_asked', weekAgo),
                supabaseAdmin
                    .from('geeves_missed_questions')
                    .select('*', { count: 'exact', head: true })
                    .eq('added_to_kb', true),
                supabaseAdmin
                    .from('geeves_knowledge_cache')
                    .select('times_served, avg_rating')
                    .gte('created_at', weekAgo)
                    .limit(500),
            ]);

            const cacheData = cacheRes.data || [];
            const totalCacheServed = cacheData.reduce((s, r) => s + (r.times_served || 0), 0);
            const avgRating = cacheData.length > 0
                ? (cacheData.reduce((s, r) => s + (r.avg_rating || 0), 0) / cacheData.length).toFixed(2)
                : null;

            return res.status(200).json({
                success: true,
                summary: {
                    missedThisWeek: totalMissed || 0,
                    resolvedThisWeek: totalResolved || 0,
                    totalAddedToKB: totalAddedToKB || 0,
                    cacheAnswersServedThisWeek: totalCacheServed,
                    avgCacheRating: avgRating,
                },
            });
        }

        return res.status(400).json({ success: false, error: 'Unknown action' });
    }

    if (req.method === 'POST') {
        const { action, id, added_to_kb } = req.body;

        if (action === 'mark_resolved') {
            if (!id) return res.status(400).json({ success: false, error: 'id required' });
            const { error } = await supabaseAdmin
                .from('geeves_missed_questions')
                .update({
                    resolved: true,
                    added_to_kb: Boolean(added_to_kb),
                })
                .eq('id', id);

            if (error) return res.status(500).json({ success: false, error: error.message });
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ success: false, error: 'Unknown action' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}
