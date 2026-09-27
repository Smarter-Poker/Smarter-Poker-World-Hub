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
requires the already installed Linux x86_64/Python3.12/ffmpeg runtime and a
host `/usr/bin/node` of major version 18 or later, and refuses missing tools.
The release never ships a Node runtime; the host runs it with `/usr/bin/node`.

Build image and Node toolchain (owner decision, 23 Sep 2026): the release
build uses official sources only. No third-party or community image is
accepted.

- `VIDEO_YT_BUILD_IMAGE` must be the official Docker Hub
  `python:3.12-slim-bookworm` image pinned by its `linux/amd64` manifest digest,
  in the form `python@sha256:<64 hex>` (`library/python@...` and
  `docker.io/library/python@...` are the same repository). The workflow refuses
  any other repository, any tag and any bare local image ID before pulling, and
  then re-checks the pulled image ID and its `linux/amd64` platform. Inside the
  container it asserts Python 3.12 on x86_64 and Debian `bookworm`. The digest
  resolved read-only from registry-1.docker.io on 23 Sep 2026 for
  `library/python:3.12-slim-bookworm` `linux/amd64` is
  `sha256:1aaa65a85fda306ffb8b910824d4e93bdce61e212c7e87168123ea3073b41a1a`
  (image config `PYTHON_VERSION=3.12.14`). Setting the variable is a separate
  provider step; re-resolve and review the digest when it is set or rotated.
- The Node.js toolchain comes from nodejs.org, not from the image. The
  bounded, read-only, unprivileged build container downloads
  `https://nodejs.org/dist/v20.20.2/node-v20.20.2-linux-x64.tar.xz` and
  `https://nodejs.org/dist/v20.20.2/SHASUMS256.txt`. The tarball is accepted
  only when its SHA-256 equals both the literal pin in the workflow
  (`df770b2a6f130ed8627c9782c988fda9669fa23898329a61a871e32f965e007d`) and the
  single line for that exact filename in `SHASUMS256.txt`. A missing or
  duplicated line, a changed published hash or any corrupted byte fails the
  deploy closed before the archive is opened. The verified archive is extracted
  with Python's standard `tarfile`/`lzma` modules and the `data` extraction
  filter into a dedicated tmpfs (no apt, no `xz` binary), and the build then
  requires `node -v` to be exactly `v20.20.2` and `npm` to come from that
  toolchain.

With that toolchain the container runs `npm ci --omit=dev --ignore-scripts`
against the committed lockfile and installs the hash-locked yt-dlp vendor
module with `pip --require-hashes`; no dependency installation/build occurs on
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
