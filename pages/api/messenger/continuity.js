import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { readMessengerContinuity, writeMessengerContinuity } from '../../../src/lib/messengerContinuityServer.mjs';

let client;
function getSupabase() {
    if (!client) {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Service Unavailable');
        client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
    return client;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    const body = req.body || {};
    if (!['read', 'write'].includes(body.action)) return res.status(400).json({ success: false, error: 'Invalid Messenger Action' });
    if (!applyRateLimit(req, res, body.action === 'write' ? LIMITS.write : LIMITS.read)) return;
    if (!req.headers.authorization?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'Sign In Required' });
    try {
        const db = getSupabase();
        const { user, error } = await getServerUserWithFallback(req, db);
        if (error || !user) return res.status(401).json({ success: false, error: 'Sign In Required' });
        const result = body.action === 'write' ? await writeMessengerContinuity(db, user.id, body) : await readMessengerContinuity(db, user.id, body);
        return res.status(result.success ? 200 : 409).json(result);
    } catch (error) {
        const status = [400, 403, 404, 503].includes(error.status) ? error.status : 503;
        return res.status(status).json({ success: false, error: status === 400 ? 'Invalid Messenger State' : status === 403 || status === 404 ? 'Messenger State Unavailable' : 'Messenger State Could Not Be Loaded Or Saved' });
    }
}

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };
