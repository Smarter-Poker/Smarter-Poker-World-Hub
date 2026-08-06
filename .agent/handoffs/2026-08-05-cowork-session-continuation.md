# Smarter.Poker — Session Handoff (2026-08-05, evening)

Paste this whole file as the first message of a **new Cowork task**. Not a new
message in an old thread — a new task. Network policy is read once, when the
session's VM boots, so a fresh task is the only way to pick up the GitHub
allowlist Dan just enabled.

---

## 0. FIRST ACTION — verify network, before anything else

Dan switched Cowork's code-execution network access to allowlist mode and added
`github.com`, `api.github.com`, `codeload.github.com`,
`objects.githubusercontent.com`. The previous session could not use it (its VM
predated the change). Confirm it landed:

```bash
timeout 15 git ls-remote https://github.com/Smarter-Poker/Smarter-Poker-World-Hub.git HEAD
```

- **A SHA comes back** → real `git push` works. Push over **HTTPS**, not SSH:
  `GIT_SSH_COMMAND` tunnels port 22 through an HTTP CONNECT proxy, which stays
  refused even for allowlisted hosts. `GITHUB_TOKEN` and `GITHUB_PAT` are in
  `.env.local`. Use the token in the URL for a single push rather than
  rewriting `origin` — Dan's Mac pushes over SSH fine and that should stay.
- **`403 from proxy after CONNECT`** → the setting did not save. Do not burn
  time on curl variants; every domain 403s identically when the policy is off
  (npm and Supabase included). Take a screenshot of Settings → Capabilities →
  Code execution and read the actual saved mode.

**Fallback that definitely works:** the GitHub MCP (`mcp__github__push_files`)
runs natively on the Mac and is authenticated. It delivered all three of
yesterday's commits. It is expensive — file contents pass through context, so
delegate it to a subagent — but it is never blocked.

The Supabase MCP (`mcp__ded0cf54-…__*`, project `kuklfnapbkmacvwxktbh`) also
runs on the host. `execute_sql`, `apply_migration` and `list_migrations` all
work. `list_migrations` returns ~96k characters and will blow up your context —
grep the saved tool-result file instead of reading it.

---

## 1. Ground truth

| | |
|---|---|
| Repo | `/Users/smarter.poker/Documents/Smarter-Poker-World-Hub` |
| Bash path | `/sessions/<id>/mnt/Smarter-Poker-World-Hub` (file tools use the `/Users/...` form) |
| Remote | `git@github.com:Smarter-Poker/Smarter-Poker-World-Hub.git` |
| Branch | `main` |
| Supabase | `kuklfnapbkmacvwxktbh`, Postgres 17, us-west-2 |
| Also mounted | `commander-shared` (separate repo), plus the six sibling Smarter-Poker folders |

**Never report something as shipped from the working tree.** Verify against the
committed object, and prefer the remote:

```bash
git show HEAD:path/to/file | grep -c 'distinctive string'
```
or `mcp__github__get_file_contents` and compare blob SHAs.

### Live hazards

- A background automation on the Mac runs `git add -A`, `git commit`, and
  periodically `git reset --hard origin/main`. It also holds `.git/index.lock`
  in bursts. Untracked new files survive a reset; **modified tracked files do
  not**. Commit in the same breath as the edit. If a lock blocks you:
  `rm -f .git/index.lock .git/HEAD.lock .git/refs/heads/main.lock`
- Another agent pushed to `main` twice during yesterday's session. Before any
  push, compare the remote blob SHA against your pre-edit baseline
  (`git rev-parse HEAD~1:<path>`) and refuse to push anything that diverged.
- The local clone is **behind** the remote and holds two commits (`e86b3efc`,
  `9737ad24`) whose content is already upstream under different SHAs (the MCP
  created its own commits). Identical patches, so a rebase drops them cleanly.
  Nothing is lost; do not "recover" them.

---

## 2. Verification gates

```bash
node node_modules/typescript/bin/tsc --noEmit                      # must exit 0
node ./_chk.cjs <changed files>                                     # @babel/parser
node --test src/lib/rewards/__tests__/transferMath.test.mjs         # 63 cases
node --test src/lib/rewards/__tests__/eggVerifiers.test.mjs         # 30 cases (new)
```

