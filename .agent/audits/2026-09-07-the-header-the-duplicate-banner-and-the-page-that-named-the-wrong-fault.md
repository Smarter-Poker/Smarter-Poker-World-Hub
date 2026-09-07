# The header, the duplicate banner, and the page that named the wrong fault

**2026-09-07.** Three World Hub defects, all reported from Dan's phone, all
found to be a signal measuring something other than what it claimed to.

---

## 1. The mobile header sat a whole status bar too low

`env(safe-area-inset-top)` was being applied **twice**.

| where | added |
| --- | --- |
| `src/index.css` — `body { padding-top: env(safe-area-inset-top) }` | 2026-01-13 |
| `UniversalHeader.js` — `.approved-global-header { padding-top: env(...) }` | 2026-08-29 |

`.approved-global-header` is `position: sticky; top: 0`, and a sticky box can
never paint above its normal flow position. Its flow position was already one
inset down because of the body rule, and it then added its own before the
artwork. Both bands are `background: transparent`, so both rendered as empty
page colour:

- Dynamic Island (14/15/16 Pro): 59 + 59 = **118px**, where 59 is correct
- Notch (13 / X class): 47 + 47 = **94px**, where 47 is correct

**Why nobody caught it in a browser.** `env(safe-area-inset-top)` is 0 in a
Safari tab. It is non-zero only in the installed PWA — which is where
`manifest.json` sends people (`display: standalone`, `start_url: /hub`) and
where `apple-mobile-web-app-status-bar-style: black-translucent` puts the page
under the clock. The bug was invisible exactly where anyone would look for it.

**The body rule is the one that gave way**, because every fixed and sticky
chrome element on this site already applies its own top inset —
`global-tokens.css:169,176`, `worlds/poker-near-me-lobby.css:81,318`,
`tutorial.css:37`, `worlds/bankroll.css:326`,
`DiamondStoreShell.module.css:26`, and UniversalHeader itself. All of them were
double-counting, not just the header. A body padding cannot be right for a
`position: fixed` bar, which does not see it at all, and right for ordinary flow
content at the same time. The bottom/left/right insets stay: nothing else
applies them.

**Knock-on, fixed for free.** `--sp-header-height` is measured from
`getBoundingClientRect().height` (`UniversalHeader.js:798`), so it carried the
stray inset into every sub-bar anchored to it —
`worlds/memory-games.css:3178,3979`, `worlds/training.css:1694`.

Pinned by `__tests__/the-status-bar-inset-has-one-owner.test.mjs`, which also
asserts the header still owns its inset: the fix is "one owner", not "no owner".

## 2. The Estate Digest arrived twice, and only one copy was Title Cased

Two banners, same second, same digest. One read
`Production serves main exactly (a224b68ae)`, the other
`Production Serves Main Exactly (A224b68ae)`.

**The mismatch is the evidence.** This origin has two push-capable service
workers — `/sw.js` (`worker/index.js`, registered by Club Arena's `pushClient`)
and `/push/sw.js` (registered by the World Hub) — and only the first applies
Dan's 2026-08-30 Title Case rule. Two renderings means two registrations, two
endpoints and two `push_subscriptions` rows, not a double send.
`push-dispatch.js:408` selects **every** active row for the user and sends the
same payload to each, so one outbox row became two banners. The shared
`tag` cannot save this: a tag replaces within one registration's notification
list, never across registrations.

The invariant that should have prevented it — one live endpoint per device — is
enforced by `push_subscriptions_one_active_per_device_uidx` and by the
device-wide retire in `/api/push/subscribe` (added 2026-08-30, with a long note
about an iPad that produced two rows 62 seconds apart). **`/api/push/rotate`
never had that retire**, and it is the route BOTH workers call from
`pushsubscriptionchange` — so the invariant held on the enrol path and leaked on
the self-heal path, which fires on exactly the events that create the duplicate.
The index only covers `device_id IS NOT NULL`, so a row descended from a legacy
NULL ancestor is exempt from it permanently, which is why the retire has to be
explicit rather than left to the constraint.

**Fixed** in `pages/api/push/rotate.js`, mirroring `subscribe.js`.

### And the SHA it mangled

`a224b68ae` is a git commit. Title Casing it does not style a sentence, it edits
an identifier so it can no longer be pasted into `git show`. It was reachable
because the `(s)` carve-out requires a space before `(`, which ` (a224b68ae)`
happens to have.

The rule underneath: **a run of characters containing a digit is a name** — a
SHA, a version, a table id — and names are not title cased. Ordinary English
words contain no digits, and tokens that *start* with one (`100+`, `3270`) were
already untouched. Implemented with a negative lookahead, which is ES3 and safe;
the file's existing ban on lookbehind stands, and for the stated reason (a regex
literal is parsed when the worker is evaluated, so an unsupported construct
takes web push down for the whole origin rather than degrading).

`public/push/sw.js` was forked out of `worker/index.js` on 2026-08-25 to escape
a next-pwa precache hang; the Title Case rule landed five days later and nothing
carried it across or compared them. The block is now byte-identical in both
files and `__tests__/push-title-case.test.mjs` reads BOTH and fails if they
diverge. Two copies a test compares are honest; two copies nothing compares is
how this happened.

## 3. The CRITICAL page named the wrong fault

The SMS read:

> CRITICAL /api/cron/table-socket-probe failed 3x in a row: HTTP 503
> {"error":"pick-table: no table this account may open has dealt a hand in the
> last 10..."}

The three failures that crossed the threshold were **not one fault**:

| time (UTC) | outcome |
| --- | --- |
| 04:08:15 | `handshake_timeout` — socket never opened within 15s |
| 04:13:16 | `handshake_timeout` |
| **04:18:00** | **pick-table, zero rows** ← the only one quoted |

`_critical_record` counted consecutive non-200s (correctly — three faults in
fifteen minutes is still an incident) and paged with the **last** body only.
`tables-say-reconnecting.md` routes those two outcomes to opposite ends of
itself: pick-table to auth and club membership, `handshake_timeout` to the proxy
and host saturation. The dominant signature in that window was
`handshake_timeout` — 8 of 11 runs in the hour — and the page pointed at the one
section that had nothing to do with it.

**Fixed.** The page carries the distribution and leads with the mode:
`failed 3x in a row - mostly handshake_timeout (handshake_timeout x2,
pick_table x1). Last: ...`. The counting rule is unchanged. The classifier is
word-bounded, because `"socket never opened within 15000ms"` contains `500` and
a plain substring test labelled it `http_500` — the same confidently-wrong
label, one level down. A recovery clears the window with the streak.

Covered by scenario 7 in `scripts/ci/test-openclaw-critical-jobs.py`.

### The probe itself was right

Not a false alarm and not a membership problem — club membership was verified
intact (Midway Union `active`, Deep Stack Society `active`), and the `>=3 hands
in 10 minutes` eligibility bar left 60-331 candidate tables in every 10-minute
bucket of the preceding 24 hours. It returned zero only during the incident. The
underlying cause is in the Club Arena repo: the engine's single thread was
saturated by horse hand evaluation. See
`club-arena/docs/changelog/2026-09-07-the-core-the-break-and-the-metric-that-was-reading-one-table.md`.

**Note for the runbook:** the probe's break guard is fine and was not
implicated. `fn_platform_frozen` works (`engine_maintenance_break` holds its
single row and answered correctly), and 04:08/04:13/04:18 contains no `:55`.
