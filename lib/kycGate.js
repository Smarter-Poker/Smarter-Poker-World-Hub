/**
 * KYC Gate Helpers
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 7.1.4 — Identity & KYC stub
 *
 * Call from any API route that must block action on users who have not
 * passed the appropriate gate. For play-money launch, only
 * `requireAgeVerified` is meaningfully enforced; `requireKycApproved`
 * is wired for post-launch real-money deposits.
 *
 * Both helpers throw a plain Error with `.status` set to 403 on failure
 * so a Next.js handler can `catch (err) { return res.status(err.status || 500).json({error: err.message}) }`.
 *
 * Usage:
 *   import { requireAgeVerified, requireKycApproved } from "../../../lib/kycGate";
 *   await requireAgeVerified(supabase, userId);
 *   // ... proceed with play-money action
 *
 *   await requireKycApproved(supabase, userId);
 *   // ... proceed with real-money action (post-launch)
 */

function gateError(message, code = "kyc_gate_failed") {
    const err = new Error(message);
    err.status = 403;
    err.code = code;
    return err;
}

/**
 * Throws a 403 Error unless the user has age_verified = true.
 * Used for play-money launch gating (and as a precondition to KYC itself).
 */
export async function requireAgeVerified(supabase, userId) {
    if (!userId) throw gateError("userId is required", "bad_request");
    const { data, error } = await supabase
        .from("profiles")
        .select("age_verified")
        .eq("id", userId)
        .maybeSingle();
    if (error) {
        const err = new Error(`Profile lookup failed: ${error.message}`);
        err.status = 500;
        throw err;
    }
    if (!data) {
        throw gateError("Profile not found", "profile_not_found");
    }
    if (!data.age_verified) {
        throw gateError("Age verification required", "age_not_verified");
    }
    return true;
}

/**
 * Throws a 403 Error unless the user has kyc_status = 'APPROVED'.
 * Used for real-money deposit / cashout gating.
 */
export async function requireKycApproved(supabase, userId) {
    if (!userId) throw gateError("userId is required", "bad_request");
    const { data, error } = await supabase
        .from("profiles")
        .select("kyc_status, age_verified")
        .eq("id", userId)
        .maybeSingle();
    if (error) {
        const err = new Error(`Profile lookup failed: ${error.message}`);
        err.status = 500;
        throw err;
    }
    if (!data) {
        throw gateError("Profile not found", "profile_not_found");
    }
    if (data.kyc_status !== "APPROVED") {
        throw gateError(
            `KYC not approved (status=${data.kyc_status || "NONE"})`,
            "kyc_not_approved"
        );
    }
    if (!data.age_verified) {
        // Belt-and-suspenders: APPROVED should never be granted without age verification.
        throw gateError("Age verification required", "age_not_verified");
    }
    return true;
}

/**
 * Returns { can_play_money, can_real_money, kyc_status, age_verified } for UI.
 */
export async function getKycState(supabase, userId) {
    if (!userId) throw gateError("userId is required", "bad_request");
    const { data, error } = await supabase
        .from("profiles")
        .select(
            "kyc_status, kyc_completed_at, kyc_rejection_reason, age_verified, jurisdiction_country"
        )
        .eq("id", userId)
        .maybeSingle();
    if (error) {
        const err = new Error(`Profile lookup failed: ${error.message}`);
        err.status = 500;
        throw err;
    }
    // Profile may not exist yet (brand-new account) — return a permissive
    // "neither verified nor approved" shape instead of throwing, so UI can
    // route the user into the age-verification flow.
    if (!data) {
        return {
            kyc_status: null,
            kyc_completed_at: null,
            kyc_rejection_reason: null,
            age_verified: false,
            jurisdiction_country: null,
            can_play_money: false,
            can_real_money: false
        };
    }
    return {
        ...data,
        can_play_money: !!data.age_verified,
        can_real_money: data.kyc_status === "APPROVED"
    };
}

export default { requireAgeVerified, requireKycApproved, getKycState };
