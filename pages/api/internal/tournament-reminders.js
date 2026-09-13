import { createClient } from '../../../src/lib/supabaseServerClient';
import { dispatchTournamentReminders } from '../../../src/lib/push/tournament-reminder-delivery';

export const config = { maxDuration: 90 };

async function reminderServiceClient(req) {
    const authorization = req.headers?.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
    const key = authorization.slice(7).trim();
    if (!key) return null;
    // The caller already prepares reminders with database service authority.
    // Let the same project's grants verify that authority. Host-local cron
    // secrets and independently issued service keys need not be identical.
    // This RPC is read-only and service_role-only; [] reads no recipient data.
    const client = createClient(undefined, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error, status } = await client.rpc('get_tournament_reminder_delivery', {
        p_outbox_ids: [],
    }).abortSignal(AbortSignal.timeout(5000));
    if (status === 401 || status === 403) return null;
    if (error || !Array.isArray(data) || data.length !== 0) {
        throw new Error('Reminder Service Authority Unavailable');
    }
    // Dispatch retains the caller's verified authority instead of upgrading
    // an incoming credential to this deployment's own database credentials.
    return client;
}

export default async function handler(req, res) {
    try {
        const client = await reminderServiceClient(req);
        if (!client) return res.status(401).json({ error: 'Unauthorized' });
        if (req.method === 'GET') {
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json({ reminderProtocol: 1, reminderAuth: 'database_service_role' });
        }
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
        return res.status(200).json(await dispatchTournamentReminders(client));
    } catch {
        return res.status(503).json({ error: 'Reminder Dispatch Unavailable' });
    }
}
