# Rights-Gated YouTube Transcode Worker

This worker is retired for third-party YouTube media. Smarter.Poker plays that
content through the official YouTube embed. Native processing is allowed only
for a non-library Reel with an explicit `owned` or `licensed` rights record,
matching immutable source identity, and the database
`youtube_native_transcode` control enabled.

## Credential boundary

`/etc/sp-yt-transcode.env` is provisioned and rotated outside repository and
agent workflows. Deploy code must never create, copy, extract, print, or
rewrite its values. The required host-managed keys are:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_URL` is deliberately rejected so it cannot silently override the
validated `NEXT_PUBLIC_SUPABASE_URL`. Each required key must appear exactly
once, `MAX_CONCURRENT_YT` is bounded to 1–6, and unknown environment keys are
rejected so host state cannot inject runtime options into an immutable release.

`WORKER_ID` and `MAX_CONCURRENT_YT` are optional; the worker uses safe defaults
when they are absent. Operators can verify the boundary without exposing any
value:

```bash
sudo test -f /etc/sp-yt-transcode.env
test "$(sudo stat -c '%U:%G %a' /etc/sp-yt-transcode.env)" = 'root:root 600'
sudo grep -Eq '^NEXT_PUBLIC_SUPABASE_URL=https://[A-Za-z0-9-]+\.supabase\.co/?$' /etc/sp-yt-transcode.env
sudo grep -Eq '^SUPABASE_SERVICE_ROLE_KEY=eyJ[^[:space:]]+\.[^[:space:]]+\.[^[:space:]]+$' /etc/sp-yt-transcode.env
```

If any check fails, stop. Credential provisioning is an operator-owned action
outside this runbook.

GitHub Actions also requires `HETZNER_HOST` and
`HETZNER_SSH_PRIVATE_KEY`. `HETZNER_HOST` must resolve to the dedicated
`reels-transcode-worker` (Hetzner server 128782737). Both deployment and
diagnostics compare the scanned ed25519 key with that host's independently
verified, repository-pinned fingerprint before opening an SSH session; a host
or key mismatch fails closed.

## Deployment

The existing main-only workflow remains API-disabled during this recovery.
It runs on a GitHub-hosted `ubuntu-latest` runner in the `Production`
environment: owner policy 2.9 keeps the restored routes GitHub-hosted, and no
self-hosted or local publisher is used. Enabling the workflow and setting the
`VIDEO_YT_BUILD_IMAGE` repository variable are separate provider steps; until
both exist the workflow fails closed before any transfer. This does not affect
the already verified Vercel web release.

The workflow validates the host-managed environment without rewriting it,
requires the already installed Linux x86_64/Python3.12/Node20/ffmpeg runtime,
and refuses missing tools. `VIDEO_YT_BUILD_IMAGE` must name an already qualified
Docker image by immutable registry digest (`name@sha256:...`), which the runner
pulls before use, containing Linux x86_64 Python3.12 and
Node20. The bounded runner container assembles the locked Node dependency tree
and hashed yt-dlp vendor module; no dependency installation/build occurs on
Hetzner. Only its fixed nonsecret payload and manifest are transferred.

The original root-owned per-SHA release, bounded schema/RPC preflight, atomic
symlink/unit promotion, manifest, invocation/restart checks and rollback remain.
An already active worker is restarted and verified; an inactive worker remains
inactive. Enabled/disabled state is checked independently and never changed.
Readback of a paused release is not a runtime-ready claim.

Legacy cookie workflows, services, packages, caches and historical backups are
preserved. This release neither activates nor retires them. Its payload excludes
cookies and helpers; the selected worker exclusively uses the release-vendored,
hash-verified yt-dlp module and ignores host configuration/plugins.

Every service start re-verifies the release manifest before the schema/RPC
preflight, so an on-host file change fails closed instead of silently becoming
the running worker.

The database migration containing the worker contract must be applied before
the workflow is allowed to succeed. A migration/worker race fails the candidate
preflight without promoting it; rerun the workflow after the migration lands.

The service intentionally remains idle while the native-processing control is
disabled. Active subprocess groups and Storage uploads are interrupted, and the
exact claim is cancelled or left for safe reconciliation before any Reel state
can be changed. Do not insert jobs manually: the database job guard, Reel
trigger, worker authorization check, renewable claim, and atomic completion RPC
are one security contract.

Authentication-restricted videos fail closed. Never place `cookies.txt` in a
release. Any separate credential rotation or legacy retirement remains an
operator-owned task, outside this publication. The worker's job-private child
environment contains no Supabase credentials.

## Read-only service verification

```bash
sudo systemctl is-enabled sp-yt-transcode
sudo systemctl is-active sp-yt-transcode
sudo systemctl show sp-yt-transcode -p InvocationID -p NRestarts
readlink /opt/smarter-poker/yt-transcode-worker
sudo journalctl -u sp-yt-transcode -n 50 --no-pager
sudo sh -c 'cd /opt/smarter-poker/yt-transcode-worker && sha256sum -c release-manifest.sha256'
```

A healthy disabled-control state does not create, claim, upload, or publish new
work. Enabling the control is a separate audited rights-operations decision,
never a deploy side effect.
