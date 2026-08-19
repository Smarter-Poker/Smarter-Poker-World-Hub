# Daily Challenges + Web Push — security and correctness pass

**Date:** 2026-08-19
**Scope:** `Smarter-Poker-Club-Arena` daily challenges, `Smarter-Poker-World-Hub` VAPID push stack
**Trigger:** full line-by-line audit of everything built in this session

---

## 1. Chip-minting exploit (CRITICAL, was live)

`public.user_daily_challenges` granted `INSERT` and `UPDATE` to `authenticated`,
and the UPDATE policy was:

```
USING (auth.uid() = user_id)     WITH CHECK: null
```

No `WITH CHECK`, no column restriction. So any logged-in user could:

```
PATCH /rest/v1/user_daily_challenges?id=eq.<their own row>
{ "progress": 999999, "completed": true }
```

then claim. `claim_daily_challenge` did guard with
`progress >= catalog.requirement`, but that guard could not hold, because
`progress` was exactly what the client could write.

Worse, `assigned_date` is free-form `text` and the INSERT policy only checked
`user_id`, so the unique constraint `(user_id, challenge_id, assigned_date)`
imposed no ceiling: insert `monthly_tourneys_50` (15,000 chips) at `'x1'`,
`'x2'`, … and claim each one. **Unbounded.**

Second vector: `increment_challenge_progress` took `p_requirement` **from the
client** and wrote `completed = progress >= p_requirement`. Passing
`p_requirement: 1` completed any challenge instantly.

**Fix** (migration `daily_challenges_lockdown_and_catalog_parity`):

- `REVOKE INSERT, UPDATE, DELETE` from `authenticated`/`anon`; dropped both write policies. Clients may only `SELECT`.
- New `assign_user_challenges(text, text[])` SECURITY DEFINER RPC owns assignment. It validates every id against `daily_challenge_catalog`, enforces the period-key shape by regex (`YYYY-MM-DD` | `W…` | `M…`), caps a period at 8 rows, and is idempotent.
- `increment_challenge_progress` now reads the requirement from the catalog and ignores the caller's value.
- Claim keeps the progress assertion as defence in depth.

**Verified post-apply** as role `authenticated`:
`can_update=false, can_insert=false, can_select=true, can_assign=true`.

---

## 2. Unclaimable challenges (regression introduced earlier this session)

Expanding `CHALLENGE_POOL` from 11 to 20 entries added 9 ids that were never
added to `daily_challenge_catalog`. `claim_daily_challenge` rejects unknown ids,
so those challenges were assignable and completable but **not claimable** — the
player does the work and is refused the reward.

Today's seeded rotation contained two of them (`tourney_2`, `hands_100`).
Assignment happens on page load and nobody had opened the page since deploy, so
**0 rows existed with those ids** — caught before any player was hit. Catalog
rows added in the same migration (18 → 27).

---

## 3. Unwinnable challenges

`onTournamentComplete()` — the only thing that incremented
`tournaments_played` — had **zero production call sites** (tests only). Every
tournament challenge (`tourney_1/2/3`, `weekly_tourneys_10`,
`monthly_tourneys_50`) could be assigned, showed a progress bar, and never
moved. Because the new selection guarantees one challenge per activity type, a
tournament challenge appears **every day**.

Wired to the `TOURNAMENT_REGISTERED` bus event, matching the existing
`friends_added` auto-wire pattern. `TOURNAMENT_REGISTERED` is correct because
the challenge copy is "Play N tournaments today" (entering, not finishing) and
it fires once per entrant with `userId` in the payload.

`login_streak` and `rakeback_earned` are declared in `ChallengeType` with no
trigger, but they appear in no pool, so no user can be assigned one — dead union
members, not a live trap.

---

## 4. Push: unauthenticated notification interception (CRITICAL, was live)

`/api/push/rotate` is session-less by necessity (a service worker cannot read
the `smarter-poker-auth` localStorage key). Its stated safety argument was
"the worst a caller can do with a stolen endpoint is redirect that one device's
own pushes." **That was wrong.** `user_id` was copied from the matched row, but
`endpoint`, `p256dh` and `auth` came from the request and were written as an
ACTIVE subscription. An attacker who learned a victim's endpoint could submit
their own browser subscription and receive that user's notifications —
decrypted, on their device — while the victim's real row was deactivated, so the
victim got nothing and no signal.

