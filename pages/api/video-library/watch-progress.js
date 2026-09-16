import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const MAX_BODY_BYTES = 12_000;
let supabaseClient = null;

function getSupabase() {
    if (!supabaseClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        supabaseClient = createClient(url, key);
    }
    return supabaseClient;
}

function getBearerToken(req) {
    const header = Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : req.headers.authorization;
    const match = String(header || '').match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
}

function getUserScopedSupabase(token) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
    });
}

function boundedSeconds(value, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.min(max, Math.max(0, Math.floor(number)));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const bodySize = Number(req.headers['content-length'] || 0);
    if (bodySize > MAX_BODY_BYTES) {
        return res.status(413).json({ success: false, error: 'Request body too large' });
    }

    try {
        const supabase = getSupabase();
        const token = getBearerToken(req);
        if (!token) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const { user, error: authError } = await getServerUserWithFallback(req, supabase);
        if (authError || !user?.id) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const videoId = String(req.body?.videoId || '').trim();
        const additionalSeconds = boundedSeconds(req.body?.additionalSeconds, 120);
        const progressSeconds = boundedSeconds(req.body?.progressSeconds, 24 * 60 * 60);
        const durationSeconds = boundedSeconds(req.body?.durationSeconds, 24 * 60 * 60);
        if (!/^[A-Za-z0-9_-]{3,32}$/.test(videoId) || additionalSeconds === null || additionalSeconds < 1) {
            return res.status(400).json({ success: false, error: 'Invalid watch progress payload' });
        }

        // Execute with the caller's JWT so the hardened RPC sees the verified
        // auth.uid(). The service client above is only used to validate the
        // token and must never perform this user-scoped write.
        const userSupabase = getUserScopedSupabase(token);
        const { data, error } = await userSupabase.rpc('record_video_watch_session', {
            p_expected_user_id: user.id,
            p_video_id: videoId,
            p_additional_seconds: additionalSeconds,
            p_progress_seconds: progressSeconds,
            p_video_title: String(req.body?.title || '').trim().slice(0, 300) || null,
            p_thumbnail_url: String(req.body?.thumbnail || '').trim().slice(0, 500) || null,
            p_duration_seconds: durationSeconds,
        });
        if (error) throw error;

        const result = Array.isArray(data) ? data[0] : data;
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ success: true, data: result || null });
    } catch (error) {
        console.warn('[video-library/watch-progress] persistence failed:', error?.message || error);
        try { reportApiError(error, req); } catch (_reportError) { /* telemetry must never mask the response */ }
        return res.status(503).json({ success: false, error: 'Watch progress could not be saved' });
    }
}
