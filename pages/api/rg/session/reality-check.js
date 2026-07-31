/**
 * GET /api/rg/session/reality-check — Responsible Gaming reality check poll
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 7.1.5 — Responsible-gaming limits
 *
 * Client long-polls this endpoint (recommended: every 60s) while the user
 * is in a play context. The server decides whether to surface a reality
 * check modal based on the user's `reality_check_interval_minutes` setting
 * and the timestamps stored in `responsible_gaming_sessions.reality_check_shown_at`.
 *
 * The RPC `fn_rg_should_show_reality_check` also force-closes the session
 * (with reason = 'session_time_limit') if the user has hit
 * `session_time_limit_minutes`. In that case the client should unseat the
 * user and end the play context.
 *
 * Auth: Bearer <access_token>
 * Response: {
 *   show:                boolean,
 *   reason?:             'interval' | 'session_time_limit',
 *   session_minutes:     number,
 *   session_started_at:  ISO string,
 *   time_limit_minutes?: number | null,
 *   force_end?:          boolean
 * }
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

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Reality check is polled frequently — 120/min is plenty of headroom.
    const rl = rateLimit(req, { max: 120, windowMs: 60_000 });
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

        // Optional ?ack=true — mark the reality check as shown (client tells us
        // it actually displayed the modal, so we append a timestamp to
        // reality_check_shown_at and the next poll resets the interval).
        const ack = String(req.query.ack || "").toLowerCase() === "true";

        const { data, error } = await supabase.rpc(
            "fn_rg_should_show_reality_check",
            {
                p_user_id: user.id,
                p_ack: ack
            }
        );

        if (error) {
            console.warn("[rg/session/reality-check:rpc]", error);
            return res.status(500).json({
                error: error.message,
                code: "rg_reality_check_failed"
            });
        }

        // Short cache to discourage abusive long-polling
        res.setHeader("Cache-Control", "private, max-age=15");

        return res.status(200).json(data);
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn("[rg/session/reality-check] unhandled:", err);
        return res
            .status(500)
            .json({ error: err?.message || "unhandled failure" });
    }
}
