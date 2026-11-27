# Personal Assistant Approved Design Correction

## Assignment And Authority

The owner rejected the current narrow, flat landing page and directed that it match the first attached approved chrome mockup. Prior publication authorization remains active. This delivery changes the Personal Assistant landing interior, its illustrations, directly affected existing tests, and one route-specific error-boundary key needed for Review Settings to remain open. Global header, footer, navigation artwork, native Sandbox, saved-hand APIs, and Club Arena logging remain unchanged.

Acceptance: large chrome Review My Play hero; shorter Virtual Sandbox row; compact My Leaks strip; illustrated Log A Hand and My Coaching Plan actions; visible Review Settings; accurate A-heart/4-spade/5-spade Sandbox and K-heart/Q-heart Leaks artwork; natural image proportions; live selectable text; truthful account states; responsive and keyboard access; functioning existing internal destinations. No Training Games body redirect or prominent SEO text wall.

## Source And Ownership

- Owner: root agent, with bounded primary-art, utility-art, and existing-test assistance.
- Repository: Smarter-Poker/Smarter-Poker-World-Hub.
- Checkout: `/workspace/scratch/266d416187ac/smarter-poker-design-worktree`, a linked private worktree. The initial private clone and its staged patch are preserved separately.
- Remote Branch: `agent/codex/personal-assistant-approved-design-release`. Local verification branch: `agent/codex/personal-assistant-hosted-fix-candidate`.
- Starting main: `304fadec43e8a20180d1c8de1c257c64cea1cecc`.
- Integrated main: `9f70c77f8c1eae2167c9b8c3b3f79f8d56de51ee`. Its maintained build gates, VIP/SEO fixes, realtime transport hardening and concurrent Personal Assistant functionality are retained. Global header and footer sources are unchanged by this correction.
- Component: World Hub UI/assets. No engine or database delivery.
- Publication: ordinary hooks, protected PR/squash merge, existing Vercel Git project hub-vanguard, deployed identity and affected behavior verification.

## Current Reference Reading

Read November 27, 2026, and reread on resumption at 17:29 UTC: root AGENTS.md, full CLAUDE.md, AGENT-PLAYBOOK.md, PUBLISHING.md, all four docs/agent-policy sources using the policy reader, .agent/AGENT_BINDING_RULES.md, PROTECTED_FILES.md, HOST_CONFIG_OWNERSHIP.md, #SMARTERDESIGN skill and docs, EGRESS-AND-DEPLOY-ACCESS.md, and current Next CSS Modules/Link/CLI guidance. Policy version 2.9; manifest SHA-256 e78254a8d7b401b5e9f8fdcefa1f6f36088fa1a7128e1c2d18622c2a952ac2cb. Source hashes:

- OWNER-POLICY.md: f5633d1b9e2b3d3ad7f30dea9e89691ec3044e05ff68471e7d9d8de36e079256.
- OPERATING-LAW.md: a8bc3c04dce3354ebdd51a89c0b7d715af3344edcc794d33f6b3ad64506961d5.
- HARDENING.md: d5fc451ce5caf6d6b5e64597a13883e1246581678fe53c962339d0a66136993e.
- REFERENCE-INDEX.md: adce89c3f838f2f373cd504a00329d53906404d1dd42a647f672af6c16f95555.

The explicit latest mockup governs the requested diagonal chrome dividers and plaque composition where generic design guidance differs. Solid silver lettering remains live and readable.

Before final submission validation the full policy reader was read again at 2026-11-27T17:44:58.801Z from this linked worktree, with the same version and hashes above; local revision at that read was 8dfd76266. Repository, publishing, area instructions and checkpoint remain the current sources already read during this uninterrupted delivery.

## Observed Cause And Repair

The rejected page had an 820px interior, nearly equal thin navy cards, small buttons, 308px source images enlarged with object-fit cover, generic outline utility icons, and a visible About text section. The correction uses the approved unequal row hierarchy, broad chrome rims, large silver type, full-width buttons, and new cache-safe high-resolution assets fitted with object-fit contain. New artwork was generated against the supplied approved reference and inspected for the exact ranks/suits before use.

