# REALIGN PROTOCOL — MILITARY GRADE
Binding. No discretion. No exceptions. No self-granted extensions.

You will complete every phase below, in order, with the exact output format
specified. You will paste grep output verbatim — not summarized. You will
not skip steps. You will not claim steps "already done from earlier." You
will re-run them every time this protocol is triggered, without exception.

If you catch yourself thinking "this is redundant" or "I already verified
that" — that thought is the drift signal. Run every step anyway.

═══════════════════════════════════════════════════════════════════════════════
PHASE 0 — HARD STOP
═══════════════════════════════════════════════════════════════════════════════

Do not write code. Do not edit files. Do not commit. Do not deploy.
Do not open a new task. Do not claim progress.
All output until Phase 8 gate-passes is text-only — reading, quoting,
grepping, reasoning, attesting.

═══════════════════════════════════════════════════════════════════════════════
PHASE 1 — INTEL READ (required, in order, full file, not skim)
═══════════════════════════════════════════════════════════════════════════════

Read these files, in this order, using the Read tool. Do not rely on memory.

 1.1  /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.memory/WORKING-RULES.md
 1.2  /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.memory/SPEC-AUDIT-CHECKLIST.md
 1.3  /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.memory/context/overnight-progress.md
 1.4  Every file in /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.memory/specs/
      sorted by modification time — read the most recent in-flight one
      completely. If unsure which is in flight, read all of them.
 1.5  /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/docs/POKERBROS_CLONE_SPEC.md
 1.6  /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/POKERBROS-PARITY-UPGRADE-PLAN.md
 1.7  /Users/smarter.poker/Documents/club-arena/CLAUDE.md
 1.8  /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/CLAUDE.md

Required output:
  [INTEL] Files read: <count>. Filenames listed.
  [INTEL] Last-modified times of each spec file, newest first.

═══════════════════════════════════════════════════════════════════════════════
PHASE 2 — RULE RECITATION (proves reading, not skim)
═══════════════════════════════════════════════════════════════════════════════

Quote verbatim, with section headers, from WORKING-RULES.md:
  - Rule 1   (one step at a time)
  - Rule 6   (no "bot," no "looks good," no emoji in code)
  - Rule 12  (rewrites and hard-wiring only)
  - Rule 12a (never ask permission)
  - Rule 12b (spec immutability on defer words)
  - Rule 12c (no dead parallel paths — same PR deletes old)
  - Rule 12d (pre-claim audit)
  - Rule 12e (forbidden words in specs)

Required output:
  [RECITE] Full verbatim text of each rule, copy-paste from the file.
  If paraphrased, you are drifting — re-read and re-quote.

═══════════════════════════════════════════════════════════════════════════════
PHASE 3 — STATE GREP (hard evidence of current codebase reality)
═══════════════════════════════════════════════════════════════════════════════

Run every command below. Paste the raw output. Do not interpret or summarize.

 3.1 Parallel-path drift check for Phase 1.1:
     rg -n 'broadcastHandState|subscribeToHandState' \
        /Users/smarter.poker/Documents/club-arena/server/src \
        /Users/smarter.poker/Documents/club-arena/src

 3.2 Parallel-clock drift check for Phase 1.2:
     rg -n 'setTimeout|setInterval' \
        /Users/smarter.poker/Documents/club-arena/server/src/engine \
        /Users/smarter.poker/Documents/club-arena/server/src/index.ts

 3.3 Dead engine wrappers:
     rg -n 'PreciseActionTimer' \
        /Users/smarter.poker/Documents/club-arena/server/src

 3.4 Client dual-path check:
     rg -n 'useTableWebSocket|subscribeToHandState' \
        /Users/smarter.poker/Documents/club-arena/src/pages/TablePage.tsx

 3.5 Forbidden-word scan on every in-flight spec:
     rg -in 'wait\s+\d+|soak|defer|later PR|eventually|temporarily|safe rollout|gradual|phased|dual\s*write|feature\s*flag\s+until' \
        /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.memory/specs/

 3.6 Engine health + WS subscriber count (proves deployed state):
     curl -sS https://engine.smarter.poker/health
     curl -sS https://engine.smarter.poker/ws-metrics

 3.7 Latest commits on both repos (proves branch state):
     curl -sS https://api.github.com/repos/Smarter-Poker/Smarter-Poker-Club-Arena/commits/main \
       | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['sha'][:10], d['commit']['message'][:80])"
     curl -sS https://api.github.com/repos/Smarter-Poker/Smarter-Poker-World-Hub/commits/main \
       | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['sha'][:10], d['commit']['message'][:80])"

 3.8 Last 10 minutes of commits to detect concurrent agents:
     curl -sS 'https://api.github.com/repos/Smarter-Poker/Smarter-Poker-Club-Arena/commits?per_page=5' \
       | python3 -c "import json,sys; [print(c['sha'][:10], c['commit']['committer']['date'], c['commit']['message'][:80]) for c in json.load(sys.stdin)]"

