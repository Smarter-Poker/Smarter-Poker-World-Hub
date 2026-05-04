#!/bin/bash
mkdir -p ~/Documents/Smarter-Poker-World-Hub/.agent/audits/2026-05-04-hetzner-inventory
cd ~/Documents/Smarter-Poker-World-Hub/.agent/audits/2026-05-04-hetzner-inventory

TOKEN=$(security find-generic-password -a smarter-poker -s hetzner-api -w)

curl -s -H "Authorization: Bearer $TOKEN" https://api.hetzner.cloud/v1/servers > servers.json

jq -r '.servers[] | [.id, .name, .server_type.name, .datacenter.location.name, .public_net.ipv4.ip, .created, ((.labels // {}) | tostring)] | @tsv' servers.json \
  | column -t -s $'\t' > inventory-table.txt

jq -r '.servers[] | "\(.id)\t\(.name)\t\(.public_net.ipv4.ip)\t\(.server_type.name)\t\(.datacenter.location.name)"' servers.json > inventory-ssh-targets.tsv

cat inventory-table.txt

for resource in ssh_keys networks volumes snapshots firewalls primary_ips load_balancers; do
  curl -s -H "Authorization: Bearer $TOKEN" "https://api.hetzner.cloud/v1/$resource" > "$resource.json"
done
