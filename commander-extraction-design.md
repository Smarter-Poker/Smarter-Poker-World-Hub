# Commander Extraction Design — Phase 3.1

**Document status:** Draft 1 for Dan's review
**Source plan:** `~/Documents/smarter-poker-optimization-plan.md` §Phase 3, step 3.1 (line 344)
**Target repo name:** `smarter-poker-commander`
**Hosting (locked):** Vercel (new project), URL preserved via rewrites per locked decision #5/#6
**Date:** 2026-04-24

---

## Why extract

Commander is the largest single subsystem in the World Hub monolith:

- **14 frontend routes** under `pages/commander/`:
  root, admin, check-in, dealer, displays, docs, members, player, reports,
  table, tablet, td, tournaments, waitlist (+ ~91 sub-page files = 105 total)
- **246 API files** under `pages/api/commander/` across 30+ subdirectories
- **~99,500 LOC** combined (measured 2026-04-24)
- World Hub has 716+ total API routes. Commander is ~35% of them.

Phase 3 target from plan Success Metrics table: reduce World Hub API count
to ~430, build time <10 min. Commander's removal is ~250 routes of that
286-route reduction.

---

## What stays, what moves

### Moves to new `smarter-poker-commander` repo

- All of `pages/commander/*` (105 files)
- All of `pages/api/commander/*` (246 files)
- `src/components/commander/*` (admin, modals, shared sub-packages)
- `src/lib/commander/*` (17 files, 3,357 LOC — see shared-package table below)
- Commander-specific schemas (`commander_*` tables) — no DB migration, same
  Supabase project, just the app boundary moves
- Commander-specific Sentry DSN (separate project for cleaner error dashboards)

### Stays in World Hub

- Auth machinery (`middleware.ts`, Supabase SSR cookies)
- Shared UI (`src/components/ui/*`, `src/components/seo/*`)
- `src/engine/*` — poker engine code used by training AND commander
- `src/hooks/use*` — generic React hooks
- `src/lib/supabase` — already shared via imports
- `src/lib/sentry` — wrapper, not commander-specific
- `src/lib/api` — generic API utilities

### Duplicated into both (no single-source-of-truth refactor)

Per plan line 366: *"duplicate, extract to shared package, or refactor out."*
Duplication is the cheapest option for small utilities that rarely change:

- `src/lib/supabase.js` — 1 file, ~60 LOC. Copy.
- `src/lib/sentryWrap.js` — 1 file, copy.
- Generic utility formatters used in both.

### Extracted to shared package `@smarter-poker/commander-shared`

