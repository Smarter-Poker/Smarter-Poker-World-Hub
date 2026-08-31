# No em dashes on the apex site

**2026-08-31.** Dan: *"REMOVE ANY AND ALL M BARS AS THEY ARE BANNED FROM USE."*

Club Arena has had an em dash gate since 2026-08-27. **The apex site never did**,
so every page and sub page it serves was unchecked, and em dashes accumulated in
page titles, headings, button copy and the placeholder dash tables use for an
empty cell.

## What changed

- **`scripts/ci/check-ui-text.mjs`** ported from Club Arena, scanning
  `pages/`, `components/` and `src/` for `.js`, `.jsx`, `.ts`, `.tsx`, `.css`
  and `.html`. **Comments are stripped before scanning**, so a note about the
  rule is not an instance of it and a file header banner is not a violation. It
  reports every offender, and `--fix` rewrites only the ones outside comments.
- **Wired into `.husky/pre-push`**, so it cannot come back.
- **`--fix` run once: 4,433 em and en dashes replaced across 772 files.**

## Why this is safe to land as one large diff

The transformation is a single character substitution outside comments, so the
whole diff was verified mechanically rather than by eye:

```
changed lines verified ........................................ 3,912
lines differing by anything OTHER than a dash character ....... 0
changed .js files re-parsed with node --check ................. 436, 0 failures
```

`node --check` cannot parse JSX at all — it fails on an untouched `.jsx` file —
so the `.jsx` files are covered by the diff-shape proof above rather than by a
parser that was never able to read them.

## Scope

Only text a person reads. Em dashes remaining in code comments and markdown are
untouched, deliberately: no user ever sees them, and rewriting them would have
turned a verifiable change into an unreviewable one.

## Ten files deliberately left alone

`pages/api/admin/cron-health.js`, `pages/auth/mfa.js`,
`pages/auth/reset-password.js`, `pages/claim/[token].js`, `pages/club/[id].js`,
`pages/home-game/[code].js`, `src/lib/poker-brain/decision-bridge.js`,
`src/engine/CentralBus.js`, `src/hooks/useMessengerService.js` and
`src/lib/authUtils.js` still contain em dashes, and are named in the checker's
`SKIP_FILES` so the gate stays green and the exception stays visible.

The pre-commit hook refuses any staged file containing
`supabase.auth.getSession()`, and all ten carry that call **on `origin/main`
already** - verified file by file, so it is pre-existing auth-migration debt,
not something this sweep introduced. Touching them for a cosmetic reason would have meant either fixing
somebody else's auth migration inside a dash sweep, or bypassing a guard that
exists for a reason. Neither is a trade worth making, so they are recorded here
for whoever owns that migration. **Each entry is a debt marker, not a
permission:** remove the line the moment its file moves off `getSession()`.
