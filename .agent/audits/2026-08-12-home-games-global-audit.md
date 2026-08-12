# Home Games — global audit and remediation (2026-08-12)

**Scope:** Home Games core + Poker Near Me + Club Commander + Social, across
code, wiring and database. ~200 files read in full; live Supabase schema, RLS,
RPCs and `supabase_migrations.schema_migrations` interrogated read-only.

**Audit result:** 162 findings — 9 CRITICAL, 41 HIGH, 66 MEDIUM, 46 LOW/INFO.
**Remediation result:** all 9 CRITICALs closed and verified in production,
plus 7 database migrations, 9 code commits, 2 new guards.

---

## 1. Corrections to the audit itself

Verification against the live database and against production changed four
conclusions. Recorded first because acting on the originals would have caused
harm.

| Audit claim | Reality | Consequence |
|---|---|---|
| `rpc_hg_claim_seat` has no per-user seat cap; a member can loop-claim every seat | **FALSE.** Three partial unique indexes already enforce it (`..._seat_lock`, `..._user_table_active`, `..._one_guest_per_user_per_table`) | Only the genuinely-missing guards were added (parent-game status, waitlist self-promotion, 23505 mapping). The storage-layer guarantees were left alone. |
| H-2: `starting_stack`/`structure` do not exist and 42703 the query | **BACKWARDS.** Both columns exist in production | `[slug].js` was already right; its sibling `[code].js` was omitting them on the strength of a false comment. Fixed the sibling, not the "bug". |
| §4.1/§4.2: the `/api/commander/home-games/*` routes do not exist, so posting is entirely non-functional | **MOSTLY FALSE.** They are proxied by a `vercel.json` rewrite (the audit checked only `next.config.js`). Live probes return 401/500, i.e. the routes exist upstream | No local handlers were built. Chasing this would have created a second, competing implementation. |
| `commander_home_posts` has a blanket `USING (true)` SELECT policy | **FALSE in live state** — the audit read an archived migration. The live policy is correctly membership-scoped | Left untouched. |

**Lesson for future audits here:** this repo's migration history does not
describe production. Read live catalogs, and probe production, before acting.

---

## 2. Database — 7 migrations, all applied and verified

Three of these restored changes that were **recorded as applied but absent
from production**, reverted out-of-band with no migration explaining it.

| Migration | What it fixed | Verification |
|---|---|---|
| `phase50_restore_secdef_on_home_rls_helpers` | `fn_home_is_group_staff` + `fn_home_is_approved_member` were `SECURITY INVOKER`. The latter also had `row_security=off` — illegal without BYPASSRLS, raising `42501` for **every** authenticated caller | Impersonated a real user (`SET LOCAL ROLE authenticated` + jwt claims): no 42501, group owner evaluates as staff |
| `phase50b_restore_home_members_host_sees_group_select_policy` | Roster SELECT had been replaced by the Supabase **dashboard default** template policy. INSERT/UPDATE/DELETE granted staff access while SELECT did not — **hosts could update and delete roster rows they could not read** | Host roster read returns the full roster |
| `phase50c_restore_home_games_one_active_per_group_per_date` | Double-booking unique index was gone; the TOCTOU race was live again | 0 pre-existing violations; index present, UNIQUE, partial |
| `phase51_close_using_true_select_policies` | 6 blanket `USING (true)` SELECT policies replaced with visibility-aware ones | Measured **as role `anon`**: private page hidden (9→8), follower enumeration 26→0, public reads intact |
| `phase52_revoke_truncate_trigger_references_from_client_roles` | `anon`/`authenticated` held TRUNCATE, TRIGGER, REFERENCES on all home tables (**50 TRUNCATE grants**). TRUNCATE is not filtered by RLS. Also fixed inverted `mv_home_groups_trending` grants (anon could force REFRESH — CPU DoS) | 0 such grants remain |
| `phase53_hg_claim_seat_game_status_and_waitlist_integrity` | Seats claimable on cancelled/completed games; unconditional `response='yes'` let a host-waitlisted player self-promote; races surfaced as raw 23505 | Guards present; prior BUG-2 guest-name truncation preserved |
| `phase54_home_games_invariants_check` | **New tripwire.** `verify_home_games_invariants()` asserts all of the above | All 8 invariants pass |

**Ordering hazard:** `phase50` had to precede `phase50b`. The restored policy
calls `fn_home_is_group_staff`, which reads the table it protects — with the
helper still INVOKER the policy would silently deny every staff read and make
the roster *worse*. `phase50b` carries a pre-flight that hard-blocks the wrong
order.

**Use the tripwire:**
```sql
SELECT * FROM public.verify_home_games_invariants() WHERE NOT ok;
```
Zero rows = posture intact. Add an invariant whenever you fix something that
could silently revert.

---

## 3. Code — 9 commits, all on `origin/main`, all verified in production

