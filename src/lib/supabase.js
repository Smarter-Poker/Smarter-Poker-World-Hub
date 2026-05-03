// ═══════════════════════════════════════════════════════════════════════════
// THIS FILE IS NEVER EXECUTED IN PRODUCTION.
// ─────────────────────────────────────────────────────────────────────────
// next.config.js installs a webpack alias that rewrites every import of
// `src/lib/supabase.js` → `src/lib/supabase.ts` (the real client).
//
// Why this stub exists:
//   1. Some files import with the explicit `.js` extension (e.g.
//      decision-bridge.js does `from './supabase.js'`). Without the alias
//      those imports resolve here, not to the .ts client.
//   2. The previous content tried to re-export from
//      `@smarter-poker/commander-shared/lib/supabase`, which DOES NOT EXIST
//      in that package (verified 2026-05-03 via require.resolve). The build
//      only succeeded because the webpack alias intercepts before resolution.
//      That made the whole supabase wiring depend on the alias staying in
//      place. If anyone ever removed it, every supabase consumer in the app
//      would crash — silently in some build modes, loudly at runtime.
//
// Defense-in-depth: throw a clear error if this code is ever actually
// executed. That can only happen if the webpack alias is removed or if
// someone runs the file outside webpack (jest, ts-node, a quick repro
// script). The error message tells them exactly what went wrong instead
// of leaving them to debug "Cannot find module commander-shared/...".
// ═══════════════════════════════════════════════════════════════════════════

const FAIL = () => {
    throw new Error(
        '[supabase.js] This stub should never execute. ' +
        'next.config.js webpack alias must rewrite imports of src/lib/supabase.js → src/lib/supabase.ts. ' +
        'If you see this error: (1) verify next.config.js still contains the supabase.js → supabase.ts alias, ' +
        '(2) for non-webpack tools (jest, ts-node), import src/lib/supabase.ts directly. ' +
        'See src/lib/supabase.js source for the full backstory.'
    );
};

export const supabase = new Proxy({}, { get: FAIL, set: FAIL });
export default supabase;
