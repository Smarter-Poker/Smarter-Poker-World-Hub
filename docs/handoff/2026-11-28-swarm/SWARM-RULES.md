# Swarm rules (World Hub, 2026-11-27). Every agent reads this first.

Repo: Smarter-Poker/smarter-poker-world-hub (Next.js, Vercel project hub-vanguard). You have your OWN git worktree (path given in your prompt), already on your own branch off main 387ba16e, with node_modules symlinked. Do NOT clone, and do NOT touch other worktrees or /home/claude/smarter-poker-world-hub.
Read the repo's CLAUDE.md, AGENTS.md and PUBLISHING.md before editing.

Owner (Dan) rules for this work:
- #SmarterDesign: thin chrome border-image frames, ONE frame per section, never a framed card inside a framed section (stat readout tiles excepted). No bulky painted console frames. Centred, larger type. Explanations live behind the page's chrome "?" help tour, not in the page body.
- Video feed grid on the index stays a plain YouTube-style grid (2026-10-11 ruling, enforced by a test).
- Title Case for every player-visible word. No em dashes in UI text. No emoji in source. No "$" in UI text.
- Never fabricate data shown to players. If real data doesn't exist, don't invent it.
- Fix at the root, harden against regression with a test, no band-aids.
- Mobile first: check 375px, then desktop.

Delivery (you own it end to end; owner granted full authority):
- Commit with: git -c user.name=Smarter-Poker -c user.email=254329056+Smarter-Poker@users.noreply.github.com commit ...
  End every commit message with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UxDLnLyJhQ4UcGZ3k6pajX
- Never use --no-verify, never git stash, never print secrets or env values.
- Before pushing, rebase on fresh main: git fetch --depth 30 origin main && git rebase origin/main (if a shallow-history rebase fails, use: git rebase --onto origin/main <commit before your first>).
- Push: git -c push.negotiate=true push -u origin <your branch>. If you get HTTP 429 (too many concurrent transfers), sleep 10s and retry (max 5 tries). Other agents push in parallel.
- The repo's autopilot opens a PR for your pushed branch automatically within about a minute and auto-merges it once required checks pass. Find it with: gh api "repos/Smarter-Poker/smarter-poker-world-hub/pulls?head=Smarter-Poker:<branch>&state=all". If none appears within 3 minutes, create it via gh api (REST; GraphQL may be blocked). The PR body must end with:
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  https://claude.ai/code/session_01UxDLnLyJhQ4UcGZ3k6pajX
- So: ONLY push when your work is complete and tested locally, because pushing means shipping. To stage work without shipping, push under wip/... instead.
- Poll the checks (REST: commits/<sha>/check-runs). If a required check fails, read the log, fix, push again. If the PR goes behind main with conflicts, rebase and push.
- After merge, confirm the Vercel production deploy contains your commit: https://smarter.poker/api/health reports the commit sha. Use the Vercel MCP tools (list_deployments, projectId prj_op66GkZyZcygXQKm76iyycfVFAQx) if available; otherwise poll the PR merge sha against main.
- Tests: node --test <files> for __tests__/*.test.mjs and tests/*.test.mjs; vitest for *.vitest.test.mjs. Run the relevant existing suites plus your new tests. Keep all green.
- Local rendering, if you need it: next dev may hit the ENOSPC file-watcher limit; use WATCHPACK_POLLING=true or a scratch config. Chromium is at /opt/pw-browsers/chromium-1243/chrome-linux64/chrome (pass executablePath to playwright). Never commit scratch pages.

Final report (short): what you built, the files, the tests (names and pass counts), the PR number, the merge sha, and live verification. Say plainly what you could NOT do.

## Round 3 additions
- This box has ~8 GB RAM shared by 5 agents: do NOT run a full `next build` or long-lived `next dev` locally. Use targeted node tests, static analysis, and CI (dispatch workflows on a wip/ branch if you need a CI browser run), plus the live site after deploy.
- To hold a PR from auto-merging while you iterate, add the `do-not-ship` label or push under wip/; remove the label when ready.
- Before touching files another workstream owns, check open PRs touching them (gh api "repos/Smarter-Poker/smarter-poker-world-hub/pulls?state=open&per_page=100") and don't collide with active work; rebase right before pushing.
