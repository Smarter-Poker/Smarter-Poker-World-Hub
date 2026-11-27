# wh-vercel-deploy-failed-duplicate-import (PRIMARY, 2026-11-27T11:05Z)

Rows: operational_alert_events 449639 (VercelDeploymentFailed, firing 10:24:01Z,
dpl_2DNKZH24erXEh5p31vsMFYak52aJ, commit 208edab4 = #3136) and 449657
(resolved 10:52:01Z, successor dpl_GmrFNwXeaXiSpWbwY1VCa2Q8QRhk, 267b0574 = #3138).

Root cause, read from the commits: #3131 added
`import { vipCheckoutAnalytics } from '../../src/lib/store/vipCheckoutAnalytics.mjs'`
(pages/hub/diamond-store.js line 41) and #3136 added `vipCheckoutAnalytics` to
the `vipIntroPrompt.mjs` import (line 111). Each PR built alone; the squash of
#3136 onto #3131 bound the name twice, a SyntaxError, so `next build` failed.
#3138 removed the second import and the duplicate export; production has been
READY on 267b0574 since 10:46Z.

Why both PRs were green: World Hub protection is `strict: false`
(scripts/check-branch-protection.mjs), so a PR's checks are not re-run against
the main it merges onto. That is the release-policy invariant that would make
this state unwritable; it is out of this lane's scope and is recorded for REVIEW.

Regression test: `__tests__/a-module-imports-each-name-once.law.test.mjs`
- on 208edab4: `not ok 2 ... pages/hub/diamond-store.js: vipCheckoutAnalytics`
- on 267b0574: 2/2 pass, ~1 s over every tracked module under pages/ src/ components/ lib/.

CI gate: wired into `prebuild`, which runs in every Vercel build and every
Global Footer E2E build. Detection: the existing workers.deploy-error-poll
VercelDeploymentFailed route (it raised 449639 with target_task_id).
