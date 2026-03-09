/**
 * 🚨 JARVIS LEAK ALERT API
 * ═══════════════════════════════════════════════════════════════════════════
 * Endpoints for managing Jarvis leak alerts in the Personal Assistant
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    const { method } = req;

    // Get user from auth header
    const authHeader = req.headers.authorization;
    let userId = null;

    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
            userId = user.id;
        }
    }

    // BUG #242 FIX: Removed req.query.userId fallback — IDOR allowed viewing anyone's leak alerts
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    switch (method) {
        case 'GET':
            return getUnreadAlerts(userId, res);
        case 'POST':
            return markAlertRead(userId, req.body, res);
        default:
            res.setHeader('Allow', ['GET', 'POST']);
            return res.status(405).end(`Method ${method} Not Allowed`);
    }
}

/**
 * GET: Fetch unread leak alerts for user
 */
async function getUnreadAlerts(userId, res) {
    try {
        const { data, error } = await supabase
            .rpc('get_unread_leak_alerts', { p_user_id: userId });

        if (error) {
            console.error('[Jarvis Leak Alert] Error fetching alerts:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({
            success: true,
            alerts: data || [],
            count: data?.length || 0
        });
    } catch (err) {
        console.error('[Jarvis Leak Alert] Server error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * POST: Mark an alert as read
 */
async function markAlertRead(userId, body, res) {
    const { alertId, dismiss = false } = body;

    if (!alertId) {
        return res.status(400).json({ success: false, error: 'alertId required' });
    }

    try {
        const { error } = await supabase
            .from('jarvis_leak_alerts')
            .update({
                read: true,
                dismissed: dismiss
            })
            .eq('id', alertId)
            .eq('user_id', userId);

        if (error) {
            console.error('[Jarvis Leak Alert] Error marking alert read:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[Jarvis Leak Alert] Server error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