**Fix:**
- **Proof of possession** — migrating an active subscription now requires echoing the old subscription's `auth` secret, forwarded by the SW as `oldKeys`.
- **Quarantine** — Safari does not always populate `event.oldSubscription`, so an unverified rotation is written with `is_active = false`. No push is ever sent to an unverified endpoint; `PushSubscriptionSync` reactivates it through the authenticated `/api/push/subscribe` on next app open.
- Also fixed `.maybeSingle()` on `endpoint`, which is **not** unique (the table is `UNIQUE(user_id, endpoint)`, and `subscribe.js` deliberately keeps the displaced row). On any shared device that query errored `PGRST116`, the error was discarded, and self-heal was silently dead — on exactly the devices that need it most.

---

## 5. Push: SSRF with response exfiltration (CRITICAL, was live)

Nothing validated `endpoint`. `web-push` issues `https.request()` to whatever
host:port it is handed, carrying a valid VAPID JWT. The failure body came back
as `err.body`, was captured into `error`, and written to
`push_subscriptions.last_failure_reason` — a column the row's **owner reads back
through RLS**. That is ~300 bytes of an internal HTTPS response per attempt,
plus host/port scanning via timing and `failure_count`.

**Fix:** new `src/lib/push/push-endpoint.js` — push-service host allowlist,
https-only, no explicit port, no embedded credentials, plus key-shape validation
(p256dh 65 bytes, auth 16 bytes). Wired into `subscribe` and `rotate`.
`sendWebPush` now returns `http_<status>`; the body is logged server-side only.

Verified by `scripts/verify-push-endpoint-guard.mjs` (22 cases, all passing),
including the lookalike-domain bypass `fcm.googleapis.com.evil.com`.

---

## 6. Duplicate sends

Two independent causes, both fixed:

- `requeue_stuck_push_outbox` keyed "stuck" on `created_at` (**enqueue** time) rather than claim time. A row enqueued 20 minutes ago and claimed 30 seconds ago already matched. The dispatch loop is serial over up to 100 rows and can outlive its 5-minute slot, so the next run requeued in-flight rows and re-sent them. The `(job, slot)` dedupe cannot help — a genuine later fire owns a different slot. → added `push_outbox.claimed_at`, stamped in `claim_push_outbox_batch`, predicate repointed.
- `enqueuePush` inserted `status: 'pending'` then delivered inline, so the cron could claim and send the same row mid-flight; the inline path then unconditionally overwrote status **and** wrote `attempts: 1`, resetting the claim RPC's counter and breaking the `MAX_ATTEMPTS` ceiling. → now inserts as `processing` (self-claimed), finalises with `.eq('status','processing')`, and never writes `attempts`.

---

## 7. Dead endpoints retried forever

- Only 404/410 counted as permanent. A subscription made under a rotated VAPID key returns **403** on every send; malformed keys throw **before** any HTTP call with **no** `statusCode`. Both were classified transient. → 403/400/undefined now permanent.
- `failure_count` was write-only — incremented in two places, reset on success, **read by nothing**. An endpoint failing every send stayed `is_active = true` forever. → retires at 10 consecutive failures.

---

## 8. Watchdog false alarms

`push-health` had no grace period: a device that enrolled ten minutes ago has
`last_receipt_at = null` (phone asleep) and was branded a zombie, so a user's
first experience of push was "notifications are not reaching you". → added a
`created_at` floor.

It also alerted every admin, every day, that staff have no device — true, but
only because nobody has enrolled yet. → suppressed while global active
subscriptions are 0.

Several queries discarded `error`, so a failed query rendered as "0 zombies,
healthy" — the green-dashboard-silent-phones failure this watchdog exists to
catch, reintroduced inside the watchdog. → errors now surface. N+1 per-admin
loop replaced with one query; alerts capped per run.

---

## 9. The bell never rang for most pushes

