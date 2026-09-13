# The diamond wallet's tokens were never in scope, and the extraction finishes

**Date:** 2026-09-13
**Surface:** `src/components/store/DiamondWalletModal.jsx`, `DiamondWalletModal.module.css`
**Branch:** `agent/cw-hubwallet2/style/the-realism-extraction-finishes`
**Follows:** #1380 (2026-09-05, "the World Hub diamond wallet tells the truth,
and gets its realism"), which landed everything on
`agent/cw-hubwallet/fix/diamond-wallet-realism` except a two-line comment fix
that main already carried by other means. #1384, opened by autopilot for the
second push to that branch, was closed today as obsolete (rule 10.7, merged is
not landed).

## What was found

### 1. Sixty-three token references resolved to nothing (defect, shipped 8 days)

`DiamondWalletModal.module.css` declares the shared vault vocabulary on
`.wallet {}`: `--vault-cyan`, `--vault-gunmetal`, `--vault-chrome`,
`--vault-muted`, the display and label faces, and so on. Sixty-three rules in
the same file consume them through `var(--vault-...)`.

The JSX never applied `styles.wallet` to any element. Verified against
`origin/main` and against the #1380 squash (`bd470cfff2`): zero occurrences.

A custom property read outside the scope that declares it is "invalid at
computed-value time": `color` falls back to the inherited value,
`border-color` to `currentColor`, `background` to `transparent`,
`font-family` to the parent's. So the filter chips, the search frame, the
ledger rows, the send meter and the close button have been rendering since
2026-09-05 with the vocabulary silently missing, on a wallet whose stated
purpose was to read as the same hardware as the Club Arena vault.

The law written that day (`the-wallet-badges-count-the-whole-ledger`) asserted
the tokens were DECLARED, by reading the CSS file. It was true, and it was the
wrong half. Section 10.86 of the Club Arena CLAUDE.md names this shape: a check
that answers confidently about the thing it can see, when the failure is in
the thing it cannot.

**Fix:** the dialog root now carries
`` className={`${styles.preserveIdentityScope} ${styles.wallet} ${styles.dialog}`} ``.
**Pin:** the same law now matches the JSX for `styles.wallet` on the
`role="dialog"` element, not only the CSS for the declarations.

### 2. The extraction Dan chose was two thirds unfinished

Dan, 2026-09-05, asked which scope he wanted and chose "Full extraction to a
CSS module". The component carried 171 inline `style={{}}` objects that
morning, 139 after #1380, and 139 on `main` today. Everything below the filter
rail - the Send panel's recipient search, autocomplete and amount, the
confirmation plate, the whole Stats and Gift Activity panels, the empty and
error states, the group headers, the opened receipt, Load More, and the footer -
was still hand-painted in rgba().

**Now:** 5 remain, and each carries only a value the stylesheet cannot know:
the donut slice colour (`--swatch`), a ranked bar's width and colour
(`--bar-width`, `--bar-color`), the pull-to-refresh distance (`--pull-pad`),
and the daily-cap meter's fill width. The law pins that ceiling and refuses
any `style={{` whose first key is a plain presentational property.

While extracting, the same pass gave every control in those regions what the
earlier ones already had: `type="button"` on each button (a stray Enter inside
a form can no longer submit through them), an accessible name on the two
round dismiss buttons and the two text inputs, `aria-hidden` on decorative
icons, `role="alert"` on the transfer error and `role="status"` on the
success strip, `:focus-visible` rings on every new key, and no `:hover`
anywhere - a press is the feedback (Dan 2026-08-29). Debits read in chrome,
not red; spending diamonds is a normal act, which the ledger rows already
said and the Stats plates now agree with.

### 3. A pin on the old inline style

`diamond-store-phase-22` asserted the copy contract by matching
`textTransform: 'capitalize'` in the JSX. The contract is unchanged - the
dialog root capitalizes and identities inside it opt out through
`preserveIdentityScope` - but it lives in `.dialog {}` now, so the assertion
was moved to the stylesheet in the same commit (Club Arena CLAUDE.md 5.8:
update the test that pins behaviour you replace, in the commit that replaces
it).

## Verification

- `node --test __tests__/the-wallet-badges-count-the-whole-ledger.law.test.mjs`:
  all pass, including the two new assertions.
- `node --test __tests__/diamond-store-phase-22.test.mjs __tests__/diamond-store-phase-4.test.mjs __tests__/_test-guards-exist.test.mjs`
  (see the pull request's checks for the full run).
- 0 em dashes in either file; 0 `:hover`; 0 `onMouseEnter`.
- Live before this branch: `/api/health` on smarter.poker served
  `f1c4c001a1` = `origin/main`, whose modal has 139 inline styles and no
  `styles.wallet`.

## Not done here, and why

The Club Arena side of this same wallet programme is in
Smarter-Poker-Club-Arena PR #4490 (the relanded ledger, bay readout, Mint law
and the felt-colour migration file). It is a separate repo with its own
publisher, so it is not in this note beyond the pointer.
