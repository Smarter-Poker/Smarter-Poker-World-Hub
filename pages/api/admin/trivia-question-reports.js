/**
 * /api/admin/trivia-question-reports  (restricted operations queue, Phase 3)
 *
 * GET  -> open/triaged question reports (trivia_question_report_queue_v1), oldest first.
 * POST { reportId, state: 'triaged'|'upheld'|'dismissed'|'duplicate', note? }
 *      -> trivia_triage_question_report_v1. 'upheld' quarantines the question
 *         (eligibility only); terminal states are immutable.
 * Auth: the admin/cron secret (requireAdminSecret) - never a browser session.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = new Set(['triaged', 'upheld', 'dismissed', 'duplicate']);

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET' && req.method !== 'POST') {
            res.setHeader('Allow', 'GET, POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!requireAdminSecret(req, res, { label: 'trivia-question-reports' })) return;
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return res.status(500).json({ success: false, error: 'server_misconfigured' });
        const sb = createClient(url, key, { auth: { persistSession: false } });
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        if (req.method === 'GET') {
            const { data, error } = await sb.from('trivia_question_report_queue_v1')
                .select('report_id, question_id, state, valid, reason, note, created_at, age_hours, open_valid_for_question, reject_reasons, category, difficulty, triaged_at, triaged_by')
                .order('created_at', { ascending: true })
                .limit(200);
            if (error) return res.status(500).json({ success: false, error: 'queue_unavailable' });
            return res.status(200).json({ success: true, reports: data || [] });
        }
        const { reportId, state, note } = req.body || {};
        if (typeof reportId !== 'string' || !UUID_RE.test(reportId) || !STATES.has(state)
            || (note != null && (typeof note !== 'string' || note.length > 1000))) {
            return res.status(400).json({ success: false, error: 'invalid_arguments' });
        }
        const { data, error } = await sb.rpc('trivia_triage_question_report_v1', {
            p_report_id: reportId, p_state: state, p_actor: 'admin:trivia-question-reports', p_note: note || null,
        });
        if (error) return res.status(500).json({ success: false, error: 'triage_failed' });
        if (!data || data.success !== true) {
            return res.status(data?.error === 'report_not_found' ? 404 : 409).json({ success: false, error: data?.error || 'triage_rejected' });
        }
        return res.status(200).json(data);
    } catch (e) {
        try { reportApiError(e, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