Pushes sent through the `onesignal-server` shim called `enqueuePush` directly,
creating **no** `notifications` row — so they never lit the header bell and were
invisible to anyone who missed the OS banner. Added an opt-in `notifyType` that
routes through `notify()` (both pipelines) and wired late-reg, geofence and
game-threshold alerts to it. The two callers that already insert their own row
(`home-games follow`, `request-seat`) stay push-only so they do not double up.

---

## 10. Client-side

- **`_document.js` still unregistered EVERY service worker** on a stale-chunk error, destroying the PushSubscription. The `_app.js` fix earlier in the session had missed this second copy — so the root-cause bug was still live. Now clears caches and leaves `/sw.js` alone. Guard regex verified by unit test for the template-literal escaping.
- **`_app.js` module-scope `localStorage`** with no `try/catch` throws `SecurityError` when storage is blocked (Safari "Block All Cookies"). At module scope that means React never mounts — a **white screen for the entire site**. Wrapped.
- **`_app.js` SW guard** omitted `registration.waiting` and failed **open** on an empty `scriptURL`, so a worker mid-activation was unregistered. Now includes `waiting` and fails closed.
- **Turning push off did not stick.** `Notification.permission` stays `granted`, and `PushSubscriptionSync` only skipped on non-granted, so it re-subscribed the device on the next boot. Consent bug. → explicit `sp_push_opt_out` marker.
- **Sync throttle silently disabled itself** when `localStorage` throws (`last` stayed 0 and `if (last && …)` short-circuited), running a full `enablePush()` on every tab switch. → in-memory mirror.
- The `DELETE` in `disablePush` was the only unbounded fetch and was awaited **before** the local unsubscribe, so a stalled request blocked "off" entirely. → timed out.

---

## 11. Preference lost-update

`push-types` did a read-modify-write on the `push_type_prefs` jsonb with the
read error discarded: a transient failure made the merge base empty and the
write then wiped **every prior opt-out**. And because the UI saves instantly per
toggle, two quick taps raced and the second write discarded the first. → merge
moved into Postgres via `set_push_type_pref` (`||` to set, `-` to clear).

---

## 12. Other challenge fixes

| Issue | Effect |
|---|---|
| `getWeekKey` used `date - getUTCDay() + 1` | On **Sunday** (`getUTCDay()`=0) this resolved to *tomorrow* — the Monday starting the **next** week. Sunday play accrued to next week's row while the visible bar sat at 0 all day. |
| `getMonthKey` not zero-padded | Keys sorted `'M2026-10' < 'M2026-3' < 'M2026-9'`. Backfilled + regex now rejects the unpadded shape. |
| `getStats` `.limit()` with no `.order()` | Postgres returns an arbitrary subset; past 500 completions the streak walked random rows and collapsed to 0. |
| Streak anchored only at today | A 30-day streak displayed as **0** from 00:00 UTC until the player completed something — at the exact moment the UI is trying to keep the streak alive. Now anchors at today *or* yesterday. |
| "Chips Earned" ignored `claimed` | Counted unclaimed rewards as money in hand. |
| Claim retry after lost response | `retryAsync` re-entered, hit `already claimed`, and showed an **error** toast for chips the player HAD received. RPC now idempotent. |
| Client-side ledger write | Double-logged using the **client** amount, which the RPC deliberately ignores in favour of the catalog value — any drift made the audit trail disagree with the wallet. Removed. |
| Direct-UPDATE fallback in `updateProgress` | PostgREST reports no error for an UPDATE matching 0 rows, so the fallback "succeeded" against nothing and pushed a **fabricated** entry onto `completed[]` — firing "Challenge complete!" for a challenge that never moved. Removed (and impossible post-lockdown). |

---

## Verification performed

- Role simulation confirming the write lockdown holds.
- `scripts/verify-push-endpoint-guard.mjs` — 22 allowlist/key-shape cases.
- Template-literal escape unit test for the `_document.js` guard regex.
- `npx next build` clean; `npx tsc --noEmit` clean for the Club Arena changes.
- Production deploy verified serving the commits.

## Not exercisable without hardware

`push_subscriptions` is still 0 rows. Everything past "look up the user's
subscriptions" — the encrypted send, the SW display, the receipt beacon — needs
a real browser to grant permission and enrol. On iPhone that must be the
Home Screen PWA; iOS does not expose the Push API in a Safari tab.
