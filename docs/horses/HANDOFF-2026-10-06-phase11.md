# Stable Admin Phase 11 Closeout

Status: Candidate validated locally. Protected merge, database installation and
production proof are recorded here only after they occur.

Policy receipt: version 2.9, manifest
`a659f31c5c1c2b0864889508079a635dd5fe2fc98decfbfc9d3f9c80dd45ec3b`.
Resumption receipt: the four canonical sources under
`/Users/smarter.poker/Documents` were emitted and read at
`2026-10-06T03:00:50.166Z` from candidate
`e89824385ac81f67200bf29548b02f5edf01602e`.

## Scope Completed

- O1 and O2: the Live Floor and Tournament pages resolve club and union names,
  link to the actual owner management surfaces, use exact registration counts,
  disclose bounded overlay evidence and show recorded refund entitlements and
  payments without creating a second writer.
- I3: Integrity has a bounded, ranked Identity Links view over four recorded
  evidence sources. Horses are included. Raw IP, device, fingerprint, email and
  user-agent values never leave the database function. Correlation is not a
  verdict, and the existing case and observation paths remain the only actions.
- C7: Platform Operations has an append-only incident ownership overlay with
  acknowledgement and release events. It never changes source incident status,
  resolution or health.
- E7: daily closes, weekly digest runs and recipients, club or union profit and
  loss snapshots, and browser export preparation receipts are durable records.
  Daily close binds the exact journal manifest hash and follows maker-checker.
- O7 boundary: browser exports now record actor, request, filters, row count,
  completeness, bytes and SHA-256 before asking the browser to download. The UI
  explicitly says this is a prepared receipt, not proof of browser delivery.

## Database Files

- `20261006024310_stable_admin_phase11_incident_acknowledgements_canonical.sql`
- `20261006022120_stable_admin_phase11_finance_records.sql`
- `20261006022123_stable_admin_phase11_identity_links.sql`

All three are additive, service-role-only and RLS-enabled where they add tables.
No migration moves chips, changes a seat or suppresses horse evidence.

## Verification Before Submission

- Stable Admin and migration regression set: 1,127 passed, 0 failed.
- Dedicated Phase 11 tests cover identity privacy and paging, incident ownership
  immutability/idempotency, finance records, maker-checker close signing and
  hash-bound export receipts.
- Full repository production build: passed, including the Phase 9 bundle budget.
- `/horses` initial JavaScript: 57,924 bytes; gzip: 19,435 bytes.
- Diff whitespace check and targeted lint: passed.

## Boundaries That Are Not Admin-Page Stubs

- P3 needs authoritative transfer, social, logout and paid-tournament enforcement
  in their owning runtimes before the operator switch can honestly govern them.
- C2 needs a new authenticated engine maintenance command and state machine.
- C4 needs an inventory and fail-closed guard at every authoritative money and
  engine consumer before global switches can be exposed.
- A browser cannot prove that a prepared CSV was saved or delivered. A true
  asynchronous artifact service still requires a private object store and worker.

The admin pages disclose these ownership boundaries. They do not present fake
controls, silently exclude horses or claim unavailable evidence is healthy.

## Delivery Record

| Layer | Evidence |
| --- | --- |
| Source | Pending protected PR and merge revision. |
| Database | Pending exact migration ledger versions, hashes and object/grant readback. |
| Publication | Pending READY Vercel deployment and `/api/health` revision. |
| Live behavior | Pending authenticated desktop and 375px route proof. |

No pending row may be rewritten as complete without its direct evidence.


## Authorized continuation, 2026-10-08

Owner: Stable Admin resumption. Owned branch
`agent/codex/stable-admin-final-resumption-20261008`, checkout
`/Volumes/SmarterWork/agent-work/stable-admin-resumption-20261008/world-hub`.
Scope: recover the Phase 11 certificate and footer gate, repair connected
support behavior, qualify and publish through protected World Hub delivery,
complete the 28-tab/nested audit and final documentation using direct evidence.
No engine replacement or installed migration replay.

Canonical policies freshly emitted/read at `2026-10-08T13:52:32.125Z`, version
2.9, manifest `a659f31c5c1c2b0864889508079a635dd5fe2fc98decfbfc9d3f9c80dd45ec3b`.
Owner hash `b9478d0331314413d8e12c41210b63479cdcabc1f86ed3fdcb3251efa36e6349`;
operating `a8bc3c04dce3354ebdd51a89c0b7d715af3344edcc794d33f6b3ad64506961d5`;
hardening `d5fc451ce5caf6d6b5e64597a13883e1246581678fe53c962339d0a66136993e`;
reference `adce89c3f838f2f373cd504a00329d53906404d1dd42a647f672af6c16f95555`.
Repository AGENTS, CLAUDE, AGENT-PLAYBOOK, PUBLISHING, storage guide and existing
checkpoint were read. Base `1dcecd9a78a38d6e1e8e94ab9f5358f8401b8255`.

