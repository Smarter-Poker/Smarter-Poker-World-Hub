# Personal Assistant Approved Design Correction

## Assignment And Authority

The owner rejected the current narrow, flat landing page and directed that it match the first attached approved chrome mockup. Prior publication authorization remains active. This delivery changes the Personal Assistant landing interior, its illustrations, directly affected existing tests, and one route-specific error-boundary key needed for Review Settings to remain open. Global header, footer, navigation artwork, native Sandbox, saved-hand APIs, and Club Arena logging remain unchanged.

Acceptance: large chrome Review My Play hero; shorter Virtual Sandbox row; compact My Leaks strip; illustrated Log A Hand and My Coaching Plan actions; visible Review Settings; accurate A-heart/4-spade/5-spade Sandbox and K-heart/Q-heart Leaks artwork; natural image proportions; live selectable text; truthful account states; responsive and keyboard access; functioning existing internal destinations. No Training Games body redirect or prominent SEO text wall.

## Source And Ownership

- Owner: root agent, with bounded primary-art, utility-art, and existing-test assistance.
- Repository: Smarter-Poker/Smarter-Poker-World-Hub.
- Checkout: `/workspace/scratch/266d416187ac/smarter-poker-design-worktree`, a linked private worktree. The initial private clone and its staged patch are preserved separately.
- Branch: `agent/codex/personal-assistant-approved-design-release`.
- Starting main: `304fadec43e8a20180d1c8de1c257c64cea1cecc`.
- Integrated main: `3ef4e637b799e16ad84f778656be03eb4c72aaf3`. Its added AST/import/route gate is retained. No landing or shared-chrome changes occurred in this integration.
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

Commit the final Settings correction and this evidence through normal hooks, transport the exact tested tree through configured authenticated GitHub Git-data access, fetch and inspect the actual candidate, run the unmodified pre-push gate on that revision, then create the owned branch/PR. Continue required hosted checks, protected squash merge, existing hub-vanguard Git publication, and deployed identity/behavior proof. No publication claim has been made.
