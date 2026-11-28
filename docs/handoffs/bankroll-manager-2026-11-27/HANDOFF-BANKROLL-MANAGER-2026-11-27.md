# HANDOFF: SMARTER.POKER BANKROLL MANAGER — FULL BUILD / FIX / ENHANCE PROGRAMME

**Bookmark ID:** BANKROLL-MGR-2026-11-27-2316CT
**Written:** Fri 2026-11-27 23:16 Central (2026-11-28 05:16 UTC) by the coordinating Claude session (claude.ai/code session_01UxDLnLzgZ6XC5SV4XCSNJr)
**Owner:** Dan (Daniel) Bekavac, owner of Smarter.Poker. Player #1, alias KingFish.
**Your role:** You are the new coordinator of this programme. You own this code base for the Bankroll Manager. You make every decision yourself. Never hand Dan a step you can do.

---

## 0. READ THIS FIRST: STANDING ORDERS FROM DAN (BINDING)

These are Dan's own words, repeated three times tonight (20:24, 20:57, 23:09 CT):

> "FINISH UP ANY AND ALL UNFINISHED WORK, AND THEN GO AHEAD AND FULLY BUILD, FIX AND ENHANCE ALL OF THESE AND MAKE SURE THEY ARE FULLY WIRED IN AND TESTED BEFORE CLAIMING SUCCESS. YOU DECIDE THE BUILD ORDER. LAUNCH A SWARM IF IT WILL HELP."

"ALL OF THESE" means every section of the Bankroll Manager at https://smarter.poker/hub/bankroll-manager (Dan's screenshot shows the full section grid; see §9 Images).

His standing preferences apply to you:
- **Finish it yourself.** Never end with an offer, a question, or a step handed back to Dan for work an agent can do: merging, publishing, running a command, choosing between options.
- **Never idle.** While CI or Vercel runs, do other useful work.
- **Never sleep-poll for hours.** If work must resume much later, schedule a reminder back into the session. Short polls (~60 s) while a build runs are fine.
- **Give every time in Central time** (America/Chicago), never UTC.
- **Delivery standard.** "Done" means pushed, merged, published on Vercel, and verified live. Never call something complete when it is only pushed or only green in CI.
- **Never call AI players "bots".** They are "horses".
- **Never say "looks good".**
- **No emoji in source code.**
- **Mobile-first:** design and check at 375px first.
- **Design language for the Hub:** #SmarterDesign, meaning thin chrome and no bulky frames. Yellow is not an approved colour. Do not restyle sections unless asked.
- **Club Arena rules** (no "$" sign, no K/M abbreviations) apply to Club Arena only. They do NOT apply to the World Hub Bankroll Manager.

Dan's receipt rules (2026-09-08), enforced end to end by PR #3225:
1. A recognised W-2G should suggest adding it to the Vault for year-end accounting.
2. A buy-in goes to a Trip. If no trip is active, start one. A buy-in can never be unassigned.
3. An expense goes to the Expenses list.
4. Every scanned receipt is saved and assignable later. It is never left or abandoned.

---

## 1. ENVIRONMENT, ACCESS, CREDENTIALS (WHAT WORKS AND WHAT DOESN'T)

- **Repo:** `Smarter-Poker/Smarter-Poker-World-Hub` on GitHub. It serves production at https://smarter.poker. Default branch is `main`.
  - Attach it in a cloud session with `mcp__claude-code-remote__add_repo` (owner `Smarter-Poker`, repo `Smarter-Poker-World-Hub`, access `push`).
  - Clone: `git clone --depth 1 https://github.com/Smarter-Poker/smarter-poker-world-hub /home/claude/smarter-poker-world-hub`, with a ~10 minute timeout.
  - Register the clone with `register_repo_root`. The repo's CLAUDE.md then loads; read it.
- **On Dan's Mac Studio**, the same repo is under `/Users/smarter.poker/Documents/` as Smarter-Poker-World-Hub.
  - Agent scratch space: `/Volumes/SmarterWork/agent-work/<unique-task-dir>`, a 256 GiB quota. Run `df` first.
  - Evidence goes to `/Volumes/SmarterArchives/agent-evidence/`. After a reboot that volume can mount as "SmarterArchives 1". Find it by UUID; never rename or remount it.
  - SSD1 and SSD2 are also allowed when space is needed.
  - Request folder access once, in a single call covering `/Users/smarter.poker/Documents`, `/Volumes/SmarterWork` and `/Volumes/SmarterArchives`. Tonight that request was granted at 20:24 CT after Dan switched approvals to manual.
- **GitHub API:**
  - GraphQL is BLOCKED from Claude Code sessions, so `gh pr list` and `gh pr view` fail.
  - Use REST instead: `gh api repos/Smarter-Poker/Smarter-Poker-World-Hub/...`.
  - Create a PR with `gh api repos/Smarter-Poker/Smarter-Poker-World-Hub/pulls -f title=.. -f head=<branch> -f base=main -f body=..`.
  - Read checks with `gh api repos/.../commits/<sha>/check-runs?per_page=100`.
  - Read job logs with `gh api repos/.../actions/jobs/<id>/logs`.
