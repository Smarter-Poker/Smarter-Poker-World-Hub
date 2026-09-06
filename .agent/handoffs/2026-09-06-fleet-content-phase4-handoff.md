# HANDOFF - Fleet Content Programme, end of Phase 4

**Written 2026-09-06 ~12:45 UTC. Read this whole file before touching anything.**

You are picking up a 10-phase programme that makes 1,000 AI "horses" post
believable content on smarter.poker. Phases 1-4 are shipped. This file is the
complete state, including the things that are wrong.

---

## 0. THE FIRST THING TO KNOW

**Dan stopped this work mid-session because the output was bad.** Verbatim:

> WHAT THE HELL ARE THESE POSTS?! THEY ARE PURE TRASH. ANYTIME YOU CREATE SOME
> NEW WAY FOR A HORSE TO POST, OR GIVE IT AN INSTRUCTION TO "CREATE NEW
> CONTENT" I NEED TO APPROVE IT FIRST.

What was on the feed:

    No hand, all narrative. Qh8c7d6sAd5c on 5s 4s Td 3c 6d. won 184bb
    nah QTs, board came 6c 7c 9c 9h 3s, won 149bb, right.

A database row with spaces in it. Every one of those posts was TRUE, passed
`factsMatch`, and passed eighteen law tests written for it. **None of those
tests asked whether a person would want to read it.**

### THE BINDING RULE THAT CAME OUT OF IT

**A new way for a horse to post, or any instruction to a horse to create
content, is OFF until Dan personally approves it.** Enforced by
`public.horse_post_modes` - one row per way of posting, new ones default
FALSE, and `postModeEnabled()` in `Fleet.ts` **fails CLOSED** (an unreadable
table means OFF). Approving is one UPDATE, no deploy:

```sql
UPDATE horse_post_modes SET enabled = true, approved_by = 'dan', approved_at = now()
WHERE mode = 'grounded_hand';
```

Current state:

| mode | enabled | approved_by |
| --- | --- | --- |
| poker_video | true | pre-existing |
| sports_video | true | pre-existing |
| poker_news | true | pre-existing |
| sports_news | true | pre-existing |
| **grounded_hand** | **false** | **nobody** |
| **grounded_session** | **false** | **nobody** |

The four "pre-existing" ones are marked that way deliberately - nobody
approved those either, and calling them approved would be the same lie in a
nicer shape.

---

## 1. WHAT DAN ASKED FOR THAT IS NOT DONE

### 1a. THE OPEN TASK: grounded hand posts, rewritten voice, samples for Dan

Dan chose "Rewrite the voice, show me before it runs". Status:

- **DONE**: `src/lib/content-engine/HandVoice.ts` (workers repo, on `main`).
  Three rules: never print notation ("kings" not "KhKs"), never print the
  board ("a paired board" not "Qc Qs 4s 9s 2d"), never print big blinds
  ("a good pot" not "184bb").
- **DONE**: sampled twice against REAL hands from production. First pass
  exposed that money/board phrases were written as clauses but used as noun
  slots ("lost the worst one I have lost in a while with the best hand"), so
  they became strict noun phrases and the lines were rewritten around them.
  84 generated lines, 0 printing a row.
- **NOT DONE**: `HandVoice` is **NOT wired to the publisher**. `postGrounded`
  still uses the old `GroundedComposer`, and is gated off.
- **NOT DONE**: **Dan has not seen the samples.** He must, before anything is
  enabled.

**Your first job**: show Dan these, ask if the voice is right, and do NOT
enable anything until he says so.

    1. lost about as bad as it gets there and I would play it exactly the same
    2. fired the last one with nothing and got the fold. most of a stack
    3. that was the biggest pot of my night, and I did not have to do anything smart
    4. no way to play king-jack suited for less than everything
    5. finally won one. aces, all the way
    6. told the story all the way to the end on a paired board. they believed it
    7. had kings and lost it on the river. that is poker apparently
    8. nothing clever, just jacks and someone who did not believe me
    9. kings into a wet paired board. no way to fold, no way to win
   10. do that a hundred times and I win most of them. not tonight

Regenerate them yourself before showing him (they come from live data):

```bash
export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"
cd ~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet
# write a probe that calls pickHandStory() + lineFor(); see git log for dda1f3d
```

If Dan approves: wire `lineFor()` into `postGrounded` in `HorsePublisher.ts`
(replacing the `composeHandPost` call), keep the frame-ledger dedupe, then set
the mode row to enabled. If he does not: the file stays unwired and harmless.

### 1b. VERIFY THE LAST PUSH TO PRODUCTION (another agent is on this)

Dan says another agent is currently fixing production issues from the last
push. **Verify their work landed before you build on it.** Do not assume.

