# Handoff: install claude-code-router (musistudio) + configure as Anthropic-passthrough

**Date:** 2026-05-06
**From:** Cowork Claude (sandbox session, can't run Mac-side npm/daemon installs)
**For:** Antigravity (or any agent with shell access on Dan's Mac)

## Context — what this tool actually is

`claude-code-router` (https://github.com/musistudio/claude-code-router, ~33.5k ⭐) is **NOT a Claude plugin**. It's a standalone **Node.js daemon/proxy** that sits between the `claude` CLI and the Anthropic API. Its purpose is to let users route different requests to different LLM providers (Anthropic, OpenAI, DeepSeek, local Ollama, etc.) transparently through the `claude` interface.

**It will not appear in:**
- `claude plugin list` — not a plugin
- Cowork's available_skills — not a Cowork plugin
- Claude desktop app's plugin manager — not a desktop-app plugin

**What it IS:** a CLI tool you start with `ccr start`, runs as a background process on a local port, and you point `claude` at it via env var.

**Honest value assessment for Dan's use case:**
- ✅ Worth it IF: you want to use cheaper/local models for some tasks (e.g., rough drafts via local llama, final pass via Sonnet 4.6)
- ❌ Not worth it IF: you're 100% Anthropic — it just adds latency + a failure point
- ⚠️ Risk: a misconfigured router can silently route requests to a model that's worse than Sonnet, degrading code quality

This handoff installs it as **Anthropic-only passthrough** by default — meaning ccr is running but every request still goes to Anthropic, exactly like without ccr. Dan can later configure other providers if he wants. This way the install is non-destructive — if something breaks, it's trivial to disable by killing the daemon.

## Steps

### 1. Install the package

```bash
# Verify Node and npm are present
node --version  # expect v18+ for ccr
npm --version

# Install globally
npm install -g @musistudio/claude-code-router

# Verify install
which ccr
ccr --version
```

If `npm install -g` fails with permission errors, retry with `sudo` OR fix npm prefix:
```bash
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
npm install -g @musistudio/claude-code-router
```

### 2. Create minimal Anthropic-only config

```bash
mkdir -p ~/.claude-code-router
cat > ~/.claude-code-router/config.json <<'EOF'
{
  "Providers": [
    {
      "name": "anthropic",
      "api_base_url": "https://api.anthropic.com/v1/messages",
      "api_key": "$ANTHROPIC_API_KEY",
      "models": ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"]
    }
  ],
  "Router": {
    "default": "anthropic,claude-sonnet-4-6",
    "background": "anthropic,claude-haiku-4-5-20251001",
    "think": "anthropic,claude-opus-4-6",
    "longContext": "anthropic,claude-sonnet-4-6",
    "longContextThreshold": 60000,
    "webSearch": "anthropic,claude-sonnet-4-6"
  },
  "API_KEY_TIMEOUT_MS": 600000
}
EOF
```

**IMPORTANT — API key handling:**
- The config above references `$ANTHROPIC_API_KEY` as an env var, NOT a literal key. Check whether ccr's config supports env var expansion in this version. If it doesn't, replace `"$ANTHROPIC_API_KEY"` with the actual key value (find it via Keychain or `~/.anthropic/credentials`). DO NOT commit this file to git — it's already outside the repo, but be paranoid.
- If Dan doesn't have `ANTHROPIC_API_KEY` exported anywhere, set it:
  ```bash
  export ANTHROPIC_API_KEY=$(security find-generic-password -s "anthropic-api-key" -w 2>/dev/null || echo "GET_FROM_console.anthropic.com")
  ```

### 3. Start the daemon

```bash
ccr start
# Should print: "Server is running on http://127.0.0.1:3456"
```

If it fails to start, common issues:
- Port 3456 already in use: `lsof -ti :3456 | xargs kill -9` then retry
- Config JSON invalid: `python3 -m json.tool ~/.claude-code-router/config.json` to validate

### 4. Test the proxy with a non-claude HTTP request

```bash
curl http://127.0.0.1:3456/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "Say PROXY_OK in 3 words"}]
  }' | head -30
```

Expect a JSON response containing `"PROXY_OK"` or similar in the assistant's reply. If you get a connection error, the daemon isn't running. If you get a 401, the API key didn't propagate.

### 5. Configure `claude` CLI to use the proxy

Two options — pick one:

**Option A (recommended — opt-in per session):**
```bash
# Run claude through the proxy when you want to:
ANTHROPIC_BASE_URL=http://127.0.0.1:3456 claude
```

**Option B (always-on, more invasive):**
```bash
# Add to ~/.zshrc — claude always uses the proxy
echo "" >> ~/.zshrc
echo "# claude-code-router proxy (opt-out by unsetting)" >> ~/.zshrc
echo 'export ANTHROPIC_BASE_URL="http://127.0.0.1:3456"' >> ~/.zshrc
```

**Recommend Option A unless Dan explicitly says "always on"** — easier to A/B compare proxy vs direct.

### 6. End-to-end test

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:3456 claude
```

Inside the `claude` REPL:
```
Test message — what model are you?
```

If the response identifies as a Claude model and answers normally, the proxy is working as a transparent passthrough. If it errors or returns garbage, something's misconfigured — fall back to direct (no proxy) mode while debugging.

### 7. Optionally — set up auto-start on login

If Dan wants ccr to always be running:

```bash
cat > ~/Library/LaunchAgents/com.musistudio.claude-code-router.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.musistudio.claude-code-router</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/ccr</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/ccr.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ccr.stderr.log</string>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.musistudio.claude-code-router.plist
```

(Adjust `/usr/local/bin/ccr` to wherever `which ccr` reports the binary.)

**Skip step 7 if Dan didn't explicitly ask for auto-start** — manual `ccr start` is fine for evaluation.

## Rollback (if anything breaks)

```bash
# Stop the daemon
ccr stop  # or: lsof -ti :3456 | xargs kill -9

# Disable auto-start (if step 7 was done)
launchctl unload ~/Library/LaunchAgents/com.musistudio.claude-code-router.plist
rm ~/Library/LaunchAgents/com.musistudio.claude-code-router.plist

# Remove env var override (if option B was chosen)
sed -i.bak '/claude-code-router/d' ~/.zshrc
sed -i.bak '/ANTHROPIC_BASE_URL.*127.0.0.1:3456/d' ~/.zshrc

# Uninstall package
npm uninstall -g @musistudio/claude-code-router

# Optional: remove config
rm -rf ~/.claude-code-router
```

After rollback, `claude` CLI behaves exactly as before this handoff.

## Report

Write `.agent/audits/2026-05-06-claude-code-router-install.md`:

```markdown
# claude-code-router install — final state

**Date:** 2026-05-06
**Run by:** <agent-name>

## Install
- Package version: <ccr --version output>
- Binary path: <which ccr output>
- Config path: ~/.claude-code-router/config.json
- API key handling: <env var | literal in config>

## Daemon
- Status: <running | stopped>
- Port: 3456
- Auto-start: <yes via LaunchAgent | no>

## Test results
- Curl proxy test (step 4): ✅ PROXY_OK seen | ❌ <error>
- E2E test through `claude` (step 6): ✅ works | ❌ <error>

## Rollback escape hatch
<paste the rollback section verbatim so any future agent can find it>

## Recommended invocation
- Opt-in mode (recommended): ANTHROPIC_BASE_URL=http://127.0.0.1:3456 claude
- Always-on mode: <if configured, document>
```

Then commit + push:
```bash
cd ~/Documents/Smarter-Poker-World-Hub
bash scripts/git-safe-push.sh "docs(audit): claude-code-router install state"
```

Wait for `DEPLOY_VERIFIED:true`.

## Pre-flight + safety

- `scripts/git-safe-push.sh` Phase 0.7 may warn about reflog reset entries — pre-existing, safe to proceed.
- DO NOT commit `~/.claude-code-router/config.json` if it contains a literal API key.
- DO NOT enable LaunchAgent auto-start (step 7) unless Dan explicitly requested it.
- DO NOT set `ANTHROPIC_BASE_URL` globally (option B in step 5) unless Dan explicitly requested always-on.

## Success criteria

- ✅ `ccr --version` works after install
- ✅ Daemon starts and curl test in step 4 returns a Claude response
- ✅ E2E test in step 6 (`claude` through proxy) works normally
- ✅ Rollback path documented in audit doc
- ✅ Audit doc committed + pushed; `/api/health` returns the new SHA

If install fails (npm errors, port conflict, API key issue) and you can't resolve in 30 minutes, abort, rollback what you've installed, and write a follow-up handoff at `.agent/handoffs/2026-05-07-<slug>.md` describing the blocker.
