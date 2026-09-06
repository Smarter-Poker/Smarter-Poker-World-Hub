---
name: militaryprompt
description: Write a military-grade handoff PROMPT so another agent can pick up complex work in a fresh chat with zero context. Use when the user says #militaryprompt, asks for a handoff, or wants someone else to continue this work.
---

# militaryprompt - the handoff another agent can actually execute from

Produce a handoff **PROMPT**, not a status summary. The output is a document
the user can paste as the **first message of a brand-new chat** to an agent
that knows nothing, and that agent can then continue the work correctly
without asking a single question.

Then persist it, push it, present it, and explain it.

---

## THE TEST THIS OUTPUT MUST PASS

> A competent agent, in a cold chat, with only this document, can run the next
> action correctly and verify the result - without guessing, without asking,
> and without repeating a mistake already made.

If any sentence tells the reader *about* the work instead of enabling them to
*do* it, cut it or convert it into a command, a number, or a rule.

**A summary says "the scraper was fixed". A prompt says "run this command, it
must print 0, and here is what to do when it prints 3."**

---

## STEP 1 - GATHER. VERIFY EVERYTHING. ASSUME NOTHING.

Do not write a word until you have re-checked reality. Handoffs rot because
their author wrote from memory.

Gather, with the actual commands, and record what each one returned:

1. **Repo state** - every branch you touched, every PR with its number, state,
   and the **commit SHA on main**. Verify by FILE, never by the merge tick:
   `git fetch origin && git cat-file -e origin/main:<path>`.
2. **Deploy state** - merged is not deployed. Check the deploy workflow, the
   health endpoint, the served SHA, whatever this project's proof-of-live is.
3. **Data state** - run the queries. Put real numbers in a table with a
   before/after column. Numbers without provenance are decoration.
4. **In-flight work** - anything open, unpushed, half-applied, or waiting on
   CI. Say so explicitly, with how to check whether it landed since.
5. **What you could NOT verify** - say that too, and say why.

Timestamp the gathering pass. Every table in the document carries "verified
<date/time>".

---

## STEP 2 - WRITE THE PROMPT. TWELVE PARTS, IN THIS ORDER.

The order matters more than the content: it is ordered by what gets a fresh
agent into trouble fastest.

### Part 0 - Who you are and what you are picking up
Address the receiving agent in the second person. Their environment, the
project, the shape of the programme, where in it they are landing, and one
blunt sentence about anything that went wrong. State the date range of the
prior session and how much shipped.

### Part 1 - THE STOP CONDITIONS. Read before any work.
**This part exists because a fresh agent will otherwise breach a rule nobody
told them about, in their first ten minutes.**

- Any **binding instruction from the user, quoted verbatim**. Their words, in
  a blockquote, not your paraphrase. If they were angry, keep the anger - it
  is information about severity.
- Anything **currently disabled, gated, or paused**, why, and the exact
  condition for re-enabling it. Include the enabling command AND the sentence
  "you do not run this - the user does", if that is the case.
- A short **"what you must NOT do"** list.

If the prior session was halted or corrected, that goes here, first, before
any achievement.

