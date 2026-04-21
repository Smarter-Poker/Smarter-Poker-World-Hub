/**
 * POST /api/admin/users/delete-gdpr — Admin-initiated GDPR erasure
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 6.1.10 — Admin helper that deletes another user's account under GDPR
 * right-to-erasure. Only platform admins (role ∈ 'admin'|'superadmin'|'god')
 * may call this endpoint; the `fn_delete_user_gdpr` RPC enforces the same
 * check server-side regardless.
 *
 * Body: { user_id: uuid, reason: string, confirm: true }
 * Auth: Bearer <access_token> of a platform admin
 * Response: { ok, request_id, summary, auth_deleted }
 */
import { createClient } from "../../../../src/lib/supabaseServerClient";
import { requireRecentMfa } from "../../../../src/lib/mfaGate";
import { reportApiError } from '../../../../src/lib/sentryWrap';
const {
    logAdminAction,
} = require("../../../../src/lib/antiAbuse");

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
        return res
            .status(405)
            .json({ success: false, error: "Method not allowed" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res
            .status(401)
            .json({ success: false, error: "Not authenticated" });
    }

    try {
        const token = authHeader.replace("Bearer ", "");
        const supabase = getSupabase();

        const {
            data: { user: admin },
            error: authError,
        } = await supabase.auth.getUser(token);
        if (authError || !admin) {
            return res
                .status(401)
                .json({ success: false, error: "Invalid or expired session" });
        }

        const { data: adminProfile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", admin.id)
            .maybeSingle();

        const adminRole = adminProfile?.role || null;
        if (!["admin", "superadmin", "god"].includes(adminRole)) {
            return res
                .status(403)
                .json({
                    success: false,
                    error: "Platform admin role required.",
                });
        }

        // ── [Phase 6.1.27] Step-up MFA gate ─────────────────────────────
        // Admin-driven GDPR erasure is the highest-impact admin action on
        // the platform — irrecoverable deletion of another user's entire
        // data footprint. Require a fresh (within-5-min) MFA confirmation
        // on top of the base admin-route MFA gate in middleware.ts.
        {
            const gate = await requireRecentMfa(req, supabase, admin);
            if (!gate.ok) {
                return res.status(gate.status || 403).json({
                    success: false,
                    error: gate.reason || "Step-up confirmation required",
                    requiresMfa: true,
                    requiresStepUp: gate.requiresStepUp === true,
                    requiresEnrollment: gate.requiresEnrollment === true,
                    maxAgeSec: gate.maxAgeSec,
                });
            }
        }

        const body =
            typeof req.body === "string"
                ? JSON.parse(req.body || "{}")
                : req.body || {};

        const targetUserId = body.user_id;
        const reason =
            typeof body.reason === "string" && body.reason.trim()
                ? body.reason.trim().slice(0, 500)
                : null;

        if (!targetUserId) {
            return res
                .status(400)
                .json({ success: false, error: "user_id is required" });
        }
        if (!reason) {
            return res
                .status(400)
                .json({
                    success: false,
                    error: "reason is required (audit trail)",
                });
        }
        if (body.confirm !== true) {
            return res
                .status(400)
                .json({
                    success: false,
                    error:
                        "Admin GDPR deletion is irreversible. Send { confirm: true } to proceed.",
                });
        }

        // Stage 1 — anonymise public schema
        const { data: stage1, error: stage1Err } = await supabase.rpc(
            "fn_delete_user_gdpr",
            {
                p_user_id: targetUserId,
                p_requested_by: admin.id,
                p_reason: reason,
            }
        );

        if (stage1Err) {
            console.error("[GDPR admin] stage1 failed:", stage1Err);
            return res.status(500).json({
                success: false,
                error: stage1Err.message || "Anonymisation RPC failed",
            });
        }

        const summary = stage1 || {};
        if (summary.status && summary.status !== "anonymized") {
            return res.status(500).json({
                success: false,
                error: summary.error || "Anonymisation failed.",
                summary,
            });
        }

        const requestId = summary.request_id || null;

        // Stage 2 — delete auth.users row (cascades)
        let authDeleted = false;
        let authDeleteError = null;
        try {
            const { error: delErr } = await supabase.auth.admin.deleteUser(
                targetUserId
            );
            if (delErr) authDeleteError = delErr.message || String(delErr);
            else authDeleted = true;
        } catch (err) {
            authDeleteError = err?.message || String(err);
        }

        // Stage 3 — mark completed
        if (authDeleted && requestId) {
            try {
                await supabase.rpc("fn_mark_gdpr_completed", {
                    p_request_id: requestId,
                });
            } catch (markErr) {
                console.warn(
                    "[GDPR admin] fn_mark_gdpr_completed failed:",
                    markErr?.message || markErr
                );
            }
        }

        // Audit trail on the admin_audit_log (separate from the RPC's own log)
        await logAdminAction(supabase, {
            admin_user_id: admin.id,
            action: authDeleted
                ? "gdpr.user_deleted"
                : "gdpr.user_anonymized",
            target_type: "auth.user",
            target_id: targetUserId,
            details: {
                reason,
                request_id: requestId,
                auth_deleted: authDeleted,
                auth_error: authDeleteError,
            },
            after: summary,
            req,
        });

        return res.status(authDeleted ? 200 : 207).json({
            success: true,
            partial: !authDeleted,
            request_id: requestId,
            auth_deleted: authDeleted,
            auth_error: authDeleteError,
            summary,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.error("[GDPR admin] unexpected:", err);
        if (!res.headersSent) {
            return res
                .status(500)
                .json({ success: false, error: err.message || "Internal server error" });
        }
    }
}
