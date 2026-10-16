import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { executeClubWelcomeRequest } from '../../../src/lib/clubWelcomeMessages.mjs';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    if (!applyRateLimit(req, res, req.body?.action === 'save' ? LIMITS.write : LIMITS.read)) return;
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('Welcome Message Service Is Unavailable');
        const db = createClient(url, key);
        const { user, error } = await getServerUserWithFallback(req, db);
        const token = req.headers.authorization?.replace(/^Bearer /i, '');
        if (error || !user || !token) return res.status(401).json({ success: false, error: 'Sign In To Manage Your Welcome Message' });
        const result = await executeClubWelcomeRequest(req.body, async (name, args) => {
            // Preserve the authenticated caller at the database boundary; a
            // service-role RPC would lose auth.uid() and cannot own a template.
            const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
                method: 'POST', headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(args), cache: 'no-store', signal: AbortSignal.timeout(20000),
            });
            const data = await response.json();
            return response.ok ? { data, error: null } : { data: null, error: data };
        });
        return res.status(200).json(result);
    } catch (error) {
        return res.status(error.status || 503).json({ success: false, error: error.status ? error.message : 'Welcome Messages Are Temporarily Unavailable' });
    }
}
