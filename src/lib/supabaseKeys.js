/**
 * SUPABASE API KEY RESOLUTION
 * ---------------------------------------------------------------------------
 * 2026-08-16 00:38:16 UTC: the legacy JWT API keys (`anon`, `service_role`)
 * were disabled on project kuklfnapbkmacvwxktbh. Every request carrying one
 * now comes back:
 *
 *     {"message":"Legacy API keys are disabled",
 *      "hint":"...disabled on 2026-08-16T00:38:16.61147+00:00. Re-enable them
 *              in the Supabase dashboard, or use the new publishable/secret keys."}
 *
 * Production went `degraded` at that moment: /api/health's db check errored and
 * public routes such as /api/poker/live-tables returned "Database query failed",
 * while the site itself still served HTTP 200. A site that loads but cannot
 * read is the worst shape of outage to diagnose, because nothing looks down.
 *
 * WHY A HARDCODED KEY IS ACCEPTABLE HERE, AND ONLY HERE
 *
 * `src/lib/authUtils.js` already carried a hardcoded anon key as a fallback.
 * That is defensible for THIS class of key and no other: a publishable (or
 * legacy anon) key is compiled into the browser bundle by design and is public
 * the moment the site is served. It confers exactly the privileges RLS grants
 * an anonymous visitor.
 *
 * What was NOT defensible is that the hardcoded value was a key that no longer
 * works, so the "fallback for production stability" was a fallback to a
 * guaranteed failure. Rotating the key in Supabase could never have fixed the
 * app while source held a dead literal.
 *
 * The SECRET key (server-side, formerly `service_role`) is a different animal
 * and is never hardcoded, never logged, and never read by this module. It has
 * to come from the environment, and restoring it is a dashboard action.
 *
 * RESOLUTION ORDER
 *
 *   1. The configured value, whenever it is not a known-disabled legacy JWT.
 *      This is the normal path and it keeps working through future rotations:
 *      a rotated publishable key lands in the env var and is used verbatim.
 *   2. Otherwise the publishable fallback below, because a legacy-format key
 *      on this project is not "possibly stale" -- it is known non-functional.
 *
 * Substituting in case 2 is safe under either recovery path. If the new keys
 * are adopted, the env var stops being legacy-format and case 1 takes over. If
 * legacy keys are instead re-enabled in the dashboard, the publishable key
 * still works -- publishable and legacy keys are valid concurrently.
 *
 * REMOVE THE FALLBACK once NEXT_PUBLIC_SUPABASE_ANON_KEY holds a publishable
 * key in every environment. It exists to survive one specific outage, not to
 * become the configuration.
 */

/**
 * Publishable key for kuklfnapbkmacvwxktbh, verified against the live REST API
 * on 2026-08-16 (HTTP 200 on /rest/v1/training_progress while the legacy anon
 * key returned "Legacy API keys are disabled" on the same request).
 */
export const SUPABASE_PUBLISHABLE_FALLBACK = 'sb_publishable__41LpJpzrfrb3hSUpEaYCA_tF53bBJx';

/** The project URL, unchanged by the key migration. */
export const SUPABASE_URL_FALLBACK = 'https://kuklfnapbkmacvwxktbh.supabase.co';

/**
 * Is this a legacy JWT-format API key (the disabled `anon` / `service_role`
 * shape) rather than a modern `sb_publishable_` / `sb_secret_` key?
 *
 * Matched on structure, not on the specific key, so a legacy key from any
 * project or era is recognised. Three dot-separated base64url segments with
 * the `eyJ` header prefix is a JWT and nothing else is.
 */
export function isLegacyJwtKey(key) {
    const k = String(key || '').trim();
    return /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k);
}

/** Is this one of the modern key formats? */
export function isModernKey(key) {
    return /^sb_(publishable|secret)_/.test(String(key || '').trim());
}

/**
 * Resolve the browser-facing Supabase key.
 *
 * @param {string|undefined} configured  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
 * @returns {{key: string, source: 'env'|'fallback-legacy'|'fallback-missing'}}
 *
 * `.trim()` is load-bearing and must stay: the Vercel production values for
 * several NEXT_PUBLIC_* vars carry a literal trailing newline (visible via
 * `vercel env pull`), and a newline inside an `apikey` header throws
 * "Invalid header value" rather than returning a clean 401.
 */
export function resolveAnonKey(configured) {
    const k = String(configured || '').trim();
    if (!k) return { key: SUPABASE_PUBLISHABLE_FALLBACK, source: 'fallback-missing' };
    if (isLegacyJwtKey(k)) return { key: SUPABASE_PUBLISHABLE_FALLBACK, source: 'fallback-legacy' };
    return { key: k, source: 'env' };
}

/**
 * One-line explanation of a resolution, for a startup warning. Returns null
 * when the configured value was used, so the healthy path stays silent.
 */
export function anonKeyWarning(source) {
    if (source === 'fallback-legacy') {
        return '[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY holds a LEGACY JWT key, which was '
            + 'disabled on this project 2026-08-16. Falling back to the publishable key so the '
            + 'client keeps working. Update the env var to the sb_publishable_ key and redeploy.';
    }
    if (source === 'fallback-missing') {
        return '[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Using the publishable '
            + 'fallback. Set the env var and redeploy.';
    }
    return null;
}