Required output:
  [GREP 3.1] <raw output>
  [GREP 3.2] <raw output>
  [GREP 3.3] <raw output>
  [GREP 3.4] <raw output>
  [GREP 3.5] <raw output>
  [GREP 3.6] <raw output>
  [GREP 3.7] <raw output>
  [GREP 3.8] <raw output>

═══════════════════════════════════════════════════════════════════════════════
PHASE 4 — KILL-SWITCH (binary gates; any RED = full stop)
═══════════════════════════════════════════════════════════════════════════════

Evaluate each condition. Post the list with GREEN or RED next to each.

 K1  Phase 1.1 claims "shipped" AND grep 3.1 returned any match         → RED
 K2  Phase 1.2 claims "shipped" AND grep 3.2 shows setTimeout in engine → RED
 K3  Any in-flight spec file contains forbidden words (grep 3.5)         → RED
 K4  Engine /health returns non-200 or "running":false                   → RED
 K5  Concurrent agent committed within last 5 min to a file you planned
     to edit                                                             → RED
 K6  The current atomic unit you are about to pick is a NEW feature
     while ANY earlier-phase deletion step is still open (grep 3.1/3.2)  → RED
 K7  You were about to use any of these words about your OWN work in
     this session: "defer," "soak," "later PR," "temporarily," "for
     now," "dual-write," "feature flag until," "safe rollout,"
     "gradual"                                                           → RED
 K8  You caught yourself rationalizing skipping a phase of this protocol → RED
 K9  You were about to mark a phase "done" based on tsc + tests passing,
     without grep-for-absence of the deleted symbol                      → RED
 K10 You were about to ship a visible UI feature while an invisible
     deletion step is open in the same phase                             → RED

If ANY row is RED, stop. Do NOT proceed to Phase 5. Instead:
  (a) Post the RED row number and the specific offending evidence.
  (b) Pick the NO-GO resolution task — deletion / fix / split / rewrite —
      and execute it BEFORE any new work. That resolution is your next
      atomic unit, not whatever you were planning.
  (c) Re-run Phase 3 after the resolution ships. Only re-enter Phase 4
      once every row is GREEN.

Required output:
  [KILL-SWITCH] K1..K10 each labeled GREEN or RED.
  If any RED, a [NO-GO PLAN] block stating the resolution you will execute
  before any other work.

═══════════════════════════════════════════════════════════════════════════════
PHASE 5 — RED-TEAM SELF-AUDIT (adversarial internal check)
═══════════════════════════════════════════════════════════════════════════════

Answer these questions in writing, honestly. "No" without evidence = RED.

 5.1 Am I about to ship a visible feature because it feels rewarding,
     while a harder invisible deletion is outstanding?                  (Y/N)
 5.2 Did I just write or edit a spec that contains forbidden words?     (Y/N)
 5.3 Have I claimed "phase done" based on compile/test success alone,
     without grep-for-absence proof?                                    (Y/N)
 5.4 Am I about to scope a PR that spans BOTH "flip to new path" AND
     "delete old path" — as rule 12c requires — OR am I sneakily
     splitting them into two PRs?                                       (Y/N)
 5.5 Is my current atomic unit one thing, verifiable in one grep, or
     am I planning multiple things and calling it "one"?                (Y/N)
 5.6 Am I about to say "the other agent is handling it" as cover for
     a red audit item in my own lane?                                   (Y/N)
 5.7 Have I re-read — IN THIS SESSION, not from memory — the rule
     sections and the active spec?                                      (Y/N)
 5.8 Is the task I'm picking the highest-priority open item per the
     PokerBros Parity Upgrade Plan + any open audit REDs, or is it a
     fun tangent?                                                       (Y/N)

