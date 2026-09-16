# Handoff — follow-ups from the Cards tab / VIP avatar session

**Date:** 2026-08-20
**Origin:** Cowork session that shipped `eff1f6dd8` (Club Arena) and `d8627cb640` (World Hub).
**Status of that work:** DONE and verified in production. Nothing below is a request to
finish, deploy, or re-push it.

Everything in this file is a separate defect or drift found *while* doing that work, that
the originating session could not fix itself — either because it needed a credential, a
cross-app data decision, or because the files belong to another agent's live session.

Work top-down. P0 items are production-affecting. Each item states how to verify it is
real before you change anything, so you do not act on a stale report.

---

## P0-1 — Fourteen applied migrations exist only as untracked files on Dan's Mac

**What is wrong.** `~/Documents/Smarter-Poker-World-Hub` has 14 untracked files under
`supabase/migrations/`. Every one of them corresponds to a migration that is **already
applied to production**. The repo does not record them. RULE 2 requires migrations be
both saved to the repo and applied; only half of that happened.

Untracked, and their applied counterparts in `supabase_migrations.schema_migrations`:

| File (untracked) | Applied version | Applied name |
|---|---|---|
| `20260820140000_commander_entry_reentry_marker.sql` | 20260820180023 | `commander_entry_reentry_marker` |
| `20260821130000_commander_entry_bounty_columns.sql` | 20260820183236 | `commander_entry_bounty_columns` |
| `20260821q_tournament_chip_conservation.sql` | 20260820190615 | `tournament_chip_conservation_check` |
| `20260821r_remove_superseded_spin_margin_row.sql` | 20260820191712 | `remove_superseded_spin_margin_row` |
| `20260821s_rebuy_addon_require_live_seat.sql` | 20260820194244 | `rebuy_addon_require_live_seat` |
| `20260821t_settlement_period_must_have_an_owner.sql` | 20260820195321 | `settlement_period_must_have_an_owner` |
| `20260821u_rebuy_addon_exact_grant_assertion.sql` | 20260820202624 | `rebuy_addon_exact_grant_assertion` |
| `20260821v_close_duplicate_live_tournament_seats.sql` | 20260820203014 | `close_duplicate_live_tournament_seats` |
| `20260822090000_commander_tax_events_tournament_link.sql` | 20260820193125 | `commander_tax_events_tournament_link` |
| `20260822093000_commander_txn_tournament_link.sql` | 20260820193253 | `commander_txn_tournament_link` |
| `20260822100000_commander_entry_payout_status_vocabulary.sql` | 20260820210426 | `commander_entry_payout_status_vocabulary` |
| `20260822210000_eco_club_cash_profit_formula.sql` | 20260820222851 | `eco_club_cash_profit_formula` |
| `20260822210500_settlement_snapshot_carries_cash_seated_stack.sql` | 20260820223046 | `settlement_snapshot_carries_cash_seated_stack` |

Note the filename dates (`20260821*`, `20260822*`) do not match the applied timestamps
(all `20260820*`). The local filenames are dated into the future relative to what
production actually ran, so filename ordering no longer reflects apply order.

**Also untracked and not junk:**

- `pages/api/cron/spin-sweep.js` — a cron handler. Migration
  `20260820194544_spin_reserve_sweeper_and_health` is applied, so the DB side of the
  sweeper is live. If Open Claw is scheduled to hit this route, **production is 404ing
  on it right now**, because the handler is not in the repo and therefore not deployed.
  Check `scripts/openclaw-cron-dispatcher.py` for a registered `spin-sweep` job first.
- `.agent/audits/2026-08-20-eco-formula-correction.md` — an audit record.

**Why the originating session did not fix it.** These files are not its work. Another
agent was actively editing this repo during the session (`.fuse_hidden` handles open,
file mtimes minutes old, staged work in the Club Arena index). Committing another
agent's in-flight files mid-session is how you ship half a change.

**What to do.**
1. Confirm the other agent's session has ended (no recent mtimes, no open handles).
2. For each untracked migration, diff the file body against what is actually installed
   in production before committing it — the file is the record, so it must match reality.
   Do not assume; several of these have `_fix`/`_v2` successors applied after them.
3. Renumber so filenames sort in true apply order, or add a header comment in each
   recording the real applied version. Do not silently commit misleading timestamps.
4. Commit the migrations, `pages/api/cron/spin-sweep.js`, and the audit doc.
5. Verify `spin-sweep` is reachable in production after deploy.

**Verify first:**
```bash
cd ~/Documents/Smarter-Poker-World-Hub && git status --porcelain supabase/migrations/ pages/api/cron/
```

---

