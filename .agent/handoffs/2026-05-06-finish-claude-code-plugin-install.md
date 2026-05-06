# Handoff: finish 3 remaining Claude Code plugin installs

**Date:** 2026-05-06
**From:** Cowork Claude (this session, computer-use sandbox; cannot type into Terminal or interactive Claude Code sessions)
**For:** any agent with shell access to Dan's Mac (Antigravity, Claude Code agent-mode, etc.)
**Why this is a handoff:** the originating Cowork session is restricted from typing into Terminal (system tier policy) and from typing into interactive Claude Code sessions. The remaining steps require typing slash-commands into a running `claude` REPL, which only an agent with full keystroke privileges can do.

---

## Context — what's already done

Earlier today Dan asked Cowork Claude to install 11 GitHub/Anthropic plugins for Claude Code. Cowork wrote install scripts to clipboard for Dan to paste into Terminal, and that succeeded for most. Final state:

**✅ Confirmed installed (verified via `claude plugin list`):**

| Plugin | Marketplace | Version |
|---|---|---|
| Obsidian CLI | `obsidian-cli-skill` (`pablo-mano/Obsidian-CLI-skill`) | 1.3.0 |
| SuperPowers | `superpowers-dev` (`obra/superpowers`) | 5.1.0 |
| Context7 | `context7-marketplace` (`upstash/context7`), plugin name `context7-plugin` | 1.0.0 |
| UI/UX Pro Max | `ui-ux-pro-max-skill` (`nextlevelbuilder/ui-ux-pro-max-skill`) | 2.5.0 |
| Everything Claude Code | `everything-claude-code` (`affaan-m/everything-claude-code`) | 2.0.0-rc.1 |

**✅ LightRAG Python library** — installed at v1.4.15 via `python3 -m pip install --user --break-system-packages 'lightrag-hku[api,tools]'`. Imports cleanly. CLI binaries are at `~/Library/Python/3.14/bin` and the PATH entry was appended to `~/.zshrc`.

**✅ Game Studios** (`Donchitos/Claude-Code-Game-Studios`) — cloned to `~/.claude/skills/claude-code-game-studios/` and its `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`, `.claude/rules/` were all symlinked into `~/.claude/{skills,agents,hooks,rules}/` with a `gs-` prefix. 70 skills, 49 agents, 12 hooks, 11 rules now discoverable by Claude Code.

**❌ Video Toolkit** (`wilwaldon/Claude-Code-Video-Toolkit`) — repo only contains a `README.md`, no `.claude/` directory. It's a curated list of OTHER tools to install, not an installable bundle. **Skip** (or revisit later by installing each sub-tool the README references — Remotion, Manim, Playwright, FFmpeg).

## What's left — 3 steps you must do

Two of these require typing slash-commands inside an interactive `claude` REPL session. The third is a verification.

### Step 1 — install Frontend Design

```bash
cd ~
claude  # opens interactive Claude Code session
```

Inside the session:
```
/plugin install frontend-design
```

**Possible outcomes:**
- ✅ "Successfully installed plugin: frontend-design@..." → done, move to step 2.
- ❌ "Plugin not found in any configured marketplace" → the Anthropic official-plugin marketplace isn't pre-configured. Try:
  ```
  /plugin marketplace list
  ```
  …to see what marketplaces ARE pre-configured. If `anthropics/claude-code-plugins` or similar is missing, search Anthropic's docs (https://docs.claude.com/en/docs/claude-code/plugins) for the canonical marketplace identifier and add it via:
  ```
  /plugin marketplace add <correct-identifier>
  /plugin install frontend-design
  ```
- ⚠️ Plugin name might differ from `frontend-design`. After `marketplace add`, run `/plugin marketplace browse <marketplace>` (or whichever subcommand lists plugins in a marketplace) to find the real name.

### Step 2 — install Ralph Loop

In the same interactive session:
```
/plugin install ralph-loop
```

Same outcome tree as Step 1. If the Anthropic marketplace was added during Step 1 troubleshooting, this should just work.

### Step 3 — verify UltraReview

In the same interactive session:
```
/ultrareview
```

**Possible outcomes:**
- ✅ Autocompletes / shows help / runs → it's a built-in Claude Code feature in Dan's installed version (v2.1.86+). No install needed.
- ❌ "Command not found" or similar → it's NOT built-in for Dan's version. Either:
  - (a) Upgrade Claude Code: run `claude update` or follow https://docs.claude.com/en/docs/claude-code/install (then re-test `/ultrareview`).
  - (b) Search for an alternate community plugin called `ultrareview` and install it via `/plugin marketplace add` + `/plugin install`. WebFetch this query: `site:github.com ultrareview claude code plugin`.

## Exit and report

After all three steps:
```
/quit
```

Back at bash, run:
```bash
claude plugin list
```

Then create a status report at `.agent/audits/2026-05-06-plugin-install-final.md` with this template:

```markdown
# Plugin install — final state

**Date:** 2026-05-06
**Run by:** <agent-name>

## Confirmed installed (claude plugin list output)
<paste output>

## Frontend Design
- Status: ✅ installed | ❌ failed
- Notes: <any troubleshooting steps taken>

## Ralph Loop
- Status: ✅ installed | ❌ failed
- Notes: <any troubleshooting steps taken>

## UltraReview
- Status: ✅ built-in | ❌ not built-in (and how I confirmed)
- Notes: <action taken if not built-in>

## Anything I had to install or configure beyond the script
<list>
```

Then commit + push the audit doc:
```bash
cd ~/Documents/Smarter-Poker-World-Hub
bash scripts/git-safe-push.sh "docs(audit): plugin install final state — frontend-design, ralph-loop, ultrareview"
```

The script must exit 0 with `DEPLOY_VERIFIED:true`.

## Pre-flight — read these before you start

1. **`scripts/git-safe-push.sh` Phase 0.7** will warn if your reflog shows `≥2 reset: moving to origin/main` entries. That's the auto-reset loop Dan was hit by earlier today. If you see the warning fire, confirm with Dan that Antigravity's auto-reset feature is still disabled before doing any work that risks data loss.

2. **CLAUDE.md Rule 13** — added today — explains the auto-reset failure mode and recovery path. Read it before relying on uncommitted edits.

3. **Stash list** — Dan has 4 leftover stashes from earlier sessions. Don't pop them; they're snapshots from the auto-reset incident and most are now redundant. `git stash list` to inspect; leave alone unless told to clean up.

## Success criteria

- ✅ `/plugin install frontend-design` succeeded (or you've reported the exact failure with the marketplace it searched).
- ✅ `/plugin install ralph-loop` succeeded (same caveat).
- ✅ `/ultrareview` test conclusively answered (built-in or not).
- ✅ Audit doc at `.agent/audits/2026-05-06-plugin-install-final.md` committed + pushed.
- ✅ Production `/api/health` returns the new SHA after the audit-doc push.

If any of those hits a wall you can't resolve in 30 minutes of investigation, write a follow-up handoff at `.agent/handoffs/2026-05-07-<slug>.md` describing what you tried and what's blocking, instead of leaving the session in an ambiguous state.