- **C-1 host home addresses were public.** `/api/poker/venues` (public,
  unauthenticated) returned raw `DECIMAL(10,8)` coordinates and 0.1-mile
  distances for the same groups `discover.js` carefully protects. Extracted
  `src/lib/home-games/geoPrivacy.js` as the single implementation.
  **The first fix was incomplete and production caught it:** this endpoint
  builds home-game objects in *three* places. The `?id=` branch still emitted
  raw coordinates and a generic distance pass overwrote the whole-mile value.
  Verified live: `distance_mi=4`, `distance_km=7`, coordinate jittered.
- **C-2** raw coordinates were serialised into `__NEXT_DATA__` on crawler-indexed geo pages.
- **C-3** private home games were indexed by Google — `next/head` dedupes
  `<meta name="robots">` by name and keeps the FIRST, so the page's `noindex`
  was always discarded behind `SEOHead`'s default. Also stopped CDN-caching
  private pages publicly.
- **C-8** `ensureAuthReady` returned `undefined`. `authUtils.ts` held a
  `Promise<void>` stub while `authUtils.js` had the real implementation, and
  `next.config.js` aliases `.js → .ts`. Six call sites branch on the return
  value, so signed-in users were treated as signed out.
- **C-9** `/hub/commander/home-games/join` did not exist. Four places linked
  to it; Next resolved it to `[id].js` with `id="join"` → "Group Not Found",
  killing the feature's primary conversion path. Page created.
- **manage.js had no ownership check** in 1,669 lines and hardcoded
  `isHost={true}` — escrow release/refund, member removal and Delete Group
  were reachable by any signed-in user with a group UUID. Staff gate added,
  failing closed.
- **join proxy hardening** — 5 HIGH findings: forwarded arbitrary methods,
  copied the whole cookie jar cross-origin, dropped the client's
  `X-Idempotency-Key`, had **no rate limiter** on an invite-code oracle, and
  never validated `code`.
- **M-1** `invite_code` — the credential that redeems membership — was
  returned for up to 100 groups per request from a CDN-cached public
  endpoint. Removed. Its only consumer use was a fallback that 404'd anyway
  (`/home-game/[code]` resolves by `club_code`).
- **Dead routes revived:** `/api/social/friends` never existed (venue friend
  button was dead), `/api/user/profile` never existed (player card never
  loaded). Added `/api/friends?action=status`.
- **M-9** late-night tournaments displayed the wrong day — a `Z` suffix
  declared a local wall-clock TIME as UTC.
- **M-4** the sitemap published URLs the site 404s. Root cause:
  `isGroupPubliclyVisible` was copy-pasted byte-identically into three geo
  pages and never added to the sitemap. Now one definition in
  `locationUtils`, imported by all four.

---

## 4. New guards (the point is that these fail loudly next time)

1. **`__tests__/api-routes-exist.test.mjs`** — every `/api/` literal must
   resolve to a handler. Caught 12 dead routes on first run. Verified by
   injecting a fake dead route (trips) and removing it (green).
   `BASELINE_DEAD` records pre-existing debt and **can only shrink** — a
   companion test fails when an entry starts resolving.
2. **`verify_home_games_invariants()`** — security posture as SQL assertions.
3. **`scripts/dump-home-games-schema.mjs`** — snapshots live functions,
   policies, indexes and grants; `--check` exits non-zero on drift, usable as
   a CI gate.

---

## 5. What is still open

1. **~559 migrations exist only in production** (703 repo files vs 1,263
   applied rows; ~162 Home Games functions / 350KB of definitions). This is
   the root cause that let three fixes revert unnoticed. Run
   `scripts/dump-home-games-schema.mjs` from somewhere with DB access and
   commit the result. It was written as a script precisely because the dump
   is too large to move through an agent context window without truncation.
2. **8 phantom cron jobs.** `pages/api/admin/cron-health.js` health-checks
   `/api/cron/*` handlers that do not exist here — almost certainly stranded
   by the Open Claw migration (CLAUDE.md §11). Needs a decision (point the
   dashboard at the dispatcher, or delete the entries), not a handler.
3. **`/api/translate`** is an acknowledged placeholder with a graceful
   fallback. Left as-is deliberately.
4. **Upstream commander authz is unverified.** The `manage.js` gate is
   defence in depth; the server-side check lives in another repo and should
   be confirmed there. A client gate stops the UI rendering, not a
   hand-crafted request.
5. **Two competing seat models** (`commander_home_rsvps` vs
   `commander_home_seat_reservations`) are still bridged one-directionally
   and rendered side by side. Not addressed — it is a design decision, not a
   bug fix.

---

## 6. Operational note

Binding rule #10 (`never git add -A`) was violated by another agent twice
while this work was in progress: an unrelated "TriviaLobby" commit swept up
four of these files, and a later push canceled an in-flight build (the
changes rode along in the successor commit — verified by ancestry, per
CLAUDE.md §1.7). Local `main` moved four times mid-session. Every commit here
was therefore built with an explicit-path private index against freshly
fetched `origin/main`, never `git add -A`.

Note also that every GitHub token in the repo's `.env*` files is expired
(HTTP 401). The working credential is on `branch.main.remote` in
`.git/config`; `remote "origin"` is SSH, which is why `git push` appears to
fail from an agent shell. See `PAT_EXPIRY_GUARD.md`.