## P0-2 — An equipped VIP avatar is a 1.1 MB PNG rendered at 48 px in every seat

**What is wrong.** `public/avatars/vip/*.png` are 1024x1024, about 1.1 MB each
(`yakuza.png` is 1,156,990 bytes). When a player equips one, that path is what lands in
`profiles.avatar_url`, and every client rendering that player at a table downloads the
full 1.1 MB to draw a ~48 px seat portrait. A nine-handed table where everyone has picked
new VIP art is roughly 10 MB of avatars per table load.

The gallery *grid* was already fixed in `eff1f6dd8` — tiles now render
`/avatars/table/vip_<slug>.webp` (125x170, 7,948 bytes, 145x smaller). The equipped path
was deliberately left alone, because changing it is a data decision, not a rendering one.

**Why the originating session did not fix it.** `profiles.avatar_url` is written by
both apps. Club Arena's `AvatarService.setUserAvatar` writes a URL directly; the Hub's
`avatar-service.js` resolves preset ids through `AVATAR_LIBRARY`. Making Club Arena store
a different URL than the Hub stores for the *same avatar* would break cross-app
"currently equipped" matching and split the data. Picking the canonical value is a
platform decision plus a backfill.

**What to do.** Decide one canonical value for a preset avatar in `profiles.avatar_url`,
then make both apps write it and backfill existing rows. The derivative already exists
for all 98 library entries and is the obvious candidate:
`/avatars/table/vip_<slug>@2x.webp` — 250x340, 19,220 bytes, retina-crisp at any
avatar-sized surface, 60x lighter than the PNG. Keep the 1024 PNG for anywhere that
genuinely renders large.

**Verify first:**
```bash
ls -l public/avatars/vip/yakuza.png public/avatars/table/vip_yakuza@2x.webp
```

---

## P1-1 — Two publishers write `public/hub/club-arena/`, and they race

`CLAUDE.md` §1.1 calls `scripts/sync-club-arena.sh` "The Only Deploy Path". It is not.
`Smarter-Poker-Club-Arena/.github/workflows/build-for-world-hub.yml` checks out the World
Hub, builds Club Arena, writes the same directory, and pushes
`chore(club-arena): sync build <sha>` commits.

During this session both fired: the local sync landed `95d0087503`, and eight minutes
later CI landed `adcec79bf5` over it. Nothing was lost only because CI happened to build
a *newer* Club Arena sha. Reverse the timing and CI silently republishes an older bundle
over a fresh local one — which is exactly the failure the script's own comments blame for
"three bad syncs on 2026-08-19".

**What to do.** Pick one authority. Either CI publishes and `sync-club-arena.sh` becomes
a local-preview-only tool, or the workflow is gated to only run when no local sync has
landed for that sha. Then correct `CLAUDE.md` §1.1 in both repos, because the current
text tells every future agent something false.

---

## P1-2 — The `pre-rebase` hook breaks the publish flow the docs recommend

`sync-club-arena.sh` documents `WH_OVERRIDE` for publishing from a throwaway worktree,
"because the default checkout is regularly mid-rebase or holding another agent's staged
work". That is exactly the situation this session hit, so it used a detached worktree —
and the `pre-rebase` hook refused to rebase inside it:

```
PRE-REBASE HOOK BLOCKED: Attempting to rebase on origin/main with local WIP!
```

There was no WIP in that worktree. The hook inspects the **shared checkout**, not the
worktree it is running in. The session had to route around it with `checkout --detach` +
`cherry-pick`, which is strictly worse than a rebase.

**What to do.** Scope the hook's WIP check to the current worktree
(`git rev-parse --show-toplevel`), so it still protects the shared checkout and stops
false-positiving on the isolated publish worktrees the same repo tells agents to use.

---

## P1-3 — Club Arena and the Hub show two disjoint avatar libraries

The Club Arena "Presets" tab lists **436 objects** from the Supabase
`social-media/avatars` bucket. The Hub's gallery lists **98 curated entries** from
`src/data/AVATAR_LIBRARY.js` on disk. The overlap is zero — the 26 new avatars were
absent from the bucket entirely, which is the whole reason Club Arena could not see them
and had to read the Hub's static files instead.

So a player picking an avatar sees a completely different catalogue depending on which
app they are in, with different naming (bucket entries fall back to `Avatar 1`,
`Avatar 2`, ... for UUID filenames).

**What to do.** Reconcile to one catalogue. Either import the worthwhile bucket art into
`AVATAR_LIBRARY.js` with real names and retire the bucket listing, or promote the bucket
to canonical and publish the 98 library entries into it. Whichever way, one source.

---

## P1-4 — Sentry sourcemaps have never uploaded from a local Club Arena sync

