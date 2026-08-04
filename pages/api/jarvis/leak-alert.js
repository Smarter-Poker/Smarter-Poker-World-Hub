import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * 🚨 JARVIS LEAK ALERT API
 * ═══════════════════════════════════════════════════════════════════════════
 * Endpoints for managing Jarvis leak alerts in the Personal Assistant
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      const { method } = req;

      // Get user from auth header
      const authHeader = req.headers.authorization;
      let userId = null;

      if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (!authErr && user) {
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

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * GET: Fetch unread leak alerts for user
 */
async function getUnreadAlerts(userId, res) {
    try {
        const { data, error } = await getSupabase()
            .rpc('get_unread_leak_alerts', { p_user_id: userId });

        if (error) {
            console.warn('[Jarvis Leak Alert] Error fetching alerts:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        return res.status(200).json({
            success: true,
            alerts: data || [],
            count: data?.length || 0
        });
    } catch (err) {
        console.warn('[Jarvis Leak Alert] Server error:', err);
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
        const { error } = await getSupabase()
            .from('jarvis_leak_alerts')
            .update({
                read: true,
                dismissed: dismiss
            })
            .eq('id', alertId)
            .eq('user_id', userId);

        if (error) {
            console.warn('[Jarvis Leak Alert] Error marking alert read:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.warn('[Jarvis Leak Alert] Server error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
