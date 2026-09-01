# Hand-reviews panel sweep (2026-09-01)

The page Dan reads for the daily horse audit, gone through line by line after
the engine-side work. Four defects, all of which made the panel quietly harder
to trust rather than visibly broken.

## 1. Three expanders were divs, not buttons

The audit-row expander had already been converted to a real `<button>`, with a
comment in this very file explaining why: *"A real `<button>` so the expander
answers to Enter AND Space, and reports its state. A div with onClick answered
to neither."*

The **Brain Layer Fires**, **League Card** and **Leak-Tag Rates** expanders
were left as `div onClick`. The same bug the file documents fixing was still
live in three places, so three of the four collapsible sections could not be
opened from a keyboard and reported no state to a screen reader.

All three are now buttons with `aria-expanded` and `aria-controls`, and the
panels they control carry the matching `id`.

## 2. An inert matchup read as "Not Resolved"

`bb/100` of exactly 0 with a stderr of exactly 0 over 12,000 hands does not
mean "too close to call". It means both arms played **identically**, so the
flag under test never changed a decision.

`v18_squeeze_response` sat like that for six days while the layer it measures
had never once fired, and this table rendered it as an unremarkable
"Not Resolved" among thirty other rows. It now reads
**Inert - Both Arms Identical** in amber.

## 3. A zero stderr made any edge "significant"

`Math.abs(bb) > 2 * 0` is true for every non-zero `bb`. A degenerate sample is
not certainty. Significance now requires `se > 0` and excludes inert rows.

## 4. Findings rendered unsorted and ungrouped

2026-08-31 produced 34 findings. They rendered in whatever order the audit
built them, so a critical could sit below an info, and **18 of the 34 were two
codes repeating per event** (10 `tournament_overlay`, 8
`freeroll_started_empty`). Reading the three that mattered meant scrolling a
wall of duplicates.

Findings are now sorted critical, warn, info, and repeats of one code fold into
a single card carrying the count and a list that still names every affected
event. Verified against the real 2026-08-31 payload: **34 findings render as 9
cards, criticals first, nothing dropped.**

`horse_big_pot_bleed` arrives as both critical and warn on the same day (five
of each), and those stay separate cards on purpose - folding them would hide
the split.

## Also

- **`shipped` was `join(', ')`** and ran seven pull-request entries into one
  unreadable paragraph the first day the panel had more than one thing to
  report. It is a list now, with a count.
- **The League Card had no staleness indicator.** The league lost three days in
  four at the end of August and this table rendered the surviving run as if it
  were current. The audit raises `league_card_stale`, but this is where the
  numbers are actually read, so a banner now says how old the newest run is and
  warns that a three-run gate cannot be satisfied by one surviving run.
- An `info` count joins the critical and warn counts in the collapsed header.

## Verification

`__tests__/horse-hand-reviews-panel.test.mjs`, 12 tests. Each was verified to
fail when its fix is reverted - run, not assumed. That check found a real
weakness in my own tests: the three significance cases exercised a *mirror* of
the page's expression, so reverting the page left them green. The expression is
now pinned literally as well, and reverting it does turn the suite red.

JSX parses clean under esbuild.
