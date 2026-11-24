import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNELS = new Set(['in_app_push', 'email', 'web_push']);

let cachedServiceClient = null;
function serviceClient() {
    if (!cachedServiceClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('nightly reminder server configuration unavailable');
        cachedServiceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    return cachedServiceClient;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Allow', 'GET, POST');

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return undefined;

    let client;
    try {
        client = serviceClient();
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/nightly-reminder', operation: 'service_client' }); } catch (_) {}
        return res.status(503).json({ success: false, error: 'server_configuration_unavailable' });
    }

    const { user, error: authError } = await getServerUserWithFallback(req, client);
    if (authError || !user?.id) {
        return res.status(401).json({ success: false, error: 'authentication_required' });
    }

    try {
        if (req.method === 'GET') {
            const rawTournamentId = typeof req.query?.tournamentId === 'string' ? req.query.tournamentId.trim() : '';
            if (rawTournamentId && !UUID_RE.test(rawTournamentId)) {
                return res.status(400).json({ success: false, error: 'invalid_tournament_id' });
            }
            const { data, error } = await client.rpc('trivia_nightly_reminder_status_v1', {
                p_user_id: user.id,
                p_tournament_id: rawTournamentId || null,
            });
            if (error) {
                try { reportApiError(error, { route: 'trivia/nightly-reminder', operation: 'status', userId: user.id }); } catch (_) {}
                return res.status(500).json({ success: false, error: 'reminder_status_failed' });
            }
            if (!data || data.success !== true) {
                return res.status(400).json({ success: false, error: data?.error || 'reminder_status_failed' });
            }
            return res.status(200).json(data);
        }

        const body = req.body || {};
        const rawTournamentId = typeof body.tournamentId === 'string' ? body.tournamentId.trim() : '';
        if (rawTournamentId && !UUID_RE.test(rawTournamentId)) {
            return res.status(400).json({ success: false, error: 'invalid_tournament_id' });
        }
        const channel = typeof body.channel === 'string' && body.channel.trim()
            ? body.channel.trim()
            : 'in_app_push';
        if (!CHANNELS.has(channel)) {
            return res.status(400).json({ success: false, error: 'invalid_channel' });
        }
        const enabled = typeof body.enabled === 'boolean' ? body.enabled : null;

        const { data, error } = await client.rpc('trivia_nightly_reminder_toggle_v1', {
            p_user_id: user.id,
            p_tournament_id: rawTournamentId || null,
            p_enabled: enabled,
            p_channel: channel,
        });
        if (error) {
            try { reportApiError(error, { route: 'trivia/nightly-reminder', operation: 'toggle', userId: user.id }); } catch (_) {}
            return res.status(500).json({ success: false, error: 'reminder_toggle_failed' });
        }
        if (!data || data.success !== true) {
            const code = data?.error || 'reminder_toggle_failed';
            const status = code === 'no_upcoming_nightly_tournament' ? 404 : 400;
            return res.status(status).json({ success: false, error: code });
        }
        return res.status(200).json(data);
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/nightly-reminder', userId: user.id }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
