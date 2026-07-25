# HANDOFF: Build-verify and deploy the 2026-07-25 training-games audit fixes

Origin: Cowork cloud session (no network path to git push from the container).
The fixed files are ALREADY WRITTEN to the working tree at
`~/Documents/Smarter-Poker-World-Hub`. This handoff is executable end-to-end by
any agent on Dan's Mac with repo access. Full audit record:
`.agent/audits/2026-07-25-training-games-full-audit.md`.

## What changed

41 files, all inside the training vertical (World Hub repo only — nothing in
club-arena, nothing in `public/hub/club-arena/`):

- `src/engines/`: DeterministicGTOEngine.js, PostflopScenarioGenerator.js,
  PostflopStrategyEngine.js, HandStrengthEngine.js, BoardTextureEngine.js,
  EVCalculator.js, GTOScoreEngine.js, deterministicEnginePatches.js
- `src/hooks/`: useGTOTrainer.js, useGTOWScore.js
- `src/components/training/`: GodModeArena.jsx, GameUIRouter.jsx,
  LevelSelector.tsx, QuizModeEngine.jsx, GTOQuestionCard.jsx,
  games/UniversalDynamicTable.jsx, games/PsychologyTiltControlUI.jsx
- `src/config/`: GameScenarioMap.ts, gameConfigs.js, trainingConfig.js,
  postflopSolverData.js
- `src/data/`: TRAINING_LIBRARY.js, psychologyQuestionBank.js (NEW FILE)
- `pages/api/training/`: batch-preload, bookmark-solution, challenges,
  get-progress, get-question, hand-of-the-day, icm-calc, next-street, progress,
  save-progress, save-session, smart-practice, solver-api, spot-drill,
  tournaments
- `pages/hub/training/`: challenges.js, quiz-gauntlet.js, spr-trainer.js
- `.agent/audits/2026-07-25-training-games-full-audit.md` (NEW)

These were 3-way merged against the 2026-07-19 engine-audit wave already on
origin/main — if `git status` shows these files modified, that is expected.
IMPORTANT: an Antigravity `git reset --hard origin/main` will DESTROY these
uncommitted fixes. Execute this handoff promptly.

## Steps (this repo's canonical process — CLAUDE.md section 1)

1. Clear stale locks:
   `rm -f ~/Documents/Smarter-Poker-World-Hub/.git/index.lock`
2. Sanity: `cd ~/Documents/Smarter-Poker-World-Hub && git status --short`
   — confirm the changed set is (a subset of) the list above plus whatever
   other agents touched. Do NOT stage unrelated agents' files if avoidable.
3. Push via the ONLY authorized command (runs the Phase 2.5 `npx next build`
   gate itself):
   `bash scripts/git-safe-push.sh "training-games full audit: fix 120+ bugs across engine, arena, table UI, APIs; add psychology question bank (see .agent/audits/2026-07-25-training-games-full-audit.md)"`
   All git commands with BypassSandbox: true per current deploy guidance.
4. Success criteria: script exits 0 with `DEPLOY_VERIFIED:true` and
   `SHA_MATCHED:true`. If the build gate fails, read the error — every file
   passed parser-level checks, so failures would be environment/import-level;
   fix forward, do not revert the whole batch.
5. Post-deploy spot checks on https://smarter.poker (test account in CLAUDE.md):
   - `/hub/training/arena/psy-001?level=1` — psychology game serves questions
     (was 404), tilt UI advances past feedback via the Next button.
   - `/hub/training/arena/cash-002?level=1` — table shows dealer button, glow
     on active hands, folded villains grey out; feedback appears BELOW the
     table (not a full-screen overlay); finish a session, press Retrain
     Mistakes — arena must NOT go blank.
   - `/hub/training/arena/adv-011` — SPR trainer: commit with a flush must
     grade correct.
   - `/hub/training/challenges` — list populates; claiming pays diamonds.
   - Keyboard 1-4 on the splash screen must NOT answer anything.

## Follow-ups (not in this batch — need decisions/prod access)

- Unify `training_leaderboard` schema (two incompatible shapes; no live
  writer). Inspect prod schema via Supabase MCP first.
- Migration for `training_answers` metadata columns, then re-enable the
  stripped fields in record-question.js.
- Wire streak recording into the session-completion path.
- Dead-code sweep: /api/gto (no reachable callers), src/games/ (~24k lines),
  QUESTIONS_LIBRARY.js, orphaned games/*UI.jsx dashboards.
- Reconcile the three contradictory table-position LAW docs; implement
  CHIP_STACK_LAW chip rendering.
