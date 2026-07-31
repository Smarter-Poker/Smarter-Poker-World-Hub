/**
 * POST /api/account/delete-gdpr — GDPR Right-to-Erasure endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 6.1.10 — GDPR deletion path (self-serve)
 *
 * Two-stage deletion:
 *   1. `fn_delete_user_gdpr(user_id, requested_by, reason)` — SECURITY DEFINER
 *      RPC that:
 *        • authorises the caller (self or platform admin),
 *        • inserts a `gdpr_deletion_requests` row (status = 'pending'),
 *        • NULLs auth.users FK references across ~25 no-action/set-null
 *          tables (audit logs, chat, tournaments, unions, etc.),
 *        • anonymises the `profiles` row (display_name = 'Deleted User',
 *          email/avatar/bio/phone NULLed),
 *        • marks the request 'anonymized' and logs via fn_log_admin_action.
 *   2. `supabase.auth.admin.deleteUser(user.id)` — cascades all remaining
 *      FKs that point at auth.users with ON DELETE CASCADE.
 *   3. `fn_mark_gdpr_completed(request_id)` — flips the request to
 *      'completed'.
 *
 * Any failure in step 2 leaves the request in 'anonymized' — the PII is
 * already gone from the public schema, and the auth-user row can be deleted
 * manually from the Supabase dashboard.
 *
 * Body: { confirm: true, reason?: string }
 * Auth: Bearer <access_token>
 * Response: { ok, request_id, summary }
 *
 * Rate limit: 2/day per user — this is a one-way action.
 */
import { createClient } from "../../../src/lib/supabaseServerClient";
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

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
        _supabase = createClient(url, key, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        });
    }
    return _supabase;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    // Rate-limit: 2/day per IP — this is an intentional, one-way action
    const rl = rateLimit(req, { max: 2, windowMs: 24 * 3600_000 });
    if (!rl.ok) {
        return res
            .status(429)
            .json({ success: false, error: "Too many requests", retryAfter: rl.retryAfter });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    try {
        const token = authHeader.replace("Bearer ", "");
        const supabase = getSupabase();

        // Authenticate the caller
        const { user, error: authError } = await getServerUserWithFallback(req, supabase);
        if (authError || !user) {
            return res
                .status(401)
                .json({ success: false, error: "Invalid or expired session" });
        }

        const body =
            typeof req.body === "string"
                ? JSON.parse(req.body || "{}")
                : req.body || {};

        // Explicit confirmation is mandatory — GDPR deletion is irreversible
        if (body.confirm !== true) {
            return res.status(400).json({
                success: false,
                error:
                    "GDPR account deletion is permanent and irreversible. Send { confirm: true } to proceed.",
            });
        }

        const reason =
            typeof body.reason === "string" && body.reason.trim()
                ? body.reason.trim().slice(0, 500)
                : null;

        // ─────────────────────────────────────────────────────────────
        // STAGE 1 — Call the SECURITY DEFINER RPC to anonymise the
        //           public schema and create the deletion request row.
        // ─────────────────────────────────────────────────────────────
        const { data: stage1, error: stage1Err } = await supabase.rpc(
            "fn_delete_user_gdpr",
            {
                p_user_id: user.id,
                p_requested_by: user.id,
                p_reason: reason,
            }
        );

        if (stage1Err) {
            console.warn("[GDPR] fn_delete_user_gdpr failed:", stage1Err);
            return res.status(500).json({
                success: false,
                error:
                    stage1Err.message ||
                    "Failed to anonymise account — no changes made.",
            });
        }

        // The RPC returns a jsonb summary. It also returns { status: 'failed', ... }
        // when its own EXCEPTION block traps an error — treat that as a failure.
        const summary = stage1 || {};
        if (summary.status && summary.status !== "anonymized") {
            return res.status(500).json({
                success: false,
                error: summary.error || "Anonymisation failed.",
                summary,
            });
        }

        const requestId = summary.request_id || null;

        // ─────────────────────────────────────────────────────────────
        // STAGE 2 — Delete the auth.users row. This cascades every
        //           FK still pointing at auth.users(id).
        // ─────────────────────────────────────────────────────────────
        let authDeleted = false;
        let authDeleteError = null;
        try {
            const { error: delErr } = await supabase.auth.admin.deleteUser(
                user.id
            );
            if (delErr) {
                authDeleteError = delErr.message || String(delErr);
            } else {
                authDeleted = true;
            }
        } catch (err) {
            authDeleteError = err?.message || String(err);
        }

        // ─────────────────────────────────────────────────────────────
        // STAGE 3 — Finalise the request row.
        // ─────────────────────────────────────────────────────────────
        if (authDeleted && requestId) {
            try {
                // RPC returns {data, error}; the previous code ignored the
                // error half so a real RPC failure left the gdpr_request row
                // in 'pending' state forever — compliance audit gap. Capture
                // and log loudly so ops can reconcile.
                const { error: markErr } = await supabase.rpc("fn_mark_gdpr_completed", {
                    p_request_id: requestId,
                });
                if (markErr) {
                    console.warn(
                        "[GDPR] fn_mark_gdpr_completed RPC error — request",
                        requestId,
                        "stays 'pending' but auth user IS deleted:",
                        markErr?.message || markErr
                    );
                }
            } catch (markErr) {
                console.warn(
                    "[GDPR] fn_mark_gdpr_completed threw (non-fatal):",
                    markErr?.message || markErr
                );
            }
        }

        if (!authDeleted) {
            // Public-schema anonymisation succeeded; only the auth.users
            // row remains. The request row is left in 'anonymized' so an
            // operator can finish deletion from the dashboard.
            return res.status(207).json({
                success: true,
                partial: true,
                request_id: requestId,
                anonymised: true,
                auth_deleted: false,
                auth_error: authDeleteError,
                summary,
                message:
                    "Your personal data has been anonymised. Final auth-user deletion requires operator follow-up.",
            });
        }

        return res.status(200).json({
            success: true,
            request_id: requestId,
            anonymised: true,
            auth_deleted: true,
            summary,
            message: "Your account has been deleted in accordance with GDPR.",
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn("[GDPR delete] unexpected error:", err);
        if (!res.headersSent) {
            return res
                .status(500)
                .json({ success: false, error: err.message || "Internal server error" });
        }
    }
}