- **Push from a shallow clone:**
  - Push with `git -c push.negotiate=true push -u origin <branch>`.
  - To refresh main, fetch with a depth: `git fetch --depth=50 origin main`. Never run an unbounded fetch.
- **Commit author must be exactly** `git -c user.name="Smarter-Poker" -c user.email="254329056+Smarter-Poker@users.noreply.github.com" commit ...`. Otherwise Vercel marks the deployment BLOCKED with no logs (CLAUDE.md CHECK 15).
  - End commit messages with:
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
    `Claude-Session: <your session URL>`
  - End PR bodies with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)` plus the session URL.
- **Auto-merge automation is ACTIVE.** `agent-autopilot.yml`, `agent-branch-proposal.yml` and `agent-open-pr.yml` run on pull_request_target.
  - A pushed agent branch gets a PR, and approved PRs are squash-merged once required checks pass.
  - The check "Queue this PR for protected squash merge" shows it is queued.
  - **Treat a push to any normal branch as a release.**
  - Work is held back from auto-merge only if one of these is true:
    - the branch path has a segment `bookmark/`, `handoff/` or `wip/`;
    - the head commit subject starts with `wip`, `[wip]`, `bookmark:`, `handoff:` or `do-not-ship:`, or contains `[do-not-ship]`;
    - the PR is a draft;
    - the PR has the label `do-not-ship`.
  - This guard lives in `.github/scripts/unfinished-work-guard.sh`.
- **"Chromium and WebKit footer contract"** often stays pending. It is not required, and PRs merge without it.
- **Vercel:**
  - Project `hub-vanguard`, id `prj_op66GkZyZcygXQKm76iyycfVFAQx`, team `smarter-poker`. It is the only project for this repo; never create another.
  - Use `mcp__Vercel__list_deployments` (load it with ToolSearch `select:mcp__Vercel__list_deployments,mcp__Vercel__get_deployment`).
  - Builds queue up. Vercel CANCELS older queued deployments when a newer main commit arrives. That is normal; prove that the live SHA contains yours with `gh api repos/.../compare/<yourSHA>...<liveSHA>` (status `ahead` or `identical`).
  - Live revision: `https://smarter.poker/api/health` returns JSON with `commitSha` and `deploymentId`.
  - WebFetch needs approval and timed out once. The built-in browser can fetch it instead: run `fetch('/api/health')` with javascript_tool on a smarter.poker tab.
- **Supabase:** project `kuklfnapbkmacvwxktbh`, shared with Club Arena.
  - Reading REAL USER DATA was refused by the auto-mode classifier ("Unauthorized Access"). Do not try again.
  - Metadata queries (grants, `pg_policies`, `information_schema`) were allowed.
  - Any DDL is refused from :50 to :03 past each hour UTC (the hourly maintenance break).
  - Migrations follow `.agent/workflows/migration-safety.md`.
