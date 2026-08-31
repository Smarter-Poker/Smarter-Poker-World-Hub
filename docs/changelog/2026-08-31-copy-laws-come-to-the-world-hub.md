# The two copy laws come to the World Hub

**2026-08-31.** Dan: "MAKE SURE THE FIRST LETTER OF EVERY WORD ON EVERY SINGLE
PAGE AND SUB PAGE IS CAPITALIZED AND REMOVE ANY AND ALL M BARS AS THEY ARE
BANNED FROM USE."

Both laws already existed. Both were enforced **only inside Club Arena**, which
is one app inside the site. The World Hub is `pages/`, `src/`, `app/` and
`components/` - most of the pages a player ever actually sees - and it had
neither gate. So it had quietly drifted to:

- **3,887 lines of player-facing copy carrying an em dash**, across 787 files;
- **1,988 text nodes that were not Title Cased**, across 583 files.

Fixing that without landing the gate would only start the drift again, so both
scripts are ported and both now run in the Build Safety Gate as CHECK 19 and
CHECK 20.

## What was ported, and what changed in the porting

Club Arena is TypeScript-only under `src/`. The World Hub is a mix of `.js`,
`.jsx`, `.ts` and `.tsx` across four roots, so both scripts learned the wider
extension set and the wider root set. The careful part of `check-title-case` -
the TypeScript AST walk, and its `{n}s` / `x{count}` suffix and prefix guards -
is unchanged, because those guards are what stop it rendering "GameS" and
"X1,234".

## The em dash sweep found code, not copy, and it would have broken things

A blanket character swap is exactly as dangerous as it sounds. The first `--fix`
run rewrote sites where an em dash is **executable**:

```js
dateStr.split(/\s*[-–]\s*/)                              // date ranges
post.content.match(/^Checked in at (.+?)(?:\s*[—–]\s*(.+))?$/i)
bn.split(' — ')[0]                                       // scraped venue names
```

`[-–]` became `[--]` - a valid, meaningless range - and every one of those
parsers silently stops matching. Club Arena's own version of this gate did the
same thing to its own stripper on its first run; this repo had ten parsers of
that shape waiting for it.

Two defences, so it cannot happen again:

1. **Regex literals are blanked structurally**, alongside comments, before
   anything is scanned or patched. The detector is deliberately conservative -
   a `/` only opens a literal where an operand is legal - so anything ambiguous
   is left alone, which can only make the gate stricter, never wrong.
2. **A file list and a line-level opt-out** for the cases that are genuinely
   parsing data that already exists. `.split('—')[0]` pulls a venue out of
   a `Checked in at <venue> — <note>` post that a scraper wrote months ago;
   swapping the character makes every one of those rows stop parsing. That is a
   data migration with a decision behind it, not a copy fix, and this gate does
   not get to make it. Each entry carries its reason, and
   `ui-text-ignore: <reason>` requires one.

Three more coupled sites were checked by hand and left swept because producer
and consumer are in the same file and both are computed at runtime, not stored:
`PLOHandSelection` tier labels, `AICoachEngine` study-plan focus strings built
from `LeakDetector` descriptions, and the `useTourMapStops` display name.

## Verification

- Every one of the 1,052 changed code files re-parsed with the TypeScript
  parser: **0 parse errors**.
- Both gates green on the swept tree, and both were proven to FAIL on a
  reintroduced violation before being trusted.
- The four restored parsers were re-read to confirm they still hold their real
  characters.

## Still outstanding, deliberately

Em dashes inside **comments** are untouched, in both repos - roughly 30,000 of
them. They are not copy, and they are where these repos keep their reasoning.
Rewriting them would touch nearly every file at once while the merge queue is
already deep, which would jam it rather than drain it. The player-facing ban is
now enforced in both directions, in both repos. The comment sweep is a separate
mechanical pass whenever Dan wants it.
