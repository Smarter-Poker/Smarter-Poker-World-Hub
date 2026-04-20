/**
 * /api/rg/limits — Responsible Gaming limits
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 7.1.5 — Responsible-gaming limits
 *
 * GET  /api/rg/limits
 *   Returns the authenticated user's current RG limits row (or null if
 *   none has been set yet).
 *
 * POST /api/rg/limits
 *   Body: {
 *     daily_deposit_limit?, weekly_deposit_limit?, monthly_deposit_limit?,
 *     daily_loss_limit?, session_time_limit_minutes?,
 *     reality_check_interval_minutes?
 *   }
 *   Any omitted field is left untouched. Semantics (enforced by
 *   fn_rg_set_limits):
 *     - Decreasing any limit applies instantly.
 *     - Increasing any limit activates a 24-hour cooling-off before the
 *       next increase can be made (limit_increase_available_at).
 *     - Values of 0 or null clear the corresponding limit.
 *
 * Auth: Bearer <access_token>
 */
import { createClient } from "../../../src/lib/supabaseServerClient";
import { LIMITS, applyRateLimit, rateLimit } from '../../../src/lib/apiRateLimit';
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

async function authenticate(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Not authenticated" });
        return null;
    }
    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabase();
    const {
        data: { user },
        error
    } = await supabase.auth.getUser(token);
    if (error || !user) {
        res.status(401).json({ error: "Invalid or expired session" });
        return null;
    }
    return { user, supabase };
}

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    try {
        const rl = rateLimit(req, { max: 30, windowMs: 60_000 });
        if (!rl.ok) {
            return res.status(429).json({
                error: "Too many requests",
                retryAfter: rl.retryAfter
            });
        }

        const auth = await authenticate(req, res);
        if (!auth) return;
        const { user, supabase } = auth;

        if (req.method === "GET") {
            const { data, error } = await supabase
                .from("responsible_gaming_limits")
                .select("*")
                .eq("user_id", user.id)
                .maybeSingle();
            if (error) {
                console.error("[rg/limits:GET]", error);
                return res.status(500).json({ error: error.message });
            }
            return res.status(200).json({ ok: true, limits: data || null });
        }

        if (req.method === "POST") {
            const body =
                typeof req.body === "string"
                    ? JSON.parse(req.body || "{}")
                    : req.body || {};

            // Look up current limits so we can compute whether this is an increase
            const { data: existing, error: existingErr } = await supabase
                .from("responsible_gaming_limits")
                .select(
                    "daily_deposit_limit, weekly_deposit_limit, monthly_deposit_limit, daily_loss_limit, session_time_limit_minutes, reality_check_interval_minutes, limit_increase_available_at"
                )
                .eq("user_id", user.id)
                .maybeSingle();
            if (existingErr) {
                console.error("[rg/limits:POST:existing]", existingErr);
                return res.status(500).json({ error: existingErr.message });
            }

            // Determine if ANY requested change is an increase. Null / 0 = no limit
            // (effectively the largest possible value). Going from a finite value
            // to "no limit" is an increase; lowering a finite value is a decrease.
            function toBound(v) {
                if (v === null || v === undefined || v === 0) return Number.POSITIVE_INFINITY;
                return Number(v);
            }
            const fields = [
                "daily_deposit_limit",
                "weekly_deposit_limit",
                "monthly_deposit_limit",
                "daily_loss_limit",
                "session_time_limit_minutes",
                "reality_check_interval_minutes"
            ];
            let isIncrease = false;
            for (const f of fields) {
                if (!(f in body)) continue;
                const oldV = toBound(existing?.[f]);
                const newV = toBound(body[f]);
                if (newV > oldV) {
                    isIncrease = true;
                    break;
                }
            }

            const { data, error } = await supabase.rpc("fn_rg_set_limits", {
                p_user_id: user.id,
                p_daily_deposit_limit: body.daily_deposit_limit ?? null,
                p_weekly_deposit_limit: body.weekly_deposit_limit ?? null,
                p_monthly_deposit_limit: body.monthly_deposit_limit ?? null,
                p_daily_loss_limit: body.daily_loss_limit ?? null,
                p_session_time_limit_minutes:
                    body.session_time_limit_minutes ?? null,
                p_reality_check_interval_minutes:
                    body.reality_check_interval_minutes ?? null,
                p_is_increase: isIncrease
            });

            if (error) {
                console.error("[rg/limits:POST:rpc]", error);
                // Cooling-off violations come through as ordinary errors
                const status = /cooling[-_ ]off/i.test(error.message) ? 403 : 500;
                return res
                    .status(status)
                    .json({ error: error.message, code: "rg_limit_update_failed" });
            }

            return res.status(200).json(data);
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("[rg/limits] unhandled:", err);
        return res
            .status(500)
            .json({ error: err?.message || "unhandled failure" });
    }
}