- **Browsers:**
  - The **built-in browser** (`mcp__remote-devices__Claude_Browser__*`) works. It is **NOT signed in to smarter.poker**: the Bankroll page shows "No Data For This Period", Balance "-", and the `smarter-poker-auth` localStorage key is null. Agents must never type passwords.
  - **Claude in Chrome** (Dan's signed-in Chrome) returned "Browser extension is not connected" twice, at 20:2x and 21:1x CT.
- **The test account for signed-in checks** is the platform service account. Its email is the repo variable `TEST_USER_EMAIL` and its password is the secret `TEST_USER_PASSWORD`, used only inside GitHub Actions.
  - Dan, 2026-09-04: "KEEP MY ACCOUNT CLEAN". Never use Dan's personal account.
  - Never read `.env` values, and never print credentials.
- **Local tests:**
  - The repo's `node_modules` are NOT installed in the cloud sandbox. Do not run `npm install` in the repo.
  - Plain `.mjs` tests run with `node --test`.
  - Tests that fail locally only because packages are missing (`@babel/parser`, `@babel/core`, posthog-js, react-test-renderer) are fine. CI is authoritative.
- **Pre-existing failure on main, not ours:** `__tests__/image-header-help-icon.law.test.mjs` ("the '?' sits 3px inside the painted rim").

---

## 2. THE ORIGINAL TICKET AND ITS ROOT CAUSE

**Dan's report** (Fri 2026-11-27 19:51 CT, with screenshot `images/00-dan-reported-flat-trend-chart.png`): "THE BANKROLL TREND CHART ISN'T WORKING INSIDE OF THE BANKROLL MANAGER". The URL he gave was the Club Arena NLH 1/2 table tab; the Bankroll Manager opens in a tab there and is the World Hub page.

What the screenshot showed: Bankroll Balance -$8,363, Net Results -$14,363, Peak Net +$29,217, Lowest Net -$14,363, 13 sessions, All Time. The line sat flat at -$14,363 from Feb to Nov 2026.

**Root cause:**
- `buildTrend` in `src/lib/bankroll/analyticsView.mjs` switches to monthly buckets when the range is over 93 days.
- Each bucket kept only the month-end cumulative value.
- So a month that peaked at +$29,217 and closed at -$14,363 drew a flat line at the closing value, with no starting point at $0.

**Fix (PR #3190):**
- New `model.line`: one point per recorded day, anchored at $0 the day before the first result, and carried to the range end. Synthetic points are marked `synthetic:true`.
- `BankrollPlot.jsx` uses a numeric time axis (`dataKey 't'`, `scale 'time'`, explicit month/day ticks, at most about 5).
- The line's data table lists each recorded day.
- Bar, stacked, heatmap and donut still use period buckets.
- Test added in `__tests__/bankroll-analytics-view.test.mjs`.

---

## 3. PHASE MAP

| Phase | Scope | Status |
|---|---|---|
| P0 | Trend chart root cause (#3190) | DONE, LIVE |
| P1 | Local calendar day vs UTC across bankroll (#3205) | DONE, LIVE |
| P2 Wave 1 swarm, 5 lanes | ledger #3220, trips #3219, receipts #3225, staking/toke #3215, reports/tax #3221 | ALL DONE, LIVE |
| P2b | Coordinator leftovers (#3235) | DONE, LIVE |
| P3 Wave 2 swarm, 4 lanes | live signed-in e2e suite, API routes, page shell + Quick Log, Toke Tracker pages | **IN PROGRESS at handoff; status unknown to this document; see §6** |
| P4 | Final consolidated verification and report to Dan | NOT STARTED |

Live production at 22:3x CT was revision `7790f822ea3dcb128f85d29e111fa3be55a6dc10`, deployment `dpl_6GcpwYwZ9DjJkFkdTPJhiuPfCWgt`. It contains EVERY PR listed in §4 (each was verified with the GitHub compare). Main has moved on since; at 23:16 CT main HEAD was `6f0b657d` (#3243, not ours).

---

## 4. EVERYTHING DONE: MERGED AND LIVE (verify again if you doubt it)

All merge SHAs are on `main`. Times are Central (merged_at UTC minus 6 hours).

### #3190 — 20:02 CT — `04d857ccb6` — branch `fix/bankroll-trend-line-intramonth`
The trend line plots every recorded day (see §2).
- Files: `src/lib/bankroll/analyticsView.mjs`, `src/components/bankroll/BankrollPlot.jsx`, `src/components/bankroll/BankrollTrendChart.jsx`, `__tests__/bankroll-analytics-view.test.mjs`.

### #3205 — 20:49 CT — `bbbbabdb65` — branch `fix/bankroll-local-calendar-days`
Introduced `src/lib/bankroll/localDates.mjs`:
- `localDay(date?)` returns local YYYY-MM-DD.
- `localDayOffset(days, now?)`.
- `parseLedgerDay(value)` parses a YYYY-MM-DD value as local noon.

What it fixed:
- `getDateRangeFilter` in `bankrollSelectors.ts` now uses local days. "Last 7/30/90 Days" now cover exactly that many days including today; they used to cover one extra.
- UTC "today" replaced by the local day in: QuickLogWidget, StakingTracker, TripTracker, SeriesTracker, TokeTracker, TokeDashboard, HistoricalComparison, BankrollGoals, and the today rule check in bankroll-manager.js.
- UTC-midnight parsing of stored days fixed in: TripReport, StakingTracker, AdvancedTaxReport (Jan 1 had moved to the prior year's Q4), TripROICalculator, and bankroll-manager.js Recent Activity.
- Test `__tests__/bankroll-local-dates.test.mjs` is time-zone independent and never sets `process.env.TZ`. It is imported in `_test-guards-exist.test.mjs`.
- Updated the reviewed hash of `pages/hub/bankroll-manager.js` in `docs/business-hub-guide-review.json`.

### #3215 — 21:22 CT — `db50780428` — branch `fix/bankroll-staking-math` (Wave 1 staking/toke)
New logic files `src/lib/bankroll/stakingMath.mjs` and `src/lib/bankroll/tokeReport.mjs`. Tests: `__tests__/bankroll-staking-math.test.mjs` (14) and `__tests__/bankroll-toke-report.test.mjs` (10).

Staking:
- Makeup is replayed in played-date order on every load, and stored rows that disagree are corrected.
- Editing a ledger entry now updates its linked deal.
- Unlink was added, with a confirm step, and Link is guarded against double taps.
- Shares are calculated in cents and always add up to the session result.
- Split validation: a 0% split was silently saved as 50%; >100%, fractions and negative makeup were accepted. All are now refused.
- Deal and session dates no longer show a day early.
- A load error shows Retry instead of "No Active Staking Deal".
- The linkable list is no longer capped at 50, and sessions already linked elsewhere are no longer offered.

Staking Profile:
- Covers poker cash games and tournaments only.

Toke:
- Per Day counts days inclusively; a 3-day event used to count as 2.
- Local dates.
- A failed read raises an error instead of showing $0.
- Event CSV: added day, duration, paid hours, tournament and stakes columns; money rounded; formula-injection guard; safe file names; a summary block.
- Earnings CSV: money rounded.
- Monthly goal counts each down in the month it was dealt.
- IRS mileage: 2026 rates are 72.5¢ through June 30 and 76¢ from July 1, 2026. I verified this myself by web search on 2026-11-27.
- Emoji removed from timer notifications.

Enhancements:
- Export Statement (backer statement CSV).
- Tokes per hour.

CI note: the unbatched IN-list guard required ledger lookups to be split into batches of 100.

### #3220 — 21:34 CT — `8f322a02d0` — branch `fix/bankroll-ledger-audit` (Wave 1 ledger)
New `src/lib/bankroll/ledgerMath.mjs` and `src/lib/bankroll/ruleViolations.mjs`. Test: `__tests__/bankroll-ledger-math.test.mjs` (12).

Balance and totals:
- Adjust Bankroll now moves the balance. Deposits and withdrawals count in the Bankroll Balance tile, including the 7 adjustment rows already in the database; this was a read-only change.
- Totals are kept in cents and read past the 1,000-row PostgREST cap. A failed read shows a failure instead of $0.
- Net Results uses the same rows as the trend chart.

Rules:
- The violation check judges the session just saved, not the newest row.
- Withdrawals and expenses no longer trip Daily Stop-Loss or Max Buy-In.
- Monthly Stop-Loss and Session Time Limit are now checked.
- The duplicate rule check inside LogEntryModal was removed: its warnings could never be seen, it used the UTC date, and it contained emoji.

Sessions and log form:
- Overnight sessions save their end on the next day (a 9 PM–3 AM session used to read as -18 h).
- The log form validates: blank sessions, negative amounts, future dates, and malformed times like "930" or "13:00 PM".

Goals, Recent Activity and other surfaces:
- Goals progress comes from the ledger over each goal's own dates. Goals no longer expire early, and add/delete failures are shown.
- Recent Activity: trip-summary rows have no edit or delete actions. Deposits and withdrawals have their own labels and icons and can only be deleted. Amounts show cents.
- Category view: no longer capped at 200 entries, with an honest error state.
- Manage Venues: deleting a used venue first unlinks the 4 tables that point to it. Honest error state.
- Rules card: a failed load used to show every rule as off, and its controls lacked labels and used an emoji button. Fixed.
- Quick Log: category buttons were blank, and a "+" expense was saved as income. Fixed.

Enhancement:
- Adjust Bankroll shows the balance before and after.

Also:
- Three staking/trip date defaults in `bankrollSelectors.ts` switched to the local day.
- The `createLedgerEntry` `entry_date` default is now `localDay()`.

### #3219 — 21:53 CT — `a842cad3bd` — branch `fix/bankroll-trips-audit` (Wave 1 trips)
New `src/lib/bankroll/tripMath.mjs` and `src/lib/bankroll/tournamentSchedule.mjs`. Tests: `__tests__/bankroll-trip-math.test.mjs` and `__tests__/bankroll-tournament-schedule.test.mjs`.

Trips and series:
- Trip length counts both the first and last day.
- "Day N" uses local days. A series that hasn't started shows "Starts <date>".
- Completing a trip stamps the local day, never earlier than the trip's start.
- Expenses no longer count as sessions.
- Failed loads show an error with Retry.
- Trip entries are read in batches of 100 trip ids.
- Series form: a blank start date and a cleared end date now save, and an end date before the start is refused.
- The series delete button showed literal entity text (`&#X2715;`); fixed.
- Deposits and withdrawals on a trip are no longer counted as profit or loss.
- Trip report: daily results showed the previous day; fixed. "Gross Win" is renamed "Gaming Net" and coloured by sign.

ROI:
- `TripROICalculator` used to save to a table that doesn't exist. It is now an ROI panel inside the trip/series report: buy-ins, cash-outs, expenses by type, ROI on total cost, cost per day, and hourly rate.

Recent Activity:
- Trip summaries are no longer cut short by the newest-50 window.
- Completed series are labelled correctly.
- Tapping a summary opens its report instead of a fake edit form.

Tournament Calendar:
- Shows the real series schedule (the same data the Poker Near Me series pages use) instead of 12 made-up events.
- The month query no longer drops the last day of each month for players east of UTC (`calendarSelectors.ts`).

Enhancements:
- Reopen a completed trip or series.
- "+N" marker and a day list on busy calendar days.
- "Buy-In TBA" when a buy-in isn't listed.
- The bankroll plan is saved and editable.
- Links to each series' official schedule.
- Loading, error and Retry states on the calendar.

### #3225 — 21:44 CT — `b8226c423d` — branch `fix/bankroll-receipts-audit` (Wave 1 receipts)
New `src/lib/bankroll/receiptGallery.mjs` (exports `RECEIPT_UNASSIGN`, `categoryLabel`, `mediaWithout`, `receiptCards`), plus `entryHoldingImage` and `receiptNeedingTrip` in `receiptInbox.mjs`. Test: `__tests__/bankroll-receipts-are-read-kept-and-sent.test.mjs` (18). Two existing scanner rule tests were updated.

Offline-held scans:
- They now upload; previously the sender got stuck forever.
- No duplicate save when a retry fails.
- Unrecoverable failures release the held scan.
- The "Saved On This Device" panel now renders.

Never losing a scan:
- An uploaded-but-unsaved scan asks before it can be discarded.
- A confirmed discard also deletes the uploaded image.
- "Verify & Lock" was removed because it saved nothing.

File All Suggested:
- Starts a trip from the first buy-in when none is active.
- Links an already-filed receipt to its existing entry instead of filing it twice.

Reader:
- Phone numbers are no longer read as amounts.
- Impossible dates are rejected, and day-first dates are read.
- "TOTAL TAX" is no longer taken as the bill total.
- Time-zone shifts fixed.

Saved Receipts:
- Proper category labels and local dates.
- Delete removes the image by URL, not by position.
- An honest error state with Try Again.
- Removing an image sends its receipt back to Receipts Waiting.
- PDFs open as files.
- 40px delete button, keyboard access, no overflow at 375px.

### #3221 — 22:08 CT — `b08d7579d4` — branch `fix/bankroll-reports-audit` (Wave 1 reports/tax)
New `src/lib/bankroll/ledgerReport.mjs`, `taxMath.mjs`, `projectionMath.mjs`, `bankrollBadges.mjs`, `handActions.mjs` and `playerNotesSearch.mjs`. Test: `__tests__/bankroll-reports-audit.test.mjs` (21). Updated `bankroll-export-download.test.mjs` and `the-withholding-split-reaches-a-human.law.test.mjs`.

Run Projections:
- It never sent the bearer token, so it failed for everyone. Fixed.
- Projection math: superseded entries and deposits are excluded; ruin is checked per session; drawdown measured correctly; 30 days simulates 30, not 35; input validated.

Exports:
- CSV/JSON were cut at 500 rows and the PDF at 50. Fixed.
- Superseded entries, deposits and withdrawals are excluded.
- Full CSV escaping plus a formula-injection guard.
- Money prints as -$500 instead of $-500.
- File names use the local day.

State Tax Report:
- Uses its own tax year instead of the dashboard's date filter.
- Deposits, withdrawals and expenses are classified correctly.
- Brackets by year.
- 2026 rule: only 90% of gambling losses are deductible (verified by search).

Tax report API:
- Superseded entries excluded, no 500-row cap, expenses read from the right source.
- 2026 slot W-2G threshold is $2,000 (verified by search).
- Venue names are found.

Tax Documents panel:
- Stale preview cleared, fresh token, honest vault errors, local dates, 375px overflow fixed, keyboard access.

Player Notes:
- A failed save keeps the sheet open, a failed delete is reported, error and no-match states are honest, and search covers tells, tendencies, venue and stakes.

Hand Review:
- Stored action lists no longer crash it; deposits and superseded entries excluded; link failure is honest; local dates; signed money.

Other:
- Jarvis Insights window uses the local day.
- The stop-loss "today" uses the local day, and deposits no longer offset losses.
- Leak alerts: percentage base and severity fixed.
- Footer BADGES used to open Rules. NEW Badges view: 10 milestones from the player's own ledger, with progress bars and loading/error states. `?view=badges` serves "Bankroll Badges".
- `pages/hub/bankroll-manager.js` changed for the badges section, and its review hash was updated.

### #3235 — 22:14 CT — `9806ea2a67` — branch `fix/bankroll-swarm-leftovers` (coordinator)
- `deleteLedgerEntry` in `bankrollSelectors.ts` now returns receipts filed to the deleted entry to Receipts Waiting, using `RECEIPT_UNASSIGN` filtered by `user_id` and `assigned_id`. Previously they were orphaned.
- The LogEntryModal "new trip" link pointed to `?view=trip-tracker`, which doesn't exist. It is now `?view=trips`.
- Test `__tests__/bankroll-deleted-entry-frees-receipts.test.mjs` is wired into `_test-guards-exist`.

### Not ours, also bankroll
- #3200 (20:29 CT) `75738ca1f5` `fix/bankroll-unlock-gate-visible`: an SEO agent moved SmarterAccountUnlockGate into the visible page body. Leave it as is.

### Verified facts (searched 2026-11-27)
- IRS business mileage, 2026: 72.5¢/mile Jan 1–Jun 30, 76¢ from Jul 1 (Announcement 2026-11).
- OBBBA: from tax year 2026, gambling loss deductions are capped at 90% of losses, and still never more than winnings. The W-2G slot/bingo threshold is $2,000 from Jan 1, 2026 (indexed after 2026).

### Checked and needing no change
- `staking_sessions` grants: live has UPDATE and DELETE for authenticated users, plus RLS policy "Users can manage own staking sessions" (ALL, USING). The committed baseline migration only lists INSERT/SELECT. The live database is correct and RLS-protected, so no migration was made. Only revisit if the database is ever rebuilt from migrations.
- `.card { height: 100% }` in `BankrollAnalytics.module.css` is intentional; it fills its grid cell. Tall cards in a bare test page are an artifact of that page.

---

## 5. VERIFICATION DONE AND THE ONE REMAINING GAP

**Done for every PR:**
- node:test unit tests, each new test file imported in `__tests__/_test-guards-exist.test.mjs`. The "every guard in __tests__ is reachable by CI" check fails otherwise.
- Real renders of the real components at 375px in headless Chrome with synthetic data, screenshots inspected, no console errors, no horizontal overflow.
- Required CI checks green.
- Vercel READY, and the live SHA contains the merge.
- The live JS bundle contains the new code. Checked by fetching `/_next/static/chunks/pages/hub/bankroll-manager-*.js` and grepping for markers such as `synthetic`.

**THE GAP:** no section has been verified signed in, with real ledger data, in production.
- The built-in browser is not signed in.
- Dan's Chrome was unreachable.
- Real user data cannot be read.
- Wave 2's live lane (§6.1) exists to close this gap with the CI service account.

---

## 6. IN PROGRESS AT HANDOFF: WAVE 2 SWARM (4 agents launched 23:1x CT)

**WARNING:** they run inside the old session's sandbox. If that session ended, their uncommitted worktrees are GONE.

At 23:16 CT each was told to push work in progress to `bookmark/bankroll-<lane>-wip`, with notes at `docs/handoffs/bankroll-<lane>-wip.md` in that branch, and to ship finished work from its `fix/` branch.

At 23:16 CT their worktrees were on base `6f0b657d` with uncommitted changes:

| Lane | Local branch | Uncommitted files |
|---|---|---|
| live | `fix/bankroll-live-suite` | 4 |
| api | `fix/bankroll-api-routes` | 5 |
| shell | `fix/bankroll-shell-wiring` | 2 |
| toke | `fix/bankroll-toke-pages` | 10 |

**YOUR FIRST ACTION: discover what survived.**
```
R=repos/Smarter-Poker/Smarter-Poker-World-Hub
gh api "$R/pulls?state=all&per_page=60&sort=created&direction=desc" --jq '.[]|select(.head.ref|test("bankroll"))|"#\(.number) \(.state) merged=\(.merged_at//"no") \(.head.ref) \(.merge_commit_sha[0:10]) \(.title)"'
git ls-remote https://github.com/Smarter-Poker/smarter-poker-world-hub 'refs/heads/*bankroll*'
```
- Merged `fix/bankroll-{live,api,shell,toke}-*` PRs: verify they are live (§1, Vercel) and record them.
- Open PRs: read the failing checks and finish them.
- `bookmark/bankroll-*-wip` branches: read their `docs/handoffs/*.md`. Rebase the work onto fresh main in a NEW normal `fix/` branch, finish it, ship it, then delete the bookmark branch.
- Nothing at all for a lane: redo that lane from its brief below.

The full shared brief the agents worked from is `SWARM-BRIEF-WAVE2.md`, next to this file.


### 6.0 LANE STATUS UPDATES (appended after the original handoff)
- **toke: DONE, LIVE.** Finished 23:3x CT. PR #3250 merged as `f68928248924b8ba2524c165146db252fdc4688f`; deployment `dpl_2q4n48ABcEYgJG7qRP6Y1p9APHFC`, and /api/health reported f6892824.
  - Fixed 17 defects: Venue Intel hours/tokes-per-hour now use tokeReport (labelled "Paid Hours"); breaks removed from game types; buy-in bracket gaps; 1099-NEC threshold is $2,000 from 2026 (`src/lib/bankroll/dealerTax.mjs`); Tax Summary uses per-date IRS mileage and no longer sticks on an empty year; vault load state, orphaned upload files, year jump after upload, stray "0", double delete, files with empty MIME types, HEIC fallback; license-expiry day math; calendar delete verifies the row was deleted; multi-event calendar days; toke preferences follow the account (`useTokePrefs.js` + `tokePrefs.mjs`).
  - Test: `__tests__/toke-tracker-pages.test.mjs` (15).
  - Its WIP branch `bookmark/bankroll-toke-wip` (b7b9f9de) is now obsolete; its work shipped in #3250. Deleting it was refused from this session (the push hung up, and the API refused write access). Delete it when you can; it is harmless meanwhile, because bookmark/ branches never auto-merge.
  - Not verified: signed-in uploads, real HEIC on a phone.
- live, api, shell: still running at the time of this update. Use the §6 discovery commands.

### 6.1 Lane "live": signed-in production verification (CLOSES THE GAP)
Add a read-only `workflow_dispatch` suite **`bankroll-live`** to `.github/workflows/e2e-tests.yml`.
- Follow the existing `*-live` suites (messenger-live, pnm-*-live): how they sign in with `vars.TEST_USER_EMAIL` and `secrets.TEST_USER_PASSWORD`, and how they pin the deployed SHA.
- Add `bankroll-live` to the `suite` options list (line ~44).
- The Playwright spec goes in `e2e/`. It signs in as the service account against https://smarter.poker and visits every `?view=` route: dashboard, trips, series, receipts, players, staking, staking-profile, toke-tracker, tax, reports, tournament-calendar, badges, rules, goals, settings, leaks. It also covers every chart type (line, bar, donut, stacked, histogram, heatmap) and every time filter.
- Assert, on mobile and desktop projects:
  - no page errors;
  - no error/retry state;
  - the trend chart draws an SVG path, or shows the honest empty state when there is no data;
  - the footer is fixed at the bottom (check with `getBoundingClientRect`, not a full-page screenshot);
  - no 375px overflow.
- **No writes:** `page.route` blocks non-GET requests to Supabase REST and `/api`, and the test fails if one is attempted.
- Update any guard tests that pin the workflow's option list (grep `__tests__` and `tests` for `e2e-tests.yml`).
- Ship it, then dispatch on main:
  `gh api repos/.../actions/workflows/e2e-tests.yml/dispatches -f ref=main -f inputs[suite]=bankroll-live` (plus the deployed-SHA input if the job requires it, taken from `/api/health`).
- Read the result. If the service account has no ledger data, the suite must still assert the empty states honestly. Report pass/fail per section.

### 6.2 Lane "api": server routes
Everything in `pages/api/bankroll/**`: export.js, export-pdf.js, projection.js, tax-report.js, scan-receipt.js, scan-dealer-document.js, geofence-visit.js, linked-venues.js. Also any `/api` route that bankroll components call (grep `fetch('/api/` in `src/components/bankroll` and `pages/hub/bankroll-manager.js`). Audit for:
- Identity comes from the JWT via `supabase.auth.getUser`, never `req.query.userId` (CLAUDE.md rule 5).
- Use `src/lib/supabaseServerClient` only (rule 4) and `.maybeSingle()` (rule 1).
- Method checks and input validation.
- The 1,000-row cap.
- Superseded entries, deposits, withdrawals and expenses handled consistently with `ledgerReport.mjs`, `ledgerMath.mjs`, `taxMath.mjs` and `projectionMath.mjs`.
- Dates come from the stored `entry_date` string or a client-supplied day; the server has no player time zone.
- Errors never leak internals.
- Upload size and type limits on the scan routes.
- Every client caller sends the bearer token and handles each error code.
- Write tests with mock req/res. Curl the live routes unauthenticated and expect 401/405. Note: `POST /api/bankroll/projection` without sign-in already returns 401.

### 6.3 Lane "shell": page shell and Quick Log
This lane owns `pages/hub/bankroll-manager.js` (3,500+ lines).
- After ANY edit to that file, recompute `docs/business-hub-guide-review.json` `inputs["pages/hub/bankroll-manager.js"]` as the sha256 of the file; `__tests__/business-hub-guide.test.mjs` fails otherwise.
- Edit that JSON from the origin/main version on conflicts. Agents hit merge conflicts there and in `_test-guards-exist.test.mjs` repeatedly; keep every agent's imports.

Audit:
- The header Add + menu (BankrollHeaderAdd, BankrollImageHeader).
- The sidebar/hamburger and every `?view=` route (`resolveBankrollView`, `SIDEBAR_SECTIONS`, `MENU_SECTION_TITLES`, about lines 160–200); `?type=` category views.
- Settings: the EUR toggle and `usePersistedFilters`.
- The Leaks view, the Pro gate (BankrollProGate, `useFeatureGate('bankroll_pro')`) and JarvisLeakInsights.
- The filters row and dropdowns: keyboard access, outside-click close, 375px layout.
- Wiring of the Venue/Variance/Historical panels; loading and failure states of `loadData`.
- The `bankroll-updated` event refresh, double loads, unhandled rejections.
- The footer bar SUMMARY, LOG, TRIPS, REPORTS, BADGES, EXPORT: each must reach a working destination.

**Quick Log:** `src/components/bankroll/QuickLogWidget.jsx` is fixed but mounted NOWHERE. Either wire it in where it really helps (it must use the same save path and rule checks as LogEntryModal) and test it, or delete it with its dead imports. Justify the choice.

### 6.4 Lane "toke": standalone Toke Tracker pages
`pages/hub/toke-tracker/` contains index.js, analytics.js, shift.js, vault.js and venues.js. Also cover the components, libs and API routes only those pages use.
- Reuse `src/lib/bankroll/tokeReport.mjs` and `localDates.mjs`; #3215 already fixed TokeTracker.jsx, TokeDashboard.jsx and tokeSelectors inside the Bankroll Manager.
- Audit: shift timing and down counts; hourly and tokes-per-hour math; vault upload/list/delete and failure paths; venues; analytics periods and time zones; navigation to and from the Bankroll Manager toke-tracker view; honest empty/error states; 375px; accessibility; emoji.

---

## 7. WHAT IS NOT DONE / OPEN ITEMS (complete all of these)

1. **Finish Wave 2** (§6). Each lane is finished only when it is merged, live and verified.
2. **Run `bankroll-live`** against production signed in as the service account. Fix every failure it surfaces, and report pass/fail per section to Dan.
3. **Quick Log decision** (§6.3).
4. The **pre-existing failing test** `__tests__/image-header-help-icon.law.test.mjs` on main is not bankroll and was not caused by this programme. Leave it unless it blocks you.
5. **Slots and table-game entries can still be linked to a staking deal.** This is existing behaviour, left unchanged in #3215. Decide whether staking should be poker-only (the Staking Profile is now poker-only, so linking is inconsistent with it), implement and test.
6. **Optional hardening:** `staking_sessions` baseline migration drift (see §4, "Checked and needing no change"). Low priority; the live database is correct.
7. **When everything is live, send Dan ONE final report:** what each section got, the PRs, the live SHA, the bankroll-live results, and anything still unverified.

---

## 8. HOW TO VERIFY (recipes)

**Unit tests:** `node --test __tests__/bankroll-*.test.mjs`. Ignore failures caused only by missing local packages.

**Render harness:** rebuild it in `/tmp/rh`; the original scripts are in `harness/` beside this file.
```
mkdir -p /tmp/rh && cd /tmp/rh && npm init -y && npm i react@18 react-dom@18 recharts@^3.7.0 lucide-react esbuild playwright-core
```
- Chrome is at `/usr/bin/google-chrome`.
- `app.jsx` imports the REAL component by absolute path.
- Build with esbuild (bundle, `jsx:'automatic'`, `loader {'.js':'jsx'}`, `nodePaths ['/tmp/rh/node_modules']`, `define process.env.NODE_ENV`). Use a plugin that redirects `next/dynamic` to `dyn.js` (returns BankrollPlot) and `@supabase/supabase-js` to `supa.js`. Native esbuild CSS modules work if the build writes to `outdir`.
- `i.html` must set `window.process={env:{NODE_ENV:"production"}}` before loading the bundle.
- `shot.cjs` (playwright-core) loads it at 375 wide, prints component text and errors, and screenshots. Always Read the PNG and look at it.

**Live checks:**
- `/api/health` gives the SHA.
- Compare SHAs with the GitHub compare API.
- Grep the bundle: on a smarter.poker tab in the built-in browser, run javascript_tool to fetch each `script[src]` and search for marker strings.

**Signed-in checks:** only through the `bankroll-live` CI suite (the service account). Never with Dan's account.

---

## 9. IMAGES AND WHERE TO FIND THEM

Bundled in this bookmark under `images/`. They are on the bookmark branch and on Dan's archive drive (§10). The original upload sat at `/mnt/user-data/uploads/ab2cd420-image.png` in the old session only.

| File | What it shows |
|---|---|
| `images/00-dan-reported-flat-trend-chart.png` | Dan's ORIGINAL screenshot (Club Arena tab "Bankroll Mana...", the section grid, the flat chart at -$14,363, Peak +$29,217, 13 sessions). Shows every section name: Dashboard, Adjust Bankroll, Trip Tracker, Series Tracker, Player Notes, Scan Receipt, Saved Receipts, Run Projections, Staking Tracker, Toke Tracker, Tax Reports, Staking Profile, Tournament Calendar, Reports; footer SUMMARY, LOG, TRIPS, REPORTS, BADGES, EXPORT. |
| `images/01-fixed-line-vs-bar-synthetic.png` | Fixed line chart (rises to a peak, falls to a loss, $0 start) vs the unchanged bar mode, synthetic data. |
| `images/02-all-chart-modes-all-time-375px.png` | All 6 chart modes at 375px, All Time, synthetic. |
| `images/03-all-chart-modes-last-7-days-375px.png` | Same, Last 7 Days. Captured before #3205, so the heatmap still shows the UTC-tomorrow day enabled; that is the bug #3205 fixed. |
| `images/04-all-chart-modes-last-30-days-375px.png` | Same, Last 30 Days. |
| `images/05-venue-variance-historical-375px.png` | Venue Analytics, Variance, Historical Comparison (loaded and empty). The tall cards are a test-page artifact. |
| `images/06-ledger-adjust-withdraw-375px.png` | The Wave 1 ledger agent's Adjust Bankroll withdraw render. |

---

## 10. WHERE THIS BOOKMARK LIVES

- GitHub branch **`bookmark/bankroll-manager-handoff-2026-11-27`** (never auto-merged), folder `docs/handoffs/bankroll-manager-2026-11-27/`, containing this file, `SWARM-BRIEF-WAVE2.md`, `images/` and `harness/`.
  - Fetch: `git fetch --depth=1 origin bookmark/bankroll-manager-handoff-2026-11-27 && git checkout FETCH_HEAD -- docs/handoffs/bankroll-manager-2026-11-27`.
- Dan's Mac: `/Volumes/SmarterArchives/agent-evidence/bankroll-manager-handoff-2026-11-27/`. The same files, if the copy succeeded; see the coordinator's final message.
- Memory: `/areas/smarter-poker.md` holds Dan's standing rules for the platform. Read it.

---

## 11. FIRST TEN MINUTES CHECKLIST

1. Attach and clone the repo (§1). Read CLAUDE.md, AGENTS.md, PUBLISHING.md, and `/areas/smarter-poker.md` from memory.
2. Fetch this bookmark (§10). Read it fully and look at `images/00`.
3. Run the discovery commands (§6). Write a table of each Wave 2 lane: merged/live, open PR, bookmark WIP, or nothing.
4. Check what is live: `/api/health` SHA, and compare against each merge SHA.
5. Decide the order. Recommended: (a) any open Wave 2 PRs; (b) the live suite (§6.1), because it finds real-data defects for everything else; (c) shell (§6.3), the only lane editing `bankroll-manager.js`, so do it before others touch that file; (d) api; (e) toke; (f) open items §7.4–7.6. A swarm is approved.
   - Give each agent its OWN `git worktree` (agent isolation:"worktree" was refused for agents last time; create the worktrees yourself).
   - Forbid `git stash`. All worktrees share one stash list, and two agents popped each other's work at 21:11 CT.
   - Require WIP pushes to `bookmark/` branches.
6. Ship everything through §1 delivery, verify it live, and report once to Dan in Central time.
