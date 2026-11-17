import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let client;
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    try {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Service unavailable');
        client ||= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const { user } = await getServerUserWithFallback(req, client);
        if (!user) return res.status(401).json({ success: false, error: 'Sign in required' });
        const { clubId, before = null } = req.body || {};
        if (!UUID.test(clubId || '') || (before !== null && (typeof before !== 'string' || !Number.isFinite(Date.parse(before)))))
            return res.status(400).json({ success: false, error: 'Invalid statement request' });
        const { data, error } = await client.rpc('fn_messenger_saved_statements', {
            p_user_id: user.id, p_club_id: clubId, p_before: before, p_limit: 20,
        });
        if (error || data?.success !== true || !Array.isArray(data.documents)) throw new Error('Statement reader unavailable');
        return res.status(200).json(data);
    } catch (error) {
        console.warn('[messenger/statements]', error.message);
        return res.status(503).json({ success: false, error: 'Statements could not be loaded. Please retry.' });
    }
}
