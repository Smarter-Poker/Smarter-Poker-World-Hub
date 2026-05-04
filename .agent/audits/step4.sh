#!/bin/bash
cd ~/Documents/Smarter-Poker-World-Hub/.agent/audits/2026-05-04-hetzner-inventory

echo '# Hetzner Inventory Audit — 2026-05-04' > REPORT.md
echo '' >> REPORT.md
echo '## 1. Live inventory (from Hetzner API)' >> REPORT.md
echo '' >> REPORT.md
echo '```' >> REPORT.md
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
  jq '.[]' "$r.json" 2>/dev/null | head -50 >> REPORT.md
  echo '```' >> REPORT.md
done

cd ~/Documents/Smarter-Poker-World-Hub
bash scripts/git-safe-push.sh "audit(hetzner): full inventory + per-box service capture (read-only)"
