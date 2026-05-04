# Handoff: Hetzner cleanup — disable duplicate yt-transcode + retroactively label all 4 servers

**Date:** 2026-05-04
**Origin agent:** Cowork session (Dan's local-agent-mode)
**Reason for handoff:** Cowork sandbox cannot SSH or call the Hetzner API. Antigravity on Dan's Mac has both via Keychain (`smarter-poker/hetzner-api`) and `~/.ssh/openclaw_ed25519`.

**Mission:** Three small jobs in one session:
1. Stop and disable the broken duplicate `sp-yt-transcode.service` on `openclaw-dispatcher` (the working one stays running on `reels-transcode-worker`).
2. Retroactively apply RULE 10 attribution labels to all 4 production Hetzner servers (so the new rule's standing audits work).
3. Optionally clean up `social_reels` rows that the broken duplicate flipped to `media_status='failed'` when the working duplicate would've succeeded.

**Why this matters:** The 2026-05-04 inventory audit (`.agent/audits/2026-05-04-hetzner-inventory/REPORT.md`) confirmed that `sp-yt-transcode.service` is running on TWO boxes simultaneously. The instance on `openclaw-dispatcher` has no YouTube cookies and fails every job (`yt-dlp_exit_1`); the instance on `reels-transcode-worker` succeeds. Both boxes poll the same Supabase queue. The broken duplicate is poisoning failure metrics and possibly blocking reels from playing as iframes when conversion ultimately fails.

---

## Binding rules

1. **Scoped to one service on one box.** Do NOT touch `sp-transcode.service` (HEVC pipeline) or `openclaw.service` (cron dispatcher) on `openclaw-dispatcher` — those are in production use. Only touch `sp-yt-transcode.service` on that box.
2. **Do NOT touch `reels-transcode-worker` (`5.161.49.206`)** — that's the working YT converter. Verify it's still running at the end, but do not modify.
3. **Do NOT touch the engine box (`178.156.160.206`)** beyond reading labels via the Hetzner API.
4. **Reversibility:** Stopping and disabling a systemd service is fully reversible (`systemctl enable + start`). Removing the unit file is NOT what we're doing. We're disabling, not uninstalling.
5. **Push the audit + handoff updates** at the end via `git-safe-push.sh`.

---

## Step 1 — Stop + disable broken yt-transcode on openclaw-dispatcher

```bash
SERVER_IP=178.104.160.250
SSH_KEY=~/.ssh/openclaw_ed25519

# Confirm it's running (sanity check before we stop it)
ssh -i $SSH_KEY root@$SERVER_IP 'systemctl status sp-yt-transcode --no-pager | head -20'

# Stop and disable. The .timer for cookie refresh stays (it's already disabled
# per .github/workflows/deploy-yt-worker.yml line 123, but check anyway).
ssh -i $SSH_KEY root@$SERVER_IP '
  set -euo pipefail
  systemctl stop sp-yt-transcode.service
  systemctl disable sp-yt-transcode.service
  systemctl status sp-yt-transcode --no-pager | head -10
  echo "---"
  systemctl status sp-yt-cookie-refresh.timer --no-pager 2>/dev/null | head -5 || echo "(no cookie-refresh timer — fine)"
'
```

**Expected:** `Active: inactive (dead)` and `Loaded: ... disabled`.

**Do NOT remove the unit file** at `/etc/systemd/system/sp-yt-transcode.service`. Leave it in place so a future agent can re-enable if needed (e.g., if the working box dies and we need a hot fallback). Just make sure it's stopped + disabled.

## Step 2 — Verify the working box is still running

```bash
WORKING_IP=5.161.49.206
WORKING_KEY=~/.ssh/openclaw_ed25519     # same key works per audit

ssh -i $WORKING_KEY root@$WORKING_IP '
  systemctl is-active sp-yt-transcode
  journalctl -u sp-yt-transcode -n 5 --no-pager
'
```

**Expected:** `active` + recent log lines showing successful conversions or healthy idle polls. If this box is down, STOP and surface to Dan immediately — disabling Step 1 just took out the only YT converter.

## Step 3 — Watch the queue drain for 2 minutes

```bash
# Check via Supabase MCP (or psql, or the Supabase Dashboard SQL editor):
# Use the working agent's Supabase MCP credentials.
```

Run via Supabase MCP `execute_sql`:
```sql
SELECT
  COUNT(*) FILTER (WHERE source_type='youtube' AND status='queued')      AS queued,
  COUNT(*) FILTER (WHERE source_type='youtube' AND status='processing')  AS processing,
  COUNT(*) FILTER (WHERE source_type='youtube' AND status='completed' AND completed_at > NOW() - INTERVAL '5 minutes') AS completed_last_5min,
  COUNT(*) FILTER (WHERE source_type='youtube' AND status='failed' AND completed_at > NOW() - INTERVAL '5 minutes') AS failed_last_5min
FROM video_transcode_jobs;
```

Run twice, ~2 minutes apart. **`completed_last_5min` should be > 0** (the working box is draining). **`failed_last_5min` should be ≈ 0** (the broken box no longer claiming jobs to fail). If `failed_last_5min` is still climbing, the disable didn't take effect — re-check Step 1.

## Step 4 — Retroactively apply RULE 10 labels to all 4 production servers

```bash
TOKEN=$(security find-generic-password -a smarter-poker -s hetzner-api -w)

# Server 1: club-arena-engine
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"labels":{
    "project":"smarter-poker",
    "service":"game-engine",
    "created_by":"dan-manual",
    "purpose":"live-poker-game-server",
    "created_at":"2026-03-27",
    "kill_after":"permanent"
  }}' \
  https://api.hetzner.cloud/v1/servers/125093929 \
| jq '.server | {name, labels}'

# Server 2: openclaw-dispatcher
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"labels":{
    "project":"smarter-poker",
    "managed_by":"openclaw",
    "role":"cron-dispatcher",
    "created_by":"antigravity-phase-2a1",
    "purpose":"cron-dispatcher-and-hevc-transcoder",
    "created_at":"2026-04-23",
    "kill_after":"permanent"
  }}' \
  https://api.hetzner.cloud/v1/servers/127861894 \
| jq '.server | {name, labels}'

# Server 3: workers-dispatcher
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"labels":{
    "project":"smarter-poker",
    "managed_by":"phase-2b1",
    "role":"workers",
    "created_by":"cowork-phase-2b1",
    "purpose":"cron-job-handlers",
    "created_at":"2026-04-24",
    "kill_after":"permanent"
  }}' \
  https://api.hetzner.cloud/v1/servers/127930016 \
| jq '.server | {name, labels}'

# Server 4: reels-transcode-worker
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"labels":{
    "project":"smarter-poker-reels",
    "managed-by":"github-actions",
    "service":"yt-transcode",
    "created_by":"cowork-2026-05-01",
    "purpose":"youtube-to-mp4-conversion",
    "created_at":"2026-05-01",
    "kill_after":"permanent"
  }}' \
  https://api.hetzner.cloud/v1/servers/128782737 \
| jq '.server | {name, labels}'
```

Verify all 4 came back with the new labels (`jq` prints `{name, labels}` per call).

Note: PUT replaces the entire labels block. The original labels (e.g., `project: smarter-poker`, `service: game-engine`) are preserved in the payloads above. Don't drop any pre-existing label.

## Step 5 — Optional: reclassify reels that the broken duplicate flagged failed

This is optional cleanup, only if the queue health query in Step 3 shows recently-failed jobs from the broken duplicate were YouTube-cookie-related (not legitimately permanent like "video unavailable"). Run via Supabase MCP `execute_sql`:

```sql
-- Count how many reels are stuck failed because the duplicate broke them
SELECT COUNT(*) AS broken_duplicate_failures
FROM video_transcode_jobs
WHERE source_type='youtube'
  AND status='failed'
  AND error_message LIKE '%yt-dlp_exit_1%'
  AND completed_at > NOW() - INTERVAL '7 days';
```

If that count is meaningfully > 0 (say > 20), requeue them so the working box gets a chance:

```sql
-- Requeue jobs that failed with cookie-related yt-dlp errors in the last 7 days.
-- The working box has cookies, so it'll succeed where the broken duplicate failed.
UPDATE video_transcode_jobs
SET status='queued', worker_id=NULL, started_at=NULL, error_message='requeued_after_duplicate_disabled_2026-05-04'
WHERE source_type='youtube'
  AND status='failed'
  AND error_message LIKE '%yt-dlp_exit_1%'
  AND completed_at > NOW() - INTERVAL '7 days';

-- Also flip the corresponding reels back to 'queued' so the player gate query is consistent.
UPDATE social_reels
SET media_status='queued'
WHERE id IN (
  SELECT DISTINCT reel_id FROM video_transcode_jobs
  WHERE source_type='youtube'
    AND status='queued'
    AND error_message='requeued_after_duplicate_disabled_2026-05-04'
);
```

If the count is small (< 20), skip this step — the next backfill run will catch them.

## Step 6 — Write the audit, update the build tracker, push

```bash
cd ~/Documents/Smarter-Poker-World-Hub

mkdir -p .agent/audits/2026-05-04-hetzner-cleanup
cat > .agent/audits/2026-05-04-hetzner-cleanup/AUDIT.md <<'EOF'
# Hetzner cleanup — duplicate yt-transcode disable + retroactive labels

**Date:** 2026-05-04
**Trigger:** April invoice audit surfaced 4 × CAX41 orphans ($56/mo). They were already deleted by the time the audit ran. This audit closes the loop on remaining cleanup items.

## Changes

1. **Disabled** `sp-yt-transcode.service` on `openclaw-dispatcher`
   (server `127861894`, IP `178.104.160.250`). Service was failing every
   job due to missing YouTube cookies, racing the working instance on
   `reels-transcode-worker` (server `128782737`). Stopped + disabled but
   unit file retained for emergency fallback.

2. **Retroactively labeled** all 4 production Hetzner servers with
   RULE 10 attribution metadata: `created_by`, `purpose`, `created_at`,
   `kill_after`. Original `project`/`role`/`managed_by` labels preserved.

3. **(Optional)** Requeued N reels that the broken duplicate flagged
   failed with cookie-related yt-dlp errors in the prior 7 days, so the
   working instance gets another chance.

## Verification

- `systemctl is-active sp-yt-transcode` on openclaw-dispatcher → `inactive`
- `systemctl is-active sp-yt-transcode` on reels-transcode-worker → `active`
- `failed_last_5min` queue counter dropped to ≈ 0 within 5 minutes of disable
- All 4 Hetzner servers return RULE 10 labels via `GET /v1/servers/<id>`

## What's still in place

- HEVC transcoder (`sp-transcode.service`) on openclaw-dispatcher — UNCHANGED
- Cron dispatcher (`openclaw.service`) on openclaw-dispatcher — UNCHANGED
- Working YT transcoder on reels-transcode-worker — UNCHANGED
EOF
```

Update the build tracker so the next agent inherits the corrected state. Edit
`SMARTER-POKER-BUILD-TRACKER.md` if it exists and references stale architecture
(e.g., "Game server migrated: Railway → Hetzner Cloud" with no mention of the
other 3 Hetzner boxes). Add a section like:

```markdown
## Hetzner production footprint (verified 2026-05-04)

4 servers, all production, all labeled per RULE 10:

| Server | Type | DC | Role |
|---|---|---|---|
| club-arena-engine (125093929) | CPX11 | ash | Live poker engine + Prometheus stack |
| openclaw-dispatcher (127861894) | CX23 | nbg1 | Cron scheduler + HEVC transcoder |
| workers-dispatcher (127930016) | CX23 | fsn1 | Cron job handlers (Hono Docker) |
| reels-transcode-worker (128782737) | CPX21 | ash | YouTube → native MP4 |

Approx run rate: ~$31/mo (was $67 before April orphan deletion).
4 × CAX41 orphans (`126910918`, `126910920`, `126910922`, `126910923`)
existed Apr 1–24 and have been deleted. Do not re-create without §10.1
justification.
```

Push:

```bash
bash scripts/git-safe-push.sh "ops(hetzner): disable duplicate yt-transcode on openclaw + retroactive RULE 10 labels"
```

## Step 7 — Stale comment fix in transcode-worker/index.js

This is a 2-line documentation fix — not strictly required, but RULE 9 says update memory hygiene when discovered. The comment at `scripts/transcode-worker/index.js` line 10 says HEVC runs *"same VM as Open Claw cron"* — that's still correct as of 2026-05-04 (HEVC IS on openclaw-dispatcher). But add a sentence pointing to the working YT companion:

```diff
- * Runs as a systemd service on Hetzner (same VM as Open Claw cron).
+ * Runs as a systemd service on the openclaw-dispatcher Hetzner VM
+ * (server id 127861894, nbg1). The YouTube/MP4 sibling worker
+ * (sp-yt-transcode.service) lives on the dedicated reels-transcode-worker
+ * VM (server id 128782737, ash) — not on this box.
```

Apply, commit, push as part of the same `git-safe-push.sh` invocation in Step 6 (or a follow-up small commit if Step 6 already pushed).

---

## Exit criteria

- [ ] `systemctl is-active sp-yt-transcode` on `178.104.160.250` returns `inactive`
- [ ] `systemctl is-enabled sp-yt-transcode` on `178.104.160.250` returns `disabled`
- [ ] `systemctl is-active sp-yt-transcode` on `5.161.49.206` returns `active`
- [ ] All 4 Hetzner servers return RULE 10 labels (`created_by`, `purpose`, `created_at`, `kill_after`)
- [ ] Audit file at `.agent/audits/2026-05-04-hetzner-cleanup/AUDIT.md` exists and was committed
- [ ] If build tracker exists: updated with current 4-server table
- [ ] `transcode-worker/index.js` line 10 comment fix landed (optional but preferred)
- [ ] `git-safe-push.sh` exited 0 with `DEPLOY_VERIFIED:true`
- [ ] Brief result paste-back to Cowork chat

## Failure modes

| Symptom | Fix |
|---|---|
| `systemctl stop` errors with "Service not found" | Audit said the unit was loaded — recheck with `systemctl list-units \| grep yt`. The unit may have been moved/renamed since the audit. |
| `systemctl disable` errors | Try `systemctl mask sp-yt-transcode` as alternative — fully prevents re-enable. |
| Hetzner API PUT returns 401 | Token rotated. Mint a new Read+Write token at console.hetzner.cloud → Security → API Tokens, store via `security add-generic-password -U -a smarter-poker -s hetzner-api -w '<TOKEN>'`. |
| Working box (`reels-transcode-worker`) is also down | STOP — do not disable the broken duplicate without a working primary. Surface to Dan and investigate why the working box is down first. |
| `failed_last_5min` keeps growing after disable | Disable didn't take. Re-check `systemctl status sp-yt-transcode` on openclaw-dispatcher. May need `systemctl mask`. |

## Do NOT touch

- `openclaw.service` on openclaw-dispatcher (cron dispatcher — production)
- `sp-transcode.service` on openclaw-dispatcher (HEVC — production)
- Any service on `reels-transcode-worker` (working YT pipeline)
- Any service on `club-arena-engine` (live game server)
- `workers-dispatcher` Docker container
- The Hetzner API token in Keychain
- Any vercel.json, pages/api/cron/*, or CI workflow file

## Out of scope

- Right-sizing `reels-transcode-worker` from CPX21 → CX22 (defer; needs memory check)
- Removing the disabled unit file at `/etc/systemd/system/sp-yt-transcode.service` on openclaw-dispatcher (keep as cold fallback)
- Setting up Hetzner billing alerts (Dan's task — browser action)
- Adding the new RULE 10 to other repos' CLAUDE.md (the rule is repo-agnostic and applies via the canonical CLAUDE_AGENT_RULES.md in World Hub)

## References

- RULE 10: `Smarter-Poker-World-Hub/.agent/CLAUDE_AGENT_RULES.md` §10
- Audit input: `.agent/audits/2026-05-04-hetzner-inventory/REPORT.md`
- Audit handoff that produced REPORT.md: `.agent/handoffs/2026-05-04-hetzner-full-inventory-audit.md`
- Original incident context: `antigravity-archive/2026-04-mission/antigravity-phase2a-hetzner-rotation-and-openclaw.md` lines 22–34
