# Reddit Agent Skill: Installation, Use, Refresh, Limits, Removal

Owner: Dan. Added 2026-11-10. This folder holds a Claude skill that researches
poker communities on Reddit and drafts posts and comments for Smarter.Poker.
It never posts. Nothing is published without Dan's approval of the exact text
and destination.

## What Is In This Folder

| File | Purpose |
| --- | --- |
| `SKILL.md` | The skill: hard rules, modes, product mention gate, verified product facts, rules register |
| `README.md` | This guide |

There are no scripts, hooks, dependencies, credentials or network calls. The
skill is two Markdown files.

## Source And Verification

- Base: `github.com/piupiuyao/reddit-founder-skill`, commit dated 2026-02-25.
- Contents inspected on 2026-11-10: `README.md` and `SKILL.md` only. No
  executable files, no hooks, no install steps beyond copying text.
- Licence: the README says "Free to use and share. If you build something
  with it, a mention would be appreciated." There is no formal licence file.
  This adaptation credits the source in `SKILL.md`.
- Removed from the source: startup-subreddit tables, the karma warm-up plan
  (including off-topic posts made to raise karma), cross-posting tactics, and
  advice to add deliberate flaws so text seems human.

## Who Can Use It

| Environment | Can use it | How | Verified |
| --- | --- | --- | --- |
| Claude Code, any account, in a checkout of this repo at or after the commit that added this folder | Yes | Project skill, loaded from `.claude/skills/reddit-agent/` | Verified in one cloud Claude Code session on 2026-11-10 |
| Claude Code on the Mac in a checkout of this repo | Expected yes after `git pull` on main | Same project skill | Not verified on the Mac |
| Claude Code in another repo (for example Club Arena) | No | Project skills do not cross repos | Not installed |
| Claude Code user level on the Mac (`~/.claude/skills/`), every repo and account that shares that home folder | Not installed | Run the copy command below | Not verified |
| Claude app (claude.ai) | Only the account where the skill was saved from the chat's review card | Saved per account | One account, if Dan saved it |
| Codex, Antigravity and other agents | Can read these files as instructions | Open `SKILL.md` | Not verified |

To make it available in every repo for the Mac user, run this once from a
checkout of this repo on the Mac:

```bash
mkdir -p ~/.claude/skills && cp -R .claude/skills/reddit-agent ~/.claude/skills/
```

Claude Code accounts that use the same macOS user and home folder share
`~/.claude/skills/`. An account configured with a different config folder
needs the same copy made into its own folder.

## How To Use It

In Claude Code inside this repo, ask for it by name or by task:

- "Use the reddit-agent skill to refresh the rules for r/poker" (`/rd-rules`)
- "Find questions we could answer this week" (`/rd-research`)
- "Draft a standalone post about pot odds for r/poker" (`/rd-post`)
- "Draft a reply to this thread" and paste the thread (`/rd-comment`)
- "Can we mention the ICM calculator here?" (`/rd-mention`)

Every result is a block marked `DRAFT (not posted)` with the destination, the
rules entry it was checked against, and the evidence. Dan approves the exact
text and destination, then posts it himself.

## Rule Refresh Procedure

1. Open the community's rules page, sidebar or wiki and its pinned posts.
   Claude's web tools are often blocked from reddit.com; when they are, Dan
   pastes the text or a screenshot. Do not use mirrors, caches or shell
   requests to get around the block.
2. Update the Rules Register table in `SKILL.md`: what the rule says in your
   own words, the source, the date, and the status (Verified at source,
   Secondary source, Unknown).
3. Commit the change on an owned branch and deliver it through `PUBLISHING.md`
   like any other change to this repo.
4. Refresh any entry older than 30 days before drafting a product mention for
   that community, and before a first post in any community.

Product facts in `SKILL.md` follow the same 30-day rule and are re-checked
against https://smarter.poker.

## Limitations

- As of 2026-11-10 no community's rules are verified at source. The register
  holds secondary reports only, so product mentions stop at "draft, rules not
  verified" until Dan supplies the rules text.
- The agent cannot read Reddit directly in most environments. Research
  depends on pasted threads or on search results that happen to surface them.
- Unpublished moderator filters (account age, karma) cannot be seen.
- The skill does not post, vote, message or log in, and it does not track
  Dan's Reddit activity; ratio rules are checked against what Dan reports.
- The freeroll prize total is unverified and must not be stated.
- It is guidance for an agent. It cannot guarantee a post will not be removed.

## Removal

- This repo: delete `.claude/skills/reddit-agent/` and the "Reddit
  research-and-drafting skill" section in the root `AGENTS.md`, through an
  owned branch and protected merge.
- Mac user level, if copied: `rm -r ~/.claude/skills/reddit-agent`
- Claude app: remove the skill from that account's skills list.
