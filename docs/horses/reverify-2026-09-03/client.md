# /horses client review (Phase 1 + Phase 2), fresh pass

Scope: worktree /home/claude/wh-p2 at b5ab39e ("phase2 review fixes"). Read: PHASE1-CONTRACTS.md (items 1-20), PHASE1-REVIEW-RECORD.md, PHASE2-CONTRACTS.md (sections 0-5), CLAUDE.md sections 3, 10, 10.5; then pages/horses/index.js, sql-console.js, hg-moderation.js, hand-reviews.js, horses.module.css, every file in src/components/horses/, and the routes they call (pages/api/horses/operator-admin.js, mint.js, stable-admin.js, club-arena-admin.js, admin-reviews.js, analytics.js, anti-abuse.js, grinder-stats.js, hg-reports.js, hg-appeals.js, pages/api/club-arena/horse-launch.js, approve-cashout.js, anti-cheat.js, union-application.js) plus src/lib/horses/{approvals,operatorAuth,validate,listShape,permissions}.js and the three ca_operator migrations.

Method: code reading of every client fetch against the route it hits; scratch probes of the pure helpers (approvalModel, urlState, operatorAdmin, pagerModel, operatorPermissions, validate.money2dp) under Node 22; `node --test __tests__/horses-*.test.mjs` = 479 pass. No node_modules, so nothing React was rendered; every React-runtime finding below is from reading the code path and is marked as such. This worktree is a 101-file subset of the repo: `src/lib/supabase`, `src/lib/authUtils`, `/api/geeves/analytics`, `/api/admin/scraper-health`'s callers and `scripts/check-title-case.mjs` are not present, so anything that depends on them is marked unverified.

Severity key: BLOCKER = wrong about money or lockout, fix before merge. HIGH = operator is told something false or left with no way forward. MEDIUM = real defect an operator will hit. LOW = polish / house rule. NOTE = observation, no fix required.

---

## BLOCKER

### B-1  Force-approving a cashout from Club Arena reports "Cashout Approved" on a 202 that moved nothing
- **File:** pages/horses/index.js:1525-1548 (`resolveCashout`); route pages/api/club-arena/approve-cashout.js:255-310
- **What is wrong:** Phase 2 wired `/api/club-arena/approve-cashout` to `requireApproval` on the platform-override path (`viaPlatformOverride`, which is exactly the path a /horses operator takes). With `approvals_enabled` on and `cashout.amount >= cashout_threshold` the route returns `202 { success: true, pending: true, approvalId, message }` and does not call `fn_approve_cashout_atomic`. The client never looks at the body: `await authFetch(...)` resolves (202 is `res.ok`, `success` is true), then it removes the cashout from `caPendingCashouts` and `caClubDetail.pendingCashouts`, toasts **"Cashout Approved"**, and reloads badges. `isPendingApproval` exists in approvalModel.js and is used by the Mint only.
- **Why it matters:** The operator is told the player was paid. The request is still `pending` in `cashout_requests`, sitting in the Approvals queue as kind `cashout`, and the row has vanished from the only list the operator was looking at. Nobody is told to go to Approvals. The player is not paid until somebody notices. Approvals are off in production today (section 0), but this is the exact control Phase 2 ships and the Staff tab lets Dan switch it on in-session.
- **Also:** the confirmation is a `window.confirm` (index.js:1530) with no `thresholdDecision` preview, so nothing before the click says it will be sent for approval either.
- **Fix:** In `resolveCashout`, `const body = await authFetch(...)`; `if (isPendingApproval(body)) { showNotification(body.message || 'Sent For Approval. No Chips Have Moved.', 'info'); /* keep the row, optionally tag it pending */ return; }`. Replace the `window.confirm` with the shared `ConfirmDialog` and render `thresholdDecision({ policy: operatorPolicy, kind: 'cashout', amount: cashout.amount, asset: 'chips', aloneRule: operatorAloneRule })` in it, the same way the Mint does. Add a behaviour test that a `{ pending: true }` body from approve-cashout leaves the row in place.
- **Verified:** by reading both sides; approve-cashout.js:196-199 and src/lib/horses/approvals.js:175-192 confirm the platform-override path is the gated one.

---

## HIGH