Actual browser rendering exposed two additional causes: shared image-rendering: crisp-edges made artwork jagged, and a high-specificity mobile height:auto reset stretched the image box over its labels. Scoped overrides in the Personal Assistant CSS module correct both without editing shared chrome. The visible Review Settings label now matches its accessible name.

Production-mode click-through reproduced a connected Settings defect: Leaks consumes settings=1 with a shallow URL replacement, while _app keyed its error boundary by the full URL. That remounted Leaks and immediately closed the sheet. Only the Personal Assistant Leaks route now joins the existing pathname-stable boundary allowlist. A regression in the existing phase7 suite fails on the old key and passes on the correction, including unchanged behavior for unrelated routes. The subsequent real browser run confirms that the sheet stays open and closes normally.

## Access And Verification

- Fresh clone and locked npm ci succeeded. Normal hooks installed.
- The normal commit hook refused the initial clone because it requires a linked worktree. The candidate was preserved as a binary patch and applied to the private linked worktree on current main. No hook was changed or skipped.
- GitHub connector identifies Smarter-Poker (254329056) with repository push/admin permission. Local gh has no authenticated host and ordinary Git push --dry-run fails because no username credential is available. The GitHub browser is already signed in, but CLI device activation is a separate uncompleted step. No secret was read or entered. The authenticated GitHub Git-data API is available; any object transport must retain the locally reviewed tree, ordinary commit/pre-push checks on the actual candidate, and protected PR checks/merge. No API contents/file-write bypass is permitted.
- Functional handlers, data hooks, authorization, native Sandbox and saved-hand APIs are preserved. Existing tests pinning the superseded layout were updated to the approved design while retaining real behavior assertions. Independent source review found no remaining material regression.
- node scripts/ci/pa-browser-smoke.mjs --check-only: passed (harness contract only, not browser execution).
- node --test tests/pa-*.test.mjs tests/personal-assistant-simplification.test.mjs: 234 passed.
- node --test __tests__/pa-mobile-upgrades.test.mjs __tests__/pa-saved-hands-and-review.test.mjs __tests__/first-paint-never-waits-for-javascript.law.test.mjs: 26 passed.
- After the accessible Settings label correction, all 5 tests in tests/pa-phase10-home-sandbox-tutorial.test.mjs passed again.
- After the Settings state correction and integration on current main, the complete 260-test Personal Assistant set passed again. The related phase7, video-library and Reels boundary suites also passed all 50 tests. The added Settings regression was demonstrated failing before the source correction.
- check-ui-text.mjs, check-title-case.mjs and git diff --check: passed.
- Actual local Next page rendered at 1250x1060, 1440x900, 768x1024, 390x844 and 320x740. No horizontal overflow or page errors. All five assets loaded at their expected intrinsic dimensions. At the reference viewport the three rows are 262px, 182px and 118px high and all five selections are above the fixed footer. Header/footer/shell/config sources are byte-unchanged.
- Full npm run build:vercel completed its prerequisite suites, then the Next compile was terminated with exit 137. This is not a successful full build. Earlier missing sparse-checkout assets were restored from tracked source; no application source was changed for those omissions.
- A scoped production build of the four Personal Assistant routes and the real _app/_document/error shell passed compilation and prerendering. Command: BUILD_CPUS=1 NODE_OPTIONS='--max-old-space-size=3072' node node_modules/next/dist/bin/next build --webpack --debug-build-paths='pages/_app.js,pages/_document.js,pages/_error.js,pages/404.js,pages/500.js,pages/hub/personal-assistant/index.js,pages/hub/personal-assistant/review.js,pages/hub/personal-assistant/sandbox.js,pages/hub/personal-assistant/leaks.js'. This is scoped evidence only; the full provider build remains required.
- Against the final scoped production build, 14 of 14 real browser checks passed at desktop 1250x1060 and phone 390x844, with zero runtime page errors. Both utility actions clear the revealed fixed footer and receive input. Review and native Sandbox return links work. Leaks and Coaching Plan select the intended tab, Settings opens and closes, and Log A Hand displays and dismisses its existing access gate when signed out. Local missing public environment configuration and omitted unrelated assets produce console/network warnings; no authenticated persistence claim is made from this signed-out run.
- The normal pre-commit hook passed in the linked worktree. The maintained pre-push hook passed on local candidate 8e1db097a9dddecaf3bd345a8715e4f1fdf4c703, including the newly integrated AST/import/route gate. It must run again on the final candidate before its remote branch is advanced.
- The authenticated GitHub app has accepted the initial immutable source blobs and each returned Git blob SHA matches the local bytes. The final tree and actual remote commit still require equality/readback and the ordinary pre-push hook before branch/PR publication. CLI device activation is not being bypassed or used; the already authorized connector provides Git-data access without exposing credentials.
- Evidence lives in the owned sibling pa-design-evidence directory. It contains screenshots, source hashes, TAP logs, build logs and the finite render harness. Signed-in write workflows have not been claimed as browser-verified.