For things that are genuinely shared between World Hub (e.g., the player
hub's view of a commander check-in) and Commander itself. Plan step 3.3
(line 390) calls this out as the "boring but protective" step.

Candidates — everything in `src/lib/commander/` that IS imported from
World Hub (non-commander) pages:

| File | LOC | Used outside commander? |
|---|---|---|
| `formatters.js` | 29 | Yes — player pages show club stats |
| `colorUtils.js` | 32 | Yes — theming |
| `tierConfig.js` | 340 | Yes — subscription tier display |
| `pushNotifications.js` | 367 | Yes — shared with `notifications/send` |
| `twilio.js` | 226 | Yes — World Hub crons + Commander both |
| `auth.js` | 594 | Maybe — needs audit; if yes, shared package |
| `errorMonitoring.js` | 206 | Maybe |
| `rateLimit.js` | 81 | Likely commander-only |
| `audit.js` | 166 | Commander-only |
| `clientAuth.js` | 84 | Commander-only |
| `useBusBridge.js` | 66 | Commander-only |
| `useCommanderSync.js` | 406 | Commander-only |
| `useClubBranding.js` | 85 | Commander-only |
| `commanderFetch.js` | 100 | Commander-only |
| `icm-utils.js` | 171 | Commander-only |
| `tournamentAutoBreak.js` | 280 | Commander-only |
| `notifications.js` | 124 | Commander-only |

Shared package scope: ~1,900 LOC (top 6 rows). Rest stays inside
`smarter-poker-commander`.

**Before Phase 3.3 starts, do a real cross-repo import audit** — this
table is a first pass based on filename guesses and needs grep confirmation
per file.

---

## Auth strategy

Locked: both repos share the same Supabase project, so identity doesn't
change. What changes is where validation runs.

### Current (World Hub monolith)

- User authenticates via Supabase JS SDK → `sb-<project>-auth-token` cookie
- `middleware.ts` line 111-163 checks `x-admin-secret` header OR validates
  the cookie server-side for admin/debug/emergency routes + 7 destructive
  poker routes
- Commander pages use `src/lib/commander/clientAuth.js` for client-side
  role checks + `src/lib/commander/auth.js` for server-side SSR validation

### Post-extraction

- Commander repo has its own `middleware.ts` that:
  - Validates the same Supabase session cookie (domain: `.smarter.poker`
    so cookies work across subdomains AND across rewrites)
  - Enforces commander-specific role checks (club owner, floor manager,
    dealer, etc.) via a ported copy of `src/lib/commander/auth.js`
  - Optional: inherits `x-admin-secret` path guards for commander admin routes
- World Hub middleware DROPS the commander-specific role checks — any
  request to `/commander/*` or `/api/commander/*` hits a Vercel rewrite
  (see routing section) and never lands on World Hub's middleware.

### Rewrite-then-auth ordering

The Vercel rewrite resolves BEFORE middleware on the origin that serves the
response. Path like `smarter.poker/commander/dashboard` flows:

1. User → Vercel edge (hub-vanguard project) → matches `/commander/*`
   rewrite rule → proxies to `commander.smarter.poker/dashboard`
2. Commander project's middleware runs on that request, checks cookie,
   applies role gate
3. SSR or static render returns → proxied back to user

The key invariant: cookie domain is `.smarter.poker` so both origins see
the same auth state. The Supabase SSR helper already sets cookies with
`.smarter.poker` in prod.

### MFA flow

Middleware.ts has an MFA cookie check (`mfa_session` line 134). That
check stays in World Hub (parent domain). Commander admin routes that
need MFA also read the same `mfa_session` cookie (`.smarter.poker`
domain) and apply the same 30-min window. No UX change for users —
just duplicated cookie-read logic in two places.

---

## Session persistence

Supabase session cookies (scope `.smarter.poker`, `HttpOnly`, `Secure`,
`SameSite=Lax`) are the single source of truth. Both repos use the
`@supabase/ssr` helper which writes/reads the same cookie names.

No session-store changes. Logout/login flows stay on World Hub
(`/auth/login`, `/auth/callback`). After login, the cookie is visible
to the Commander origin immediately.

Client-side `localStorage` state (e.g., `smarter-poker-auth` key Dan
mentioned earlier) is also `.smarter.poker`-scoped — a single key-value
pair that both repos read.

---

## Routing

Locked per plan decision #6: `smarter.poker/commander/*` stays at that
URL via Vercel rewrites.

### hub-vanguard (World Hub) `vercel.json` additions

```json
{
  "rewrites": [
    {
      "source": "/commander/:path*",
      "destination": "https://commander.smarter.poker/:path*"
    },
    {
      "source": "/api/commander/:path*",
      "destination": "https://commander.smarter.poker/api/:path*"
    }
  ]
}
```

### Slice-by-slice rewrites during Phase 3.4

Plan line 434: instead of cutting ALL 246 API slices over at once, do
`pages/api/commander/<slice>/*` one directory at a time. Per-slice rewrite:

```json
{
  "source": "/api/commander/reports/:path*",
  "destination": "https://commander.smarter.poker/api/reports/:path*"
}
```

For routes not yet migrated, the rewrite rule doesn't exist, and World
Hub serves the handler as before. Zero-downtime migration.

### Internal service URL

`commander.smarter.poker` (new Vercel project's production domain
alias) — set up as DNS A/AAAA pointing to Vercel. Users never see it;
only the rewrite's `destination` URL references it.

---

## Deployment

Locked per decision #5: Vercel (new project), not Hetzner.

Vercel project settings for `smarter-poker-commander`:

- Framework: Next.js 14 (same as hub-vanguard)
- Build command: `next build` (no overrides yet — bare skeleton first)
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CRON_SECRET` (for commander's own crons,
  if any — currently zero), `ADMIN_SECRET`, `SENTRY_DSN` (commander project)
- Production domain alias: `commander.smarter.poker`
- Preview deploys allowed on PRs
- Same team: `team_SVD8r7AOPH065G3usBxVvrBc`

### CI / CD

- Same build-safety-gate pattern as hub-vanguard, port `.github/workflows/
  build-safety-gate.yml` to the commander repo but REMOVE CHECK 6 (cron
  governance — commander has no crons).
- E2E test workflow port — the e2e/08-commander.spec.ts file already tests
  `/commander/*` routes. Dupe those into the commander repo; drop from
  hub-vanguard once cutover is 100% per slice.

### Rollback per slice

Plan line 460: each slice's rewrite is independently revertible.
Remove the rewrite entry → World Hub's own handler takes over again.
No redeploy of the commander repo needed.

---

## Migration sequencing (plan step 3.4)

Plan line 400 says: "Not all 246 API files at once. Slice by sub-route."
Proposed slice order, easiest first:

| # | Slice | File count | Risk | Why risk ranking |
|---|---|---|---|---|
| 1 | `api/commander/reports/*` | 6 | low | Read-only, no mutation |
| 2 | `api/commander/analytics/*` | — | low | Read-only |
| 3 | `api/commander/comps/*` | — | low-med | Small write surface |
| 4 | `api/commander/schedule/*` | 2 | low | Small file count |
| 5 | `api/commander/members/*` | 8 | med | Member CRUD, but well-isolated |
| 6 | `api/commander/staff/*` | 4 | med | Role assignment writes |
| 7 | `api/commander/cashier/*` | — | med-high | Money movement surface |
| 8 | `api/commander/waitlist/*` | 7 | med-high | Live state, frequent writes |
| 9 | `api/commander/tables/*` | 5 | high | Table lifecycle — ties into realtime |
| 10 | `api/commander/tournaments/*` | 6 | high | Complex state + player-facing |
| 11 | `api/commander/high-hands/*` | 2 | high | Prize payouts |
| 12 | `api/commander/hands/*` | 1 | high | Ledger writes |
| 13 | `api/commander/ai/*` | — | uncertain | Needs audit for OpenAI keys |

Plus smaller route sets (games, home-games, incidents, kiosk,
leaderboards, leagues, marketplace, notifications, onboarding, profile,
promotions, responsible-gaming, sessions, settings, squads, streaming,
tax, venues, webhooks) fit between slices as their sizes allow.

Frontend pages (`pages/commander/*`) move LAST (plan step 3.5, line 452)
because they depend on the API slices being migrated first.

**48-hour parallel-run per slice** per plan line 432 — the rewrite plus
the old handler both exist at the same time. Cut over means removing
the old handler; the rewrite keeps traffic going to the new service.

---

## Known issue to fix during extraction

Plan line 463: *"Commander admin uses client-side PIN gate — HTML visible
without auth."*

Fix during Phase 3.6 (step 3.6 on line 463). The new service has
server-side middleware from day one, so the client-side PIN check gets
replaced with real auth at the edge. Don't fix it separately in the
monolith — the extraction IS the fix.

---

## Shared code audit — to run before Phase 3.3

Run this grep to classify every `src/lib/commander/*` import:

```bash
for f in src/lib/commander/*.js; do
  name=$(basename "$f" .js)
  # Count imports from commander-vs-non-commander pages
  cmd_imports=$(grep -rl "lib/commander/$name" pages/commander pages/api/commander 2>/dev/null | wc -l)
  other_imports=$(grep -rl "lib/commander/$name" pages/hub pages/api/hub pages/api/public 2>/dev/null | wc -l)
  echo "  $cmd_imports commander / $other_imports other — $name"
done
```

Any file with `other > 0` goes into the shared package. Anything with
`other == 0` stays inside the commander repo (no duplication needed).

---

## Timeline

Plan line 479:

| Week | Step | Deliverable |
|---|---|---|
| 6 | 3.1 | **This design doc** — your review + lock changes |
| 6 | 3.2 | New repo scaffold + CI/CD (same pattern as workers repo) |
| 7 | 3.3 | Shared package `@smarter-poker/commander-shared` published |
| 7-11 | 3.4 | 246 API slices migrated in the order above |
| 11-12 | 3.5 | 14 frontend routes migrated |
| 12 | 3.6 | Client-side PIN gate replaced with server-side middleware |
| 12 | 3.7 | Delete `pages/commander/*` + `pages/api/commander/*` from World Hub |

Phase 3 cannot start until Phase 2B.3 has shrunk the monolith enough
that the remaining pieces extract cleanly. As of 2026-04-24, Phase 2B.2
is at 21/31 handlers ported; Phase 2B.3 hasn't started.

---

## Open questions for Dan

Only 3 decisions not already locked by the plan:

1. **Sentry strategy** — separate commander Sentry project, or tag-filter
   on the existing one? Separate project = cleaner alert routing,
   slightly more admin overhead. Tag-filter = zero setup, noisier dashboards.
   **Recommendation: separate project.**

2. **Preview-deploy auth bypass** — should commander's preview deploys
   skip the MFA gate so Dan can load staging-commander.smarter.poker
   with just Supabase cookies? This is how hub-vanguard preview works today.
   **Recommendation: yes, same as hub-vanguard. Add a preview-only env
   check in middleware.**

3. **Shared package registry** — publish `@smarter-poker/commander-shared`
   to npm (private) or GitHub Packages? Plan line 392 mentions "GitHub
   Packages or a private npm registry."
   **Recommendation: GitHub Packages. Already authenticated via the
   same PAT used for GHCR; no new vendor; free for private packages
   under the Smarter-Poker account.**

The 3 answers above are all defaults. If you're good with the defaults
this doc is locked and Phase 3.2 (repo scaffold) can kick off whenever.

---

## Rollback / escape hatches per Phase 3 step

- **3.2 scaffold** — delete the Vercel project + delete the GitHub repo.
  Zero impact on anything live.
- **3.3 shared package** — unpublish the npm version. World Hub reverts
  to its own copies of the shared files (no change, they still exist
  during this phase).
- **3.4 per-slice migration** — remove the Vercel rewrite entry for that
  slice. World Hub's old handler files still exist until a slice is
  fully verified (plan line 436 says to "delete old route handlers"
  only after parallel-run succeeds, which means "after the rewrite
  has been live for a week and Sentry is clean").
- **3.5 frontend migration** — same as 3.4, per-route rewrite removal.
- **3.6 PIN gate replacement** — scoped to the new service; rolling
  back is a matter of replacing the middleware check with the old
  client-side logic in the new repo's codebase. Low risk because new
  service has no legacy users to preserve.
- **3.7 delete from World Hub** — ONLY after everything above is stable
  for 2+ weeks. This is the irreversible step; it's also the one that
  finally delivers the build-time win.
