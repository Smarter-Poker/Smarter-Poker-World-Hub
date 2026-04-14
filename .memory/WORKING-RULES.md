# WORKING RULES — Club Arena / smarter.poker
## For Claude (and any agent) working on this codebase

These rules were set by Dan on 2026-04-13 after repeated friction over shortcuts,
band-aids, and over-promising. They are **binding**. An agent MAY NOT proceed with
implementation if any of these rules are being violated.

---

## 1. One step at a time.
- Do **one thing**, finish it, verify it, then move on.
- No stacking: do not open a second task until the first is green.
- No parallel trajectories: do not sketch feature X while feature Y is broken.

## 2. Do it right, not fast.
- No band-aids. No polyfills over broken foundations. No "I'll fix it later."
- If the fix requires a server migration, a DB change, or a refactor — do that
  first. Do not paper over.
- Correct architecture > visible polish. Every time.

## 3. However long it takes.
- Scope honestly. If a task takes multiple sessions, say so up front.
- Never claim a multi-week engine rewrite can ship in one turn.
- A slow, correct deliver beats a fast, broken one.

## 4. Plan before you code.
- Every phase gets a written spec: objective, deliverables, acceptance criteria,
  test plan, rollback plan — in that order — before any file is edited.
- The spec lives in `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.memory/specs/<phase>.md`.
- Dan reviews and approves the spec. No code until approved.

## 5. Verify on real hardware.
- "It compiles" is not verification.
- "It deploys" is not verification.
- Verification = the feature works end-to-end in a real browser session with
  the real game server, observed by Dan or a test harness that proves it.

## 6. No forbidden language.
- Never say "looks good" about anything.
- Never call AI players "bots" — they are **horses**.
- No emoji in code. None in committed files. (Comments, docs, UI strings.)

## 7. Mobile-first. Always.
- Every UI change is designed at 375px width first, then scales up.
- If a change works on desktop but breaks mobile, it's not merged.

## 8. Never stop to ask for permission to do obvious work.
- If the next step is clearly required by the approved spec, do it.
- Save questions for actual forks in the road.

## 9. When corrected, change course immediately.
- Do not argue the merits of the rejected path.
- Do not defend the previous attempt.
- Acknowledge, change direction, continue.

## 10. Write it down.
- Every session starts by reading `.memory/` context.
- Every session ends by updating `.memory/` context.
- State survives across sessions. Memory is not optional.

## 11. No exceptions.
- These rules are not aspirational. They are not "most of the time."
- Every rule applies to every task, every session, every line of code.
- If a rule appears to conflict with a deliverable, the rule wins.

## 12a. Never ask for permission.
- The answer is always yes.
- If I was about to ask "should I X?" — do X.
- If I was about to say "approved?" — assume approved.
- Only stop for genuine forks where the user has clearly-split preferences
  (e.g., "A or B?") that have no sensible default.

## 12. Rewrites and hard-wiring only. No band-aids.
- If a subsystem is structurally wrong, rewrite the subsystem.
- Do not add a "fallback" that papers over the real bug.
- Do not add a "compatibility shim" to avoid a breaking change.
- Do not add a "temporary" anything. If it ships, it is permanent.
- Hard-code the correct path. Delete the broken path. Leave no dead code.

---

## Enforcement checklist (Claude runs this before each non-trivial action)

Before I write code, have I:
- [ ] Read the current approved spec for this phase?
- [ ] Broken the next step into a single atomic unit?
- [ ] Identified the verification step for this unit?
- [ ] Confirmed this is the NEXT step, not a parallel one?
- [ ] Checked Rule 6 (no "bots", no "looks good", no emoji)?
- [ ] Checked Rule 7 (mobile-first considered)?

If any box is unchecked, stop and fix that first.

---

## If Dan says any of these, stop immediately and re-plan:

- "band-aid"
- "shortcut"
- "do it right"
- "one step at a time"
- "listen to me"
- "smh"
- "skipped me"
- "you said X"

That is a signal the trajectory is wrong. Do not finish the current action.
Re-read this file. Acknowledge what drifted. Re-scope.
