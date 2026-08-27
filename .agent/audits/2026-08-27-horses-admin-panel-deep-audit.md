# /horses admin panel — full audit and rebuild

**Date:** 2026-08-26 → 2026-08-27
**Scope:** every page and subpage under `https://smarter.poker/horses`, their backing API routes, and the RPCs and RLS policies underneath them.
**Brief:** find every bug, stub, gap, error, regression and wiring issue; find missing capability; improve/enhance/optimise; recolour to the smarter.poker schema with no purples or greens.

---

## The one pattern behind most of it

**PostgREST answers a write that matches ZERO rows with `{ error: null }`.**

Every "the button says it worked and nothing happened" bug in this panel was
this. A route checks `if (error)`, sees null, returns success. The UI updates
optimistically. Nothing was written. In the worst case an `admin_audit_log`
row is filed recording work that never occurred — a false entry in the table
that exists to be the record of truth.

The fix is always the same: add `.select(...)` and check the returned array's
length. It is now applied to every write in the panel.

The second recurring pattern: **a discarded `error` turns a broken query into
a confident wrong answer.** On an abuse dashboard that renders as "no abuse
detected". On a role check it renders as "you are not an admin".

---

## Severity 1 — platform-wide

### `fn_is_platform_admin` was not executable by the role that calls it

47 tables had RLS policies calling it. Postgres **does not short-circuit `OR`
in a policy**, so the function privilege check fired even for rows the caller
owned — every signed-in user was denied their own data across 47 tables.
Fixed by granting EXECUTE; verified by re-running the affected policies as a
real user.

Note for whoever touches this next: Supabase's `ALTER DEFAULT PRIVILEGES`
re-grants EXECUTE to `anon` and `authenticated`, so a `REVOKE ... FROM PUBLIC`
does not stick. Revoke from each role **by name**.

### `rake_history` RLS: 17,735 ms → 160 ms (111x)

The policy re-evaluated a set-returning function per row. Rewritten as an
InitPlan (`col IN (SELECT setof_fn())`), which Postgres evaluates once per
statement. **Visibility verified unchanged** before and after: member sees
16,841 rows, god sees 1,372,780.

Four other candidate policies were measured (9–120 ms) and **deliberately left
alone**. Churning them without evidence of a problem is how you break
visibility for no gain.

---

## Severity 2 — crashes

### HG Moderation white-screened on load

`list_home_content_reports` is `RETURNS jsonb`, ending in
`jsonb_build_object('success',..,'total',..,'reports', v_rows)`. The route
returned that object as `reports`, so the page got
`{ reports: { success, total, reports: [...] } }`.

`reports.length === 0` evaluated `undefined === 0` → false, so the empty
branch never ran, and execution fell through to `reports.map(...)`, which
threw. **Reports is the default tab**, so the whole page died — including
with an empty queue, because the RPC returns the envelope either way.

**Generalise this:** when a route pipes a Postgres function straight through,
check whether the function returns `SETOF` (array) or `jsonb` (object). The
rest of the panel was swept for the same mismatch; `ca_horse_review_summary`
returns `jsonb` and is correctly consumed as an object.

### `?type=top-horses` was a guaranteed 500

`HorseAlertingService` aggregated into `horseStats[a.author_id]` while the
select fetched `horse_id / metric_type / metric_value`. No `author_id` on the
row → `horseStats[undefined].likes` → TypeError on the first row, every time.
The lines were also redundant with the `METRIC_KEYS` accumulation above them.

### Temporal Dead Zone crash in `index.js`

`resolveCashout` listed `loadBadges` in its dep array while `loadBadges` was
declared later in the component. Dep arrays evaluate during render, so this
threw at prerender. Hoisted, and a static checker was written for the pattern.

---

## Severity 3 — silent failures and false negatives

| Where | What it did | Fix |
|---|---|---|
| `content_authors` / `content_settings` writes | Written from the browser under the caller's own RLS; a denied write reported success | Routed through `stable-admin` (service role, row-count checked) |
| `admin-reviews` DELETE | Reported success on a stale id, UI removed the row, **and wrote a false audit entry** | `.select('id')`, 404 on zero rows, all downstream effects skipped |
| `admin-reviews` PATCH flag/unflag | Same; flagging suppresses a business's public review | `.select('id')`, 404 |
| `live_help_tickets` status | Last direct-from-browser mutation; unaudited, zero-row = "success" | New `stable-admin` `set_ticket_status` |
| `generate-avatars` profile mirror | `mirroredToProfile: true` on a zero-row match | `.select('id')`, warns on stale `profile_id` |
| `anti-abuse` (3 reads) | Discarded `error` → renders as "no abuse detected" | `failedSources` + a UI banner saying an empty panel is not evidence |
| `hand-reviews` telemetry | Discarded `error` → renders as "No Data Yet" in the panel that calls zero a regression | "Read Failed" + explanation |
| `economy-stats` catalog | One source failing 500'd ten working panels | Folded into `failedSources` |
| `getRemainingCount` | Returned `0` on failure — reads as "all done" | Returns `null`; UI says "unavailable" |
| Role checks (4 pages) | Discarded `error` → transient failure looked like "not an admin" | Distinguish failure from denial, offer retry |

---

## Severity 4 — authorization