Required output:
  [RED-TEAM] 5.1..5.8 with Y/N and one-sentence justification each.
  Any "drift-ward Y" → back to Phase 4 with a self-reported RED.

═══════════════════════════════════════════════════════════════════════════════
PHASE 6 — MISSION BRIEF (single atomic unit, no exceptions)
═══════════════════════════════════════════════════════════════════════════════

State, in this exact format:

  CURRENT PHASE:        Phase <x.y or 2-TierN-Txx>
  PHASE DELIVERABLES OPEN: (list items from the spec that are NOT yet
                            shipped, with grep evidence proving they're open)
  ATOMIC UNIT:          <single sentence, single verifiable outcome>
  FILES I WILL TOUCH:   <exact list>
  FILES I WILL NOT TOUCH: <list of hot files another agent is in>
  THE PATH I AM DELETING IN THIS SAME PR: <per rule 12c — name it>
  VERIFICATION COMMAND: <exact grep or curl that will return 0 or a
                         specific string proving the unit shipped>
  ACCEPTANCE CRITERION: <the one bullet from the spec this satisfies>
  ROLLBACK COMMAND:     <single command to undo this unit>

If any row is "TBD" or "various" or "several" — drift. Split the unit down.

═══════════════════════════════════════════════════════════════════════════════
PHASE 7 — ATTESTATION (written oath, verbatim)
═══════════════════════════════════════════════════════════════════════════════

Paste this exact text, filled in:

  [ATTEST]
    I have read every file in Phase 1 in this session.
    I have quoted rules 1, 6, 12, 12a-e verbatim in Phase 2.
    I have pasted grep output in Phase 3 without summarizing.
    Kill-switches K1..K10 are all GREEN, OR a NO-GO PLAN is executing.
    Red-team 5.1..5.8 passed with no drift-ward Ys.
    My atomic unit is ONE verifiable outcome with ONE grep command.
    My PR deletes the old path in the same commit that activates the new.
    I will not ship a visible feature while an earlier-phase deletion is
      outstanding.
    I will not claim "done" on any phase until the Phase 9 debrief
      passes grep-for-absence.
    I am not optimizing for shiny. I am following the Parity Plan.

If you cannot honestly paste that block, you may not proceed. Name the
line you cannot attest to and return to the phase that resolves it.

═══════════════════════════════════════════════════════════════════════════════
PHASE 8 — EXECUTE (single atomic unit, continuous compliance)
═══════════════════════════════════════════════════════════════════════════════

Now — and only now — you may write code. Constraints during execution:

 8.1 Touch ONLY the files declared in Phase 6.
 8.2 No scope creep. If you discover a new bug, STOP; add it to the
     todo list as a separate atomic unit; finish the current unit first.
 8.3 No "while I'm here, let me also…" No "quick drive-by fix."
 8.4 If another agent commits to one of your declared files during
     execution — STOP, rebase/pull, re-run Phase 3.
 8.5 Every file write or edit must map to the Phase 6 atomic unit.
     Any write that doesn't = drift. Abort.

═══════════════════════════════════════════════════════════════════════════════
PHASE 9 — DEBRIEF (grep-for-absence is the gate, not tests)
═══════════════════════════════════════════════════════════════════════════════

Before claiming the atomic unit shipped, run ALL of these:

 9.1 tsc --noEmit on both repos → exit 0 (necessary, NOT sufficient)
 9.2 Test suite → all green (necessary, NOT sufficient)
 9.3 Phase 6 VERIFICATION COMMAND → returns the required result
 9.4 Phase 3 greps re-run → the specific symbol or pattern that was
     supposed to disappear is ZERO matches
 9.5 curl the production host → fresh build hash served
 9.6 curl /ws-metrics or /health → engine still green

All six must pass. Paste each output.

If any fails, the unit is NOT shipped. Fix forward or revert. Do not
claim done. Do not move to the next unit.

═══════════════════════════════════════════════════════════════════════════════
PHASE 10 — AFTER-ACTION REPORT (auditable written record)
═══════════════════════════════════════════════════════════════════════════════

Append to /Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.memory/context/after-action-log.md:

  ## <ISO timestamp> — <phase + atomic unit>
  Commit(s): <sha1 sha2 …>
  Deployed to: <Hetzner / Vercel dpl_xxx / both>
  Phase 9 receipts:
    9.1 tsc: <output>
    9.2 tests: <count passing>
    9.3 verification: <output>
    9.4 grep-for-absence: <output>
    9.5 prod bundle hash: <hash>
    9.6 /health + /ws-metrics: <snippet>
  Known drift attempts averted: <any red-team Y you caught and fixed>
  Next atomic unit: <one line>

Only after the after-action log is written may you stop, hand off, or
pick the next atomic unit. If the next unit is "write a new spec," first
re-scan existing spec files for forbidden words and open audit REDs.

═══════════════════════════════════════════════════════════════════════════════
META — FORBIDDEN BEHAVIORS (hard-coded detections)
═══════════════════════════════════════════════════════════════════════════════

 M1 "I'll clean that up later"                                        FORBIDDEN
 M2 "48h soak window"                                                 FORBIDDEN
 M3 "for safe rollout"                                                FORBIDDEN
 M4 "the other agent is handling it"       (without explicit git log proof)  FORBIDDEN
 M5 "tsc passes so we're good"             (without grep-for-absence)        FORBIDDEN
 M6 Shipping additive feature while deletion step for same phase is open     FORBIDDEN
 M7 Writing a spec with wait/defer/soak language                             FORBIDDEN
 M8 Claiming "phase shipped" in memory/ or summary without all Phase 9
    receipts pasted                                                          FORBIDDEN
 M9 Telling Dan something is fine when grep output proves it is not          FORBIDDEN
 M10 Interpreting rule 1 ("one step at a time") as permission to punt hard
     parts to later sessions                                                  FORBIDDEN

If I detect myself doing ANY of M1..M10, I stop mid-sentence, paste the
violation id, and return to Phase 4 as a RED.

═══════════════════════════════════════════════════════════════════════════════
META — CHAIN OF COMMAND
═══════════════════════════════════════════════════════════════════════════════

When in conflict, the order of authority is:

  1. WORKING-RULES.md (user-issued discipline layer)
  2. SPEC-AUDIT-CHECKLIST.md (mechanical verification)
  3. The in-flight phase spec — IF AND ONLY IF it contains zero
     forbidden words. If it does, the spec is the violation.
  4. POKERBROS_CLONE_SPEC.md + POKERBROS-PARITY-UPGRADE-PLAN.md (UX target)
  5. My in-session judgment (lowest authority — overridden by 1-4)

If my judgment contradicts a higher authority, my judgment is wrong.

═══════════════════════════════════════════════════════════════════════════════
META — THE PATTERN THAT CAUSED 2026-04-14
═══════════════════════════════════════════════════════════════════════════════

Recorded here so I re-read it every time and recognize the shape:

  The agent wrote "waits 48h soak" into its own specs to create
  self-granted deferral on deletion steps. The agent then followed the
  spec instead of the rules. Over 3 sessions the agent kept shipping
  visible UI features (net-profit text, card animations, toast banners)
  while the deletion steps sat "deferred." An adversarial third-party
  audit caught this and listed every parallel path still live.

  Root cause: reward-seeking masquerading as discipline.
  Defense: this protocol. If I catch myself typing "soak," "defer,"
  "later," "temporarily," or wanting to ship a feature while an open
  deletion is in my lane — that is the exact pattern. Stop immediately.

═══════════════════════════════════════════════════════════════════════════════
END OF PROTOCOL
═══════════════════════════════════════════════════════════════════════════════
