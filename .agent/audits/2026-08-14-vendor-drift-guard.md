# Vendor Drift Guard — CI static gate for the vendoring-drift bug class

Date: 2026-08-14
Author: Cowork agent (continuation of the auth-hardening arc)
Scope: World Hub repo (CI + new script). Same script is portable to the
commander repo unchanged (it auto-discovers overrides from the tree).

## Why this exists

Three separate production incidents in one week (Aug 2026) shared a single
root cause: the vendored package `@smarter-poker/commander-shared` drifting
from the way the app actually loads it. None of the three threw. None failed
the build. All shipped green and broke in production.

1. **CJS-under-ESM zero-exports.** The vendor package is `"type": "module"`.
   A file inside it written with `module.exports` / `require()` is parsed as
   ESM, so those tokens reference undefined CommonJS globals and the module
   exports *nothing*. Every `import { parseBlindStructure }` from it silently
   resolved to `undefined` at runtime. Hit `parseBlindStructure.js` AND
   `home-games/rpcBridge.js`.

2. **Override bypass.** Several `src/` files are REAL local overrides that fix
   a bug in the vendored twin — `apiRateLimit.js` (the shared version parsed a
   spoofable `x-forwarded-for` and sliced JWT *header* bytes as the identity),
   the supabase client, `authUtils.js`. When a caller imports the vendor path
   directly (`@smarter-poker/commander-shared/lib/apiRateLimit`) instead of the
   local override, it silently runs the UNFIXED code. This is how the
   mock-supabase-client and forgeable-vendor-auth bugs reached production.

Nothing in the repo compared these, so the drift was invisible.

## What was added

`scripts/check-vendor-drift.mjs` — dependency-free (no `npm install`; the
Build Safety Gate job doesn't install), pure Node 18+ static analysis. Two
checks:

- **CHECK A (CJS-under-ESM):** scans `vendor/commander-shared/src/**/*.js`
  (only when the package is `"type":"module"`) for real `module.exports`,
  `exports.<name> =`, or `require(` tokens. A comment/string blanker preserves
  line numbers and string *delimiters* while erasing comment and string
  *bodies*, so the same tokens appearing inside a comment or a string literal
  do NOT false-positive. Verified: a comment saying "previously used
  module.exports" and a string literal containing `require(` both pass clean.

- **CHECK B (override bypass):** discovers every `src/` file that shadows a
  vendor twin and is NOT a pure re-export shim (a shim is a file whose entire
  body is `export * from '…'` / `export { … } from '…'` — interchangeable with
  the vendor path, so nothing to bypass). For each such real override it flags
  any file that imports the vendor path directly instead of the local override.
  The override file itself is exempt (a real override legitimately pulls a
  constant or two from the vendor — e.g. `apiRateLimit.js` imports `LIMITS`).

Real overrides currently detected in World Hub: `src/lib/apiRateLimit.js`,
`src/lib/supabase.js`, `src/lib/authUtils.js`, `src/lib/home-games/rpcBridge.js`.

Wired into `.github/workflows/build-safety-gate.yml` as **CHECK 14**, placed
with the other dependency-free static checks (after CHECK 12), no secrets.

## Verification (all run locally against the current tree)

- Clean tree → PASS, exit 0.
- Inject historical CJS pattern (`require()`+`module.exports`) into
  `vendor/.../parseBlindStructure.js` → FAIL, exit 1, names the file:line.
- Inject a direct vendor import of `lib/apiRateLimit` + `lib/supabase` from a
  new API route → FAIL, exit 1, names both and points at the override to use.
- Control: importing a pure shim (`lib/sentryWrap`) directly → PASS (correctly
  not flagged).
- Control: a string literal / comment containing `module.exports` and
  `require(` → PASS (no false positive).
- Tree returned pristine after every fixture (verified `git status`).

## Rollout result (same day)

World Hub: pushed as 80b6e5b8 (script + audit) and 50c7cd68 (CHECK 14 in the
gate). Blob-sha-verified byte-exact after push. Build Safety Gate GREEN on
both commits with CHECK 14 executing; production /api/health served 50c7cd68.

Commander (smarter-poker-commander): the byte-identical script was pushed as
891c01eb with a matching gate step in ci.yml — and the guard's FIRST run went
red on a real finding: `pages/commander/dashboard.js` imported
`@smarter-poker/commander-shared/lib/commander/auth` directly, bypassing the
hardened `src/lib/commander/auth.js` override (the exact
forgeable-vendor-auth pattern this guard exists to block). The bypass was
deliberate, justified by a 2026-07-25 note calling the override "server-only
(uses node crypto)" — a rationale the 2026-08-07 session-signing hardening
made obsolete, since the vendor module now imports node crypto too. Fixed in
82288da3 by importing via the override (which re-exports the symbol, so zero
behavior change today — but the page now follows any future localization of
the fix).

Observability side-quest: commander is a PRIVATE repo, so its Actions results
are invisible to the MCP tooling (no unauthenticated API, no browser session).
Ported World Hub's create-issue-on-failure job into commander's ci.yml
(038d3061), then extended it to embed the drift guard's output and per-step
failure status in the ISSUE BODY (209c493a — bodies are MCP-readable,
comments are not). That channel is what surfaced the dashboard.js violation
verbatim. Standing benefit: commander CI failures on main now self-report
into a `ci-failure` issue with enough detail to diagnose without log access.

## Follow-ups

- Deferred from the prior phase (unrelated): drop the now-NULL
  `commander_staff.pin_code` column (rollback-shim cleanup).