Every local run of `sync-club-arena.sh` prints:

```
SENTRY_AUTH_TOKEN not set — sourcemaps will NOT upload
```

The script reads the token from `$CA_SRC/.env`, and the canonical checkout
(`~/Documents/Smarter-Poker-Club-Arena`) has no `.env` — only the pre-rename
`~/Documents/club-arena` clone ever did. Production Club Arena stack traces in Sentry are
therefore minified for every locally-published bundle.

**Human-only step:** the token itself. Put `SENTRY_AUTH_TOKEN` (plus `SENTRY_ORG`,
`SENTRY_PROJECT`) into `~/Documents/Smarter-Poker-Club-Arena/.env`, or export it in the
shell profile the sync runs under. Confirm `.env` is gitignored there before writing it.

---

## P2 — Hygiene, in one pass

**Stale worktrees: 27 of them.** 16 on World Hub, 11 on Club Arena, nearly all in
`/private/tmp` from finished agent sessions. Each World Hub worktree is a full 9,321-file
checkout. They also pin refs against `gc`. One
(`/sessions/tender-brave-ptolemy/mnt/.../_wt_fin2`) is `locked` inside a dead session
mount and needs `--force`. Prune them, and add a line to the agent rules requiring each
session to remove its own.

```bash
git worktree list          # in each repo
git worktree prune -v
git worktree remove --force <path>   # for the ones prune won't take
```

**Untracked scratch at the World Hub repo root.** `check_200.sh`, `check_avatars*.sql`,
`check_bunny.py`, `check_color.py`, `check_ext.sql`, `check_hub_avatars*.{sql,py}`,
`check_scale.py`, `check_shop.sql`, `check_weird_urls.sql`, `fix_avatars.py`,
`fix_originals.py`, `generate_*.py`, `get_bounds.py`, `test_scale.py`, `wait_200.sh`,
`_ren_test_b`, `_unlink_test`, `data/tour-logs/`. One `git add -A` sweeps all of it into
the repo. Gitignore the patterns (`check_*`, `fix_*`, `generate_*`, `test_*`, `wait_*`,
`_*_test`) or move them to a `scratch/` directory that is ignored wholesale. Do this
*before* P0-1, so committing the migrations cannot pull junk along with it.

**Two 435 KB `.fuse_hidden` files** in `Smarter-Poker-Club-Arena/src/pages/` — deleted
files still held open by the sandbox mount. Delete once no session holds them.

**Recurring stale git locks.** This session found `HEAD.lock`, `index.lock` and
`packed-refs.lock` in `Smarter-Poker-Club-Arena/.git/`, which is the documented
VM-mount trap in `CLAUDE.md` §11. They block git on the Mac host too. Worth a small
`scripts/clear-stale-git-locks.sh` that checks for a live git process first, so agents
stop hand-rolling `mv`.

**Two stale comments now contradicted by the repo:**

- `Smarter-Poker-World-Hub/src/data/AVATAR_LIBRARY.js` header still says
  "75 Pre-Made User Avatars / 25 FREE / 50 VIP". It is 98 / 24 / 74.
- `Smarter-Poker-Club-Arena/src/components/table/CardImage.tsx`, in the
  `CARD_BACK_ALIASES` block: "Bespoke artwork for holographic/carbon/club-crest/
  diamond-foil is still outstanding". It is not — all four `.webp` files exist under
  `public/cards/backs/table/` and md5 confirms they are five distinct images, 34-40 KB
  each. Delete the sentence.

**One legacy row.** `user_theme_settings` has a single row with
`cards_id = 'standard-red'`, an id that is no longer a real card back. It renders
correctly via `CARD_BACK_ALIASES`, so this is cosmetic. If you want the table clean:
`update user_theme_settings set cards_id = 'classic_red' where cards_id = 'standard-red';`
— as a migration, per RULE 2, not raw `execute_sql`.

---

## What was already fixed — do not redo

Recorded so you do not "fix" these back:

- Theme Settings' Cards tab listed five ids that were not card backs; all five rendered
  the same default. Now lists the real designs, and `TablePage` actually deals the
  selected back instead of only setting an unused data attribute.
- The Background tab's list is now generated from `TABLE_BACKGROUND_IDS` rather than
  hand-typed twice.
- The 26 new VIP avatar PNGs were never committed — production had 50 portraits and a
  library naming 76. Committed, with their 78 table derivatives.
- `AVATAR_LIBRARY.js` had one entry pointing at a `rabbit.png` that has never existed in
  the repo, and two entries sharing one picture. Both repointed at real unused files.
- Club Arena's avatar gallery now has a VIP tab reading the Hub's library same-origin.
