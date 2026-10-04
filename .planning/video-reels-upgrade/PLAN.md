# Phase 9 Plan: Creator Rights, Attribution, And Moderation

## Confirmed Baseline

Phase 8 is protected-merged and live through `ab60785a5cf86a3fcafb217d0b0578ae0daacdd2`. Search, study continuity, canonical delivery, availability gates, rights-cleared native processing, and the bounded player remain authoritative. Phase 9 owns RGT-03 through RGT-07 and OPS-01 only.

## Wave 1: Durable Rights And Moderation Authority

1. Add owner-scoped creator source claims and submissions with operation identity, evidence references and digests, rights scope, territories, validity, exact attribution, disclosures, and reviewed lifecycle state.
2. Add durable content reports and takedown cases/events with replay-safe submission and least-privilege creator/admin access.
3. Apply takedowns in one database transaction that first suppresses every linked Library, Reel, post, search, saved, study, and deep-link read while preserving engagement and legal history.
4. Recheck active rights at publication and worker completion; external object deletion remains an explicit cleanup receipt after durable suppression.

## Wave 2: Creator And Operator Workflows

1. Add bearer-bound, account-exact creator APIs for claims, submissions, attribution, clip reviews, reports, and takedowns.
2. Add the mobile-first painted Creator Rights Console with sources, submissions, attribution, clip reviews, and case status.
3. Add the minimum operator moderation surface needed to review claims/submissions/reports and apply or reject takedowns. Phase 10 retains expanded analytics and operations dashboards.

## Wave 3: Trustworthy Public Delivery

1. Return exact creator/channel attribution, canonical source URL, disclosure labels, and Made For Kids state through canonical Reel and Library contracts.
2. Remove unrelated identity fallbacks. Managed third-party media without exact attribution fails closed.
3. Render one shared trust strip and one shared report workflow across dedicated Reels, embedded Reels, Social, and Video Library.
4. Preserve YouTube branding and controls, identifying referrer, embed-only playback, and the one-visible-autoplay-player budget.

## Wave 4: Verification And Release

1. Run focused migration, API, UI, canonical-feed, hostile-state, and connected Video/Reels suites.
2. Exercise duplicate/concurrent operations, cross-account access, expiry/revocation, worker/publication races, stale storage, old bookmarks, mid-flight removal, and cleanup-pending behavior.
3. Run the production build and required protected checks.
4. Install the exact migration once, read back schema/grants/RLS/functions, protected-merge, wait for Vercel, and verify exact live identity and affected behavior.

## Phase 9 Acceptance Gates

- Creator claims, submissions, rights grants, attribution changes, reports, and takedowns have durable replay-safe receipts.
- Creators can read only their own records and cannot self-approve; operators have a separately audited review boundary.
- Takedown success means all public readers fail closed immediately, including stale saves and old links, while history and engagement remain preserved.
- All public video surfaces show exact attribution and applicable sponsored, promotional, generated, community-submitted, responsible-play, and Made For Kids labels.
- Third-party YouTube media remains embed-only with controls, branding, referrer identity, and one active iframe.
- Focused and connected tests, production build, required CI, protected merge, migration installation/readback, Vercel READY identity, and live behavior proof all pass.
