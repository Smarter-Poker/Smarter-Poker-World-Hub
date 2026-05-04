#!/bin/bash
cd ~/Documents/Smarter-Poker-World-Hub/.agent/audits/2026-05-04-hetzner-inventory

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

while IFS=$'\t' read -u 9 -r ID NAME IP TYPE LOC; do
  REPORT="server-$ID-$NAME.txt"
  echo "=== Inspecting $NAME ($ID) - $TYPE in $LOC at $IP ===" | tee "$REPORT"

  if [ "$IP" = "178.156.160.206" ]; then
    {
      echo "--- engine-safe checks only ---"
      curl -sf --max-time 5 https://engine.smarter.poker/health || echo "(health failed)"
      echo
      ssh_try "$IP" 'hostname; uptime; echo "---"; docker ps --format "{{.Names}}\t{{.Status}}\t{{.Ports}}"; echo "---"; ss -tlnp 2>/dev/null | head -30 || netstat -tlnp 2>/dev/null | head -30;'
    } >> "$REPORT" 2>&1
    continue
  fi

  ssh_try "$IP" '
    set +e
    echo "=== hostname / uname / uptime ==="; hostname; uname -a; uptime; echo
    echo "=== /etc/os-release ==="; cat /etc/os-release 2>/dev/null; echo
    echo "=== last 5 logins ==="; last -n 5 2>/dev/null; echo
    echo "=== systemd units running ==="; systemctl list-units --state=running --no-pager --no-legend 2>/dev/null | head -60; echo
    echo "=== systemd unit files matching app patterns ==="
    systemctl list-unit-files --no-pager --no-legend 2>/dev/null | grep -Ei "(sp-|openclaw|workers|transcode|club-|sentry|caddy|nginx)" | head -40
    echo
    echo "=== docker ps -a ==="; docker ps -a --format "{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}" 2>/dev/null; echo
    echo "=== docker images ==="; docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" 2>/dev/null | head -20; echo
    echo "=== listening TCP ports ==="; ss -tlnp 2>/dev/null | head -30 || netstat -tlnp 2>/dev/null | head -30; echo
    echo "=== root crontab ==="; crontab -l 2>/dev/null; echo
    echo "=== /etc/cron.d ==="; ls -la /etc/cron.d 2>/dev/null; cat /etc/cron.d/* 2>/dev/null; echo
    echo "=== users with home dirs ==="; awk -F: "\$3 >= 1000 && \$1 != \"nobody\" {print \$1\"\t\"\$6}" /etc/passwd; echo
    echo "=== /opt and /srv ==="; ls -la /opt 2>/dev/null; echo; ls -la /srv 2>/dev/null; echo
    echo "=== disk usage ==="; df -h | head -10; echo
    echo "=== top 5 RAM ==="; ps aux --sort=-%mem 2>/dev/null | head -6; echo
    echo "=== top 5 CPU ==="; ps aux --sort=-%cpu 2>/dev/null | head -6; echo
    echo "=== journalctl tails ==="
    for svc in openclaw sp-transcode sp-yt-transcode caddy docker; do
      echo "--- $svc ---"
      journalctl -u "$svc" -n 5 --no-pager 2>/dev/null || echo "(no such unit)"
    done
  ' >> "$REPORT" 2>&1

  echo "  -> wrote $REPORT"
done 9< inventory-ssh-targets.tsv