```bash
cd ~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet && git fetch origin
git log --oneline origin/main -15
# verify FILES, never the merge tick (CLAUDE.md 10.82):
git cat-file -e origin/main:src/lib/content-engine/HandVoice.ts && echo OK
```

**Workers PR #105 merged at 12:47 UTC** (commit `dda1f3d`, HandVoice.ts).
Confirm it DEPLOYED to the VM - merge is not deploy:

```bash
TOK=$(grep -m1 '^GITHUB_TOKEN=' ~/Documents/club-arena/.env | cut -d= -f2-)
curl -s -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/Smarter-Poker/smarter-poker-workers/pulls/105" \
  | python3 -c "import json,sys;p=json.load(sys.stdin);print(p['state'],p['merged'])"
# then the deploy:
curl -s -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/Smarter-Poker/smarter-poker-workers/actions/workflows/auto-deploy-workers.yml/runs?per_page=3" \
  | python3 -c "import json,sys;[print(r['head_sha'][:7],r['status'],r['conclusion']) for r in json.load(sys.stdin)['workflow_runs']]"
```

**GitHub API rate limit**: 5,000/hr and this session exhausted it once. When
every call returns `None`, that is the limit, not a missing workflow. Check
`/rate_limit` before concluding anything.

---

## 2. EVERYTHING THAT SHIPPED (all merged and deployed unless noted)

### Workers repo (`smarter-poker-workers`)
| PR | What |
| --- | --- |
| #97 | Phase 4: `poker_clips` + channel RSS scraper, per-horse source slices, sports share as a persona trait, `ClipLibrary.ts` deleted |
| #99 | Dormant channels retired (540 days), candidates read newest-first |
| #102 | Video-library bridge, news feeds from the registry, `tryFallbacks` actually applies its repair |
| #103 | A real title is not a noun (clause-shaped titles) |
| #104 | `horse_post_modes` gate, `postGrounded` gated, 4 law pins |
| #105 | MERGED - `HandVoice.ts` (verified merged 12:47 UTC) |

### World Hub (`Smarter-Poker-World-Hub`)
| PR | What |
| --- | --- |
| #1440 | Phase 4 migrations + Open Claw schedules |
| #1453 | Reels bridge routed to workers, `content_sources.aliases` |

### Migrations applied to production (all asserted, all verified)
`poker_gets_a_supply_that_renews`, `poker_clips_video_id_index_can_be_inferred`,
`the_retired_clip_array_becomes_rows`,
`a_reel_waiting_on_a_dead_job_falls_back_to_youtube`,
`news_feeds_join_the_source_registry`,
`a_channel_is_known_by_more_than_one_name`,
`seeded_clips_answer_to_the_names_in_the_registry`,
`twelve_more_channels_each_one_resolved_first`,
`five_more_resolved_channels_and_the_honest_count`,
`a_new_way_for_a_horse_to_post_is_off_until_dan_approves_it`,
`no_two_horses_share_a_name`, `a_hand_brief_keeps_its_own_confidence`

### Measured production state at handoff
| | before Phase 4 | now |
| --- | --- | --- |
| live poker clips | 113 | **1,720** |
| poker channels active | n/a (60 literals, 18 with clips) | 91 (16 retired dormant) |
| poker news feeds | 2 hard-coded | 4 from the registry |
| reels stuck in queue | 144 (23 days) | **0** |
| horses sharing a name | 132 | **0** |
| dead clips being posted | 36 unknown | 36 tombstoned |

---

## 3. THINGS THAT ARE STILL WRONG - YOUR BACKLOG

### HIGH - Dan raised these and they are not fully answered

1. **Grounded voice not wired / not approved.** Section 1a. The blocker.
2. **Horse names.** Dan: "WTF ARE THESE 'REAL NAMES'. THEY AREN'T REAL AT
   ALL." Duplicates are fixed (132 -> 0) and he chose to KEEP full names over
   switching to the poker aliases. **But he may still dislike the naming
   style itself** - "Isolde Beauchamp", "Philippa Provenzano". Some are odd:
   "Stackoff SUE", "Potodds Paul", "Allin Sinclair". Ask before mass-renaming.
   Every horse also has a unique poker alias already (`profiles.alias` -
   TheViking, Big Blind, SDLegend) if he changes his mind.
3. **123 horse usernames still contain SPACES** (e.g. `isolde beauchamp`).
   Not fixed - only the copy-suffixed ones were. Check whether usernames are
   player-visible (profile URLs) before deciding.
4. **The "big black labels" on videos.** Dan called them trash. **They are
   NOT ours** - 1,251 of 1,373 recent reel thumbnails are `i.ytimg.com`, the
   creator's own YouTube artwork ("$2,478,000 POKER HAND!"). Nothing in our
   code draws them. If he wants them gone the fix is to extract a clean frame
   from the video instead of using the channel thumbnail. **He has not been
   given that option yet - offer it.**

