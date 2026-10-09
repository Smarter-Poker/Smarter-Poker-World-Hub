# Trivia browser race proof

Run `node scripts/trivia/browser-race-proof/run.cjs` after installing the locked dependencies and Playwright Chromium. On the owner Mac, use installed Chrome and set TMPDIR to the task-owned external SSD. The script prints its temporary evidence directory; archive results then remove that directory.

This finite loopback fixture bundles the actual Achievements, Settings, Endless, StrategyTrivia, ResponsiveModeArt, ServiceWorkerUpdater, preference service, run hook and account/custody policies. Only auth identity, network adapter, header/SEO/navigation chrome, VIP lookup, own-profile read and training telemetry are fixtures. It has no production credential, database or payout access. It does not certify genuine authentication, finance, full page appearance or a moderated device review.

Thirteen browser scenarios exercise account transitions, delayed reads and claims, preferences CAS, same-account refresh ordering, pending Endless projection custody through reload and explicit retry, art request identity, and a real V1-to-V2 service-worker replacement with two active leases. Queued React handlers retained before an intervening refresh reproduce in-flight user intent; late callbacks must not replace newer authoritative state. Four strategy cases prove a single main-content landmark in the actual auth-loading and hydrated lobby states. Actual component CSS is bundled. Two browser frames let delayed responses render before assertions.

The shared Global Footer production-build job executes this script before unrelated broad footer tests. A failure is retained as a failure, not retried or skipped by this script.