Inherited closeout source and full continuation patches are preserved under
`/Volumes/SmarterArchives/agent-evidence/stable-admin-phase11/resumption-20261008`.
Final delivery assertions/docs are separated until actual production proof.
Original worktree remains untouched. PR #2162 was closed as fully superseded.

Prepared fixes: four named stable-admin reads use GET with unchanged action
permissions and GET writes refused before database access; support ticket status
sends the API's `id`, with a connected failing-before/passing-after regression;
footer PWA builds use explicit `PWA_ENABLED=1`, preserving production CSP while
avoiding local WebKit HTTPS upgrades; failed certificates retain bounded redacted
diagnostics. 109 Stable Admin and 52 footer/certificate/CSP/state checks passed,
with targeted lint and diff checks. No new repair is published yet.

Two full builds previously failed ENOSPC after successful compilation. Direct
APFS readback identifies the 256 GiB SmarterWork quota at 99.3%, while the same
external container has 746 GB unallocated. A task-owned case-sensitive volume
`StableAdminBuild20261008` (UUID/device to be verified before cleanup) was created
on that external container with 10 GB reserve/25 GB quota. It is mounted at
this task's `build-storage`; ignored `.next` links to its `next` subdirectory.
A first mount at `.next` exposed protected macOS volume metadata to Next's scan
and was immediately relocated before retry. No existing volume, quota or other
task's files changed. Remove only this created allocation after delivery.

Configured GitHub access and production certificate secret/variable names are
available; no values were extracted. Full build, integration, required hosted
checks, protected merge, Vercel READY/health, genuine certificate, full surface
audit and final protected documentation remain pending.


Integrated qualification: protected main `3cb65ec97` was merged without
conflicts. Candidate `4aab96d53c4ba9644c8702522c6403b87084768c` passed all 1,136
maintained Stable Admin tests and 27 isolated documentation/footer/certificate
contracts. Earlier 52 focused footer/CSP/state checks remain valid for unchanged
source. Normal hooks were restored through the maintained `npm run prepare`;
the initial local commit was amended through those hooks before submission.

All required prebuild/build-script suites passed. The first output-directory
link exposed Node realpath dependency lookup outside the checkout; a link to
this task's own node_modules in its build-storage parent repaired that lookup.
The failed Next build stage and bundle check then passed: 507/507 static pages,
30 explicit panel chunks, /horses initial JavaScript 58,057 bytes (gzip 19,491),
total initial JavaScript 373,125 bytes (gzip 117,663). Build logs retained in
the owned task folder. Created build volume UUID:
`5CEDF70B-29DB-4F91-A181-4B91DFCF6D55`, currently device disk7s1.

Local Phase 9 browser suite passed all 12 desktop/mobile checks with isolated
fixtures and real built documents/chunks. All 28 tabs were visited. Footer
Chromium/WebKit passed 50/52 tests, including all geometry, hydration, scroll,
controls and serving-scheme CSP checks. Both remaining failures are the same
SSR home-games read returning 500 in this local server without production
database credentials. The route inventory count assertion passed; an initial
suspicion of inventory drift was incorrect. No credentials were extracted and
no assertion was weakened. Exact-head hosted footer proof with its configured
secrets remains required. The genuine production certificate remains pending.

An additional maintained nested-navigation case covers the 47 registered
Fleet, Players, Integrity, HG, Economy, Platform and Club Arena sections. Its
first desktop failure was a test expectation: canonical Overview omits the
section parameter. The test now normalizes that documented default and scrolls
top-level tabs into view before real clicks; corrected results pending.


Final local mobile qualification: the old max-width:768px `.nav` rule centered
the non-shrinking 3,511px tablist. At 375px, Fleet Command's rectangle started
at x=-1,423px with scrollLeft=0, outside the reachable left scroll range. A real
click reproduced the timeout; the sanitized fixture screenshot is retained in
the evidence archive. The later mobile scroll-strip rule now explicitly uses
justify-content:flex-start. No forced click or timeout extension supplies the
fix. The rebuilt PWA production output and bundle budget passed. The full final
Phase 9 browser suite passed 14/14 without retries, including every top-level
tab and all 47 registered nested navigation sections at 1440x900 and 375x812
with reduced motion. The earlier mobile attempts were interrupted as obsolete
and are not counted as passes.

The existing Global Footer E2E production-build workflow now runs that same
console suite in Chromium desktop/mobile before its other independent gates.
Focused architecture/footer contracts passed 26/26 after this wiring change;
targeted lint and whitespace checks passed. Full Stable Admin contract evidence
for unchanged inputs remains the preceding 1,136-test pass. Source, protected
checks, hosted SSR/footer credentials, Vercel production identity and genuine
production certificate still require direct delivery evidence.


Resumption receipt: canonical policies reread at 2026-10-08T14:22:04.477Z;
version 2.9 and all five hashes above unchanged. Repository/publishing/storage
references and checkpoint reread. Candidate 89629c662 passed ordinary pre-push
and is remotely preserved. Generated PR #2228 was reused and its description
updated with concrete repair evidence. Exact-head required gate run 37791581240
failed only the roster privacy law's obsolete POST-body settings-read matcher.
The matcher now requires the exact authorized GET and rejects the old POST body;
server-only table and route permission assertions remain. Hosted footer run
37791580823 is still building and is not yet passing evidence.