### H-1  An approval whose execution fails is stranded: the console has no `execute_approval` and the error copy sends the operator to a button that does not exist
- **File:** src/components/horses/ApprovalsPanel.jsx:153-197 (`submitDecision`); route pages/api/horses/operator-admin.js:1042-1067, 1095-1120
- **What is wrong:** `decide_approval` with `approve` now executes the money RPC in the same request. If `fn_ca_mint` cannot be reached the route marks the row `failed` and throws **503** `"Approved, But The Operation Could Not Be Run And Nothing Moved. Try Running It Again From The Approvals Tab"` (code `execution_unavailable`). On the client, `isStaleRowRefusal` is false for a 503, so the modal stays open with a live Approve button and the pending queue is NOT reloaded. Pressing Approve again hits `decideApproval`, which reads the row (now `failed`), refuses with 409 `already_decided`, and only then does the panel reload. The row then appears in History as "Failed" with no action, because nothing in the client ever sends `{ action: 'execute_approval' }` (grep: zero references in pages/ and src/components/). The route's own message tells the operator to re-run it "From The Approvals Tab"; the tab cannot.
- **Why it matters:** A transient database blip after a legitimate approval leaves an approved, un-executed request that no operator can complete from the console. The only recovery is SQL. This is the case the route author explicitly built `execute_approval` for.
- **Fix:** (a) In `submitDecision`'s catch, treat `err.code === 'execution_unavailable' || err.code === 'execution_refused' || err.status === 503` like a stale refusal: close the modal and reload both lists. (b) In the History table, render a "Run Again" button on rows with `status === 'failed'` (and on `approved` rows for executable kinds whose `executed_at` is null) that POSTs `{ action: 'execute_approval', approvalId }` through a ConfirmDialog, then reloads. Add `executeApprovalBody` to operatorAdmin.js with a unit test.
- **Verified:** by reading; `canDecideApproval` (approvals.js:179) refuses any non-pending row, so the second press cannot re-drive it.

### H-2  The Approve dialog and its success toast describe an execution the route did not perform (cashout) and ignore the route's own outcome message
- **File:** src/components/horses/ApprovalsPanel.jsx:170-176 (toast), 547-551 (dialog copy)
- **What is wrong:** The toast is a constant: `'Approved. The Operation Will Be Carried Out And Recorded.'`, and the dialog says `'Approving Carries The Operation Out. It Is Executed Once And Only Once, Against The Operation Id This Request Already Holds.'` for every kind. The route returns `execution.message`, which for `cashout` is `'Approved. The Cashout Itself Is Still Completed From The Cashout Screen, So No Chips Have Moved Yet'`, for fleet_policy/sanction `'... Nothing Has Moved Yet'`, and for a mint whose `markApprovalExecuted` refused `'... The Money Has Moved, But The Approval Row Could Not Be Closed. Check The Audit Trail'`. The client reads none of it (`await authFetch(...)` discards the body).
- **Why it matters:** An operator approving a cashout reads "carried out" and does not go back to the Cashout screen; the player is not paid. An operator approving a mint whose trail failed to close is not told to check the audit trail.
- **Fix:** `const body = await authFetch(...)`; `showNotification(body.message || body.execution?.message || fallback, body.execution?.ok ? 'success' : 'info')`. Branch the dialog sentence on `isExecutableKind` (mint/burn/fund_club vs the rest); the kind table already exists in approvalModel.js.
- **Verified:** by reading operator-admin.js:1020-1040 and 1108-1118.

### H-3  The Mint's confirm sentence goes stale the moment the policy is changed on the Staff tab: `aloneRule` is never refreshed
- **File:** pages/horses/index.js:659-682 (bootstrap read, the only place `setOperatorAloneRule` is called with data), 3203 (`onPolicyChange={setOperatorPolicy}`); src/components/horses/StaffPanel.jsx:233-243 (`refreshPolicy` reads `section=policy`, which carries `aloneRule`, and forwards only `policy`)
- **What is wrong:** `operatorAloneRule.applies` is computed by the route as `approvalsEnabled && allowSelfApproveWhenAlone && alone`. At sign-in, with approvals off, `applies` is false. Dan turns approvals on from Staff And Roles; `onPolicyChange` updates `operatorPolicy` but `operatorAloneRule` keeps the pre-toggle `{ applies: false }`. Scratch probe: `thresholdDecision({ policy: { approvals_enabled: true, mint_threshold: 0 }, amount: 100, aloneRule: { applies: false } })` returns headline **"This Will Be Sent For Approval"** and the button reads "Yes, Send For Approval", while `requireApproval` on the server, for a lone eligible approver, answers `required: false` and executes on the spot. This is the exact "dialog says reversible when it is irreversible" case approvalModel.js:463-477 was written to close, reintroduced through the refresh path.
- **Why it matters:** Wrong about whether money moves on Confirm. On today's three-legacy-operator roster `alone` is false so the copy happens to be right; on a roster where the other operators lack `money.write` (enforcement on, or a support-only second account) it is wrong.
- **Fix:** Make `onPolicyChange` accept the whole `section=policy` body: in StaffPanel.refreshPolicy call `onPolicyChange({ policy: normalizePolicy(body.policy), aloneRule: body.aloneRule || null, permissions: permissionsFromPayload(body) })` and in index.js set all three (`setOperatorPolicy`, `setOperatorAloneRule`, and `setOperatorPermissions` when non-null). Alternatively re-run the bootstrap effect after a policy save.
- **Verified:** scratch probe above; StaffPanel.jsx:233-243 read.

