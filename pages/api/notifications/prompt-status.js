/**
 * Notification Prompt Status API
 * Tracks whether a user/IP has already responded to the push notification prompt.
 * 
 * GET:  Check if current IP already dismissed → { dismissed: true/false }
 * POST: Record that current IP dismissed/enabled the prompt
 * 
 * Uses Supabase table: notification_prompt_log
 * Falls back gracefully if table doesn't exist yet.
 * 
 * Security: Rate limited, input validated, error details never leaked.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ─── Simple in-memory rate limiter (per IP, per cold start) ───
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10;       // 10 requests per minute per IP

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { windowStart: now, count: 1 });
        return false;
    }

    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) {
        return true;
    }
    return false;
}

// Periodic cleanup to prevent memory leak (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap.entries()) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW * 5) {
            rateLimitMap.delete(ip);
        }
    }
}, 300000);

function getClientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    return fwd ? fwd.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
}

// ─── Validate action string (whitelist allowed values) ───
const ALLOWED_ACTIONS = ['yes', 'no', 'dismissed', 'subscribed', 'denied'];
function sanitizeAction(action) {
    if (!action || typeof action !== 'string') return 'dismissed';
    const clean = action.toLowerCase().trim().slice(0, 20);
    return ALLOWED_ACTIONS.includes(clean) ? clean : 'dismissed';
}

// ─── Validate UUID format ───
function isValidUuid(str) {
    if (!str || typeof str !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export default async function handler(req, res) {
    // Only allow GET and POST
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const ip = getClientIp(req);

    // Rate limit check
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    // ─── GET: Check if this IP already responded ───
    if (req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('notification_prompt_log')
                .select('id')
                .eq('ip_address', ip)
                .limit(1);

            if (error) {
                // Table may not exist — treat as "not dismissed"
                return res.status(200).json({ dismissed: false });
            }

            return res.status(200).json({ dismissed: data && data.length > 0 });
        } catch (err) {
            console.error('[prompt-status] GET exception:', err);
            return res.status(200).json({ dismissed: false });
        }
    }

    // ─── POST: Record that this IP responded ───
    if (req.method === 'POST') {
        const { action, user_id } = req.body || {};

        // Input validation
        const cleanAction = sanitizeAction(action);
        const cleanUserId = isValidUuid(user_id) ? user_id : null;

        try {
            // Check if table exists (cached after first check)
            const exists = await ensureTable();
            if (!exists) {
                return res.status(200).json({ ok: true, note: 'table_pending' });
            }

            // Check if already recorded for this IP (idempotent)
            const { data: existing } = await supabase
                .from('notification_prompt_log')
                .select('id')
                .eq('ip_address', ip)
                .limit(1);

            if (existing && existing.length > 0) {
                return res.status(200).json({ ok: true, already_recorded: true });
            }

            // Insert new record
            const { error } = await supabase
                .from('notification_prompt_log')
                .insert({
                    ip_address: ip,
                    user_id: cleanUserId,
                    action: cleanAction,
                    responded_at: new Date().toISOString(),
                });

            if (error) {
                // Handle unique constraint violation (race condition — two requests at once)
                if (error.code === '23505') {
                    return res.status(200).json({ ok: true, already_recorded: true });
                }
                console.error('[prompt-status] POST insert error:', error.message);
                return res.status(200).json({ ok: false });
            }

            return res.status(200).json({ ok: true });
        } catch (err) {
            console.error('[prompt-status] POST exception:', err);
            return res.status(200).json({ ok: false });
        }
    }
}

/**
 * Check if notification_prompt_log table exists.
 * Cached after first check — only queries once per cold start.
 */
let tableChecked = false;
let tableExists = false;

async function ensureTable() {
    if (tableChecked) return tableExists;

    try {
        const { error } = await supabase
            .from('notification_prompt_log')
            .select('id')
            .limit(1);

        tableChecked = true;

        if (!error) {
            tableExists = true;
            return true;
        }

        if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.warn('[prompt-status] Table "notification_prompt_log" does not exist.');
            tableExists = false;
            return false;
        }

        // Other errors (RLS, etc.) — table likely exists
        tableExists = true;
        return true;
    } catch (err) {
        tableChecked = true;
        return false;
    }
}
