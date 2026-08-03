/**
 * 🛟 AWARD GUARD — fail-safe wrapper around public.award_diamonds_v2
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 *   19 API routes call `supabase.rpc('award_diamonds_v2', ...)`. That function
 *   is created by
 *
 *     supabase/migrations/20260726120000_diamond_rewards_v2_security_and_caps.sql
 *
 *   If that migration has NOT been applied to the target database, every one of
 *   those calls comes back as Postgres 42883 ("function ... does not exist") —
 *   or, through PostgREST, as PGRST202 ("Could not find the function ... in the
 *   schema cache"). Unwrapped, that turns a deploy into a wall of HTTP 500s on
 *   every reward endpoint on the site.
 *
 * WHAT THIS DOES
 *   Detects exactly that condition and reports it as data (`migrationMissing`)
 *   rather than as an exception, so callers can answer 200 with a calm
 *   "temporarily unavailable" instead of 500-ing. It NEVER throws.
 *
 * WHAT THIS DOES NOT DO
 *   It does not swallow real award failures. A genuine RPC error (permissions,
 *   timeout, constraint) comes back with ok:false and migrationMissing:false so
 *   the caller keeps its existing 500 behaviour.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Machine-readable marker for "the v2 rewards migration was never applied". */
export const MIGRATION_MISSING = 'REWARDS_MIGRATION_NOT_APPLIED';

/** The migration that creates award_diamonds_v2. Named in the log on purpose. */
export const MIGRATION_FILE =
    'supabase/migrations/20260726120000_diamond_rewards_v2_security_and_caps.sql';

const AWARD_FN = 'award_diamonds_v2';

/** Flatten every string-ish field an error might carry, from any layer. */
function errorText(error) {
    if (!error) return '';
    if (typeof error === 'string') return error;
    return [
        error.message,
        error.details,
        error.hint,
        error.error_description,
        error.error,
        error.msg
    ]
        .filter((v) => typeof v === 'string' && v.length > 0)
        .join(' | ');
}

/**
 * True when Postgres/PostgREST is telling us the award function does not exist.
 *
 * Covers all three shapes we can actually receive:
 *   • Postgres SQLSTATE 42883 — undefined_function
 *   • PostgREST 'PGRST202'    — function missing from the schema cache
 *   • the raw message text    — /function .* does not exist/i, plus the
 *     PostgREST wording "Could not find the function ... in the schema cache"
 *
 * Never throws, whatever it is handed (null, string, Error, PostgrestError).
 */
export function isMissingAwardFn(error) {
    if (!error) return false;

    try {
        const code = error && error.code !== undefined && error.code !== null
            ? String(error.code).trim()
            : '';
        if (code === '42883' || code.toUpperCase() === 'PGRST202') return true;

        const text = errorText(error);
        if (!text) return false;

        // Postgres: 'function public.award_diamonds_v2(...) does not exist'
        if (/function\s[\s\S]*does not exist/i.test(text)) return true;
        // PostgREST: 'Could not find the function public.award_diamonds_v2(...)
        //             in the schema cache'
        if (/could not find the function/i.test(text)) return true;
        // Belt and braces: the SQLSTATE sometimes only appears inline.
        if (/\b42883\b/.test(text) || /\bPGRST202\b/i.test(text)) return true;

        return false;
    } catch (_e) {
        return false;
    }
}

/** ONE loud line, naming the migration, so the cause is obvious in Vercel. */
function logMigrationMissing(params, error) {
    const actionKey = (params && (params.p_action_key || params.actionKey)) || 'unknown';
    console.error(
        `🚨 [${MIGRATION_MISSING}] public.${AWARD_FN}() does not exist in this database — ` +
        `every diamond reward is DOWN. Apply the migration: ${MIGRATION_FILE}. ` +
        `(action_key=${actionKey}; db said: ${errorText(error) || 'no message'})`
    );
}

/**
 * Call public.award_diamonds_v2 without ever throwing.
 *
 * @param {object} supabase  service-role Supabase client (the fn is service_role only)
 * @param {object} params    RPC params, already in p_* form:
 *                           { p_user_id, p_action_key, p_reference_id, p_target_id, p_metadata }
 * @returns {Promise<{ok: boolean, data: any, migrationMissing: boolean, error: any}>}
 *          ok:true               → `data` is the function's jsonb verdict
 *          migrationMissing:true → the migration has not been applied; the caller
 *                                  should answer 200 "temporarily unavailable",
 *                                  NOT 500, and must roll back anything it wrote
 *                                  in anticipation of the award.
 */
export async function safeAward(supabase, params) {
    const rpcParams = params || {};

    if (!supabase || typeof supabase.rpc !== 'function') {
        return {
            ok: false,
            data: null,
            migrationMissing: false,
            error: { message: 'Supabase client unavailable' }
        };
    }

    try {
        const { data, error } = await supabase.rpc(AWARD_FN, rpcParams);

        if (error) {
            if (isMissingAwardFn(error)) {
                logMigrationMissing(rpcParams, error);
                return { ok: false, data: null, migrationMissing: true, error };
            }
            return { ok: false, data: null, migrationMissing: false, error };
        }

        return {
            ok: true,
            data: typeof data === 'string' ? safeParse(data) : (data === undefined ? null : data),
            migrationMissing: false,
            error: null
        };
    } catch (err) {
        // A thrown error is still an error — classify it the same way.
        if (isMissingAwardFn(err)) {
            logMigrationMissing(rpcParams, err);
            return { ok: false, data: null, migrationMissing: true, error: err };
        }
        return { ok: false, data: null, migrationMissing: false, error: err };
    }
}

/** Supabase returns jsonb as an object, but be defensive about strings. */
function safeParse(value) {
    try {
        return JSON.parse(value);
    } catch (_e) {
        return null;
    }
}

export default { MIGRATION_MISSING, MIGRATION_FILE, isMissingAwardFn, safeAward };
