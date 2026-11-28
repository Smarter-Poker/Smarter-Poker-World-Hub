# bankroll-live WIP handoff

Branch with real work: fix/bankroll-live-suite (this bookmark = same commits + this note).
Done: e2e/bankroll-live.spec.ts, e2e/fixtures/bankrollLiveGuard.mjs, playwright.bankroll-live.config.ts,
bankroll-live job in .github/workflows/e2e-tests.yml (+ option), option-list pins updated in
__tests__/messenger-{send,continuity}-live-safety.test.mjs, guard test __tests__/bankroll-live-suite.test.mjs
(imported in _test-guards-exist).
Left: dispatch on the branch to iterate (job is not main-gated, read-only + SHA pinned):
  SHA=$(curl -s https://smarter.poker/api/health | jq -r .commitSha)
  gh api repos/Smarter-Poker/Smarter-Poker-World-Hub/actions/workflows/e2e-tests.yml/dispatches -f ref=fix/bankroll-live-suite -f inputs[suite]=bankroll-live -f inputs[expected_sha]=$SHA
then PR fix/bankroll-live-suite (WITHOUT this docs/handoffs file), merge, dispatch on main, report.
Known defect found by reading code: ?view=leaks and ?view=pro resolve to dashboard (resolveBankrollView
in pages/hub/bankroll-manager.js omits them) -> Leak Analysis / Pro Tools unreachable. Shell agent owns it.
Run IDs: 46111439644 (run 1: every test failed on "Could Not Check Your Active Seats / Retry" caused by the guard blocking STABLE rpc fn_lightning_my_sessions; fixed by READ_ONLY_RPCS; leaks confirmed unreachable); 46112138901 (run 2: writes on every page: shell fn_update_presence, ensure-profile, eggs/evaluate, get-conversations(read), bankroll initializeUserBankroll create-only upsert to bankroll_segments/rules; classified); 46112563881 (run 3: 54/57 pass, leaks defect x2, afterAll SHA change once). PR #3257 open from fix/bankroll-live-suite; next: watch checks, merge, dispatch on main.; PR #3257 MERGED as 0a7374b9; live e01ac60f (dpl_4w9j4coKBmnBj8oWg4kqDwDknNFf) contains it; main dispatch run 46114094435. Result: 53/57 pass; leaks x2 = real defect; 2 = afterAll deploy changed mid-run (e01ac60f -> c0840568), their own assertions passed. DONE.
