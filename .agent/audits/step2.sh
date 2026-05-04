#!/bin/bash
cd ~/Documents/Smarter-Poker-World-Hub/.agent/audits/2026-05-04-hetzner-inventory
{
  echo "=== DNS lookups ==="
  for host in smarter.poker engine.smarter.poker workers.smarter.poker openclaw.smarter.poker reels.smarter.poker; do
    echo "--- $host ---"
    dig +short "$host" A
    dig +short "$host" CNAME
  done
} > dns-resolution.txt
cat dns-resolution.txt
