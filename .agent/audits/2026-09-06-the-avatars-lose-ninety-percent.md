# 2026-09-06 — the avatars lose 90% of their weight, and three 404s go with them

Follow-on from `2026-09-05-public-sheds-244mb-of-dead-weight.md`, which removed
what nothing referenced and left a note saying the next piece was the 478 MB of
PNGs that everything *does* reference. This is that piece, for the largest group.

## The number

**200 PNGs, 117.9 MB → 11.6 MB of webp. 90.2% smaller.** All of it 1024×1024
artwork that was being served at over a megabyte per avatar, on a poker table
that draws it at a few hundred pixels.

`public/` is now **292.6 MB across 1,821 files**. It was 632 MB across 2,357
files yesterday morning — a **54% reduction**, and every byte of it was on the
critical path of every Vercel build.

The budget ratchet in `scripts/ci/check-public-budget.mjs` printed its own
`LOWER THE PUBLIC BUDGET` notice at 113 MB of slack, which is exactly what it
was written to do, so the baseline goes 406 MB → 300 MB and 2,050 → 1,900 files
in this commit. Room that is freed and not taken away is room that gets refilled.

## Why this was safe to do, in the order it was checked

1. **The database had already moved.** All **1,461** profile rows carrying an
   avatar point at `/avatars/table/*.webp` — 1,178 in `arena_avatar_url`, 283 in
   `avatar_url`. **Zero** rows reference a `.png`, and zero reference
   `/avatars/vip/` or `/avatars/free/` at all: those two directories are the
   *gallery*, what you pick from, not what gets drawn in a seat.
2. **Every table PNG already had a webp twin** — 100 of 100 verified by name
   before anything was deleted. `avatars/table` had been carrying 100 PNGs and
   201 webp side by side for months.
3. **213 literal references across 15 files** were rewritten, and then the
   guard below was written to prove it rather than to assume it.

## What the guard caught immediately

`__tests__/every-avatar-path-resolves.test.mjs`, added here and wired into
`prebuild`, asserts that every literal `/avatars/...` path in `src/` and
`pages/` exists in `public/`. On its first run it failed with **31 broken
references**, and they were worth having:

- **Two files I had already edited and then reverted.** Undoing an unrelated
  mistake with `git checkout --` silently took the rename with it, in
  `resolveAvatarDisplay.js` and `PremiumPokerTable.jsx`. 25 references would
  have shipped broken. No review would have caught that; the file looked
  untouched.
- **Three 404s that were already live in production**, confirmed by curl with a
  passing control (`/avatars/table/free_shark.webp` → 200):

  | path | referenced by | reality |
  | ---- | ------------- | ------- |
  | `/avatars/default.png` | 7 places in 4 files | never existed; the real file is `/default-avatar.png` |
  | `/avatars/free/rabbit.webp` | `avatar-pool.js` | never existed |
  | `/avatars/table/vip_pirate.webp` | `MTTDeepStackUI.jsx` | it is `vip_space_pirate` |

**The default one is the worst of the three.** It is the fallback — the thing
shown when a user has no avatar — so it failed precisely when something else had
already gone wrong, and in `GoldenTemplateTable.jsx` it was also the `onError`
handler, which means a broken image fell back to a broken image.

**And the rabbit had already been half-fixed.** `AVATAR_LIBRARY.js` carries a
comment dated 2026-08-20 explaining that 'Lucky Rabbit' pointed at a
`rabbit.png` that never existed, calling it "the one broken tile in the
gallery", and repointing it. The pool listing the same file was not touched, so
the 404 survived in the half nobody checked. That is the third time in two days
the same shape has turned up: the change was right, and one of its two homes
was missed.

## The builders, which are the part that would have hurt

Three files assemble a table avatar at runtime rather than naming one:

```js
const filename = avatarUrl.split('/').pop().replace('.png', '');
return `/avatars/table/${tier}_${filename}.png`;
```

A literal that 404s is one grey box. A broken *builder* is every seated player
at every table, for all 1,461 users whose stored avatar goes through it. Both
halves needed changing: the output extension, and the strip — because
`.replace('.png','')` applied to a url that is now `.webp` leaves it intact and
produces `vip_wolf.webp.webp`. It is now
`.replace(/\.(png|webp)$/, '')`, and a dedicated test asserts no builder strips
only `.png`, so the trap cannot be reintroduced quietly.

## Also re-landed here, because it never actually merged

Three commits went to `chore/public-sheds-its-dead-weight`. **Only the first
one merged.** Autopilot squash-merged PR #1387 the moment the required checks
went green, at head `93033afb1` with `commits: 1`; the two later pushes landed
on a branch whose pull request was already closed and went nowhere.

The push said success. The PR said merged. Neither was wrong, and the work was
still gone — visible only by checking whether the files were actually on `main`,
which is the habit CLAUDE.md 1.4 and 1.5 keep insisting on for deploys and which
turns out to apply to merges too.

**A follow-up commit to a branch whose PR can already merge needs a new branch.**

So this change also carries, unchanged from those two lost commits:

- the Global Footer E2E fix (a retired Daily Pass still pinned, `annual` →
  `yearly`, two em dashes) — that gate has been red on `main` since at least
  2026-09-04 and is still red as this is written, because it is not a required
  check and so blocks nobody;
- the deletion of `LeaderboardWidget.tsx` (unimported; fabricated fifteen
  players with `Math.random()` scores) and `poker-engine/CardAssets.js`
  (unimported stale duplicate).

## Still not done

- **~555 PNGs over 200 KB still have no webp sibling.** The avatars were the
  biggest single group and the easiest to prove; the rest is the same job
  without the convenient property that a whole directory converts together.
- **`images/trivia` depth 1** and the **~49 MB of design-iteration leftovers**
  remain deliberately untouched, for the reasons in yesterday's note.