---

## MEDIUM

### M-1  Named-role operators (Phase 2 grants) cannot open the console: the client still gates sign-in on `profiles.role in (admin, superadmin, god)`
- **File:** pages/horses/index.js:141, 628, 701 (`ADMIN_ROLES`); pages/horses/sql-console.js:157; hg-moderation.js:996; hand-reviews.js:354
- **What is wrong:** `requireOperator` (src/lib/horses/operatorAuth.js:352-356) admits an account with a legacy profile role OR at least one active `ca_operator_grants` row. The client's `checkAuth`/`handleLogin` (and all three sub-pages) refuse anyone whose `profiles.role` is not one of the three legacy strings, and `handleLogin` signs them out. So the Staff tab can grant `finance` to a user whose profile role is `user`, the route would accept them, and the console sends them away with "Access denied. Administrator privileges required."
- **Why it matters:** The Staff And Roles tab appears to work end to end but a grant to a non-legacy account is a grant to nobody. Not a lockout of anyone who works today (section 0 holds), but the Phase 2 feature is not usable from the client.
- **Fix:** Replace the client-side role check with the route's answer: after `getAuthUser()`, call `authFetch(policyUrl())`; a 200 means operator, 401/403 means not. The bootstrap effect already makes that call; fold `checkAuth` into it and drop `ADMIN_ROLES`. Same in the three sub-pages (they can call `section=policy` too, or a dedicated `section=whoami`).
- **Verified:** by reading both sides.

### M-2  Audit Log target type / target id inputs fire one POST per keystroke, with no debounce, and every partial value is sent as an exact `eq` filter
- **File:** pages/horses/index.js:2640-2643 (load effect keyed on `auditTarget`, `auditTargetType`), 7191-7210 (the inputs), 2114-2130 (`auditQuery` sends `targetId: auditTarget.trim()`)
- **What is wrong:** Reviews and Bug Reports debounce their search 300 ms (index.js:2647-2656); the two audit inputs do not. Typing a 36-character uuid issues 36 `audit_log` POSTs, each a `count: 'exact'` over admin_audit_log with `target_id = <partial>`, each returning zero rows, so the table flashes "No Audit Entries In This Range" for the whole time the operator is typing. stable-admin is rate limited (`read`), so a fast typist can hit 429 and get an error toast per keystroke (the catch calls `showNotification(err.message)`).
- **Fix:** Mirror the reviews pattern: keep `auditTargetInput`/`auditTargetTypeInput` as what the operator types, debounce 300 ms into `auditTarget`/`auditTargetType`. Or submit on Enter / blur.
- **Verified:** by reading; the seq guard (`auditSeqRef`) prevents wrong rows landing but not the requests or the toasts.

### M-3  Grinder roster pager and Mint ledger pager/filters have no sequence guard, and the ledger pager is never disabled while its page loads
- **File:** pages/horses/index.js:1258-1288 (`loadGrinderData`, `goGrinderRosterPage`), 891-905 and 928-953 (`loadMintLedger`, `refreshMintLedger`), 5254-5266 (`<Pager loading={mintLoading}>` while `loadMintLedger` never sets `mintLoading`)
- **What is wrong:** Only reviews, audit and the trail have `SeqRef` guards (grep: three in index.js). `goGrinderRosterPage` sets `grinderOffset` synchronously and then awaits a fetch with no guard; press Next twice quickly and the slower (older) response can land last, so the table shows page 2 rows under a pager labelled page 3. The Mint ledger has the same shape and worse: its Pager reads `loading={mintLoading}`, which `refreshMintLedger` does not touch, so Next/Previous stay enabled during the request and a double-click is two requests racing.
- **Fix:** Add a `useRef(0)` sequence to each loader as done at index.js:2137-2169, and give the ledger its own `mintLedgerLoading` flag wired to the Pager.
- **Verified:** by reading; behaviour cannot be executed here.

