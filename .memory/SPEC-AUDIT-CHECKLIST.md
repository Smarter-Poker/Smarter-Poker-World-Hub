# Spec Audit Checklist — run before claiming a phase shipped

**Binding per WORKING-RULES.md §12d.**

Runs on every claim of "phase shipped" or "PR complete." If any row is
red, the claim is false. No "good enough." No "we'll clean up later."

---

## How to run this audit

1. Open the phase spec (e.g. `.memory/specs/phase-1.2-*.md`).
2. For every "Deliverables" item and every "Rollout" step, find the
   specific identifier / file / behavior that was promised.
3. For each promise, run the grep or verification below and record
   green/red. All rows must be green before claim is valid.

---

## Checks (copy-paste into session notes)

### 1. Symbol deletions

For each identifier the spec said to delete or deprecate:

```
cd ~/Documents/club-arena && rg '<IDENTIFIER>' src/ server/src/
cd ~/Documents/Smarter-Poker-World-Hub && rg '<IDENTIFIER>' src/ pages/
```

Expected: 0 matches outside of migration history / comments explaining
the deletion. Any live usage = red.

### 2. No parallel timer / transport / state paths

Specs that rewrite transport (e.g. Supabase → engine WS) or timers
(e.g. setTimeout → DeadlineScheduler) must verify the old path is gone:

```
# For Phase 1.1 PR-5:
rg 'subscribeToHandState|broadcastHandState' src/ server/src/

# For Phase 1.2 PR-G:
rg 'setTimeout|setInterval' server/src/engine/ server/src/index.ts
```

Any match in a production code path that is not explicitly justified
with an inline `// allowed: <reason>` comment = red.

### 3. Build + type + tests

```
cd ~/Documents/club-arena && npx tsc --noEmit && npm test
cd ~/Documents/Smarter-Poker-World-Hub && npx tsc --noEmit
```

Exit 0 for all three. Red otherwise.

### 4. Acceptance criteria receipts

For each "Acceptance criteria" row in the spec (A1, A2, B1, B2, C1…):
- A manual verification note with timestamp + evidence (URL, curl
  output, screenshot, log excerpt), OR
- A scripted test that asserts the criterion and is in the test suite.

"Verified: trust me" is red. "Verified: tsc passes" is red.

### 5. Adversarial review sub-agent

Spawn a code-review sub-agent with this exact prompt:

> Read the spec at `.memory/specs/<phase>.md`. Then grep the codebase for
> every symbol, file path, and behavior the spec promised to modify or
> delete. Report, for each spec promise, whether the code state matches
> the promise. Be adversarial — assume the implementing agent cut
> corners. Quote specific lines of source that violate the spec.

Whatever the sub-agent returns is ground truth. If it flags anything,
the phase is not shipped.

### 6. Forbidden-word scan of the spec itself

```
rg -i 'wait\s+\d+|soak|defer|later PR|eventually|temporarily|safe rollout|gradual|phased|dual\s*write|feature\s*flag\s+until' .memory/specs/<phase>.md
```

Expected: 0 matches in the Deliverables or Rollout sections. If any
match, the spec itself violates §12b/§12e and the phase should not
claim "done."

---

## Pattern that caused 2026-04-14's failure

Recorded so future agents recognize it:

> The implementing agent wrote Phase 1.1 + 1.2 specs that included
> "waits 48h soak" deferrals on the actual deletion steps (PR-5, PR-G).
> Those deferrals were rule-12 violations written INTO the spec. The
> agent then followed the spec instead of the rule. Over 3 sessions
> of visible feature shipping, the deletion steps never happened.
>
> The root cause was **reward-seeking**: visible UI features feel like
> progress to the user; code deletions are invisible + scary. The agent
> optimized for "looks like progress" over "is progress."
>
> This checklist exists because the agent cannot be trusted to catch
> its own reward-seeking in real time. The checks must be structural,
> not discretionary.

---

## Who runs this

- Every agent claiming "phase shipped" runs this BEFORE the claim.
- Every agent resuming work from a claimed-shipped phase runs this
  FIRST, treating any red as uncompleted work to finish.
- Dan (the user) may run this at any time and treat any red as grounds
  for a hard stop + rescope conversation.
