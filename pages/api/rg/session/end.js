/**
 * POST /api/rg/session/end — Responsible Gaming session end
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 7.1.5 — Responsible-gaming limits
 *
 * Closes the authenticated user's currently-open RG session. Idempotent —
 * if no open session exists, returns { ok: true, already_closed: true }.
 *
 * Body: { reason?: 'user_ended' | 'session_time_limit' | 'self_excluded' | 'idle_timeout' }
 *        (default: 'user_ended')
 * Auth: Bearer <access_token>
 * Response: { ok, session_id, ended_at, duration_minutes }
 */
import { createClient } from "../../../../src/lib/supabaseServerClient";
import { rateLimit } from "../../../../src/lib/apiRateLimit";
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url =
            process.env.NEXT_PUBLIC_SUPABASE_URL ||
            "https://kuklfnapbkmacvwxktbh.supabase.co";
        const key =
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const ALLOWED_REASONS = new Set([
    "user_ended",
    "session_time_limit",
    "self_excluded",
    "idle_timeout"
]);

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const rl = rateLimit(req, { max: 30, windowMs: 60_000 });
    if (!rl.ok) {
        return res
            .status(429)
            .json({ error: "Too many requests", retryAfter: rl.retryAfter });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    try {
        const token = authHeader.replace("Bearer ", "");
        const supabase = getSupabase();
        const {
            data: { user },
            error: authError
        } = await supabase.auth.getUser(token);
        if (authErr || !user) {
            return res.status(401).json({ error: "Invalid or expired session" });
        }

        const body =
            typeof req.body === "string"
                ? JSON.parse(req.body || "{}")
                : req.body || {};
        const reason = body.reason || "user_ended";
        if (!ALLOWED_REASONS.has(reason)) {
            return res
                .status(400)
                .json({ error: `Invalid reason: ${reason}` });
        }

        const { data, error } = await supabase.rpc("fn_rg_end_session", {
            p_user_id: user.id,
            p_reason: reason
        });

        if (error) {
            console.warn("[rg/session/end:rpc]", error);
            return res
                .status(500)
                .json({ error: error.message, code: "rg_session_end_failed" });
        }

        return res.status(200).json(data);
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn("[rg/session/end] unhandled:", err);
        return res
            .status(500)
            .json({ error: err?.message || "unhandled failure" });
    }
}