### M-4  The policy confirm dialog always says "Turning Approvals On/Off" even when that switch did not change
- **File:** src/components/horses/StaffPanel.jsx:860-902
- **What is wrong:** The branch is `policyDraft.approvals_enabled ? "Turning Approvals On..." : "Turning Approvals Off. Every Money Move Will Execute As Soon As An Operator Confirms It..."`, and `tone` is `danger` whenever the draft has approvals on. Change only the TTL with approvals already on and the dialog announces you are turning approvals on; change a threshold with approvals already off and it announces you are turning them off. The body that will actually be sent (`policyPatch`, already computed at line 460) carries only the changed fields.
- **Fix:** Branch on `policyPatch`: if `'approvalsEnabled' in policyPatch` show the on/off paragraph; otherwise list the changed fields ("Mint Threshold 0 To 500, Approval Window 1440 To 60 Minutes") and keep the tone neutral unless approvals are being switched on.
- **Verified:** by reading.

### M-5  A code-split panel whose chunk fails to load renders "Loading Staff And Roles" forever
- **File:** pages/horses/index.js:197-207 (`panelComponentFor`)
- **What is wrong:** `dynamic(tab.load, { ssr: false, loading: () => <div>Loading {tab.label}</div> })`. In the Pages Router, `next/dynamic`'s loadable renders the `loading` component with `{ error, isLoading, pastDelay, timedOut, retry }` both while loading and after a rejected import. The custom component ignores `error`, so a chunk 404 after a deploy (stale HTML, new chunk hashes) or an offline tab shows the spinner text indefinitely. The ErrorBoundary does not see it because nothing throws.
- **Fix:** `loading: ({ error, retry }) => error ? <div className={shared.errorNote} role="alert">{tab.label} Could Not Be Loaded: {error.message} <button onClick={retry}>Try Again</button></div> : <div className={styles.loadingSpinner}>Loading {tab.label}</div>`.
- **Verified:** by reading `next/dynamic` semantics (Next 14 loadable.shared-runtime renders `loading` when `!state.loaded || state.error`); could not execute here. Unverified at runtime.

### M-6  Tall dialogs are clipped at the top on desktop: the backdrop centres with `align-items: center` inside a scrolling container
- **File:** src/components/horses/shared.module.css:14-24 (`.backdrop { overflow-y: auto }`), 436-445 (`@media (min-width: 768px) .backdrop { align-items: center }`), 26-36 (`.dialog { margin: 24px auto }`)
- **What is wrong:** A flex item taller than a centred flex container overflows equally above and below, and the part above the scroll origin cannot be scrolled to. The Trail modal (`wide`, 25 entries each with pretty-printed JSON) and the Edit Horse / Promo dialogs are taller than a 768 px-high laptop viewport. Below 768 px it is `flex-start` and fine.
- **Fix:** Keep `align-items: flex-start` at every width and set `.dialog { margin: auto; }` (vertical auto margins centre when there is room and collapse to 0 when there is not).
- **Verified:** CSS reasoning only; not rendered.