### Latent IDOR in `list_home_ban_appeals_admin`

Would have opened the moment anyone naively made it `SECURITY DEFINER`.
Documented rather than left as a trap.

### Platform admins could list every ban appeal but act on none

`list_home_ban_appeals_admin` is gated on the platform role and returns
appeals across every group. `review_home_ban_appeal` had **no platform
branch** — so a platform admin who did not own the group got `FORBIDDEN`,
surfaced as a 500. The Submit button was decoration.

Migration `20260827000000` adds the branch and records
`reviewed_as: group_staff|platform_staff` so a cross-group decision stays
distinguishable. Preventive: 0 appeals existed at the time.

### GDPR erasure left no record

`hg-gdpr-erase` wrote no `admin_audit_log` entry, and the RPC's own logging
is scoped to the groups the target belongs to — so erasing a user in **no**
group left no record anywhere. The most irreversible action on the platform.
Now filed unconditionally.

---

## The audit trail was write-only

Nine mutating admin routes wrote nothing to `admin_audit_log`. The whole table
held **9 rows across five months**. Seven of those routes move real money or
take irreversible moderation action.

All are instrumented now: `cashout.*`, `anticheat.*`, `union.*`, `fleet.*`,
`hg.*`, `ticket.*`, `horses.avatars_generated`, `hg.gdpr_erase`. Every call
site sits after the error check and before the success response, so a failed
operation is never logged as a completed one.

`trigger-pipeline` and `grinder-stats` POST are **deliberately not**
instrumented — both return 501 and mutate nothing. Logging them would put runs
in the trail that never happened, which is the failure those 501s replaced.

**And the trail is now readable.** A new Audit Log tab reads it back with
filters, pagination, expandable before/after JSON and CSV export. An audit
trail nobody can read is a table, not a control.

---

## Race condition

`hg-moderation`'s `loadDetail` had no sequence guard. Open report A (slow),
open report B, and A's response still landed — flipping `contentSeen` true
**while the panel displayed a different report**. That defeats the single
guarantee the review modal exists to make: that a moderator has seen what they
are acting on before the destructive actions unlock. Fixed with a monotonic
request token; `closeReview` invalidates in-flight work.

---

## Palette

Converted to the Club Arena token set. CSS Modules here run in `mode: 'pure'`,
which rejects `:root` — tokens are hosted on the top-level component classes
instead.

**The lesson worth keeping:** the first sweep missed `LaunchButton`'s
game-type selector, still `bg-emerald-600/20` in its *selected* state, which
never appears in a default screenshot. It was caught by **grepping the
deployed bundle rather than the source**. Do that; the source grep is not
sufficient.

Also recoloured the HUD that `/horses` dynamically imports (26 lines),
`HandHistory`, and the last `teal`.

**Four lines deliberately left green**, commented in place: the clubs suit
colour in `HUD.jsx` and `HandHistory.jsx`, and `RangeGrid`'s in-range heatmap
and player-type key. Those are *data*, not console furniture — clubs are green
in every four-colour deck, and recolouring them would collide with diamonds
and make a board harder to read at a glance, which is the one thing a poker
HUD must never do.

---

## Capability added

- **Audit Log tab** — the trail, readable, filterable, exportable.
- Bulk select / bulk activate / bulk delete across the stable.
- CSV export on every table.
- Avatar generation wired up (55 horses had none).
- Ledger, Revenue and Platform sections — previously implemented and
  unreachable from the UI.
- Statistics tab rebuilt around figures that are actually measured, with
  `null` (not `0`) where a source failed, and a `derivationNote` stating in
  one sentence how each number was derived.

---

## Things deliberately NOT done

- **Four green lines** (above) — semantic, not decorative.
- **Four RLS policies at 9–120 ms** — no evidence of a problem; changing them
  risks visibility for no measured gain.
- **`trigger-pipeline` / `grinder-stats` POST** — left as honest 501s rather
  than implemented. Both touch chip movement, and the house rule is that chip
  paths are not exercised speculatively. The UI buttons that call them should
  be removed or rewired; flagged, not silently patched.
- **`generate-avatars` `size`/`quality` params** — `grokClient` maps
  `dall-e-3` to `grok-imagine-image`, and the xAI images endpoint may reject
  the extra params. Worth one live call to confirm **before the next paid
  batch**; not changed blind.

---

## Rules learned

1. **Probe a money path inside a transaction you ROLL BACK.** What you want
   from the probe is the error message; `GET STACKED DIAGNOSTICS` survives the
   rollback, the side effects do not.
2. **Grep the deployed bundle, not just the source**, when verifying anything
   visual. The source grep missed a live green.
3. **A zero-row write is not a success.** `.select()` and check the length.
4. **A discarded `error` is a confident lie.** Especially on a dashboard whose
   job is to surface problems.
5. **Check whether an RPC returns `SETOF` or `jsonb`** before piping it
   through a route. One returns an array, the other an envelope.
6. **Postgres does not short-circuit `OR` in an RLS policy.** A function
   privilege check fires even for rows the caller owns.

---

## Shipped

PRs #785, #788, #789, #790, #791, #792, #793, #794, #795 — each merged with
green CI and verified serving on `/api/health`.

Migrations applied to production, each with pre-flight checks, post-apply
assertions and a pasted ROLLBACK.