An independent full-catalogue visual/overflow audit retained sanitized local
fixtures at 1440x900 and 375x812: all 28 panels passed real navigation, settled
loading, no document/body overflow and no page/chunk errors; 56 screenshots
archived. These are fixture rendering evidence, not genuine production data.


The screenshot review found a catalogue-test blind spot: the generic nested
`data` fixture omitted Mint destination arrays, so its error boundary caught a
render failure that page-error/chunk-only checks missed. Actual targets API
returns both arrays; this was a fixture defect, not an observed live Mint
defect. The fixture now carries the canonical arrays and the maintained
settled-panel helper refuses caught render boundaries. Corrected catalogue
audit passed both viewports, replacing all 56 screenshots; strengthened
maintained browser suite passed 14/14 without retries. Focused architecture,
core-panel, documentation and privacy contracts passed 33/33; targeted lint and
whitespace passed. Earlier 2-case audit is superseded by this corrected run.


Canonical policy resumption receipt: 2026-10-08T14:37:58.694Z, v2.9, all
manifest/source hashes above unchanged; repository references and checkpoint
reread at candidate b8c636c38. Exact-head safety run 37793081220 exposed the
Trivia worker contract still requiring VERCEL=1 and counting unrelated ready
steps globally. Its assertions now require explicit PWA_ENABLED=1, refuse
HTTPS-host impersonation and independently count the two Trivia gates. Worker
and rollback assertions remain. Validation and corrected submission pending.


Corrected Trivia focused group passed 180/180 locally, ordinary hooks passed,
submitted as 2cea2d7fe. This owned PR has automatic merging disabled so direct
release ownership retains the final footer acceptance gate. The production
certificate now additionally visits Statistics, Settings and Pipeline at both
widths, requires their authenticated reads to succeed and waits for their
loading states without changing controls. Dedicated certificate/consumer
contracts passed 31/31; targeted verifier lint and whitespace passed. Genuine
production results remain pending. Corrected visual sheets now replace the old
fixture-failure sheets; all 28 desktop/mobile panels were reviewed.


Canonical resumption policies reread at 2026-10-08T15:02:34.660Z, v2.9,
all preceding hashes unchanged; repository/publishing/storage references and
checkpoint reread at d4d751adb. Final local Stable Admin contracts passed
1,138/1,138. Required exact-head protected checks passed (safety run
37794970231). Footer run 37794970189 passed Stable Admin, Trivia/PWA,
Marketplace and footer routes/geometry, then failed Social Media WebKit close
focus. Artifact retained in the evidence archive. Local production WebKit
Social Media passed in isolation and in the full sequence; the latter passed
14 cases and failed Reels fallback availability locally. No successful full
menu gate is claimed. Failure-only, non-content DOM diagnostics now retain
focus target/ancestor inert state to distinguish remount and isolation causes;
assertions and timeouts are unchanged. Protected merge/publication/certificate
remain pending.


The shared footer blocker now has a reproducible source cause. A controlled
local feed GET was held while the real Social menu opened on its skeleton.
Escape closed it, then completing the feed replaced the entire header: the
unchanged toBeFocused assertion failed against the new approved trigger.
The page now reuses one keyed UniversalHeader at the same position under
PageTransition in both loading and populated branches. No delay, forced focus
or acceptance weakening supplies correctness. The exact reproducing sequence
and the converse hydration-before-close sequence both pass in WebKit; the
original Social containment test passes too (3/3). Both new cases assert the
original trigger stays connected, focus returns, and body/inert isolation
releases. Failing-before artifact retained under social-hydration-before-fix.
Connected menu/feed contracts passed 36/36; targeted lint has zero errors
and 33 pre-existing Social warnings. Full maintained production build passed
507/507 and bundle budgets (/horses 58,057 bytes; gzip 19,491).
The diagnostic-only hosted run 37797925101 is still queued; its candidate is
superseded by this authoritative fix when submitted. Genuine final hosted
acceptance, protected integration, publication and certificate remain pending.


The remaining local Reels failure was a test-fixture contract drift: the
menu test intercepted retired REST social_reels reads, while the real page
now reads /api/reels/feed and refuses ineligible media. Its fixture now uses
that canonical GET response and a fresh eligible embed shape. The actual
fallback-to-approved-header handoff passes, retaining all ownership/focus
assertions. Final full WebKit menu suite passed 17/17 without retries (53.8s);
27 focused menu contracts and targeted lint passed. The runtime build remains
the identical qualified Social source from 6840a58f0. This fixture/checkpoint
submission supersedes the still-building 37798948772 acceptance candidate.
Fresh database function body hashes match the earlier readback; all four
ledger rows remain installed. Direct service-role read calls returned objects;
anon and authenticated fleet/identity calls each refused with SQLSTATE 42501.
Sanitized results are archived. No database state was changed.
