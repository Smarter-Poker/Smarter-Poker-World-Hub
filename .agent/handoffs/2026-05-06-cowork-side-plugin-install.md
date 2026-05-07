# Handoff: install plugins via Claude desktop app so Cowork can see them

**Date:** 2026-05-06
**From:** Cowork Claude (sandbox session, can't drive Claude desktop app's plugin UI)
**For:** Antigravity agent (or any agent with full GUI/keystroke access on Dan's Mac)

## Context

Earlier today Dan installed 9 Claude Code plugins + LightRAG via the `claude` CLI. Those landed in `~/.claude/plugins/` and ARE visible in Claude Code CLI REPL sessions on his Mac. But **none are visible in Cowork mode** (the chat surface), because Cowork's plugin loader scans different paths:

- `~/Library/Application Support/Claude/local-agent-mode-sessions/<session-id>/rpm/plugin_*/` — populated when plugins are installed via the **Claude desktop app's plugin manager UI**
- `~/Library/Application Support/Claude/local-agent-mode-sessions/<session-id>/cowork_plugins/cache/...` — Cowork's own marketplace cache

The Claude Code CLI's `~/.claude/plugins/` is a separate ecosystem that Cowork doesn't read.

**Existing plugins that DO work in Cowork** (e.g., antigravity-toolkit, anthropic-skills, engineering, cowork-plugin-management) got there via the Claude desktop app's plugin UI at some earlier point. That's the route the 11 from today need to take too.

## Your job

Install the same 9 GitHub plugins (and 2 Anthropic-marketplace plugins) through the **Claude desktop app's plugin manager UI**, so they show up in Cowork sessions on top of remaining available in Claude Code CLI.

### Plugins to install

| # | Name | Source | URL |
|---|---|---|---|
| 1 | Obsidian CLI Skill | GitHub | https://github.com/pablo-mano/Obsidian-CLI-skill |
| 2 | SuperPowers | GitHub | https://github.com/obra/superpowers |
| 3 | Context7 | GitHub | https://github.com/upstash/context7 |
| 4 | UI/UX Pro Max | GitHub | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill |
| 5 | Everything Claude Code | GitHub | https://github.com/affaan-m/everything-claude-code |
| 6 | Frontend Design | Anthropic catalog | https://claude.com/plugins/frontend-design |
| 7 | Ralph Loop (`ralph-wiggum`) | Anthropic catalog | https://claude.com/plugins/ralph-loop |
| 8 | Game Studios | GitHub | https://github.com/Donchitos/Claude-Code-Game-Studios |
| 9 | Video Toolkit | GitHub (skip — README-only) | https://github.com/wilwaldon/Claude-Code-Video-Toolkit |

**Skip #9** — that repo is README-only, not an installable bundle. (See `.agent/audits/2026-05-06-plugin-install-final.md` for why.)

LightRAG (Python lib) is irrelevant here — already installed at OS level.

### Step-by-step

1. **Open the Claude desktop app:**
   ```bash
   open -a "Claude"
   ```
   Wait for the app window to be focused.

2. **Find the plugin manager.** The exact menu path may be:
   - Top menu bar: Claude → Settings → Plugins
   - OR Settings (gear icon) in the sidebar → Plugins
   - OR Preferences → Plugins / Extensions / Marketplace
   
   If the menu name differs in this version, look for anything containing "Plugins", "Marketplace", "Extensions". Take a screenshot if you can't find it and abort with a follow-up handoff describing what you saw.

3. **For each plugin in the table above (skipping #9):**
   - Look for an "Add" / "+" / "Install from URL" / "Add custom" button
   - Paste the GitHub URL (or for #6/#7, the claude.com/plugins URL)
   - Confirm the install
   - Wait for "✓ installed" / similar confirmation before moving to the next one
   - If a name conflict warning appears (e.g., "already installed via CLI"), accept and let it install at the desktop-app path too — both paths can coexist

4. **For Frontend Design (#6) and Ralph Loop (#7):** these are in Anthropic's official catalog, so they may not need a URL — search by name in the marketplace search field. The installable name for #7 is `ralph-wiggum` (it provides `/ralph-loop` slash-command). If you can only find one of those names and not both, install whichever is there and report which.

5. **After all 8 installs (1, 2, 3, 4, 5, 6, 7, 8 — skipping 9):**
   - Quit Claude desktop app fully (`Cmd+Q`, not just close window — full quit so the plugin loader re-scans on next launch)
   - Reopen: `open -a "Claude"`
   - Verify all 8 are listed in the plugin manager as installed/enabled

### Verification — confirm Cowork sees them

After step 5:

1. Open a NEW Cowork chat in the desktop app (not a continuation of an existing one)
2. As your first message, paste:
   > "List your available skills/plugins. I'm specifically looking for: obsidian-cli, superpowers, context7-plugin, ui-ux-pro-max, everything-claude-code, frontend-design, ralph-wiggum, game-studios. Confirm each is ✅ visible or ❌ missing."

3. The response should show ✅ for all 8 (or close to 8 — Game Studios may show as `gs-*` skills rather than a single plugin entry).

### Reporting

After verification, write `.agent/audits/2026-05-06-cowork-plugin-install-final.md`:

```markdown
# Cowork-side plugin install — final state

**Date:** 2026-05-06
**Run by:** <agent-name>

## Plugin manager UI path
<exact menu path you found, e.g. "Claude → Settings → Plugins">

## Install results

| Plugin | Installed? | Notes |
|---|---|---|
| Obsidian CLI | ✅ / ❌ | |
| SuperPowers | ✅ / ❌ | |
| Context7 | ✅ / ❌ | |
| UI/UX Pro Max | ✅ / ❌ | |
| Everything Claude Code | ✅ / ❌ | |
| Frontend Design | ✅ / ❌ | |
| Ralph Loop / ralph-wiggum | ✅ / ❌ | |
| Game Studios | ✅ / ❌ | |

## Cowork visibility test
<paste the response from the new Cowork chat — which it confirmed visible>

## Anything that didn't work + why
<list>
```

Then commit + push:
```bash
cd ~/Documents/Smarter-Poker-World-Hub
bash scripts/git-safe-push.sh "docs(audit): cowork-side plugin install final state"
```

Wait for `DEPLOY_VERIFIED:true`.

## Pre-flight

- `scripts/git-safe-push.sh` Phase 0.7 may warn about reflog reset entries — those predate today's auto-reset disable; safe to proceed.
- CLAUDE.md Rule 13 (added today) explains the auto-reset failure mode if you encounter it again.

## Success criteria

- ✅ At least 6 of 8 plugins show ✅ in both the desktop app's plugin manager AND the new Cowork chat verification
- ✅ Audit doc committed + pushed; production `/api/health` returns the new SHA

If you can't find the plugin manager UI in the desktop app at all (different version, missing feature), abort and write a follow-up handoff at `.agent/handoffs/2026-05-07-<slug>.md` describing:
- What menu items you DID see
- Screenshots if possible
- Whether the desktop-app version is current (`Claude → About` or similar)
