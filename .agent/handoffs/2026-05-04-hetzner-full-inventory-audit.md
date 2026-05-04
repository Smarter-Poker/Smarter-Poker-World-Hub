# Handoff: Full Hetzner inventory + per-box service audit (READ-ONLY)

**Date:** 2026-05-04
**Origin agent:** Cowork session (Dan's local-agent-mode)
**Reason for handoff:** Cowork sandbox cannot reach macOS Keychain (no Hetzner API token), cannot SSH (no `~/.ssh/` access), and cannot resolve DNS reliably. Antigravity on Dan's Mac has all three.

**Mission:** Produce an authoritative, evidence-based inventory of every Hetzner Cloud server in the `Smarter Poker` project — what type, where, what's running on it, how it's reachable — so the Cowork orchestrator can decide which boxes to keep, right-size, or kill. **READ-ONLY. Do not stop, restart, modify, or delete anything.**

**Why this is urgent (but not blocking production):** April invoice was $67.64. $56.22 of that is 4 × CAX41 (16 vCPU/32GB ARM each) servers labelled "unknown purpose, do not touch without asking Dan" in `antigravity-archive/2026-04-mission/antigravity-phase2a-hetzner-rotation-and-openclaw.md`. They predate every documented architecture decision and are not referenced in any plan, deploy script, service file, or handoff. Likely orphans from earlier experiments. We need to confirm before deleting.

---

## Documented architecture (what we expect to find)

From `Smarter-Poker-World-Hub/CLAUDE.md` §1.1, `scripts/openclaw-cron-dispatcher.py`, `scripts/yt-transcode-worker/DEPLOY.md`, `.github/workflows/deploy-yt-worker.yml`, `smarter-poker-workers/docker-compose.yml`, `club-arena/server/deploy-hetzner.sh`:

| # | Role | Type per docs | DC | Public IP | Service identifier(s) |
|---|---|---|---|---|---|
| 1 | **Engine** | CPX11 | ash-dc1 | `178.156.160.206` | Docker container `club-arena-engine` (port 8080), Caddy → `engine.smarter.poker` |
| 2 | **Open Claw dispatcher** | CPX11 | nbg1 | `178.104.160.250` | systemd `openclaw.service` running `/opt/openclaw/dispatcher.py` |
| 3 | **Workers VM** (`workers-dispatcher`) | CX23 | fsn1 | private `10.0.0.3` | Docker container `smarter-poker-workers` (Hono on `127.0.0.1:8081`) |
| 4 | **Ashburn transcode** | CX22/CX23 | ash-dc1 | unknown | systemd `sp-transcode.service` (HEVC) **+** `sp-yt-transcode.service` (YouTube/MP4) |

**Open question to resolve:** Are #2 and #4 the same physical box or different? `transcode-worker/index.js` line 10 says HEVC runs *"same VM as Open Claw cron"* (would be Nuremberg). `deploy-yt-worker.yml` line 9 says *"Ashburn CX22"*. The truth is on the boxes.

**4 known orphan candidates:** Hetzner server IDs `126910918`, `126910920`, `126910922`, `126910923` (all CAX41) — verify if still alive and figure out what (if anything) they're running.

---

## Binding rules

1. **READ-ONLY.** No `systemctl restart`, no `docker stop`, no `hcloud server delete`, no file edits on remote boxes. Only `cat`, `journalctl --no-pager`, `systemctl status`, `docker ps`, `ss`, `ps`, `dig`, `host`, `curl --head`. If a command would change state, skip it and note it in the report.
2. **Do not touch the engine box** (`178.156.160.206`). Even read commands that take more than a second or two are forbidden — the engine serves live poker games. `curl https://engine.smarter.poker/health` is fine; SSH is fine; lengthy `journalctl --since=...` queries against busy services are not.
3. **No new servers, snapshots, networks, firewalls, or SSH keys.** This task only inspects.
4. **Use existing SSH keys.** Try `~/.ssh/openclaw_ed25519`, `~/.ssh/workers_ed25519`, `~/.ssh/deploy-key`, `~/.ssh/id_ed25519` in that order — whichever opens the connection. If none work for a given box, note it and move on; do not generate or upload new keys.
5. **Capture, don't summarize.** Save raw command output to the report. The receiving Cowork agent does the analysis.

---

## Prerequisites (verify before starting)

```bash
# 1. Hetzner API token in Keychain
security find-generic-password -a smarter-poker -s hetzner-api -w >/dev/null && echo "✅ hetzner-api token" || { echo "❌ hetzner-api token missing"; exit 1; }

# 2. SSH keys
for k in openclaw_ed25519 workers_ed25519 deploy-key id_ed25519; do
  [ -f ~/.ssh/$k ] && echo "✅ ~/.ssh/$k" || echo "(missing) ~/.ssh/$k"
done

# 3. Tools
for t in jq dig curl ssh; do
  command -v $t >/dev/null && echo "✅ $t" || echo "❌ $t missing"
done
```

If `jq` is missing: `brew install jq`. If a key is missing, that's fine — we'll just note "no SSH access" for boxes that key would have opened.

---

## Steps

### Step 1 — Pull the live Hetzner inventory

```bash
mkdir -p ~/Documents/Smarter-Poker-World-Hub/.agent/audits/2026-05-04-hetzner-inventory
cd ~/Documents/Smarter-Poker-World-Hub/.agent/audits/2026-05-04-hetzner-inventory

TOKEN=$(security find-generic-password -a smarter-poker -s hetzner-api -w)

# Full server list, raw JSON for the audit trail
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.hetzner.cloud/v1/servers > servers.json

# Human-readable table
jq -r '.servers[] | [.id, .name, .server_type.name, .datacenter.location.name, .public_net.ipv4.ip, .created, ((.labels // {}) | tostring)] | @tsv' servers.json \
  | column -t -s $'\t' > inventory-table.txt

# IP-only list for the SSH loop
jq -r '.servers[] | "\(.id)\t\(.name)\t\(.public_net.ipv4.ip)\t\(.server_type.name)\t\(.datacenter.location.name)"' servers.json > inventory-ssh-targets.tsv

cat inventory-table.txt
```

Also pull SSH keys, networks, volumes, snapshots, firewalls, primary IPs — these may reveal context:

```bash
for resource in ssh_keys networks volumes snapshots firewalls primary_ips load_balancers; do
  curl -s -H "Authorization: Bearer $TOKEN" \
    "https://api.hetzner.cloud/v1/$resource" > "$resource.json"
done
```

### Step 2 — DNS resolution for every smarter.poker subdomain referenced in code

```bash
{
  echo "=== DNS lookups ==="
  for host in smarter.poker engine.smarter.poker workers.smarter.poker openclaw.smarter.poker reels.smarter.poker; do
    echo "--- $host ---"
    dig +short "$host" A
    dig +short "$host" CNAME
  done
} > dns-resolution.txt

cat dns-resolution.txt
```

### Step 3 — SSH-inspect every server returned by Step 1

For each row in `inventory-ssh-targets.tsv`, run the inspection script below. **Skip the engine box (`178.156.160.206`) — only do the lightweight checks for it (marked `# engine-safe`).**

```bash
for k in openclaw_ed25519 workers_ed25519 deploy-key id_ed25519; do
  [ -f ~/.ssh/$k ] || continue
  echo "Will try ~/.ssh/$k"
done

# Helper that tries each SSH key until one connects.
ssh_try() {
  local ip="$1"; shift
  for keyfile in ~/.ssh/openclaw_ed25519 ~/.ssh/workers_ed25519 ~/.ssh/deploy-key ~/.ssh/id_ed25519; do
    [ -f "$keyfile" ] || continue
    for user in root openclaw workers; do
      if ssh -i "$keyfile" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -o BatchMode=yes \
           "$user@$ip" "true" 2>/dev/null; then
        ssh -i "$keyfile" -o StrictHostKeyChecking=accept-new -o BatchMode=yes "$user@$ip" "$@"
        return $?
      fi
    done
  done
  echo "(no SSH access via any known key/user)"
  return 99
}

while IFS=$'\t' read -r ID NAME IP TYPE LOC; do
  REPORT="server-$ID-$NAME.txt"
  echo "═══ Inspecting $NAME ($ID) — $TYPE in $LOC at $IP ═══" | tee "$REPORT"

  # Engine box gets the lightweight pass only — never block its event loop.
  if [ "$IP" = "178.156.160.206" ]; then
    {
      echo "--- engine-safe checks only ---"
      curl -sf --max-time 5 https://engine.smarter.poker/health || echo "(health failed)"
      echo
      echo "--- ssh: hostname + uptime + docker ps + listening ports ---"
      ssh_try "$IP" '
        hostname; uptime; echo "---";
        docker ps --format "{{.Names}}\t{{.Status}}\t{{.Ports}}";
        echo "---";
        ss -tlnp 2>/dev/null | head -30 || netstat -tlnp 2>/dev/null | head -30;
      '
    } >> "$REPORT" 2>&1
    continue
  fi

  # Full pass for every other box.
  ssh_try "$IP" '
    set +e
    echo "=== hostname / uname / uptime ==="
    hostname; uname -a; uptime
    echo
    echo "=== /etc/os-release ==="
    cat /etc/os-release 2>/dev/null
    echo
    echo "=== last 5 logins ==="
    last -n 5 2>/dev/null
    echo
    echo "=== systemd units (running, any unit that looks application-y) ==="
    systemctl list-units --state=running --no-pager --no-legend 2>/dev/null | head -60
    echo
    echo "=== systemd units enabled (any sp-*, openclaw*, workers*, transcode*, club-*) ==="
    systemctl list-unit-files --no-pager --no-legend 2>/dev/null \
      | grep -Ei "(sp-|openclaw|workers|transcode|club-|sentry|caddy|nginx)" | head -40
    echo
    echo "=== docker ps -a ==="
    docker ps -a --format "{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}" 2>/dev/null
    echo
    echo "=== docker images ==="
    docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" 2>/dev/null | head -20
    echo
    echo "=== listening TCP ports ==="
    ss -tlnp 2>/dev/null | head -30 || netstat -tlnp 2>/dev/null | head -30
    echo
    echo "=== root crontab ==="
    crontab -l 2>/dev/null
    echo
    echo "=== /etc/cron.d ==="
    ls -la /etc/cron.d 2>/dev/null; cat /etc/cron.d/* 2>/dev/null
    echo
    echo "=== users with home dirs ==="
    awk -F: "\$3 >= 1000 && \$1 != \"nobody\" {print \$1\"\t\"\$6}" /etc/passwd
    echo
    echo "=== /opt and /srv top-level ==="
    ls -la /opt 2>/dev/null; echo; ls -la /srv 2>/dev/null
    echo
    echo "=== disk usage ==="
    df -h | head -10
    echo
    echo "=== top 5 RAM consumers ==="
    ps aux --sort=-%mem 2>/dev/null | head -6
    echo
    echo "=== top 5 CPU consumers ==="
    ps aux --sort=-%cpu 2>/dev/null | head -6
    echo
    echo "=== journalctl: last 5 lines per app service we care about ==="
    for svc in openclaw sp-transcode sp-yt-transcode caddy docker; do
      echo "--- $svc ---"
      journalctl -u "$svc" -n 5 --no-pager 2>/dev/null || echo "(no such unit)"
    done
  ' >> "$REPORT" 2>&1

  echo "  → wrote $REPORT"
done < inventory-ssh-targets.tsv
```

### Step 4 — Assemble the final report

```bash
cd ~/Documents/Smarter-Poker-World-Hub/.agent/audits/2026-05-04-hetzner-inventory

cat > REPORT.md <<'EOF'
# Hetzner Inventory Audit — 2026-05-04

## 1. Live inventory (from Hetzner API)

```
EOF
cat inventory-table.txt >> REPORT.md
echo '```' >> REPORT.md
echo '' >> REPORT.md

echo '## 2. DNS resolution' >> REPORT.md
echo '```' >> REPORT.md
cat dns-resolution.txt >> REPORT.md
echo '```' >> REPORT.md
echo '' >> REPORT.md

echo '## 3. Per-server inspection' >> REPORT.md
for f in server-*.txt; do
  echo "### $f" >> REPORT.md
  echo '```' >> REPORT.md
  cat "$f" >> REPORT.md
  echo '```' >> REPORT.md
  echo '' >> REPORT.md
done

echo '## 4. Aux resources' >> REPORT.md
for r in ssh_keys networks volumes snapshots firewalls primary_ips load_balancers; do
  echo "### $r" >> REPORT.md
  echo '```json' >> REPORT.md
  jq '.[] | to_entries' "$r.json" 2>/dev/null | head -50 >> REPORT.md
  echo '```' >> REPORT.md
done

echo "Report written to: $(pwd)/REPORT.md"
wc -l REPORT.md
```

### Step 5 — Commit + paste back to chat

```bash
cd ~/Documents/Smarter-Poker-World-Hub
bash scripts/git-safe-push.sh "audit(hetzner): full inventory + per-box service capture (read-only)"
```

Then paste **the contents of `REPORT.md`** into the Cowork chat. Big report — just paste it, the orchestrator needs the raw output.

---

## Exit criteria

The handoff is complete when ALL of the following are true:

- [ ] `servers.json` exists and parses (length ≥ 1)
- [ ] `inventory-table.txt` is non-empty and shown in the report
- [ ] `dns-resolution.txt` shows actual A records for `smarter.poker` and `engine.smarter.poker`
- [ ] One `server-<id>-<name>.txt` exists per row in `inventory-table.txt` (some may say "no SSH access" — that's OK as long as the file exists with that note)
- [ ] `REPORT.md` exists and was committed via `git-safe-push.sh`
- [ ] `REPORT.md` was pasted back into the Cowork chat

## Failure modes

| Symptom | What to do |
|---|---|
| `hetzner-api` not in Keychain | Token may have been rotated and not re-stashed. Check `console.hetzner.cloud` → Security → API Tokens. Generate a Read-only token for this audit, store as `security add-generic-password -U -a smarter-poker -s hetzner-api -w '<TOKEN>'`. |
| Hetzner API returns 401 | Same as above — token invalid. Don't proceed without a working token. |
| SSH fails for every key on a given box | Note it in the report (`# no SSH access`) and continue. The orchestrator will surface to Dan that box-X needs key access established before any decision can be made about it. |
| `ss`/`netstat` not installed on a box | Try the other one. If both missing: `iproute2` is installed by default on Ubuntu 22.04, so this would be unusual — note it. |
| One of the CAX41s is up but not reachable via SSH | Most likely indicator of an orphan. Note IP + Hetzner ID in the report; do not attempt to break in or reset root password. |
| `engine.smarter.poker/health` returns non-200 | STOP the audit and surface to Dan immediately — the engine box may have a problem unrelated to this audit. |
| Out of disk on Mac during report assembly | Don't `rm` anything; surface to Dan. |
| `git-safe-push.sh` fails the secret scan | The audit text shouldn't contain secrets. If it does (env vars in journalctl output etc.), redact in `REPORT.md` before re-running. |

## Do NOT touch

- The engine box (`178.156.160.206`) beyond the engine-safe checks above
- Any server's services (no restart, no stop)
- Any server's filesystem (no edits, no deletes, no chowns)
- The Hetzner API token in Keychain (don't rotate, don't delete)
- The 4 CAX41 servers (`126910918`, `126910920`, `126910922`, `126910923`) — inspect only
- `vercel.json` and any `pages/api/cron/*` files in this repo
- Anything in `club-arena/`, `smarter-poker-workers/`, `diamond-arena/`, `identity-dna-engine/`

## Out of scope

- Recommending what to delete (the orchestrator does that after seeing your report)
- Right-sizing CAX41 → smaller types (deferred until orphans are confirmed)
- Re-keying any boxes (separate task if a box has no working key)
- Migrating the HEVC/YT transcode workers between boxes (only documentation right now)
- Adding monitoring/alerts (out of scope; existing Twilio alert runs from Open Claw)

## References

- This handoff is the input for the Cowork orchestrator audit started 2026-05-04 in chat with Dan.
- Architecture sources cross-referenced:
  - `Smarter-Poker-World-Hub/CLAUDE.md` §1.1, §11
  - `scripts/openclaw-cron-dispatcher.py` (lines 60–296)
  - `scripts/yt-transcode-worker/DEPLOY.md`
  - `scripts/yt-transcode-worker/sp-yt-transcode.service`
  - `.github/workflows/deploy-yt-worker.yml` (line 9)
  - `scripts/transcode-worker/index.js` (line 10 — possibly stale comment)
  - `smarter-poker-workers/README.md`, `smarter-poker-workers/docker-compose.yml`
  - `club-arena/server/deploy-hetzner.sh`, `club-arena/.github/workflows/deploy-hetzner.yml`, `club-arena/server/Caddyfile`
  - `antigravity-archive/2026-04-mission/antigravity-phase2a-hetzner-rotation-and-openclaw.md` (lines 22–34)
  - `smarter-poker-optimization-plan.md` §"Decisions confirmed", lines 461–478
