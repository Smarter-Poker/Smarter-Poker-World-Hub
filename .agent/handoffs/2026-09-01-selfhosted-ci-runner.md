# HANDOFF: Stand up the self-hosted CI runner box and cut the Actions bill to ~$0

**For:** Antigravity (or any agent on Dan's Mac with host shell + browser + gh)
**From:** Cowork cost audit, 2026-09-01. Dan pre-approved the purchase (up to ~30 EUR/mo).
**Full context:** club-arena `docs/changelog/2026-09-01-actions-cost-and-pipeline-audit.md`

## WHY

August was ~150,000 billed GitHub-hosted runner minutes (~$1,200). Club Arena
PR #2496 (merged, verified live) already wired every heavy CI job to read
`vars.CI_RUNNER` and fall back to `ubuntu-latest`. The ONLY missing piece is a
Linux box running two runner processes. A warm runner also turns the 12-minute
vitest job into ~2-3 minutes because node_modules survives between runs.

## HARD RULES - read before touching anything

1. **NEVER install a runner on the engine VPS** (`engine.smarter.poker`,
   hostname pepnationrx, 3 vCPU / 4 GB). It deals live poker hands. Verified
   2026-09-01: CI load there risks player-visible latency.
2. **NEVER install a runner on the Open Claw dispatcher**
   (178.104.160.250, 2 vCPU). Too small: 4 jobs x 85 PRs/day would queue and
   make merges SLOWER. Verified 2026-09-01.
3. **Never paste a secret value into any file or chat.** The Hetzner API token
   goes into the macOS keychain (the "place", per AGENT-PLAYBOOK section 4).
4. Runner label must be exactly `estate-linux` - the workflows already expect it.
5. Rollback is always one command (Step 6). If in doubt, roll back and report.

## STEP 1 - Create the server (the only part that touches money)

Dan approved: **1 server, type `cx32`** (4 vCPU / 8 GB / 80 GB, ~8 EUR/mo) in
**`ash` (Ashburn, US East)**, image **`ubuntu-24.04`**, name **`estate-ci-1`**.
(If sustained CI load saturates it later, resize to ccx23 in the console -
Dan approved up to ~30 EUR/mo.)

### Path A - API token exists or Dan provides one (preferred)

Ask Dan once for a Hetzner Cloud API token (Console -> project -> Security ->
API tokens -> Generate, Read & Write), or use it if he already stored one:

```bash
TOKEN=$(security find-generic-password -a smarter-poker -s hcloud-ci-token -w 2>/dev/null)
```

If Dan hands you a fresh token, store it FIRST, then never echo it:

```bash
security add-generic-password -a smarter-poker -s hcloud-ci-token -w '<paste>' -U
```

Then create the SSH key resource and the server:

```bash
TOKEN=$(security find-generic-password -a smarter-poker -s hcloud-ci-token -w)
PUB=$(cat ~/.ssh/hetzner_ed25519.pub)
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  https://api.hetzner.cloud/v1/ssh_keys \
  -d "{\"name\":\"estate-mac-hetzner_ed25519\",\"public_key\":\"$PUB\"}" || true  # 409 = already exists, fine

curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  https://api.hetzner.cloud/v1/servers \
  -d '{"name":"estate-ci-1","server_type":"cx32","image":"ubuntu-24.04","location":"ash","ssh_keys":["estate-mac-hetzner_ed25519"]}' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["server"]["public_net"]["ipv4"]["ip"])'
```

Save the printed IP and store it:

```bash
security add-generic-password -a smarter-poker -s estate-ci-ip -w "$CI_IP" -U
```

### Path B - no token: use the browser

Drive the browser to https://console.hetzner.cloud (Dan stays logged in or
logs in himself - NEVER type his password). Create the server with exactly the
specs above; in the SSH key step paste the one line from
`cat ~/.ssh/hetzner_ed25519.pub`. Record the IPv4 into the keychain as above.

## STEP 2 - Prepare the box