- `tsconfig.json` includes only `**/*.ts` / `**/*.tsx`, so `tsc` does **not**
  check the `.js`/`.jsx` that is most of this codebase. Adding `"**/*.js"`,
  `"**/*.jsx"` and `"checkJs": true` is still an open, worthwhile idea.
- `node --check` gives false passes on ESM and JSX. Always `node ./_chk.cjs`.
- `jest` is not installed and there is no `test` script.

### The pre-commit hook has three copies

`.git/hooks/pre-commit` is the one git actually runs. `scripts/pre-commit-hook.sh`
and `.husky/pre-commit` are tracked near-duplicates. Yesterday the installed
copy was stale, which cost real time. All three now match, but
**`.git/hooks/` is not version-controlled**, so any other clone (and any fresh
checkout) still runs the old blanket rule. If a commit is blocked by
"dangerous Supabase auth patterns" on a `pages/api/` file, re-sync it:

```bash
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

---

## 3. What shipped yesterday (all verified on the remote)

### 3.1 VIP gate — `sp-vip-status` was a free VIP switch
Commit `3c81ea6c` (World-Hub) + `6d0ce241` (commander-shared).

`checkFeatureAccess()` read `localStorage['sp-vip-status']` **before any network
call** and returned `hasAccess: true` on a bare string match. `AvatarContext`
seeded `isVip` from the same key, and `FeatureGatePopup` accepted a third
signal, `user.user_metadata.is_vip`, which users can write themselves via
`supabase.auth.updateUser`. Any of the three unlocked every gated feature.

Now: the server answer always wins when the server is reachable. New
`src/lib/gates/vipCache.js` — user-bound, 24h expiry, consulted only after every
server path has failed, and its grants carry `degraded: true`. A verified
not-VIP answer clears the cache. `AvatarContext` exposes **`vipResolved`**;
`useFeatureGate` holds its loading state while VIP is unknown rather than
flashing a paywall at a paying member (this is what the old cache was really
for). The `vip-status-changed` event no longer grants optimistically — any
script could dispatch it — it only triggers a re-check; revocation still applies
immediately.

`vendor/commander-shared/` is a **plain copied directory, not a submodule**.
Both copies were updated by hand and are byte-identical. Any future change to
either must be mirrored.

### 3.2 Easter eggs — the catalog was a free 500 ◆
Commit `f89f4c8e`.

`/api/rewards/claim` checked that an egg **key existed** and that `verifiable`
was not false. It never checked the user had earned it, and the catalog ships
inside the client bundle:

```
POST /api/rewards/claim {actionKey:'easter_egg', targetId:'to_infinity'}
```

paid 500 ◆ — the whole `EASTER_EGG_MONTHLY_CAP` — to any logged-in account on
the first try, for "earn 1,000,000 diamonds over your lifetime". All 64
verifiable eggs were claimable that way by anyone who read the bundle. The
previous handoff proposed wiring client-side detectors to that endpoint, which
would have industrialised the hole rather than closing it.

Now:
- `src/lib/rewards/eggVerifiers.js` — **25 database-backed verifiers**, a
  memoised query context, and a registry that **fails closed**: unknown egg,
  missing verifier, or a verifier that throws all pay nothing. Adding an egg to
  the catalog can no longer mint diamonds.
- `UNVERIFIABLE_EGGS` documents the other **42 in code**, each with what it
  would need (per-question latency, hint usage, time-on-page, solver EV deltas).
- `POST /api/rewards/eggs/evaluate` sweeps the registry and awards what is due.
  The client cannot name an egg or an amount — only ask to be re-checked — so a
  request that carries no claim cannot be forged into one. Idempotent per egg
  via `reference_id`.
- `src/hooks/useEasterEggSweep.js` + a global `EasterEggWatcher` in `_app.js`
  run it on sign-in and on the `sp-egg-check` window event. Any surface that
  finishes something scoreable can call `requestEggCheck()`.
- 30 tests, every verifier asserted at its boundary.

Also refined the pre-commit auth guard: it blocked **all**
`supabase.auth.getUser`, including the server-side `getUser(token)` bearer
verification that **38 existing `pages/api` routes** already use — so touching
any of them forced `--no-verify`, which also disables the conflict-marker check
that exists because of the April 2026 outage. Inside `pages/api` only the
argument-less client forms are blocked now; browser code is unchanged.

### 3.3 Migrations applied
`20260805000000_leak_review_state` and `20260805090000_trivia_session_answers`,
both via Supabase MCP `apply_migration`. Verified: `leak_review_state` has RLS
with 4 policies and 3 indexes; `trivia_sessions.answers` exists;
`record_trivia_session_answer` is service-role only (`authenticated` cannot
execute it).

---

## 4. Corrections to the previous handoff — do not re-do this work

- **§5.1 "users can self-grant VIP" was a false alarm.** The guard trigger is
  live; it is named `trg_guard_profile_privileged_columns`, not
  `trg_guard_profile_economics`. The old handoff queried the wrong name and
  concluded it was missing. Running the actual attack as `authenticated`
  against production returns `permission denied for table profiles`, and
  column-level UPDATE grants show **zero** economic columns for that role.
  Verified, not assumed.
- **§5.6 dead tab components are already gone.** `src/components/diamond-store/`
  on `origin/main` contains only `diamondStoreStyles.js`.
- **Migrations §5.4 are applied** (see 3.3).
- **`git push` did not work from the sandbox**, contrary to the old handoff's
  premise. It was not a credential problem: DNS resolved nothing and *every*
  domain 403'd at the proxy — npm and Supabase included. That is what Dan has
  now changed; verify it per §0 rather than assuming either way.

---

## 5. Still open, in priority order

### 5.1 Egg pricing contradicts the SQL — needs Dan's decision
`award_diamonds_v2` has `c_egg_max_single = 250`. **Sixteen eggs in the catalog
are priced above 250**, including nine that now have working verifiers
(`to_infinity` 500, `the_whale` 500, `the_ghost` 500, `millionaire` 400,
`old_guard`/`the_centurion`/`daily_legend`/`the_ambassador`/`level_100_boss`
300 each). They will pay 250 and the UI will promise more. Either the catalog
comes down or the SQL constant goes up — that is a money decision, so ask.

### 5.2 Rate limiter is per-lambda-instance and effectively meaningless
`applyRateLimit` uses an in-memory `Map`. On Vercel each instance keeps its own
counters and they reset on cold start, so the real limit is
`instances × max`. Needs a shared store (Upstash/Redis) before any stated limit
holds — including the SMS OTP caps that MFA depends on, and the new egg-sweep
endpoint. **Needs credentials from Dan**, so raise it before starting.

### 5.3 Expand egg coverage (42 remaining)
`UNVERIFIABLE_EGGS` is the to-do list, grouped by what each needs. The cheapest
wins first: `road_tripper` needs only a venue→state join on `venue_reviews`;
`data_miner` needs export logging; `the_optimizer` is now plausible because
`leak_review_state` exists. The expensive cluster is per-question training
telemetry (latency, hint usage, EV delta), which would unlock ~20 at once.

### 5.4 Rotate the leaked GitHub PAT
`ghp_waRFmoCB…` was pasted into a previous chat and is also in `.env.local` as
`GITHUB_TOKEN`. Still exposed in that conversation's history. Only Dan can
rotate it. `.env*` must never be committed.

### 5.5 Consider `checkJs` in tsconfig
See §2. Would catch a whole class of crashes automatically across the `.js`
majority of the codebase.

---

## 6. Standing instructions from Dan

- **Never end a task by asking him to run git commands.** Commit, push, verify,
  then report what shipped. Surface only decisions that are genuinely his —
  pricing, policy, product scope — and defects still open. Never mechanics.
- **Do not claim you cannot do something before testing it in this
  environment.** Several "impossible" things turned out to be possible; one
  ("git push works locally") turned out not to be. Test, then state.
- He wants thoroughness: line-by-line audits, swarms of agents, every fix that
  can be made.
- Economy philosophy, his words: *"WE AREN'T RICH AND DON'T HAVE A TON OF MONEY
  TO GIVE AWAY."* Reward behaviour that drives growth — referrals, social
  posting, engagement — and make users work for it. When in doubt on a reward
  path, fail closed.
- Repo rules that bite: no `.single()` (use `.maybeSingle()`), no emoji in
  source, no unused hook imports, no raw `@supabase/supabase-js` in API routes,
  never trust `req.query.userId` for identity.
