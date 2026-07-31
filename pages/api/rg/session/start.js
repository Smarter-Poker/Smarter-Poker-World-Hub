/**
 * POST /api/rg/session/start — Responsible Gaming session start
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 7.1.5 — Responsible-gaming limits
 *
 * Opens a responsible-gaming "play session" for the authenticated user.
 * Call once when the user enters the poker/club-arena context; idempotent —
 * if an open session already exists, the existing row is returned.
 *
 * Session state is used by:
 *   - fn_rg_should_show_reality_check  (session_minutes threshold)
 *   - fn_rg_require_not_excluded       (force-closes on self-exclusion)
 *   - session_time_limit enforcement   (auto force-close at limit)
 *
 * Body: {}
 * Auth: Bearer <access_token>
 * Response: { ok, session_id, started_at, already_open }
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

        const { data, error } = await supabase.rpc("fn_rg_start_session", {
            p_user_id: user.id
        });

        if (error) {
            console.warn("[rg/session/start:rpc]", error);
            // Self-exclusion blocks session start
            const status = /self[- _]?excluded/i.test(error.message) ? 403 : 500;
            return res
                .status(status)
                .json({ error: error.message, code: "rg_session_start_failed" });
        }

        return res.status(200).json(data);
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn("[rg/session/start] unhandled:", err);
        return res
            .status(500)
            .json({ error: err?.message || "unhandled failure" });
    }
}