```bash
CI_IP=$(security find-generic-password -a smarter-poker -s estate-ci-ip -w)
SSH="ssh -i $HOME/.ssh/hetzner_ed25519 -o StrictHostKeyChecking=accept-new root@$CI_IP"
$SSH 'apt-get update -qq && apt-get install -y -qq git curl build-essential >/dev/null;
      id ci 2>/dev/null || adduser --disabled-password --gecos "" ci;
      usermod -aG sudo ci;
      echo "ci ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-ci; chmod 440 /etc/sudoers.d/90-ci;
      mkdir -p /home/ci/.ssh && cp /root/.ssh/authorized_keys /home/ci/.ssh/ && chown -R ci:ci /home/ci/.ssh;
      echo READY'
```

## STEP 3 - Install TWO runners (Club Arena repo)

The setup script is on club-arena main: `scripts/ci/setup-selfhosted-runner.sh`.
Registration tokens expire after ~1 hour - mint each one right before use.

```bash
cd ~/Documents/club-arena && git fetch -q origin main
scp -i ~/.ssh/hetzner_ed25519 scripts/ci/setup-selfhosted-runner.sh ci@$CI_IP:/home/ci/

for N in 1 2; do
  RT=$(gh api -X POST /repos/Smarter-Poker/Smarter-Poker-Club-Arena/actions/runners/registration-token --jq .token)
  ssh -i ~/.ssh/hetzner_ed25519 ci@$CI_IP \
    "REPO=Smarter-Poker/Smarter-Poker-Club-Arena RUNNER_NAME=estate-ci-$N \
     RUNNER_TOKEN=$RT LABELS=estate-linux bash /home/ci/setup-selfhosted-runner.sh"
done

# Both runners must show "online":
gh api /repos/Smarter-Poker/Smarter-Poker-Club-Arena/actions/runners \
  --jq '.runners[] | "\(.name) \(.status) labels=\([.labels[].name]|join(","))"'
```

Do not continue until both say `online` with label `estate-linux`.

## STEP 4 - Flip the switch (instantly reversible)

```bash
gh api -X POST /repos/Smarter-Poker/Smarter-Poker-Club-Arena/actions/variables \
  -f name=CI_RUNNER -f value=estate-linux
```

No workflow file changes needed - ci.yml already reads the variable.

## STEP 5 - VERIFY (do not claim success without ALL FOUR)

1. The next PR's heavy jobs run on the box:
   `gh run list --repo Smarter-Poker/Smarter-Poker-Club-Arena --limit 3 --json databaseId`
   then for a run:
   `gh api repos/Smarter-Poker/Smarter-Poker-Club-Arena/actions/runs/<id>/jobs --jq '.jobs[] | "\(.name): \(.runner_name)"'`
   -> `Client Unit Tests (vitest)`, `TypeScript Check`, `Production Build`,
   `Server Engine (typecheck + tests)` must show `estate-ci-1` or `estate-ci-2`.
2. The jobs PASS there (watch at least one full green PR merge).
3. Second-run speed: the unit job's duration drops (first run primes caches;
   the second should be well under the ~12 hosted minutes).
4. Production still publishes: `curl -s https://smarter.poker/hub/club-arena/build-info.json`
   - `ca_sha` keeps advancing after your change, per CLAUDE.md 1.4.

Then report, in Dan's chat: server IP, both runner names online, one PR's
job->runner mapping, before/after unit-job minutes, and the build-info sha.

## STEP 6 - ROLLBACK (if anything is off)

```bash
gh api -X DELETE /repos/Smarter-Poker/Smarter-Poker-Club-Arena/actions/variables/CI_RUNNER
```

Every job returns to `ubuntu-latest` on its next run. The box can sit idle;
nothing else depends on it. To remove a runner cleanly later:
`sudo ./svc.sh stop && sudo ./svc.sh uninstall` in its directory, then
`./config.sh remove --token <fresh registration token>`.

## OUT OF SCOPE - do not do these

- Do NOT route `CSS Beat E2E` or any World Hub jobs yet (Playwright deps not
  installed; separate follow-up once the box is proven for a few days).
- Do NOT change any ruleset, workflow file, or required check.
- Do NOT enable fork PRs on any repo while self-hosted runners exist.
