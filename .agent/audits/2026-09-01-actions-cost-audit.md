# Actions cost audit - World Hub side (2026-09-01)

August: ~21,600 workflow runs here, ~90% of them woken by the ~76 daily Club
Arena bundle-sync pushes. Fixed at the source in Club Arena PR #2496: sync
commits now carry [skip actions], which GitHub honors for Actions only -
Vercel's git integration ignores it, so production deploys are untouched.
Expect WH push-triggered workflow volume to drop from ~76/day to the handful
of real commits.

This commit propagates the estate-shared agent-autopilot.yml change (the
`synchronize` trigger removed - auto-merge stays armed across branch pushes,
so re-running on every push re-enabled something already enabled; the */30
sweep still catches genuinely disarmed PRs). The file must stay byte-identical
across all seven repos (estate-integrity checks it).

Full audit: club-arena docs/changelog/2026-09-01-actions-cost-and-pipeline-audit.md