### M-7  `scripts/check-title-case.mjs` does not exist in this tree, so the Title Case gate cited in PHASE1-REVIEW-RECORD.md cannot be run, and the copy has drifted
- **File:** PHASE1-REVIEW-RECORD.md:23 ("check-title-case OK"); pages/horses/index.js (see list)
- **What is wrong:** `ls scripts` shows only `lint.mjs`; `git log --all -- scripts/check-title-case.mjs` is empty. The only Title Case checks are `__tests__/horses-phase2-client.test.mjs:572` (kind/status labels) and two server-side `/^[A-Z]/` regexes. A scratch scan of user-visible strings finds these still lower-case in index.js: sign-in errors 624/629/636/700/704/710 ("Could not verify admin status...", "Access denied. Administrator privileges required.", "Connection failed."); Mint compose guards 1048/1052/1057/1063 ("Enter an amount greater than zero.", "Diamonds are whole numbers.", "Pick a club or union.", "Write a reason of at least ten characters."); `window.confirm` prompts 1526-1530, 1605, 1708, 1885-1886, 1896, 1916; aria-labels 3135 "Console sections", 3141 "Stable admin tabs", 3243, 3245, 3654, 4131, 5082, 5092, 6487, 6959, 6967, 6978, 7147, 7159, 7171, 7219, 7228; placeholders 3653, 4129, 4304, 4893, 4984, 6484, 6732, 6977, 7195 "Target type (club, user)", 7205 "Target id (club, user, ticket)", 7740; titles 3261, 3420, 3718, 5123, 5135, 5213; empty states 3286-3287, 5937, 5979, 6595-6596, 6677, 6770; receipt words "to"/"from" 4736/4772 and "chips" in the mint confirm 5034; audit count 7249 (`'entry' : 'entries'`); trail/expanded rows 7353/7437 ("IP not recorded", "- request"). Sub-pages: sql-console.js:154 "Could not verify your role", 231 "Session expired. Please refresh the page or log in again.", 242 "Request failed"; hg-moderation.js:905 "IRREVERSIBLE: Anonymize all Home Games content for user ...". StaffPanel.jsx:270 toasts the raw role key: "Granted finance To Dan.".
- **Fix:** Restore the checker to the repo (or add `__tests__/horses-title-case.test.mjs` that walks JSX text, `showNotification` strings, `placeholder`, `aria-label` and `title` attributes in pages/horses and src/components/horses) and fix the strings above. Use `roleLabel(grantRole)` in the grant toast.
- **Verified:** scratch scan `/tmp/claude-0/.../scratchpad/tc2.mjs`; each line above was opened and confirmed to be copy, not code.

### M-8  hg-moderation.js still carries its own Modal, and it has drifted from the shared one
- **File:** pages/horses/hg-moderation.js:129-190; src/components/horses/Modal.jsx:1-12 ("Ported from the implementation in pages/horses/hg-moderation.js")
- **What is wrong:** The page-local copy has no `sticky`, `blockEscape` or `hideClose`: while `handleResolve`/`handleReview`/the GDPR erase are in flight, Escape and a backdrop click close the dialog and the PATCH continues out of sight; it also still filters focusables by `offsetParent !== null`, the heuristic the shared Modal replaced. The GDPR erase (hg-moderation.js:905) is a `window.confirm`, not a typed confirmation, for an irreversible anonymisation.
- **Fix:** Import `Modal` and `ConfirmDialog` from src/components/horses (the page already imports `pagerModel` from there; the palette is available because the page wraps in `.tokenScope`), pass `sticky={submitting} blockEscape={submitting}`, and use `requireTyped="ERASE"` for the GDPR action.
- **Verified:** by reading.

---

## LOW

### L-1  `?tab=<unknown>` is never normalised
- **File:** pages/horses/index.js:2749-2780; scratch probe `urlMatchesState({ activeTab: 'stable' }, { tab: 'bogus' })` is `true`.
- The read effect resolves an unknown tab to `stable`; the write effect then sees the URL "agreeing" and, because `router.query.tab !== undefined`, never replaces it. The address bar keeps `?tab=bogus` while Social Horses is shown, and the bookmark stays broken. Fix: in the first-agreement branch, replace when `router.query.tab !== undefined && router.query.tab !== activeTab`.

### L-2  Audit filter-reset comment is wrong and a filter change on page N>0 sends two requests
- **File:** pages/horses/index.js:2611-2643
- The comment claims "the load that runs in this commit already sees page 0". It does not: `setAuditPage(0)` in the first effect cannot change the `auditPage` closure of the second effect in the same commit (the identical mechanism the URL-state comment at 2700-2727 explains). With `auditPage = 3` a filter change fires `loadAuditLog` at offset 300 under the new filter, then again at 0 after re-render; `auditSeqRef` drops the first. Harmless today thanks to the guard; the comment should be corrected and the load effect could skip when `auditPage !== 0` and a filter just changed (or derive offset from a single `useReducer`).

### L-3  Mint compose guard accepts a three-decimal chip amount the route refuses
- **File:** pages/horses/index.js:1046-1053; route mint.js:339 `money2dp`
- Client checks only `amount > 0` and integer diamonds; `100.005` chips reaches the confirm dialog, the typed confirmation, and then a 400 "Amount Must Be Positive, To At Most Two Decimals". Probe: `money2dp(Number('100.005'))` is `null`. Also the amount is displayed through `num()` (`toLocaleString`), so `100.10` chips shows as "100.1" in the confirm sentence and the receipt. Fix: `if (mintAsset === 'chips' && !/^\d+(\.\d{1,2})?$/.test(String(mintAmount).trim()))` refuse before composing; format money with `minimumFractionDigits: 2` for chips.

