/**
 * GET /api/kyc/status
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 7.1.4 — Identity & KYC stub
 *
 * Returns the current KYC + age-gate state for the authenticated user.
 * Used by the client to decide whether to show the KYC prompt, the age
 * gate, or neither.
 *
 * Auth: Bearer <access_token>
 * Response: {
 *   kyc_status,               // NONE | PENDING | APPROVED | REJECTED | EXPIRED
 *   kyc_provider,
 *   kyc_completed_at,
 *   kyc_rejection_reason,
 *   age_verified,
 *   age_verified_at,
 *   jurisdiction_country,
 *   // Derived flags
 *   can_play_money,           // age_verified
 *   can_real_money            // kyc_status === 'APPROVED'
 * }
 */
import { createClient } from "../../../src/lib/supabaseServerClient";
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

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

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
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

        const { data, error } = await supabase
            .from("profiles")
            .select(
                "kyc_status, kyc_provider, kyc_completed_at, kyc_rejection_reason, age_verified, age_verified_at, jurisdiction_country"
            )
            .eq("id", user.id)
            .maybeSingle();

        if (error) {
            console.warn("[kyc/status] select error:", error);
            return res.status(500).json({ error: 'Internal server error' });
        }

        return res.status(200).json({
            ...data,
            can_play_money: !!data?.age_verified,
            can_real_money: data?.kyc_status === "APPROVED"
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn("[kyc/status] unhandled:", err);
        return res
            .status(500)
            .json({ error: err?.message || "unhandled failure" });
    }
}
