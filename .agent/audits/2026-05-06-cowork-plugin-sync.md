# Cowork Plugin Sync Final Audit
**Date:** 2026-05-06
**Context:** Resolving the architectural gap between Claude Code CLI plugins (`~/.claude/plugins/`) and Cowork desktop app plugins (`cowork_plugins/`).

## Architectural Findings
1. **The Disconnect:** Claude Code CLI and Cowork desktop app use completely distinct plugin ecosystems. CLI plugins live in `~/.claude/plugins/`, while Cowork plugins live in `~/Library/Application Support/Claude/local-agent-mode-sessions/<id>/cowork_plugins/`.
2. **The UI Misconception:** The Claude desktop app's Settings -> Extensions tab ONLY manages `.dxt`/`.mcpb` MCP-server bundles (like `Control Chrome`). It DOES NOT install or manage GitHub-based `plugin.json` repositories.
3. **The Cowork Installation Mechanism:** Cowork plugins (like `engineering` or `antigravity-toolkit`) are installed by adding GitHub repos as marketplace sources in `known_marketplaces.json`, caching the repos in the `cache/` directory, and registering them in `installed_plugins.json` and `cowork_settings.json`.

## Resolution Strategy
To make the 8 requested plugins accessible to Cowork sessions, we replicated the internal Cowork installation mechanism directly on the filesystem:

1. **Marketplace Registration:**
   - Added `anthropics/claude-code` as `claude-plugins-official` to `known_marketplaces.json`.
   - Added individual GitHub repos for the remaining custom plugins as dedicated marketplace entries.

2. **Cache Injection:**
   - Cloned the following repos directly into the Cowork `cache/` directory:
     - `superpowers` (obra/superpowers)
     - `context7` (upstash/context7)
     - `obsidian-cli` (pablo-mano/Obsidian-CLI-skill)
     - `ui-ux-pro-max` (nextlevelbuilder/ui-ux-pro-max-skill)
     - `everything-claude-code` (affaan-m/everything-claude-code)
     - `game-studios` (Donchitos/Claude-Code-Game-Studios) - *Custom `plugin.json` wrapper created for compatibility.*
   - Extracted `frontend-design` and `ralph-wiggum` from the `claude-plugins-official` marketplace clone.

3. **System Registration:**
   - Updated `installed_plugins.json` to register all 8 plugins with their exact cache paths and Git SHAs.
   - Updated `cowork_settings.json` to flag all 8 plugins as `enabledPlugins: true`.

4. **Service Restart:**
   - Terminated and restarted the Claude desktop application via `osascript` to force a cold load of the updated `cowork_plugins/` configurations.

## Verification
All 8 plugins are now native to the Cowork environment. Future Cowork sessions will see these as standard tools available in their context window.

**Note on Version Gating:** The requested `/ultrareview` feature remains unavailable as it requires Claude Code binary version `>= 2.1.120` (current system is on `2.1.15`).

## Next Steps
No further action is required for these 8 plugins. If new plugins are needed in Cowork in the future, they must be added via this marketplace/cache registration method, not via the Claude desktop UI Extensions tab.
