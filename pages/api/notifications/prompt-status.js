/**
 * Notification Prompt Status API
 * Tracks whether a user/IP has already responded to the push notification prompt.
 * 
 * GET:  Check if current IP already dismissed → { dismissed: true/false }
 * POST: Record that current IP dismissed/enabled the prompt
 * 
 * Uses Supabase table: notification_prompt_log
 * Falls back gracefully if table doesn't exist yet.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function getClientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    return fwd ? fwd.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
    const ip = getClientIp(req);

    // ─── GET: Check if this IP already responded ───
    if (req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('notification_prompt_log')
                .select('id')
                .eq('ip_address', ip)
                .limit(1);

            if (error) {
                // Table may not exist yet — treat as "not dismissed"
                if (error.code === '42P01' || error.message?.includes('does not exist')) {
                    return res.status(200).json({ dismissed: false });
                }
                console.error('[prompt-status] GET error:', error.message);
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

        try {
            // First, ensure the table exists (auto-create if needed)
            await ensureTable();

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
                    user_id: user_id || null,
                    action: action || 'dismissed',
                    responded_at: new Date().toISOString(),
                });

            if (error) {
                console.error('[prompt-status] POST insert error:', error.message);
                // Don't fail the request — just log it
                return res.status(200).json({ ok: false, error: error.message });
            }

            return res.status(200).json({ ok: true });
        } catch (err) {
            console.error('[prompt-status] POST exception:', err);
            return res.status(200).json({ ok: false });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * Auto-create the notification_prompt_log table if it doesn't exist.
 * Uses raw SQL via Supabase's rpc or direct query.
 */
async function ensureTable() {
    try {
        // Try a simple select first — if it works, table exists
        const { error } = await supabase
            .from('notification_prompt_log')
            .select('id')
            .limit(1);

        if (!error) return; // Table exists

        // If table doesn't exist, create it via SQL
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
            const { error: createError } = await supabase.rpc('exec_sql', {
                query: `
          CREATE TABLE IF NOT EXISTS notification_prompt_log (
            id BIGSERIAL PRIMARY KEY,
            ip_address TEXT NOT NULL,
            user_id UUID,
            action TEXT DEFAULT 'dismissed',
            responded_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(ip_address)
          );
          CREATE INDEX IF NOT EXISTS idx_notification_prompt_ip ON notification_prompt_log(ip_address);
        `
            });

            // If exec_sql doesn't exist, just silently fail — table needs manual creation
            if (createError) {
                console.warn('[prompt-status] Could not auto-create table. Please create it manually:', createError.message);
            }
        }
    } catch (err) {
        // Silently fail — worst case, prompt shows again
    }
}
