# ═════════════════════════════════════════════════════════════════════════
# Vercel Autofix — operator Makefile
#
# Deploy + inspect the poller running on Hetzner cron-01.
#
# Usage examples:
#   make test                    # run unit tests locally
#   make deploy                  # rsync + restart timer on cron-01
#   make logs                    # tail journalctl for the service
#   make logs-last N=200         # last 200 lines
#   make status                  # systemctl + timer info
#   make pause REASON="paid investigating"
#   make unpause
#   make last N=10               # last 10 autofix_attempts (CLI)
#
# Variables (override on CLI or export):
#   HOST       SSH target. Default: cron-01 (resolves via ~/.ssh/config)
#   REMOTE     Remote install path. Default: /opt/vercel-autofix-poller
#   SB_URL     SUPABASE_URL for the autofix-cli
#   SB_KEY     SUPABASE_SERVICE_ROLE_KEY for the autofix-cli
# ═════════════════════════════════════════════════════════════════════════

HOST   ?= cron-01
REMOTE ?= /opt/vercel-autofix-poller
N      ?= 50

# Source tree → what gets rsync'd. Explicitly enumerated so a stray file
# in the working tree can't sneak onto the server.
SYNC_PATHS := poll.mjs phase-b-verify.mjs open-pr.mjs package.json strategies

# Use bash for richer error handling (set -o pipefail).
SHELL := /usr/bin/env bash

.PHONY: help test deploy deploy-units apply-migration logs logs-follow logs-verify status \
        pause unpause last attempts cli-env-check

help:
	@awk 'BEGIN{FS=":.*?## "}/^[a-zA-Z_-]+:.*?## /{printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ── Local ──────────────────────────────────────────────────────────────────
test: ## Run the poll.test.mjs + phase-b-verify.test.mjs unit suites
	node --test poll.test.mjs phase-b-verify.test.mjs

# ── Deploy to cron-01 ──────────────────────────────────────────────────────
deploy: test ## rsync scripts to cron-01 and restart both timers (poll + verify)
	@set -euo pipefail; \
	echo "→ rsync to $(HOST):$(REMOTE)"; \
	rsync -av --delete-excluded \
	  --exclude '.env' --exclude 'node_modules' --exclude 'state' \
	  --exclude 'systemd' --exclude 'supabase' --exclude 'autofix-cli.mjs' \
	  --exclude 'Makefile' --exclude 'README.md' \
	  --exclude 'poll.test.mjs' --exclude 'phase-b-verify.test.mjs' \
	  $(SYNC_PATHS) $(HOST):$(REMOTE)/; \
	echo "→ npm ci --production"; \
	ssh $(HOST) "cd $(REMOTE) && sudo -u autofix npm ci --omit=dev --no-audit --no-fund"; \
	echo "→ restart poll + verify timers"; \
	ssh $(HOST) "sudo systemctl restart vercel-autofix-poll.timer vercel-autofix-verify.timer && \
	             systemctl status vercel-autofix-poll.timer --no-pager && \
	             systemctl status vercel-autofix-verify.timer --no-pager"

deploy-units: ## Install / refresh the systemd unit files (requires sudo on remote)
	@set -euo pipefail; \
	echo "→ copy systemd units to $(HOST)"; \
	scp systemd/vercel-autofix-poll.service   systemd/vercel-autofix-poll.timer \
	    systemd/vercel-autofix-verify.service systemd/vercel-autofix-verify.timer \
	  $(HOST):/tmp/; \
	ssh $(HOST) "sudo install -m 644 /tmp/vercel-autofix-poll.service    /etc/systemd/system/ && \
	             sudo install -m 644 /tmp/vercel-autofix-poll.timer      /etc/systemd/system/ && \
	             sudo install -m 644 /tmp/vercel-autofix-verify.service  /etc/systemd/system/ && \
	             sudo install -m 644 /tmp/vercel-autofix-verify.timer    /etc/systemd/system/ && \
	             sudo systemctl daemon-reload && \
	             sudo systemctl enable --now vercel-autofix-poll.timer && \
	             sudo systemctl enable --now vercel-autofix-verify.timer && \
	             rm -f /tmp/vercel-autofix-poll.service /tmp/vercel-autofix-poll.timer \
	                   /tmp/vercel-autofix-verify.service /tmp/vercel-autofix-verify.timer"

apply-migration: ## Apply the SQL migration to the project Supabase
	@test -n "$${SUPABASE_DB_URL:-}" || (echo "SUPABASE_DB_URL must be set (postgres://...)" >&2; exit 2)
	psql "$${SUPABASE_DB_URL}" -f supabase/20260420_vercel_autofix_columns.sql

# ── Observe ────────────────────────────────────────────────────────────────
logs: ## Print the last N journalctl lines for BOTH services (N=50 default)
	ssh $(HOST) "journalctl -u vercel-autofix-poll.service -u vercel-autofix-verify.service -n $(N) --no-pager"

logs-follow: ## Stream poll + verify logs live (interleaved)
	ssh $(HOST) "journalctl -u vercel-autofix-poll.service -u vercel-autofix-verify.service -f"

logs-verify: ## Just the verify service journal (N=50 default)
	ssh $(HOST) "journalctl -u vercel-autofix-verify.service -n $(N) --no-pager"

status: ## systemctl status for all services + timers (poll + verify)
	ssh $(HOST) "systemctl status vercel-autofix-poll.timer    --no-pager; echo; \
	             systemctl status vercel-autofix-poll.service  --no-pager || true; echo; \
	             systemctl status vercel-autofix-verify.timer  --no-pager; echo; \
	             systemctl status vercel-autofix-verify.service --no-pager || true"

# ── Control plane (routes through autofix-cli.mjs → Supabase) ─────────────
cli-env-check:
	@test -n "$${SB_URL:-$$SUPABASE_URL}" -a -n "$${SB_KEY:-$$SUPABASE_SERVICE_ROLE_KEY}" \
	  || (echo "Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SB_URL/SB_KEY)" >&2; exit 2)

pause: cli-env-check ## Flip the kill-switch. Usage: make pause REASON="debugging oom strategy"
	@test -n "$${REASON:-}" || (echo "REASON=... required" >&2; exit 2)
	node autofix-cli.mjs pause "$${REASON}"

unpause: cli-env-check ## Clear the kill-switch
	node autofix-cli.mjs unpause

last: cli-env-check ## Last N autofix_attempts rows (N=50 default)
	node autofix-cli.mjs last $(N)

attempts: cli-env-check ## Filter attempts by status. Usage: make attempts STATUS=errored
	@test -n "$${STATUS:-}" || (echo "STATUS=... required" >&2; exit 2)
	node autofix-cli.mjs attempts "$${STATUS}" $(N)