### MEDIUM
5. **59 hidden posts.** Set `is_deleted = true` on 2026-09-06, reversible.
   Decide: leave hidden, or hard-delete once the new voice ships.
6. **`grounded_session` mode** is disabled with `grounded_hand` and has no
   rewritten voice at all. `HandVoice.ts` covers hands only.
7. **Twitch clips: blocked on a credential.** Needs `TWITCH_CLIENT_ID` /
   `TWITCH_CLIENT_SECRET`. Neither exists in this estate. Creating an app is
   Dan's action, not an agent's. Code is not written.
8. **Reddit r/poker: DECLINED, do not build.** `reddit.com/robots.txt` is
   `User-agent: * / Disallow: /` and their Public Content Policy restricts
   automated use. The `.rss` feed answers 200, so it is buildable - it should
   not be. If a future agent "fixes" this by building it, that is a mistake.
9. **Registry is ~91 channels, not the contract's 200.** Two batches of
   hand-written candidates resolved at 67% and 28%. Adding more is a row, not
   a deploy. The supply goal is already met.

### LOW / WATCH
10. **Zero tournament wins.** 0 first places across 123,237 finishes in seven
    days. Unrelated to content, still unexplained, flagged twice.
11. **Dan's Mac disk was 100% full** (130MB free of 926GB). ~11GB of
    regenerable caches cleared. Chrome 2.6GB, playwright-mcp 1.4GB, Codex
    1.7GB remain in `~/Library/Caches`.
12. **1,601 native reels + 684 youtube reels `media_status='failed'`.** Older
    than the 144 that were fixed. Not investigated.

---

## 4. HOW THIS ESTATE WORKS (do not learn these the hard way)

- **You are on Dan's Mac.** Use `mcp__counselors__host_terminal` for
  everything. `node` is NOT on the default PATH:
  `export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"`
- **`gh` is not installed.** Use `curl` + `GITHUB_TOKEN` from
  `~/Documents/club-arena/.env`.
- **The host_terminal tool kills the process group on timeout.** Long jobs
  (pushes ~3 min, scrapers ~60s) must be detached with a double-fork:
  ```python
  python3 -c "
  import os,subprocess
  if os.fork()==0:
      os.setsid(); subprocess.call(['/bin/bash','/tmp/job.sh'],stdin=subprocess.DEVNULL); os._exit(0)"
  ```
  `nohup ... &` alone is NOT enough. macOS has no `setsid` binary.
- **macOS `sed` has no `\?` or `\|`.** Use python for edits.
- **NEVER paste a whole file over another tree.** Doing so silently reverted
  46 lines and would have unregistered `/api/cron/horse-posts` - the entire
  Phase 1 delivery. Build Safety Gate CHECK 8 caught it. Anchor on the text
  you mean to change and `diff` against `origin/main` before committing.
- **Merged is not landed (CLAUDE.md 10.82).** Autopilot squash-merges in
  under two minutes. A follow-up commit needs a NEW BRANCH off current `main`.
  Verify FILES with `git cat-file -e origin/main:<path>`, never the tick.
- **Probe money/DDL in ONE self-aborting `DO` block** (CLAUDE.md 11.5). A
  transaction does not span two Supabase MCP calls. An ERROR is the success
  case.
- **Worktrees**: workers at
  `~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet`, World Hub at
  `~/Documents/.agent-trees/wh-fleet-phase1`. Both clean at handoff.

### Instruments that lie - all three cost real time this session
- **YouTube throttles** with a ~755-byte page at **HTTP 200**. Every live
  channel then reads as dead. `resolveChannelId` reports `throttled`
  separately; six "failures" retire a channel, so this matters.
- **GitHub API rate limit** returns `None` for everything. Looks like a
  missing workflow. Check `/rate_limit`.
- **A shell regex probe is weaker than the real resolver.** 27 of 30 handles
  "did not exist"; with the actual code, 12 of 18 resolved. Test with the
  code that will do the work.

---

## 5. THE PROGRAMME

`~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet/docs/FLEET-CONTENT-PROGRAMME.md`
is the plan; phases 1-4 are marked SHIPPED with their live numbers. Every
phase has a changelog in `docs/changelog/`. **Read
`2026-09-06-a-new-way-to-post-needs-approval.md` first** - it is the one that
explains why the gate exists.

**Phase 5 is media supply, poker.** Do not start it until section 1a is closed.

### The lesson this phase actually taught
Every Phase 4 defect had one shape: a component built for one kind of input,
quietly wrong when a truer input arrived. The category label used as English.
The title fragment used as a person. A sentence used as a noun. The slots
channel in a poker feed. The throttle read as a graveyard. **Better data does
not make old assumptions safer - it exposes them.**

And the bigger one: a test I write cannot tell me whether the writing is any
good, because I am the one who thought it was good enough to ship. Only a
person reading it can. That is what the approval gate is for.