## Next Action

Finish the demonstrated gate repairs below, commit the integrated candidate through normal hooks, transport its exact tree through configured authenticated GitHub Git-data access, fetch and inspect the actual candidate, run the unmodified pre-push gate on that revision, and fast-forward the existing PR branch. Continue required hosted checks, protected squash merge, existing hub-vanguard Git publication, and deployed identity/behavior proof. No publication claim has been made.

## Hosted Submission And Gate Recovery

PR #3153 is open at https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/3153. Its initial head is d2794371357bcd7a40f6fc9d3dd02630b46a6d78. Every transported blob and the complete source tree ed358c9c240c857d1afd35a646d32c260e30b7a9 matched the locally committed, tested source. The actual GitHub commit was fetched, its author and committer verified as Smarter-Poker, and the unmodified pre-push hook passed on that candidate before its branch was created. No hook, required check, credential boundary or protected merge was bypassed.

On resumption the four full policy sources were read through the policy reader at 2026-11-27T17:53:34.946Z from the linked worktree, revision d2794371357bcd7a40f6fc9d3dd02630b46a6d78, with the same version and hashes above. The full repository CLAUDE.md, AGENTS.md, AGENT-PLAYBOOK.md, PUBLISHING.md, EGRESS-AND-DEPLOY-ACCESS.md, binding/protection/host rules, SmarterDesign references and this checkpoint were also read. The installed Next.js matcher and unit-test guidance was read for the routing assertion repair.

Initial hosted results: Personal Assistant Browser Smoke and Unit Gates, No Conflict Markers, Audit Marker Guard, Safe-Area Top Guard, Undefined Identifier Guard and Supabase Invariants passed. Two actual failures are being repaired:

- Global Footer E2E run 46044589213, job 140660542502, failed during the build's prebuild tests at 17:49:31 UTC, before browser execution. The old shared-game-links test prohibited every occurrence of /api/og in middleware, incorrectly rejecting the public AUTH_ALWAYS_ALLOW entry intentionally added by PR #3103. Its test-only correction evaluates the actual Next matcher patterns and auth prefixes, retains rewrite/redirect assertions, and includes positive controls for private routes. No middleware behavior changes. The existing failure was reproduced locally; the repaired shared-game, static-file and native-CORS suites pass all 18 tests. Independent review found no material issue. A previous successful comparable Footer run was unavailable in the bounded provider lookup; it is not assumed green.
- Build Safety Gate run 46044589267, job 140660543528, failed at 17:55:21 UTC because the maintained Training source inventory was stale after the landing page stopped importing old utility icons. The existing generator was run after integrating main26345b223. Relative to that main, the generated difference removes precisely two references to the Personal Assistant landing source. No classifications, invariants or checks were weakened. The generator's --check passes.

The private checkout now includes all tracked public assets and rule-book files needed by the full prebuild suite. A task-owned Python test environment supplies requests and the exact numerical requirements already specified by the hosted workflow. The complete npm prebuild passes: JavaScript selections of 421, 103 and 1217 tests, plus 54 Python tests, all successful with no skips.

