#!/usr/bin/env bash
# Provision a clean reels-transcode-worker host for sp-yt-transcode.
#
# Run once, as root, on a freshly created Hetzner Ubuntu 24.04 server, before
# the first "Deploy Rights-Gated YT Transcode Worker" run:
#
#   scp scripts/yt-transcode-worker/provision-host.sh \
#       scripts/yt-transcode-worker/sp-yt-transcode.service root@HOST:
#   ssh root@HOST 'bash provision-host.sh sp-yt-transcode.service'
#
# It installs exactly the runtime the deploy workflow verifies (x86_64,
# /usr/bin/python3 3.12, /usr/bin/ffmpeg, /usr/bin/node >= 18, user openclaw,
# root-owned release directories) plus the systemd unit, enabled but not
# started. It never creates, reads or prints credentials:
# /etc/sp-yt-transcode.env is provisioned separately (see DEPLOY.md).
#
# Ubuntu 24.04 is required, not merely tested: the workflow asserts the host
# python3 is 3.12, which is what the release's vendored yt-dlp is built for.
set -euo pipefail

unit_source="${1:?usage: provision-host.sh <path to sp-yt-transcode.service>}"

NODE_VERSION=v22.23.3
NODE_TARBALL="node-${NODE_VERSION}-linux-x64.tar.xz"
# From https://nodejs.org/dist/v22.23.3/SHASUMS256.txt, resolved 6 Oct 2026.
NODE_SHA256=df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de

test "$(id -u)" = 0
test "$(uname -m)" = x86_64
. /etc/os-release
test "$ID" = ubuntu
test "$VERSION_ID" = 24.04
test -f "$unit_source"

# Key-only SSH. The 2026-08 compromise entered through root password logins.
install -d -m 0755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHD
chmod 0644 /etc/ssh/sshd_config.d/99-hardening.conf
sshd -t
systemctl reload ssh

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold full-upgrade
apt-get install -y -q --no-install-recommends \
  ca-certificates curl xz-utils python3 ffmpeg fail2ban unattended-upgrades
systemctl enable --now fail2ban unattended-upgrades

/usr/bin/python3 -c 'import sys; assert sys.version_info[:2] == (3, 12)'
test -x /usr/bin/ffmpeg

# Node.js from nodejs.org only, accepted when its sha256 equals both the pin
# above and the tarball's single line in the published SHASUMS256.txt.
node_root="/opt/nodejs/node-${NODE_VERSION}-linux-x64"
if [ ! -x "$node_root/bin/node" ]; then
  work="$(mktemp -d)"
  trap 'rm -rf -- "$work"' EXIT
  curl -fsS --proto '=https' -o "$work/SHASUMS256.txt" \
    "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"
  curl -fsS --proto '=https' -o "$work/$NODE_TARBALL" \
    "https://nodejs.org/dist/${NODE_VERSION}/${NODE_TARBALL}"
  test "$(grep -Ec "^[0-9a-f]{64}  ${NODE_TARBALL}\$" "$work/SHASUMS256.txt")" -eq 1
  test "$(grep -E "  ${NODE_TARBALL}\$" "$work/SHASUMS256.txt" | awk '{print $1}')" = "$NODE_SHA256"
  echo "$NODE_SHA256  $work/$NODE_TARBALL" | sha256sum -c -
  install -d -o root -g root -m 0755 /opt/nodejs
  tar --no-same-owner -xJf "$work/$NODE_TARBALL" -C /opt/nodejs
  rm -rf -- "$work"
  trap - EXIT
fi
chown -R root:root "$node_root"
chmod -R go-w "$node_root"
ln -sfn "$node_root/bin/node" /usr/bin/node
test "$(/usr/bin/node -v)" = "$NODE_VERSION"

# Unprivileged service account; no password, no login shell.
if ! id -u openclaw >/dev/null 2>&1; then
  useradd --create-home --shell /usr/sbin/nologin openclaw
fi

install -d -o root -g root -m 0755 \
  /opt/smarter-poker \
  /opt/smarter-poker/yt-transcode-releases \
  /opt/smarter-poker/yt-transcode-releases/.staging

# Unit enabled so the worker survives reboots once a release is promoted; not
# started, because no release exists until the first deploy.
install -o root -g root -m 0644 "$unit_source" /etc/systemd/system/sp-yt-transcode.service
systemd-analyze verify /etc/systemd/system/sp-yt-transcode.service
systemctl daemon-reload
systemctl enable sp-yt-transcode
test "$(systemctl show sp-yt-transcode -p ActiveState --value)" = inactive

echo "provisioned: $(lsb_release -ds 2>/dev/null || echo "$PRETTY_NAME"), node $(/usr/bin/node -v), $(/usr/bin/python3 -V), $(/usr/bin/ffmpeg -version | head -1 | cut -d' ' -f1-3)"
if [ -f /var/run/reboot-required ]; then
  echo "reboot required: reboot, then 'systemctl stop sp-yt-transcode' (no release yet, so the enabled unit retries at boot)"
fi
echo "next: write /etc/sp-yt-transcode.env (root:root 600), then run the deploy workflow"