### L-4  Policy threshold inputs accept negatives and >2dp that the route refuses
- **File:** src/components/horses/StaffPanel.jsx:643-712; operatorAdmin.js:120-160
- `type="number" min="0"` does not stop typed `-5`; probe: `setPolicyBody` sends `{ mintThreshold: -5 }` / `{ mintThreshold: 10.005 }`; server `money2dp(..., { allowZero: true })` returns null -> 400. Save is enabled; the operator learns from the toast. Also a cleared box is sent as 0 (which with approvals on means "everything"). Fix: validate like `ttlInRange` and disable Save with a hint.

### L-5  Modal focus lands on the header Close button, not the first field
- **File:** src/components/horses/Modal.jsx:59-64
- `box.querySelector(FOCUSABLE)` finds the "Close" button in `.dialogHead` before the body. ConfirmDialog hides it (so the typed input gets focus, good); the Approvals decision modal and the Grant/Revoke modals put focus on Close. Fix: query inside `.dialogBody` first and fall back to the box.

### L-6  `.btn` stays 40 px on coarse pointers
- **File:** src/components/horses/shared.module.css:284-290, 447-453
- Grant Role, Revoke, Approve, Reject and Save Policy use `.btn` (min-height 40); only `.dialogClose`, `.pagerBtn`, `.boundaryBtn` are raised to 44 under `@media (pointer: coarse)`. Add `.btn` to that rule.

### L-7  Two things called "Approvals"
- **File:** src/components/horses/tabRegistry.js:98 (`approvals`, maker-checker) and 114 (`CA_SECTIONS` `['approvals', 'Approvals']`, union applications and leave requests)
- `?tab=approvals` and `?tab=clubarena&section=approvals` are unrelated screens with the same label. Rename the Club Arena section label to "Union Applications".

### L-8  Dead/misleading export `OPERATOR_PERMISSION = 'operator.console'`
- **File:** src/components/horses/tabRegistry.js:30
- Not in the vocabulary, not referenced anywhere in pages/ or src/, and the comment "The single role tier that exists today" is false after Phase 2. Delete it.

### L-9  sql-console reads `res.json()` blind
- **File:** pages/horses/sql-console.js:242
- A 502/504 HTML page from the platform throws a SyntaxError into the catch and the operator sees "Unexpected token <". Use the `readJsonBody` pattern from useOperatorFetch.js:23.

### L-10  hg-moderation loaders have no sequence guard and set state after an unmount
- **File:** pages/horses/hg-moderation.js:482-500, 712-724
- Two quick status-tab switches can land the older list last; `setLoading(false)` runs after unmount on navigation. Same fix as M-3.

### L-11  Audit "Trail" dialog and expanded row print "IP not recorded" / "- request <id>" in lower case and the CSV header says "Request" while the column header says "Request ID"
- **File:** pages/horses/index.js:7353-7355, 7437-7439, 2211 (`['request_id', 'Request']`)
- Align to "Request ID" in both and Title Case the fragments.

---

## NOTE

