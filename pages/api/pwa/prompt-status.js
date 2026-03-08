/**
 * PWA Install Prompt Status API
 * Tracks whether a user/IP has already responded to the PWA install prompt.
 *
 * GET:  Check if current IP already dismissed → { dismissed: true/false }
 * POST: Record that current IP dismissed/installed the prompt
 *
 * Reuses the same Supabase table: pwa_prompt_log
 * Falls back gracefully if table doesn't exist yet.
 *
 * Security: Rate limited, input validated, error details never leaked.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ─── Simple in-memory rate limiter ───
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { windowStart: now, count: 1 });
        return false;
    }
    entry.count++;
    return entry.count > RATE_LIMIT_MAX;
}

// Periodic cleanup (every 5 min)
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap.entries()) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW * 5) rateLimitMap.delete(ip);
    }
}, 300000);

function getClientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    return fwd ? fwd.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
}

const ALLOWED_ACTIONS = ['installed', 'dismissed', 'later', 'standalone_detected'];
function sanitizeAction(action) {
    if (!action || typeof action !== 'string') return 'dismissed';
    const clean = action.toLowerCase().trim().slice(0, 30);
    return ALLOWED_ACTIONS.includes(clean) ? clean : 'dismissed';
}

export default async function handler(req, res) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    // ─── GET: Check if this IP already responded ───
    if (req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('pwa_prompt_log')
                .select('id')
                .eq('ip_address', ip)
                .limit(1);

            if (error) {
                // Table may not exist — treat as "not dismissed"
                return res.status(200).json({ dismissed: false });
            }
            return res.status(200).json({ dismissed: data && data.length > 0 });
        } catch {
            return res.status(200).json({ dismissed: false });
        }
    }

    // ─── POST: Record that this IP responded ───
    if (req.method === 'POST') {
        const { action } = req.body || {};
        const cleanAction = sanitizeAction(action);

        try {
            const exists = await ensureTable();
            if (!exists) {
                return res.status(200).json({ ok: true, note: 'table_pending' });
            }

            // Idempotent: check if already recorded for this IP
            const { data: existing } = await supabase
                .from('pwa_prompt_log')
                .select('id')
                .eq('ip_address', ip)
                .limit(1);

            if (existing && existing.length > 0) {
                return res.status(200).json({ ok: true, already_recorded: true });
            }

            const { error } = await supabase
                .from('pwa_prompt_log')
                .insert({
                    ip_address: ip,
                    action: cleanAction,
                    responded_at: new Date().toISOString(),
                });

            if (error) {
                if (error.code === '23505') {
                    return res.status(200).json({ ok: true, already_recorded: true });
                }
                console.error('[pwa-prompt-status] POST insert error:', error.message);
                return res.status(200).json({ ok: false });
            }

            return res.status(200).json({ ok: true });
        } catch (err) {
            console.error('[pwa-prompt-status] POST exception:', err);
            return res.status(200).json({ ok: false });
        }
    }
}

// ─── Table existence check (cached per cold start) ───
let tableChecked = false;
let tableExists = false;

async function ensureTable() {
    if (tableChecked) return tableExists;
    try {
        const { error } = await supabase
            .from('pwa_prompt_log')
            .select('id')
            .limit(1);

        tableChecked = true;

        if (!error) {
            tableExists = true;
            return true;
        }
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
            tableExists = false;
            return false;
        }
        tableExists = true;
        return true;
    } catch {
        tableChecked = true;
        return false;
    }
}