The wider required Leak Engine suite exposed one pre-existing isolated fixture failure: it set an unsupported PA_AUDIT_JOB_SECRET while the signer reads NEXTAUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY. A child-process reproduction confirmed a deliberate 503 without a supported key and a 202 with a synthetic test key, using only a fetch mock. The existing test now sets and restores a supported synthetic NEXTAUTH_SECRET and asserts the response before the forwarded body. Runtime signing and fail-closed behavior are unchanged. All 473 Leak Engine tests now pass.

The remaining full-build tests exposed a local fixture isolation defect in Poker Near Me phase13: its synthetic dispatcher test isolated HOME but left persistent alert state at the system default. The test now scopes OPENCLAW_ALERT_STATE to its existing temporary directory, which its existing finally block removes. All runtime code and assertions are unchanged, and independent review confirmed the correction. This is necessary for repeatable required prechecks and does not alter business schedules or notifications.

The full build's precompile test sequence now succeeds: 67 V31 tests, then the maintained PNM, training, Leak Engine, Marketplace and Trivia sequence. One existing Marketplace PostgreSQL17 integration test is explicitly skipped because that local database runtime is unavailable; it is not counted as passing. Hosted database/check requirements remain authoritative. Local numerical tests use the locked requirements under Python3.13. The default local Python3.12 produces a different ast.dump digest for a frozen algorithm, while Python3.13 passes the unchanged 12-test continuation contract; the hosted workflow provides its own pinned Python3.14.2. No algorithm, frozen digest or test assertion was changed for that environment difference.

Ordinary commit/pre-push, revised hosted checks and production publication remain pending. The initial live health baseline at 17:44:01 UTC was still commit304fadec43e8a20180d1c8de1c257c64cea1cecc, deployment dpl_AT6W4NopGYRA3YcGxj5Wzrt5rWn2; that is not this correction.

## Concurrent Personal Assistant Integration

The ordinary pre-push gate correctly refused unpublished candidate425f0d91df6c8c61c2dd5e0f1e2abc8c621931e3 when concurrent main changes created merge conflicts. The PR branch remains at d279 while the corrections are integrated; the failed candidate was never published to that branch.

Main6712087268264b227b78d35f72c99e25534c7dc2 adds the approved review workstation, native multiway Sandbox, saved-hand API work and server-provided landing counts from PR #3150. All of that functionality is preserved. The landing conflict was confined to image dimensions/loading: the new chrome artwork keeps its actual dimensions; the primary image retains high fetch priority through the lowercase React18 DOM attribute and eager loading; My Leaks retains incoming lazy loading. The new existing image-priority test now names the approved assets and their correct natural sizes. Main's concurrent OG test repair is retained alongside actual matcher evaluation, including its public allowlist, destructive-route and tombstone checks.

After integration: 297 focused Personal Assistant/workstation/Sandbox tests pass, all 473 Leak Engine tests pass, the browser smoke contract passes, and the scoped production build of the four Assistant pages plus real app shell passes again. All14 actual production-mode desktop/phone interaction and footer-reachability checks pass with zero runtime page errors and zero fatal errors. Missing local service configuration still produces69 console/network error messages and41 HTTP errors; this remains a signed-out navigation proof, not authenticated persistence evidence. Updated screenshots and results are in pa-design-evidence/integrated.

The integrated npm prebuild succeeds. One live JWKS drift test explicitly skips because its network request times out; its result is not counted as passing. The shared chrome sources remain byte-unchanged. The maintained inventory differs from main by exactly the two obsolete landing icon references. Current main advanced again to9f70c77f8 while this check ran; its independent VIP and build-gate work must be integrated before the final ordinary pre-push.

Main9f70c77f8c1eae2167c9b8c3b3f79f8d56de51ee has now been integrated without conflicts. Its guest conversion component, independent VIP changes and stricter delivery checks are preserved. The component is absent for signed-in sessions and is outside this landing design change. The focused Settings, review workstation and new global conversion integration tests pass; inventory regeneration still changes only the same two obsolete references. The scoped production rebuild and final signed-out browser traversal on this shell revision are running, after which the verified source will advance the existing PR. The previous normal commit hook emitted an echo broken-pipe warning after grep found the required transpile package; the guard exited successfully and direct source inspection confirmed the required package remains configured. No hook was bypassed.
