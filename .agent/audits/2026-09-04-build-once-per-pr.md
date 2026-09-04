# The World Hub builds twice per pull request. It should stay that way.

## What was investigated

`e2e-tests.yml` and `global-footer-e2e.yml` are the same workflow. Both do
`npm ci`, install Chromium and WebKit, run a full `npm run build -- --webpack`,
start `next start -p 3000`, and then run Playwright. They differ only in the
final invocation.

Measured over 7 days: **E2E Tests 849 min, Global Footer E2E 566 min.**

The obvious move is to fold the footer specs into the other job and delete the
duplicate. That was attempted on this branch and **reverted**. This note records
why, so the next person does not spend the same afternoon on it.

## Reason 1: it saves nothing that matters

The two workflows are separate WORKFLOWS, so they run **in parallel**, on
different runners. The 566 minutes is compute, not wall clock - and since both
run on self-hosted runners, that compute is already free. Merging them would
have removed roughly 566 minutes a week of idle-capacity usage and shortened
the critical path of a pull request by approximately zero.

The saving was real but it was the wrong currency. What actually costs time is
serial dependency, and there was none here.

## Reason 2: a law already forbids it, deliberately

`tests/one-build-command.test.mjs` pins:

```js
assert.doesNotMatch(
    workflow.match(/- name: Run Playwright tests[\s\S]*?\n\s+- name: Stop Next\.js server/)?.[0] || '',
    /--project=footer-/,
    'the authenticated gate is competing with the dedicated footer gate for the same local server'
);
```

The merge put a `--project=footer-*` step inside exactly that region and the
law fired, correctly.

Worth recording what was checked before accepting it, because the law's stated
reason is narrower than its effect. The footer projects in `playwright.config.ts`
carry **no `storageState` and no `dependencies: ['setup']`** - they are
deliberately logged-out and isolated from `e2e/00-auth.setup.ts`. So a
*sequential* footer step would not have inherited an authenticated session, and
the literal "competing for the same local server" hazard does not apply to it.

The law is therefore broader than its rationale. It was still obeyed, because
reason 1 means there was nothing to win by arguing with it, and because the
surrounding file documents a period when this job was red on every branch and
"a check that is red for everyone is not a check". Widening the busiest job in
the repo to buy free compute is not a trade worth making.

**If someone later wants this merge**, the case has to be made on wall clock,
not compute, and the pin has to move in the same commit with that argument
written down.

## What the investigation did find, and fix

`estate-ci-3` (World Hub runners, 8 cores / 16 GB) was hosting **8 runners**
against a build that requests a 7 GB heap
(`NODE_OPTIONS='--max-old-space-size=7168'`). Two concurrent builds exhaust the
box.

`journalctl` showed **12 OOM kills in 48 hours**. Three runners - `estate-wh-3`,
`estate-wh-7`, `estate-wh-10` - had been oom-killed on 2026-09-03 and never
restarted. Nothing reported it. The World Hub had been running at **70% of its
assumed CI capacity for a day** and the only visible symptom was that things
felt slow.

Fixed: the three were restarted, and World Hub CI now runs 6 runners on a
dedicated box sized for it. The 7 GB heap ceiling was left alone on purpose -
lowering it risks build failures and deserves its own change with its own
evidence.

See `docs/ci-runner-topology.md` in the Club Arena repo for the arithmetic that
now governs runner counts.