- N-1  `fn_ca_operator_has_second_approver` failing on the server makes `decorateApprovals` hand the client `can_decide: true, alone_rule: true` for the operator's OWN request even with other approvers present (operator-admin.js:187-199 returns null on error; approvals.js:187-191 treats null as "alone"). The client correctly defers to `can_decide`; this is a server fail-open by section 0 design, recorded here so the client's "Alone Rule Applies" label is not mistaken for a client bug.
- N-2  Nothing flips a pending row to `expired`: a request past its TTL stays in the pending queue labelled "Expired" (local clock) with no action, and the History `status=expired` filter finds nothing until something writes that status. Not a client defect; a cron or a lazy expiry in `sectionApprovals` is the fix.
- N-3  The `grinder -> fleet` alias mentioned in the brief is not present at this commit (tab id is still `grinder`, TABS:60); nothing to review.
- N-4  `/api/geeves/analytics`, `/api/admin/scraper-health`'s consumers, `src/lib/supabase`, `src/lib/authUtils`, `SEOHead`, `EventBus`, `broadcastSync` and `PokerBrainLaunchButton` are not in this worktree, so the Geeves fetches (index.js:1333-1334, 2333) and the module-scope client rule for `src/lib/supabase` are **unverified** here.
- N-5  `React` default import is unused in eight .jsx files under the automatic JSX runtime. Harmless (not a hook); ESLint config is not in this tree so it may or may not warn.
- N-6  41 of 104 tests in horses-phase2-client.test.mjs and 40 of 53 in horses-console-phase1.test.mjs are source-text regex checks (`assert.match(src, ...)`) rather than behaviour; 4 of 42 in horses-subpages-phase1.test.mjs. They pin wiring (which is useful after Phase 1's unwired export button) but none of them would have caught B-1, H-1, H-2, H-3, M-2 or M-3. Behaviours with **no test at all**: the cashout 202 path; the approve-failure (503/409) path and `execute_approval`; that `onPolicyChange` refreshes `aloneRule`; keystroke debouncing on any filter; sequence guards on grinder/mint loaders (the "three unguarded fetches" test checks the Phase 2 panels only); `next/dynamic` loading/error rendering; Modal Escape/Tab/focus-restore (string-checked at console-phase1 "Modal owns a focus trap", never exercised); the tablist keyboard handler; ErrorBoundary reset-on-tab-change; the URL read/write effect pair (the pure helpers are tested, the effect ordering is not); `handleLogout` clearing `tickets`; the Staff "Turning Approvals On/Off" copy; StaffPanel/ApprovalsPanel rendering of any kind (no DOM). Behaviours that ARE behaviour-tested and that I re-checked: `hasPermission`/`permittedTabs`/`relocationTarget` (incl. the god full set), `approvalRowState` state machine incl. server verdict precedence and expiry-before-alone, `thresholdDecision` incl. alone rule, `isPendingApproval`, `normalizePolicy` both spellings, `setPolicyBody` diffing, `permissionMatrix` three shapes, `auditTrailUrl`/`approvalsUrl` param names, `pagerModel` null total, `collectAllRows`, `urlState` resolvers, `auditActionFilter` arrays, `trailActor`, `listMeta`, `isStaleRowRefusal`, `blockedReasonLabel`.

---

## Confirmed correct (things I tried to break and could not)

Fetch/route contract (every client call in index.js and the two panels was compared name-by-name):
1. `operator-admin` GET sections `staff|roles|policy|approvals|audit_trail` and params `status,kind,from,to,limit,offset,targetType,targetId` match `SECTIONS`, `pageFor` (`limit`/`offset`), `enumOf(query.status)`, `isoDate(query.from/to)`, `text(query.targetType/targetId)`. Empty filters are dropped by `operatorAdminUrl`. `to` is a bare date and the route extends it to `T23:59:59.999Z` (both approvals and stable-admin audit_log).
2. POST bodies `grant_role {userId, roleKey, reason}`, `revoke_role {grantId, reason}`, `set_policy {approvalsEnabled, allowSelfApproveWhenAlone, mintThreshold, fundThreshold, cashoutThreshold, approvalTtlMinutes}` (camelCase accepted via `POLICY_ALIASES`; `enforceNamedRoles` deliberately not sent and not rendered), `decide_approval {approvalId, decision, note}` match `grantRole`/`revokeRole`/`validatePolicyPatch`/`decideApproval`. Reason minimum 10 is enforced identically on both sides (`MIN_REASON_LENGTH` = route's `MIN_REASON_LENGTH`); an empty approve note is sent as `''` and the route treats it as absent. TTL bounds 5..43200 match `int(..., { min: 5, max: 43_200 })`.
3. Response shapes: `rowsOf(body, 'staff'|'approvals'|'entries')` covers `rows` plus each legacy alias the route emits; `listMeta` reads `total/hasMore/truncated`; `permissionsFromPayload` reads `operator.permissions`, `operatorIdFromPayload` reads `operator.id`, and `policyPayload` sends both spellings that `normalizePolicy` reads. `fn_ca_operator_staff` returns `user_id, email, username, display_name, profile_role, granted_roles, grants[{id, role_key, granted_at, granted_by, reason}], grant_history_count, last_sign_in_at, mfa_enabled` and StaffPanel reads exactly those; Revoke is by `grants[].id`. The trail RPC returns `admin_user_id, actor_role` and `trailActor` reads them.
4. Mint: POST `{action, asset, target, targetId, amount, reason, opId}` matches `validateIssuance`; `amount` is sent as a Number and `money2dp(String(n))` accepts it for any two-decimal value; GET `section=ledger&limit&offset&asset&action&holderId`, `section=targets&limit=500`, `section=player_search&q` match the route; ledger reads `rows || entries`; 202 is detected with `isPendingApproval` (requires `pending === true` AND `approvalId`), the ledger is not reloaded on 202, the receipt names the approval id and the "Open The Approvals Tab" button is rendered only when that tab is in `navTabs`. The idempotency key rotates with the payload (`mintPayloadKey` = action|asset|kind|targetId|amount|reason) and is stable across a retry of the same payload after a failed submit (the confirm object holds it; `resetMintForm` only runs on success/202). The confirm dialog uses the alone rule (`thresholdDecision` three-way) at compose time and the sentence is tested.
5. Audit tab: `audit_log` body `{action, actionPrefixes, actionPrefix, adminId, targetId, targetType, from, to, days, limit, offset, page}` matches `auditLog`; `days` only when neither date is set; `EXPORT_PAGE_SIZE` 500 = `AUDIT_PAGE_MAX`; CSV carries details/before/after as JSON strings and the three new columns; the Export button calls `exportAuditLog` (Phase 1 blocker 2 stays fixed); `Trail` is disabled without both type and id and `auditTrailUrl` returns null for either alone; the trail has a sequence guard and pages at 25.
6. Approvals tab: the pending queue is `status=pending&limit=100`, capped with a visible "Showing N Of Total" note; history is `usePagedList` (sequence + abort), dates go to the route, the local belt parses in UTC and reports if it hid anything; the CSV declares only columns in `APPROVAL_FIELDS`+decorations; self-raised rows render "Waiting For Another Operator" with no buttons unless the route says `alone_rule`; a 409/`already_decided`/`expired` refusal reloads the queue; rejection requires a 10-character note and the label says it is this console's rule.
7. Tab registry: all 18 permissions are members of `ALL_PERMISSIONS` (test 176 plus my read of permissions.js:33-56); `permittedTabs` is the identity for null/[]; `relocationTarget` returns null for every legacy role and moves only on a populated list that genuinely lacks a known permission (probe: `staff` with `['fleet.read']` -> `stable`); `?tab=`/`?section=` survive first load via the two refs, Back/Forward re-read `router.query`, tab clicks push shallowly, the bare `/horses` gets one replace; the tablist has roving tabindex, `aria-selected`, one `aria-controls` target, Arrow/Home/End with wrap and focus follows selection; `panelComponentFor` memoises `dynamic()` per tab id so the panel does not remount per render; the ErrorBoundary resets on `activeTab`.
8. React: every hook in index.js, StaffPanel and ApprovalsPanel is unconditional (checked by reading and by the existing hook-usage tests); the realtime handlers read refs; `useOperatorFetch` attaches an AbortController per call and aborts on unmount, surfaces `code/requestId/status`, and treats `success:false` on a 2xx as an error; `usePagedList` has monotonic seq + abort, resets offset on filter change, and does not refetch on re-activation; StaffPanel/ApprovalsPanel bump their seq on unmount so no setState after unmount; `showNotification` clears its timer; list keys are stable (operator id, permission, approval id, audit entry id).
9. House rules: no U+2014, no U+2013, no emoji (Unicode `\p{Extended_Pictographic}` scan of every file listed), no raw hex in pages/horses/*.js, no `.single()`, no "bot"/"bots" anywhere in the client, every `var(--*)` used by shared.module.css is declared on `.dashboard, .tokenScope` in horses.module.css, both NotBuiltYet panels describe routes that really answer 501 (`trigger-pipeline`, grinder-stats club actions), no TODO/FIXME/stub/coming-soon strings, no unused imports (scratch scan), no module-scope `createClient` in any client file.
10. Sub-pages: sql-console gates commit on the exact dry-run text and only emits DATA_MUTATED on a committed mutation; hg-moderation sends `report_id/action/moderator_note` and `appeal_id/decision/reviewer_note` exactly as hg-reports/hg-appeals read them, uses `pagerModel` with a null total and the route's `hasMore`, and rewinds an empty page; hand-reviews labels its page-only CSV with the row count and its pager with "Full Page, There May Be More" / "Last Page"; all three use `maybeSingle()`, `getAuthUser()`/`getFreshAccessToken()` rather than the banned session read, and show a retry on a failed role lookup instead of a blank page.

## Counts
- BLOCKER 1, HIGH 3, MEDIUM 8, LOW 11, NOTE 6.
- Verified by reading and/or scratch probe: all except M-5 (next/dynamic failure rendering, reasoned not executed) and N-4 (files absent from this worktree).
- Scratch artefacts: `/tmp/claude-0/-home-claude/9cde7fae-119c-54db-8247-e441eebf6d96/scratchpad/{probe.mjs,tc2.mjs,unused.mjs}`.
- Test suite at this commit: 479/479 pass under Node 22.
