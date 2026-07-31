/**
 * POST /api/rg/self-exclude — Responsible Gaming self-exclusion
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 7.1.5 — Responsible-gaming limits
 *
 * Sets `responsible_gaming_limits.self_excluded_until` for the authenticated
 * user. Self-exclusion is MONOTONIC — the RPC rejects any request to shorten
 * an existing exclusion window. On success, any open RG session is
 * force-closed with reason = 'self_excluded'.
 *
 * Body: {
 *   duration?: '24h' | '7d' | '30d' | 'permanent',   // preferred
 *   until?:    ISO 8601 timestamp                    // advanced
 * }
 * Exactly one of `duration` or `until` must be supplied.
 *
 * Auth: Bearer <access_token>
 * Response: { ok, self_excluded_until, session_closed, previous_until? }
 */
import { createClient } from "../../../src/lib/supabaseServerClient";
import { rateLimit } from "../../../src/lib/apiRateLimit";
import { reportApiError } from '../../../src/lib/sentryWrap';

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

// Convert the client-friendly duration enum to an ISO timestamp.
// 'permanent' maps to year 9999 — effectively permanent without allowing NULL
// (NULL would mean "not excluded" per the schema).
function durationToUntil(duration) {
    const now = Date.now();
    switch (duration) {
        case "24h":
            return new Date(now + 24 * 3600 * 1000).toISOString();
        case "7d":
            return new Date(now + 7 * 24 * 3600 * 1000).toISOString();
        case "30d":
            return new Date(now + 30 * 24 * 3600 * 1000).toISOString();
        case "permanent":
            return "9999-12-31T23:59:59Z";
        default:
            return null;
    }
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Rate-limit: 5/hr — self-exclusion is a deliberate action, not a loop
    const rl = rateLimit(req, { max: 5, windowMs: 3600_000 });
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

        let until = body.until || null;
        if (!until && body.duration) {
            until = durationToUntil(body.duration);
            if (!until) {
                return res.status(400).json({
                    error:
                        "duration must be one of '24h', '7d', '30d', 'permanent'"
                });
            }
        }

        if (!until) {
            return res
                .status(400)
                .json({ error: "Either `duration` or `until` is required" });
        }

        const parsed = new Date(until);
        if (isNaN(parsed.getTime())) {
            return res.status(400).json({ error: "Invalid `until` timestamp" });
        }
        if (parsed.getTime() <= Date.now() + 60_000) {
            // Rejecting obvious mis-use (past / now) — the RPC's monotonic
            // guard would reject anyway, but fail fast here with a clearer 400.
            return res
                .status(400)
                .json({ error: "Self-exclusion must end in the future" });
        }

        const { data, error } = await supabase.rpc("fn_rg_self_exclude", {
            p_user_id: user.id,
            p_until: parsed.toISOString()
        });

        if (error) {
            console.warn("[rg/self-exclude:rpc]", error);
            const status = /monotonic|cannot shorten|already excluded/i.test(
                error.message
            )
                ? 403
                : 500;
            return res.status(status).json({
                error: error.message,
                code: "rg_self_exclude_failed"
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn("[rg/self-exclude] unhandled:", err);
        return res
            .status(500)
            .json({ error: err?.message || "unhandled failure" });
    }
}
