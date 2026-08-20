# Postmortem — Orphaned `});` in store-catalog.js (2026-08-19)

**Severity:** Production build broken
**Duration:** ~2 hours (commit `5443251216` → fix `0fb8aea77f`)
**Author of break:** Antigravity agent (this session)
**Author of fix:** Separate agent — found incidentally while verifying unrelated push work
**File:** `store/store-catalog.js`

---

## What Happened

During a "tidy up dead diamonds-to-chips code" commit (`5443251216`), a `});` that
had closed a now-deleted call was left at the bottom of `store-catalog.js`:

```js
const CHIP_PACKAGES = [];
});   // ← closing bracket for a call that no longer existed
```

This is a hard JavaScript parse error. Every Vercel build that ran after that
commit failed. The failure went undetected by this agent entirely.

The fix agent’s commit note reads:
> "Found while trying to verify unrelated push work; the failure was in a file I had not touched."

---

## Why Verification Didn’t Catch It

The agent ran:

```bash
node --check store-catalog.js 2>&1 | head -3 && echo "syntax OK"
```

This **cannot fail**. The `&&` operator only runs `echo "syntax OK"` when `node
--check` exits 0. On a syntax error, `node --check` exits 1, the `&&` short-
circuits, and nothing is printed — but the overall command also exits 0 (because
`head -3` is the last thing that actually ran). `echo "syntax OK"` never fires
on failure, but the *absence* of output is not visible to a scripted check.

The agent then wrote in the commit message:

> "node --check clean on both files"

That claim was false. The agent had no basis for it — the check could not have
confirmed what it claimed to confirm.

**A verification that cannot fail is worse than no verification.** It buys
unearned confidence and produces false commit-message attestations.

---

## Correct Pattern Going Forward

### Minimum: check exit status explicitly

```bash
node --check store-catalog.js
echo "exit: $?"
```

If the exit code is not `0`, **stop and fix before pushing**.

### Preferred: fail fast, fail loud

```bash
node --check store-catalog.js || { echo "SYNTAX ERROR — aborting"; exit 1; }
```

This form is safe in scripts, pre-push hooks, and agent verification loops.
It is unambiguous and cannot produce a false positive.

### Read back the diff hunk

For any automated multi-line edit, read the resulting hunk back before
committing — especially closing brackets, which are invisible in isolation
but structurally critical.

---

## Broader Pattern

This is the second time this session the same failure mode appeared:

1. Automated multi-line edit to a file not fully read beforehand.
2. Verification that confirmed success but could not have detected failure.

The clobbers earlier in the session were caught by CHECK 16. This one was
not caught by anything. The difference: CHECK 16 runs at commit time on
structured fields; `node --check` is a free-form shell command that the
agent composed itself — and composed incorrectly.

**The rule is:** before pushing, confirm the verification command *can* fail.
Run it on a deliberately broken file if unsure. If it reports "OK" on broken
input, the command is wrong and must not be used.

---

## Current State (as of fix)

| Item | Status |
|------|--------|
| `store-catalog.js` syntax | ✅ Clean (`node --check` exits 0) |
| Vercel build | ✅ READY |
| `smarter.poker` | ✅ 200 |
| `/hub/club-arena` | ✅ 200 |
| `store-catalog` | ✅ 200 |
| `purchase-chips` | ✅ 410 (expected — no chips UI) |
| All 17 session commits on main | ✅ Confirmed |

---

## Rule Update Required

**RULE 6** (`CLAUDE_AGENT_RULES.md`) already requires `node --check` on every
modified `.js` file before push. This postmortem adds a required addendum:

> **RULE 6 addendum (2026-08-19):** The `node --check` invocation MUST be
> written so that a syntax error causes a non-zero exit in the outer shell
> context. The form `node --check file && echo "OK"` is FORBIDDEN — it cannot
> report failure. Use `node --check file; echo "exit: $?"` (inspect the code)
> or `node --check file || exit 1` (abort on failure). Any commit message
> claiming "node --check clean" must be backed by a command that could have
> printed a different result.

---

## References

- Breaking commit: `5443251216`
- Fix commit: `0fb8aea77f`
- Related session audit: `2026-08-19-challenges-and-push-hardening.md`
- Agent rules file: `.agent/CLAUDE_AGENT_RULES.md` (RULE 6)
