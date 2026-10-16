import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { noticePage, validateNoticeRequest } from '../../../src/lib/clubNoticeBoard.mjs';

let client;
function database() {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Notice Board Service Unavailable');
    if (!client) client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
    return client;
}
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Allow', 'POST, PUT, PATCH, DELETE');
    try {
        if (!applyRateLimit(req, res, req.method === 'POST' ? LIMITS.read : LIMITS.write)) return;
        const db = database();
        const { user } = await getServerUserWithFallback(req, db);
        if (!user) return res.status(401).json({ success: false, error: 'Sign In Required' });
        const { clubId, action, payload } = validateNoticeRequest(req.method, req.body);
        const { data, error } = await db.rpc('fn_club_notice_board', {
            p_actor: user.id, p_club: clubId, p_action: action, p_payload: payload,
        });
        if (error) {
            const status = { '42501': 403, '22023': 400, '22P02': 400, '22007': 400, '40001': 409, P0002: 404 }[error.code] || 503;
            return res.status(status).json({ success: false, error: status === 503 ? 'Notice Board Unavailable' : error.message });
        }
        return res.status(200).json({ success: true, ...(action === 'read' ? noticePage(data) : { entry: data }) });
    } catch (error) {
        return res.status(error.status || 503).json({ success: false, error: error.status ? error.message : 'Notice Board Unavailable' });
    }
}
