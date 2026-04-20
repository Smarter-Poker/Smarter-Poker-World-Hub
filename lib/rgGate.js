/**
 * Responsible Gaming Gate Helpers
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 7.1.5 — Responsible-gaming limits
 *
 * Thin wrappers over the Supabase RPCs in the `phase7_responsible_gaming`
 * migration. Call from any API route that needs to enforce self-exclusion,
 * deposit limits, or session time limits before a user-facing action.
 *
 * All helpers throw plain Error objects with `.status` set so a Next.js
 * handler can `catch (err) { return res.status(err.status || 500).json({ error: err.message }) }`.
 *
 * Usage:
 *   import { requireNotSelfExcluded, checkDepositAllowed } from "../../../lib/rgGate";
 *   await requireNotSelfExcluded(supabase, userId);     // 403 if excluded
 *   const gate = await checkDepositAllowed(supabase, userId, amount);
 *   if (!gate.ok) return res.status(403).json(gate);
 */

function gateError(message, code = "rg_gate_failed", status = 403) {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    return err;
}

/**
 * Throws a 403 Error if the user is currently self-excluded or in cooling-off.
 * Safe to call on every seat / buy-in / tournament-register endpoint.
 */
export async function requireNotSelfExcluded(supabase, userId) {
    if (!userId) throw gateError("userId is required", "bad_request", 400);
    const { data, error } = await supabase.rpc("fn_rg_require_not_excluded", {
        p_user_id: userId
    });
    if (error) {
        const err = new Error(`RG lookup failed: ${error.message}`);
        err.status = 500;
        throw err;
    }
    if (!data?.ok) {
        throw gateError(
            data?.error || "Self-excluded",
            data?.code || "self_excluded"
        );
    }
    return true;
}

/**
 * Checks whether a proposed deposit of `amount` chips is allowed under the
 * user's daily / weekly / monthly deposit limits. Does NOT credit or debit.
 *
 * Returns { ok: boolean, error?: string, code?: string, ... }.
 * Caller is responsible for 403-ing when !ok.
 */
export async function checkDepositAllowed(supabase, userId, amount) {
    if (!userId) throw gateError("userId is required", "bad_request", 400);
    if (!amount || amount <= 0) {
        throw gateError("amount must be > 0", "bad_request", 400);
    }
    const { data, error } = await supabase.rpc("fn_rg_check_deposit", {
        p_user_id: userId,
        p_amount: amount
    });
    if (error) {
        const err = new Error(`RG deposit check failed: ${error.message}`);
        err.status = 500;
        throw err;
    }
    return data || { ok: false, error: "Empty RG response" };
}

/**
 * Returns the user's current RG state (limits + active session) for the UI.
 */
export async function getRgState(supabase, userId) {
    if (!userId) throw gateError("userId is required", "bad_request", 400);
    const { data: limits, error: lErr } = await supabase
        .from("responsible_gaming_limits")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
    if (lErr) {
        const err = new Error(`RG limits lookup failed: ${lErr.message}`);
        err.status = 500;
        throw err;
    }
    const { data: session, error: sErr } = await supabase
        .from("responsible_gaming_sessions")
        .select("*")
        .eq("user_id", userId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (sErr && sErr.code !== "PGRST116") {
        const err = new Error(`RG session lookup failed: ${sErr.message}`);
        err.status = 500;
        throw err;
    }
    return { limits: limits || null, session: session || null };
}

export default {
    requireNotSelfExcluded,
    checkDepositAllowed,
    getRgState
};
