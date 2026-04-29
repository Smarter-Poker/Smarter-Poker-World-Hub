# HANDOFF: Apply CHECK 7 storage bucket cap guard to build-safety-gate.yml

**Created:** 2026-04-29
**By:** Claude (Cowork session) — token lacks `workflow` scope
**For:** Any agent with a GitHub PAT that has `workflow` scope
**Repo:** `Smarter-Poker/Smarter-Poker-World-Hub`

---

## 1. Goal

Land CHECK 7 in `.github/workflows/build-safety-gate.yml` so the build fails
whenever the `social-media` or `live-recordings` storage bucket's
`file_size_limit` drops below 50 GB. This guards against silent reverts of
the cap (which previously caused every video upload >50 MB to 413).

## 2. Required capabilities

- GitHub PAT (or fine-grained token) with **`workflow` scope** on
  `Smarter-Poker/Smarter-Poker-World-Hub`. The PAT used by the previous
  agent only had `repo`, which is why this handoff exists.
- Read access to `.env.local` (or equivalent) for `NPM_TOKEN` (which
  doubles as a GitHub PAT in this repo) — confirm scope before pushing.
- Network access to `github.com` and `api.github.com`.
- Repo Settings access to add the `SUPABASE_SERVICE_ROLE_KEY` Actions
  secret (Owner or Admin).

If any capability is missing, do NOT proceed — emit your own handoff to a
better-scoped agent.

## 3. Pre-conditions

- Main branch HEAD must be at or after commit `047616c482` (the commit
  that added `.agent/patches/2026-04-29-add-bucket-cap-ci-guard.patch`
  and the bump-to-50GB migration). If HEAD has moved further, the patch
  may need a 3-way merge — see step 4 fallback.
- Both `social-media` and `live-recordings` storage buckets must already
  read 50 GB. Verify with:

  ```sql
  SELECT id, file_size_limit FROM storage.buckets
  WHERE id IN ('social-media', 'live-recordings');
  -- Both must equal 53687091200
  ```

  If either is wrong, re-apply
  `supabase/migrations/20260429_bump_social_media_and_live_recordings_to_50gb.sql`
  before continuing.

## 4. Steps

```bash
# 1. Get fresh main
cd /path/to/Smarter-Poker-World-Hub
git fetch origin main
git checkout main
git reset --hard origin/main

# 2. Apply the patch
git apply .agent/patches/2026-04-29-add-bucket-cap-ci-guard.patch

# Fallback if `git apply` fails (patch context drifted):
#   The patch inserts CHECK 7 immediately AFTER CHECK 6 in
#   .github/workflows/build-safety-gate.yml. Open the patch file, copy the
#   green-line block (the new CHECK 7 step), and paste it manually after
#   the closing `[ "$FAIL" -eq 0 ] || exit 1; echo "✓ Cron governance check passed"`
#   block of CHECK 6, before the existing `Report Check Duration` step.

# 3. Sanity-check the YAML still parses
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-safety-gate.yml'))" \
  && echo "YAML OK" || { echo "YAML BROKEN — abort"; exit 1; }

# 4. Commit + push
git add .github/workflows/build-safety-gate.yml
git -c user.email="bot@smarter.poker" -c user.name="Smarter-Poker" commit -m \
  "ci(safety-gate): CHECK 7 storage bucket cap guard (50GB minimum)"
git push origin main

# 5. Add the Actions secret (so the check actually enforces, not just warns)
#    Either via the GitHub UI:
#       Settings -> Secrets and variables -> Actions -> New repository secret
#       Name: SUPABASE_SERVICE_ROLE_KEY
#       Value: <copy from .env.local SUPABASE_SERVICE_ROLE_KEY>
#    Or via gh CLI if available:
gh secret set SUPABASE_SERVICE_ROLE_KEY \
  --body "$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"')" \
  --repo Smarter-Poker/Smarter-Poker-World-Hub
```

## 5. Verification

After the push lands:

1. Open the latest run of "Build Safety Gate" workflow at
   `https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/actions/workflows/build-safety-gate.yml`
2. The "Pre-Deploy Safety Checks" job MUST show a step named
   `CHECK 7: Storage bucket file_size_limit guard (50GB minimum)`.
3. The step output must contain both
   `✓ social-media bucket file_size_limit is at or above 50GB` and
   `✓ live-recordings bucket file_size_limit is at or above 50GB`.
4. Job ends green.

If the secret was NOT set, the step instead emits a yellow warning
"SUPABASE_SERVICE_ROLE_KEY secret not set — storage bucket cap is NOT
enforced." and exits 0. That is acceptable for a transition window but
should be resolved before considering this handoff fully closed.

## 6. Rollback

If CHECK 7 fails on a legitimate state (e.g. Supabase API outage causes the
bucket query to 5xx for an extended period), revert with:

```bash
git revert <SHA-of-CHECK-7-commit>
git push origin main
```

That removes the check entirely. Re-add via this same handoff once the
underlying issue is resolved. Do NOT just lower the threshold — that
defeats the guard.

## 7. Hand-back

Once verified green, do all of:

1. Mark task `#63` (Add CI guard for bucket file_size_limit) as completed
   in whatever task tracker is in scope.
2. Append a one-line note to `.memory/SUMMARY.md` under the Solved
   problems section with the commit SHA + date.
3. Delete this handoff file (`.agent/handoffs/2026-04-29-apply-ci-bucket-cap-guard.md`)
   in the same commit as the verification note.

## 8. References

- Audit doc: `.agent/audits/2026-04-29-video-upload-jws-tus-onbeforerequest.md`
- Patch source: `.agent/patches/2026-04-29-add-bucket-cap-ci-guard.patch`
- Bump-to-50GB migration: `supabase/migrations/20260429_bump_social_media_and_live_recordings_to_50gb.sql`
- Audit migration: `supabase/migrations/20260429_storage_buckets_explicit_caps_audit.sql`
- Operating rule that mandates this handoff format:
  `.memory/decisions/2026-04-29-no-manual-human-work.md`
