# 2026-11-28: tests reported red on World Hub main

Base: `origin/main` at `80681ea3` (#3287). Branch `work/redtests-20261128`.

## What CI actually does

Every test below runs in CI through `__tests__/_test-guards-exist.test.mjs`,
which imports it, inside build-safety-gate "CHECK 8: Auth-critical files exist"
(`node --experimental-vm-modules --test ...`). `horse-solver-v31-pipeline` and
`notification-feed-recovery` are also named in CHECK 8 directly. On the head of
#3287 (`2e7a31a6`), Pre-Deploy Safety Checks was `success` and its CHECK 8 step
was `success` (job 140932068656). So none of these were red in CI. They were
red when run by hand in an agent container, for one of four environment
reasons. In two of those cases the test passed in CI for the wrong reason, or
passed only because of another suite.

None was a product defect. No assertion was removed or loosened. Three
assertions were added.

## Per test

### 1. newsletter-zero-broken-links-and-images.law, LAW 2B (category c: DNS)

`curateWeeklyWireEdition` runs `verifyUpstreamImageReachable` and
`fetchArticleEditorialMetadata`. Both refuse a host that resolves to a private
address before they fetch, and both called `dns.promises.lookup` directly. The
test stubbed `fetch` but not DNS, so it depended on `smarter.poker` resolving.
In a container without DNS every lookup threw, every image read as dead, and
the heal never ran (`image_url` came back `''`).

Fix: `lookupImpl` (default: the system resolver, unchanged behaviour) is
injectable on both helpers and threaded through `curateWeeklyWireEdition`. The
test passes a stub that answers with a public address. It also asserts the
stub was consulted on all three hops. A new second case proves that a host
resolving to `10.0.0.7` is never fetched and never healed, so the SSRF refusal
still decides the heal.
Before: 6 pass, 1 fail. After: 7 pass, 0 fail.

### 2. the-proxy-checks-every-redirect-hop, "still allows an ordinary publisher" and "the redirect chain is capped" (category c: DNS)

`assertFetchableUrl` resolves a name and judges every address. Without DNS,
`www.pokernews.com` was refused, so the publisher case failed, and each redirect
hop in the cap test was refused as `BLOCKED_REDIRECT` before the cap could
trip. The nip.io case passed for the wrong reason: it was refused because it
did not resolve, not because it resolves to 169.254.169.254.

Fix: `assertFetchableUrl(parsed, { lookup })` and
`fetchGuarded(url, options, maxHops, { lookup })` accept a resolver. The
default is `node:dns/promises` `lookup`, unchanged, and every caller passes
nothing. The tests answer from a fixed table, so nip.io really resolves to the
metadata address. Two cases were added: a name with ANY blocked address is
refused (public plus `::ffff:127.0.0.1`), and a name that does not resolve is
refused.
Before: 22 pass, 2 fail. After: 26 pass, 0 fail.

### 3. horse-solver-v31-pipeline, "TRAIN context repair contracts ..." (category c: root user)

`test_source_contract.py::test_verified_child_below_nonreadable_parent` sets the
parent to mode 0100 and expects an un-anchored read to be refused. Root ignores
mode bits (CAP_DAC_OVERRIDE), so as root nothing was refused. CI runs as the
unprivileged `runner` user and passed.

Fix: `_without_privilege` runs the check as before for a normal user. As root,
it chowns the fixture tree to uid/gid 65534, forks, drops to that uid, and runs
the same two assertions there. A failure in the child fails the test. Checked
by mutation: with `SafeInputs.read` replaced by a plain `open`, the case fails.
Before: 1 fail (as root). After: 28 pass, 0 fail (as root).

### 4. delete-account-closes-the-account, notification-feed-recovery, reels-phase2-route-runtime, training-request-deadline, a-club-table-count-has-one-writer.law, club-stats-maintenance-does-no-repair-work.law (category c: runner flag)

All six load the real route through `vm.SourceTextModule`, which exists only
under `node --experimental-vm-modules`. CHECK 8 passes that flag. With it,
every test passes: 42/42, 14/14, 7/7, 12/12, 8/8, 6/6. The two `.law` files
already failed with a clear message. The other four failed with
`vm.SourceTextModule is not a constructor`. Those four now assert first with
the same message the law files use ("run with node --experimental-vm-modules,
as build-safety-gate CHECK 8 does"). That changes only how the failure reads
when the flag is missing.

### 5. bottom-nav-clearance

Passes on current main (7/7). It also runs in `prebuild`. No change.

### 6. weekly-wire-newsletter, "resolveWeeklyWireRecipients and renderWeeklyWireEmail ..." (found while checking 1; category c: leaked environment)

The signup link (`pt=`) and the welcome-back link (`wb=`) carry a signed token
only when a signing key exists. The test had no key of its own. It passed in
CI only because `alertmanager-page.test.mjs`, imported into the same process
by `_test-guards-exist`, sets `CRON_SECRET` at module scope. Run alone, it
failed. The test now sets a fixture `PROMO_SIGNUP_SECRET` around the two block
builds and restores it afterwards.
Before: 4 pass, 1 fail. After: 5 pass, 0 fail.

## Not done

- `_test-guards-exist.test.mjs` was not run whole in this container because of
  the shared RAM and CPU limits. Each file it imports that was touched here was
  run, along with every other suite that calls the changed functions
  (magazine law, the weekly-wire v3/v4/v5/forensic suites, newsletter
  end-to-end, server-only-modules, otc-tier3): 206 + 17 tests, 0 fail.
- The real-resolver path was not exercised: this container has no DNS. The
  default resolver arguments are the same calls as before.
