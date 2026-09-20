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
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

import { rateLimit } from "../../../src/lib/apiRateLimit";
import { reportApiError } from '../../../src/lib/apiErrorHandler';

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
        const { user, error: authError } = await getServerUserWithFallback(req, supabase);
        if (authError || !user) {
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

        /* THE LIVE FUNCTION TAKES HOURS, NOT A TIMESTAMP (fixed 2026-09-08).
           This sent `p_until`. PostgREST resolves an overload by its ARGUMENT
           NAMES, so a wrong name is not a wrong value - it is PGRST202, "no
           function matches", a 404 dressed as a 500 by the branch below. The
           live signature is and has been
           fn_rg_self_exclude(p_user_id uuid, p_duration_hours integer), so
           SELF-EXCLUSION HAS FAILED ON EVERY CALL IT HAS EVER RECEIVED.

           That is the one request on this platform that must never fail
           quietly: a player asking to be kept out. Found by the money-door
           scanner widened in the phase 7 deep dive.

           The public API is unchanged - callers still send `duration` or
           `until` - because the conversion belongs here, not in their hands.
           Hours are rounded UP so a converted exclusion is never SHORTER than
           the one the player asked for, and 0 is the function's own encoding
           for permanent (`p_duration_hours <= 0` -> 'infinity'). */
        const permanent = String(body.duration || "").toLowerCase() === "permanent";
        const durationHours = permanent
            ? 0
            : Math.max(1, Math.ceil((parsed.getTime() - Date.now()) / 3_600_000));

        const { data, error } = await supabase.rpc("fn_rg_self_exclude", {
            p_user_id: user.id,
            p_duration_hours: durationHours
        });

        if (error) {
            console.warn("[rg/self-exclude:rpc]", error);
            return res.status(500).json({
                error: error.message,
                code: "rg_self_exclude_failed"
            });
        }

        /* A REFUSAL IS NOT A SUCCESS. The function does not raise when it
           declines to shorten an existing exclusion - it returns
           {ok:false, error:'cannot_shorten_exclusion'}, which this route used
           to hand back as HTTP 200. The error branch above tested
           `error.message` for that wording and could never have matched it. */
        if (data && data.ok === false) {
            const conflict = data.error === "cannot_shorten_exclusion";
            return res.status(conflict ? 409 : 400).json({
                ...data,
                code: data.error || "rg_self_exclude_refused"
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        console.warn("[rg/self-exclude] unhandled:", err);
        return res
            .status(500)
            .json({ error: err?.message || "unhandled failure" });
    }
}
