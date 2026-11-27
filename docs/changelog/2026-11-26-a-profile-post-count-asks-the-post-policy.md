# 2026-11-26 A profile post count asks the post policy

A signed-out visitor opening a profile sent `HEAD /rest/v1/social_posts?author_id=eq.<id>` with `count=exact` and got 500. The same count ran from the profile page's cross-tab sync, its first load, its realtime refresh, and the login cache warmer.

| | Before | After |
| --- | --- | --- |
| anon, author 00000000-...-0001 (5,636 posts, 3,013 visible) | 7,915 ms, 500 after anon's 3 s statement_timeout | about 0.5 s, 3,013 |
| the author themselves | same | about 0.4 s, 3,025 |

Root cause: Postgres evaluated the social_posts SELECT policies once per row. The restrictive `video_posts_public_select_guard` calls SECURITY DEFINER helpers that re-plan on every nested call, about 1.4 ms a row.

Fix: `public.fn_social_profile_post_count(p_author_id)` (Club Arena migration `20261126232411_a_profile_post_count_asks_the_post_policy_set_wise.sql`, the repo whose migrations deploy on merge) counts exactly the rows those policies show the caller, evaluated set-wise. It refuses with SQLSTATE 55000 if the policies or their helpers change. Every World Hub caller now uses `fetchVisiblePostCount` in `src/lib/socialPostCount.js`, which falls back to the old table count only when the function is not installed yet or refuses a changed rule.

Not changed: `pages/api/admin/verify-profile-schema.js` counts the whole table as service_role, which RLS does not touch.

Hardening: `__tests__/a-profile-post-count-asks-the-post-policy.law.test.mjs`, wired through `_test-guards-exist`.