### Part 2 - Environment bootstrap. Run these first.
Exact, copy-pasteable. Include:
- How to confirm they are in the right environment at all.
- **PATH, tool and shell quirks** (e.g. "node is not on the default PATH,
  prefix every command with ...", "macOS sed is BSD sed - it has no `\?` or
  `\|` and will silently do nothing; use Python for edits").
- **Long-running command handling** - if the tooling kills processes on
  timeout, give the exact working incantation, and say plainly that the
  obvious approaches (`nohup &`, `disown`) do not work.
- **Where credentials live - the place, never the value.** And whether the
  agent is permitted to write one (usually: no).
- Paths to every repo, worktree and clone, and which ones are off-limits.

### Part 3 - How the thing actually works
A call path, a pipeline diagram, or a flow in plain text - from trigger to
outcome, naming the real files at each hop. This is what lets them reason
instead of grep blindly. Include the cadence/volume so they can tell a healthy
run from a broken one.

### Part 4 - Complete state inventory
- Before/after metrics table.
- Every PR: number, commit on main, one line of what.
- Every migration or irreversible change, by name.
- Every new object, route, table, schedule.

### Part 5 - The task that blocks everything else
The single next action, in detail:
- What is already done, what is NOT done, stated separately.
- The exact commands or script to reproduce the current position.
- The decision the user has to make, and the options.
- **Branch the instructions**: "if they say no, do X; if yes, do Y" - with Y
  spelled out step by step through to verification.

### Part 6 - The full backlog, prioritised, with reasons
Group HIGH / MEDIUM / LOW. For each: what, the measured evidence, and what
"done" means. Include three categories people usually omit:
- **Done differently than specified** - where you deviated from a contract and
  why the deviation was right.
- **DECLINED, do not build** - with the reason (policy, legal, terms of
  service). Say explicitly: "if a future agent 'fixes' this by building it,
  that is a mistake."
- **BLOCKED on a human** - what is needed, from whom, and that it is not an
  agent's call.

### Part 7 - Every defect found, and its lesson
For each: the symptom (quote the real bad output), the cause, the fix, and the
generalisable lesson. Then name the **shape they share**, if they share one -
that is the thing that stops the next one.

Weight this by what was surprising, not by what was hard.

### Part 8 - Traps and instruments that lie
The failures that produce a *confident wrong conclusion*:
- Tools that return success while doing nothing.
- Rate limits or throttles that look like "not found".
- Probes weaker than the real code, giving false negatives.
- Merge/deploy signals that are true while the outcome is false.
Give the detection command for each.

### Part 9 - Verification commands
Copy-pasteable, grouped by purpose. For each, say **what a healthy result
looks like** and what to do when it does not. Include:
- Verify the previous work actually landed (files, not ticks).
- Verify production health.
- The full build gate, in order, with expected pass counts.

### Part 10 - File map
Table: path -> what it does. Only files that matter. Mark clearly which are
live, which are dormant, and which are deliberately not wired.

### Part 11 - How to behave on this work
The working norms: read real output before believing tests, fix-first, write
your own changelog file, measure rather than assume, suspect the instrument,
never pad a number to meet a target, ask before anything user-visible changes
shape.

### Part 12 - Opening moves, in order
A numbered list of the first 5-8 actions. End with what they can safely work
on while blocked, and repeat the single hardest prohibition as the last line.

---

## STEP 3 - PERSIST IT WHERE IT SURVIVES

A handoff in a chat log is not a handoff.

1. **Write the file** into the project's handoff or docs location - e.g.
   `.agent/handoffs/YYYY-MM-DD-<SLUG>-HANDOFF-PROMPT.md`. Match whatever
   convention the repo already uses.
2. **Commit on a FRESH branch cut from current `main`** and push it. Never
   re-push a branch whose PR already merged - on estates with auto-merge, the
   branch moves, the PR stays merged, the push exits 0, and the commits reach
   nobody.
3. **Delete any earlier, weaker handoff** you are superseding, in the same
   commit, so there is exactly one.
4. **Copy it to the outputs folder and present it** with `present_files` so
   the user can open it immediately.
5. Write a commit message that says what the document is FOR, not just that it
   exists.

---

## STEP 4 - THE EXPLANATION AFTERWARDS

After presenting the file, tell the user in chat:

1. **What it is** - a prompt to paste into a fresh chat, in one sentence.
2. **What changed, if you are replacing something** - name the specific
   weakness ("it was a status summary; it told a reader about the work instead
   of letting an agent execute it").
3. **A walk through the parts that carry the most weight**, and *why each is
   where it is* - especially why the stop conditions lead.
4. **The specific things it protects against** - name the traps and the
   defects it encodes.
5. Keep it short. The document is the deliverable; this is the label on it.

---

## RULES FOR THE WRITING ITSELF

- **Second person, imperative.** "Run this", "Do not enable that."
- **Quote real artefacts.** Real bad output, real error strings, real user
  words. A paraphrase of a bad post is not a bad post.
- **Every number carries provenance** - what was measured, and when.
- **Every claim is checkable** - pair it with the command that checks it.
- **Say what you did NOT verify.** A confident wrong statement in a handoff
  propagates further than a gap.
- **Include the mistakes.** A handoff that only reports success teaches the
  next agent nothing and lets them repeat it. Own the errors plainly, without
  self-flagellation - the point is transmission, not apology.
- **No em dashes** in the output if the project bans them; check the project's
  copy rules before writing.
- Length is whatever completeness requires. For a multi-phase programme with
  weeks of context, expect 600-900 lines. **Do not pad, and do not compress
  away a command.**

---

## FAILURE MODES OF THIS SKILL

- **Writing a summary.** The tell: the reader learns what happened but cannot
  do anything. Fix: convert statements into commands and decision branches.
- **Trusting your own memory.** Re-verify in Step 1. Every time.
- **Burying the stop conditions** under achievements. They lead. Always.
- **Omitting the failures** to look competent. That is the single most
  expensive omission available to you.
- **Vague next actions.** "Continue Phase 5" is not an action. "Run this
  script, show the user the output, wait for a yes, then wire X into Y" is.
